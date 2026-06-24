import { app } from 'electron'
import { join } from 'path'
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs'
import { randomBytes, createHmac } from 'crypto'

interface DeviceIdentity {
  deviceId: string
  /** base64-encoded per-machine secret. */
  deviceSecret: string
}

/**
 * The device identity lives in the OS user-data folder (Windows AppData), which
 * is per-machine and OUTSIDE the portable `data/` folder. This is what makes a
 * "trusted device" bound to the machine rather than to the copyable database.
 */
function deviceFilePath(): string {
  return join(app.getPath('userData'), 'device.json')
}

export function getDeviceIdentity(): DeviceIdentity {
  const file = deviceFilePath()
  if (existsSync(file)) {
    try {
      const parsed = JSON.parse(readFileSync(file, 'utf8')) as Partial<DeviceIdentity>
      if (parsed.deviceId && parsed.deviceSecret) return parsed as DeviceIdentity
    } catch {
      /* fall through and regenerate */
    }
  }
  const identity: DeviceIdentity = {
    deviceId: randomBytes(16).toString('hex'),
    deviceSecret: randomBytes(32).toString('base64')
  }
  mkdirSync(app.getPath('userData'), { recursive: true })
  writeFileSync(file, JSON.stringify(identity), 'utf8')
  return identity
}

/** HMAC binding a device id to the per-machine secret. */
export function computeDeviceHmac(deviceId: string, deviceSecret: string): string {
  return createHmac('sha256', Buffer.from(deviceSecret, 'base64')).update(deviceId).digest('base64')
}
