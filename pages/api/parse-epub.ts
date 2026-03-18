import type { NextApiRequest, NextApiResponse } from 'next'
import formidable from 'formidable'
import fs from 'fs'
import { countWords } from '@/lib/pdfText'

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

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const form = formidable({ maxFileSize: 50 * 1024 * 1024 })

  let tempPath: string | undefined
  try {
    const [, files] = await form.parse(req)
    const fileField = files.epub
    const first = Array.isArray(fileField) ? fileField[0] : fileField

    if (!first?.filepath) {
      return res.status(400).json({ error: 'No EPUB file provided' })
    }

    tempPath = first.filepath

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { EPub } = require('epub2') as { EPub: { createAsync: (path: string) => Promise<unknown> } }
    const epub = await EPub.createAsync(tempPath) as {
      flow: Array<{ id: string; href?: string }>
      toc: Array<{ title?: string; href?: string }>
      getChapter: (id: string, cb: (err: unknown, text: string) => void) => void
    }

    const spineWordCounts: number[] = []
    const spineTexts: string[] = []

    for (const spineItem of epub.flow) {
      try {
        const raw: string = await new Promise((resolve, reject) => {
          epub.getChapter(spineItem.id, (err, text) => {
            if (err) reject(err)
            else resolve(text ?? '')
          })
        })
        const plain = stripHtml(raw)
        spineTexts.push(plain)
        spineWordCounts.push(countWords(plain))
      } catch {
        spineTexts.push('')
        spineWordCounts.push(0)
      }
    }

    const fullText = spineTexts.join('\n\n')
    const wordCount = countWords(fullText)
    const pages = epub.flow.length

    const hrefToIdx = new Map<string, number>()
    epub.flow.forEach((item, i) => {
      const href = String(item.href ?? '')
      if (href) {
        hrefToIdx.set(href, i)
        const filename = href.split('/').pop() ?? ''
        if (filename) hrefToIdx.set(filename, i)
      }
    })

    const chapters: ChapterItem[] = []
    for (const tocEntry of epub.toc) {
      if (!tocEntry.title) continue
      const href = String(tocEntry.href ?? '')
      const baseHref = href.split('#')[0]
      const spineIdx =
        hrefToIdx.get(baseHref) ??
        hrefToIdx.get(baseHref.split('/').pop() ?? '') ??
        0

      let wordIndex = 0
      for (let j = 0; j < spineIdx; j++) {
        wordIndex += spineWordCounts[j]
      }

      chapters.push({ title: tocEntry.title, wordIndex })
    }

    const body: ParseSuccess = { text: fullText, pages, wordCount, chapters }
    return res.status(200).json(body)
  } catch (e) {
    console.error(e)
    if (!res.headersSent) {
      return res.status(500).json({ error: 'Failed to parse EPUB' })
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
