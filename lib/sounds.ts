/**
 * Tonal UI sounds via Web Audio API. No audio files, no external deps.
 * Creates a new AudioContext per call and closes it after the sound completes.
 */

const VOLUME = 0.07

function runInBrowser(fn: (ctx: AudioContext) => void): void {
  if (typeof window === 'undefined') return
  try {
    const ctx = new AudioContext()
    fn(ctx)
  } catch {
    // Silently fail if the browser blocks AudioContext (e.g. autoplay policy, SSR)
  }
}

function playTone(
  ctx: AudioContext,
  freq: number,
  durationMs: number,
  attackMs: number,
  releaseMs: number
): void {
  const now = ctx.currentTime
  const gain = ctx.createGain()
  gain.gain.setValueAtTime(0, now)
  gain.gain.linearRampToValueAtTime(VOLUME, now + attackMs / 1000)
  gain.gain.setValueAtTime(VOLUME, now + (durationMs - releaseMs) / 1000)
  gain.gain.linearRampToValueAtTime(0, now + durationMs / 1000)
  gain.connect(ctx.destination)

  const osc = ctx.createOscillator()
  osc.type = 'sine'
  osc.frequency.value = freq
  osc.connect(gain)
  osc.start(now)
  osc.stop(now + durationMs / 1000)
}

function playToneAt(
  ctx: AudioContext,
  freq: number,
  durationMs: number,
  attackMs: number,
  releaseMs: number,
  startTime: number
): void {
  const gain = ctx.createGain()
  gain.gain.setValueAtTime(0, startTime)
  gain.gain.linearRampToValueAtTime(VOLUME, startTime + attackMs / 1000)
  gain.gain.setValueAtTime(VOLUME, startTime + (durationMs - releaseMs) / 1000)
  gain.gain.linearRampToValueAtTime(0, startTime + durationMs / 1000)
  gain.connect(ctx.destination)

  const osc = ctx.createOscillator()
  osc.type = 'sine'
  osc.frequency.value = freq
  osc.connect(gain)
  osc.start(startTime)
  osc.stop(startTime + durationMs / 1000)
}

function scheduleClose(ctx: AudioContext, afterMs: number): void {
  setTimeout(() => {
    try {
      ctx.close()
    } catch {
      // ignore
    }
  }, afterMs)
}

export const sounds = {
  play(): void {
    runInBrowser(ctx => {
      playTone(ctx, 440, 80, 12, 20)
      scheduleClose(ctx, 100)
    })
  },

  pause(): void {
    runInBrowser(ctx => {
      playTone(ctx, 380, 80, 12, 20)
      scheduleClose(ctx, 100)
    })
  },

  step(): void {
    runInBrowser(ctx => {
      playTone(ctx, 520, 40, 4, 10)
      scheduleClose(ctx, 60)
    })
  },

  toggle(): void {
    runInBrowser(ctx => {
      const now = ctx.currentTime
      const gap = 0.03
      playToneAt(ctx, 440, 60, 12, 15, now)
      playToneAt(ctx, 550, 60, 12, 15, now + 0.06 + gap)
      scheduleClose(ctx, 200)
    })
  },
}
