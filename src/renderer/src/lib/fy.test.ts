import { describe, it, expect } from 'vitest'
import { currentFy, fyOptions } from './fy'

describe('financial-year options', () => {
  it('are canonical YYYY-YY, include the current FY, and are ordered newest-first', () => {
    const opts = fyOptions()
    expect(opts.every((o) => /^\d{4}-\d{2}$/.test(o))).toBe(true) // no ambiguous "26-27"
    expect(opts).toContain(currentFy())
    expect(new Set(opts).size).toBe(opts.length) // no duplicates
    expect(opts.length).toBeGreaterThanOrEqual(14) // a wide range (past + future)
    expect(Number(opts[0].slice(0, 4))).toBeGreaterThan(Number(opts[opts.length - 1].slice(0, 4)))
    expect(Number(opts[0].slice(0, 4))).toBeGreaterThanOrEqual(2050) // extends up to FY 2050-51
    expect(opts).toContain('2050-51')
  })

  it('current FY matches the YYYY-YY shape', () => {
    expect(currentFy()).toMatch(/^\d{4}-\d{2}$/)
  })
})
