import { describe, it, expect } from 'vitest'
import { cleanExtractedPdfText, countWords } from './pdfText'

describe('cleanExtractedPdfText', () => {
  it('collapses 3+ newlines to \\n\\n', () => {
    expect(cleanExtractedPdfText('a\n\n\n\nb')).toBe('a\n\nb')
    expect(cleanExtractedPdfText('a\r\n\r\n\r\n\r\nb')).toBe('a\n\nb')
  })

  it('normalises \\r\\n to \\n', () => {
    expect(cleanExtractedPdfText('a\r\nb')).toBe('a\nb')
    expect(cleanExtractedPdfText('line1\r\nline2')).toBe('line1\nline2')
  })

  it('trims leading and trailing whitespace', () => {
    expect(cleanExtractedPdfText('  x  ')).toBe('x')
    expect(cleanExtractedPdfText('  hello  \n')).toBe('hello')
    expect(cleanExtractedPdfText('\t\n  text  \n\t')).toBe('text')
  })

  it('returns empty string unchanged', () => {
    expect(cleanExtractedPdfText('')).toBe('')
  })
})

describe('countWords', () => {
  it('empty string returns 0', () => {
    expect(countWords('')).toBe(0)
  })

  it('single word returns 1', () => {
    expect(countWords('hello')).toBe(1)
    expect(countWords('  word  ')).toBe(1)
  })

  it('multiple spaces between words count correctly', () => {
    expect(countWords('one    two   three')).toBe(3)
    expect(countWords('  spaced  out  ')).toBe(2)
  })

  it('newlines between words count correctly', () => {
    expect(countWords('one\ntwo\nthree')).toBe(3)
    expect(countWords('a\n\nb')).toBe(2)
  })
})
