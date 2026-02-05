-- ============================================
-- USD VOUCHER SUPPORT MIGRATION
-- Version: 015
-- Description: Add support for USD/Stablesats vouchers
-- Date: 2026-02-05
-- ============================================

-- ============================================
-- ADD NEW COLUMNS FOR USD VOUCHERS
-- ============================================

-- wallet_currency: 'BTC' or 'USD' - indicates which wallet type backs the voucher
ALTER TABLE vouchers 
ADD COLUMN IF NOT EXISTS wallet_currency VARCHAR(3) NOT NULL DEFAULT 'BTC';

-- usd_amount_cents: For USD vouchers, stores the value in cents
-- NULL for BTC vouchers (they only use amount_sats)
ALTER TABLE vouchers 
ADD COLUMN IF NOT EXISTS usd_amount_cents INTEGER;

-- environment: API environment for the voucher (production or staging)
-- Adding here in case it doesn't exist yet
ALTER TABLE vouchers 
ADD COLUMN IF NOT EXISTS environment VARCHAR(20) DEFAULT 'production';

-- ============================================
-- CONSTRAINTS
-- ============================================

-- Ensure wallet_currency is valid
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'valid_wallet_currency'
    ) THEN
        ALTER TABLE vouchers 
        ADD CONSTRAINT valid_wallet_currency 
        CHECK (wallet_currency IN ('BTC', 'USD'));
    END IF;
END $$;

-- Ensure USD vouchers have usd_amount_cents set
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'usd_voucher_has_amount'
    ) THEN
        ALTER TABLE vouchers 
        ADD CONSTRAINT usd_voucher_has_amount 
        CHECK (
            (wallet_currency = 'USD' AND usd_amount_cents IS NOT NULL AND usd_amount_cents > 0)
            OR
            (wallet_currency = 'BTC')
        );
    END IF;
END $$;

-- ============================================
-- INDEX FOR WALLET CURRENCY FILTERING
-- ============================================

CREATE INDEX IF NOT EXISTS idx_vouchers_wallet_currency 
ON vouchers(wallet_currency);

-- ============================================
-- UPDATE voucher_stats VIEW TO INCLUDE USD STATS
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
    ) as expiring_soon,
    -- USD voucher stats
    COUNT(*) FILTER (WHERE wallet_currency = 'USD') as total_usd,
    COUNT(*) FILTER (WHERE wallet_currency = 'USD' AND status = 'ACTIVE') as active_usd,
    COUNT(*) FILTER (WHERE wallet_currency = 'BTC') as total_btc,
    COUNT(*) FILTER (WHERE wallet_currency = 'BTC' AND status = 'ACTIVE') as active_btc
FROM vouchers;

-- ============================================
-- SCHEMA VERSION UPDATE
-- ============================================

INSERT INTO system_metrics (metric_name, metric_value, metric_unit, tags)
VALUES (
    'schema_version', 
    15, 
    'version', 
    '{"description": "Add USD/Stablesats voucher support", "date": "2026-02-05"}'
);

-- ============================================
-- COMPLETION NOTICE
-- ============================================

DO $$
BEGIN
    RAISE NOTICE 'Migration 015 completed: USD voucher support added';
    RAISE NOTICE 'New columns: wallet_currency, usd_amount_cents, environment';
    RAISE NOTICE 'Updated view: voucher_stats (with USD/BTC breakdown)';
END $$;
