/**
 * Pure helpers for RSVP tokenization and chunking (used by UI and tests).
 */
export function tokenize(text: string): string[] {
  return text.split(/\s+/).filter(Boolean)
}

export function buildChunks(words: string[], size: number): string[] {
  if (size < 1) return words
  if (size === 1) return words
  const chunks: string[] = []
  for (let i = 0; i < words.length; i += size) {
    chunks.push(words.slice(i, i + size).join(' '))
  }
  return chunks
}

/** Progress 0–100; single-chunk content is treated as 100% (no division by zero). */
export function progressPercent(index: number, totalChunks: number): number {
  if (totalChunks <= 0) return 0
  if (totalChunks === 1) return 100
  return (index / (totalChunks - 1)) * 100
}

export function wordsReadEstimate(
  index: number,
  totalChunks: number,
  totalWords: number
): number {
  if (totalChunks <= 0 || totalWords <= 0) return 0
  return Math.round((index / totalChunks) * totalWords)
}

export function minutesRemaining(
  index: number,
  totalChunks: number,
  chunkSize: number,
  wpm: number
): number {
  const w = Math.max(1, wpm)
  const remainingChunks = Math.max(0, totalChunks - index)
  const wordsLeft = remainingChunks * Math.max(1, chunkSize)
  return Math.round(wordsLeft / w)
}

/**
 * Returns the word index of the first word on the given page (0-based).
 * Sums word counts for all pages before pageNumber. Used to map outline
 * destination pages to positions in the flat token array.
 */
export function chapterWordIndex(pageNumber: number, pageWordCounts: number[]): number {
  if (!pageWordCounts.length || pageNumber <= 0) return 0
  let sum = 0
  for (let i = 0; i < pageNumber && i < pageWordCounts.length; i++) {
    sum += pageWordCounts[i]
  }
  return sum
}
