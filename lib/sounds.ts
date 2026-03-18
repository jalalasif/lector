/**
 * Glass-like tonal UI sounds via Web Audio API. No audio files, no external deps.
 * White noise through lowpass filter for soft click character.
 * Single shared AudioContext; call initSounds() once inside a user gesture
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

const NOISE_SAMPLES = 2048

function createNoiseBuffer(ctx: AudioContext): AudioBuffer {
  const buffer = ctx.createBuffer(1, NOISE_SAMPLES, ctx.sampleRate)
  const channel = buffer.getChannelData(0)
  for (let i = 0; i < NOISE_SAMPLES; i++) {
    channel[i] = Math.random() * 2 - 1
  }
  return buffer
}

function playNoiseClick(
  ctx: AudioContext,
  lowpassHz: number,
  attackSec: number,
  decaySec: number,
  peakGain: number,
  stopAtSec: number
): void {
  const t0 = ctx.currentTime
  const buffer = createNoiseBuffer(ctx)
  const source = ctx.createBufferSource()
  source.buffer = buffer
  source.start(t0)
  source.stop(t0 + stopAtSec)

  const filter = ctx.createBiquadFilter()
  filter.type = 'lowpass'
  filter.frequency.value = lowpassHz
  filter.Q.value = 1

  const gainNode = ctx.createGain()
  gainNode.gain.setValueAtTime(0, t0)
  gainNode.gain.linearRampToValueAtTime(peakGain, t0 + attackSec)
  gainNode.gain.linearRampToValueAtTime(0, t0 + attackSec + decaySec)

  source.connect(filter)
  filter.connect(gainNode)
  gainNode.connect(ctx.destination)
}

export const sounds = {
  play(): void {
    const ctx = ensureContext()
    if (!ctx) return
    try {
      const t0 = ctx.currentTime
      playNoiseClick(ctx, 800, 0.002, 0.03, 0.9 * masterVolume, 0.035)
    } catch {
      // ignore
    }
  },

  pause(): void {
    const ctx = ensureContext()
    if (!ctx) return
    try {
      playNoiseClick(ctx, 500, 0.002, 0.03, 0.75 * masterVolume, 0.035)
    } catch {
      // ignore
    }
  },

  step(): void {
    const ctx = ensureContext()
    if (!ctx) return
    try {
      playNoiseClick(ctx, 1000, 0.001, 0.015, 0.6 * masterVolume, 0.02)
    } catch {
      // ignore
    }
  },

  toggle(): void {
    const ctx = ensureContext()
    if (!ctx) return
    try {
      const t0 = ctx.currentTime
      // First click
      playNoiseClick(ctx, 700, 0.001, 0.02, 0.7 * masterVolume, 0.025)
      // Second click 50ms later
      const t1 = t0 + 0.05
      const buffer = createNoiseBuffer(ctx)
      const source = ctx.createBufferSource()
      source.buffer = buffer
      source.start(t1)
      source.stop(t1 + 0.025)

      const filter = ctx.createBiquadFilter()
      filter.type = 'lowpass'
      filter.frequency.value = 700
      filter.Q.value = 1

      const gainNode = ctx.createGain()
      gainNode.gain.setValueAtTime(0, t1)
      gainNode.gain.linearRampToValueAtTime(0.55 * masterVolume, t1 + 0.001)
      gainNode.gain.linearRampToValueAtTime(0, t1 + 0.021)

      source.connect(filter)
      filter.connect(gainNode)
      gainNode.connect(ctx.destination)
    } catch {
      // ignore
    }
  },
}
