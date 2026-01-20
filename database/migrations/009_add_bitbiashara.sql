-- ============================================
-- ADD BITBIASHARA COMMUNITY
-- Version: 009
-- Description: Adds Bitbiashara as a pioneer circular economy in Nairobi, Kenya
-- Date: 2026-01-21
-- ============================================

-- ============================================
-- ADD BITBIASHARA LEADER TO WHITELIST
-- ============================================

INSERT INTO community_leader_whitelist (npub, display_name, added_by, reason, status)
VALUES (
    'npub1kk20h7w79xd79nzm9fj9aqugwf57qpx0letx6rncfjecrhd4x4yqn7rq3x',
    'Bitbiashara Leader',
    'npub1flac02t5hw6jljk8x7mec22uq37ert8d3y3mpwzcma726g5pz4lsmfzlk6',
    'Pioneer community leader - Bitbiashara, Nairobi, Kenya',
    'active'
)
ON CONFLICT (npub) DO UPDATE SET
    display_name = EXCLUDED.display_name,
    reason = EXCLUDED.reason,
    updated_at = NOW();

-- ============================================
-- ADD BITBIASHARA COMMUNITY
-- ============================================

INSERT INTO communities (
    id, name, slug, description,
    country_code, region, city, latitude, longitude,
    leader_npub, status
)
VALUES (
    'a1b2c3d4-e5f6-7890-abcd-ef1234567005',
    'Bitbiashara',
    'bitbiashara',
    'Bitcoin circular economy in Nairobi, Kenya. Building grassroots Bitcoin adoption through local commerce and community education.',
    'KE',
    'Nairobi County',
    'Nairobi',
    -1.2921,
    36.8219,
    'npub1kk20h7w79xd79nzm9fj9aqugwf57qpx0letx6rncfjecrhd4x4yqn7rq3x',
    'active'
)
ON CONFLICT (slug) DO UPDATE SET
    description = EXCLUDED.description,
    latitude = EXCLUDED.latitude,
    longitude = EXCLUDED.longitude,
    updated_at = NOW();

-- Create leader membership for Bitbiashara
INSERT INTO community_memberships (
    community_id, user_npub, role, status, approved_at
)
VALUES (
    'a1b2c3d4-e5f6-7890-abcd-ef1234567005',
    'npub1kk20h7w79xd79nzm9fj9aqugwf57qpx0letx6rncfjecrhd4x4yqn7rq3x',
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
    9, 
    'version', 
    '{"description": "Add Bitbiashara community (Nairobi, Kenya)", "date": "2026-01-21"}'
);

-- ============================================
-- COMPLETION
-- ============================================

DO $$
BEGIN
    RAISE NOTICE 'Bitbiashara community added successfully!';
    RAISE NOTICE 'Community: Bitbiashara (Nairobi, Kenya)';
    RAISE NOTICE 'Leader: npub1kk20h7w79xd79nzm9fj9aqugwf57qpx0letx6rncfjecrhd4x4yqn7rq3x';
END $$;
