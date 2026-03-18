import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { sounds, initSounds, setVolume, getVolume } from './sounds'

describe('sounds', () => {
  it('imports without throwing in a node environment (no DOM/AudioContext at import time)', () => {
    expect(sounds).toBeDefined()
    expect(typeof sounds).toBe('object')
  })

  it('initSounds is an exported function', () => {
    expect(typeof initSounds).toBe('function')
  })

  it('calling initSounds() when window is undefined does not throw', () => {
    const originalWindow = globalThis.window
    vi.stubGlobal('window', undefined)
    expect(() => initSounds()).not.toThrow()
    vi.stubGlobal('window', originalWindow)
  })

  it('each method (play, pause, step, toggle) exists and is a function', () => {
    expect(typeof sounds.play).toBe('function')
    expect(typeof sounds.pause).toBe('function')
    expect(typeof sounds.step).toBe('function')
    expect(typeof sounds.toggle).toBe('function')
  })

  describe('SSR guard: methods no-op when window is undefined', () => {
    let originalWindow: typeof globalThis.window

    beforeEach(() => {
      originalWindow = globalThis.window
      vi.stubGlobal('window', undefined)
    })

    afterEach(() => {
      vi.stubGlobal('window', originalWindow)
    })

    it('play() does not throw', () => {
      expect(() => sounds.play()).not.toThrow()
    })

    it('pause() does not throw', () => {
      expect(() => sounds.pause()).not.toThrow()
    })

    it('step() does not throw', () => {
      expect(() => sounds.step()).not.toThrow()
    })

    it('toggle() does not throw', () => {
      expect(() => sounds.toggle()).not.toThrow()
    })
  })

  describe('setVolume', () => {
    it('clamps values below 0 to 0', () => {
      setVolume(-0.5)
      expect(getVolume()).toBe(0)
      setVolume(-1)
      expect(getVolume()).toBe(0)
    })

    it('clamps values above 1 to 1', () => {
      setVolume(1.5)
      expect(getVolume()).toBe(1)
      setVolume(2)
      expect(getVolume()).toBe(1)
    })

    it('sets valid mid-range values correctly', () => {
      setVolume(0.5)
      expect(getVolume()).toBe(0.5)
      setVolume(0)
      expect(getVolume()).toBe(0)
      setVolume(1)
      expect(getVolume()).toBe(1)
      setVolume(0.75)
      expect(getVolume()).toBe(0.75)
    })
  })
})
