// Simple persistent store for tip metadata
// Uses file storage to survive development recompilations
import fs from "fs"
import path from "path"

const STORE_FILE: string = path.join(process.cwd(), ".tip-store.json")

interface TipData {
  tipAmount?: number
  tipRecipient?: string
  timestamp: number
  [key: string]: unknown
}

interface TipStoreStats {
  totalEntries: number
  entries: Array<{ hash: string; tipAmount?: number; tipRecipient?: string; age: string }>
}

class TipStore {
  tipData: Map<string, TipData>

  constructor() {
    this.tipData = new Map<string, TipData>()
    this.loadFromFile()
    // Clean up old entries periodically (24 hours)
    setInterval(() => this.cleanup(), 24 * 60 * 60 * 1000)
  }

  // Load data from file
  loadFromFile(): void {
    try {
      if (fs.existsSync(STORE_FILE)) {
        const data: Record<string, TipData> = JSON.parse(
          fs.readFileSync(STORE_FILE, "utf8"),
        ) as Record<string, TipData>
        this.tipData = new Map<string, TipData>(Object.entries(data))
        console.log("📂 Loaded tip store from file:", this.tipData.size, "entries")
      }
    } catch (err: unknown) {
      console.error("❌ Error loading tip store:", err)
      this.tipData = new Map<string, TipData>()
    }
  }

  // Save data to file
  saveToFile(): void {
    try {
      const data: Record<string, TipData> = Object.fromEntries(this.tipData)
      fs.writeFileSync(STORE_FILE, JSON.stringify(data, null, 2))
    } catch (err: unknown) {
      console.error("❌ Error saving tip store:", err)
    }
  }

  // Store tip metadata for an invoice
  storeTipData(paymentHash: string, tipData: Omit<TipData, "timestamp">): void {
    this.tipData.set(paymentHash, {
      ...tipData,
      timestamp: Date.now(),
    })
    this.saveToFile() // Persist to file
    console.log(`💾 Stored tip data for payment: ${paymentHash}`)
  }

  // Retrieve tip metadata for an invoice
  getTipData(paymentHash: string): TipData | undefined {
    const data: TipData | undefined = this.tipData.get(paymentHash)
    if (data) {
      console.log(`📋 Retrieved tip data for payment: ${paymentHash}`)
    } else {
      console.log(`❌ No tip data found for payment hash: ${paymentHash}`)
    }
    return data
  }

  // Remove tip metadata (after processing)
  removeTipData(paymentHash: string): boolean {
    const removed: boolean = this.tipData.delete(paymentHash)
    if (removed) {
      this.saveToFile() // Persist to file
      console.log("🗑️ Removed tip data for payment:", paymentHash)
    }
    return removed
  }

  // Clean up old entries
  cleanup(): void {
    const now: number = Date.now()
    const oneDay: number = 24 * 60 * 60 * 1000

    for (const [hash, data] of this.tipData.entries()) {
      if (now - data.timestamp > oneDay) {
        this.tipData.delete(hash)
        console.log("🧹 Cleaned up old tip data:", hash)
      }
    }
  }

  // Get store stats
  getStats(): TipStoreStats {
    return {
      totalEntries: this.tipData.size,
      entries: Array.from(this.tipData.entries()).map(
        ([hash, data]: [string, TipData]) => ({
          hash: hash.substring(0, 8) + "...",
          tipAmount: data.tipAmount,
          tipRecipient: data.tipRecipient,
          age: Math.round((Date.now() - data.timestamp) / 1000 / 60) + " minutes",
        }),
      ),
    }
  }
}

// Export singleton instance
const tipStore: TipStore = new TipStore()
export default tipStore
export { TipStore }
