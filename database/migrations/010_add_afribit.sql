-- ============================================
-- ADD AFRIBIT KIBERA COMMUNITY
-- Version: 010
-- Description: Adds Afribit Kibera as a pioneer circular economy in Kibera, Kenya
-- Date: 2026-01-23
-- ============================================

-- ============================================
-- ADD AFRIBIT LEADER TO WHITELIST
-- ============================================

INSERT INTO community_leader_whitelist (npub, display_name, added_by, reason, status)
VALUES (
    'npub1djkgnrt4y05htqk7cxztnvqwcuyd3tea0jrxr8z9e6jx0zashskqkq9fhz',
    'Afribit Kibera Leader',
    'npub1flac02t5hw6jljk8x7mec22uq37ert8d3y3mpwzcma726g5pz4lsmfzlk6',
    'Pioneer community leader - Afribit Kibera, Kenya',
    'active'
)
ON CONFLICT (npub) DO UPDATE SET
    display_name = EXCLUDED.display_name,
    reason = EXCLUDED.reason,
    updated_at = NOW();

-- ============================================
-- ADD AFRIBIT KIBERA COMMUNITY
-- ============================================

INSERT INTO communities (
    id, name, slug, description,
    country_code, region, city, latitude, longitude,
    leader_npub, status
)
VALUES (
    'a1b2c3d4-e5f6-7890-abcd-ef1234567006',
    'Afribit Kibera',
    'afribit-kibera',
    'Bitcoin circular economy in Kibera, Kenya. Empowering one of Africa''s largest informal settlements through Bitcoin education and local commerce.',
    'KE',
    'Nairobi County',
    'Kibera',
    -1.3133,
    36.7876,
    'npub1djkgnrt4y05htqk7cxztnvqwcuyd3tea0jrxr8z9e6jx0zashskqkq9fhz',
    'active'
)
ON CONFLICT (slug) DO UPDATE SET
    description = EXCLUDED.description,
    latitude = EXCLUDED.latitude,
    longitude = EXCLUDED.longitude,
    updated_at = NOW();

-- Create leader membership for Afribit Kibera
INSERT INTO community_memberships (
    community_id, user_npub, role, status, approved_at
)
VALUES (
    'a1b2c3d4-e5f6-7890-abcd-ef1234567006',
    'npub1djkgnrt4y05htqk7cxztnvqwcuyd3tea0jrxr8z9e6jx0zashskqkq9fhz',
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
    10, 
    'version', 
    '{"description": "Add Afribit Kibera community (Kenya)", "date": "2026-01-23"}'
);

-- ============================================
-- COMPLETION
-- ============================================

DO $$
BEGIN
    RAISE NOTICE 'Afribit Kibera community added successfully!';
    RAISE NOTICE 'Community: Afribit Kibera (Kibera, Kenya)';
    RAISE NOTICE 'Leader: npub1djkgnrt4y05htqk7cxztnvqwcuyd3tea0jrxr8z9e6jx0zashskqkq9fhz';
END $$;
