# Lector — RSVP Speed Reader

A luxury-aesthetic speed reading tool. Upload any PDF and read it word-by-word or in chunks at your chosen pace. Everything stays on your machine.

## Setup

```bash
# 1. Install dependencies
npm install

# 2. Run the dev server
npm run dev

# 3. Open in browser
# http://localhost:3000
```

## Tests

```bash
npm test
```

## Features

- **PDF upload** — drag & drop or click to browse (up to 50MB)
- **RSVP display** — flash words or 2–3 word chunks in sequence
- **Adjustable speed** — 100–1000 WPM via slider
- **Adjustable font size** — 28px to 96px
- **Progress bar** — words read, percentage, time remaining
- **Resume** — automatically saves position per book in localStorage
- **Keyboard controls** — Space to play/pause, ← → to step

## Notes

- PDF parsing runs entirely in the browser using `pdfjs-dist`; no server upload needed
- EPUB parsing uses a Next.js API route (`/api/parse-epub`)
- No data is sent to any external server
- Session (book + position) is stored in browser localStorage

## Deploying to Vercel

Run `vercel` or connect the GitHub repo. PDF parsing runs entirely in the browser — no server config needed. EPUB parsing uses a serverless function and works within Vercel's default limits.
