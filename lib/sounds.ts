/**
 * Soft click UI sounds via Web Audio API. No audio files, no external deps.
 * Uses a single shared AudioContext; call initSounds() once inside a user gesture
 * (e.g. first button click) to unlock audio.
 */

let audioContext: AudioContext | null = null
let masterVolume = 0.5

export function setVolume(v: number): void {
  masterVolume = Math.max(0, Math.min(1, v))
}

export function getVolume(): number {
  return masterVolume
}

export function initSounds(): void {
  if (typeof window === 'undefined') return
  try {
    if (!audioContext) {
      audioContext = new AudioContext()
    }
    if (audioContext.state === 'suspended') {
      void audioContext.resume()
    }
  } catch {
    // Silently fail if the browser blocks AudioContext
  }
}

function ensureContext(): AudioContext | null {
  if (typeof window === 'undefined') return null
  if (!audioContext || audioContext.state !== 'running') {
    initSounds()
  }
  return audioContext && audioContext.state === 'running' ? audioContext : null
}

function playClick(
  ctx: AudioContext,
  durationMs: number,
  lowpassHz: number,
  gain: number,
  startTime: number = ctx.currentTime
): void {
  const durationSec = durationMs / 1000
  const sampleRate = ctx.sampleRate
  const numSamples = Math.max(1, Math.floor(sampleRate * durationSec))
  const buffer = ctx.createBuffer(1, numSamples, sampleRate)
  const channel = buffer.getChannelData(0)
  for (let i = 0; i < numSamples; i++) {
    channel[i] = (Math.random() * 2 - 1)
  }

  const source = ctx.createBufferSource()
  source.buffer = buffer
  source.start(startTime)
  source.stop(startTime + durationSec)

  const filter = ctx.createBiquadFilter()
  filter.type = 'lowpass'
  filter.frequency.value = lowpassHz
  source.connect(filter)

  const gainNode = ctx.createGain()
  gainNode.gain.setValueAtTime(gain, startTime)
  gainNode.gain.linearRampToValueAtTime(0, startTime + durationSec)
  filter.connect(gainNode)
  gainNode.connect(ctx.destination)
}

export const sounds = {
  play(): void {
    const ctx = ensureContext()
    if (!ctx) return
    try {
      playClick(ctx, 30, 800, 0.55 * masterVolume)
    } catch {
      // ignore
    }
  },

  pause(): void {
    const ctx = ensureContext()
    if (!ctx) return
    try {
      playClick(ctx, 30, 500, 0.45 * masterVolume)
    } catch {
      // ignore
    }
  },

  step(): void {
    const ctx = ensureContext()
    if (!ctx) return
    try {
      playClick(ctx, 15, 1000, 0.35 * masterVolume)
    } catch {
      // ignore
    }
  },

  toggle(): void {
    const ctx = ensureContext()
    if (!ctx) return
    try {
      const now = ctx.currentTime
      playClick(ctx, 20, 700, 0.5 * masterVolume, now)
      playClick(ctx, 20, 700, 0.4 * masterVolume, now + 0.04)
    } catch {
      // ignore
    }
  },
}
