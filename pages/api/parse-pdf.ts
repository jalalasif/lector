import type { NextApiRequest, NextApiResponse } from 'next'
import formidable from 'formidable'
import fs from 'fs'
import { cleanExtractedPdfText, countWords } from '@/lib/pdfText'
import { chapterWordIndex } from '@/lib/rsvp'

export const config = {
  api: { bodyParser: false },
}

type ChapterItem = { title: string; wordIndex: number }

type ParseSuccess = {
  text: string
  pages: number
  wordCount: number
  chapters: ChapterItem[]
}

type OutlineNode = {
  title: string
  dest?: string | unknown[] | null
  items?: OutlineNode[]
}

function collectOutlineItems(nodes: OutlineNode[] | null | undefined): { title: string; dest: string | unknown[] | null }[] {
  if (!nodes || !Array.isArray(nodes)) return []
  const result: { title: string; dest: string | unknown[] | null }[] = []
  for (const node of nodes) {
    if (node.title) {
      result.push({ title: node.title, dest: node.dest ?? null })
    }
    if (node.items?.length) {
      result.push(...collectOutlineItems(node.items))
    }
  }
  return result
}

function isRefLike(v: unknown): v is { num: number; gen: number } {
  return (
    v !== null &&
    typeof v === 'object' &&
    'num' in v &&
    'gen' in v &&
    typeof (v as { num: unknown }).num === 'number' &&
    typeof (v as { gen: unknown }).gen === 'number'
  )
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const form = formidable({ maxFileSize: 50 * 1024 * 1024 })

  let tempPath: string | undefined
  try {
    const [, files] = await form.parse(req)
    const fileField = files.pdf
    const first = Array.isArray(fileField) ? fileField[0] : fileField

    if (!first?.filepath) {
      return res.status(400).json({ error: 'No PDF file provided' })
    }

    tempPath = first.filepath
    const buffer = fs.readFileSync(tempPath)
    const uint8 = new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength)

    const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs')
    const loadingTask = pdfjsLib.getDocument({ data: uint8 })
    const doc = await loadingTask.promise
    const numPages = doc.numPages

    const pageTexts: string[] = []
    const pageWordCounts: number[] = []

    for (let i = 1; i <= numPages; i++) {
      const page = await doc.getPage(i)
      const content = await page.getTextContent()
      const pageText = content.items
        .map((item: { str?: string }) => (item as { str?: string }).str ?? '')
        .join(' ')
      pageTexts.push(pageText)
      pageWordCounts.push(countWords(pageText))
    }

    const fullText = pageTexts.join('\n\n')
    const cleaned = cleanExtractedPdfText(fullText)
    const wordCount = countWords(cleaned)

    let chapters: ChapterItem[] = []
    const rawOutline = await doc.getOutline()
    const items = collectOutlineItems(rawOutline as OutlineNode[] | null)
    if (items.length > 0) {
      for (const item of items) {
        let pageIndex = 0
        try {
          if (Array.isArray(item.dest) && item.dest.length > 0) {
            const ref = item.dest[0]
            if (isRefLike(ref)) {
              pageIndex = await doc.getPageIndex(ref)
            }
          } else if (typeof item.dest === 'string') {
            const destArray = await doc.getDestination(item.dest)
            if (destArray && Array.isArray(destArray) && destArray.length > 0 && isRefLike(destArray[0])) {
              pageIndex = await doc.getPageIndex(destArray[0])
            }
          }
        } catch {
          pageIndex = 0
        }
        const wordIndex = chapterWordIndex(pageIndex, pageWordCounts)
        chapters.push({ title: item.title, wordIndex })
      }
    }

    const body: ParseSuccess = {
      text: cleaned,
      pages: numPages,
      wordCount,
      chapters,
    }
    return res.status(200).json(body)
  } catch (e) {
    console.error(e)
    if (!res.headersSent) {
      return res.status(500).json({ error: 'Failed to parse PDF' })
    }
    return
  } finally {
    if (tempPath) {
      try {
        fs.unlinkSync(tempPath)
      } catch {
        /* ignore */
      }
    }
  }
}
