import { useState, useEffect, useRef, useCallback } from 'react'
import Head from 'next/head'
import {
  tokenize,
  buildChunks,
  progressPercent,
  wordsReadEstimate,
  minutesRemaining,
} from '@/lib/rsvp'
import { sounds } from '@/lib/sounds'

// ─── Types ────────────────────────────────────────────────────────────────────
interface ChapterItem {
  title: string
  wordIndex: number
}

interface ReaderState {
  text: string
  fileName: string
  wordCount: number
  pages: number
  chapters: ChapterItem[]
}

interface Prefs {
  wpm: number
  chunkSize: number // 1 = single word, 2 or 3 = chunks
  fontSize: number
}

const STORAGE_KEY = 'rsvp_session'
const PREFS_KEY = 'rsvp_prefs'

const DEFAULT_PREFS: Prefs = { wpm: 300, chunkSize: 1, fontSize: 52 }

// ─── Component ────────────────────────────────────────────────────────────────
export default function Home() {
  const [reader, setReader] = useState<ReaderState | null>(null)
  const [prefs, setPrefs] = useState<Prefs>(DEFAULT_PREFS)
  const [chunks, setChunks] = useState<string[]>([])
  const [index, setIndex] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showSettings, setShowSettings] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [theme, setTheme] = useState<'dark' | 'light'>('dark')

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // ── Mount & hydrate from localStorage
  useEffect(() => {
    setMounted(true)
    try {
      const savedTheme = localStorage.getItem('rsvp_theme')
      if (savedTheme === 'light' || savedTheme === 'dark') setTheme(savedTheme)

      const savedPrefs = localStorage.getItem(PREFS_KEY)
      if (savedPrefs) setPrefs(JSON.parse(savedPrefs))

      const savedSession = localStorage.getItem(STORAGE_KEY)
      if (savedSession) {
        const { readerState, savedIndex } = JSON.parse(savedSession)
        if (readerState && !Array.isArray(readerState.chapters)) {
          readerState.chapters = []
        }
        setReader(readerState)
        setIndex(savedIndex ?? 0)
      }
    } catch (_) {}
  }, [])

  // ── Apply theme to document and persist
  useEffect(() => {
    if (!mounted) return
    localStorage.setItem('rsvp_theme', theme)
    if (theme === 'light') {
      document.documentElement.dataset.theme = 'light'
    } else {
      delete document.documentElement.dataset.theme
    }
  }, [theme, mounted])

  // ── Rebuild chunks when text or chunkSize changes
  useEffect(() => {
    if (!reader) return
    const words = tokenize(reader.text)
    const newChunks = buildChunks(words, prefs.chunkSize)
    setChunks(newChunks)
    // Rescale index proportionally when chunk size changes
    setIndex(prev => {
      const ratio = prev / Math.max(1, chunks.length)
      return Math.min(Math.floor(ratio * newChunks.length), newChunks.length - 1)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reader, prefs.chunkSize])

  // ── Save prefs
  useEffect(() => {
    if (!mounted) return
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs))
  }, [prefs, mounted])

  // ── Save session (debounced via index change)
  useEffect(() => {
    if (!mounted || !reader) return
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ readerState: reader, savedIndex: index }))
  }, [index, reader, mounted])

  // ── Playback interval
  useEffect(() => {
    if (playing) {
      const ms = Math.round(60000 / prefs.wpm) * prefs.chunkSize
      intervalRef.current = setInterval(() => {
        setIndex(prev => {
          if (prev >= chunks.length - 1) {
            sounds.pause()
            setPlaying(false)
            return prev
          }
          return prev + 1
        })
      }, ms)
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [playing, prefs.wpm, prefs.chunkSize, chunks.length])

  // ── Upload handler
  const handleFile = useCallback(async (file: File) => {
    const isEpub = file.name.endsWith('.epub')
    const isPdf = file.name.endsWith('.pdf')
    if (!isPdf && !isEpub) {
      setError('Please upload a PDF or EPUB file.')
      return
    }
    setLoading(true)
    setError(null)
    setPlaying(false)

    const formData = new FormData()
    formData.append(isEpub ? 'epub' : 'pdf', file)

    try {
      const endpoint = isEpub ? '/api/parse-epub' : '/api/parse-pdf'
      const res = await fetch(endpoint, { method: 'POST', body: formData })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Parse failed')

      const state: ReaderState = {
        text: data.text,
        fileName: file.name,
        wordCount: data.wordCount,
        pages: data.pages,
        chapters: data.chapters ?? [],
      }
      setReader(state)
      setIndex(0)
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ readerState: state, savedIndex: 0 }))
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to parse PDF')
    } finally {
      setLoading(false)
    }
  }, [])

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }, [handleFile])

  const onFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) handleFile(file)
  }, [handleFile])

  const togglePlay = useCallback(() => {
    setIndex(i => (chunks.length > 0 && i >= chunks.length - 1 ? 0 : i))
    setPlaying(p => {
      if (p) sounds.pause()
      else sounds.play()
      return !p
    })
  }, [chunks.length])

  const reset = () => {
    sounds.toggle()
    setPlaying(false)
    setIndex(0)
  }

  const clearBook = () => {
    setPlaying(false)
    setReader(null)
    setIndex(0)
    setChunks([])
    localStorage.removeItem(STORAGE_KEY)
  }

  const progress = progressPercent(index, chunks.length)
  const currentChunk = chunks[index] ?? ''
  const wordsRead = wordsReadEstimate(index, chunks.length, reader?.wordCount ?? 0)
  const minutesLeft = minutesRemaining(index, chunks.length, prefs.chunkSize, prefs.wpm)

  if (!mounted) return null

  return (
    <>
      <Head>
        <title>Lector — RSVP Speed Reader</title>
        <meta name="description" content="A luxury RSVP speed reading tool" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>

      <div style={styles.root}>
        {/* ── Header */}
        <div className={`focus-blur-transition ${playing ? 'focus-blur' : ''}`}>
          <header style={styles.header}>
          <div style={styles.headerInner}>
            <div style={styles.wordmark}>
              <span style={styles.wordmarkL}>L</span>
              <span style={styles.wordmarkRest}>ector</span>
            </div>
            <div style={styles.headerActions}>
              <button
                style={styles.ghostBtn}
                onClick={() => { sounds.toggle(); setTheme(t => (t === 'dark' ? 'light' : 'dark')) }}
                title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
                aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
              >
                {theme === 'dark' ? (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="5"/>
                    <line x1="12" y1="1" x2="12" y2="3"/>
                    <line x1="12" y1="21" x2="12" y2="23"/>
                    <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/>
                    <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
                    <line x1="1" y1="12" x2="3" y2="12"/>
                    <line x1="21" y1="12" x2="23" y2="12"/>
                    <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/>
                    <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
                  </svg>
                ) : (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
                  </svg>
                )}
              </button>
              {reader && (
                <button style={styles.ghostBtn} onClick={() => { sounds.toggle(); clearBook() }} title="Load a new book">
                  New Book
                </button>
              )}
            </div>
          </div>
          <div style={styles.headerRule} />
        </header>
        </div>

        <main style={styles.main}>
          {/* ── Upload State */}
          {!reader && (
            <div style={styles.uploadSection}>
              <p style={styles.uploadEyebrow}>Begin your session</p>
              <h1 style={styles.uploadHeading}>Upload a PDF</h1>
              <p style={styles.uploadSub}>
                Your book stays on your machine. Nothing is sent to any server except for local parsing.
              </p>

              <div
                style={{ ...styles.dropZone, ...(dragOver ? styles.dropZoneActive : {}) }}
                onDragOver={e => { e.preventDefault(); setDragOver(true) }}
                onDragLeave={() => setDragOver(false)}
                onDrop={onDrop}
                onClick={() => { sounds.toggle(); fileInputRef.current?.click() }}
              >
                {loading ? (
                  <div style={styles.loadingWrap}>
                    <div style={styles.spinner} />
                    <span style={styles.loadingText}>Parsing document…</span>
                  </div>
                ) : (
                  <>
                    <div style={styles.dropIcon}>
                      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                        <polyline points="14 2 14 8 20 8"/>
                        <line x1="12" y1="18" x2="12" y2="12"/>
                        <line x1="9" y1="15" x2="15" y2="15"/>
                      </svg>
                    </div>
                    <p style={styles.dropText}>Drop a PDF or EPUB here</p>
                    <p style={styles.dropSub}>or click to browse</p>
                  </>
                )}
              </div>

              {error && <p style={styles.errorText}>{error}</p>}

              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.epub"
                style={{ display: 'none' }}
                onChange={onFileChange}
              />
            </div>
          )}

          {/* ── Empty PDF (no extractable words) */}
          {reader && chunks.length === 0 && (
            <div style={styles.uploadSection}>
              <p style={styles.uploadHeading}>No text found</p>
              <p style={styles.uploadSub}>
                This PDF has no extractable text (it may be scanned images only). Try another file.
              </p>
              <button type="button" style={styles.ghostBtn} onClick={clearBook}>
                Upload another PDF
              </button>
            </div>
          )}

          {/* ── Reader State */}
          {reader && chunks.length > 0 && (
            <div style={styles.readerSection}>
              {/* Book meta, chapter selector, progress bar */}
              <div className={`focus-blur-transition ${playing ? 'focus-blur' : ''}`}>
              <div style={styles.bookMeta}>
                <span style={styles.bookName}>{reader.fileName.replace('.pdf', '')}</span>
                <span style={styles.bookDivider}>·</span>
                <span style={styles.bookStats}>{reader.pages} pages · {reader.wordCount.toLocaleString()} words</span>
              </div>

              {/* Chapter selector */}
              <div style={styles.chapterWrap}>
                <select
                  style={{
                    ...styles.chapterSelect,
                    ...(reader.chapters.length === 0 ? styles.chapterSelectDisabled : {}),
                  }}
                  value={
                    reader.chapters.length === 0
                      ? ''
                      : (() => {
                          const currentWordIndex = index * prefs.chunkSize
                          let activeIdx = -1
                          for (let i = reader.chapters.length - 1; i >= 0; i--) {
                            if (reader.chapters[i].wordIndex <= currentWordIndex) {
                              activeIdx = i
                              break
                            }
                          }
                          return activeIdx >= 0 ? String(activeIdx) : ''
                        })()
                  }
                  disabled={reader.chapters.length === 0}
                  onChange={e => {
                    if (reader.chapters.length === 0) return
                    const i = Number(e.target.value)
                    if (Number.isNaN(i) || i < 0 || i >= reader.chapters.length) return
                    const ch = reader.chapters[i]
                    setPlaying(false)
                    setIndex(Math.floor(ch.wordIndex / prefs.chunkSize))
                  }}
                  aria-label="Jump to chapter"
                >
                  {reader.chapters.length === 0 ? (
                    <option value="">No chapters found</option>
                  ) : (
                    reader.chapters.map((ch, i) => (
                      <option key={i} value={i}>
                        {ch.title}
                      </option>
                    ))
                  )}
                </select>
              </div>

              {/* Progress bar */}
              <div style={styles.progressWrap}>
                <div style={styles.progressTrack}>
                  <div style={{ ...styles.progressFill, width: `${progress}%` }} />
                </div>
                <div style={styles.progressLabels}>
                  <span style={styles.progressStat}>{wordsRead.toLocaleString()} words read</span>
                  <span style={styles.progressStat}>{progress.toFixed(1)}%</span>
                  <span style={styles.progressStat}>{minutesLeft} min left</span>
                </div>
              </div>
              </div>

              {/* Display window */}
              <div style={styles.displayWindow}>
                <div style={styles.displayOrnamentTop} />

                {/* Focal guide lines */}
                <div style={styles.focalGuide} />

                <div style={styles.wordDisplay}>
                  <span
                    key={index}
                    style={{ ...styles.wordText, fontSize: `${prefs.fontSize}px` }}
                  >
                    {currentChunk}
                  </span>
                </div>

                <div style={styles.displayOrnamentBottom} />
              </div>

              {/* Controls */}
              <div style={styles.controls}>
                {/* Rewind */}
                <button style={styles.controlBtn} onClick={reset} title="Restart">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="1 4 1 10 7 10"/>
                    <path d="M3.51 15a9 9 0 1 0 .49-4.54"/>
                  </svg>
                </button>

                {/* Step back */}
                <button style={styles.controlBtn} onClick={() => { sounds.step(); setPlaying(false); setIndex(i => Math.max(0, i - 1)) }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="15 18 9 12 15 6"/>
                  </svg>
                </button>

                {/* Play/Pause */}
                <button style={styles.playBtn} onClick={togglePlay}>
                  {playing ? (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                      <rect x="6" y="4" width="4" height="16" rx="1"/>
                      <rect x="14" y="4" width="4" height="16" rx="1"/>
                    </svg>
                  ) : (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                      <polygon points="5 3 19 12 5 21 5 3"/>
                    </svg>
                  )}
                </button>

                {/* Step forward */}
                <button style={styles.controlBtn} onClick={() => { sounds.step(); setPlaying(false); setIndex(i => Math.min(chunks.length - 1, i + 1)) }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="9 18 15 12 9 6"/>
                  </svg>
                </button>

                {/* Settings toggle */}
                <button style={styles.controlBtn} onClick={() => { sounds.toggle(); setShowSettings(s => !s) }} title="Settings">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="3"/>
                    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
                  </svg>
                </button>
              </div>

              {/* Settings panel + keyboard hint */}
              <div className={`focus-blur-transition ${playing ? 'focus-blur' : ''}`}>
              {/* Settings Panel */}
              {showSettings && (
                <div style={styles.settingsPanel}>
                  <div style={styles.settingsRule} />

                  {/* WPM */}
                  <div style={styles.settingRow}>
                    <div style={styles.settingLabelGroup}>
                      <span style={styles.settingLabel}>Speed</span>
                      <span style={styles.settingValue}>{prefs.wpm} wpm</span>
                    </div>
                    <input
                      type="range" min={100} max={1000} step={25}
                      value={prefs.wpm}
                      onChange={e => setPrefs(p => ({ ...p, wpm: +e.target.value }))}
                      style={styles.slider}
                    />
                    <div style={styles.sliderLabels}>
                      <span>100</span><span>1000</span>
                    </div>
                  </div>

                  {/* Chunk size */}
                  <div style={styles.settingRow}>
                    <div style={styles.settingLabelGroup}>
                      <span style={styles.settingLabel}>Display mode</span>
                    </div>
                    <div style={styles.chunkBtns}>
                      {[1, 2, 3].map(n => (
                        <button
                          key={n}
                          style={{ ...styles.chunkBtn, ...(prefs.chunkSize === n ? styles.chunkBtnActive : {}) }}
                          onClick={() => { sounds.toggle(); setPrefs(p => ({ ...p, chunkSize: n })) }}
                        >
                          {n === 1 ? 'Single word' : `${n}-word chunks`}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Font size */}
                  <div style={styles.settingRow}>
                    <div style={styles.settingLabelGroup}>
                      <span style={styles.settingLabel}>Font size</span>
                      <span style={styles.settingValue}>{prefs.fontSize}px</span>
                    </div>
                    <input
                      type="range" min={28} max={96} step={2}
                      value={prefs.fontSize}
                      onChange={e => setPrefs(p => ({ ...p, fontSize: +e.target.value }))}
                      style={styles.slider}
                    />
                    <div style={styles.sliderLabels}>
                      <span>Small</span><span>Large</span>
                    </div>
                  </div>

                  <div style={styles.settingsRule} />
                </div>
              )}

              {/* Keyboard hint */}
              <p style={styles.hint}>
                Press <kbd style={styles.kbd}>Space</kbd> to play · <kbd style={styles.kbd}>←</kbd> <kbd style={styles.kbd}>→</kbd> to step
              </p>
              </div>
            </div>
          )}
        </main>

        <div className={`focus-blur-transition ${playing ? 'focus-blur' : ''}`}>
        <footer style={styles.footer}>
          <div style={styles.footerRule} />
          <p style={styles.footerText}>Lector · Reading tool · Everything stays on your machine</p>
        </footer>
        </div>
      </div>

      <KeyboardHandler
        onSpace={togglePlay}
        onLeft={() => { setPlaying(false); setIndex(i => Math.max(0, i - 1)) }}
        onRight={() => { setPlaying(false); setIndex(i => Math.min(Math.max(0, chunks.length - 1), i + 1)) }}
        active={!!reader && chunks.length > 0}
      />

      <style>{`
        @keyframes flash {
          0% { opacity: 0; transform: translateY(6px); }
          15% { opacity: 1; transform: translateY(0); }
          85% { opacity: 1; transform: translateY(0); }
          100% { opacity: 1; transform: translateY(0); }
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        .word-flash {
          animation: flash 0.12s ease-out forwards;
        }
      `}</style>
    </>
  )
}

// ─── Keyboard Handler ─────────────────────────────────────────────────────────
function KeyboardHandler({ onSpace, onLeft, onRight, active }: {
  onSpace: () => void
  onLeft: () => void
  onRight: () => void
  active: boolean
}) {
  useEffect(() => {
    if (!active) return
    const handler = (e: KeyboardEvent) => {
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName)) return
      if (e.code === 'Space') { e.preventDefault(); onSpace() }
      if (e.code === 'ArrowLeft') { e.preventDefault(); onLeft() }
      if (e.code === 'ArrowRight') { e.preventDefault(); onRight() }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onSpace, onLeft, onRight, active])
  return null
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles: Record<string, React.CSSProperties> = {
  root: {
    minHeight: '100vh',
    display: 'flex',
    flexDirection: 'column',
    background: 'var(--bg)',
  },

  // Header
  header: {
    padding: '32px 48px 0',
  },
  headerInner: {
    display: 'flex',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginBottom: '24px',
  },
  wordmark: {
    fontFamily: "'Cormorant Garamond', Georgia, serif",
    fontWeight: 300,
    fontSize: '28px',
    letterSpacing: '0.08em',
    color: 'var(--text)',
  },
  wordmarkL: {
    color: 'var(--gold)',
  },
  wordmarkRest: {},
  headerActions: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  headerRule: {
    height: '1px',
    background: 'linear-gradient(90deg, var(--gold-border) 0%, transparent 100%)',
  },
  ghostBtn: {
    background: 'none',
    border: '1px solid var(--gold-border)',
    color: 'var(--muted)',
    padding: '6px 16px',
    borderRadius: '100px',
    fontSize: '13px',
    fontFamily: "'Cormorant Garamond', Georgia, serif",
    letterSpacing: '0.05em',
    transition: 'all 0.2s ease',
    cursor: 'pointer',
  },

  // Main
  main: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '60px 24px',
  },

  // Upload
  uploadSection: {
    maxWidth: '560px',
    width: '100%',
    textAlign: 'center',
  },
  uploadEyebrow: {
    fontFamily: "'Cormorant Garamond', Georgia, serif",
    fontStyle: 'italic',
    fontWeight: 300,
    fontSize: '15px',
    color: 'var(--gold)',
    letterSpacing: '0.12em',
    textTransform: 'uppercase',
    marginBottom: '16px',
  },
  uploadHeading: {
    fontFamily: "'Cormorant Garamond', Georgia, serif",
    fontWeight: 300,
    fontSize: '52px',
    lineHeight: 1.1,
    color: 'var(--text)',
    marginBottom: '20px',
    letterSpacing: '-0.01em',
  },
  uploadSub: {
    fontFamily: "'Cormorant Garamond', Georgia, serif",
    fontWeight: 300,
    fontSize: '16px',
    color: 'var(--muted)',
    lineHeight: 1.7,
    marginBottom: '40px',
    letterSpacing: '0.02em',
  },
  dropZone: {
    border: '1px solid var(--gold-border)',
    borderRadius: '4px',
    padding: '56px 40px',
    cursor: 'pointer',
    transition: 'all 0.25s ease',
    background: 'rgba(201,169,110,0.03)',
    position: 'relative',
    overflow: 'hidden',
  },
  dropZoneActive: {
    border: '1px solid var(--gold)',
    background: 'rgba(201,169,110,0.06)',
    transform: 'scale(1.01)',
  },
  dropIcon: {
    color: 'var(--gold)',
    marginBottom: '20px',
    display: 'flex',
    justifyContent: 'center',
  },
  dropText: {
    fontFamily: "'Cormorant Garamond', Georgia, serif",
    fontSize: '22px',
    fontWeight: 300,
    color: 'var(--text)',
    marginBottom: '8px',
    letterSpacing: '0.04em',
  },
  dropSub: {
    fontFamily: "'Cormorant Garamond', Georgia, serif",
    fontSize: '14px',
    fontWeight: 300,
    color: 'var(--muted)',
    letterSpacing: '0.06em',
  },
  loadingWrap: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '16px',
  },
  spinner: {
    width: '28px',
    height: '28px',
    border: '1px solid var(--gold-border)',
    borderTop: '1px solid var(--gold)',
    borderRadius: '50%',
    animation: 'spin 0.8s linear infinite',
  },
  loadingText: {
    fontFamily: "'Cormorant Garamond', Georgia, serif",
    fontStyle: 'italic',
    fontSize: '16px',
    color: 'var(--muted)',
    letterSpacing: '0.05em',
  },
  errorText: {
    marginTop: '16px',
    fontFamily: "'Cormorant Garamond', Georgia, serif",
    fontSize: '14px',
    color: '#e07070',
    letterSpacing: '0.04em',
  },

  // Reader
  readerSection: {
    maxWidth: '720px',
    width: '100%',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '0px',
  },
  bookMeta: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    marginBottom: '32px',
  },
  bookName: {
    fontFamily: "'Cormorant Garamond', Georgia, serif",
    fontWeight: 400,
    fontSize: '15px',
    color: 'var(--text)',
    letterSpacing: '0.06em',
  },
  bookDivider: {
    color: 'var(--gold)',
    fontSize: '14px',
  },
  bookStats: {
    fontFamily: "'Cormorant Garamond', Georgia, serif",
    fontWeight: 300,
    fontSize: '14px',
    color: 'var(--muted)',
    letterSpacing: '0.04em',
  },

  chapterWrap: {
    width: '100%',
    marginBottom: '24px',
  },
  chapterSelect: {
    width: '100%',
    padding: '10px 36px 10px 14px',
    fontFamily: "'Cormorant Garamond', Georgia, serif",
    fontSize: '15px',
    fontWeight: 400,
    color: 'var(--text)',
    background: 'var(--bg)',
    border: '1px solid var(--gold-border)',
    borderRadius: '4px',
    cursor: 'pointer',
    appearance: 'none',
    WebkitAppearance: 'none',
    MozAppearance: 'none',
    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%23c9a96e' d='M6 8L2 4h8z'/%3E%3C/svg%3E")`,
    backgroundRepeat: 'no-repeat',
    backgroundPosition: 'right 12px center',
  },
  chapterSelectDisabled: {
    color: 'var(--muted)',
    borderColor: 'rgba(201, 169, 110, 0.4)',
    cursor: 'default',
  },

  // Progress
  progressWrap: {
    width: '100%',
    marginBottom: '40px',
  },
  progressTrack: {
    width: '100%',
    height: '1px',
    background: 'var(--muted-2)',
    borderRadius: '1px',
    marginBottom: '10px',
    position: 'relative',
    overflow: 'visible',
  },
  progressFill: {
    height: '100%',
    background: 'linear-gradient(90deg, var(--gold-border) 0%, var(--gold) 100%)',
    borderRadius: '1px',
    transition: 'width 0.1s linear',
    position: 'relative',
  },
  progressLabels: {
    display: 'flex',
    justifyContent: 'space-between',
  },
  progressStat: {
    fontFamily: "'Cormorant Garamond', Georgia, serif",
    fontWeight: 300,
    fontSize: '12px',
    color: 'var(--muted)',
    letterSpacing: '0.06em',
  },

  // Display window
  displayWindow: {
    width: '100%',
    minHeight: '220px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    border: '1px solid var(--gold-border)',
    borderRadius: '4px',
    position: 'relative',
    background: 'var(--surface)',
    padding: '48px 32px',
    marginBottom: '32px',
    overflow: 'hidden',
  },
  displayOrnamentTop: {
    position: 'absolute',
    top: '16px',
    left: '50%',
    transform: 'translateX(-50%)',
    width: '40px',
    height: '1px',
    background: 'var(--gold-border)',
  },
  displayOrnamentBottom: {
    position: 'absolute',
    bottom: '16px',
    left: '50%',
    transform: 'translateX(-50%)',
    width: '40px',
    height: '1px',
    background: 'var(--gold-border)',
  },
  focalGuide: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: '50%',
    transform: 'translateY(-50%)',
    height: '1px',
    background: 'rgba(201,169,110,0.06)',
  },
  wordDisplay: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '100px',
  },
  wordText: {
    fontFamily: "'Cormorant Garamond', Georgia, serif",
    fontWeight: 300,
    color: 'var(--text)',
    letterSpacing: '-0.01em',
    lineHeight: 1.2,
    textAlign: 'center',
    display: 'block',
    animation: 'flash 0.1s ease-out forwards',
  },

  // Controls
  controls: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    marginBottom: '12px',
  },
  controlBtn: {
    width: '40px',
    height: '40px',
    border: '1px solid var(--gold-border)',
    borderRadius: '50%',
    background: 'none',
    color: 'var(--muted)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'all 0.2s ease',
    cursor: 'pointer',
  },
  playBtn: {
    width: '56px',
    height: '56px',
    border: '1px solid var(--gold)',
    borderRadius: '50%',
    background: 'var(--gold-dim)',
    color: 'var(--gold)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'all 0.2s ease',
    cursor: 'pointer',
  },

  // Settings
  settingsPanel: {
    width: '100%',
    marginTop: '8px',
    marginBottom: '8px',
  },
  settingsRule: {
    height: '1px',
    background: 'var(--muted-2)',
    margin: '20px 0',
  },
  settingRow: {
    marginBottom: '24px',
  },
  settingLabelGroup: {
    display: 'flex',
    justifyContent: 'space-between',
    marginBottom: '12px',
  },
  settingLabel: {
    fontFamily: "'Cormorant Garamond', Georgia, serif",
    fontSize: '13px',
    fontWeight: 400,
    color: 'var(--muted)',
    letterSpacing: '0.1em',
    textTransform: 'uppercase',
  },
  settingValue: {
    fontFamily: "'Cormorant Garamond', Georgia, serif",
    fontSize: '13px',
    fontWeight: 300,
    color: 'var(--gold)',
    letterSpacing: '0.05em',
  },
  slider: {
    width: '100%',
    accentColor: 'var(--gold)',
  },
  sliderLabels: {
    display: 'flex',
    justifyContent: 'space-between',
    marginTop: '6px',
    fontFamily: "'Cormorant Garamond', Georgia, serif",
    fontSize: '11px',
    color: 'var(--muted)',
    letterSpacing: '0.05em',
  },
  chunkBtns: {
    display: 'flex',
    gap: '8px',
    flexWrap: 'wrap' as const,
  },
  chunkBtn: {
    padding: '7px 16px',
    border: '1px solid var(--gold-border)',
    borderRadius: '100px',
    background: 'none',
    color: 'var(--muted)',
    fontFamily: "'Cormorant Garamond', Georgia, serif",
    fontSize: '13px',
    letterSpacing: '0.04em',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
  },
  chunkBtnActive: {
    border: '1px solid var(--gold)',
    background: 'var(--gold-dim)',
    color: 'var(--gold)',
  },

  hint: {
    fontFamily: "'Cormorant Garamond', Georgia, serif",
    fontSize: '13px',
    fontWeight: 300,
    color: 'var(--muted)',
    letterSpacing: '0.04em',
    textAlign: 'center',
    marginTop: '16px',
  },
  kbd: {
    background: 'var(--surface-2)',
    border: '1px solid var(--gold-border)',
    borderRadius: '3px',
    padding: '1px 6px',
    fontSize: '11px',
    fontFamily: 'monospace',
    color: 'var(--gold)',
  },

  // Footer
  footer: {
    padding: '0 48px 32px',
  },
  footerRule: {
    height: '1px',
    background: 'linear-gradient(90deg, var(--gold-border) 0%, transparent 100%)',
    marginBottom: '20px',
  },
  footerText: {
    fontFamily: "'Cormorant Garamond', Georgia, serif",
    fontWeight: 300,
    fontSize: '12px',
    color: 'var(--muted)',
    letterSpacing: '0.06em',
  },
}
