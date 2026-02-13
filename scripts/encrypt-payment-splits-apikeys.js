#!/usr/bin/env node
/**
 * Backfill Script: Encrypt plaintext userApiKey values in payment_splits.metadata
 *
 * Before this fix, userApiKey was stored as plaintext in the metadata JSONB column.
 * This script encrypts any remaining plaintext values using AuthManager's AES encryption.
 *
 * Usage:
 *   ENCRYPTION_KEY="<key>" POSTGRES_PASSWORD="<pass>" node scripts/encrypt-payment-splits-apikeys.js
 *
 * Dry run (default — no changes written):
 *   ENCRYPTION_KEY="<key>" POSTGRES_PASSWORD="<pass>" node scripts/encrypt-payment-splits-apikeys.js
 *
 * Apply changes:
 *   APPLY=true ENCRYPTION_KEY="<key>" POSTGRES_PASSWORD="<pass>" node scripts/encrypt-payment-splits-apikeys.js
 */

const CryptoJS = require("crypto-js")
const { Pool } = require("pg")

// --- Configuration ---

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY
if (!ENCRYPTION_KEY) {
  console.error("ERROR: ENCRYPTION_KEY environment variable must be set")
  process.exit(1)
}

const pgPassword = process.env.POSTGRES_PASSWORD
if (!pgPassword) {
  console.error("ERROR: POSTGRES_PASSWORD environment variable must be set")
  process.exit(1)
}

const DRY_RUN = process.env.APPLY !== "true"

const pool = new Pool({
  host: process.env.POSTGRES_HOST || "localhost",
  port: parseInt(process.env.POSTGRES_PORT || "5432"),
  database: process.env.POSTGRES_DB || "blinkpos",
  user: process.env.POSTGRES_USER || "blinkpos",
  password: pgPassword,
})

// --- Helpers ---

function encrypt(plaintext) {
  return CryptoJS.AES.encrypt(plaintext, ENCRYPTION_KEY).toString()
}

function decrypt(ciphertext) {
  try {
    const bytes = CryptoJS.AES.decrypt(ciphertext, ENCRYPTION_KEY)
    const result = bytes.toString(CryptoJS.enc.Utf8)
    return result || null
  } catch {
    return null
  }
}

/**
 * Heuristic: a Blink API key starts with "blink_" or "galoy_staging_".
 * CryptoJS AES ciphertext starts with "U2FsdGVkX1" (base64 for "Salted__").
 * If a value looks like a raw API key, it's plaintext and needs encryption.
 */
function isPlaintextApiKey(value) {
  if (!value || typeof value !== "string") return false
  // Already encrypted (CryptoJS AES output is base64 starting with the salt header)
  if (value.startsWith("U2FsdGVkX1")) return false
  // Looks like a raw Blink API key
  if (value.startsWith("blink_") || value.startsWith("galoy_staging_")) return true
  // Any other string that is NOT valid ciphertext is suspect — try decryption
  const decrypted = decrypt(value)
  if (decrypted) {
    // It decrypts successfully, so it's already encrypted
    return false
  }
  // Non-empty string that isn't ciphertext — treat as plaintext
  return true
}

// --- Main ---

async function main() {
  console.log("=".repeat(60))
  console.log("Backfill: Encrypt plaintext userApiKey in payment_splits")
  console.log("=".repeat(60))
  console.log(`Mode: ${DRY_RUN ? "DRY RUN (no changes)" : "APPLYING CHANGES"}`)
  console.log("")

  const client = await pool.connect()

  try {
    // Find all rows where metadata contains a userApiKey
    const result = await client.query(`
      SELECT id, payment_hash, metadata
      FROM payment_splits
      WHERE metadata IS NOT NULL
        AND metadata->>'userApiKey' IS NOT NULL
        AND metadata->>'userApiKey' != ''
      ORDER BY id
    `)

    console.log(`Found ${result.rows.length} rows with userApiKey in metadata\n`)

    let encrypted = 0
    let alreadyEncrypted = 0
    let errors = 0

    for (const row of result.rows) {
      const meta = row.metadata
      const rawKey = meta.userApiKey

      if (!isPlaintextApiKey(rawKey)) {
        alreadyEncrypted++
        continue
      }

      // Encrypt the plaintext key
      const encryptedKey = encrypt(rawKey)

      // Verify round-trip
      const verified = decrypt(encryptedKey)
      if (verified !== rawKey) {
        console.error(
          `  ERROR: Round-trip verification failed for id=${row.id} hash=${row.payment_hash.substring(0, 16)}...`,
        )
        errors++
        continue
      }

      console.log(
        `  Encrypting id=${row.id} hash=${row.payment_hash.substring(0, 16)}... key=${rawKey.substring(0, 15)}...`,
      )

      if (!DRY_RUN) {
        // Update the metadata JSONB, replacing only the userApiKey field
        const updatedMeta = { ...meta, userApiKey: encryptedKey }
        await client.query(`UPDATE payment_splits SET metadata = $1 WHERE id = $2`, [
          JSON.stringify(updatedMeta),
          row.id,
        ])
      }

      encrypted++
    }

    // Summary
    console.log("\n" + "=".repeat(60))
    console.log("SUMMARY")
    console.log("=".repeat(60))
    console.log(`Total rows with userApiKey: ${result.rows.length}`)
    console.log(`Already encrypted:          ${alreadyEncrypted}`)
    console.log(`Newly encrypted:            ${encrypted}`)
    console.log(`Errors:                     ${errors}`)

    if (DRY_RUN && encrypted > 0) {
      console.log("\nThis was a DRY RUN. To apply changes, run with:")
      console.log(
        "  APPLY=true ENCRYPTION_KEY=... POSTGRES_PASSWORD=... node scripts/encrypt-payment-splits-apikeys.js",
      )
    }

    if (errors > 0) {
      process.exit(1)
    }
  } finally {
    client.release()
    await pool.end()
  }
}

main().catch((err) => {
  console.error("Migration failed:", err)
  process.exit(1)
})
