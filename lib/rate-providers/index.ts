/**
 * Rate Provider Registry
 *
 * Central registry for exchange rate providers.
 * Supports multiple providers (Blink official, Citrusrate street rates, Citrusrate official, etc.)
 */

import {
  CITRUSRATE_EXCLUSIVE_CURRENCIES,
  CITRUSRATE_ALT_CURRENCIES,
  CITRUSRATE_EXCLUSIVE_IDS,
  isCitrusrateExclusiveCurrency,
  isCitrusrateAltCurrency,
  getCitrusrateBaseCurrency,
} from "./citrusrate-currencies"

import type {
  CitrusrateExclusiveCurrency,
  CitrusrateAltCurrency,
} from "./citrusrate-currencies"

export interface RateProvider {
  id: string
  name: string
  description: string
  isDefault?: boolean
  currencies?: string[]
  rateType?: string
}

export interface StreetRateCurrency {
  id: string
  baseId: string
  displayId: string
  symbol: string
  name: string
  flag: string
  fractionDigits: number
  rateProvider: string
}

/**
 * Provider configurations
 * Each provider specifies which currencies it handles and how to fetch rates
 */
export const RATE_PROVIDERS: Record<string, RateProvider> = {
  blink: {
    id: "blink",
    name: "Blink (Official)",
    description: "Official exchange rates from Blink API",
    // Handles all currencies by default
    isDefault: true,
  },
  citrusrate_street: {
    id: "citrusrate_street",
    name: "Citrusrate (Street)",
    description: "Black market / street exchange rates from Citrusrate",
    // Specific currencies this provider handles
    currencies: ["MZN_STREET"],
    rateType: "blackmarket",
  },
  citrusrate_official: {
    id: "citrusrate_official",
    name: "Citrusrate (Official)",
    description:
      "Official aggregated exchange rates from Citrusrate (African currencies)",
    // Handles Citrusrate-exclusive currencies and _CITRUS alternative currencies
    rateType: "official",
  },
}

/**
 * Street rate currency configurations
 * Maps virtual currency IDs (e.g., MZN_STREET) to their base currencies and metadata
 */
export const STREET_RATE_CURRENCIES: StreetRateCurrency[] = [
  {
    id: "MZN_STREET",
    baseId: "MZN",
    displayId: "MZN (street)",
    symbol: "MT",
    name: "Mozambican Metical (street rate)",
    flag: "🇲🇿",
    fractionDigits: 2,
    rateProvider: "citrusrate_street",
  },
  // More street rate currencies can be added when Citrusrate expands support
]

/**
 * Get the rate provider for a given currency
 * @param currencyId - Currency ID (e.g., 'MZN', 'MZN_STREET', 'NGN_CITRUS', 'AOA')
 * @returns Provider configuration
 */
export function getProviderForCurrency(currencyId: string): RateProvider {
  // Check if this is a street rate currency (e.g., MZN_STREET)
  const streetCurrency: StreetRateCurrency | undefined = STREET_RATE_CURRENCIES.find(
    (c: StreetRateCurrency) => c.id === currencyId,
  )
  if (streetCurrency) {
    return RATE_PROVIDERS[streetCurrency.rateProvider]
  }

  // Check if this is a Citrusrate alternative currency (e.g., NGN_CITRUS)
  if (isCitrusrateAltCurrency(currencyId)) {
    return RATE_PROVIDERS.citrusrate_official
  }

  // Check if this is a Citrusrate-exclusive currency (e.g., AOA, BIF, BWP)
  if (isCitrusrateExclusiveCurrency(currencyId)) {
    return RATE_PROVIDERS.citrusrate_official
  }

  // Check if any provider explicitly handles this currency
  for (const [_key, provider] of Object.entries(RATE_PROVIDERS)) {
    if (provider.currencies && provider.currencies.includes(currencyId)) {
      return provider
    }
  }

  // Default to Blink provider
  return RATE_PROVIDERS.blink
}

/**
 * Check if a currency ID is a street rate currency
 */
export function isStreetRateCurrency(currencyId: string): boolean {
  return currencyId.endsWith("_STREET")
}

/**
 * Get the base currency for a special currency (street rate or citrus alt)
 * @param currencyId - e.g., 'MZN_STREET' or 'NGN_CITRUS'
 * @returns Base currency ID, e.g., 'MZN' or 'NGN'
 */
export function getBaseCurrency(currencyId: string): string {
  if (isStreetRateCurrency(currencyId)) {
    return currencyId.replace("_STREET", "")
  }
  if (isCitrusrateAltCurrency(currencyId)) {
    return getCitrusrateBaseCurrency(currencyId)
  }
  return currencyId
}

/**
 * Get street rate currency config by ID
 */
export function getStreetRateCurrency(currencyId: string): StreetRateCurrency | null {
  return (
    STREET_RATE_CURRENCIES.find((c: StreetRateCurrency) => c.id === currencyId) || null
  )
}

/**
 * Get all configured street rate currencies
 */
export function getAllStreetRateCurrencies(): StreetRateCurrency[] {
  return STREET_RATE_CURRENCIES
}

/**
 * Get all Citrusrate exclusive currencies (not in Blink)
 */
export function getAllCitrusrateExclusiveCurrencies(): CitrusrateExclusiveCurrency[] {
  return CITRUSRATE_EXCLUSIVE_CURRENCIES
}

/**
 * Get all Citrusrate alternative currencies
 */
export function getAllCitrusrateAltCurrencies(): CitrusrateAltCurrency[] {
  return CITRUSRATE_ALT_CURRENCIES
}

// Re-export from citrusrate-currencies for backward compatibility
export {
  CITRUSRATE_EXCLUSIVE_CURRENCIES,
  CITRUSRATE_ALT_CURRENCIES,
  CITRUSRATE_EXCLUSIVE_IDS,
  isCitrusrateExclusiveCurrency,
  isCitrusrateAltCurrency,
}

export type { CitrusrateExclusiveCurrency, CitrusrateAltCurrency }
