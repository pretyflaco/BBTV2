-- ============================================
-- ADD MEMBER REMOVAL COLUMNS
-- Version: 013
-- Description: Add columns and status for member removal by leaders
-- Date: 2026-01-23
-- ============================================

-- Add new columns for tracking member removal
ALTER TABLE community_memberships 
ADD COLUMN IF NOT EXISTS removed_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS removed_by_npub VARCHAR(70);

-- Update check constraint to include 'removed' status
ALTER TABLE community_memberships 
DROP CONSTRAINT IF EXISTS check_membership_status;

ALTER TABLE community_memberships 
ADD CONSTRAINT check_membership_status 
CHECK (status IN ('pending', 'approved', 'rejected', 'left', 'removed'));

-- Add index for removed members (for cleanup/auditing)
CREATE INDEX IF NOT EXISTS idx_memberships_removed 
ON community_memberships(community_id, removed_at) 
WHERE status = 'removed';

-- ============================================
-- UPDATE SCHEMA VERSION
-- ============================================

INSERT INTO system_metrics (metric_name, metric_value, metric_unit, tags)
VALUES (
    'schema_version', 
    13, 
    'version', 
    '{"description": "Add member removal columns", "date": "2026-01-23"}'
);

-- ============================================
-- COMPLETION
-- ============================================

DO $$
BEGIN
    RAISE NOTICE 'Member removal columns added successfully!';
    RAISE NOTICE 'New columns: removed_at, removed_by_npub';
    RAISE NOTICE 'New status value: removed';
END $$;
