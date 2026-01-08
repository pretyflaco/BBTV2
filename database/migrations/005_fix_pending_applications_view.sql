-- Migration 005: Fix pending_applications view to return 'id' instead of 'membership_id'
-- 
-- Issue: The view returns 'membership_id' but the UI expects 'id', causing approval to fail
-- with "Application ID is required" error.

-- Drop and recreate the view with correct field name
DROP VIEW IF EXISTS pending_applications;

CREATE OR REPLACE VIEW pending_applications AS
SELECT 
    cm.id as id,  -- Changed from 'membership_id' to 'id'
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

-- Update schema version
INSERT INTO system_metrics (metric_name, metric_value, recorded_at)
VALUES ('schema_version', '5', NOW())
ON CONFLICT (metric_name) DO UPDATE
SET metric_value = EXCLUDED.metric_value, recorded_at = NOW();
