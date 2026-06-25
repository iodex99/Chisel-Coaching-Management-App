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
    expect(displayToIso('30-02-2026')).toBe('') // Feb 30 is not a real date
    expect(displayToIso('31-04-2026')).toBe('') // April has 30 days
    expect(displayToIso('29-02-2024')).toBe('2024-02-29') // valid leap day
    expect(displayToIso('')).toBe('')
  })
})
