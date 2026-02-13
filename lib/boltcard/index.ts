/**
 * Boltcard - Native Boltcard support for BlinkPOS
 *
 * Implements spec-compliant Boltcard functionality per:
 * - https://github.com/boltcard/boltcard/blob/main/docs/DETERMINISTIC.md
 * - https://github.com/boltcard/boltcard/blob/main/docs/DEEPLINK.md
 *
 * This module provides:
 * - Card registration and management (store.js)
 * - NTAG424DNA spec-compliant cryptographic operations (crypto.js)
 * - LNURL-withdraw for card payments (lnurlw.ts)
 * - LNURL-pay for card top-up (lnurlp.ts)
 *
 * Features:
 * - Per-user IssuerKey for deterministic key derivation
 * - Spec-compliant AES-CMAC PRF key derivation
 * - Privacy-preserving card_id_hash
 * - Deeplink flow for NFC Programmer app
 * - Version rotation on card re-programming
 * - Both BTC and USD (Stablesats) wallet support
 * - Server-side balance tracking with spending limits
 * - Replay protection via counter verification
 *
 * Usage:
 *
 * ```typescript
 * import boltcard from './lib/boltcard';
 *
 * // Create a new card (spec-compliant, keys derived from IssuerKey)
 * const card = await boltcard.store.createCard({
 *   cardUid,
 *   ownerPubkey,
 *   walletId,
 *   apiKey,
 * }, {
 *   name: 'My Card',
 *   walletCurrency: 'BTC',
 *   maxTxAmount: 100000,
 *   dailyLimit: 500000,
 * });
 *
 * // Or use deeplink flow (card UID unknown until programming)
 * const pending = await boltcard.store.createPendingRegistration({
 *   ownerPubkey, walletId, apiKey
 * }, { name: 'My Card' });
 * const deeplink = boltcard.crypto.generateProgramDeeplink(keysUrl);
 *
 * // Handle LNURL-withdraw (card tap)
 * const response = await boltcard.lnurlw.handleWithdrawRequest(
 *   cardId, piccData, sunMac, callbackUrl
 * );
 *
 * // Handle LNURL-pay (top-up)
 * const response = await boltcard.lnurlp.handleTopUpRequest(
 *   cardId, serverUrl
 * );
 * ```
 *
 * References:
 * - GitHub Issue: https://github.com/blinkbitcoin/blink-wip/issues/383
 * - BTCPay BoltCardTools: https://github.com/btcpayserver/BTCPayServer.BoltCardTools
 * - Boltcard Spec: https://github.com/boltcard/boltcard/blob/main/docs/SPEC.md
 */

import * as boltcardCrypto from "./crypto"
import { KeySlot, PICCDATA_TAG_BOLTCARD, type KeysResponse } from "./crypto"
import * as lnurlp from "./lnurlp"
import * as lnurlw from "./lnurlw"
import boltcardStore, { CardStatus, TxType, PendingStatus } from "./store"

// Preserve original names for re-export and internal usage
const store = boltcardStore
const crypto = boltcardCrypto

const { TopUpLimits } = lnurlp

// ============================================================================
// Types
// ============================================================================

/** Represents a Boltcard as returned by the store */
interface BoltcardCard {
  id: string
  cardUid: string
  cardIdHash: string
  name: string | null
  ownerPubkey: string
  walletId: string
  walletCurrency: string
  version: number
  lastCounter: number
  balance: number
  maxTxAmount: number | null
  dailyLimit: number | null
  dailySpent: number
  dailyResetAt: number | null
  status: string
  createdAt: number
  activatedAt: number | null
  lastUsedAt: number | null
  disabledAt: number | null
  environment: string
  // Keys (only present when includeKeys=true)
  apiKey?: string
  k0?: string
  k1?: string
  k2?: string
  k3?: string
  k4?: string
}

interface CardKeys {
  k0: string
  k1: string
  k2: string
  k3: string
  k4: string
}

interface CreateCardParams {
  cardUid: string
  ownerPubkey: string
  walletId: string
  apiKey: string
}

interface CreateCardOptions {
  name?: string
  walletCurrency?: string
  maxTxAmount?: number
  dailyLimit?: number
  initialBalance?: number
  environment?: string
}

interface CreateCardResult extends BoltcardCard {
  keys: CardKeys
}

interface CreatePendingParams {
  ownerPubkey: string
  walletId: string
  apiKey: string
}

interface PendingRegistration {
  id: string
  ownerPubkey: string
  walletId: string
  apiKey: string
  [key: string]: unknown
}

interface CreatePendingResult {
  pendingRegistration: PendingRegistration
  deeplink: string
  keysRequestUrl: string
  qrPayload: string
}

interface ProgrammingQR {
  keysJson: string
  keys: KeysResponse
}

interface CardQR {
  url: string
  lnurl: string
}

interface GenerateCardQRsResult {
  programming: ProgrammingQR
  topUp: ReturnType<typeof lnurlp.generateTopUpQR>
  card: CardQR
}

interface VerifyResult {
  valid: boolean
  error?: string
  counter?: number
  cardUid?: string
}

interface VerifyCardTapResult {
  valid: boolean
  error?: string
  cardUid?: string
  counter?: number
  balance?: number
  maxWithdrawable?: number
  walletCurrency?: string
}

// ============================================================================
// High-Level Helpers
// ============================================================================

/**
 * Create and register a new Boltcard (high-level helper)
 * Uses spec-compliant key derivation from user's IssuerKey
 *
 * @param params - Card parameters
 * @param options - Optional settings
 * @returns Created card with keys
 */
async function createCard(
  params: CreateCardParams,
  options: CreateCardOptions = {},
): Promise<CreateCardResult> {
  const { cardUid, ownerPubkey, walletId, apiKey } = params

  // Create card in database (keys derived automatically from IssuerKey)
  const card = (await store.createCard(
    {
      cardUid,
      ownerPubkey,
      walletId,
      apiKey,
    },
    options,
  )) as BoltcardCard

  // Return card with keys for programming
  const cardWithKeys = (await store.getCard(card.id, true)) as BoltcardCard

  return {
    ...cardWithKeys,
    keys: {
      k0: cardWithKeys.k0 as string,
      k1: cardWithKeys.k1 as string,
      k2: cardWithKeys.k2 as string,
      k3: cardWithKeys.k3 as string,
      k4: cardWithKeys.k4 as string,
    },
  }
}

/**
 * Create a pending registration for deeplink flow
 * Used when card UID is not known until NFC Programmer scans the card
 *
 * @param params - Registration parameters
 * @param options - Optional settings
 * @param serverUrl - Server URL for generating deeplink
 * @returns { pendingRegistration, deeplink, keysRequestUrl }
 */
async function createPendingRegistration(
  params: CreatePendingParams,
  options: CreateCardOptions = {},
  serverUrl: string,
): Promise<CreatePendingResult> {
  const { ownerPubkey, walletId, apiKey } = params

  // Create pending registration
  const pending = (await store.createPendingRegistration(
    {
      ownerPubkey,
      walletId,
      apiKey,
    },
    options,
  )) as unknown as PendingRegistration

  // Generate deeplink
  const keysRequestUrl = `${serverUrl}/api/boltcard/keys/${pending.id}`
  const deeplink: string = crypto.generateProgramDeeplink(keysRequestUrl)

  return {
    pendingRegistration: pending,
    deeplink,
    keysRequestUrl,
    qrPayload: deeplink,
  }
}

/**
 * Generate QR code data for card programming
 * Returns data that can be scanned by the Bolt Card NFC Programmer app
 *
 * @param serverUrl - BlinkPOS server URL
 * @param cardId - Card ID
 * @param keys - Card keys (k0, k1, k2, k3, k4)
 * @returns { programming, topUp, card }
 */
function generateCardQRs(
  serverUrl: string,
  cardId: string,
  keys: CardKeys,
): GenerateCardQRsResult {
  // LNURL-withdraw URL for the card
  const lnurlwUrl = lnurlw.generateCardUrl(serverUrl, cardId)

  // Keys response for NFC programmer app
  const keysResponse: KeysResponse = crypto.generateKeysResponse(lnurlwUrl, keys)

  // QR for top-up (LNURL-pay)
  const topUpQR = lnurlp.generateTopUpQR(serverUrl, cardId)

  // LNURL-bech32 encoded
  const cardLnurl = lnurlw.generateCardLnurl(serverUrl, cardId)

  return {
    programming: {
      keysJson: JSON.stringify(keysResponse),
      keys: keysResponse,
    },
    topUp: topUpQR,
    card: {
      url: lnurlwUrl,
      lnurl: cardLnurl,
    },
  }
}

/**
 * Verify a card tap and return available withdrawal amount
 *
 * @param cardId - Card ID
 * @param piccData - PICCData from URL (p parameter)
 * @param sunMac - SunMAC from URL (c parameter)
 * @returns { valid, cardUid, counter, maxWithdrawable, error }
 */
async function verifyCardTap(
  cardId: string,
  piccData: string,
  sunMac: string,
): Promise<VerifyCardTapResult> {
  // Get card with keys
  const card = (await store.getCard(cardId, true)) as BoltcardCard | null

  if (!card) {
    return { valid: false, error: "Card not found" }
  }

  if (card.status !== CardStatus.ACTIVE) {
    return { valid: false, error: `Card is ${card.status.toLowerCase()}` }
  }

  // Verify cryptographic authentication
  const verifyResult: VerifyResult = crypto.verifyCardTap(
    piccData,
    sunMac,
    card.k1 as string,
    card.k2 as string,
    card.cardUid,
    card.lastCounter,
  )

  if (!verifyResult.valid) {
    return verifyResult
  }

  // Update counter
  await store.updateLastCounter(cardId, verifyResult.counter as number)

  // Calculate available amount
  let maxWithdrawable = card.balance

  if (card.maxTxAmount && card.maxTxAmount < maxWithdrawable) {
    maxWithdrawable = card.maxTxAmount
  }

  if (card.dailyLimit) {
    const remainingDaily = card.dailyLimit - card.dailySpent
    if (remainingDaily < maxWithdrawable) {
      maxWithdrawable = remainingDaily
    }
  }

  return {
    valid: true,
    cardUid: verifyResult.cardUid,
    counter: verifyResult.counter,
    balance: card.balance,
    maxWithdrawable: Math.max(0, maxWithdrawable),
    walletCurrency: card.walletCurrency,
  }
}

/**
 * Validate the crypto implementation against spec test vectors
 * Call this during startup or tests to ensure correctness
 *
 * @returns True if all test vectors pass
 */
function validateCrypto(): boolean {
  return crypto.validateTestVectors() as boolean
}

// ============================================================================
// Exports
// ============================================================================

export {
  // High-level helpers
  createCard,
  createPendingRegistration,
  generateCardQRs,
  verifyCardTap,
  validateCrypto,

  // Sub-modules
  store,
  crypto,
  lnurlw,
  lnurlp,

  // Constants
  CardStatus,
  TxType,
  PendingStatus,
  KeySlot,
  PICCDATA_TAG_BOLTCARD,
  TopUpLimits,
}

export type {
  BoltcardCard,
  CardKeys,
  CreateCardParams,
  CreateCardOptions,
  CreateCardResult,
  CreatePendingParams,
  PendingRegistration,
  CreatePendingResult,
  GenerateCardQRsResult,
  VerifyCardTapResult,
}
