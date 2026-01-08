-- ============================================
-- NETWORK COMMUNITIES MIGRATION
-- Version: 002
-- Description: Add tables for Bitcoin Circular Economy communities,
--              membership management, data sharing consent, and metrics
-- Date: 2025-12-31
-- ============================================

-- ============================================
-- LEADER WHITELIST TABLE
-- Controls who can create communities
-- ============================================
CREATE TABLE IF NOT EXISTS community_leader_whitelist (
    id BIGSERIAL PRIMARY KEY,
    
    -- Nostr identity
    npub VARCHAR(70) UNIQUE NOT NULL,  -- Nostr public key (npub format)
    pubkey_hex VARCHAR(64),             -- Hex format for lookups
    
    -- Metadata
    display_name VARCHAR(255),
    added_by VARCHAR(70),               -- npub of admin who added
    reason TEXT,                        -- Why whitelisted
    
    -- Status
    status VARCHAR(20) DEFAULT 'active',  -- active, suspended, revoked
    
    -- Timestamps
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    
    CONSTRAINT check_whitelist_status CHECK (status IN ('active', 'suspended', 'revoked'))
);

-- ============================================
-- COMMUNITIES TABLE
-- Bitcoin Circular Economies (e.g., Bitcoin Ekasi)
-- ============================================
CREATE TABLE IF NOT EXISTS communities (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Basic info
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(100) UNIQUE NOT NULL,  -- URL-friendly identifier
    description TEXT,
    
    -- Location (for heat map)
    country_code VARCHAR(3),            -- ISO 3166-1 alpha-2/3
    region VARCHAR(255),                -- State/Province
    city VARCHAR(255),
    latitude DECIMAL(10, 7),            -- For map positioning
    longitude DECIMAL(10, 7),
    
    -- Leader (Nostr identity)
    leader_npub VARCHAR(70) NOT NULL,   -- Nostr public key of leader
    leader_pubkey_hex VARCHAR(64),      -- Hex format for lookups
    
    -- Settings (JSON for flexibility)
    settings JSONB DEFAULT '{
        "visibility": "public",
        "require_approval": true,
        "data_sharing_required": false,
        "show_member_count": true,
        "show_metrics": true
    }'::jsonb,
    
    -- Stats (denormalized for performance)
    member_count INTEGER DEFAULT 0,
    data_sharing_member_count INTEGER DEFAULT 0,
    
    -- Status
    status VARCHAR(20) DEFAULT 'active',  -- active, suspended, archived
    
    -- Timestamps
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT check_community_status CHECK (status IN ('active', 'suspended', 'archived')),
    CONSTRAINT fk_leader_whitelist FOREIGN KEY (leader_npub) 
        REFERENCES community_leader_whitelist(npub) ON DELETE RESTRICT
);

-- ============================================
-- COMMUNITY MEMBERSHIPS TABLE
-- Tracks user membership in communities
-- ============================================
CREATE TABLE IF NOT EXISTS community_memberships (
    id BIGSERIAL PRIMARY KEY,
    
    -- References
    community_id UUID NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
    
    -- User identity (Nostr)
    user_npub VARCHAR(70) NOT NULL,
    user_pubkey_hex VARCHAR(64),
    
    -- Role
    role VARCHAR(20) DEFAULT 'member',  -- leader, admin, member
    
    -- Application/approval
    status VARCHAR(20) DEFAULT 'pending',  -- pending, approved, rejected, left
    application_note TEXT,               -- Message from applicant
    rejection_reason TEXT,               -- If rejected, why
    
    -- Approval tracking
    approved_by_npub VARCHAR(70),        -- Leader/admin who approved
    
    -- Timestamps
    applied_at TIMESTAMP DEFAULT NOW(),
    reviewed_at TIMESTAMP,
    approved_at TIMESTAMP,
    left_at TIMESTAMP,
    
    -- Unique constraint: one membership per user per community
    UNIQUE(community_id, user_npub),
    
    -- Constraints
    CONSTRAINT check_membership_role CHECK (role IN ('leader', 'admin', 'member')),
    CONSTRAINT check_membership_status CHECK (status IN ('pending', 'approved', 'rejected', 'left'))
);

-- ============================================
-- DATA SHARING CONSENTS TABLE
-- Tracks opt-in for transaction data sharing
-- ============================================
CREATE TABLE IF NOT EXISTS data_sharing_consents (
    id BIGSERIAL PRIMARY KEY,
    
    -- References
    membership_id BIGINT NOT NULL REFERENCES community_memberships(id) ON DELETE CASCADE,
    
    -- User identity (redundant for quick lookups)
    user_npub VARCHAR(70) NOT NULL,
    community_id UUID NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
    
    -- Consent
    consent_given BOOLEAN DEFAULT false,
    consent_version VARCHAR(20) DEFAULT '1.0',  -- For tracking consent policy versions
    
    -- Blink API access (encrypted at rest)
    blink_api_key_encrypted TEXT,        -- AES-256 encrypted READ-only API key
    blink_wallet_ids TEXT[],             -- Array of wallet IDs to sync
    blink_username VARCHAR(255),         -- Blink username for reference
    
    -- Sync status
    sync_status VARCHAR(20) DEFAULT 'never',  -- never, pending, syncing, synced, error
    last_sync_at TIMESTAMP,
    last_sync_error TEXT,
    next_sync_at TIMESTAMP,
    
    -- Transaction data boundaries
    sync_from_date TIMESTAMP,            -- Only sync transactions after this date
    total_transactions_synced INTEGER DEFAULT 0,
    
    -- Timestamps
    consented_at TIMESTAMP,
    revoked_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    
    -- Unique: one consent record per membership
    UNIQUE(membership_id),
    
    -- Constraints
    CONSTRAINT check_sync_status CHECK (sync_status IN ('never', 'pending', 'syncing', 'synced', 'error'))
);

-- ============================================
-- MEMBER TRANSACTIONS TABLE
-- Synced transaction data from members
-- ============================================
CREATE TABLE IF NOT EXISTS member_transactions (
    id BIGSERIAL PRIMARY KEY,
    
    -- References
    consent_id BIGINT NOT NULL REFERENCES data_sharing_consents(id) ON DELETE CASCADE,
    community_id UUID NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
    
    -- Transaction identity
    tx_id VARCHAR(255) NOT NULL,         -- Blink transaction ID
    
    -- Transaction data
    direction VARCHAR(10) NOT NULL,      -- SEND, RECEIVE
    settlement_amount BIGINT NOT NULL,   -- Amount in satoshis
    settlement_currency VARCHAR(10) DEFAULT 'BTC',
    status VARCHAR(20),
    
    -- Counterparty (for closed-loop detection)
    counterparty_username VARCHAR(255),  -- Blink username if intra-ledger
    counterparty_wallet_id VARCHAR(64),
    counterparty_in_community BOOLEAN,   -- TRUE if counterparty is community member
    
    -- Transaction type
    initiation_type VARCHAR(30),         -- Ln, OnChain, IntraLedger
    settlement_type VARCHAR(30),         -- Ln, OnChain, IntraLedger
    
    -- Timing
    tx_created_at TIMESTAMP NOT NULL,    -- Original transaction timestamp
    
    -- Metadata
    memo TEXT,
    
    -- Sync tracking
    synced_at TIMESTAMP DEFAULT NOW(),
    
    -- Prevent duplicates
    UNIQUE(consent_id, tx_id),
    
    -- Constraints
    CONSTRAINT check_tx_direction CHECK (direction IN ('SEND', 'RECEIVE'))
);

-- ============================================
-- COMMUNITY METRICS TABLE
-- Aggregated metrics computed periodically
-- ============================================
CREATE TABLE IF NOT EXISTS community_metrics (
    id BIGSERIAL PRIMARY KEY,
    
    -- References
    community_id UUID NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
    
    -- Time period
    period_type VARCHAR(20) NOT NULL,    -- daily, weekly, monthly
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    
    -- Member counts
    member_count INTEGER DEFAULT 0,
    data_sharing_member_count INTEGER DEFAULT 0,
    new_members INTEGER DEFAULT 0,
    
    -- Transaction metrics
    transaction_count BIGINT DEFAULT 0,
    transaction_volume_sats BIGINT DEFAULT 0,
    unique_transactors INTEGER DEFAULT 0,
    
    -- Closed-loop metrics (internal circulation)
    internal_tx_count BIGINT DEFAULT 0,       -- Transactions between community members
    internal_volume_sats BIGINT DEFAULT 0,
    
    -- Velocity metrics
    velocity DECIMAL(10, 4),              -- Average times BTC changes hands
    avg_tx_per_member DECIMAL(10, 2),
    
    -- Growth metrics (vs previous period)
    member_growth_percent DECIMAL(10, 2),
    tx_count_growth_percent DECIMAL(10, 2),
    volume_growth_percent DECIMAL(10, 2),
    
    -- Merchant activity (if we can categorize)
    unique_merchants INTEGER DEFAULT 0,
    
    -- Computation tracking
    computed_at TIMESTAMP DEFAULT NOW(),
    
    -- Unique: one metric record per community per period
    UNIQUE(community_id, period_type, period_start),
    
    -- Constraints
    CONSTRAINT check_period_type CHECK (period_type IN ('daily', 'weekly', 'monthly'))
);

-- ============================================
-- COMMUNITY MILESTONES TABLE
-- Track milestone achievements (future gamification)
-- ============================================
CREATE TABLE IF NOT EXISTS community_milestones (
    id BIGSERIAL PRIMARY KEY,
    
    -- References
    community_id UUID NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
    
    -- Milestone details
    milestone_type VARCHAR(50) NOT NULL,  -- first_50_members, first_closed_loop, etc.
    milestone_value BIGINT,               -- The threshold value
    
    -- Celebration status
    achieved_at TIMESTAMP DEFAULT NOW(),
    celebrated BOOLEAN DEFAULT false,
    celebration_data JSONB,               -- For storing announcement details
    
    -- Unique: one milestone per type per community
    UNIQUE(community_id, milestone_type)
);

-- ============================================
-- INDEXES FOR PERFORMANCE
-- ============================================

-- Leader whitelist indexes
CREATE INDEX IF NOT EXISTS idx_whitelist_npub ON community_leader_whitelist(npub);
CREATE INDEX IF NOT EXISTS idx_whitelist_status ON community_leader_whitelist(status);

-- Communities indexes
CREATE INDEX IF NOT EXISTS idx_communities_slug ON communities(slug);
CREATE INDEX IF NOT EXISTS idx_communities_leader ON communities(leader_npub);
CREATE INDEX IF NOT EXISTS idx_communities_status ON communities(status);
CREATE INDEX IF NOT EXISTS idx_communities_location ON communities(country_code, city);
CREATE INDEX IF NOT EXISTS idx_communities_coords ON communities(latitude, longitude) 
    WHERE latitude IS NOT NULL AND longitude IS NOT NULL;

-- Memberships indexes
CREATE INDEX IF NOT EXISTS idx_memberships_community ON community_memberships(community_id);
CREATE INDEX IF NOT EXISTS idx_memberships_user ON community_memberships(user_npub);
CREATE INDEX IF NOT EXISTS idx_memberships_status ON community_memberships(status);
CREATE INDEX IF NOT EXISTS idx_memberships_approved ON community_memberships(community_id, status) 
    WHERE status = 'approved';

-- Data sharing consents indexes
CREATE INDEX IF NOT EXISTS idx_consents_membership ON data_sharing_consents(membership_id);
CREATE INDEX IF NOT EXISTS idx_consents_community ON data_sharing_consents(community_id);
CREATE INDEX IF NOT EXISTS idx_consents_user ON data_sharing_consents(user_npub);
CREATE INDEX IF NOT EXISTS idx_consents_sync_status ON data_sharing_consents(sync_status);
CREATE INDEX IF NOT EXISTS idx_consents_next_sync ON data_sharing_consents(next_sync_at) 
    WHERE consent_given = true AND sync_status != 'error';

-- Member transactions indexes
CREATE INDEX IF NOT EXISTS idx_member_tx_consent ON member_transactions(consent_id);
CREATE INDEX IF NOT EXISTS idx_member_tx_community ON member_transactions(community_id);
CREATE INDEX IF NOT EXISTS idx_member_tx_date ON member_transactions(tx_created_at DESC);
CREATE INDEX IF NOT EXISTS idx_member_tx_counterparty ON member_transactions(counterparty_username) 
    WHERE counterparty_username IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_member_tx_internal ON member_transactions(community_id, counterparty_in_community) 
    WHERE counterparty_in_community = true;

-- Community metrics indexes
CREATE INDEX IF NOT EXISTS idx_metrics_community ON community_metrics(community_id);
CREATE INDEX IF NOT EXISTS idx_metrics_period ON community_metrics(period_type, period_start DESC);
CREATE INDEX IF NOT EXISTS idx_metrics_recent ON community_metrics(community_id, period_type, period_start DESC);

-- Milestones indexes
CREATE INDEX IF NOT EXISTS idx_milestones_community ON community_milestones(community_id);
CREATE INDEX IF NOT EXISTS idx_milestones_type ON community_milestones(milestone_type);

-- ============================================
-- VIEWS FOR NETWORK ANALYTICS
-- ============================================

-- Community leaderboard view
CREATE OR REPLACE VIEW community_leaderboard AS
SELECT 
    c.id,
    c.name,
    c.slug,
    c.country_code,
    c.city,
    c.member_count,
    c.data_sharing_member_count,
    cm.transaction_count,
    cm.transaction_volume_sats,
    cm.velocity,
    cm.tx_count_growth_percent,
    cm.internal_tx_count,
    CASE 
        WHEN cm.transaction_count > 0 
        THEN (cm.internal_tx_count::DECIMAL / cm.transaction_count * 100)
        ELSE 0 
    END as closed_loop_percent,
    cm.period_start,
    cm.period_end
FROM communities c
LEFT JOIN LATERAL (
    SELECT *
    FROM community_metrics
    WHERE community_id = c.id
      AND period_type = 'monthly'
    ORDER BY period_start DESC
    LIMIT 1
) cm ON true
WHERE c.status = 'active'
ORDER BY cm.transaction_volume_sats DESC NULLS LAST;

-- Pending applications view (for leaders)
CREATE OR REPLACE VIEW pending_applications AS
SELECT 
    cm.id as id,
    cm.community_id,
    c.name as community_name,
    cm.user_npub,
    cm.application_note,
    cm.applied_at,
    EXTRACT(EPOCH FROM (NOW() - cm.applied_at))/3600 as hours_pending
FROM community_memberships cm
JOIN communities c ON c.id = cm.community_id
WHERE cm.status = 'pending'
ORDER BY cm.applied_at ASC;

-- Data sync queue view
CREATE OR REPLACE VIEW data_sync_queue AS
SELECT 
    dsc.id as consent_id,
    dsc.community_id,
    c.name as community_name,
    dsc.user_npub,
    dsc.sync_status,
    dsc.last_sync_at,
    dsc.next_sync_at,
    dsc.total_transactions_synced,
    dsc.last_sync_error
FROM data_sharing_consents dsc
JOIN communities c ON c.id = dsc.community_id
WHERE dsc.consent_given = true
  AND (
    dsc.sync_status IN ('pending', 'never')
    OR (dsc.sync_status = 'synced' AND dsc.next_sync_at <= NOW())
  )
ORDER BY dsc.next_sync_at ASC NULLS FIRST;

-- Community heat map data view
CREATE OR REPLACE VIEW community_heatmap AS
SELECT 
    c.id,
    c.name,
    c.latitude,
    c.longitude,
    c.country_code,
    c.city,
    c.member_count,
    COALESCE(cm.transaction_volume_sats, 0) as volume_sats,
    COALESCE(cm.tx_count_growth_percent, 0) as growth_percent,
    -- Intensity score for heat map (normalize 0-100)
    LEAST(100, (
        (COALESCE(c.member_count, 0) * 2) +
        (COALESCE(cm.transaction_count, 0) / 10) +
        (GREATEST(0, COALESCE(cm.tx_count_growth_percent, 0)))
    )) as intensity_score
FROM communities c
LEFT JOIN LATERAL (
    SELECT *
    FROM community_metrics
    WHERE community_id = c.id
      AND period_type = 'monthly'
    ORDER BY period_start DESC
    LIMIT 1
) cm ON true
WHERE c.status = 'active'
  AND c.latitude IS NOT NULL
  AND c.longitude IS NOT NULL;

-- ============================================
-- FUNCTIONS
-- ============================================

-- Function to update community member counts
CREATE OR REPLACE FUNCTION update_community_member_counts()
RETURNS TRIGGER AS $$
BEGIN
    -- Update on membership changes
    UPDATE communities c
    SET 
        member_count = (
            SELECT COUNT(*) 
            FROM community_memberships 
            WHERE community_id = COALESCE(NEW.community_id, OLD.community_id)
              AND status = 'approved'
        ),
        data_sharing_member_count = (
            SELECT COUNT(*) 
            FROM data_sharing_consents 
            WHERE community_id = COALESCE(NEW.community_id, OLD.community_id)
              AND consent_given = true
        ),
        updated_at = NOW()
    WHERE id = COALESCE(NEW.community_id, OLD.community_id);
    
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Trigger for membership changes
CREATE TRIGGER trigger_update_member_counts
    AFTER INSERT OR UPDATE OR DELETE ON community_memberships
    FOR EACH ROW
    EXECUTE FUNCTION update_community_member_counts();

-- Function to update data sharing member count
CREATE OR REPLACE FUNCTION update_data_sharing_counts()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE communities c
    SET 
        data_sharing_member_count = (
            SELECT COUNT(*) 
            FROM data_sharing_consents 
            WHERE community_id = COALESCE(NEW.community_id, OLD.community_id)
              AND consent_given = true
        ),
        updated_at = NOW()
    WHERE id = COALESCE(NEW.community_id, OLD.community_id);
    
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Trigger for consent changes
CREATE TRIGGER trigger_update_data_sharing_counts
    AFTER INSERT OR UPDATE OR DELETE ON data_sharing_consents
    FOR EACH ROW
    EXECUTE FUNCTION update_data_sharing_counts();

-- Function to mark counterparty transactions as internal
CREATE OR REPLACE FUNCTION mark_internal_transactions(p_community_id UUID)
RETURNS INTEGER AS $$
DECLARE
    updated_count INTEGER;
BEGIN
    -- Mark transactions where counterparty is also a community member
    UPDATE member_transactions mt
    SET counterparty_in_community = true
    WHERE mt.community_id = p_community_id
      AND mt.counterparty_username IS NOT NULL
      AND mt.counterparty_in_community IS NOT true
      AND EXISTS (
          SELECT 1 
          FROM community_memberships cm
          JOIN data_sharing_consents dsc ON dsc.membership_id = cm.id
          WHERE cm.community_id = p_community_id
            AND cm.status = 'approved'
            AND dsc.blink_username = mt.counterparty_username
      );
    
    GET DIAGNOSTICS updated_count = ROW_COUNT;
    RETURN updated_count;
END;
$$ LANGUAGE plpgsql;

-- Function to compute community metrics for a period
CREATE OR REPLACE FUNCTION compute_community_metrics(
    p_community_id UUID,
    p_period_type VARCHAR(20),
    p_period_start DATE,
    p_period_end DATE
)
RETURNS VOID AS $$
DECLARE
    v_prev_period_start DATE;
    v_prev_member_count INTEGER;
    v_prev_tx_count BIGINT;
    v_prev_volume BIGINT;
BEGIN
    -- Calculate previous period for growth comparison
    CASE p_period_type
        WHEN 'daily' THEN v_prev_period_start := p_period_start - INTERVAL '1 day';
        WHEN 'weekly' THEN v_prev_period_start := p_period_start - INTERVAL '7 days';
        WHEN 'monthly' THEN v_prev_period_start := p_period_start - INTERVAL '1 month';
    END CASE;
    
    -- Get previous period stats
    SELECT member_count, transaction_count, transaction_volume_sats
    INTO v_prev_member_count, v_prev_tx_count, v_prev_volume
    FROM community_metrics
    WHERE community_id = p_community_id
      AND period_type = p_period_type
      AND period_start = v_prev_period_start;
    
    -- Insert or update metrics
    INSERT INTO community_metrics (
        community_id,
        period_type,
        period_start,
        period_end,
        member_count,
        data_sharing_member_count,
        new_members,
        transaction_count,
        transaction_volume_sats,
        unique_transactors,
        internal_tx_count,
        internal_volume_sats,
        velocity,
        avg_tx_per_member,
        member_growth_percent,
        tx_count_growth_percent,
        volume_growth_percent,
        computed_at
    )
    SELECT
        p_community_id,
        p_period_type,
        p_period_start,
        p_period_end,
        -- Member counts from community
        c.member_count,
        c.data_sharing_member_count,
        -- New members this period
        (SELECT COUNT(*) FROM community_memberships 
         WHERE community_id = p_community_id 
           AND status = 'approved' 
           AND approved_at >= p_period_start 
           AND approved_at < p_period_end),
        -- Transaction counts
        COALESCE(tx.tx_count, 0),
        COALESCE(tx.volume_sats, 0),
        COALESCE(tx.unique_users, 0),
        -- Internal transactions
        COALESCE(tx.internal_count, 0),
        COALESCE(tx.internal_volume, 0),
        -- Velocity (transactions per BTC in circulation - simplified)
        CASE WHEN tx.volume_sats > 0 
             THEN tx.tx_count::DECIMAL / (tx.volume_sats::DECIMAL / 100000000)
             ELSE 0 END,
        -- Avg transactions per member
        CASE WHEN c.data_sharing_member_count > 0 
             THEN COALESCE(tx.tx_count, 0)::DECIMAL / c.data_sharing_member_count
             ELSE 0 END,
        -- Growth percentages
        CASE WHEN v_prev_member_count > 0 
             THEN ((c.member_count - v_prev_member_count)::DECIMAL / v_prev_member_count * 100)
             ELSE 0 END,
        CASE WHEN v_prev_tx_count > 0 
             THEN ((COALESCE(tx.tx_count, 0) - v_prev_tx_count)::DECIMAL / v_prev_tx_count * 100)
             ELSE 0 END,
        CASE WHEN v_prev_volume > 0 
             THEN ((COALESCE(tx.volume_sats, 0) - v_prev_volume)::DECIMAL / v_prev_volume * 100)
             ELSE 0 END,
        NOW()
    FROM communities c
    LEFT JOIN LATERAL (
        SELECT 
            COUNT(*) as tx_count,
            SUM(settlement_amount) as volume_sats,
            COUNT(DISTINCT consent_id) as unique_users,
            COUNT(*) FILTER (WHERE counterparty_in_community = true) as internal_count,
            SUM(settlement_amount) FILTER (WHERE counterparty_in_community = true) as internal_volume
        FROM member_transactions
        WHERE community_id = p_community_id
          AND tx_created_at >= p_period_start
          AND tx_created_at < p_period_end
    ) tx ON true
    WHERE c.id = p_community_id
    ON CONFLICT (community_id, period_type, period_start)
    DO UPDATE SET
        member_count = EXCLUDED.member_count,
        data_sharing_member_count = EXCLUDED.data_sharing_member_count,
        new_members = EXCLUDED.new_members,
        transaction_count = EXCLUDED.transaction_count,
        transaction_volume_sats = EXCLUDED.transaction_volume_sats,
        unique_transactors = EXCLUDED.unique_transactors,
        internal_tx_count = EXCLUDED.internal_tx_count,
        internal_volume_sats = EXCLUDED.internal_volume_sats,
        velocity = EXCLUDED.velocity,
        avg_tx_per_member = EXCLUDED.avg_tx_per_member,
        member_growth_percent = EXCLUDED.member_growth_percent,
        tx_count_growth_percent = EXCLUDED.tx_count_growth_percent,
        volume_growth_percent = EXCLUDED.volume_growth_percent,
        computed_at = NOW();
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- UPDATE SCHEMA VERSION
-- ============================================

INSERT INTO system_metrics (metric_name, metric_value, metric_unit, tags)
VALUES (
    'schema_version', 
    2, 
    'version', 
    '{"description": "Network communities schema", "date": "2025-12-31"}'
);

-- ============================================
-- COMPLETION
-- ============================================

DO $$
BEGIN
    RAISE NOTICE 'Network communities migration completed successfully!';
    RAISE NOTICE 'Tables created: community_leader_whitelist, communities, community_memberships,';
    RAISE NOTICE '               data_sharing_consents, member_transactions, community_metrics,';
    RAISE NOTICE '               community_milestones';
    RAISE NOTICE 'Views created: community_leaderboard, pending_applications, data_sync_queue,';
    RAISE NOTICE '              community_heatmap';
    RAISE NOTICE 'Functions created: update_community_member_counts, update_data_sharing_counts,';
    RAISE NOTICE '                  mark_internal_transactions, compute_community_metrics';
END $$;
