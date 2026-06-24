import { describe, it, expect } from 'vitest'
import { encrypt, decrypt, deriveKey, generateSalt, hashSecret, verifySecret } from './crypto'

describe('crypto', () => {
  it('round-trips data through AES-256-GCM', () => {
    const key = deriveKey('hunter2', generateSalt())
    const data = Buffer.from('sensitive coaching data', 'utf8')
    const blob = encrypt(data, key)
    expect(blob.equals(data)).toBe(false)
    expect(decrypt(blob, key).toString('utf8')).toBe('sensitive coaching data')
  })

  it('fails to decrypt with the wrong key (acts as a password verifier)', () => {
    const blob = encrypt(Buffer.from('secret'), deriveKey('correct', generateSalt()))
    expect(() => decrypt(blob, deriveKey('wrong', generateSalt()))).toThrow()
  })

  it('derives the same key for the same password + salt, different for different salt', () => {
    const salt = generateSalt()
    expect(deriveKey('pw', salt).equals(deriveKey('pw', salt))).toBe(true)
    expect(deriveKey('pw', salt).equals(deriveKey('pw', generateSalt()))).toBe(false)
  })

  it('hashes and verifies short secrets in constant time', () => {
    const stored = hashSecret('RECOV-1234')
    expect(verifySecret('RECOV-1234', stored)).toBe(true)
    expect(verifySecret('nope', stored)).toBe(false)
  })
})
