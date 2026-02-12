/**
 * Audio Utilities for BlinkPOS
 *
 * Handles iOS Safari audio unlock using AudioContext "prime" technique.
 * iOS Safari blocks audio playback from async events (WebSocket, polling).
 * By unlocking AudioContext on first user gesture (numpad press), we enable
 * async sounds to play later.
 */

// =============================================================================
// Global augmentation for webkitAudioContext
// =============================================================================

declare global {
  interface Window {
    webkitAudioContext?: typeof AudioContext
  }
}

// =============================================================================
// Types
// =============================================================================

export interface SoundTheme {
  nfc: string
  payment: string
}

export type SoundThemeName = "success" | "zelda" | "free" | "retro"

// =============================================================================
// Module State
// =============================================================================

// Shared AudioContext instance
let audioContext: AudioContext | null = null
let audioUnlocked: boolean = false
const audioBufferCache: Map<string, AudioBuffer> = new Map()

// =============================================================================
// Constants
// =============================================================================

/**
 * Sound theme configuration (centralized to avoid duplication)
 */
export const SOUND_THEMES: Record<SoundThemeName, SoundTheme> = {
  success: {
    nfc: "/connect.mp3",
    payment: "/success.mp3",
  },
  zelda: {
    nfc: "/botw_connect.mp3",
    payment: "/botw_shrine.mp3",
  },
  free: {
    nfc: "/free_connect.mp3",
    payment: "/free_success.mp3",
  },
  retro: {
    nfc: "/retro_connect.mp3",
    payment: "/retro_success.mp3",
  },
}

// =============================================================================
// Internal Functions
// =============================================================================

/**
 * Get or create the shared AudioContext
 * @returns AudioContext or null if not in browser environment
 */
function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null

  if (!audioContext) {
    const AudioContextClass: typeof AudioContext | undefined =
      window.AudioContext || window.webkitAudioContext
    if (AudioContextClass) {
      audioContext = new AudioContextClass()
    }
  }
  return audioContext
}

/**
 * Fetch and decode audio file to buffer (with caching)
 * @param url - Audio file URL
 * @returns Decoded AudioBuffer or null on failure
 */
async function fetchAudioBuffer(url: string): Promise<AudioBuffer | null> {
  const ctx: AudioContext | null = getAudioContext()
  if (!ctx) return null

  // Check cache first
  if (audioBufferCache.has(url)) {
    return audioBufferCache.get(url) as AudioBuffer
  }

  try {
    const response: Response = await fetch(url)
    const arrayBuffer: ArrayBuffer = await response.arrayBuffer()
    const audioBuffer: AudioBuffer = await ctx.decodeAudioData(arrayBuffer)

    // Cache the decoded buffer
    audioBufferCache.set(url, audioBuffer)
    return audioBuffer
  } catch (err: unknown) {
    console.error(`Failed to fetch/decode audio: ${url}`, err)
    return null
  }
}

// =============================================================================
// Exported Functions
// =============================================================================

/**
 * Unlock AudioContext for iOS Safari
 * Call this on first user gesture (e.g., numpad button press)
 * This "primes" the audio system so async sounds can play later
 */
export function unlockAudioContext(): void {
  if (audioUnlocked) return

  const ctx: AudioContext | null = getAudioContext()
  if (!ctx) return

  // Resume context if suspended (iOS suspends by default)
  if (ctx.state === "suspended") {
    ctx.resume().catch(console.error)
  }

  // Play a silent buffer to fully unlock audio
  // This is the "prime" technique for iOS
  try {
    const buffer: AudioBuffer = ctx.createBuffer(1, 1, 22050)
    const source: AudioBufferSourceNode = ctx.createBufferSource()
    source.buffer = buffer
    source.connect(ctx.destination)
    source.start(0)
    audioUnlocked = true
  } catch (err: unknown) {
    console.error("Failed to unlock audio context:", err)
  }
}

/**
 * Check if audio context is unlocked
 * @returns boolean
 */
export function isAudioUnlocked(): boolean {
  return audioUnlocked
}

/**
 * Play sound using AudioContext (with HTML5 Audio fallback)
 * AudioContext is preferred for iOS as it uses the unlocked context.
 * Falls back to new Audio() for browsers where AudioContext isn't available.
 *
 * @param url - Audio file URL
 * @param volume - Volume level (0.0 to 1.0)
 */
export async function playSound(url: string, volume: number = 0.5): Promise<void> {
  const ctx: AudioContext | null = getAudioContext()

  // Try AudioContext first (works on iOS after unlock)
  if (ctx && audioUnlocked) {
    try {
      // Ensure context is running
      if (ctx.state === "suspended") {
        await ctx.resume()
      }

      const buffer: AudioBuffer | null = await fetchAudioBuffer(url)
      if (buffer) {
        const source: AudioBufferSourceNode = ctx.createBufferSource()
        source.buffer = buffer

        // Create gain node for volume control
        const gainNode: GainNode = ctx.createGain()
        gainNode.gain.value = volume

        source.connect(gainNode)
        gainNode.connect(ctx.destination)
        source.start(0)
        return
      }
    } catch (err: unknown) {
      console.error("AudioContext playback failed, falling back to Audio:", err)
    }
  }

  // Fallback to HTML5 Audio API
  try {
    const audio: HTMLAudioElement = new Audio(url)
    audio.volume = volume
    await audio.play()
  } catch (err: unknown) {
    console.error("Audio playback failed:", err)
  }
}

/**
 * Play keystroke/click sound
 * This is a convenience function that also unlocks audio on first call
 *
 * @param soundEnabled - Whether sound is enabled
 */
export function playKeystrokeSound(soundEnabled: boolean): void {
  if (!soundEnabled) return

  // Always try to unlock on keystroke (user gesture)
  unlockAudioContext()

  // Play the click sound
  playSound("/click.mp3", 0.3)
}

/**
 * Preload audio files for faster playback
 * Call this early to cache common sounds
 *
 * @param urls - Array of audio URLs to preload
 */
export async function preloadSounds(urls: string[]): Promise<void> {
  const ctx: AudioContext | null = getAudioContext()
  if (!ctx) return

  await Promise.all(urls.map((url: string) => fetchAudioBuffer(url)))
}

/**
 * Get all sound URLs for a theme
 * @param themeName - Theme name (success, zelda, free, retro)
 * @returns Array of sound URLs for the theme
 */
export function getThemeSoundUrls(themeName: string): string[] {
  const theme: SoundTheme =
    SOUND_THEMES[themeName as SoundThemeName] || SOUND_THEMES.success
  return [theme.nfc, theme.payment]
}
