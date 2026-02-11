import { useState, useEffect } from "react"

/**
 * usePublicPOSSettings - Manages display/sound settings for PublicPOSDashboard
 *
 * Handles:
 * - Display currency selection
 * - Number format, Bitcoin format, numpad layout
 * - Sound enabled/theme
 * - All localStorage persistence (publicpos-* keys)
 */
export function usePublicPOSSettings() {
  const [displayCurrency, setDisplayCurrency] = useState("USD")

  const [numberFormat, setNumberFormat] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("publicpos-numberFormat") || "auto"
    }
    return "auto"
  })

  const [bitcoinFormat, setBitcoinFormat] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("publicpos-bitcoinFormat") || "sats"
    }
    return "bip177"
  })

  const [numpadLayout, setNumpadLayout] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("publicpos-numpadLayout") || "calculator"
    }
    return "calculator"
  })

  const [soundEnabled, setSoundEnabled] = useState(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("publicpos-soundEnabled")
      return saved !== null ? JSON.parse(saved) : true
    }
    return true
  })

  const [soundTheme, setSoundTheme] = useState(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("publicpos-soundTheme")
      return saved || "success"
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
