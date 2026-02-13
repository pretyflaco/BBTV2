#!/usr/bin/env node
/**
 * Migration Script: Re-encrypt User Data
 *
 * This script re-encrypts sensitive user data (API keys, NWC URIs) from the old
 * encryption key to the new production encryption key.
 *
 * Affected data:
 * - voucherWallet.apiKey
 * - blinkApiAccounts[].apiKey
 * - nwcConnections[].uri
 *
 * Usage:
 *   OLD_KEY="old-key" NEW_KEY="new-key" node scripts/reencrypt-user-data.js
 *
 * Or with environment variables:
 *   OLD_ENCRYPTION_KEY="old-key" ENCRYPTION_KEY="new-key" node scripts/reencrypt-user-data.js
 *
 * Dry run (default):
 *   node scripts/reencrypt-user-data.js
 *
 * Actually apply changes:
 *   APPLY=true node scripts/reencrypt-user-data.js
 */

const fs = require("fs")
const path = require("path")
const CryptoJS = require("crypto-js")

// Configuration — both keys MUST be provided explicitly via environment variables.
// Never fall back to hardcoded defaults for encryption keys.
const OLD_KEY = process.env.OLD_KEY || process.env.OLD_ENCRYPTION_KEY
const NEW_KEY = process.env.NEW_KEY || process.env.ENCRYPTION_KEY
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "..", ".data")
const DRY_RUN = process.env.APPLY !== "true"

if (!OLD_KEY) {
  console.error("ERROR: OLD_KEY or OLD_ENCRYPTION_KEY environment variable must be set")
  process.exit(1)
}
if (!NEW_KEY) {
  console.error("ERROR: NEW_KEY or ENCRYPTION_KEY environment variable must be set")
  process.exit(1)
}
if (OLD_KEY === NEW_KEY) {
  console.error("ERROR: OLD_KEY and NEW_KEY must be different")
  process.exit(1)
}

console.log("=".repeat(60))
console.log("User Data Re-encryption Migration")
console.log("=".repeat(60))
console.log(`Data directory: ${DATA_DIR}`)
console.log(`Old key: ${OLD_KEY.substring(0, 10)}...`)
console.log(`New key: ${NEW_KEY.substring(0, 10)}...`)
console.log(`Mode: ${DRY_RUN ? "DRY RUN (no changes)" : "APPLYING CHANGES"}`)
console.log("=".repeat(60))

// Encryption helpers
function decrypt(encrypted, key) {
  if (!encrypted) return null
  try {
    const bytes = CryptoJS.AES.decrypt(encrypted, key)
    const result = bytes.toString(CryptoJS.enc.Utf8)
    return result || null
  } catch (error) {
    return null
  }
}

function encrypt(plaintext, key) {
  if (!plaintext) return null
  return CryptoJS.AES.encrypt(plaintext, key).toString()
}

// Stats tracking
const stats = {
  filesScanned: 0,
  filesModified: 0,
  voucherWalletsFixed: 0,
  blinkApiAccountsFixed: 0,
  nwcConnectionsFixed: 0,
  errors: [],
  skipped: [],
}

// Process a single user file
function processUserFile(filePath) {
  const fileName = path.basename(filePath)
  stats.filesScanned++

  let data
  try {
    const content = fs.readFileSync(filePath, "utf8")
    data = JSON.parse(content)
  } catch (error) {
    stats.errors.push({ file: fileName, error: `Failed to read/parse: ${error.message}` })
    return
  }

  let modified = false
  const changes = []

  // 1. Re-encrypt voucherWallet.apiKey
  if (data.voucherWallet?.apiKey) {
    const encryptedKey = data.voucherWallet.apiKey

    // Try to decrypt with old key
    const decrypted = decrypt(encryptedKey, OLD_KEY)

    if (decrypted) {
      // Successfully decrypted with old key - re-encrypt with new key
      const newEncrypted = encrypt(decrypted, NEW_KEY)

      // Verify the new encryption works
      const verifyDecrypt = decrypt(newEncrypted, NEW_KEY)
      if (verifyDecrypt === decrypted) {
        changes.push(`voucherWallet.apiKey: ${decrypted.substring(0, 20)}...`)
        data.voucherWallet.apiKey = newEncrypted
        stats.voucherWalletsFixed++
        modified = true
      } else {
        stats.errors.push({
          file: fileName,
          error: "voucherWallet: Re-encryption verification failed",
        })
      }
    } else {
      // Try decrypting with new key (already migrated?)
      const alreadyNew = decrypt(encryptedKey, NEW_KEY)
      if (alreadyNew) {
        stats.skipped.push({
          file: fileName,
          field: "voucherWallet",
          reason: "Already using new key",
        })
      } else {
        stats.errors.push({
          file: fileName,
          error: "voucherWallet: Cannot decrypt with either key",
        })
      }
    }
  }

  // 2. Re-encrypt blinkApiAccounts[].apiKey
  if (Array.isArray(data.blinkApiAccounts)) {
    data.blinkApiAccounts.forEach((account, idx) => {
      if (account.apiKey) {
        const decrypted = decrypt(account.apiKey, OLD_KEY)

        if (decrypted) {
          const newEncrypted = encrypt(decrypted, NEW_KEY)
          const verifyDecrypt = decrypt(newEncrypted, NEW_KEY)

          if (verifyDecrypt === decrypted) {
            changes.push(
              `blinkApiAccounts[${idx}].apiKey (${account.label || "unnamed"})`,
            )
            data.blinkApiAccounts[idx].apiKey = newEncrypted
            stats.blinkApiAccountsFixed++
            modified = true
          } else {
            stats.errors.push({
              file: fileName,
              error: `blinkApiAccounts[${idx}]: Re-encryption verification failed`,
            })
          }
        } else {
          const alreadyNew = decrypt(account.apiKey, NEW_KEY)
          if (alreadyNew) {
            stats.skipped.push({
              file: fileName,
              field: `blinkApiAccounts[${idx}]`,
              reason: "Already using new key",
            })
          } else {
            stats.errors.push({
              file: fileName,
              error: `blinkApiAccounts[${idx}]: Cannot decrypt with either key`,
            })
          }
        }
      }
    })
  }

  // 3. Re-encrypt nwcConnections[].uri
  if (Array.isArray(data.nwcConnections)) {
    data.nwcConnections.forEach((conn, idx) => {
      if (conn.uri) {
        const decrypted = decrypt(conn.uri, OLD_KEY)

        if (decrypted) {
          const newEncrypted = encrypt(decrypted, NEW_KEY)
          const verifyDecrypt = decrypt(newEncrypted, NEW_KEY)

          if (verifyDecrypt === decrypted) {
            changes.push(`nwcConnections[${idx}].uri (${conn.label || "unnamed"})`)
            data.nwcConnections[idx].uri = newEncrypted
            stats.nwcConnectionsFixed++
            modified = true
          } else {
            stats.errors.push({
              file: fileName,
              error: `nwcConnections[${idx}]: Re-encryption verification failed`,
            })
          }
        } else {
          const alreadyNew = decrypt(conn.uri, NEW_KEY)
          if (alreadyNew) {
            stats.skipped.push({
              file: fileName,
              field: `nwcConnections[${idx}]`,
              reason: "Already using new key",
            })
          } else {
            stats.errors.push({
              file: fileName,
              error: `nwcConnections[${idx}]: Cannot decrypt with either key`,
            })
          }
        }
      }
    })
  }

  // Save if modified
  if (modified) {
    console.log(`\n[${fileName}] Changes:`)
    changes.forEach((c) => console.log(`  - ${c}`))

    if (!DRY_RUN) {
      try {
        // Backup original
        const backupPath = filePath + ".backup"
        fs.copyFileSync(filePath, backupPath)

        // Write updated file
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2))
        console.log(`  ✓ Saved (backup: ${path.basename(backupPath)})`)
        stats.filesModified++
      } catch (error) {
        stats.errors.push({ file: fileName, error: `Failed to save: ${error.message}` })
      }
    } else {
      console.log(`  (dry run - not saved)`)
      stats.filesModified++
    }
  }
}

// Main execution
function main() {
  // Check if data directory exists
  if (!fs.existsSync(DATA_DIR)) {
    console.error(`ERROR: Data directory not found: ${DATA_DIR}`)
    process.exit(1)
  }

  // Find all user files
  const files = fs
    .readdirSync(DATA_DIR)
    .filter((f) => f.startsWith("user_") && f.endsWith(".json"))
    .map((f) => path.join(DATA_DIR, f))

  console.log(`\nFound ${files.length} user files to process\n`)

  // Process each file
  files.forEach(processUserFile)

  // Print summary
  console.log("\n" + "=".repeat(60))
  console.log("MIGRATION SUMMARY")
  console.log("=".repeat(60))
  console.log(`Files scanned:          ${stats.filesScanned}`)
  console.log(`Files modified:         ${stats.filesModified}`)
  console.log(`voucherWallets fixed:   ${stats.voucherWalletsFixed}`)
  console.log(`blinkApiAccounts fixed: ${stats.blinkApiAccountsFixed}`)
  console.log(`nwcConnections fixed:   ${stats.nwcConnectionsFixed}`)

  if (stats.skipped.length > 0) {
    console.log(`\nSkipped (already migrated): ${stats.skipped.length}`)
    stats.skipped.forEach((s) => console.log(`  - ${s.file}: ${s.field} - ${s.reason}`))
  }

  if (stats.errors.length > 0) {
    console.log(`\nErrors: ${stats.errors.length}`)
    stats.errors.forEach((e) => console.log(`  - ${e.file}: ${e.error}`))
  }

  if (DRY_RUN && stats.filesModified > 0) {
    console.log("\n" + "=".repeat(60))
    console.log("This was a DRY RUN. To apply changes, run with:")
    console.log("  APPLY=true node scripts/reencrypt-user-data.js")
    console.log("=".repeat(60))
  }

  // Exit with error code if there were errors
  if (stats.errors.length > 0) {
    process.exit(1)
  }
}

main()
