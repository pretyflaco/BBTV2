-- ============================================
-- BOLTCARDS TABLE MIGRATION
-- Version: 016
-- Description: Add Boltcard creation and management
-- Date: 2026-02-08
-- ============================================

-- ============================================
-- BOLTCARDS TABLE
-- Stores NFC Boltcard registrations with LNURL-withdraw
-- Supports both BTC and USD (Stablesats) wallets
-- ============================================

CREATE TABLE IF NOT EXISTS boltcards (
    -- Primary identifier (32-char hex from crypto.randomBytes(16))
    id VARCHAR(32) PRIMARY KEY,
    
    -- Card UID from NTAG424DNA (7 bytes = 14 hex chars)
    card_uid VARCHAR(14) UNIQUE NOT NULL,
    
    -- User-friendly card name
    name VARCHAR(100),
    
    -- Owner identification (Nostr pubkey)
    owner_pubkey VARCHAR(64) NOT NULL,
    
    -- Wallet configuration
    wallet_id VARCHAR(128) NOT NULL,
    wallet_currency VARCHAR(10) NOT NULL DEFAULT 'BTC',
    api_key_encrypted TEXT NOT NULL,
    
    -- NTAG424DNA authentication keys (AES-128, encrypted before storage)
    k0_encrypted TEXT NOT NULL,  -- AppMasterKey
    k1_encrypted TEXT NOT NULL,  -- EncryptionKey (PICCData encryption)
    k2_encrypted TEXT NOT NULL,  -- AuthenticationKey (SunMAC)
    k3_encrypted TEXT,           -- Reserved
    k4_encrypted TEXT,           -- Reserved
    
    -- Card version (increments on re-programming for key rotation)
    version INTEGER NOT NULL DEFAULT 1,
    
    -- Last seen counter (for replay protection)
    last_counter INTEGER NOT NULL DEFAULT 0,
    
    -- Balance tracking (sats for BTC, cents for USD)
    balance BIGINT NOT NULL DEFAULT 0,
    
    -- Spending limits (sats for BTC, cents for USD)
    max_tx_amount BIGINT,        -- Per-transaction limit
    daily_limit BIGINT,          -- Daily spending limit
    daily_spent BIGINT NOT NULL DEFAULT 0,
    daily_reset_at BIGINT,       -- Timestamp when daily_spent resets
    
    -- Status
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    
    -- Timestamps (BIGINT milliseconds for JS compatibility)
    created_at BIGINT NOT NULL,
    activated_at BIGINT,         -- When card was first used
    last_used_at BIGINT,
    disabled_at BIGINT,
    
    -- Environment (production/staging)
    environment VARCHAR(20) NOT NULL DEFAULT 'production',
    
    -- Constraints
    CONSTRAINT valid_boltcard_status CHECK (status IN ('PENDING', 'ACTIVE', 'DISABLED', 'WIPED')),
    CONSTRAINT valid_wallet_currency CHECK (wallet_currency IN ('BTC', 'USD'))
);

-- ============================================
-- BOLTCARD TRANSACTIONS TABLE
-- Records all card spending and top-up history
-- ============================================

CREATE TABLE IF NOT EXISTS boltcard_transactions (
    id SERIAL PRIMARY KEY,
    
    -- Reference to card
    card_id VARCHAR(32) NOT NULL REFERENCES boltcards(id) ON DELETE CASCADE,
    
    -- Transaction type
    tx_type VARCHAR(20) NOT NULL,
    
    -- Amount (sats for BTC cards, cents for USD cards)
    amount BIGINT NOT NULL,
    
    -- Balance after this transaction
    balance_after BIGINT NOT NULL,
    
    -- Lightning payment details
    payment_hash VARCHAR(64),
    
    -- Description/memo
    description VARCHAR(500),
    
    -- Timestamp
    created_at BIGINT NOT NULL,
    
    -- Constraints
    CONSTRAINT valid_tx_type CHECK (tx_type IN ('WITHDRAW', 'TOPUP', 'ADJUST'))
);

-- ============================================
-- INDEXES
-- ============================================

-- Card lookups
CREATE INDEX IF NOT EXISTS idx_boltcards_owner 
ON boltcards(owner_pubkey);

CREATE INDEX IF NOT EXISTS idx_boltcards_card_uid 
ON boltcards(card_uid);

CREATE INDEX IF NOT EXISTS idx_boltcards_status 
ON boltcards(status);

CREATE INDEX IF NOT EXISTS idx_boltcards_active 
ON boltcards(owner_pubkey, status) 
WHERE status = 'ACTIVE';

-- Transaction lookups
CREATE INDEX IF NOT EXISTS idx_boltcard_tx_card 
ON boltcard_transactions(card_id);

CREATE INDEX IF NOT EXISTS idx_boltcard_tx_created 
ON boltcard_transactions(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_boltcard_tx_card_created 
ON boltcard_transactions(card_id, created_at DESC);

-- ============================================
-- HELPER FUNCTION: Reset daily spending limits
-- Called during withdraw requests
-- ============================================

CREATE OR REPLACE FUNCTION reset_boltcard_daily_limits()
RETURNS INTEGER AS $$
DECLARE
    updated_count INTEGER;
    now_ms BIGINT;
BEGIN
    now_ms := (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT;
    
    UPDATE boltcards
    SET daily_spent = 0,
        daily_reset_at = now_ms + (24 * 60 * 60 * 1000)  -- 24 hours from now
    WHERE status = 'ACTIVE'
      AND daily_reset_at IS NOT NULL
      AND daily_reset_at < now_ms;
    
    GET DIAGNOSTICS updated_count = ROW_COUNT;
    RETURN updated_count;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- VIEW: Boltcard statistics
-- ============================================

CREATE OR REPLACE VIEW boltcard_stats AS
SELECT 
    COUNT(*) as total,
    COUNT(*) FILTER (WHERE status = 'PENDING') as pending,
    COUNT(*) FILTER (WHERE status = 'ACTIVE') as active,
    COUNT(*) FILTER (WHERE status = 'DISABLED') as disabled,
    COUNT(*) FILTER (WHERE status = 'WIPED') as wiped,
    COUNT(*) FILTER (WHERE wallet_currency = 'BTC') as btc_cards,
    COUNT(*) FILTER (WHERE wallet_currency = 'USD') as usd_cards,
    COALESCE(SUM(balance) FILTER (WHERE wallet_currency = 'BTC' AND status = 'ACTIVE'), 0) as total_btc_balance_sats,
    COALESCE(SUM(balance) FILTER (WHERE wallet_currency = 'USD' AND status = 'ACTIVE'), 0) as total_usd_balance_cents
FROM boltcards;

-- ============================================
-- SCHEMA VERSION UPDATE
-- ============================================

INSERT INTO system_metrics (metric_name, metric_value, metric_unit, tags)
VALUES (
    'schema_version', 
    16, 
    'version', 
    '{"description": "Add boltcards and boltcard_transactions tables", "date": "2026-02-08"}'
);

-- ============================================
-- COMPLETION NOTICE
-- ============================================

DO $$
BEGIN
    RAISE NOTICE 'Migration 016 completed: Boltcards tables created';
    RAISE NOTICE 'Tables: boltcards, boltcard_transactions';
    RAISE NOTICE 'Functions: reset_boltcard_daily_limits()';
    RAISE NOTICE 'Views: boltcard_stats';
END $$;
