import { describe, it, expect } from 'vitest'
import { isoToDisplay, displayToIso } from './format'

describe('date display helpers (dd-mm-yyyy)', () => {
  it('converts ISO to dd-mm-yyyy', () => {
    expect(isoToDisplay('2026-06-01')).toBe('01-06-2026')
    expect(isoToDisplay('')).toBe('')
    expect(isoToDisplay('nonsense')).toBe('')
  })

  it('parses dd-mm-yyyy (and dd/mm/yyyy) to ISO', () => {
    expect(displayToIso('01-06-2026')).toBe('2026-06-01')
    expect(displayToIso('1-6-2026')).toBe('2026-06-01')
    expect(displayToIso('01/06/2026')).toBe('2026-06-01')
    expect(displayToIso('2026-06-01')).toBe('') // not day-first
    expect(displayToIso('32-01-2026')).toBe('') // invalid day
    expect(displayToIso('')).toBe('')
  })
})
