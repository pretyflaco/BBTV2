-- ============================================
-- ADD BLINK TEAM COMMUNITY
-- Version: 004
-- Description: Adds Blink Team as a pioneer circular economy
-- Date: 2026-01-08
-- ============================================

-- ============================================
-- ADD BLINK TEAM LEADER TO WHITELIST
-- ============================================

INSERT INTO community_leader_whitelist (npub, display_name, added_by, reason, status)
VALUES (
    'npub13ljnkd633c7maxatymv3y2fqq8vt3qk7j3tt0vytv90eztwgha9qmfcfhw',
    'Blink Team Leader',
    'npub1flac02t5hw6jljk8x7mec22uq37ert8d3y3mpwzcma726g5pz4lsmfzlk6',
    'Pioneer community leader - Blink Team',
    'active'
)
ON CONFLICT (npub) DO UPDATE SET
    display_name = EXCLUDED.display_name,
    reason = EXCLUDED.reason,
    updated_at = NOW();

-- ============================================
-- ADD BLINK TEAM COMMUNITY
-- ============================================

INSERT INTO communities (
    id, name, slug, description,
    country_code, region, city, latitude, longitude,
    leader_npub, status
)
VALUES (
    'a1b2c3d4-e5f6-7890-abcd-ef1234567004',
    'Blink Team',
    'blink-team',
    'Supporting everyday bitcoin adoption by example',
    'HN',
    'Cortés',
    'Prospera',
    15.5149,
    -88.0253,
    'npub13ljnkd633c7maxatymv3y2fqq8vt3qk7j3tt0vytv90eztwgha9qmfcfhw',
    'active'
)
ON CONFLICT (slug) DO UPDATE SET
    description = EXCLUDED.description,
    latitude = EXCLUDED.latitude,
    longitude = EXCLUDED.longitude,
    updated_at = NOW();

-- Create leader membership for Blink Team
INSERT INTO community_memberships (
    community_id, user_npub, role, status, approved_at
)
VALUES (
    'a1b2c3d4-e5f6-7890-abcd-ef1234567004',
    'npub13ljnkd633c7maxatymv3y2fqq8vt3qk7j3tt0vytv90eztwgha9qmfcfhw',
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
    4, 
    'version', 
    '{"description": "Add Blink Team community", "date": "2026-01-08"}'
);

-- ============================================
-- COMPLETION
-- ============================================

DO $$
BEGIN
    RAISE NOTICE 'Blink Team community added successfully!';
    RAISE NOTICE 'Community: Blink Team (Prospera, Honduras)';
    RAISE NOTICE 'Leader: npub13ljnkd633c7maxatymv3y2fqq8vt3qk7j3tt0vytv90eztwgha9qmfcfhw';
END $$;
