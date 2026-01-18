#!/usr/bin/env node
/**
 * Voucher Migration Script
 * 
 * One-time migration of vouchers from .voucher-store.json to PostgreSQL.
 * Run this script after applying migration 008 and before removing the JSON file.
 * 
 * Usage:
 *   node scripts/migrate-vouchers-to-postgres.js
 * 
 * Environment variables required:
 *   POSTGRES_HOST, POSTGRES_PORT, POSTGRES_DB, POSTGRES_USER, POSTGRES_PASSWORD
 *   OR DATABASE_URL
 *   ENCRYPTION_KEY (for API key encryption)
 */

const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
const crypto = require('crypto');

// CryptoJS for encryption (same as AuthManager)
const CryptoJS = require('crypto-js');

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'blink-encryption-key-2025';

// Old store file path
const OLD_STORE_FILE = path.join(process.cwd(), '.voucher-store.json');

// Create database connection
function createPool() {
  const config = process.env.DATABASE_URL
    ? { connectionString: process.env.DATABASE_URL }
    : {
        host: process.env.POSTGRES_HOST || 'localhost',
        port: process.env.POSTGRES_PORT || 5432,
        database: process.env.POSTGRES_DB || 'blinkpos',
        user: process.env.POSTGRES_USER || 'blinkpos',
        password: process.env.POSTGRES_PASSWORD || 'blinkpos_dev_password',
      };
  
  return new Pool({
    ...config,
    max: 5,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  });
}

// Encrypt API key using same method as AuthManager
function encryptApiKey(apiKey) {
  return CryptoJS.AES.encrypt(apiKey, ENCRYPTION_KEY).toString();
}

// Determine voucher status from data
function getVoucherStatus(voucher) {
  if (voucher.cancelledAt) return 'CANCELLED';
  if (voucher.claimed) return 'CLAIMED';
  if (voucher.expiresAt && voucher.expiresAt < Date.now()) return 'EXPIRED';
  return 'ACTIVE';
}

async function migrate() {
  console.log('='.repeat(60));
  console.log('Voucher Migration: JSON -> PostgreSQL');
  console.log('='.repeat(60));
  console.log('');
  
  // Check if old store file exists
  if (!fs.existsSync(OLD_STORE_FILE)) {
    console.log('No .voucher-store.json file found.');
    console.log('Nothing to migrate - this is expected for fresh installations.');
    process.exit(0);
  }
  
  // Load vouchers from JSON file
  let vouchers;
  try {
    const data = fs.readFileSync(OLD_STORE_FILE, 'utf8');
    vouchers = JSON.parse(data);
    console.log(`Found ${Object.keys(vouchers).length} vouchers in JSON file.`);
  } catch (error) {
    console.error('Failed to read voucher store file:', error.message);
    process.exit(1);
  }
  
  if (Object.keys(vouchers).length === 0) {
    console.log('No vouchers to migrate.');
    process.exit(0);
  }
  
  // Connect to PostgreSQL
  const pool = createPool();
  let client;
  
  try {
    client = await pool.connect();
    console.log('Connected to PostgreSQL.');
    
    // Check if vouchers table exists
    const tableCheck = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'vouchers'
      );
    `);
    
    if (!tableCheck.rows[0].exists) {
      console.error('ERROR: vouchers table does not exist!');
      console.error('Please run migration 008 first.');
      process.exit(1);
    }
    
    // Begin transaction
    await client.query('BEGIN');
    
    let migrated = 0;
    let skipped = 0;
    let errors = 0;
    
    for (const [id, voucher] of Object.entries(vouchers)) {
      try {
        // Check if voucher already exists in PostgreSQL
        const existing = await client.query(
          'SELECT id FROM vouchers WHERE id = $1',
          [id]
        );
        
        if (existing.rows.length > 0) {
          console.log(`  Skipping ${id.substring(0, 8)}... (already exists)`);
          skipped++;
          continue;
        }
        
        // Calculate status
        const status = getVoucherStatus(voucher);
        
        // Encrypt API key
        const apiKeyEncrypted = encryptApiKey(voucher.apiKey);
        
        // Insert voucher
        await client.query(`
          INSERT INTO vouchers 
          (id, amount_sats, wallet_id, api_key_encrypted, status, claimed,
           created_at, expires_at, claimed_at, cancelled_at, expiry_id,
           display_amount, display_currency, commission_percent)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
        `, [
          id,
          voucher.amount,
          voucher.walletId,
          apiKeyEncrypted,
          status,
          voucher.claimed || false,
          voucher.createdAt,
          voucher.expiresAt,
          voucher.claimedAt || null,
          voucher.cancelledAt || null,
          voucher.expiryId || '6mo',
          voucher.displayAmount || null,
          voucher.displayCurrency || null,
          voucher.commissionPercent || 0
        ]);
        
        console.log(`  Migrated ${id.substring(0, 8)}... (${status}, ${voucher.amount} sats)`);
        migrated++;
        
      } catch (error) {
        console.error(`  ERROR migrating ${id.substring(0, 8)}...: ${error.message}`);
        errors++;
      }
    }
    
    // Commit transaction
    await client.query('COMMIT');
    
    console.log('');
    console.log('='.repeat(60));
    console.log('Migration Complete');
    console.log('='.repeat(60));
    console.log(`  Migrated: ${migrated}`);
    console.log(`  Skipped:  ${skipped} (already in PostgreSQL)`);
    console.log(`  Errors:   ${errors}`);
    console.log('');
    
    if (errors === 0) {
      console.log('SUCCESS: All vouchers migrated successfully!');
      console.log('');
      console.log('You can now safely remove .voucher-store.json:');
      console.log('  rm .voucher-store.json');
    } else {
      console.log('WARNING: Some vouchers failed to migrate.');
      console.log('Check the errors above and retry if needed.');
    }
    
  } catch (error) {
    if (client) {
      await client.query('ROLLBACK');
    }
    console.error('Migration failed:', error.message);
    process.exit(1);
  } finally {
    if (client) {
      client.release();
    }
    await pool.end();
  }
}

// Run migration
migrate().catch(error => {
  console.error('Unexpected error:', error);
  process.exit(1);
});
