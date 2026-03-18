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
  it('0 chunks returns 0 (no division by zero)', () => {
    expect(progressPercent(0, 0)).toBe(0)
  })

  it('1 chunk returns 100', () => {
    expect(progressPercent(0, 1)).toBe(100)
  })

  it('midpoint returns ~50', () => {
    expect(progressPercent(2, 5)).toBe(50)
    expect(progressPercent(0, 5)).toBe(0)
    expect(progressPercent(4, 5)).toBe(100)
  })
})

describe('wordsReadEstimate', () => {
  it('index 0 returns 0', () => {
    expect(wordsReadEstimate(0, 10, 100)).toBe(0)
  })

  it('index === totalChunks returns totalWords', () => {
    expect(wordsReadEstimate(10, 10, 100)).toBe(100)
  })

  it('proportional mid-value is correct', () => {
    expect(wordsReadEstimate(5, 10, 100)).toBe(50)
  })

  it('returns 0 for empty', () => {
    expect(wordsReadEstimate(0, 0, 100)).toBe(0)
    expect(wordsReadEstimate(0, 5, 0)).toBe(0)
  })
})

describe('minutesRemaining', () => {
  it('wpm of 0 does not throw (guard with Math.max(1, wpm))', () => {
    expect(minutesRemaining(0, 60, 1, 0)).toBe(60)
  })

  it('correct value for known inputs', () => {
    expect(minutesRemaining(0, 600, 1, 300)).toBe(2) // 600 words / 300 wpm
    expect(minutesRemaining(400, 600, 1, 300)).toBe(1) // 200 words left
    expect(minutesRemaining(0, 100, 3, 100)).toBe(3) // 300 words / 100 wpm
  })

  it('returns 0 when index === totalChunks', () => {
    expect(minutesRemaining(600, 600, 1, 300)).toBe(0)
    expect(minutesRemaining(599, 600, 1, 300)).toBe(0)
  })
})

describe('chapterWordIndex', () => {
  it('pageNumber 0 always returns 0', () => {
    expect(chapterWordIndex(0, [10, 20, 30])).toBe(0)
  })

  it('middle page returns correct cumulative sum', () => {
    expect(chapterWordIndex(1, [10, 20, 30])).toBe(10)
    expect(chapterWordIndex(2, [10, 20, 30])).toBe(30)
  })

  it('pageNumber equal to array length returns total word count', () => {
    expect(chapterWordIndex(3, [10, 20, 30])).toBe(60)
  })

  it('empty array returns 0 without throwing', () => {
    expect(chapterWordIndex(0, [])).toBe(0)
    expect(chapterWordIndex(5, [])).toBe(0)
  })
})
