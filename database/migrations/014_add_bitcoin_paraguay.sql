-- ============================================
-- ADD BITCOIN PARAGUAY COMMUNITY
-- Version: 014
-- Description: Adds Bitcoin Paraguay as a pioneer circular economy in Paraguay
-- Date: 2026-01-28
-- Website: https://bitcoinparaguay.org
-- ============================================

-- ============================================
-- ADD BITCOIN PARAGUAY LEADER TO WHITELIST
-- ============================================

INSERT INTO community_leader_whitelist (npub, display_name, added_by, reason, status)
VALUES (
    'npub1l57mdhhlkuulspszd6qarjxennpytglns6kth2agmjvrwyx8aqdqgj645x',
    'Bitcoin Paraguay Leader',
    'npub1flac02t5hw6jljk8x7mec22uq37ert8d3y3mpwzcma726g5pz4lsmfzlk6',
    'Pioneer community leader - Bitcoin Paraguay',
    'active'
)
ON CONFLICT (npub) DO UPDATE SET
    display_name = EXCLUDED.display_name,
    reason = EXCLUDED.reason,
    updated_at = NOW();

-- ============================================
-- ADD BITCOIN PARAGUAY COMMUNITY
-- ============================================

INSERT INTO communities (
    id, name, slug, description,
    country_code, region, city, latitude, longitude,
    leader_npub, status
)
VALUES (
    'a1b2c3d4-e5f6-7890-abcd-ef1234567007',
    'Bitcoin Paraguay',
    'bitcoin-paraguay',
    'Connecting people interested in Bitcoin across Paraguay. Exchanging knowledge, increasing adoption, and helping build local circular economies throughout the country. Partners include Blink, Hacking Lives, Trezor Academy, Vexl, and FireFish.',
    'PY',
    'Central',
    'Asuncion',
    -25.2637,
    -57.5759,
    'npub1l57mdhhlkuulspszd6qarjxennpytglns6kth2agmjvrwyx8aqdqgj645x',
    'active'
)
ON CONFLICT (slug) DO UPDATE SET
    description = EXCLUDED.description,
    latitude = EXCLUDED.latitude,
    longitude = EXCLUDED.longitude,
    updated_at = NOW();

-- Create leader membership for Bitcoin Paraguay
INSERT INTO community_memberships (
    community_id, user_npub, role, status, approved_at
)
VALUES (
    'a1b2c3d4-e5f6-7890-abcd-ef1234567007',
    'npub1l57mdhhlkuulspszd6qarjxennpytglns6kth2agmjvrwyx8aqdqgj645x',
    'leader',
    'approved',
    NOW()
)
ON CONFLICT (community_id, user_npub) DO UPDATE SET
    role = 'leader',
    status = 'approved';

-- ============================================
-- UPDATE SCHEMA VERSION
-- ============================================

INSERT INTO system_metrics (metric_name, metric_value, metric_unit, tags)
VALUES (
    'schema_version', 
    14, 
    'version', 
    '{"description": "Add Bitcoin Paraguay community", "date": "2026-01-28"}'
);

-- ============================================
-- COMPLETION
-- ============================================

DO $$
BEGIN
    RAISE NOTICE 'Bitcoin Paraguay community added successfully!';
    RAISE NOTICE 'Community: Bitcoin Paraguay (Asuncion, Paraguay)';
    RAISE NOTICE 'Website: https://bitcoinparaguay.org';
    RAISE NOTICE 'Leader: npub1l57mdhhlkuulspszd6qarjxennpytglns6kth2agmjvrwyx8aqdqgj645x';
END $$;
