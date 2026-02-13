import type { NextApiRequest, NextApiResponse } from "next"

import BlinkAPI from "../../../lib/blink-api"
import { getApiUrlForEnvironment, type EnvironmentName } from "../../../lib/config/api"
import AuthManager from "../../../lib/auth"
import { getHybridStore } from "../../../lib/storage/hybrid-store"
import { withRateLimit, RATE_LIMIT_WRITE } from "../../../lib/rate-limit"

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" })
  }

  try {
    const {
      amount,
      currency,
      memo,
      walletId,
      apiKey,
      userWalletId,
      displayCurrency,
      baseAmount,
      tipAmount,
      tipPercent,
      tipRecipients = [],
      baseAmountDisplay,
      tipAmountDisplay,
      nwcActive,
      nwcConnectionUri, // NWC connection string for server-side forwarding
      // Blink Lightning Address wallet fields (no API key required)
      blinkLnAddress,
      blinkLnAddressWalletId,
      blinkLnAddressUsername,
      // npub.cash wallet fields (intraledger via LNURL-pay)
      npubCashActive,
      npubCashLightningAddress,
      // Environment for staging/production switching
      environment = "production",
    } = req.body as {
      amount: string | number
      currency: string
      memo?: string
      walletId?: string
      apiKey?: string
      userWalletId?: string
      displayCurrency?: string
      baseAmount?: number
      tipAmount?: number
      tipPercent?: number
      tipRecipients?: Array<{ username: string; share?: number }>
      baseAmountDisplay?: number
      tipAmountDisplay?: number
      nwcActive?: boolean
      nwcConnectionUri?: string
      blinkLnAddress?: boolean
      blinkLnAddressWalletId?: string
      blinkLnAddressUsername?: string
      npubCashActive?: boolean
      npubCashLightningAddress?: string
      environment?: EnvironmentName
    }

    // Get the API URL for the specified environment
    const apiUrl = getApiUrlForEnvironment(environment)

    console.log("📥 Create invoice request received:", {
      amount,
      currency,
      displayCurrency,
      tipAmount,
      tipRecipients: tipRecipients?.length || 0,
      hasBaseAmountDisplay: !!baseAmountDisplay,
      hasTipAmountDisplay: !!tipAmountDisplay,
      nwcActive: !!nwcActive,
      hasNwcConnectionUri: !!nwcConnectionUri,
      hasApiKey: !!apiKey,
      blinkLnAddress: !!blinkLnAddress,
      blinkLnAddressUsername,
      npubCashActive: !!npubCashActive,
      npubCashLightningAddress: npubCashLightningAddress || undefined,
      environment,
      apiUrl,
    })

    // Validate required fields
    // For NWC-only, LN Address, or npub.cash users, apiKey is not required
    if (!amount || !currency) {
      return res.status(400).json({
        error: "Missing required fields: amount, currency",
      })
    }

    // Either apiKey OR nwcActive OR blinkLnAddress OR npubCashActive must be present for payment forwarding
    if (!apiKey && !nwcActive && !blinkLnAddress && !npubCashActive) {
      return res.status(400).json({
        error:
          "Missing payment forwarding: either apiKey, nwcActive, blinkLnAddress, or npubCashAddress required",
      })
    }

    // Get BlinkPOS credentials from environment (staging or production)
    const isStaging = environment === "staging"
    const blinkposApiKey = isStaging
      ? process.env.BLINKPOS_STAGING_API_KEY
      : process.env.BLINKPOS_API_KEY
    const blinkposBtcWalletId = isStaging
      ? process.env.BLINKPOS_STAGING_BTC_WALLET_ID
      : process.env.BLINKPOS_BTC_WALLET_ID

    console.log("🔐 BlinkPOS credentials check:", {
      environment,
      isStaging,
      hasApiKey: !!blinkposApiKey,
      apiKeyLength: blinkposApiKey ? blinkposApiKey.length : 0,
      hasWalletId: !!blinkposBtcWalletId,
      walletIdLength: blinkposBtcWalletId ? blinkposBtcWalletId.length : 0,
    })

    if (!blinkposApiKey || !blinkposBtcWalletId) {
      console.error("Missing BlinkPOS environment variables")
      return res.status(500).json({
        error: "BlinkPOS configuration missing",
      })
    }

    // Validate amount
    const numericAmount = parseFloat(String(amount))
    if (isNaN(numericAmount) || numericAmount <= 0) {
      return res.status(400).json({
        error: "Invalid amount: must be a positive number",
      })
    }

    console.log("Creating invoice with BlinkPOS credentials:", {
      amount: numericAmount,
      currency,
      blinkposWallet: blinkposBtcWalletId,
      userWallet: userWalletId,
      hasTip: (tipAmount ?? 0) > 0,
      tipRecipientsCount: tipRecipients?.length || 0,
      blinkLnAddress: !!blinkLnAddress,
      blinkLnAddressUsername,
      npubCashActive: !!npubCashActive,
      npubCashLightningAddress: npubCashLightningAddress || undefined,
    })

    // Always use BlinkPOS API and BTC wallet for invoice creation
    // Pass the environment-specific API URL
    const blinkAPI = new BlinkAPI(blinkposApiKey, apiUrl)

    let invoice

    try {
      // Always create BTC invoice from BlinkPOS wallet (even for USD payments)
      if (currency === "BTC" || currency === "USD") {
        invoice = await blinkAPI.createLnInvoice(
          blinkposBtcWalletId,
          Math.round(numericAmount),
          memo,
        )
      } else {
        return res.status(400).json({
          error: "Unsupported currency. Only BTC is supported through BlinkPOS.",
        })
      }

      if (!invoice) {
        throw new Error("Failed to create invoice")
      }

      // Store payment metadata (using hybrid storage)
      // ALWAYS store forwarding data so webhook-based forwarding can work even if client disconnects
      // This enables reliable payment forwarding regardless of client connection state
      const hasForwardingDestination =
        apiKey || nwcActive || blinkLnAddress || npubCashActive
      const hasTips = (tipAmount ?? 0) > 0 && tipRecipients && tipRecipients.length > 0
      const shouldStorePaymentData = hasForwardingDestination || hasTips

      if (shouldStorePaymentData) {
        const hybridStore = await getHybridStore()

        // Encrypt NWC URI if present (contains sensitive private key)
        const encryptedNwcUri = nwcConnectionUri
          ? AuthManager.encryptApiKey(nwcConnectionUri)
          : null

        await hybridStore.storeTipData(invoice.paymentHash, {
          baseAmount: baseAmount || numericAmount,
          tipAmount: tipAmount || 0,
          tipPercent: tipPercent || 0,
          tipRecipients: (tipRecipients || []).map((r) => ({
            username: r.username,
            share: r.share ?? 100,
          })),
          userApiKey: apiKey || undefined, // May be undefined for NWC-only, LN Address, or npub.cash users
          userWalletId: userWalletId || walletId || undefined, // May be undefined for NWC-only, LN Address, or npub.cash users
          displayCurrency: displayCurrency || "BTC", // Store display currency for tip memo
          baseAmountDisplay:
            baseAmountDisplay != null ? String(baseAmountDisplay) : undefined,
          tipAmountDisplay:
            tipAmountDisplay != null ? String(tipAmountDisplay) : undefined,
          memo: memo,
          nwcActive: !!nwcActive, // Flag for NWC forwarding
          nwcConnectionUri: encryptedNwcUri, // Encrypted NWC connection string for server-side forwarding
          // Lightning Address wallet info
          blinkLnAddress: !!blinkLnAddress,
          blinkLnAddressWalletId: blinkLnAddressWalletId || null,
          blinkLnAddressUsername: blinkLnAddressUsername || null,
          // npub.cash wallet info (intraledger via LNURL-pay)
          npubCashActive: !!npubCashActive,
          npubCashLightningAddress: npubCashLightningAddress || null,
          // Environment for staging/production (used by webhook forwarding)
          environment: environment || "production",
          // Metadata for webhook processing
          createdAt: Date.now(),
          forwardingType: blinkLnAddress
            ? "ln_address"
            : npubCashActive
              ? "npub_cash"
              : nwcActive
                ? "nwc"
                : apiKey
                  ? "api_key"
                  : "unknown",
        })
        console.log(
          `✅ Stored forwarding data for ${invoice.paymentHash?.substring(0, 16)}... (type: ${blinkLnAddress ? "ln_address" : npubCashActive ? "npub_cash" : nwcActive ? "nwc" : "api_key"}, hasTip: ${(tipAmount ?? 0) > 0}, hasNwcUri: ${!!encryptedNwcUri})`,
        )
      }

      // Return invoice details with additional metadata for payment forwarding
      res.status(200).json({
        success: true,
        invoice: {
          paymentRequest: invoice.paymentRequest,
          paymentHash: invoice.paymentHash,
          satoshis: invoice.satoshis,
          amount: numericAmount,
          currency: currency,
          memo: memo || "",
          walletId: blinkposBtcWalletId, // This is now the BlinkPOS wallet
          userApiKey: apiKey || null, // May be null for NWC-only, LN Address, or npub.cash users
          userWalletId: userWalletId || walletId || null, // May be null for NWC-only, LN Address, or npub.cash users
          hasTip: (tipAmount ?? 0) > 0,
          tipAmount: tipAmount || 0,
          tipRecipients: tipRecipients || [],
          nwcActive: !!nwcActive, // Flag for NWC forwarding
          // Lightning Address wallet info
          blinkLnAddress: !!blinkLnAddress,
          blinkLnAddressWalletId: blinkLnAddressWalletId || null,
          blinkLnAddressUsername: blinkLnAddressUsername || null,
          // npub.cash wallet info
          npubCashActive: !!npubCashActive,
          npubCashLightningAddress: npubCashLightningAddress || null,
        },
      })
    } catch (blinkError: unknown) {
      const blinkMessage =
        blinkError instanceof Error ? blinkError.message : "Unknown error"
      console.error("Blink API error:", blinkError)

      // Handle specific Blink API errors
      let errorMessage = "Failed to create invoice"
      if (blinkMessage.includes("amount")) {
        errorMessage = "Invalid amount for invoice creation"
      } else if (blinkMessage.includes("wallet")) {
        errorMessage = "Invalid wallet selected"
      } else if (blinkMessage.includes("balance")) {
        errorMessage = "Insufficient balance or wallet issue"
      }

      return res.status(400).json({
        error: errorMessage,
        details: blinkMessage,
      })
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error"
    console.error("Invoice creation error:", error)
    res.status(500).json({
      error: "Internal server error",
      details: process.env.NODE_ENV === "development" ? message : undefined,
    })
  }
}

export default withRateLimit(handler, RATE_LIMIT_WRITE)
