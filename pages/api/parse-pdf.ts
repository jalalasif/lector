import type { NextApiRequest, NextApiResponse } from 'next'
import formidable from 'formidable'
import fs from 'fs'
import { cleanExtractedPdfText, countWords } from '@/lib/pdfText'

export const config = {
  api: { bodyParser: false },
}

type ParseSuccess = {
  text: string
  pages: number
  wordCount: number
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
    // Dynamic require keeps pdf-parse out of the client bundle / avoids test file side effects at import
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pdfParse = require('pdf-parse') as (buf: Buffer) => Promise<{ text: string; numpages: number }>
    const data = await pdfParse(buffer)

    const cleaned = cleanExtractedPdfText(data.text)
    const body: ParseSuccess = {
      text: cleaned,
      pages: data.numpages,
      wordCount: countWords(cleaned),
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
