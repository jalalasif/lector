import { describe, it, expect } from 'vitest'
import { cleanExtractedPdfText, countWords } from './pdfText'

describe('cleanExtractedPdfText', () => {
  it('normalizes newlines and collapses excessive blank lines', () => {
    expect(cleanExtractedPdfText('a\r\n\r\n\r\nb')).toBe('a\n\nb')
    expect(cleanExtractedPdfText('  hello  \n')).toBe('hello')
  })

  it('trims edges', () => {
    expect(cleanExtractedPdfText('  x  ')).toBe('x')
  })
})

describe('countWords', () => {
  it('matches token counting used by the reader', () => {
    expect(countWords('one two three')).toBe(3)
    expect(countWords('')).toBe(0)
    expect(countWords('  spaced  out  ')).toBe(2)
  })
})
