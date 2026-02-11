import { useState, useEffect, useCallback, useMemo } from "react"
import {
  formatDisplayAmount,
  getCurrencyById,
  SAT_CURRENCY,
  STREET_RATE_CURRENCIES,
} from "../currency-utils"
import {
  CITRUSRATE_EXCLUSIVE_CURRENCIES,
  CITRUSRATE_ALT_CURRENCIES,
} from "../citrusrate-currencies-client"

/**
 * Currency data structure
 */
export interface Currency {
  id: string
  symbol?: string
  name?: string
  flag?: string
  fractionDigits?: number
  baseId?: string
  country?: string
  [key: string]: unknown
}

/**
 * Structured return from getAllCurrencies
 */
export interface AllCurrenciesResult {
  popular: Currency[]
  all: Currency[]
}

/**
 * Return type for useCurrencies hook
 */
export interface UseCurrenciesReturn {
  currencies: Currency[]
  loading: boolean
  error: string | null
  formatAmount: (value: number, currencyId: string) => string
  getCurrency: (currencyId: string) => Currency | undefined
  getAllCurrencies: () => AllCurrenciesResult
  getAllCurrenciesFlat: () => Currency[]
  popularCurrencyIds: string[]
  setPopularCurrencies: (currencyIds: string[]) => void
  addToPopular: (currencyId: string) => void
  removeFromPopular: (currencyId: string) => void
  isPopularCurrency: (currencyId: string) => boolean
  refetch: () => Promise<void>
}

/**
 * Country mapping for Blink currencies (for search functionality)
 * Citrusrate currencies already have country info in their definitions
 */
const CURRENCY_COUNTRIES: Record<string, string> = {
  USD: "United States",
  EUR: "European Union",
  GBP: "United Kingdom",
  JPY: "Japan",
  CAD: "Canada",
  AUD: "Australia",
  CHF: "Switzerland",
  CNY: "China",
  HKD: "Hong Kong",
  NZD: "New Zealand",
  SEK: "Sweden",
  KRW: "South Korea",
  SGD: "Singapore",
  NOK: "Norway",
  MXN: "Mexico",
  INR: "India",
  RUB: "Russia",
  BRL: "Brazil",
  TWD: "Taiwan",
  DKK: "Denmark",
  PLN: "Poland",
  THB: "Thailand",
  IDR: "Indonesia",
  HUF: "Hungary",
  CZK: "Czech Republic",
  ILS: "Israel",
  CLP: "Chile",
  PHP: "Philippines",
  AED: "United Arab Emirates",
  COP: "Colombia",
  SAR: "Saudi Arabia",
  MYR: "Malaysia",
  RON: "Romania",
  PEN: "Peru",
  ARS: "Argentina",
  VND: "Vietnam",
  PKR: "Pakistan",
  EGP: "Egypt",
  BDT: "Bangladesh",
  NGN: "Nigeria",
  KES: "Kenya",
  ZAR: "South Africa",
  GHS: "Ghana",
  TZS: "Tanzania",
  UGX: "Uganda",
  ETB: "Ethiopia",
  MAD: "Morocco",
  XAF: "Central Africa",
  XOF: "West Africa",
  MZN: "Mozambique",
  ZMW: "Zambia",
  MWK: "Malawi",
  NAD: "Namibia",
  MUR: "Mauritius",
  LRD: "Liberia",
  TRY: "Turkey",
  UAH: "Ukraine",
  BGN: "Bulgaria",
  HRK: "Croatia",
  ISK: "Iceland",
  QAR: "Qatar",
  KWD: "Kuwait",
  BHD: "Bahrain",
  OMR: "Oman",
  JOD: "Jordan",
  LBP: "Lebanon",
  LKR: "Sri Lanka",
  NPR: "Nepal",
  MMK: "Myanmar",
  KHR: "Cambodia",
  LAK: "Laos",
  BND: "Brunei",
  FJD: "Fiji",
  PGK: "Papua New Guinea",
  XPF: "French Pacific",
  WST: "Samoa",
  TOP: "Tonga",
  SBD: "Solomon Islands",
  VUV: "Vanuatu",
  TTD: "Trinidad and Tobago",
  JMD: "Jamaica",
  BBD: "Barbados",
  BSD: "Bahamas",
  BZD: "Belize",
  GYD: "Guyana",
  SRD: "Suriname",
  HTG: "Haiti",
  DOP: "Dominican Republic",
  CUP: "Cuba",
  GTQ: "Guatemala",
  HNL: "Honduras",
  NIO: "Nicaragua",
  PAB: "Panama",
  PYG: "Paraguay",
  UYU: "Uruguay",
  VES: "Venezuela",
  BOB: "Bolivia",
  CRC: "Costa Rica",
  AWG: "Aruba",
  ANG: "Netherlands Antilles",
  XCD: "Eastern Caribbean",
  KYD: "Cayman Islands",
  BMD: "Bermuda",
}

/**
 * Default popular currencies (user can customize)
 */
const DEFAULT_POPULAR_CURRENCIES: string[] = ["BTC", "USD", "EUR", "KES", "ZAR", "NGN"]

/**
 * Cache data structure for localStorage
 */
interface CurrencyCacheData {
  currencies: Currency[]
  timestamp: number
}

/**
 * Custom hook to fetch and manage currency list from Blink API
 * Merges Blink currencies with Citrusrate exclusive and alternative currencies
 * Caches currencies in localStorage to minimize API calls
 */
export function useCurrencies(): UseCurrenciesReturn {
  const [currencies, setCurrencies] = useState<Currency[]>([])
  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)
  const [popularCurrencyIds, setPopularCurrencyIds] = useState<string[]>(
    DEFAULT_POPULAR_CURRENCIES,
  )

  // Load popular currencies from localStorage on mount
  useEffect(() => {
    if (typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem("popular-currencies")
        if (saved) {
          const parsed: unknown = JSON.parse(saved)
          if (Array.isArray(parsed) && parsed.length > 0) {
            setPopularCurrencyIds(parsed as string[])
          }
        }
      } catch (e) {
        console.error("Error loading popular currencies:", e)
      }
    }
  }, [])

  const fetchCurrencies = async (): Promise<void> => {
    try {
      // Check localStorage cache first (cache for 24 hours)
      const cached = getCachedCurrencies()
      if (cached) {
        setCurrencies(cached)
        setLoading(false)
        return
      }

      // Fetch from API if no cache
      const response = await fetch("/api/blink/currency-list")
      const data = await response.json()

      if (!response.ok || !data.success) {
        throw new Error(data.error || "Failed to fetch currencies")
      }

      const currencyList: Currency[] = data.currencies || []
      setCurrencies(currencyList)

      // Cache in localStorage
      cacheCurrencies(currencyList)

      setLoading(false)
    } catch (err: unknown) {
      console.error("Error fetching currencies:", err)
      setError(err instanceof Error ? err.message : String(err))
      setLoading(false)

      // Use fallback currencies if fetch fails
      setCurrencies(getFallbackCurrencies())
    }
  }

  useEffect(() => {
    fetchCurrencies()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const getCachedCurrencies = (): Currency[] | null => {
    if (typeof window === "undefined") return null

    try {
      const cached = localStorage.getItem("blink-currencies")
      if (!cached) return null

      const { currencies: currencyList, timestamp } = JSON.parse(
        cached,
      ) as CurrencyCacheData
      const now = Date.now()
      const cacheAge = now - timestamp
      const cacheExpiry = 24 * 60 * 60 * 1000 // 24 hours

      if (cacheAge < cacheExpiry) {
        return currencyList
      }

      return null
    } catch (error) {
      console.error("Error reading currency cache:", error)
      return null
    }
  }

  const cacheCurrencies = (currencyList: Currency[]): void => {
    if (typeof window === "undefined") return

    try {
      const cacheData: CurrencyCacheData = {
        currencies: currencyList,
        timestamp: Date.now(),
      }
      localStorage.setItem("blink-currencies", JSON.stringify(cacheData))
    } catch (error) {
      console.error("Error caching currencies:", error)
    }
  }

  const getFallbackCurrencies = (): Currency[] => {
    // Fallback to basic currencies if API fails
    return [
      { id: "USD", symbol: "$", name: "US Dollar", flag: "🇺🇸", fractionDigits: 2 },
      { id: "EUR", symbol: "€", name: "Euro", flag: "🇪🇺", fractionDigits: 2 },
      { id: "GBP", symbol: "£", name: "Pound Sterling", flag: "🇬🇧", fractionDigits: 2 },
      {
        id: "KES",
        symbol: "KSh",
        name: "Kenyan Shilling",
        flag: "🇰🇪",
        fractionDigits: 2,
      },
      {
        id: "ZAR",
        symbol: "R",
        name: "South African Rand",
        flag: "🇿🇦",
        fractionDigits: 2,
      },
    ]
  }

  // Helper function to format amounts
  const formatAmount = (value: number, currencyId: string): string => {
    return formatDisplayAmount(value, currencyId, currencies) as string
  }

  // Helper function to get currency by ID
  const getCurrency = (currencyId: string): Currency | undefined => {
    return getCurrencyById(currencyId, currencies) as Currency | undefined
  }

  /**
   * Enrich a currency object with country data for search
   */
  const enrichCurrencyWithCountry = useCallback((currency: Currency): Currency => {
    // If currency already has country (Citrusrate exclusive), return as is
    if (currency.country) return currency

    // Look up country from our mapping
    const country =
      CURRENCY_COUNTRIES[currency.id] ||
      (currency.baseId ? CURRENCY_COUNTRIES[currency.baseId] : undefined)
    if (country) {
      return { ...currency, country }
    }

    return currency
  }, [])

  /**
   * Update popular currencies list (persisted to localStorage)
   */
  const setPopularCurrencies = useCallback((currencyIds: string[]): void => {
    if (!Array.isArray(currencyIds)) return

    setPopularCurrencyIds(currencyIds)

    if (typeof window !== "undefined") {
      try {
        localStorage.setItem("popular-currencies", JSON.stringify(currencyIds))
      } catch (e) {
        console.error("Error saving popular currencies:", e)
      }
    }
  }, [])

  /**
   * Add a currency to popular list
   */
  const addToPopular = useCallback(
    (currencyId: string): void => {
      if (!currencyId || popularCurrencyIds.includes(currencyId)) return

      const newList = [...popularCurrencyIds, currencyId]
      setPopularCurrencies(newList)
    },
    [popularCurrencyIds, setPopularCurrencies],
  )

  /**
   * Remove a currency from popular list
   */
  const removeFromPopular = useCallback(
    (currencyId: string): void => {
      if (!currencyId) return

      const newList = popularCurrencyIds.filter((id) => id !== currencyId)
      setPopularCurrencies(newList)
    },
    [popularCurrencyIds, setPopularCurrencies],
  )

  /**
   * Check if a currency is in the popular list
   */
  const isPopularCurrency = useCallback(
    (currencyId: string): boolean => {
      return popularCurrencyIds.includes(currencyId)
    },
    [popularCurrencyIds],
  )

  /**
   * Get all currencies including:
   * - Popular currencies first (with visual separator)
   * - Then all other currencies sorted alphabetically
   * - Street rate currencies injected after their base
   * - Citrusrate alternative currencies injected after their base
   * - Citrusrate exclusive currencies mixed in alphabetically
   *
   * Returns: { popular: Currency[], all: Currency[] }
   */
  const getAllCurrencies = useCallback((): AllCurrenciesResult => {
    // Combine Blink currencies with Citrusrate exclusive currencies
    const allFiatCurrencies: Currency[] = [
      ...currencies,
      ...(CITRUSRATE_EXCLUSIVE_CURRENCIES as Currency[]),
    ]

    // Sort all fiat currencies alphabetically by ID
    allFiatCurrencies.sort((a, b) => a.id.localeCompare(b.id))

    // Build the full list with variants
    const fullList: Currency[] = []
    const addedIds = new Set<string>()

    // Add BTC first (always)
    fullList.push(enrichCurrencyWithCountry(SAT_CURRENCY as Currency))
    addedIds.add("BTC")

    // Add fiat currencies with their variants
    for (const currency of allFiatCurrencies) {
      if (addedIds.has(currency.id)) continue

      const enriched = enrichCurrencyWithCountry(currency)
      fullList.push(enriched)
      addedIds.add(currency.id)

      // Check if there's a street rate version (e.g., MZN_STREET)
      const streetCurrency = (STREET_RATE_CURRENCIES as Currency[]).find(
        (sc: Currency) => sc.baseId === currency.id,
      )
      if (streetCurrency && !addedIds.has(streetCurrency.id)) {
        fullList.push(enrichCurrencyWithCountry(streetCurrency))
        addedIds.add(streetCurrency.id)
      }

      // Check if there's a Citrusrate alternative version (e.g., NGN_CITRUS)
      const citrusCurrency = (CITRUSRATE_ALT_CURRENCIES as Currency[]).find(
        (cc: Currency) => cc.baseId === currency.id,
      )
      if (citrusCurrency && !addedIds.has(citrusCurrency.id)) {
        fullList.push(enrichCurrencyWithCountry(citrusCurrency))
        addedIds.add(citrusCurrency.id)
      }
    }

    // Separate into popular and rest
    const popular: Currency[] = []
    const rest: Currency[] = []

    for (const currency of fullList) {
      if (popularCurrencyIds.includes(currency.id)) {
        popular.push(currency)
      } else {
        rest.push(currency)
      }
    }

    // Sort popular currencies by the order in popularCurrencyIds
    popular.sort((a, b) => {
      return popularCurrencyIds.indexOf(a.id) - popularCurrencyIds.indexOf(b.id)
    })

    return { popular, all: rest }
  }, [currencies, popularCurrencyIds, enrichCurrencyWithCountry])

  /**
   * Get flat list of all currencies (for backward compatibility)
   */
  const getAllCurrenciesFlat = useCallback((): Currency[] => {
    const { popular, all } = getAllCurrencies()
    return [...popular, ...all]
  }, [getAllCurrencies])

  return {
    currencies,
    loading,
    error,
    formatAmount,
    getCurrency,
    getAllCurrencies,
    getAllCurrenciesFlat,
    popularCurrencyIds,
    setPopularCurrencies,
    addToPopular,
    removeFromPopular,
    isPopularCurrency,
    refetch: fetchCurrencies,
  }
}
