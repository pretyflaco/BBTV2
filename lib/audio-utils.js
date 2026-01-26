/**
 * Audio Utilities for BlinkPOS
 * 
 * Handles iOS Safari audio unlock using AudioContext "prime" technique.
 * iOS Safari blocks audio playback from async events (WebSocket, polling).
 * By unlocking AudioContext on first user gesture (numpad press), we enable
 * async sounds to play later.
 */

// Shared AudioContext instance
let audioContext = null;
let audioUnlocked = false;
const audioBufferCache = new Map();

/**
 * Sound theme configuration (centralized to avoid duplication)
 */
export const SOUND_THEMES = {
  success: {
    nfc: '/connect.mp3',
    payment: '/success.mp3',
  },
  zelda: {
    nfc: '/botw_connect.mp3',
    payment: '/botw_shrine.mp3',
  },
  free: {
    nfc: '/free_connect.mp3',
    payment: '/free_success.mp3',
  },
  retro: {
    nfc: '/retro_connect.mp3',
    payment: '/retro_success.mp3',
  },
};

/**
 * Get or create the shared AudioContext
 * @returns {AudioContext|null}
 */
function getAudioContext() {
  if (typeof window === 'undefined') return null;
  
  if (!audioContext) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (AudioContextClass) {
      audioContext = new AudioContextClass();
    }
  }
  return audioContext;
}

/**
 * Unlock AudioContext for iOS Safari
 * Call this on first user gesture (e.g., numpad button press)
 * This "primes" the audio system so async sounds can play later
 */
export function unlockAudioContext() {
  if (audioUnlocked) return;
  
  const ctx = getAudioContext();
  if (!ctx) return;
  
  // Resume context if suspended (iOS suspends by default)
  if (ctx.state === 'suspended') {
    ctx.resume().catch(console.error);
  }
  
  // Play a silent buffer to fully unlock audio
  // This is the "prime" technique for iOS
  try {
    const buffer = ctx.createBuffer(1, 1, 22050);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    source.start(0);
    audioUnlocked = true;
  } catch (error) {
    console.error('Failed to unlock audio context:', error);
  }
}

/**
 * Check if audio context is unlocked
 * @returns {boolean}
 */
export function isAudioUnlocked() {
  return audioUnlocked;
}

/**
 * Fetch and decode audio file to buffer (with caching)
 * @param {string} url - Audio file URL
 * @returns {Promise<AudioBuffer|null>}
 */
async function fetchAudioBuffer(url) {
  const ctx = getAudioContext();
  if (!ctx) return null;
  
  // Check cache first
  if (audioBufferCache.has(url)) {
    return audioBufferCache.get(url);
  }
  
  try {
    const response = await fetch(url);
    const arrayBuffer = await response.arrayBuffer();
    const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
    
    // Cache the decoded buffer
    audioBufferCache.set(url, audioBuffer);
    return audioBuffer;
  } catch (error) {
    console.error(`Failed to fetch/decode audio: ${url}`, error);
    return null;
  }
}

/**
 * Play sound using AudioContext (with HTML5 Audio fallback)
 * AudioContext is preferred for iOS as it uses the unlocked context.
 * Falls back to new Audio() for browsers where AudioContext isn't available.
 * 
 * @param {string} url - Audio file URL
 * @param {number} volume - Volume level (0.0 to 1.0)
 * @returns {Promise<void>}
 */
export async function playSound(url, volume = 0.5) {
  const ctx = getAudioContext();
  
  // Try AudioContext first (works on iOS after unlock)
  if (ctx && audioUnlocked) {
    try {
      // Ensure context is running
      if (ctx.state === 'suspended') {
        await ctx.resume();
      }
      
      const buffer = await fetchAudioBuffer(url);
      if (buffer) {
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        
        // Create gain node for volume control
        const gainNode = ctx.createGain();
        gainNode.gain.value = volume;
        
        source.connect(gainNode);
        gainNode.connect(ctx.destination);
        source.start(0);
        return;
      }
    } catch (error) {
      console.error('AudioContext playback failed, falling back to Audio:', error);
    }
  }
  
  // Fallback to HTML5 Audio API
  try {
    const audio = new Audio(url);
    audio.volume = volume;
    await audio.play();
  } catch (error) {
    console.error('Audio playback failed:', error);
  }
}

/**
 * Play keystroke/click sound
 * This is a convenience function that also unlocks audio on first call
 * 
 * @param {boolean} soundEnabled - Whether sound is enabled
 */
export function playKeystrokeSound(soundEnabled) {
  if (!soundEnabled) return;
  
  // Always try to unlock on keystroke (user gesture)
  unlockAudioContext();
  
  // Play the click sound
  playSound('/click.mp3', 0.3);
}

/**
 * Preload audio files for faster playback
 * Call this early to cache common sounds
 * 
 * @param {string[]} urls - Array of audio URLs to preload
 */
export async function preloadSounds(urls) {
  const ctx = getAudioContext();
  if (!ctx) return;
  
  await Promise.all(urls.map(url => fetchAudioBuffer(url)));
}

/**
 * Get all sound URLs for a theme
 * @param {string} themeName - Theme name (success, zelda, free, retro)
 * @returns {string[]}
 */
export function getThemeSoundUrls(themeName) {
  const theme = SOUND_THEMES[themeName] || SOUND_THEMES.success;
  return [theme.nfc, theme.payment];
}
