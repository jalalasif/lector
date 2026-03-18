/**
 * Normalizes raw text from pdf-parse for display and counting.
 */
export function cleanExtractedPdfText(raw: string): string {
  return raw
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export function countWords(text: string): number {
  return text.split(/\s+/).filter(Boolean).length
}
