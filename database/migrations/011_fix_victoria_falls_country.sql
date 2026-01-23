-- ============================================
-- FIX BITCOIN VICTORIA FALLS COUNTRY
-- Version: 011
-- Description: Corrects Bitcoin Victoria Falls from Zimbabwe to Zambia
--              (The community is on the Zambian side of the falls)
-- Date: 2026-01-23
-- ============================================

-- ============================================
-- UPDATE COMMUNITY LOCATION
-- ============================================

UPDATE communities
SET 
    country_code = 'ZM',
    region = 'Southern Province',
    city = 'Livingstone',
    description = 'Zambia''s Bitcoin circular economy centered around the majestic Victoria Falls. Building a sustainable Bitcoin ecosystem for tourism and local commerce.',
    latitude = -17.9154,
    longitude = 25.8614,
    updated_at = NOW()
WHERE slug = 'bitcoin-victoria-falls';

-- ============================================
-- UPDATE WHITELIST ENTRY
-- ============================================

UPDATE community_leader_whitelist
SET 
    reason = 'Pioneer community leader - Bitcoin Victoria Falls, Zambia',
    updated_at = NOW()
WHERE npub = 'npub1xxcyzef28e5qcjncwmn6z2nmwaezs2apxc2v2f7unnvxw3r5edfsactfly';

-- ============================================
-- UPDATE SCHEMA VERSION
-- ============================================

INSERT INTO system_metrics (metric_name, metric_value, metric_unit, tags)
VALUES (
    'schema_version', 
    11, 
    'version', 
    '{"description": "Fix Bitcoin Victoria Falls country (ZW -> ZM)", "date": "2026-01-23"}'
);

-- ============================================
-- COMPLETION
-- ============================================

DO $$
BEGIN
    RAISE NOTICE 'Bitcoin Victoria Falls location corrected!';
    RAISE NOTICE 'Country: Zimbabwe (ZW) -> Zambia (ZM)';
    RAISE NOTICE 'City: Victoria Falls -> Livingstone';
    RAISE NOTICE 'Region: Matabeleland North -> Southern Province';
END $$;
