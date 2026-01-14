-- ============================================
-- BlinkPOS Database Initialization
-- Description: Initial schema setup for PostgreSQL container
-- ============================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- SYSTEM METRICS TABLE
-- Tracks schema versions and system-level metrics
-- ============================================
CREATE TABLE IF NOT EXISTS system_metrics (
    id BIGSERIAL PRIMARY KEY,
    metric_name VARCHAR(255) NOT NULL,
    metric_value DECIMAL(20, 4),
    metric_unit VARCHAR(50),
    tags JSONB,
    recorded_at TIMESTAMP DEFAULT NOW(),
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_system_metrics_name ON system_metrics(metric_name);
CREATE INDEX IF NOT EXISTS idx_system_metrics_recorded ON system_metrics(recorded_at DESC);

-- Record initial schema version
INSERT INTO system_metrics (metric_name, metric_value, metric_unit, tags)
VALUES (
    'schema_version', 
    1, 
    'version', 
    '{"description": "Initial schema setup", "date": "2025-01-14"}'
);

-- ============================================
-- COMPLETION
-- ============================================
DO $$
BEGIN
    RAISE NOTICE 'BlinkPOS database initialized successfully!';
    RAISE NOTICE 'Extensions enabled: uuid-ossp';
    RAISE NOTICE 'Tables created: system_metrics';
END $$;
