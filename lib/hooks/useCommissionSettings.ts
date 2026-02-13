import { useState, useCallback, useEffect } from "react"

/**
 * Return type for useCommissionSettings hook
 */
export interface UseCommissionSettingsReturn {
  // Commission state
  commissionEnabled: boolean
  setCommissionEnabled: React.Dispatch<React.SetStateAction<boolean>>
  commissionPresets: number[]
  setCommissionPresets: React.Dispatch<React.SetStateAction<number[]>>

  // UI state
  showCommissionSettings: boolean
  setShowCommissionSettings: React.Dispatch<React.SetStateAction<boolean>>

  // Utility functions
  toggleCommissionEnabled: () => void
  updateCommissionPreset: (index: number, value: number) => void
  resetCommissionPresets: () => void
}

/**
 * Default commission presets
 */
const DEFAULT_COMMISSION_PRESETS: number[] = [1, 2, 3]

/**
 * LocalStorage keys
 */
const STORAGE_KEYS = {
  COMMISSION_ENABLED: "blinkpos-commission-enabled",
  COMMISSION_PRESETS: "blinkpos-commission-presets",
} as const

/**
 * Helper to check if code is running in browser
 */
function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof localStorage !== "undefined"
}

/**
 * Helper to safely parse JSON from localStorage
 */
function safeParseJson<T>(value: string | null, fallback: T): T {
  if (!value) return fallback
  try {
    return JSON.parse(value) as T
  } catch {
    return fallback
  }
}

/**
 * Hook for managing commission settings state
 *
 * Extracted from Dashboard.js to manage:
 * - Commission enabled/disabled toggle
 * - Commission percentage presets for voucher creation
 * - Commission settings UI visibility
 */
export function useCommissionSettings(): UseCommissionSettingsReturn {
  // Commission state with localStorage persistence
  const [commissionEnabled, setCommissionEnabled] = useState<boolean>(() => {
    if (!isBrowser()) return false
    return localStorage.getItem(STORAGE_KEYS.COMMISSION_ENABLED) === "true"
  })

  const [commissionPresets, setCommissionPresets] = useState<number[]>(() => {
    if (!isBrowser()) return DEFAULT_COMMISSION_PRESETS
    const saved = localStorage.getItem(STORAGE_KEYS.COMMISSION_PRESETS)
    return safeParseJson(saved, DEFAULT_COMMISSION_PRESETS)
  })

  // UI state
  const [showCommissionSettings, setShowCommissionSettings] = useState<boolean>(false)

  // Persist commission enabled to localStorage
  useEffect(() => {
    if (isBrowser()) {
      localStorage.setItem(STORAGE_KEYS.COMMISSION_ENABLED, commissionEnabled.toString())
    }
  }, [commissionEnabled])

  // Persist commission presets to localStorage
  useEffect(() => {
    if (isBrowser()) {
      localStorage.setItem(
        STORAGE_KEYS.COMMISSION_PRESETS,
        JSON.stringify(commissionPresets),
      )
    }
  }, [commissionPresets])

  /**
   * Toggle commission enabled state
   */
  const toggleCommissionEnabled = useCallback((): void => {
    setCommissionEnabled((prev) => !prev)
  }, [])

  /**
   * Update a specific commission preset
   */
  const updateCommissionPreset = useCallback((index: number, value: number): void => {
    setCommissionPresets((prev) => {
      if (index < 0 || index >= prev.length) return prev
      const updated = [...prev]
      updated[index] = value
      return updated
    })
  }, [])

  /**
   * Reset commission presets to defaults
   */
  const resetCommissionPresets = useCallback((): void => {
    setCommissionPresets(DEFAULT_COMMISSION_PRESETS)
  }, [])

  return {
    // Commission state
    commissionEnabled,
    setCommissionEnabled,
    commissionPresets,
    setCommissionPresets,

    // UI state
    showCommissionSettings,
    setShowCommissionSettings,

    // Utility functions
    toggleCommissionEnabled,
    updateCommissionPreset,
    resetCommissionPresets,
  }
}

export default useCommissionSettings
