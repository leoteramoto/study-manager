import { describe, expect, it } from 'vitest'
import { formatarDecimal } from './formatacao'

describe('formatarDecimal', () => {
  it('usa vírgula e não agrupa milhares', () => {
    expect(formatarDecimal(1.5)).toBe('1,5')
    expect(formatarDecimal(744)).toBe('744')
    expect(formatarDecimal(80.25)).toBe('80,25')
    expect(formatarDecimal(1000)).toBe('1000')
  })
})
