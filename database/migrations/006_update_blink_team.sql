-- Migration 006: Update Blink Team location and description
--
-- Changes:
-- - Location: San Francisco, California, US → Prospera, Honduras
-- - Description: Updated to reflect supporting everyday bitcoin adoption

UPDATE communities
SET 
    city = 'Prospera',
    region = 'Cortés',
    country = 'HN',
    description = 'Supporting everyday bitcoin adoption by example',
    updated_at = NOW()
WHERE id = 'a1b2c3d4-e5f6-7890-abcd-ef1234567004';

-- Update schema version
INSERT INTO system_metrics (metric_name, metric_value, recorded_at)
VALUES ('schema_version', '6', NOW())
ON CONFLICT (metric_name) DO UPDATE
SET metric_value = EXCLUDED.metric_value, recorded_at = NOW();
