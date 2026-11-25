import { describe, it, expect, beforeAll } from 'vitest'

let errMessage: (e: unknown) => string

beforeAll(async () => {
  // api.ts reads the preload bridge at import time.
  ;(globalThis as unknown as { window: unknown }).window = { api: {} }
  errMessage = (await import('./api')).errMessage
})

describe('errMessage', () => {
  it('strips Electron’s IPC wrapper from main-process errors', () => {
    expect(errMessage(new Error("Error invoking remote method 'auth:login': Error: Invalid authentication code"))).toBe(
      'Invalid authentication code'
    )
    expect(errMessage(new Error("Error invoking remote method 'students:create': TypeError: x is undefined"))).toBe(
      'x is undefined'
    )
  })

  it('keeps plain messages and colons inside the message', () => {
    expect(errMessage(new Error('Too many failed attempts. Try again in 30s.'))).toBe('Too many failed attempts. Try again in 30s.')
    expect(errMessage(new Error('Error: Receipt: CHISEL/2026-27/0001 exists'))).toBe('Receipt: CHISEL/2026-27/0001 exists')
    expect(errMessage('plain string')).toBe('plain string')
  })

  it('falls back for empty or unknown values', () => {
    expect(errMessage(undefined)).toBe('Something went wrong')
    expect(errMessage(new Error(''))).toBe('Something went wrong')
    expect(errMessage({})).toBe('Something went wrong')
  })
})
