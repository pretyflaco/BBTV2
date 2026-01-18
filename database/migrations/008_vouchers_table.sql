-- ============================================
-- VOUCHERS TABLE MIGRATION
-- Version: 008
-- Description: Add persistent voucher storage to PostgreSQL
-- Date: 2026-01-18
-- ============================================

-- ============================================
-- VOUCHERS TABLE
-- Stores Bitcoin Lightning vouchers (LNURL-withdraw)
-- Replaces file-based .voucher-store.json
-- ============================================

CREATE TABLE IF NOT EXISTS vouchers (
    -- Primary identifier (32-char hex from crypto.randomBytes(16))
    id VARCHAR(32) PRIMARY KEY,
    
    -- Amount in satoshis
    amount_sats BIGINT NOT NULL CHECK (amount_sats > 0),
    
    -- Blink wallet credentials (encrypted API key)
    wallet_id VARCHAR(128) NOT NULL,
    api_key_encrypted TEXT NOT NULL,
    
    -- Status tracking
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    claimed BOOLEAN NOT NULL DEFAULT FALSE,
    
    -- Timestamps (stored as BIGINT milliseconds for JS compatibility)
    created_at BIGINT NOT NULL,
    expires_at BIGINT NOT NULL,
    claimed_at BIGINT,
    cancelled_at BIGINT,
    
    -- Expiry configuration preset ID
    expiry_id VARCHAR(10) NOT NULL DEFAULT '6mo',
    
    -- Display info for fiat amounts
    display_amount VARCHAR(50),
    display_currency VARCHAR(10),
    commission_percent DECIMAL(5, 2) DEFAULT 0,
    
    -- Status constraint
    CONSTRAINT valid_voucher_status CHECK (status IN ('ACTIVE', 'CLAIMED', 'CANCELLED', 'EXPIRED'))
);

-- Index for wallet-based queries (unclaimed count per wallet)
CREATE INDEX IF NOT EXISTS idx_vouchers_wallet_status 
ON vouchers(wallet_id, status) 
WHERE status = 'ACTIVE';

-- Index for listing vouchers (sorted by creation time)
CREATE INDEX IF NOT EXISTS idx_vouchers_created_at 
ON vouchers(created_at DESC);

-- Index for expiry checking (find expired vouchers efficiently)
CREATE INDEX IF NOT EXISTS idx_vouchers_expires_at 
ON vouchers(expires_at) 
WHERE status = 'ACTIVE';

-- Index for status filtering
CREATE INDEX IF NOT EXISTS idx_vouchers_status 
ON vouchers(status);

-- ============================================
-- HELPER FUNCTION: Update expired voucher status
-- Called lazily during queries
-- ============================================

CREATE OR REPLACE FUNCTION update_expired_vouchers()
RETURNS INTEGER AS $$
DECLARE
    updated_count INTEGER;
BEGIN
    UPDATE vouchers
    SET status = 'EXPIRED'
    WHERE status = 'ACTIVE'
      AND expires_at < (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT;
    
    GET DIAGNOSTICS updated_count = ROW_COUNT;
    RETURN updated_count;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- HELPER FUNCTION: Cleanup old vouchers
-- Removes vouchers past retention period
-- Called lazily during list operations
-- ============================================

CREATE OR REPLACE FUNCTION cleanup_old_vouchers()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
    now_ms BIGINT;
    claimed_retention_ms BIGINT := 30 * 24 * 60 * 60 * 1000;    -- 30 days
    cancelled_retention_ms BIGINT := 30 * 24 * 60 * 60 * 1000;  -- 30 days
    expired_retention_ms BIGINT := 7 * 24 * 60 * 60 * 1000;     -- 7 days
BEGIN
    now_ms := (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT;
    
    -- Delete old claimed vouchers
    DELETE FROM vouchers
    WHERE status = 'CLAIMED'
      AND claimed_at IS NOT NULL
      AND (now_ms - claimed_at) > claimed_retention_ms;
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    
    -- Delete old cancelled vouchers
    DELETE FROM vouchers
    WHERE status = 'CANCELLED'
      AND cancelled_at IS NOT NULL
      AND (now_ms - cancelled_at) > cancelled_retention_ms;
    
    GET DIAGNOSTICS deleted_count = deleted_count + ROW_COUNT;
    
    -- Delete old expired vouchers
    DELETE FROM vouchers
    WHERE status = 'EXPIRED'
      AND expires_at IS NOT NULL
      AND (now_ms - expires_at) > expired_retention_ms;
    
    GET DIAGNOSTICS deleted_count = deleted_count + ROW_COUNT;
    
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- VIEW: Voucher statistics
-- ============================================

CREATE OR REPLACE VIEW voucher_stats AS
SELECT 
    COUNT(*) as total,
    COUNT(*) FILTER (WHERE status = 'ACTIVE') as active,
    COUNT(*) FILTER (WHERE status = 'CLAIMED') as claimed,
    COUNT(*) FILTER (WHERE status = 'CANCELLED') as cancelled,
    COUNT(*) FILTER (WHERE status = 'EXPIRED') as expired,
    COUNT(*) FILTER (
        WHERE status = 'ACTIVE' 
        AND expires_at < ((EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT + 24 * 60 * 60 * 1000)
    ) as expiring_soon
FROM vouchers;

-- ============================================
-- SCHEMA VERSION UPDATE
-- ============================================

INSERT INTO system_metrics (metric_name, metric_value, metric_unit, tags)
VALUES (
    'schema_version', 
    8, 
    'version', 
    '{"description": "Add vouchers table for persistent storage", "date": "2026-01-18"}'
);

-- ============================================
-- COMPLETION NOTICE
-- ============================================

DO $$
BEGIN
    RAISE NOTICE 'Migration 008 completed: Vouchers table created';
    RAISE NOTICE 'Tables: vouchers';
    RAISE NOTICE 'Functions: update_expired_vouchers(), cleanup_old_vouchers()';
    RAISE NOTICE 'Views: voucher_stats';
END $$;
