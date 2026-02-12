import type { NextApiRequest, NextApiResponse } from "next"

const AuthManager = require("../../../lib/auth")
const StorageManager = require("../../../lib/storage")
const BlinkAPI = require("../../../lib/blink-api")
const { getApiUrlForEnvironment } = require("../../../lib/config/api")

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" })
  }

  try {
    // Verify authentication
    const token = req.cookies["auth-token"]
    const session = AuthManager.verifySession(token)

    if (!session) {
      return res.status(401).json({ error: "Unauthorized" })
    }

    // Get environment from query parameter (client passes it)
    const environment = req.query.environment === "staging" ? "staging" : "production"
    const apiUrl = getApiUrlForEnvironment(environment)

    // Get user's API key
    const userData = await StorageManager.loadUserData(session.username)
    if (!userData?.apiKey) {
      return res.status(400).json({ error: "No API key found" })
    }

    // Create Blink API instance with environment-specific URL
    const blink = new BlinkAPI(userData.apiKey, apiUrl)

    // Get balance
    const wallets = await blink.getBalance()

    // Format response
    const formattedWallets = wallets.map(
      (wallet: { id: string; walletCurrency: string; balance: number }) => ({
        id: wallet.id,
        currency: wallet.walletCurrency,
        balance: wallet.balance,
        formattedBalance: BlinkAPI.formatAmount(wallet.balance, wallet.walletCurrency),
      }),
    )

    res.status(200).json({
      success: true,
      wallets: formattedWallets,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error"
    console.error("Balance API error:", error)
    res.status(500).json({
      error: "Failed to fetch balance",
      details: message,
    })
  }
}
