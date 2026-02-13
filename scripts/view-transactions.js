#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports */

/**
 * Quick CLI tool to view recent transactions for audit purposes
 *
 * Usage:
 *   node scripts/view-transactions.js [options]
 *
 * Options:
 *   --today          Show today's transactions only
 *   --limit N        Show last N transactions (default: 20)
 *   --recipient X    Filter by tip recipient
 *   --status X       Filter by status (pending/completed/failed)
 *   --summary        Show summary statistics instead of transactions
 *   --export FILE    Export to CSV file
 */

const fs = require("fs")
const path = require("path")

const { Pool } = require("pg")

// Load environment variables from .env file if it exists
function loadEnv() {
  const envPath = path.join(__dirname, "../.env")
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, "utf8")
    envContent.split("\n").forEach((line) => {
      const match = line.match(/^([^=]+)=(.*)$/)
      if (match && !line.startsWith("#")) {
        const key = match[1].trim()
        const value = match[2].trim().replace(/^["']|["']$/g, "")
        if (!process.env[key]) {
          process.env[key] = value
        }
      }
    })
  }
}

loadEnv()

// Parse command line arguments
const args = process.argv.slice(2)
const options = {
  today: args.includes("--today"),
  limit: parseInt(args[args.indexOf("--limit") + 1]) || 20,
  recipient: args.includes("--recipient") ? args[args.indexOf("--recipient") + 1] : null,
  status: args.includes("--status") ? args[args.indexOf("--status") + 1] : null,
  summary: args.includes("--summary"),
  export: args.includes("--export") ? args[args.indexOf("--export") + 1] : null,
}

// Database connection
const pool = new Pool({
  host: process.env.POSTGRES_HOST || "localhost",
  port: process.env.POSTGRES_PORT || 5432,
  database: process.env.POSTGRES_DB || "blinkpos",
  user: process.env.POSTGRES_USER || "blinkpos",
  password: process.env.POSTGRES_PASSWORD || "blinkpos_dev_password",
})

// Format satoshis for display
function formatSats(sats) {
  return sats.toString().padStart(8, " ") + " sats"
}

// Format date for display
function formatDate(date) {
  return new Date(date).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

// Show transactions
async function showTransactions() {
  let query = `
    SELECT 
      payment_hash,
      total_amount,
      base_amount,
      tip_amount,
      tip_recipient,
      status,
      display_currency,
      memo,
      created_at
    FROM payment_splits
    WHERE 1=1
  `

  const params = []
  let paramIndex = 1

  if (options.today) {
    query += ` AND DATE(created_at) = CURRENT_DATE`
  }

  if (options.recipient) {
    query += ` AND tip_recipient = $${paramIndex}`
    params.push(options.recipient)
    paramIndex++
  }

  if (options.status) {
    query += ` AND status = $${paramIndex}`
    params.push(options.status)
    paramIndex++
  }

  query += ` ORDER BY created_at DESC LIMIT $${paramIndex}`
  params.push(options.limit)

  const result = await pool.query(query, params)

  console.log("\n" + "=".repeat(120))
  console.log("📊 RECENT TRANSACTIONS")
  console.log("=".repeat(120))

  if (result.rows.length === 0) {
    console.log("\n  No transactions found matching criteria.\n")
    return
  }

  console.log(
    "\n" +
      "Date & Time".padEnd(20) +
      "Total".padStart(12) +
      "Base".padStart(12) +
      "Tip".padStart(12) +
      "Recipient".padEnd(15) +
      "Status".padEnd(12) +
      "Currency".padEnd(10),
  )
  console.log("-".repeat(120))

  let totalAmount = 0
  let totalBase = 0
  let totalTips = 0

  result.rows.forEach((row) => {
    console.log(
      formatDate(row.created_at).padEnd(20) +
        formatSats(row.total_amount).padStart(12) +
        formatSats(row.base_amount).padStart(12) +
        formatSats(row.tip_amount).padStart(12) +
        (row.tip_recipient || "-").padEnd(15) +
        row.status.padEnd(12) +
        row.display_currency.padEnd(10),
    )

    if (row.status === "completed") {
      totalAmount += parseInt(row.total_amount)
      totalBase += parseInt(row.base_amount)
      totalTips += parseInt(row.tip_amount)
    }
  })

  console.log("-".repeat(120))
  console.log(
    "TOTALS (completed)".padEnd(20) +
      formatSats(totalAmount).padStart(12) +
      formatSats(totalBase).padStart(12) +
      formatSats(totalTips).padStart(12),
  )
  console.log("=".repeat(120) + "\n")
}

// Show summary statistics
async function showSummary() {
  const queries = {
    today: `
      SELECT 
        COUNT(*) as count,
        SUM(total_amount) as total,
        SUM(base_amount) as base,
        SUM(tip_amount) as tips
      FROM payment_splits
      WHERE DATE(created_at) = CURRENT_DATE
        AND status = 'completed'
    `,
    thisMonth: `
      SELECT 
        COUNT(*) as count,
        SUM(total_amount) as total,
        SUM(base_amount) as base,
        SUM(tip_amount) as tips
      FROM payment_splits
      WHERE created_at >= DATE_TRUNC('month', CURRENT_DATE)
        AND status = 'completed'
    `,
    allTime: `
      SELECT 
        COUNT(*) as count,
        SUM(total_amount) as total,
        SUM(base_amount) as base,
        SUM(tip_amount) as tips
      FROM payment_splits
      WHERE status = 'completed'
    `,
    topRecipients: `
      SELECT 
        tip_recipient,
        COUNT(*) as count,
        SUM(tip_amount) as total_tips
      FROM payment_splits
      WHERE tip_amount > 0 
        AND status = 'completed'
        AND created_at >= DATE_TRUNC('month', CURRENT_DATE)
      GROUP BY tip_recipient
      ORDER BY total_tips DESC
      LIMIT 10
    `,
    pending: `
      SELECT COUNT(*) as count
      FROM payment_splits
      WHERE status = 'pending'
    `,
  }

  const today = await pool.query(queries.today)
  const thisMonth = await pool.query(queries.thisMonth)
  const allTime = await pool.query(queries.allTime)
  const topRecipients = await pool.query(queries.topRecipients)
  const pending = await pool.query(queries.pending)

  console.log("\n" + "=".repeat(80))
  console.log("📊 TRANSACTION SUMMARY")
  console.log("=".repeat(80))

  console.log("\n📅 TODAY:")
  console.log(`  Payments:      ${today.rows[0].count || 0}`)
  console.log(`  Total Amount:  ${formatSats(today.rows[0].total || 0)}`)
  console.log(`  Base Amount:   ${formatSats(today.rows[0].base || 0)}`)
  console.log(`  Tips Paid:     ${formatSats(today.rows[0].tips || 0)}`)

  console.log("\n📅 THIS MONTH:")
  console.log(`  Payments:      ${thisMonth.rows[0].count || 0}`)
  console.log(`  Total Amount:  ${formatSats(thisMonth.rows[0].total || 0)}`)
  console.log(`  Base Amount:   ${formatSats(thisMonth.rows[0].base || 0)}`)
  console.log(`  Tips Paid:     ${formatSats(thisMonth.rows[0].tips || 0)}`)

  console.log("\n📅 ALL TIME:")
  console.log(`  Payments:      ${allTime.rows[0].count || 0}`)
  console.log(`  Total Amount:  ${formatSats(allTime.rows[0].total || 0)}`)
  console.log(`  Base Amount:   ${formatSats(allTime.rows[0].base || 0)}`)
  console.log(`  Tips Paid:     ${formatSats(allTime.rows[0].tips || 0)}`)

  if (topRecipients.rows.length > 0) {
    console.log("\n🏆 TOP TIP RECIPIENTS (This Month):")
    topRecipients.rows.forEach((row, i) => {
      console.log(
        `  ${(i + 1).toString().padStart(2)}. ${row.tip_recipient.padEnd(15)} ` +
          `${row.count.toString().padStart(3)} tips  ` +
          `${formatSats(row.total_tips)}`,
      )
    })
  }

  if (parseInt(pending.rows[0].count) > 0) {
    console.log(`\n⚠️  PENDING PAYMENTS: ${pending.rows[0].count}`)
  }

  console.log("\n" + "=".repeat(80) + "\n")
}

// Export to CSV
async function exportToCSV(filename) {
  const query = `
    SELECT 
      payment_hash,
      total_amount,
      base_amount,
      tip_amount,
      tip_recipient,
      status,
      display_currency,
      memo,
      created_at,
      processed_at
    FROM payment_splits
    ORDER BY created_at DESC
  `

  const result = await pool.query(query)

  const fs = require("fs")
  const csv = [
    [
      "Payment Hash",
      "Total",
      "Base",
      "Tip",
      "Recipient",
      "Status",
      "Currency",
      "Memo",
      "Created",
      "Processed",
    ],
    ...result.rows.map((row) => [
      row.payment_hash,
      row.total_amount,
      row.base_amount,
      row.tip_amount,
      row.tip_recipient || "",
      row.status,
      row.display_currency,
      row.memo || "",
      row.created_at,
      row.processed_at || "",
    ]),
  ]
    .map((row) => row.join(","))
    .join("\n")

  fs.writeFileSync(filename, csv)
  console.log(`\n✅ Exported ${result.rows.length} transactions to ${filename}\n`)
}

// Main function
async function main() {
  try {
    if (options.export) {
      await exportToCSV(options.export)
    } else if (options.summary) {
      await showSummary()
    } else {
      await showTransactions()
    }
  } catch (error) {
    console.error("❌ Error:", error.message)
    console.error("\n💡 Make sure PostgreSQL is running:")
    console.error("   docker ps | grep blinkpos-postgres")
    console.error("\n💡 Check your .env file for correct database credentials.\n")
  } finally {
    await pool.end()
  }
}

// Show usage if --help
if (args.includes("--help") || args.includes("-h")) {
  console.log(`
📊 BlinkPOS Transaction Viewer

Usage:
  node scripts/view-transactions.js [options]

Options:
  --today              Show today's transactions only
  --limit N            Show last N transactions (default: 20)
  --recipient X        Filter by tip recipient
  --status X           Filter by status (pending/completed/failed)
  --summary            Show summary statistics instead of transactions
  --export FILE        Export all transactions to CSV file
  --help, -h           Show this help message

Examples:
  node scripts/view-transactions.js
  node scripts/view-transactions.js --today
  node scripts/view-transactions.js --limit 50
  node scripts/view-transactions.js --recipient elturco
  node scripts/view-transactions.js --status completed --limit 100
  node scripts/view-transactions.js --summary
  node scripts/view-transactions.js --export transactions.csv
`)
  process.exit(0)
}

main()
