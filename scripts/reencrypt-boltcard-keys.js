#!/usr/bin/env node
/**
 * Re-encrypt Boltcard Keys Migration Script
 * 
 * This script re-encrypts all boltcard encrypted fields from the old encryption key
 * to the new production encryption key.
 * 
 * Usage:
 *   OLD_KEY=<old_key> NEW_KEY=<new_key> node scripts/reencrypt-boltcard-keys.js
 * 
 * Or run via docker exec on the server:
 *   docker exec blinkpos-app node scripts/reencrypt-boltcard-keys.js
 */

const CryptoJS = require('crypto-js');
const { Pool } = require('pg');

// Encryption keys
const OLD_KEY = process.env.OLD_KEY || 'blink-encryption-key-2025';
const NEW_KEY = process.env.NEW_KEY || process.env.ENCRYPTION_KEY;

if (!NEW_KEY) {
  console.error('ERROR: NEW_KEY or ENCRYPTION_KEY environment variable must be set');
  process.exit(1);
}

console.log('=== Boltcard Key Re-encryption Migration ===');
console.log(`OLD_KEY: ${OLD_KEY.substring(0, 10)}...`);
console.log(`NEW_KEY: ${NEW_KEY.substring(0, 10)}...`);

// PostgreSQL connection
const pool = new Pool({
  host: process.env.POSTGRES_HOST || 'localhost',
  port: parseInt(process.env.POSTGRES_PORT || '5432'),
  database: process.env.POSTGRES_DB || 'blinkpos',
  user: process.env.POSTGRES_USER || 'blinkpos',
  password: process.env.POSTGRES_PASSWORD || 'blinkpos_secure_pass_2025',
});

// Decrypt with old key
function decryptWithOldKey(encrypted) {
  if (!encrypted) return null;
  try {
    const bytes = CryptoJS.AES.decrypt(encrypted, OLD_KEY);
    const decrypted = bytes.toString(CryptoJS.enc.Utf8);
    return decrypted || null;
  } catch (error) {
    console.error(`Decryption error: ${error.message}`);
    return null;
  }
}

// Encrypt with new key
function encryptWithNewKey(plaintext) {
  if (!plaintext) return null;
  return CryptoJS.AES.encrypt(plaintext, NEW_KEY).toString();
}

// Re-encrypt a value
function reencrypt(encrypted) {
  const decrypted = decryptWithOldKey(encrypted);
  if (!decrypted) {
    console.warn('  WARNING: Could not decrypt value, skipping');
    return null;
  }
  return encryptWithNewKey(decrypted);
}

async function migrate() {
  const client = await pool.connect();
  
  try {
    // Get all boltcards
    const result = await client.query(`
      SELECT id, name, 
             k0_encrypted, k1_encrypted, k2_encrypted, k3_encrypted, k4_encrypted,
             api_key_encrypted
      FROM boltcards
    `);
    
    console.log(`\nFound ${result.rows.length} boltcard(s) to migrate\n`);
    
    if (result.rows.length === 0) {
      console.log('No boltcards to migrate. Exiting.');
      return;
    }
    
    for (const row of result.rows) {
      console.log(`Processing card: ${row.name} (${row.id})`);
      
      // Re-encrypt each field
      const updates = {};
      const fields = ['k0', 'k1', 'k2', 'k3', 'k4', 'api_key'];
      
      for (const field of fields) {
        const encryptedField = `${field}_encrypted`;
        const currentValue = row[encryptedField];
        
        if (currentValue) {
          // Test decryption with old key
          const decrypted = decryptWithOldKey(currentValue);
          if (decrypted) {
            console.log(`  ${field}: decrypted OK (${decrypted.length} chars)`);
            updates[encryptedField] = encryptWithNewKey(decrypted);
          } else {
            // Maybe it's already encrypted with new key?
            const newKeyTest = CryptoJS.AES.decrypt(currentValue, NEW_KEY);
            const newKeyDecrypted = newKeyTest.toString(CryptoJS.enc.Utf8);
            if (newKeyDecrypted) {
              console.log(`  ${field}: already encrypted with new key, skipping`);
            } else {
              console.warn(`  ${field}: FAILED to decrypt with either key!`);
            }
          }
        } else {
          console.log(`  ${field}: null, skipping`);
        }
      }
      
      // Update database
      if (Object.keys(updates).length > 0) {
        const setClauses = Object.keys(updates).map((key, i) => `${key} = $${i + 2}`);
        const values = [row.id, ...Object.values(updates)];
        
        const updateQuery = `
          UPDATE boltcards 
          SET ${setClauses.join(', ')}
          WHERE id = $1
        `;
        
        await client.query(updateQuery, values);
        console.log(`  Updated ${Object.keys(updates).length} field(s)`);
      } else {
        console.log('  No fields to update');
      }
      
      console.log('');
    }
    
    console.log('=== Migration Complete ===');
    
    // Verify by testing decryption with new key
    console.log('\n=== Verification ===');
    const verifyResult = await client.query(`
      SELECT id, name, k2_encrypted FROM boltcards
    `);
    
    for (const row of verifyResult.rows) {
      const bytes = CryptoJS.AES.decrypt(row.k2_encrypted, NEW_KEY);
      const decrypted = bytes.toString(CryptoJS.enc.Utf8);
      if (decrypted && decrypted.length === 32) {
        console.log(`Card ${row.name}: K2 decrypts OK (${decrypted.length} hex chars)`);
      } else {
        console.error(`Card ${row.name}: K2 VERIFICATION FAILED!`);
      }
    }
    
  } finally {
    client.release();
    await pool.end();
  }
}

migrate().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
