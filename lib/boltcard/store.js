/**
 * Boltcard Store - PostgreSQL-backed storage for Boltcard registrations
 * 
 * Implements spec-compliant Boltcard management per:
 * https://github.com/boltcard/boltcard/blob/main/docs/DETERMINISTIC.md
 * 
 * Storage Interface Contract:
 * - Issuer Key Management (per user)
 * - Pending Registration Management (deeplink flow)
 * - Card CRUD with spec-compliant key derivation
 * - Privacy-preserving card_id_hash
 * - Version rotation on re-program
 * 
 * @module lib/boltcard/store
 */

const crypto = require('crypto');
const { Pool } = require('pg');
const AuthManager = require('../auth');
const boltcardCrypto = require('./crypto');

// Database connection pool (singleton)
let pool = null;

function getPool() {
  if (!pool) {
    const config = process.env.DATABASE_URL
      ? { connectionString: process.env.DATABASE_URL }
      : {
          host: process.env.POSTGRES_HOST || 'localhost',
          port: process.env.POSTGRES_PORT || 5432,
          database: process.env.POSTGRES_DB || 'blinkpos',
          user: process.env.POSTGRES_USER || 'blinkpos',
          password: process.env.POSTGRES_PASSWORD || 'blinkpos_dev_password',
        };
    
    pool = new Pool({
      ...config,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    });
    
    pool.on('error', (err) => {
      console.error('[BoltcardStore] Unexpected pool error:', err);
    });
  }
  return pool;
}

/**
 * Execute a query with parameters
 */
async function query(text, params) {
  const start = Date.now();
  const result = await getPool().query(text, params);
  const duration = Date.now() - start;
  
  if (duration > 1000) {
    console.warn(`[BoltcardStore] Slow query (${duration}ms):`, text.substring(0, 100));
  }
  
  return result;
}

/**
 * Boltcard status constants
 */
const CardStatus = {
  PENDING: 'PENDING',   // Card registered but not yet programmed
  ACTIVE: 'ACTIVE',     // Card is active and can be used
  DISABLED: 'DISABLED', // Card temporarily disabled
  WIPED: 'WIPED',       // Card wiped/deleted
};

/**
 * Transaction type constants
 */
const TxType = {
  WITHDRAW: 'WITHDRAW', // Card tap to pay (spend)
  TOPUP: 'TOPUP',       // Top-up via LNURL-pay
  ADJUST: 'ADJUST',     // Manual balance adjustment
};

/**
 * Pending registration status constants
 */
const PendingStatus = {
  PENDING: 'PENDING',
  COMPLETED: 'COMPLETED',
  EXPIRED: 'EXPIRED',
  CANCELLED: 'CANCELLED',
};

// Default registration expiry (15 minutes)
const REGISTRATION_EXPIRY_MS = 15 * 60 * 1000;

class BoltcardStore {
  constructor() {
    // Lazy cleanup flag
    this.lastCleanup = 0;
    this.CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
  }

  /**
   * Run lazy cleanup - reset daily limits for expired cards
   */
  async lazyCleanup() {
    const now = Date.now();
    if (now - this.lastCleanup < this.CLEANUP_INTERVAL_MS) {
      return;
    }
    
    this.lastCleanup = now;
    
    try {
      // Reset daily limits
      const dailyResult = await query(`SELECT reset_boltcard_daily_limits()`);
      const resetCount = dailyResult.rows[0]?.reset_boltcard_daily_limits || 0;
      
      if (resetCount > 0) {
        console.log(`[BoltcardStore] Lazy cleanup: reset daily limits for ${resetCount} card(s)`);
      }
      
      // Cleanup expired pending registrations
      const expiredResult = await query(`SELECT cleanup_expired_boltcard_registrations()`);
      const expiredCount = expiredResult.rows[0]?.cleanup_expired_boltcard_registrations || 0;
      
      if (expiredCount > 0) {
        console.log(`[BoltcardStore] Lazy cleanup: expired ${expiredCount} pending registration(s)`);
      }
    } catch (error) {
      console.error('[BoltcardStore] Lazy cleanup error:', error.message);
    }
  }

  /**
   * Generate a unique ID (32-character hex string)
   * @returns {string}
   */
  generateId() {
    return crypto.randomBytes(16).toString('hex');
  }

  // Alias for backwards compatibility
  generateCardId() {
    return this.generateId();
  }

  // ==========================================================================
  // ISSUER KEY MANAGEMENT
  // ==========================================================================

  /**
   * Get or create IssuerKey for a user
   * Each user has exactly one IssuerKey used to derive all their card keys
   * 
   * @param {string} ownerPubkey - Owner's Nostr pubkey
   * @returns {Promise<string>} IssuerKey (32 hex chars)
   */
  async getOrCreateIssuerKey(ownerPubkey) {
    if (!/^[0-9a-fA-F]{64}$/.test(ownerPubkey)) {
      throw new Error('Invalid owner pubkey format');
    }

    try {
      // Try to get existing key
      const existing = await query(
        `SELECT issuer_key_encrypted FROM boltcard_issuer_keys WHERE owner_pubkey = $1`,
        [ownerPubkey]
      );
      
      if (existing.rows.length > 0) {
        // Update last_used_at
        await query(
          `UPDATE boltcard_issuer_keys SET last_used_at = $2 WHERE owner_pubkey = $1`,
          [ownerPubkey, Date.now()]
        );
        return AuthManager.decryptApiKey(existing.rows[0].issuer_key_encrypted);
      }
      
      // Create new IssuerKey
      const issuerKey = boltcardCrypto.generateIssuerKey();
      const issuerKeyEncrypted = AuthManager.encryptApiKey(issuerKey);
      const now = Date.now();
      
      await query(
        `INSERT INTO boltcard_issuer_keys (owner_pubkey, issuer_key_encrypted, created_at, last_used_at)
         VALUES ($1, $2, $3, $3)`,
        [ownerPubkey, issuerKeyEncrypted, now]
      );
      
      console.log(`[BoltcardStore] Created new IssuerKey for owner: ${ownerPubkey.substring(0, 8)}...`);
      return issuerKey;
    } catch (error) {
      // Handle race condition - another process may have created the key
      if (error.code === '23505') { // Unique constraint violation
        const existing = await query(
          `SELECT issuer_key_encrypted FROM boltcard_issuer_keys WHERE owner_pubkey = $1`,
          [ownerPubkey]
        );
        if (existing.rows.length > 0) {
          return AuthManager.decryptApiKey(existing.rows[0].issuer_key_encrypted);
        }
      }
      console.error('[BoltcardStore] getOrCreateIssuerKey error:', error.message);
      throw error;
    }
  }

  /**
   * Get IssuerKey for a user (returns null if not found)
   * @param {string} ownerPubkey 
   * @returns {Promise<string|null>}
   */
  async getIssuerKey(ownerPubkey) {
    try {
      const result = await query(
        `SELECT issuer_key_encrypted FROM boltcard_issuer_keys WHERE owner_pubkey = $1`,
        [ownerPubkey]
      );
      
      if (result.rows.length === 0) {
        return null;
      }
      
      return AuthManager.decryptApiKey(result.rows[0].issuer_key_encrypted);
    } catch (error) {
      console.error('[BoltcardStore] getIssuerKey error:', error.message);
      return null;
    }
  }

  // ==========================================================================
  // PENDING REGISTRATION MANAGEMENT (Deeplink Flow)
  // ==========================================================================

  /**
   * Create a pending card registration
   * Used with deeplink flow where card UID is not known until programming
   * 
   * @param {object} data - Registration data
   * @param {string} data.ownerPubkey - Owner's Nostr pubkey
   * @param {string} data.walletId - Blink wallet ID
   * @param {string} data.apiKey - Blink API key (will be encrypted)
   * @param {object} options - Optional settings
   * @param {string} options.name - Card name
   * @param {string} options.walletCurrency - 'BTC' or 'USD'
   * @param {number} options.maxTxAmount - Per-transaction limit
   * @param {number} options.dailyLimit - Daily limit
   * @param {number} options.initialBalance - Initial balance
   * @param {string} options.environment - 'production' or 'staging'
   * @param {number} options.expiresIn - Expiry time in ms (default: 15 min)
   * @returns {Promise<object>} Pending registration object
   */
  async createPendingRegistration(data, options = {}) {
    const { ownerPubkey, walletId, apiKey } = data;
    
    if (!ownerPubkey || !walletId || !apiKey) {
      throw new Error('Missing required fields: ownerPubkey, walletId, apiKey');
    }
    
    const id = this.generateId();
    const now = Date.now();
    const expiresAt = now + (options.expiresIn || REGISTRATION_EXPIRY_MS);
    
    const apiKeyEncrypted = AuthManager.encryptApiKey(apiKey);
    
    try {
      const result = await query(
        `INSERT INTO boltcard_pending_registrations
         (id, owner_pubkey, wallet_id, wallet_currency, api_key_encrypted,
          name, max_tx_amount, daily_limit, initial_balance,
          environment, status, created_at, expires_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
         RETURNING *`,
        [
          id, ownerPubkey, walletId, options.walletCurrency || 'BTC', apiKeyEncrypted,
          options.name || null, options.maxTxAmount || null, options.dailyLimit || null,
          options.initialBalance || 0, options.environment || 'production',
          PendingStatus.PENDING, now, expiresAt
        ]
      );
      
      console.log(`[BoltcardStore] Created pending registration: ${id}`);
      
      return {
        id: result.rows[0].id,
        ownerPubkey: result.rows[0].owner_pubkey,
        walletId: result.rows[0].wallet_id,
        walletCurrency: result.rows[0].wallet_currency,
        name: result.rows[0].name,
        maxTxAmount: result.rows[0].max_tx_amount ? parseInt(result.rows[0].max_tx_amount, 10) : null,
        dailyLimit: result.rows[0].daily_limit ? parseInt(result.rows[0].daily_limit, 10) : null,
        initialBalance: parseInt(result.rows[0].initial_balance, 10),
        environment: result.rows[0].environment,
        status: result.rows[0].status,
        createdAt: parseInt(result.rows[0].created_at, 10),
        expiresAt: parseInt(result.rows[0].expires_at, 10),
      };
    } catch (error) {
      console.error('[BoltcardStore] createPendingRegistration error:', error.message);
      throw error;
    }
  }

  /**
   * Get a pending registration by ID
   * @param {string} id 
   * @returns {Promise<object|null>}
   */
  async getPendingRegistration(id) {
    try {
      await this.lazyCleanup();
      
      const result = await query(
        `SELECT * FROM boltcard_pending_registrations WHERE id = $1`,
        [id]
      );
      
      if (result.rows.length === 0) {
        return null;
      }
      
      const row = result.rows[0];
      return {
        id: row.id,
        ownerPubkey: row.owner_pubkey,
        walletId: row.wallet_id,
        walletCurrency: row.wallet_currency,
        apiKey: AuthManager.decryptApiKey(row.api_key_encrypted),
        name: row.name,
        maxTxAmount: row.max_tx_amount ? parseInt(row.max_tx_amount, 10) : null,
        dailyLimit: row.daily_limit ? parseInt(row.daily_limit, 10) : null,
        initialBalance: parseInt(row.initial_balance, 10),
        environment: row.environment,
        status: row.status,
        createdAt: parseInt(row.created_at, 10),
        expiresAt: parseInt(row.expires_at, 10),
        completedAt: row.completed_at ? parseInt(row.completed_at, 10) : null,
        cardId: row.card_id,
      };
    } catch (error) {
      console.error('[BoltcardStore] getPendingRegistration error:', error.message);
      return null;
    }
  }

  /**
   * Complete a pending registration by creating the actual card
   * Called when NFC Programmer app sends the UID
   * 
   * @param {string} registrationId - Pending registration ID
   * @param {string} cardUid - Card UID from NFC Programmer (14 hex chars)
   * @returns {Promise<object>} Created card object with keys
   */
  async completePendingRegistration(registrationId, cardUid) {
    // Validate UID format
    if (!/^[0-9a-fA-F]{14}$/.test(cardUid)) {
      throw new Error('Invalid card UID format: expected 14 hex characters');
    }
    
    const registration = await this.getPendingRegistration(registrationId);
    
    if (!registration) {
      throw new Error('Registration not found');
    }
    
    if (registration.status !== PendingStatus.PENDING) {
      throw new Error(`Registration is not pending: ${registration.status}`);
    }
    
    if (registration.expiresAt < Date.now()) {
      throw new Error('Registration has expired');
    }
    
    // Check if card UID already exists
    const existingCard = await this.getCardByUid(cardUid);
    if (existingCard) {
      // If card is WIPED, delete it completely to allow fresh registration
      if (existingCard.status === CardStatus.WIPED) {
        console.log(`[BoltcardStore] Deleting WIPED card ${existingCard.id} to allow fresh registration`);
        await query(`DELETE FROM boltcard_transactions WHERE card_id = $1`, [existingCard.id]);
        await query(`DELETE FROM boltcard_pending_topups WHERE card_id = $1`, [existingCard.id]);
        await query(`DELETE FROM boltcards WHERE id = $1`, [existingCard.id]);
        // Fall through to create new card below
      } else if (existingCard.ownerPubkey === registration.ownerPubkey) {
        // Same owner, active card - this is a re-program, increment version
        const updated = await this.reprogramCard(existingCard.id, cardUid);
        if (updated) {
          // Mark registration as completed
          await query(
            `UPDATE boltcard_pending_registrations 
             SET status = $2, completed_at = $3, card_id = $4
             WHERE id = $1`,
            [registrationId, PendingStatus.COMPLETED, Date.now(), existingCard.id]
          );
          return await this.getCard(existingCard.id, true);
        }
      } else {
        throw new Error(`Card with UID ${cardUid} already registered to another user`);
      }
    }
    
    // Create the card
    const card = await this.createCard({
      cardUid,
      ownerPubkey: registration.ownerPubkey,
      walletId: registration.walletId,
      apiKey: registration.apiKey,
    }, {
      name: registration.name,
      walletCurrency: registration.walletCurrency,
      maxTxAmount: registration.maxTxAmount,
      dailyLimit: registration.dailyLimit,
      initialBalance: registration.initialBalance,
      environment: registration.environment,
    });
    
    // Auto-activate the card since NFC Programmer app doesn't have a confirmation callback
    // If programming fails, user can delete and re-register the card
    await this.activateCard(card.id);
    
    // Mark registration as completed
    await query(
      `UPDATE boltcard_pending_registrations 
       SET status = $2, completed_at = $3, card_id = $4
       WHERE id = $1`,
      [registrationId, PendingStatus.COMPLETED, Date.now(), card.id]
    );
    
    console.log(`[BoltcardStore] Completed registration ${registrationId} -> card ${card.id} (auto-activated)`);
    
    // Return card with keys for programming
    return await this.getCard(card.id, true);
  }

  /**
   * Cancel a pending registration
   * @param {string} id 
   * @returns {Promise<boolean>}
   */
  async cancelPendingRegistration(id) {
    try {
      const result = await query(
        `UPDATE boltcard_pending_registrations 
         SET status = $2
         WHERE id = $1 AND status = 'PENDING'
         RETURNING id`,
        [id, PendingStatus.CANCELLED]
      );
      return result.rowCount > 0;
    } catch (error) {
      console.error('[BoltcardStore] cancelPendingRegistration error:', error.message);
      return false;
    }
  }

  /**
   * Get pending registrations for an owner
   * @param {string} ownerPubkey 
   * @returns {Promise<Array>}
   */
  async getPendingRegistrationsByOwner(ownerPubkey) {
    try {
      await this.lazyCleanup();
      
      const result = await query(
        `SELECT id, name, wallet_currency, initial_balance, status, created_at, expires_at
         FROM boltcard_pending_registrations 
         WHERE owner_pubkey = $1 AND status = 'PENDING'
         ORDER BY created_at DESC`,
        [ownerPubkey]
      );
      
      return result.rows.map(row => ({
        id: row.id,
        name: row.name,
        walletCurrency: row.wallet_currency,
        initialBalance: parseInt(row.initial_balance, 10),
        status: row.status,
        createdAt: parseInt(row.created_at, 10),
        expiresAt: parseInt(row.expires_at, 10),
      }));
    } catch (error) {
      console.error('[BoltcardStore] getPendingRegistrationsByOwner error:', error.message);
      return [];
    }
  }

  // ==========================================================================
  // CARD MANAGEMENT
  // ==========================================================================

  /**
   * Convert database row to card object
   * @param {object} row - Database row
   * @param {boolean} includeKeys - Include decrypted keys (default: false)
   * @returns {object} Card object
   */
  _rowToCard(row, includeKeys = false) {
    if (!row) return null;
    
    const card = {
      id: row.id,
      cardUid: row.card_uid,
      cardIdHash: row.card_id_hash,
      name: row.name,
      ownerPubkey: row.owner_pubkey,
      walletId: row.wallet_id,
      walletCurrency: row.wallet_currency,
      version: parseInt(row.version, 10),
      lastCounter: parseInt(row.last_counter, 10),
      balance: parseInt(row.balance, 10),
      maxTxAmount: row.max_tx_amount ? parseInt(row.max_tx_amount, 10) : null,
      dailyLimit: row.daily_limit ? parseInt(row.daily_limit, 10) : null,
      dailySpent: parseInt(row.daily_spent, 10),
      dailyResetAt: row.daily_reset_at ? parseInt(row.daily_reset_at, 10) : null,
      status: row.status,
      createdAt: parseInt(row.created_at, 10),
      activatedAt: row.activated_at ? parseInt(row.activated_at, 10) : null,
      lastUsedAt: row.last_used_at ? parseInt(row.last_used_at, 10) : null,
      disabledAt: row.disabled_at ? parseInt(row.disabled_at, 10) : null,
      environment: row.environment || 'production',
    };

    // Only include sensitive data when explicitly requested
    if (includeKeys) {
      card.apiKey = AuthManager.decryptApiKey(row.api_key_encrypted);
      card.k0 = AuthManager.decryptApiKey(row.k0_encrypted);
      card.k1 = AuthManager.decryptApiKey(row.k1_encrypted);
      card.k2 = AuthManager.decryptApiKey(row.k2_encrypted);
      card.k3 = row.k3_encrypted ? AuthManager.decryptApiKey(row.k3_encrypted) : null;
      card.k4 = row.k4_encrypted ? AuthManager.decryptApiKey(row.k4_encrypted) : null;
    }
    
    return card;
  }

  /**
   * Create a new Boltcard registration with spec-compliant key derivation
   * 
   * @param {object} cardData - Card data
   * @param {string} cardData.cardUid - Card UID from NTAG424DNA (7 bytes = 14 hex chars)
   * @param {string} cardData.ownerPubkey - Owner's Nostr pubkey
   * @param {string} cardData.walletId - Blink wallet ID
   * @param {string} cardData.apiKey - Blink API key (will be encrypted)
   * @param {object} options - Optional settings
   * @param {string} options.name - User-friendly card name
   * @param {string} options.walletCurrency - 'BTC' or 'USD' (default: 'BTC')
   * @param {number} options.maxTxAmount - Per-transaction limit (sats/cents)
   * @param {number} options.dailyLimit - Daily spending limit (sats/cents)
   * @param {number} options.initialBalance - Initial balance (sats/cents)
   * @param {string} options.environment - 'production' or 'staging'
   * @returns {Promise<object>} Created card object
   */
  async createCard(cardData, options = {}) {
    const { cardUid, ownerPubkey, walletId, apiKey } = cardData;
    
    // Validate required fields
    if (!cardUid || !ownerPubkey || !walletId || !apiKey) {
      throw new Error('Missing required card data: cardUid, ownerPubkey, walletId, apiKey');
    }
    
    // Validate card UID format (14 hex chars)
    if (!/^[0-9a-fA-F]{14}$/.test(cardUid)) {
      throw new Error('Invalid card UID format: expected 14 hex characters');
    }
    
    // Get or create IssuerKey for this owner
    const issuerKey = await this.getOrCreateIssuerKey(ownerPubkey);
    
    // Derive all keys using spec-compliant derivation
    const version = 1;
    const derivedKeys = boltcardCrypto.deriveAllKeys(issuerKey, cardUid.toLowerCase(), version);
    
    const id = this.generateCardId();
    const now = Date.now();
    const walletCurrency = options.walletCurrency || 'BTC';
    const environment = options.environment || 'production';
    const initialBalance = options.initialBalance || 0;
    
    // Encrypt sensitive data
    const apiKeyEncrypted = AuthManager.encryptApiKey(apiKey);
    const k0Encrypted = AuthManager.encryptApiKey(derivedKeys.k0);
    const k1Encrypted = AuthManager.encryptApiKey(derivedKeys.k1);
    const k2Encrypted = AuthManager.encryptApiKey(derivedKeys.k2);
    const k3Encrypted = AuthManager.encryptApiKey(derivedKeys.k3);
    const k4Encrypted = AuthManager.encryptApiKey(derivedKeys.k4);
    
    // Set up daily limit tracking
    const dailyResetAt = options.dailyLimit ? now + (24 * 60 * 60 * 1000) : null;
    
    try {
      const result = await query(
        `INSERT INTO boltcards 
         (id, card_uid, card_id_hash, name, owner_pubkey, wallet_id, wallet_currency, api_key_encrypted,
          k0_encrypted, k1_encrypted, k2_encrypted, k3_encrypted, k4_encrypted,
          version, last_counter, balance, max_tx_amount, daily_limit, daily_spent, daily_reset_at,
          status, created_at, environment)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23)
         RETURNING *`,
        [
          id, cardUid.toLowerCase(), derivedKeys.cardIdHash, options.name || null, ownerPubkey,
          walletId, walletCurrency, apiKeyEncrypted,
          k0Encrypted, k1Encrypted, k2Encrypted, k3Encrypted, k4Encrypted,
          version, 0, initialBalance, options.maxTxAmount || null, options.dailyLimit || null, 0, dailyResetAt,
          CardStatus.PENDING, now, environment
        ]
      );
      
      const card = this._rowToCard(result.rows[0]);
      
      const currencySymbol = walletCurrency === 'USD' ? '$' : '';
      const currencyUnit = walletCurrency === 'USD' ? 'cents' : 'sats';
      console.log(`[BoltcardStore] Created card: ${id} (UID: ${cardUid}) - ${walletCurrency}${currencySymbol}${initialBalance} ${currencyUnit}${environment !== 'production' ? ` [${environment}]` : ''}`);
      
      return card;
    } catch (error) {
      if (error.code === '23505') { // Unique constraint violation
        throw new Error(`Card with UID ${cardUid} already exists`);
      }
      console.error('[BoltcardStore] createCard error:', error.message);
      throw error;
    }
  }

  /**
   * Re-program an existing card (increment version, derive new keys)
   * Used when a card is programmed again (e.g., after reset)
   * 
   * @param {string} cardId - Card ID
   * @param {string} cardUid - Card UID (for verification)
   * @returns {Promise<object|null>} Updated card with new keys
   */
  async reprogramCard(cardId, cardUid) {
    const card = await this.getCard(cardId, true);
    
    if (!card) {
      throw new Error('Card not found');
    }
    
    if (card.cardUid.toLowerCase() !== cardUid.toLowerCase()) {
      throw new Error('Card UID mismatch');
    }
    
    // Get IssuerKey
    const issuerKey = await this.getIssuerKey(card.ownerPubkey);
    if (!issuerKey) {
      throw new Error('IssuerKey not found for owner');
    }
    
    // Increment version and derive new keys
    const newVersion = card.version + 1;
    const derivedKeys = boltcardCrypto.deriveAllKeys(issuerKey, cardUid.toLowerCase(), newVersion);
    
    // Encrypt new keys
    const k0Encrypted = AuthManager.encryptApiKey(derivedKeys.k0);
    const k1Encrypted = AuthManager.encryptApiKey(derivedKeys.k1);
    const k2Encrypted = AuthManager.encryptApiKey(derivedKeys.k2);
    const k3Encrypted = AuthManager.encryptApiKey(derivedKeys.k3);
    const k4Encrypted = AuthManager.encryptApiKey(derivedKeys.k4);
    
    try {
      const result = await query(
        `UPDATE boltcards 
         SET version = $2, 
             k0_encrypted = $3, k1_encrypted = $4, k2_encrypted = $5, 
             k3_encrypted = $6, k4_encrypted = $7,
             last_counter = 0,
             status = 'PENDING'
         WHERE id = $1
         RETURNING *`,
        [cardId, newVersion, k0Encrypted, k1Encrypted, k2Encrypted, k3Encrypted, k4Encrypted]
      );
      
      if (result.rowCount === 0) {
        return null;
      }
      
      console.log(`[BoltcardStore] Re-programmed card ${cardId}: version ${card.version} -> ${newVersion}`);
      return this._rowToCard(result.rows[0], true);
    } catch (error) {
      console.error('[BoltcardStore] reprogramCard error:', error.message);
      throw error;
    }
  }

  /**
   * Get card by ID
   * @param {string} cardId - Card ID
   * @param {boolean} includeKeys - Include decrypted keys
   * @returns {Promise<object|null>} Card object or null
   */
  async getCard(cardId, includeKeys = false) {
    try {
      await this.lazyCleanup();
      
      const result = await query(
        `SELECT * FROM boltcards WHERE id = $1`,
        [cardId]
      );
      
      if (result.rows.length === 0) {
        return null;
      }
      
      return this._rowToCard(result.rows[0], includeKeys);
    } catch (error) {
      console.error('[BoltcardStore] getCard error:', error.message);
      return null;
    }
  }

  /**
   * Get card by UID (for LNURL-withdraw lookups)
   * @param {string} cardUid - Card UID (14 hex chars)
   * @param {boolean} includeKeys - Include decrypted keys
   * @returns {Promise<object|null>} Card object or null
   */
  async getCardByUid(cardUid, includeKeys = false) {
    try {
      await this.lazyCleanup();
      
      const result = await query(
        `SELECT * FROM boltcards WHERE card_uid = $1`,
        [cardUid.toLowerCase()]
      );
      
      if (result.rows.length === 0) {
        return null;
      }
      
      return this._rowToCard(result.rows[0], includeKeys);
    } catch (error) {
      console.error('[BoltcardStore] getCardByUid error:', error.message);
      return null;
    }
  }

  /**
   * Get card by privacy-preserving ID hash
   * @param {string} cardIdHash - Card ID hash (32 hex chars)
   * @param {boolean} includeKeys - Include decrypted keys
   * @returns {Promise<object|null>} Card object or null
   */
  async getCardByIdHash(cardIdHash, includeKeys = false) {
    try {
      await this.lazyCleanup();
      
      const result = await query(
        `SELECT * FROM boltcards WHERE card_id_hash = $1`,
        [cardIdHash.toLowerCase()]
      );
      
      if (result.rows.length === 0) {
        return null;
      }
      
      return this._rowToCard(result.rows[0], includeKeys);
    } catch (error) {
      console.error('[BoltcardStore] getCardByIdHash error:', error.message);
      return null;
    }
  }

  /**
   * Get all cards for an owner
   * @param {string} ownerPubkey - Owner's Nostr pubkey
   * @returns {Promise<Array>} Array of card objects
   */
  async getCardsByOwner(ownerPubkey) {
    try {
      await this.lazyCleanup();
      
      const result = await query(
        `SELECT * FROM boltcards 
         WHERE owner_pubkey = $1 
         ORDER BY created_at DESC`,
        [ownerPubkey]
      );
      
      return result.rows.map(row => this._rowToCard(row));
    } catch (error) {
      console.error('[BoltcardStore] getCardsByOwner error:', error.message);
      return [];
    }
  }

  /**
   * Derive keys for a card (for keysRequest endpoint)
   * @param {string} cardId - Card ID
   * @param {string} cardUid - Card UID (for verification)
   * @returns {Promise<object|null>} { lnurlwUrl, k0, k1, k2, k3, k4 }
   */
  async deriveKeysForCard(cardId, cardUid) {
    const card = await this.getCard(cardId);
    
    if (!card) {
      return null;
    }
    
    // Verify UID matches if provided
    if (cardUid && card.cardUid.toLowerCase() !== cardUid.toLowerCase()) {
      console.warn(`[BoltcardStore] UID mismatch for card ${cardId}: expected ${card.cardUid}, got ${cardUid}`);
      return null;
    }
    
    // Get IssuerKey
    const issuerKey = await this.getIssuerKey(card.ownerPubkey);
    if (!issuerKey) {
      console.error(`[BoltcardStore] IssuerKey not found for card ${cardId}`);
      return null;
    }
    
    // Derive keys
    const keys = boltcardCrypto.deriveAllKeys(issuerKey, card.cardUid, card.version);
    
    return {
      k0: keys.k0,
      k1: keys.k1,
      k2: keys.k2,
      k3: keys.k3,
      k4: keys.k4,
    };
  }

  /**
   * Update card fields
   * @param {string} cardId - Card ID
   * @param {object} updates - Fields to update
   * @returns {Promise<boolean>} Success
   */
  async updateCard(cardId, updates) {
    const allowedFields = ['name', 'max_tx_amount', 'daily_limit'];
    const setClauses = [];
    const values = [cardId];
    let paramIndex = 2;
    
    for (const [key, value] of Object.entries(updates)) {
      const dbKey = key.replace(/([A-Z])/g, '_$1').toLowerCase();
      if (allowedFields.includes(dbKey)) {
        setClauses.push(`${dbKey} = $${paramIndex}`);
        values.push(value);
        paramIndex++;
      }
    }
    
    if (setClauses.length === 0) {
      return false;
    }
    
    try {
      const result = await query(
        `UPDATE boltcards SET ${setClauses.join(', ')} WHERE id = $1 RETURNING id`,
        values
      );
      
      return result.rowCount > 0;
    } catch (error) {
      console.error('[BoltcardStore] updateCard error:', error.message);
      return false;
    }
  }

  /**
   * Update card balance (atomic operation)
   * @param {string} cardId - Card ID
   * @param {number} newBalance - New balance
   * @returns {Promise<boolean>} Success
   */
  async updateCardBalance(cardId, newBalance) {
    try {
      const result = await query(
        `UPDATE boltcards SET balance = $2 WHERE id = $1 AND status = 'ACTIVE' RETURNING id`,
        [cardId, newBalance]
      );
      
      if (result.rowCount > 0) {
        console.log(`[BoltcardStore] Updated balance for card ${cardId}: ${newBalance}`);
        return true;
      }
      return false;
    } catch (error) {
      console.error('[BoltcardStore] updateCardBalance error:', error.message);
      return false;
    }
  }

  /**
   * Record a transaction for a card
   * @param {string} cardId - Card ID
   * @param {object} txData - Transaction data
   * @param {string} txData.type - Transaction type (WITHDRAW, TOPUP, ADJUST)
   * @param {number} txData.amount - Amount (positive for TOPUP, positive for WITHDRAW)
   * @param {number} txData.balanceAfter - Balance after this transaction
   * @param {string} txData.paymentHash - Lightning payment hash (optional)
   * @param {string} txData.description - Description/memo (optional)
   * @returns {Promise<object|null>} Transaction object or null
   */
  async recordTransaction(cardId, txData) {
    const { type, amount, balanceAfter, paymentHash, description } = txData;
    
    if (!Object.values(TxType).includes(type)) {
      console.error(`[BoltcardStore] Invalid transaction type: ${type}`);
      return null;
    }
    
    const now = Date.now();
    
    try {
      const result = await query(
        `INSERT INTO boltcard_transactions 
         (card_id, tx_type, amount, balance_after, payment_hash, description, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING *`,
        [cardId, type, amount, balanceAfter, paymentHash || null, description || null, now]
      );
      
      const row = result.rows[0];
      console.log(`[BoltcardStore] Recorded ${type} transaction for card ${cardId}: ${amount} (balance: ${balanceAfter})`);
      
      return {
        id: row.id,
        cardId: row.card_id,
        type: row.tx_type,
        amount: parseInt(row.amount, 10),
        balanceAfter: parseInt(row.balance_after, 10),
        paymentHash: row.payment_hash,
        description: row.description,
        createdAt: parseInt(row.created_at, 10),
      };
    } catch (error) {
      console.error('[BoltcardStore] recordTransaction error:', error.message);
      return null;
    }
  }

  /**
   * Get transactions for a card
   * @param {string} cardId - Card ID
   * @param {number} limit - Max transactions to return (default: 50)
   * @returns {Promise<Array>} Array of transaction objects
   */
  async getCardTransactions(cardId, limit = 50) {
    try {
      const result = await query(
        `SELECT * FROM boltcard_transactions 
         WHERE card_id = $1 
         ORDER BY created_at DESC 
         LIMIT $2`,
        [cardId, limit]
      );
      
      return result.rows.map(row => ({
        id: row.id,
        cardId: row.card_id,
        type: row.tx_type,
        amount: parseInt(row.amount, 10),
        balanceAfter: parseInt(row.balance_after, 10),
        paymentHash: row.payment_hash,
        description: row.description,
        createdAt: parseInt(row.created_at, 10),
      }));
    } catch (error) {
      console.error('[BoltcardStore] getCardTransactions error:', error.message);
      return [];
    }
  }

  /**
   * Increment daily spent amount (atomic operation with balance deduction)
   * @param {string} cardId - Card ID
   * @param {number} amount - Amount to add to daily spent and deduct from balance
   * @returns {Promise<{success: boolean, balance?: number, dailySpent?: number}>}
   */
  async incrementDailySpent(cardId, amount) {
    try {
      const now = Date.now();
      
      // First check if daily limit needs reset
      const card = await this.getCard(cardId);
      if (!card) {
        return { success: false, error: 'Card not found' };
      }
      
      if (card.status !== CardStatus.ACTIVE) {
        return { success: false, error: 'Card is not active' };
      }
      
      // Check if we need to reset daily spent
      if (card.dailyResetAt && card.dailyResetAt < now) {
        await query(
          `UPDATE boltcards 
           SET daily_spent = 0, daily_reset_at = $2 
           WHERE id = $1`,
          [cardId, now + (24 * 60 * 60 * 1000)]
        );
        card.dailySpent = 0;
      }
      
      // Check balance
      console.log(`[BoltcardStore] incrementDailySpent: cardId=${cardId}, balance=${card.balance}, amount=${amount}, check=(${card.balance} < ${amount})`);
      if (card.balance < amount) {
        console.log(`[BoltcardStore] Insufficient balance: ${card.balance} < ${amount}`);
        return { success: false, error: 'Insufficient balance' };
      }
      
      // Check per-transaction limit
      if (card.maxTxAmount && amount > card.maxTxAmount) {
        return { success: false, error: 'Amount exceeds per-transaction limit' };
      }
      
      // Check daily limit
      if (card.dailyLimit && (card.dailySpent + amount) > card.dailyLimit) {
        return { success: false, error: 'Amount exceeds daily limit' };
      }
      
      // Atomic update: deduct balance and increment daily spent
      const result = await query(
        `UPDATE boltcards 
         SET balance = balance - $2,
             daily_spent = daily_spent + $2,
             last_used_at = $3
         WHERE id = $1 
           AND status = 'ACTIVE'
           AND balance >= $2
         RETURNING balance, daily_spent`,
        [cardId, amount, now]
      );
      
      if (result.rowCount === 0) {
        return { success: false, error: 'Failed to update card' };
      }
      
      const row = result.rows[0];
      return {
        success: true,
        balance: parseInt(row.balance, 10),
        dailySpent: parseInt(row.daily_spent, 10),
      };
    } catch (error) {
      console.error('[BoltcardStore] incrementDailySpent error:', error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Reset daily spent for a card
   * @param {string} cardId - Card ID
   * @returns {Promise<boolean>} Success
   */
  async resetDailySpent(cardId) {
    try {
      const now = Date.now();
      const result = await query(
        `UPDATE boltcards 
         SET daily_spent = 0, daily_reset_at = $2 
         WHERE id = $1 
         RETURNING id`,
        [cardId, now + (24 * 60 * 60 * 1000)]
      );
      
      return result.rowCount > 0;
    } catch (error) {
      console.error('[BoltcardStore] resetDailySpent error:', error.message);
      return false;
    }
  }

  /**
   * Rollback a failed spend (restore balance and daily spent)
   * Used when payment fails after balance was deducted
   * @param {string} cardId - Card ID
   * @param {number} amount - Amount to restore
   * @returns {Promise<boolean>} Success
   */
  async rollbackSpend(cardId, amount) {
    try {
      const result = await query(
        `UPDATE boltcards 
         SET balance = balance + $2, daily_spent = GREATEST(0, daily_spent - $2)
         WHERE id = $1
         RETURNING id, balance, daily_spent`,
        [cardId, amount]
      );
      
      if (result.rowCount > 0) {
        const row = result.rows[0];
        console.log(`[BoltcardStore] Rolled back spend for card ${cardId}: +${amount} (balance: ${row.balance})`);
        return true;
      }
      return false;
    } catch (error) {
      console.error('[BoltcardStore] rollbackSpend error:', error.message);
      return false;
    }
  }

  /**
   * Update last counter (for replay protection)
   * @param {string} cardId - Card ID
   * @param {number} counter - New counter value
   * @returns {Promise<boolean>} Success
   */
  async updateLastCounter(cardId, counter) {
    try {
      // Only update if new counter is greater (prevents replay)
      const result = await query(
        `UPDATE boltcards 
         SET last_counter = $2 
         WHERE id = $1 AND last_counter < $2
         RETURNING id`,
        [cardId, counter]
      );
      
      return result.rowCount > 0;
    } catch (error) {
      console.error('[BoltcardStore] updateLastCounter error:', error.message);
      return false;
    }
  }

  /**
   * Activate a pending card
   * @param {string} cardId - Card ID
   * @returns {Promise<boolean>} Success
   */
  async activateCard(cardId) {
    try {
      const now = Date.now();
      const result = await query(
        `UPDATE boltcards 
         SET status = 'ACTIVE', activated_at = $2, disabled_at = NULL
         WHERE id = $1 AND status IN ('PENDING', 'DISABLED')
         RETURNING id`,
        [cardId, now]
      );
      
      if (result.rowCount > 0) {
        console.log(`[BoltcardStore] Activated card: ${cardId}`);
        return true;
      }
      return false;
    } catch (error) {
      console.error('[BoltcardStore] activateCard error:', error.message);
      return false;
    }
  }

  /**
   * Disable a card (temporary)
   * @param {string} cardId - Card ID
   * @returns {Promise<boolean>} Success
   */
  async disableCard(cardId) {
    try {
      const now = Date.now();
      const result = await query(
        `UPDATE boltcards 
         SET status = 'DISABLED', disabled_at = $2
         WHERE id = $1 AND status = 'ACTIVE'
         RETURNING id`,
        [cardId, now]
      );
      
      if (result.rowCount > 0) {
        console.log(`[BoltcardStore] Disabled card: ${cardId}`);
        return true;
      }
      return false;
    } catch (error) {
      console.error('[BoltcardStore] disableCard error:', error.message);
      return false;
    }
  }

  /**
   * Enable a disabled card
   * @param {string} cardId - Card ID
   * @returns {Promise<boolean>} Success
   */
  async enableCard(cardId) {
    try {
      const result = await query(
        `UPDATE boltcards 
         SET status = 'ACTIVE', disabled_at = NULL
         WHERE id = $1 AND status = 'DISABLED'
         RETURNING id`,
        [cardId]
      );
      
      if (result.rowCount > 0) {
        console.log(`[BoltcardStore] Enabled card: ${cardId}`);
        return true;
      }
      return false;
    } catch (error) {
      console.error('[BoltcardStore] enableCard error:', error.message);
      return false;
    }
  }

  /**
   * Wipe a card (permanent delete marker)
   * @param {string} cardId - Card ID
   * @returns {Promise<boolean>} Success
   */
  async wipeCard(cardId) {
    try {
      const now = Date.now();
      const result = await query(
        `UPDATE boltcards 
         SET status = 'WIPED', disabled_at = $2
         WHERE id = $1 AND status != 'WIPED'
         RETURNING id`,
        [cardId, now]
      );
      
      if (result.rowCount > 0) {
        console.log(`[BoltcardStore] Wiped card: ${cardId}`);
        return true;
      }
      return false;
    } catch (error) {
      console.error('[BoltcardStore] wipeCard error:', error.message);
      return false;
    }
  }

  // ==========================================================================
  // PENDING TOP-UP MANAGEMENT (for LNURL-pay)
  // ==========================================================================

  /**
   * Store a pending top-up in the database
   * @param {string} cardId - Card ID
   * @param {string} paymentHash - Payment hash from invoice
   * @param {number} amount - Amount in sats/cents
   * @param {string} currency - 'BTC' or 'USD'
   * @returns {Promise<boolean>} Success
   */
  async storePendingTopUp(cardId, paymentHash, amount, currency = 'BTC') {
    const now = Date.now();
    const expiresAt = now + (60 * 60 * 1000); // 1 hour expiry
    
    try {
      await query(
        `INSERT INTO boltcard_pending_topups 
         (payment_hash, card_id, amount, currency, created_at, expires_at, processed)
         VALUES ($1, $2, $3, $4, $5, $6, FALSE)
         ON CONFLICT (payment_hash) DO UPDATE SET
           card_id = $2, amount = $3, currency = $4, expires_at = $6, processed = FALSE`,
        [paymentHash, cardId, amount, currency, now, expiresAt]
      );
      
      console.log(`[BoltcardStore] Stored pending top-up: ${paymentHash.substring(0, 16)}... for card ${cardId}`);
      return true;
    } catch (error) {
      console.error('[BoltcardStore] storePendingTopUp error:', error.message);
      return false;
    }
  }

  /**
   * Get a pending top-up by payment hash
   * @param {string} paymentHash - Payment hash
   * @returns {Promise<object|null>} Pending top-up data or null
   */
  async getPendingTopUp(paymentHash) {
    try {
      const result = await query(
        `SELECT * FROM boltcard_pending_topups 
         WHERE payment_hash = $1 AND processed = FALSE AND expires_at > $2`,
        [paymentHash, Date.now()]
      );
      
      if (result.rows.length === 0) {
        return null;
      }
      
      const row = result.rows[0];
      return {
        paymentHash: row.payment_hash,
        cardId: row.card_id,
        amount: parseInt(row.amount, 10),
        currency: row.currency,
        createdAt: parseInt(row.created_at, 10),
        expiresAt: parseInt(row.expires_at, 10),
      };
    } catch (error) {
      console.error('[BoltcardStore] getPendingTopUp error:', error.message);
      return null;
    }
  }

  /**
   * Mark a pending top-up as processed
   * @param {string} paymentHash - Payment hash
   * @returns {Promise<boolean>} Success
   */
  async markTopUpProcessed(paymentHash) {
    try {
      const result = await query(
        `UPDATE boltcard_pending_topups 
         SET processed = TRUE, processed_at = $2
         WHERE payment_hash = $1 AND processed = FALSE
         RETURNING payment_hash`,
        [paymentHash, Date.now()]
      );
      
      return result.rowCount > 0;
    } catch (error) {
      console.error('[BoltcardStore] markTopUpProcessed error:', error.message);
      return false;
    }
  }

  /**
   * Delete a pending top-up
   * @param {string} paymentHash - Payment hash
   * @returns {Promise<boolean>} Success
   */
  async deletePendingTopUp(paymentHash) {
    try {
      const result = await query(
        `DELETE FROM boltcard_pending_topups WHERE payment_hash = $1 RETURNING payment_hash`,
        [paymentHash]
      );
      
      return result.rowCount > 0;
    } catch (error) {
      console.error('[BoltcardStore] deletePendingTopUp error:', error.message);
      return false;
    }
  }

  /**
   * Get all pending (unprocessed) top-ups - for debugging/admin
   * @returns {Promise<Array>} Array of pending top-ups
   */
  async getAllPendingTopUps() {
    try {
      const result = await query(
        `SELECT * FROM boltcard_pending_topups 
         WHERE processed = FALSE AND expires_at > $1
         ORDER BY created_at DESC`,
        [Date.now()]
      );
      
      return result.rows.map(row => ({
        paymentHash: row.payment_hash,
        cardId: row.card_id,
        amount: parseInt(row.amount, 10),
        currency: row.currency,
        createdAt: parseInt(row.created_at, 10),
        expiresAt: parseInt(row.expires_at, 10),
      }));
    } catch (error) {
      console.error('[BoltcardStore] getAllPendingTopUps error:', error.message);
      return [];
    }
  }

  /**
   * Cleanup expired/processed pending top-ups
   * @returns {Promise<number>} Number of deleted records
   */
  async cleanupPendingTopUps() {
    try {
      const result = await query(`SELECT cleanup_boltcard_pending_topups()`);
      return result.rows[0]?.cleanup_boltcard_pending_topups || 0;
    } catch (error) {
      console.error('[BoltcardStore] cleanupPendingTopUps error:', error.message);
      return 0;
    }
  }

  /**
   * Top up a card's balance (for LNURL-pay)
   * @param {string} cardId - Card ID
   * @param {number} amount - Amount to add
   * @param {string} paymentHash - Lightning payment hash
   * @param {string} description - Optional description
   * @returns {Promise<{success: boolean, balance?: number, transaction?: object}>}
   */
  async topUpCard(cardId, amount, paymentHash, description = null) {
    try {
      // Atomic update: add to balance
      const result = await query(
        `UPDATE boltcards 
         SET balance = balance + $2
         WHERE id = $1 AND status = 'ACTIVE'
         RETURNING balance`,
        [cardId, amount]
      );
      
      if (result.rowCount === 0) {
        return { success: false, error: 'Card not found or not active' };
      }
      
      const newBalance = parseInt(result.rows[0].balance, 10);
      
      // Record the top-up transaction
      const tx = await this.recordTransaction(cardId, {
        type: TxType.TOPUP,
        amount,
        balanceAfter: newBalance,
        paymentHash,
        description: description || 'Card top-up',
      });
      
      console.log(`[BoltcardStore] Topped up card ${cardId}: +${amount} (new balance: ${newBalance})`);
      
      return {
        success: true,
        balance: newBalance,
        transaction: tx,
      };
    } catch (error) {
      console.error('[BoltcardStore] topUpCard error:', error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get store statistics
   * @returns {Promise<object>} Stats object
   */
  async getStats() {
    try {
      const result = await query(`SELECT * FROM boltcard_stats`);
      
      if (result.rows.length === 0) {
        return {
          total: 0,
          pending: 0,
          active: 0,
          disabled: 0,
          wiped: 0,
          btcCards: 0,
          usdCards: 0,
          totalBtcBalanceSats: 0,
          totalUsdBalanceCents: 0,
          issuerKeys: 0,
          pendingRegistrations: 0,
        };
      }
      
      const row = result.rows[0];
      return {
        total: parseInt(row.total, 10),
        pending: parseInt(row.pending, 10),
        active: parseInt(row.active, 10),
        disabled: parseInt(row.disabled, 10),
        wiped: parseInt(row.wiped, 10),
        btcCards: parseInt(row.btc_cards, 10),
        usdCards: parseInt(row.usd_cards, 10),
        totalBtcBalanceSats: parseInt(row.total_btc_balance_sats, 10),
        totalUsdBalanceCents: parseInt(row.total_usd_balance_cents, 10),
        issuerKeys: parseInt(row.issuer_keys || 0, 10),
        pendingRegistrations: parseInt(row.pending_registrations || 0, 10),
      };
    } catch (error) {
      console.error('[BoltcardStore] getStats error:', error.message);
      return {
        total: 0,
        pending: 0,
        active: 0,
        disabled: 0,
        wiped: 0,
        btcCards: 0,
        usdCards: 0,
        totalBtcBalanceSats: 0,
        totalUsdBalanceCents: 0,
        issuerKeys: 0,
        pendingRegistrations: 0,
      };
    }
  }
}

// Export singleton instance and constants
const boltcardStore = new BoltcardStore();

module.exports = boltcardStore;
module.exports.CardStatus = CardStatus;
module.exports.TxType = TxType;
module.exports.PendingStatus = PendingStatus;
