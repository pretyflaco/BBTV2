import { useState, useEffect } from "react"

/**
 * usePublicPOSMenuState - Manages menu/overlay visibility for PublicPOSDashboard
 *
 * Handles:
 * - Side menu open/close
 * - Currency settings overlay + search filter with debounce
 * - Regional settings overlay
 * - Sound settings overlay
 * - Paycode overlay + amount + PDF generation state
 */
export function usePublicPOSMenuState() {
  const [sideMenuOpen, setSideMenuOpen] = useState(false)
  const [showCurrencySettings, setShowCurrencySettings] = useState(false)
  const [currencyFilter, setCurrencyFilter] = useState("")
  const [currencyFilterDebounced, setCurrencyFilterDebounced] = useState("")
  const [showRegionalSettings, setShowRegionalSettings] = useState(false)
  const [showSoundSettings, setShowSoundSettings] = useState(false)
  const [showPaycode, setShowPaycode] = useState(false)
  const [paycodeAmount, setPaycodeAmount] = useState("")
  const [paycodeGeneratingPdf, setPaycodeGeneratingPdf] = useState(false)

  // Debounce currency filter (150ms delay)
  useEffect(() => {
    const timer = setTimeout(() => {
      setCurrencyFilterDebounced(currencyFilter)
    }, 150)
    return () => clearTimeout(timer)
  }, [currencyFilter])

  // Reset currency filter when closing the currency settings overlay
  useEffect(() => {
    if (!showCurrencySettings) {
      setCurrencyFilter("")
      setCurrencyFilterDebounced("")
    }
  }, [showCurrencySettings])

  return {
    sideMenuOpen,
    setSideMenuOpen,
    showCurrencySettings,
    setShowCurrencySettings,
    currencyFilter,
    setCurrencyFilter,
    currencyFilterDebounced,
    showRegionalSettings,
    setShowRegionalSettings,
    showSoundSettings,
    setShowSoundSettings,
    showPaycode,
    setShowPaycode,
    paycodeAmount,
    setPaycodeAmount,
    paycodeGeneratingPdf,
    setPaycodeGeneratingPdf,
  }
}
