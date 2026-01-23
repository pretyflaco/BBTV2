-- ============================================
-- MEMBER BALANCE SNAPSHOTS TABLE
-- Version: 012
-- Description: Stores periodic balance snapshots for Bitcoin Preference metric
--              Tracks BTC vs StableSats holdings over time
-- Date: 2026-01-23
-- ============================================

-- ============================================
-- CREATE BALANCE SNAPSHOTS TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS member_balance_snapshots (
    id BIGSERIAL PRIMARY KEY,
    consent_id BIGINT NOT NULL REFERENCES data_sharing_consents(id) ON DELETE CASCADE,
    community_id UUID NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
    
    -- Balance data (in satoshis)
    btc_balance_sats BIGINT NOT NULL DEFAULT 0,
    stablesats_balance_sats BIGINT NOT NULL DEFAULT 0,
    total_balance_sats BIGINT GENERATED ALWAYS AS (btc_balance_sats + stablesats_balance_sats) STORED,
    
    -- Calculated preference (0-100 percentage of BTC)
    btc_preference_pct DECIMAL(5,2) GENERATED ALWAYS AS (
        CASE 
            WHEN (btc_balance_sats + stablesats_balance_sats) = 0 THEN 50.00
            ELSE ROUND((btc_balance_sats::decimal / (btc_balance_sats + stablesats_balance_sats)::decimal) * 100, 2)
        END
    ) STORED,
    
    -- Snapshot metadata
    snapshot_date DATE NOT NULL DEFAULT CURRENT_DATE,
    created_at TIMESTAMP DEFAULT NOW(),
    
    -- Ensure one snapshot per consent per day
    CONSTRAINT unique_daily_snapshot UNIQUE (consent_id, snapshot_date)
);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_balance_snapshots_community 
    ON member_balance_snapshots(community_id, snapshot_date DESC);
CREATE INDEX IF NOT EXISTS idx_balance_snapshots_consent 
    ON member_balance_snapshots(consent_id, snapshot_date DESC);
CREATE INDEX IF NOT EXISTS idx_balance_snapshots_date 
    ON member_balance_snapshots(snapshot_date DESC);

-- ============================================
-- FUNCTION: Calculate Community Bitcoin Preference
-- Returns weighted average of member BTC preferences
-- ============================================

CREATE OR REPLACE FUNCTION calculate_community_btc_preference(
    p_community_id UUID,
    p_date DATE DEFAULT CURRENT_DATE
)
RETURNS TABLE (
    community_id UUID,
    snapshot_date DATE,
    total_btc_sats BIGINT,
    total_stablesats_sats BIGINT,
    total_balance_sats BIGINT,
    btc_preference_pct DECIMAL(5,2),
    member_count INT,
    members_with_balance INT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        p_community_id as community_id,
        p_date as snapshot_date,
        COALESCE(SUM(mbs.btc_balance_sats), 0)::BIGINT as total_btc_sats,
        COALESCE(SUM(mbs.stablesats_balance_sats), 0)::BIGINT as total_stablesats_sats,
        COALESCE(SUM(mbs.total_balance_sats), 0)::BIGINT as total_balance_sats,
        CASE 
            WHEN COALESCE(SUM(mbs.total_balance_sats), 0) = 0 THEN 50.00
            ELSE ROUND(
                (COALESCE(SUM(mbs.btc_balance_sats), 0)::decimal / 
                 COALESCE(SUM(mbs.total_balance_sats), 1)::decimal) * 100, 2
            )
        END::DECIMAL(5,2) as btc_preference_pct,
        COUNT(DISTINCT mbs.consent_id)::INT as member_count,
        COUNT(DISTINCT CASE WHEN mbs.total_balance_sats > 0 THEN mbs.consent_id END)::INT as members_with_balance
    FROM member_balance_snapshots mbs
    WHERE mbs.community_id = p_community_id
      AND mbs.snapshot_date = (
          SELECT MAX(mbs2.snapshot_date) 
          FROM member_balance_snapshots mbs2
          WHERE mbs2.community_id = p_community_id 
            AND mbs2.snapshot_date <= p_date
      );
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- VIEW: Latest Community Bitcoin Preference
-- Quick access to current BTC preference per community
-- ============================================

CREATE OR REPLACE VIEW community_btc_preference AS
SELECT 
    c.id as community_id,
    c.name as community_name,
    c.slug,
    bp.snapshot_date,
    bp.total_btc_sats,
    bp.total_stablesats_sats,
    bp.total_balance_sats,
    bp.btc_preference_pct,
    bp.member_count,
    bp.members_with_balance
FROM communities c
LEFT JOIN LATERAL (
    SELECT * FROM calculate_community_btc_preference(c.id, CURRENT_DATE)
) bp ON true
WHERE c.status = 'active';

-- ============================================
-- UPDATE SCHEMA VERSION
-- ============================================

INSERT INTO system_metrics (metric_name, metric_value, metric_unit, tags)
VALUES (
    'schema_version', 
    12, 
    'version', 
    '{"description": "Add member balance snapshots for Bitcoin Preference metric", "date": "2026-01-23"}'
);

-- ============================================
-- COMPLETION
-- ============================================

DO $$
BEGIN
    RAISE NOTICE 'Member balance snapshots table created successfully!';
    RAISE NOTICE 'New features:';
    RAISE NOTICE '  - member_balance_snapshots table for tracking BTC/StableSats balances';
    RAISE NOTICE '  - calculate_community_btc_preference() function';
    RAISE NOTICE '  - community_btc_preference view';
    RAISE NOTICE 'Bitcoin Preference metric now available!';
END $$;
