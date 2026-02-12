import { useEffect, useState, useCallback } from "react"

// ─── Types ────────────────────────────────────────────────────────

export type Theme = "dark" | "blink-classic-dark" | "light" | "blink-classic-light"

type ThemeListener = (theme: Theme) => void

export interface UseThemeReturn {
  theme: Theme
  setTheme: (newTheme: Theme) => void
  cycleTheme: () => void
  isDark: boolean
  isLight: boolean
  isBlinkClassic: boolean
  isBlinkClassicDark: boolean
  isBlinkClassicLight: boolean
  /** Backward compatibility: true for both dark and blink-classic-dark */
  darkMode: boolean
  /** Alias for cycleTheme — for easier migration */
  toggleDarkMode: () => void
}

// ─── Theme constants ──────────────────────────────────────────────

export const THEMES = {
  DARK: "dark",
  BLINK_CLASSIC_DARK: "blink-classic-dark",
  LIGHT: "light",
  BLINK_CLASSIC_LIGHT: "blink-classic-light",
} as const

// Theme order for cycling: dark → BC dark → light → BC light → dark
const THEME_ORDER: readonly Theme[] = [
  THEMES.DARK,
  THEMES.BLINK_CLASSIC_DARK,
  THEMES.LIGHT,
  THEMES.BLINK_CLASSIC_LIGHT,
]

const STORAGE_KEY = "theme"
const LEGACY_STORAGE_KEY = "darkMode"

// ─── Shared theme store ───────────────────────────────────────────
// Module-level singleton so every useTheme() instance shares the same
// theme value.  When any instance calls setTheme / cycleTheme, all
// subscribers (i.e. every mounted useTheme) are notified and re-render
// with the new value.
// ───────────────────────────────────────────────────────────────────

let _currentTheme: Theme = THEMES.DARK
let _initialized = false
const _listeners: Set<ThemeListener> = new Set()

function _notify(): void {
  _listeners.forEach((fn) => fn(_currentTheme))
}

function _subscribe(fn: ThemeListener): () => void {
  _listeners.add(fn)
  return () => {
    _listeners.delete(fn)
  }
}

function _setSharedTheme(theme: Theme): void {
  _currentTheme = theme
  _notify()
}

// ─── Helpers (unchanged) ──────────────────────────────────────────

/**
 * Migrate from old darkMode boolean storage to new theme string
 */
function migrateFromLegacy(): Theme | null {
  const legacyValue = localStorage.getItem(LEGACY_STORAGE_KEY)
  if (legacyValue !== null) {
    const newTheme: Theme = legacyValue === "true" ? THEMES.DARK : THEMES.LIGHT
    localStorage.setItem(STORAGE_KEY, newTheme)
    localStorage.removeItem(LEGACY_STORAGE_KEY)
    return newTheme
  }
  return null
}

/**
 * Migrate from old 'blink-classic' to new 'blink-classic-dark'
 */
function migrateBlinkClassic(savedTheme: string): Theme | string {
  if (savedTheme === "blink-classic") {
    localStorage.setItem(STORAGE_KEY, THEMES.BLINK_CLASSIC_DARK)
    return THEMES.BLINK_CLASSIC_DARK
  }
  return savedTheme
}

/**
 * Apply theme class to document
 */
function applyTheme(theme: Theme): void {
  const root = document.documentElement
  // Remove all theme classes
  Object.values(THEMES).forEach((t) => root.classList.remove(t))
  // Also remove old 'blink-classic' class if present
  root.classList.remove("blink-classic")
  // Add the current theme class
  root.classList.add(theme)

  // Add/remove 'dark' class for Tailwind dark mode
  const isDarkTheme = theme === THEMES.DARK || theme === THEMES.BLINK_CLASSIC_DARK
  if (isDarkTheme) {
    root.classList.add("dark")
  } else {
    root.classList.remove("dark")
  }
}

/**
 * One-time initialization: read from localStorage, run migrations,
 * set the shared theme value and apply DOM classes.
 */
function _initTheme(): void {
  if (_initialized) return
  _initialized = true

  // Check for legacy migration first
  const migratedTheme = migrateFromLegacy()
  if (migratedTheme) {
    _currentTheme = migratedTheme
    applyTheme(migratedTheme)
    return
  }

  // Check for saved theme preference
  let savedTheme: string | null = localStorage.getItem(STORAGE_KEY)

  // Migrate old 'blink-classic' to 'blink-classic-dark'
  if (savedTheme) {
    savedTheme = migrateBlinkClassic(savedTheme) as string
  }

  if (savedTheme && THEME_ORDER.includes(savedTheme as Theme)) {
    _currentTheme = savedTheme as Theme
    applyTheme(savedTheme as Theme)
  } else {
    _currentTheme = THEMES.DARK
    applyTheme(THEMES.DARK)
    localStorage.setItem(STORAGE_KEY, THEMES.DARK)
  }
}

// ─── Hook ─────────────────────────────────────────────────────────

/**
 * Hook for managing app theme (dark, blink-classic-dark, light, blink-classic-light)
 * Supports 4-theme cycling.
 *
 * Uses a module-level shared store so every component that calls useTheme()
 * sees the same theme value and re-renders together when it changes.
 */
export function useTheme(): UseThemeReturn {
  const [theme, setThemeLocal] = useState<Theme>(() => {
    // Eagerly initialize on first useState call (SSR-safe: falls back to DARK)
    if (typeof window !== "undefined") {
      _initTheme()
    }
    return _currentTheme
  })

  // Subscribe to shared store changes
  useEffect(() => {
    // Sync in case initialization happened after our initial render
    if (theme !== _currentTheme) {
      setThemeLocal(_currentTheme)
    }
    return _subscribe(setThemeLocal)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  /**
   * Set a specific theme
   */
  const setTheme = useCallback((newTheme: Theme): void => {
    if (!THEME_ORDER.includes(newTheme)) {
      console.warn(`Invalid theme: ${newTheme}. Valid themes: ${THEME_ORDER.join(", ")}`)
      return
    }
    localStorage.setItem(STORAGE_KEY, newTheme)
    applyTheme(newTheme)
    _setSharedTheme(newTheme)
  }, [])

  /**
   * Cycle through themes: dark → blink-classic-dark → light → blink-classic-light → dark
   */
  const cycleTheme = useCallback((): void => {
    const currentIndex = THEME_ORDER.indexOf(_currentTheme)
    const nextIndex = (currentIndex + 1) % THEME_ORDER.length
    const nextTheme = THEME_ORDER[nextIndex]

    localStorage.setItem(STORAGE_KEY, nextTheme)
    applyTheme(nextTheme)
    _setSharedTheme(nextTheme)
  }, [])

  // Convenience booleans
  const isDark = theme === THEMES.DARK
  const isLight = theme === THEMES.LIGHT
  const isBlinkClassicDark = theme === THEMES.BLINK_CLASSIC_DARK
  const isBlinkClassicLight = theme === THEMES.BLINK_CLASSIC_LIGHT
  const isBlinkClassic = isBlinkClassicDark || isBlinkClassicLight

  // Backward compatibility: darkMode is true for both dark and blink-classic-dark
  const darkMode = theme === THEMES.DARK || theme === THEMES.BLINK_CLASSIC_DARK

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
  }
}

// For testing: reset shared state
export function _resetThemeStore(): void {
  _currentTheme = THEMES.DARK
  _initialized = false
  _listeners.clear()
}

export default useTheme
