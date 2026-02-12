import { useState, useEffect, type Dispatch, type SetStateAction } from "react"
import type {
  NumberFormatPreference,
  BitcoinFormatPreference,
  NumpadLayoutPreference,
} from "../number-format"
import type { SoundThemeName } from "../audio-utils"

interface UsePublicPOSSettingsReturn {
  displayCurrency: string
  setDisplayCurrency: Dispatch<SetStateAction<string>>
  numberFormat: NumberFormatPreference
  setNumberFormat: Dispatch<SetStateAction<NumberFormatPreference>>
  bitcoinFormat: BitcoinFormatPreference
  setBitcoinFormat: Dispatch<SetStateAction<BitcoinFormatPreference>>
  numpadLayout: NumpadLayoutPreference
  setNumpadLayout: Dispatch<SetStateAction<NumpadLayoutPreference>>
  soundEnabled: boolean
  setSoundEnabled: Dispatch<SetStateAction<boolean>>
  soundTheme: SoundThemeName
  setSoundTheme: Dispatch<SetStateAction<SoundThemeName>>
}

/**
 * usePublicPOSSettings - Manages display/sound settings for PublicPOSDashboard
 *
 * Handles:
 * - Display currency selection
 * - Number format, Bitcoin format, numpad layout
 * - Sound enabled/theme
 * - All localStorage persistence (publicpos-* keys)
 */
export function usePublicPOSSettings(): UsePublicPOSSettingsReturn {
  const [displayCurrency, setDisplayCurrency] = useState("USD")

  const [numberFormat, setNumberFormat] = useState<NumberFormatPreference>(() => {
    if (typeof window !== "undefined") {
      return (
        (localStorage.getItem("publicpos-numberFormat") as NumberFormatPreference) ||
        "auto"
      )
    }
    return "auto"
  })

  const [bitcoinFormat, setBitcoinFormat] = useState<BitcoinFormatPreference>(() => {
    if (typeof window !== "undefined") {
      return (
        (localStorage.getItem("publicpos-bitcoinFormat") as BitcoinFormatPreference) ||
        "sats"
      )
    }
    return "bip177"
  })

  const [numpadLayout, setNumpadLayout] = useState<NumpadLayoutPreference>(() => {
    if (typeof window !== "undefined") {
      return (
        (localStorage.getItem("publicpos-numpadLayout") as NumpadLayoutPreference) ||
        "calculator"
      )
    }
    return "calculator"
  })

  const [soundEnabled, setSoundEnabled] = useState(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("publicpos-soundEnabled")
      return saved !== null ? (JSON.parse(saved) as boolean) : true
    }
    return true
  })

  const [soundTheme, setSoundTheme] = useState<SoundThemeName>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("publicpos-soundTheme")
      return (saved as SoundThemeName) || "success"
    }
    return "success"
  })

  // Persist all settings to localStorage
  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem("publicpos-soundEnabled", JSON.stringify(soundEnabled))
    }
  }, [soundEnabled])

  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem("publicpos-soundTheme", soundTheme)
    }
  }, [soundTheme])

  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem("publicpos-numberFormat", numberFormat)
    }
  }, [numberFormat])

  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem("publicpos-bitcoinFormat", bitcoinFormat)
    }
  }, [bitcoinFormat])

  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem("publicpos-numpadLayout", numpadLayout)
    }
  }, [numpadLayout])

  return {
    displayCurrency,
    setDisplayCurrency,
    numberFormat,
    setNumberFormat,
    bitcoinFormat,
    setBitcoinFormat,
    numpadLayout,
    setNumpadLayout,
    soundEnabled,
    setSoundEnabled,
    soundTheme,
    setSoundTheme,
  }
}
