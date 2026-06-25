import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, existsSync, readFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

let userData: string
let installDir: string
let home: string

vi.mock('electron', () => ({
  app: {
    isPackaged: true,
    getAppPath: () => process.cwd(),
    getPath: (name: string) => {
      if (name === 'userData') return userData
      if (name === 'exe') return join(installDir, 'Chisel Coaching.exe')
      if (name === 'home') return home
      return process.cwd()
    }
  }
}))

import { resolveDataDir, migrateLegacyData } from './paths'

beforeEach(() => {
  delete process.env.CHISEL_DATA_DIR
  userData = mkdtempSync(join(tmpdir(), 'cc-ud-'))
  installDir = mkdtempSync(join(tmpdir(), 'cc-inst-'))
  home = mkdtempSync(join(tmpdir(), 'cc-home-'))
})

afterEach(() => {
  for (const d of [userData, installDir, home]) rmSync(d, { recursive: true, force: true })
})

describe('data directory (packaged)', () => {
  it('lives under userData, not the install dir', () => {
    expect(resolveDataDir()).toBe(join(userData, 'data'))
  })

  it('migrates data from the old install-dir location', () => {
    const legacy = join(installDir, 'data')
    mkdirSync(join(legacy, 'receipts'), { recursive: true })
    writeFileSync(join(legacy, 'keyfile.json'), '{"username":"admin"}')
    writeFileSync(join(legacy, 'chisel.db'), 'encrypted-bytes')

    migrateLegacyData()

    expect(existsSync(join(userData, 'data', 'keyfile.json'))).toBe(true)
    expect(existsSync(join(userData, 'data', 'chisel.db'))).toBe(true)
    expect(existsSync(join(userData, 'data', 'receipts'))).toBe(true)
  })

  it('does not overwrite data that already exists in the new location', () => {
    mkdirSync(join(userData, 'data'), { recursive: true })
    writeFileSync(join(userData, 'data', 'keyfile.json'), '{"username":"current"}')
    const legacy = join(installDir, 'data')
    mkdirSync(legacy, { recursive: true })
    writeFileSync(join(legacy, 'keyfile.json'), '{"username":"stale"}')

    migrateLegacyData()

    expect(readFileSync(join(userData, 'data', 'keyfile.json'), 'utf8')).toContain('current')
  })
})
