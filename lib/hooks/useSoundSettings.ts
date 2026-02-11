import { useState, useCallback, useEffect } from 'react';

/**
 * Available sound theme options
 */
export type SoundTheme = 'success' | 'zelda' | 'free' | 'retro';

/**
 * Return type for useSoundSettings hook
 */
export interface UseSoundSettingsReturn {
  // Sound state
  soundEnabled: boolean;
  setSoundEnabled: React.Dispatch<React.SetStateAction<boolean>>;
  soundTheme: SoundTheme;
  setSoundTheme: React.Dispatch<React.SetStateAction<SoundTheme>>;

  // UI state
  showSoundThemes: boolean;
  setShowSoundThemes: React.Dispatch<React.SetStateAction<boolean>>;

  // Utility functions
  toggleSoundEnabled: () => void;
  disableSound: () => void;
  getSoundThemeLabel: () => string;
}

/**
 * Default sound theme
 */
const DEFAULT_SOUND_THEME: SoundTheme = 'success';

/**
 * LocalStorage keys
 */
const STORAGE_KEYS = {
  SOUND_ENABLED: 'soundEnabled',
  SOUND_THEME: 'soundTheme',
} as const;

/**
 * Valid sound themes
 */
const VALID_THEMES: SoundTheme[] = ['success', 'zelda', 'free', 'retro'];

/**
 * Theme display labels
 */
const THEME_LABELS: Record<SoundTheme, string> = {
  success: 'Success',
  zelda: 'Zelda',
  free: 'Free',
  retro: 'Retro',
};

/**
 * Helper to check if code is running in browser
 */
function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof localStorage !== 'undefined';
}

/**
 * Helper to validate sound theme
 */
function isValidTheme(theme: string | null): theme is SoundTheme {
  return theme !== null && VALID_THEMES.includes(theme as SoundTheme);
}

/**
 * Hook for managing sound settings state
 * 
 * Extracted from Dashboard.js to manage:
 * - Sound enabled/disabled toggle
 * - Sound theme selection
 * - Sound settings UI visibility
 */
export function useSoundSettings(): UseSoundSettingsReturn {
  // Sound state with localStorage persistence
  const [soundEnabled, setSoundEnabled] = useState<boolean>(() => {
    if (!isBrowser()) return true;
    const saved = localStorage.getItem(STORAGE_KEYS.SOUND_ENABLED);
    return saved !== null ? JSON.parse(saved) : true;
  });

  const [soundTheme, setSoundTheme] = useState<SoundTheme>(() => {
    if (!isBrowser()) return DEFAULT_SOUND_THEME;
    const saved = localStorage.getItem(STORAGE_KEYS.SOUND_THEME);
    return isValidTheme(saved) ? saved : DEFAULT_SOUND_THEME;
  });

  // UI state
  const [showSoundThemes, setShowSoundThemes] = useState<boolean>(false);

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
  const toggleSoundEnabled = useCallback((): void => {
    setSoundEnabled((prev) => !prev);
  }, []);

  /**
   * Disable sound and close settings
   */
  const disableSound = useCallback((): void => {
    setSoundEnabled(false);
    setShowSoundThemes(false);
  }, []);

  /**
   * Get display label for current sound state
   */
  const getSoundThemeLabel = useCallback((): string => {
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
