import { useState, useCallback, useEffect } from 'react';

/**
 * Default sound theme
 */
const DEFAULT_SOUND_THEME = 'success';

/**
 * LocalStorage keys
 */
const STORAGE_KEYS = {
  SOUND_ENABLED: 'soundEnabled',
  SOUND_THEME: 'soundTheme',
};

/**
 * Valid sound themes
 */
const VALID_THEMES = ['success', 'zelda', 'free', 'retro'];

/**
 * Theme display labels
 */
const THEME_LABELS = {
  success: 'Success',
  zelda: 'Zelda',
  free: 'Free',
  retro: 'Retro',
};

/**
 * Helper to check if code is running in browser
 * @returns {boolean}
 */
function isBrowser() {
  return typeof window !== 'undefined' && typeof localStorage !== 'undefined';
}

/**
 * Helper to validate sound theme
 * @param {string|null} theme - Theme to validate
 * @returns {boolean} Whether theme is valid
 */
function isValidTheme(theme) {
  return theme !== null && VALID_THEMES.includes(theme);
}

/**
 * Hook for managing sound settings state
 * 
 * Extracted from Dashboard.js to manage:
 * - Sound enabled/disabled toggle
 * - Sound theme selection
 * - Sound settings UI visibility
 * 
 * @returns {Object} Sound settings state and actions
 */
export function useSoundSettings() {
  // Sound state with localStorage persistence
  const [soundEnabled, setSoundEnabled] = useState(() => {
    if (!isBrowser()) return true;
    const saved = localStorage.getItem(STORAGE_KEYS.SOUND_ENABLED);
    return saved !== null ? JSON.parse(saved) : true;
  });

  const [soundTheme, setSoundTheme] = useState(() => {
    if (!isBrowser()) return DEFAULT_SOUND_THEME;
    const saved = localStorage.getItem(STORAGE_KEYS.SOUND_THEME);
    return isValidTheme(saved) ? saved : DEFAULT_SOUND_THEME;
  });

  // UI state
  const [showSoundThemes, setShowSoundThemes] = useState(false);

  // Persist sound enabled to localStorage
  useEffect(() => {
    if (isBrowser()) {
      localStorage.setItem(STORAGE_KEYS.SOUND_ENABLED, JSON.stringify(soundEnabled));
    }
  }, [soundEnabled]);

  // Persist sound theme to localStorage
  useEffect(() => {
    if (isBrowser()) {
      localStorage.setItem(STORAGE_KEYS.SOUND_THEME, soundTheme);
    }
  }, [soundTheme]);

  /**
   * Toggle sound enabled state
   */
  const toggleSoundEnabled = useCallback(() => {
    setSoundEnabled((prev) => !prev);
  }, []);

  /**
   * Disable sound and close settings
   */
  const disableSound = useCallback(() => {
    setSoundEnabled(false);
    setShowSoundThemes(false);
  }, []);

  /**
   * Get display label for current sound state
   * @returns {string} Display label
   */
  const getSoundThemeLabel = useCallback(() => {
    if (!soundEnabled) return 'None';
    return THEME_LABELS[soundTheme] || 'None';
  }, [soundEnabled, soundTheme]);

  return {
    // Sound state
    soundEnabled,
    setSoundEnabled,
    soundTheme,
    setSoundTheme,

    // UI state
    showSoundThemes,
    setShowSoundThemes,

    // Utility functions
    toggleSoundEnabled,
    disableSound,
    getSoundThemeLabel,
  };
}

export default useSoundSettings;
