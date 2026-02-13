import crypto from "crypto"
import fs from "fs/promises"
import path from "path"

import AuthManager from "./auth"

interface UserData {
  apiKey?: string | null
  lastUpdated?: number
  [key: string]: unknown
}

class StorageManager {
  storageDir: string

  constructor() {
    this.storageDir = path.join(process.cwd(), ".data")
    this.ensureDataDir()
  }

  async ensureDataDir(): Promise<void> {
    try {
      await fs.mkdir(this.storageDir, { recursive: true })
    } catch (err: unknown) {
      console.error("Failed to create data directory:", err)
    }
  }

  // Get user-specific storage path
  getUserStoragePath(userId: string): string {
    const hashedId: string = crypto
      .createHash("sha256")
      .update(userId)
      .digest("hex")
      .substring(0, 16)

    return path.join(this.storageDir, `user_${hashedId}.json`)
  }

  // Save user data (API keys, preferences)
  async saveUserData(userId: string, data: UserData): Promise<boolean> {
    try {
      console.log("[StorageManager] Saving data for user:", userId)
      const filePath: string = this.getUserStoragePath(userId)
      console.log("[StorageManager] File path:", filePath)

      const encryptedData: UserData = {
        ...data,
        apiKey: data.apiKey ? AuthManager.encryptApiKey(data.apiKey) : null,
        lastUpdated: Date.now(),
      }

      console.log("[StorageManager] Writing file...")
      await fs.writeFile(filePath, JSON.stringify(encryptedData, null, 2))
      console.log("[StorageManager] ✓ File written successfully")
      return true
    } catch (err: unknown) {
      console.error("[StorageManager] Failed to save user data:", err)
      return false
    }
  }

  // Load user data
  async loadUserData(userId: string): Promise<UserData | null> {
    try {
      const filePath: string = this.getUserStoragePath(userId)
      const fileContent: string = await fs.readFile(filePath, "utf8")
      const data: UserData = JSON.parse(fileContent) as UserData

      // Decrypt API key
      if (data.apiKey) {
        data.apiKey = AuthManager.decryptApiKey(data.apiKey)
      }

      return data
    } catch (_err: unknown) {
      // File doesn't exist or other error
      return null
    }
  }

  // Delete user data
  async deleteUserData(userId: string): Promise<boolean> {
    try {
      const filePath: string = this.getUserStoragePath(userId)
      await fs.unlink(filePath)
      return true
    } catch (_err: unknown) {
      return false
    }
  }

  // List all users (for admin purposes)
  async listUsers(): Promise<string[]> {
    try {
      const files: string[] = await fs.readdir(this.storageDir)
      return files
        .filter((file: string) => file.startsWith("user_") && file.endsWith(".json"))
        .map((file: string) => file.replace("user_", "").replace(".json", ""))
    } catch (_err: unknown) {
      return []
    }
  }
}

export default new StorageManager()
export { StorageManager }
