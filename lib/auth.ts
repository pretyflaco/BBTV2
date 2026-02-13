import crypto from "crypto"

import CryptoJS from "crypto-js"
import jwt from "jsonwebtoken"

import { getApiUrl } from "./config/api"

const JWT_SECRET: string = (() => {
  const secret = process.env.JWT_SECRET
  if (!secret) {
    throw new Error("JWT_SECRET environment variable is required")
  }
  return secret
})()

interface SessionPayload {
  username: string
  id: string
  created: number
}

interface BlinkApiResponse {
  errors?: unknown[]
  data?: {
    me?: {
      id?: string
      username?: string
    }
  }
}

// Helper to get encryption key at runtime (not captured at module load time)
function getEncryptionKey(): string {
  const key = process.env.ENCRYPTION_KEY
  if (!key) {
    throw new Error("ENCRYPTION_KEY environment variable is required")
  }
  return key
}

class AuthManager {
  // Generate secure user session
  static generateSession(username: string): string {
    const payload: SessionPayload = {
      username,
      id: crypto.randomUUID(),
      created: Date.now(),
    }

    return jwt.sign(payload, JWT_SECRET, { expiresIn: "24h" })
  }

  // Verify user session
  static verifySession(token: string | undefined): SessionPayload | null {
    if (!token) return null
    try {
      return jwt.verify(token, JWT_SECRET) as SessionPayload
    } catch (_err: unknown) {
      return null
    }
  }

  // Encrypt API key for storage
  static encryptApiKey(apiKey: string): string {
    const key: string = getEncryptionKey()
    return CryptoJS.AES.encrypt(apiKey, key).toString()
  }

  // Decrypt API key for use
  static decryptApiKey(encryptedKey: string): string | null {
    try {
      const key: string = getEncryptionKey()
      const bytes: CryptoJS.lib.WordArray = CryptoJS.AES.decrypt(encryptedKey, key)
      const decrypted: string = bytes.toString(CryptoJS.enc.Utf8)
      return decrypted || null
    } catch (_err: unknown) {
      return null
    }
  }

  // Validate Blink API key
  static async validateBlinkApiKey(apiKey: string): Promise<boolean> {
    try {
      const response: Response = await fetch(getApiUrl(), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-KEY": apiKey,
        },
        body: JSON.stringify({
          query: "query { me { id username } }",
        }),
      })

      const data: BlinkApiResponse = await response.json()
      return !data.errors && !!data.data?.me?.id
    } catch (err: unknown) {
      console.error("API validation error:", err)
      return false
    }
  }
}

export default AuthManager
