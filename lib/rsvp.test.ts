import { describe, it, expect } from 'vitest'
import {
  tokenize,
  buildChunks,
  progressPercent,
  wordsReadEstimate,
  minutesRemaining,
  chapterWordIndex,
} from './rsvp'

describe('tokenize', () => {
  it('splits on whitespace and drops empties', () => {
    expect(tokenize('hello   world')).toEqual(['hello', 'world'])
    expect(tokenize('  a\nb\tc  ')).toEqual(['a', 'b', 'c'])
  })

  it('returns empty for blank', () => {
    expect(tokenize('')).toEqual([])
    expect(tokenize('   \n')).toEqual([])
  })
})

describe('buildChunks', () => {
  it('returns words as-is for size 1', () => {
    const w = ['a', 'b', 'c']
    expect(buildChunks(w, 1)).toEqual(w)
  })

  it('groups by size 2 and 3', () => {
    expect(buildChunks(['a', 'b', 'c', 'd'], 2)).toEqual(['a b', 'c d'])
    expect(buildChunks(['a', 'b', 'c'], 2)).toEqual(['a b', 'c'])
    expect(buildChunks(['a', 'b', 'c', 'd', 'e'], 3)).toEqual(['a b c', 'd e'])
  })

  it('treats invalid size as word list passthrough', () => {
    expect(buildChunks(['x', 'y'], 0)).toEqual(['x', 'y'])
  })
})

describe('progressPercent', () => {
  it('avoids division by zero for single chunk', () => {
    expect(progressPercent(0, 1)).toBe(100)
  })

  it('interpolates across multiple chunks', () => {
    expect(progressPercent(0, 5)).toBe(0)
    expect(progressPercent(4, 5)).toBe(100)
    expect(progressPercent(2, 5)).toBe(50)
  })

  it('handles empty', () => {
    expect(progressPercent(0, 0)).toBe(0)
  })
})

describe('wordsReadEstimate', () => {
  it('scales index to total words', () => {
    expect(wordsReadEstimate(0, 10, 100)).toBe(0)
    expect(wordsReadEstimate(5, 10, 100)).toBe(50)
    expect(wordsReadEstimate(10, 10, 100)).toBe(100)
  })

  it('returns 0 for empty', () => {
    expect(wordsReadEstimate(0, 0, 100)).toBe(0)
    expect(wordsReadEstimate(0, 5, 0)).toBe(0)
  })
})

describe('minutesRemaining', () => {
  it('estimates minutes as (chunks left × chunkSize) / wpm', () => {
    expect(minutesRemaining(0, 600, 1, 300)).toBe(2) // 600 words / 300 wpm
    expect(minutesRemaining(400, 600, 1, 300)).toBe(1) // 200 words left
    expect(minutesRemaining(599, 600, 1, 300)).toBe(0)
  })

  it('uses chunk size in word estimate', () => {
    expect(minutesRemaining(0, 100, 3, 100)).toBe(3) // 300 words / 100 wpm
  })

  it('guards wpm at 1', () => {
    expect(minutesRemaining(0, 60, 1, 0)).toBe(60)
  })
})

describe('chapterWordIndex', () => {
  it('returns 0 for first page (pageNumber 0)', () => {
    expect(chapterWordIndex(0, [10, 20, 30])).toBe(0)
  })

  it('returns correct index for middle page', () => {
    // page 0: 0, page 1: 10, page 2: 30
    expect(chapterWordIndex(1, [10, 20, 30])).toBe(10)
    expect(chapterWordIndex(2, [10, 20, 30])).toBe(30)
  })

  it('returns correct index for last page', () => {
    expect(chapterWordIndex(3, [10, 20, 30])).toBe(60)
  })

  it('returns 0 for empty pageWordCounts array', () => {
    expect(chapterWordIndex(0, [])).toBe(0)
    expect(chapterWordIndex(5, [])).toBe(0)
  })
})
