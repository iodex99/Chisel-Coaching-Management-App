import {
  randomBytes,
  scryptSync,
  createCipheriv,
  createDecipheriv,
  timingSafeEqual
} from 'crypto'

export interface KdfParams {
  N: number
  r: number
  p: number
  keylen: number
}

/** scrypt cost parameters for the master key. N=32768 ≈ ~100ms derivation. */
export const DEFAULT_KDF: KdfParams = { N: 32768, r: 8, p: 1, keylen: 32 }

/** scrypt cost parameters for short secrets (recovery codes). */
const SECRET_KDF: KdfParams = { N: 16384, r: 8, p: 1, keylen: 32 }

// Headroom so scrypt does not hit the default 32 MB maxmem ceiling.
const SCRYPT_MAXMEM = 256 * 1024 * 1024

const IV_LEN = 12
const TAG_LEN = 16

export function generateSalt(bytes = 16): Buffer {
  return randomBytes(bytes)
}

/** Derive the AES-256 key from the master password. */
export function deriveKey(password: string, salt: Buffer, params: KdfParams = DEFAULT_KDF): Buffer {
  return scryptSync(password.normalize('NFKC'), salt, params.keylen, {
    N: params.N,
    r: params.r,
    p: params.p,
    maxmem: SCRYPT_MAXMEM
  })
}

/**
 * Encrypt with AES-256-GCM. Output layout: [iv(12)][authTag(16)][ciphertext].
 * The GCM auth tag doubles as the password verifier: decryption fails if the
 * key (i.e. the password) is wrong or the file was tampered with.
 */
export function encrypt(plaintext: Buffer, key: Buffer): Buffer {
  const iv = randomBytes(IV_LEN)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const enc = Buffer.concat([cipher.update(plaintext), cipher.final()])
  const tag = cipher.getAuthTag()
  return Buffer.concat([iv, tag, enc])
}

/** Decrypt an [iv][tag][ciphertext] blob. Throws on wrong key or tampering. */
export function decrypt(blob: Buffer, key: Buffer): Buffer {
  const iv = blob.subarray(0, IV_LEN)
  const tag = blob.subarray(IV_LEN, IV_LEN + TAG_LEN)
  const data = blob.subarray(IV_LEN + TAG_LEN)
  const decipher = createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(data), decipher.final()])
}

/** Hash a short secret (e.g. a recovery code) as `salt:hash`, both base64. */
export function hashSecret(secret: string, salt: Buffer = randomBytes(16)): string {
  const h = scryptSync(secret.normalize('NFKC'), salt, SECRET_KDF.keylen, {
    N: SECRET_KDF.N,
    r: SECRET_KDF.r,
    p: SECRET_KDF.p,
    maxmem: SCRYPT_MAXMEM
  })
  return `${salt.toString('base64')}:${h.toString('base64')}`
}

/** Constant-time verification of a secret against a stored `salt:hash`. */
export function verifySecret(secret: string, stored: string): boolean {
  const [saltB64, hashB64] = stored.split(':')
  if (!saltB64 || !hashB64) return false
  const salt = Buffer.from(saltB64, 'base64')
  const expected = Buffer.from(hashB64, 'base64')
  const actual = scryptSync(secret.normalize('NFKC'), salt, expected.length, {
    N: SECRET_KDF.N,
    r: SECRET_KDF.r,
    p: SECRET_KDF.p,
    maxmem: SCRYPT_MAXMEM
  })
  return expected.length === actual.length && timingSafeEqual(expected, actual)
}
