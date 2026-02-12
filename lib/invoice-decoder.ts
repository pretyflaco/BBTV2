/**
 * Invoice Decoder Utility
 *
 * Decodes BOLT11 Lightning invoices and provides validation utilities.
 * Used for validating that NWC wallets are Blink-based (zero-fee internal transfers).
 */

// eslint-disable-next-line @typescript-eslint/no-require-imports
import * as bolt11 from "bolt11"
import type { PaymentRequestObject, TagData, TagsObject } from "bolt11"

// =============================================================================
// Types
// =============================================================================

export interface NetworkConfig {
  bech32: string
  pubKeyHash: number
  scriptHash: number
  validWitnessVersions: number[]
}

export interface DecodedInvoiceData {
  payeeNodeKey: string | undefined
  satoshis: number | null | undefined
  millisatoshis: string | null | undefined
  timestamp: number | undefined
  timeExpireDate: number | undefined
  tags: Array<{ tagName: string; data: TagData }>
  paymentHash: TagData | undefined
  description: TagData | undefined
  network: string
}

export type DecodeInvoiceResult =
  | { success: true; data: DecodedInvoiceData }
  | { success: false; error: string }

export interface BlinkInvoiceResult {
  isBlink: boolean
  nodePubkey?: string
  error?: string
  network?: string
}

// =============================================================================
// Constants
// =============================================================================

/**
 * Known Blink Lightning node public keys
 * Only NWC wallets that generate invoices destined for these nodes are allowed.
 * This ensures zero-fee internal transfers within the Blink network.
 */
export const BLINK_NODE_PUBKEYS: string[] = [
  "02dfb4c1dd59216fa6a28d0f012e188516f63517db68c4e4b82c3af41343a05bc4",
  "0325bb9bda523a85dc834b190289b7e25e8d92615ab2f2abffbe97983f0bb12ffb",
]

// =============================================================================
// Functions
// =============================================================================

/**
 * Decode a BOLT11 Lightning invoice
 * @param invoice - The BOLT11 invoice string
 * @returns Decode result with invoice data or error
 */
export function decodeInvoice(invoice: string): DecodeInvoiceResult {
  try {
    if (!invoice) {
      return { success: false, error: "No invoice provided" }
    }

    // Normalize invoice - remove 'lightning:' prefix if present
    let normalizedInvoice: string = invoice.trim().toLowerCase()
    if (normalizedInvoice.startsWith("lightning:")) {
      normalizedInvoice = normalizedInvoice.substring(10)
    }

    // Determine network based on prefix
    let network: NetworkConfig | undefined
    if (normalizedInvoice.startsWith("lnbc")) {
      network = {
        bech32: "bc", // mainnet
        pubKeyHash: 0x00,
        scriptHash: 0x05,
        validWitnessVersions: [0, 1],
      }
    } else if (normalizedInvoice.startsWith("lntbs")) {
      network = {
        bech32: "tbs", // signet
        pubKeyHash: 0x6f,
        scriptHash: 0xc4,
        validWitnessVersions: [0, 1],
      }
    } else if (normalizedInvoice.startsWith("lntb")) {
      network = {
        bech32: "tb", // testnet
        pubKeyHash: 0x6f,
        scriptHash: 0xc4,
        validWitnessVersions: [0, 1],
      }
    } else if (normalizedInvoice.startsWith("lnbcrt")) {
      network = {
        bech32: "bcrt", // regtest
        pubKeyHash: 0x6f,
        scriptHash: 0xc4,
        validWitnessVersions: [0, 1],
      }
    }

    // Decode the invoice
    const decoded: PaymentRequestObject & { tagsObject: TagsObject } = bolt11.decode(
      normalizedInvoice,
      network,
    )

    return {
      success: true,
      data: {
        payeeNodeKey: decoded.payeeNodeKey,
        satoshis: decoded.satoshis,
        millisatoshis: decoded.millisatoshis,
        timestamp: decoded.timestamp,
        timeExpireDate: decoded.timeExpireDate,
        tags: decoded.tags,
        paymentHash: decoded.tags?.find((t) => t.tagName === "payment_hash")?.data,
        description: decoded.tags?.find((t) => t.tagName === "description")?.data,
        network: normalizedInvoice.startsWith("lnbc")
          ? "mainnet"
          : normalizedInvoice.startsWith("lntbs")
            ? "signet"
            : normalizedInvoice.startsWith("lntb")
              ? "testnet"
              : "unknown",
      },
    }
  } catch (err: unknown) {
    const error = err instanceof Error ? err : new Error(String(err))
    console.error("[InvoiceDecoder] Failed to decode invoice:", error)
    return {
      success: false,
      error: error.message || "Failed to decode invoice",
    }
  }
}

/**
 * Check if an invoice's destination node is a Blink node
 * @param invoice - The BOLT11 invoice string
 * @returns Result indicating if invoice is for a Blink node
 */
export function isBlinkInvoice(invoice: string): BlinkInvoiceResult {
  const result: DecodeInvoiceResult = decodeInvoice(invoice)

  if (!result.success) {
    return { isBlink: false, error: result.error }
  }

  const nodePubkey: string | undefined = result.data.payeeNodeKey

  if (!nodePubkey) {
    return { isBlink: false, error: "Could not extract destination node from invoice" }
  }

  const isBlink: boolean = BLINK_NODE_PUBKEYS.includes(nodePubkey.toLowerCase())

  return {
    isBlink,
    nodePubkey,
    network: result.data.network,
  }
}

/**
 * Validate that a node pubkey belongs to Blink
 * @param pubkey - The node public key (hex)
 * @returns boolean
 */
export function isBlinkNodePubkey(pubkey: string): boolean {
  if (!pubkey) return false
  return BLINK_NODE_PUBKEYS.includes(pubkey.toLowerCase())
}

/**
 * Get a user-friendly error message for non-Blink wallets
 * @returns Error message string
 */
export function getNonBlinkWalletError(): string {
  return `This NWC wallet is not a Blink wallet. Only Blink NWC wallets are supported because they enable zero-fee internal transfers. External Lightning wallets would incur Lightning Network routing fees, which are difficult to account for properly. Please use the NWC connection from your Blink wallet at https://blink.sv`
}
