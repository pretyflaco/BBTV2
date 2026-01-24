import { useEffect, useState, useCallback } from 'react';

// Theme constants
export const THEMES = {
  DARK: 'dark',
  BLINK_CLASSIC_DARK: 'blink-classic-dark',
  LIGHT: 'light',
  BLINK_CLASSIC_LIGHT: 'blink-classic-light',
};

// Theme order for cycling: dark → BC dark → light → BC light → dark
const THEME_ORDER = [
  THEMES.DARK,
  THEMES.BLINK_CLASSIC_DARK,
  THEMES.LIGHT,
  THEMES.BLINK_CLASSIC_LIGHT,
];

const STORAGE_KEY = 'theme';
const LEGACY_STORAGE_KEY = 'darkMode';

/**
 * Migrate from old darkMode boolean storage to new theme string
 */
function migrateFromLegacy() {
  const legacyValue = localStorage.getItem(LEGACY_STORAGE_KEY);
  if (legacyValue !== null) {
    const newTheme = legacyValue === 'true' ? THEMES.DARK : THEMES.LIGHT;
    localStorage.setItem(STORAGE_KEY, newTheme);
    localStorage.removeItem(LEGACY_STORAGE_KEY);
    return newTheme;
  }
  return null;
}

/**
 * Migrate from old 'blink-classic' to new 'blink-classic-dark'
 */
function migrateBlinkClassic(savedTheme) {
  if (savedTheme === 'blink-classic') {
    localStorage.setItem(STORAGE_KEY, THEMES.BLINK_CLASSIC_DARK);
    return THEMES.BLINK_CLASSIC_DARK;
  }
  return savedTheme;
}

/**
 * Apply theme class to document
 */
function applyTheme(theme) {
  const root = document.documentElement;
  // Remove all theme classes
  Object.values(THEMES).forEach(t => root.classList.remove(t));
  // Also remove old 'blink-classic' class if present
  root.classList.remove('blink-classic');
  // Add the current theme class
  root.classList.add(theme);
  
  // Add/remove 'dark' class for Tailwind dark mode
  const isDarkTheme = theme === THEMES.DARK || theme === THEMES.BLINK_CLASSIC_DARK;
  if (isDarkTheme) {
    root.classList.add('dark');
  } else {
    root.classList.remove('dark');
  }
}

/**
 * Hook for managing app theme (dark, blink-classic-dark, light, blink-classic-light)
 * Supports 4-theme cycling
 */
export function useTheme() {
  const [theme, setThemeState] = useState(THEMES.DARK);

  useEffect(() => {
    // Check for legacy migration first
    const migratedTheme = migrateFromLegacy();
    if (migratedTheme) {
      setThemeState(migratedTheme);
      applyTheme(migratedTheme);
      return;
    }

    // Check for saved theme preference
    let savedTheme = localStorage.getItem(STORAGE_KEY);
    
    // Migrate old 'blink-classic' to 'blink-classic-dark'
    if (savedTheme) {
      savedTheme = migrateBlinkClassic(savedTheme);
    }
    
    if (savedTheme && THEME_ORDER.includes(savedTheme)) {
      setThemeState(savedTheme);
      applyTheme(savedTheme);
    } else {
      // Default to dark mode
      setThemeState(THEMES.DARK);
      applyTheme(THEMES.DARK);
      localStorage.setItem(STORAGE_KEY, THEMES.DARK);
    }
  }, []);

  /**
   * Set a specific theme
   */
  const setTheme = useCallback((newTheme) => {
    if (!THEME_ORDER.includes(newTheme)) {
      console.warn(`Invalid theme: ${newTheme}. Valid themes: ${THEME_ORDER.join(', ')}`);
      return;
    }
    setThemeState(newTheme);
    localStorage.setItem(STORAGE_KEY, newTheme);
    applyTheme(newTheme);
  }, []);

  /**
   * Cycle through themes: dark → blink-classic-dark → light → blink-classic-light → dark
   */
  const cycleTheme = useCallback(() => {
    setThemeState((currentTheme) => {
      const currentIndex = THEME_ORDER.indexOf(currentTheme);
      const nextIndex = (currentIndex + 1) % THEME_ORDER.length;
      const nextTheme = THEME_ORDER[nextIndex];
      
      localStorage.setItem(STORAGE_KEY, nextTheme);
      applyTheme(nextTheme);
      
      return nextTheme;
    });
  }, []);

  // Convenience booleans
  const isDark = theme === THEMES.DARK;
  const isLight = theme === THEMES.LIGHT;
  const isBlinkClassicDark = theme === THEMES.BLINK_CLASSIC_DARK;
  const isBlinkClassicLight = theme === THEMES.BLINK_CLASSIC_LIGHT;
  const isBlinkClassic = isBlinkClassicDark || isBlinkClassicLight;

  // Backward compatibility: darkMode is true for both dark and blink-classic-dark
  const darkMode = theme === THEMES.DARK || theme === THEMES.BLINK_CLASSIC_DARK;

  return {
    theme,
    setTheme,
    cycleTheme,
    isDark,
    isLight,
    isBlinkClassic,
    isBlinkClassicDark,
    isBlinkClassicLight,
    // Backward compatibility
    darkMode,
    toggleDarkMode: cycleTheme, // Alias for easier migration
  };
}

export default useTheme;
