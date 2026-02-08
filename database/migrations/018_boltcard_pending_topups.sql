-- ============================================
-- BOLTCARD PENDING TOPUPS TABLE
-- Version: 018
-- Description: Add persistent storage for pending card top-ups
-- Date: 2026-02-08
-- 
-- This migration adds database-backed storage for pending top-ups
-- to prevent loss of top-up data on server restart.
-- Previously, pending top-ups were stored in memory only.
-- ============================================

-- ============================================
-- BOLTCARD PENDING TOPUPS TABLE
-- Stores pending LNURL-pay top-ups before payment confirmation
-- ============================================

CREATE TABLE IF NOT EXISTS boltcard_pending_topups (
    -- Payment hash is the primary key (unique per invoice)
    payment_hash VARCHAR(64) PRIMARY KEY,
    
    -- Reference to the card being topped up
    card_id VARCHAR(32) NOT NULL REFERENCES boltcards(id) ON DELETE CASCADE,
    
    -- Amount in sats (or cents for USD cards)
    amount BIGINT NOT NULL,
    
    -- Currency of the card (BTC or USD)
    currency VARCHAR(3) NOT NULL DEFAULT 'BTC',
    
    -- Timestamps
    created_at BIGINT NOT NULL,
    expires_at BIGINT NOT NULL,  -- Top-up expires after 1 hour
    
    -- Whether this top-up has been processed
    processed BOOLEAN DEFAULT FALSE,
    processed_at BIGINT,
    
    -- Constraints
    CONSTRAINT valid_topup_currency CHECK (currency IN ('BTC', 'USD'))
);

-- Index for finding pending top-ups by card
CREATE INDEX IF NOT EXISTS idx_pending_topups_card 
ON boltcard_pending_topups(card_id);

-- Index for cleanup of expired/processed top-ups
CREATE INDEX IF NOT EXISTS idx_pending_topups_expires 
ON boltcard_pending_topups(expires_at) 
WHERE processed = FALSE;

-- Index for quick lookup by payment hash when not processed
CREATE INDEX IF NOT EXISTS idx_pending_topups_unprocessed
ON boltcard_pending_topups(payment_hash)
WHERE processed = FALSE;

-- ============================================
-- HELPER FUNCTION: Cleanup expired/processed pending topups
-- ============================================

CREATE OR REPLACE FUNCTION cleanup_boltcard_pending_topups()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
    now_ms BIGINT;
BEGIN
    now_ms := (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT;
    
    -- Delete expired unprocessed top-ups (older than 2 hours)
    -- and processed top-ups (older than 24 hours)
    DELETE FROM boltcard_pending_topups
    WHERE (processed = FALSE AND expires_at < now_ms - 3600000)  -- 1 hour after expiry
       OR (processed = TRUE AND processed_at < now_ms - 86400000);  -- 24 hours after processing
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- SCHEMA VERSION UPDATE
-- ============================================

INSERT INTO system_metrics (metric_name, metric_value, metric_unit, tags)
VALUES (
    'schema_version', 
    18, 
    'version', 
    '{"description": "Boltcard pending topups table for persistent storage", "date": "2026-02-08"}'
);

-- ============================================
-- COMPLETION NOTICE
-- ============================================

DO $$
BEGIN
    RAISE NOTICE 'Migration 018 completed: Boltcard pending topups table created';
    RAISE NOTICE 'Table: boltcard_pending_topups';
    RAISE NOTICE 'Functions: cleanup_boltcard_pending_topups()';
END $$;
