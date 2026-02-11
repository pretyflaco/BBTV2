/**
 * CSV Parser for Batch Payments
 *
 * Parses CSV files in Blink Dashboard format:
 * recipient,amount,currency,memo
 *
 * Supports recipient types:
 * - Blink username (plain text, no @)
 * - Lightning Address (user@domain.com)
 * - LNURL (lnurl1...)
 */

/**
 * Recipient types
 */
export const RECIPIENT_TYPES = {
  BLINK: "BLINK",
  LN_ADDRESS: "LN_ADDRESS",
  LNURL: "LNURL",
} as const

export type RecipientType = (typeof RECIPIENT_TYPES)[keyof typeof RECIPIENT_TYPES]

export interface ParsedRecipient {
  rowNumber: number
  original: string
  type: RecipientType
  normalized: string
  amount: number
  amountSats: number | null
  currency: string
  memo: string
}

export interface ParseResult {
  success: boolean
  records?: ParsedRecipient[]
  errors?: string[]
  summary?: {
    total: number
    byType: Record<string, number>
    parseErrors: number
  }
}

export interface QuickValidateResult {
  valid: boolean
  error?: string
}

/**
 * Decode common character encodings that may appear in CSV files
 * (e.g., UTF-7 encoding from Excel)
 * @param {string} str - String to decode
 * @returns {string} Decoded string
 */
export function decodeCSVString(str: string): string {
  if (!str) return str

  // Decode UTF-7 encoded characters that can appear when CSV is saved from Excel
  // Common UTF-7 encodings: @ = +AEA-, _ = +AF8-
  return str
    .replace(/\+AEA-/gi, "@")
    .replace(/\+AEA(?=[^-]|$)/gi, "@")
    .replace(/\+AF8-/gi, "_")
    .replace(/\+AF8(?=[^-]|$)/gi, "_")
}

/**
 * Detect recipient type from string
 * @param {string} recipient - The recipient string
 * @returns {RecipientType} The detected recipient type
 */
export function detectRecipientType(recipient: string): RecipientType {
  const trimmed = decodeCSVString(recipient.trim())

  // LNURL: starts with lnurl (case insensitive)
  if (trimmed.toLowerCase().startsWith("lnurl")) {
    return RECIPIENT_TYPES.LNURL
  }

  // Lightning Address: contains @ with domain (not just @blink.sv shorthand)
  if (trimmed.includes("@")) {
    const parts = trimmed.split("@")
    // Must have user@domain format
    if (parts.length === 2 && parts[0].length > 0 && parts[1].includes(".")) {
      return RECIPIENT_TYPES.LN_ADDRESS
    }
  }

  // Default: Blink username
  return RECIPIENT_TYPES.BLINK
}

/**
 * Normalize recipient based on type
 * @param {string} recipient - Raw recipient string
 * @param {RecipientType} type - Detected type
 * @returns {string} Normalized recipient
 */
export function normalizeRecipient(recipient: string, type: RecipientType): string {
  const trimmed = decodeCSVString(recipient.trim())

  switch (type) {
    case RECIPIENT_TYPES.BLINK:
      // Remove @ prefix if present, lowercase
      return trimmed.replace(/^@/, "").toLowerCase()

    case RECIPIENT_TYPES.LN_ADDRESS:
      // Lowercase the entire address
      return trimmed.toLowerCase()

    case RECIPIENT_TYPES.LNURL:
      // Keep as-is (LNURLs are case-sensitive in bech32)
      return trimmed

    default:
      return trimmed
  }
}

/**
 * Parse CSV content into records
 * @param {string} csvContent - Raw CSV content
 * @returns {ParseResult} Parsed result with records, errors, and summary
 */
export function parseCSV(csvContent: string): ParseResult {
  const errors: string[] = []
  const records: ParsedRecipient[] = []

  if (!csvContent || typeof csvContent !== "string") {
    return { success: false, errors: ["CSV content is empty or invalid"] }
  }

  // Split into lines, handle both \n and \r\n
  const lines = csvContent.trim().split(/\r?\n/)

  if (lines.length < 2) {
    return {
      success: false,
      errors: ["CSV must have a header row and at least one data row"],
    }
  }

  // Parse header
  const headerLine = lines[0].toLowerCase()
  const headers = parseCSVLine(headerLine)

  // Validate required headers
  const requiredHeaders = ["recipient", "amount"]
  const missingHeaders = requiredHeaders.filter((h) => !headers.includes(h))

  if (missingHeaders.length > 0) {
    return {
      success: false,
      errors: [
        `Missing required headers: ${missingHeaders.join(", ")}. Expected: recipient,amount,currency,memo`,
      ],
    }
  }

  // Get column indices
  const recipientIndex = headers.indexOf("recipient")
  const amountIndex = headers.indexOf("amount")
  const currencyIndex = headers.indexOf("currency")
  const memoIndex = headers.indexOf("memo")

  // Parse data rows
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim()

    // Skip empty lines
    if (!line) continue

    const values = parseCSVLine(line)
    const rowNum = i + 1

    // Get values
    const recipientRaw = values[recipientIndex]?.trim()
    const amountRaw = values[amountIndex]?.trim()
    const currency = values[currencyIndex]?.trim().toUpperCase() || "SATS"
    const memo = values[memoIndex]?.trim() || ""

    // Validate recipient
    if (!recipientRaw) {
      errors.push(`Row ${rowNum}: Missing recipient`)
      continue
    }

    // Validate amount
    if (!amountRaw) {
      errors.push(`Row ${rowNum}: Missing amount`)
      continue
    }

    const amount = parseFloat(amountRaw)
    if (isNaN(amount) || amount <= 0) {
      errors.push(`Row ${rowNum}: Invalid amount "${amountRaw}"`)
      continue
    }

    // Validate currency
    const validCurrencies = ["SATS", "USD", "BTC"]
    if (!validCurrencies.includes(currency)) {
      errors.push(
        `Row ${rowNum}: Invalid currency "${currency}". Must be SATS, USD, or BTC`,
      )
      continue
    }

    // Detect and normalize recipient
    const type = detectRecipientType(recipientRaw)
    const normalized = normalizeRecipient(recipientRaw, type)

    // Convert amount to sats if needed
    let amountSats: number = amount
    if (currency === "BTC") {
      amountSats = Math.round(amount * 100000000) // BTC to sats
    }
    // Note: USD conversion happens at validation time with live rates

    records.push({
      rowNumber: rowNum,
      original: recipientRaw,
      type,
      normalized,
      amount,
      amountSats: currency === "USD" ? null : amountSats, // null = needs conversion
      currency,
      memo,
    })
  }

  if (records.length === 0 && errors.length === 0) {
    errors.push("No valid records found in CSV")
  }

  return {
    success: errors.length === 0,
    records,
    errors: errors.length > 0 ? errors : undefined,
    summary: {
      total: records.length,
      byType: {
        [RECIPIENT_TYPES.BLINK]: records.filter((r) => r.type === RECIPIENT_TYPES.BLINK)
          .length,
        [RECIPIENT_TYPES.LN_ADDRESS]: records.filter(
          (r) => r.type === RECIPIENT_TYPES.LN_ADDRESS,
        ).length,
        [RECIPIENT_TYPES.LNURL]: records.filter((r) => r.type === RECIPIENT_TYPES.LNURL)
          .length,
      },
      parseErrors: errors.length,
    },
  }
}

/**
 * Parse a single CSV line, handling quoted values
 * @param {string} line - CSV line
 * @returns {string[]} Parsed values
 */
export function parseCSVLine(line: string): string[] {
  const values: string[] = []
  let current = ""
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const char = line[i]
    const nextChar: string | undefined = line[i + 1]

    if (inQuotes) {
      if (char === '"' && nextChar === '"') {
        // Escaped quote
        current += '"'
        i++ // Skip next quote
      } else if (char === '"') {
        // End of quoted value
        inQuotes = false
      } else {
        current += char
      }
    } else {
      if (char === '"') {
        // Start of quoted value
        inQuotes = true
      } else if (char === ",") {
        // End of value
        values.push(current)
        current = ""
      } else {
        current += char
      }
    }
  }

  // Don't forget the last value
  values.push(current)

  return values
}

/**
 * Generate CSV template
 * @returns {string} CSV template content
 */
export function generateTemplate(): string {
  return `recipient,amount,currency,memo
hermann,1000,SATS,Payment to Blink user
user@getalby.com,500,SATS,Payment to external wallet
machankura@8333.mobi,2000,SATS,Payment to Machankura user`
}

/**
 * Validate CSV file before full parse (quick checks)
 * @param {string} csvContent - Raw CSV content
 * @returns {QuickValidateResult} Quick validation result
 */
export function quickValidate(csvContent: string): QuickValidateResult {
  if (!csvContent || typeof csvContent !== "string") {
    return { valid: false, error: "File is empty or invalid" }
  }

  if (csvContent.length > 5 * 1024 * 1024) {
    // 5MB limit
    return { valid: false, error: "File too large. Maximum size is 5MB" }
  }

  const lines = csvContent.trim().split(/\r?\n/)

  if (lines.length < 2) {
    return { valid: false, error: "CSV must have a header and at least one data row" }
  }

  if (lines.length > 1001) {
    // 1000 recipients + header
    return { valid: false, error: "Maximum 1000 recipients per batch" }
  }

  const headerLower = lines[0].toLowerCase()
  if (!headerLower.includes("recipient") || !headerLower.includes("amount")) {
    return { valid: false, error: 'CSV must have "recipient" and "amount" columns' }
  }

  return { valid: true }
}
