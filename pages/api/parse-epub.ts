/**
 * POST /api/parse-epub — server-side EPUB parsing with formidable + epub2.
 * Body: multipart/form-data, field "epub" = single file, max 50MB.
 * Returns: { text, pages, wordCount, chapters }
 */
import type { NextApiRequest, NextApiResponse } from 'next'
import formidable from 'formidable'
import fs from 'fs'
import path from 'path'
import { countWords } from '@/lib/pdfText'

export const config = {
  api: { bodyParser: false },
}

const MAX_FILE_SIZE = 50 * 1024 * 1024 // 50MB
const EPUB_FIELD = 'epub'

function getEpub(): { createAsync: (p: string, img?: string, ch?: string) => Promise<EpubInstance> } {
  // epub2 has no @types; we use require and local EpubInstance
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const m = require('epub2')
  return m.default ?? m.EPub ?? m
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
}

interface EpubInstance {
  flow: { id: string; href?: string }[]
  toc: { title?: string; href?: string }[]
  getChapter(chapterId: string, callback: (err: Error | null, text?: string) => void): void
}

function getChapterAsync(epub: EpubInstance, chapterId: string): Promise<string> {
  return new Promise((resolve, reject) => {
    epub.getChapter(chapterId, (err, text) => {
      if (err) return reject(err)
      resolve(text ?? '')
    })
  })
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  const form = formidable({
    maxFileSize: MAX_FILE_SIZE,
    maxFiles: 1,
  })

  let tempFilePath: string | null = null

  try {
    const [fields, files] = await form.parse(req)
    const epubFile = Array.isArray(files[EPUB_FIELD]) ? (files[EPUB_FIELD] as formidable.File[])[0] : (files[EPUB_FIELD] as formidable.File | undefined)
    if (!epubFile?.filepath) {
      res.status(400).json({ error: 'No EPUB file in field "epub"' })
      return
    }
    tempFilePath = epubFile.filepath

    const EPub = getEpub()
    const epub = await EPub.createAsync(tempFilePath)

    const flow = epub.flow ?? []
    const spineTexts: string[] = []
    const spineWordCounts: number[] = []

    for (let i = 0; i < flow.length; i++) {
      const chapter = flow[i]
      const raw = await getChapterAsync(epub, chapter.id)
      const plain = stripHtml(raw)
      spineTexts.push(plain)
      spineWordCounts.push(countWords(plain))
    }

    const text = spineTexts.join('\n')
    const wordCount = countWords(text)
    const pages = flow.length

    // Map TOC href to spine index (flow index). Build href → index from flow if we have href/path.
    const hrefToIndex = new Map<string, number>()
    flow.forEach((ch, idx) => {
      const href = (ch as { href?: string }).href ?? ch.id
      const base = href.split('#')[0].replace(/^\//, '')
      if (base) hrefToIndex.set(base, idx)
      const basename = path.basename(base)
      if (basename) hrefToIndex.set(basename, idx)
      hrefToIndex.set(ch.id, idx)
    })

    const toc = epub.toc ?? []
    const chapters: { title: string; wordIndex: number }[] = []
    for (const entry of toc) {
      const title = entry.title?.trim()
      if (!title) continue
      const href = String(entry.href ?? '')
      const baseHref = href.split('#')[0].replace(/^\//, '')
      const spineIdx =
        hrefToIndex.get(baseHref) ??
        hrefToIndex.get(path.basename(baseHref)) ??
        0
      let wordIndex = 0
      for (let j = 0; j < spineIdx && j < spineWordCounts.length; j++) {
        wordIndex += spineWordCounts[j]
      }
      chapters.push({ title, wordIndex })
    }

    res.status(200).json({ text, pages, wordCount, chapters })
  } catch (err) {
    console.error('parse-epub error:', err)
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to parse EPUB' })
  } finally {
    if (tempFilePath && fs.existsSync(tempFilePath)) {
      try {
        fs.unlinkSync(tempFilePath)
      } catch (_) {}
    }
  }
}
