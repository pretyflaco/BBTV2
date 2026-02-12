/**
 * @deprecated Use useTheme instead
 * This file is kept for backward compatibility during migration
 * Import { useTheme } from './useTheme' directly
 */

import { useTheme } from "./useTheme"

interface UseDarkModeReturn {
  darkMode: boolean
  toggleDarkMode: () => void
}

/**
 * @deprecated Use useTheme instead
 */
export function useDarkMode(): UseDarkModeReturn {
  console.warn(
    "[useDarkMode] Deprecated: Please use useTheme from lib/hooks/useTheme instead",
  )
  const { darkMode, cycleTheme } = useTheme()

  return {
    darkMode,
    toggleDarkMode: cycleTheme,
  }
}

export default useDarkMode
