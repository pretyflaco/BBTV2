#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports */

/**
 * Migration script: File-based tip store → Hybrid Redis + PostgreSQL storage
 *
 * This script migrates existing tip data from the file-based .tip-store.json
 * to the new hybrid storage system.
 *
 * Usage:
 *   node scripts/migrate-to-hybrid.js [--dry-run] [--backup]
 *
 * Options:
 *   --dry-run: Preview migration without making changes
 *   --backup: Create backup of tip store file before migration
 */

const fs = require("fs")
const path = require("path")

const { HybridStore } = require("../lib/storage/hybrid-store")

// Configuration
const STORE_FILE = path.join(process.cwd(), ".tip-store.json")
const BACKUP_DIR = path.join(process.cwd(), "backups")

// Parse command line arguments
const args = process.argv.slice(2)
const isDryRun = args.includes("--dry-run")
const shouldBackup = args.includes("--backup")

/**
 * Load data from file-based tip store
 */
function loadFileStore() {
  if (!fs.existsSync(STORE_FILE)) {
    console.log("ℹ️  No .tip-store.json file found. Nothing to migrate.")
    return null
  }

  try {
    const data = fs.readFileSync(STORE_FILE, "utf8")
    const parsed = JSON.parse(data)

    console.log(`✅ Loaded ${Object.keys(parsed).length} records from file store`)
    return parsed
  } catch (error) {
    console.error("❌ Failed to load file store:", error.message)
    throw error
  }
}

/**
 * Create backup of tip store file
 */
function createBackup() {
  if (!fs.existsSync(STORE_FILE)) {
    console.log("ℹ️  No file to backup")
    return null
  }

  // Create backup directory if it doesn't exist
  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true })
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-")
  const backupFile = path.join(BACKUP_DIR, `.tip-store.json.backup.${timestamp}`)

  try {
    fs.copyFileSync(STORE_FILE, backupFile)
    console.log(`✅ Created backup: ${backupFile}`)
    return backupFile
  } catch (error) {
    console.error("❌ Failed to create backup:", error.message)
    throw error
  }
}

/**
 * Transform file store data to hybrid store format
 */
function transformRecord(paymentHash, record) {
  // File store format:
  // {
  //   baseAmount: number,
  //   tipAmount: number,
  //   tipPercent: number,
  //   tipRecipient: string,
  //   userApiKey: string,
  //   userWalletId: string,
  //   displayCurrency: string,
  //   baseAmountDisplay: number,
  //   tipAmountDisplay: number,
  //   timestamp: number
  // }

  return {
    paymentHash,
    baseAmount: record.baseAmount || 0,
    tipAmount: record.tipAmount || 0,
    tipPercent: record.tipPercent || 0,
    tipRecipient: record.tipRecipient || null,
    userApiKey: record.userApiKey,
    userWalletId: record.userWalletId,
    displayCurrency: record.displayCurrency || "BTC",
    baseAmountDisplay: record.baseAmountDisplay || null,
    tipAmountDisplay: record.tipAmountDisplay || null,
    memo: record.memo || null,
  }
}

/**
 * Migrate records to hybrid storage
 */
async function migrateRecords(fileData, hybridStore) {
  const paymentHashes = Object.keys(fileData)
  let successCount = 0
  let skipCount = 0
  let errorCount = 0

  console.log(`\n🔄 Migrating ${paymentHashes.length} records...`)
  console.log("─".repeat(60))

  for (const paymentHash of paymentHashes) {
    const record = fileData[paymentHash]

    try {
      // Check if record already exists
      const existing = await hybridStore.getTipData(paymentHash)

      if (existing) {
        console.log(`⏭️  Skipped ${paymentHash.substring(0, 16)}... (already exists)`)
        skipCount++
        continue
      }

      // Transform and store
      const transformed = transformRecord(paymentHash, record)

      if (isDryRun) {
        console.log(`[DRY RUN] Would migrate: ${paymentHash.substring(0, 16)}...`)
        successCount++
      } else {
        await hybridStore.storeTipData(paymentHash, transformed)
        console.log(`✅ Migrated ${paymentHash.substring(0, 16)}...`)
        successCount++
      }
    } catch (error) {
      console.error(
        `❌ Failed to migrate ${paymentHash.substring(0, 16)}...:`,
        error.message,
      )
      errorCount++
    }
  }

  console.log("─".repeat(60))
  console.log("\n📊 Migration Summary:")
  console.log(`   ✅ Successfully migrated: ${successCount}`)
  console.log(`   ⏭️  Skipped (already exist): ${skipCount}`)
  console.log(`   ❌ Failed: ${errorCount}`)
  console.log(`   📦 Total records: ${paymentHashes.length}`)

  return { successCount, skipCount, errorCount }
}

/**
 * Main migration function
 */
async function main() {
  console.log("\n🚀 BlinkPOS: File Store → Hybrid Storage Migration")
  console.log("═".repeat(60))

  if (isDryRun) {
    console.log("🔍 DRY RUN MODE: No changes will be made\n")
  }

  // Step 1: Create backup if requested
  if (shouldBackup && !isDryRun) {
    console.log("\n📦 Creating backup...")
    createBackup()
  }

  // Step 2: Load file store data
  console.log("\n📂 Loading file store data...")
  const fileData = loadFileStore()

  if (!fileData || Object.keys(fileData).length === 0) {
    console.log("✨ Nothing to migrate. Exiting.")
    process.exit(0)
  }

  // Step 3: Initialize hybrid storage
  console.log("\n🔌 Connecting to hybrid storage...")
  const hybridStore = new HybridStore()

  try {
    await hybridStore.connect()
    console.log("✅ Connected to hybrid storage")
  } catch (error) {
    console.error("❌ Failed to connect to hybrid storage:", error.message)
    console.error("\nMake sure Docker containers are running:")
    console.error("  docker-compose up -d")
    process.exit(1)
  }

  // Step 4: Verify connection health
  console.log("\n🏥 Checking storage health...")
  const health = await hybridStore.healthCheck()
  console.log(`   Redis: ${health.redis ? "✅" : "⚠️  (optional)"}`)
  console.log(`   PostgreSQL: ${health.postgres ? "✅" : "❌"}`)
  console.log(`   Overall: ${health.overall ? "✅" : "❌"}`)

  if (!health.overall) {
    console.error("\n❌ Storage health check failed. Exiting.")
    await hybridStore.disconnect()
    process.exit(1)
  }

  // Step 5: Migrate records
  const result = await migrateRecords(fileData, hybridStore)

  // Step 6: Clean up
  console.log("\n🔌 Disconnecting from storage...")
  await hybridStore.disconnect()

  // Step 7: Archive old file (if not dry run and migration succeeded)
  if (!isDryRun && result.errorCount === 0) {
    console.log("\n📁 Archiving old tip store file...")
    const archivePath = `${STORE_FILE}.migrated`
    fs.renameSync(STORE_FILE, archivePath)
    console.log(`✅ Archived to: ${archivePath}`)
    console.log("ℹ️  You can safely delete this file after verifying the migration.")
  }

  // Final summary
  console.log("\n═".repeat(60))
  if (isDryRun) {
    console.log("✨ Dry run completed. Run without --dry-run to perform migration.")
  } else if (result.errorCount === 0) {
    console.log("✅ Migration completed successfully!")
  } else {
    console.log("⚠️  Migration completed with errors. Please review the logs.")
  }
  console.log("═".repeat(60) + "\n")

  process.exit(result.errorCount > 0 ? 1 : 0)
}

// Run migration
main().catch((error) => {
  console.error("\n❌ Migration failed:", error)
  process.exit(1)
})
