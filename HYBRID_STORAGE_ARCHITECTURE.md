# Hybrid Storage Architecture: Redis + PostgreSQL

## 🎯 Executive Summary

Replace the current file-based `tip-store.js` with a production-ready hybrid storage system:
- **Redis**: Fast, ephemeral storage for active payment splits (hot data)
- **PostgreSQL**: Persistent storage for completed payments and audit trails (cold data)

## 📊 Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    Payment Flow                              │
└─────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│  1. Invoice Created → Store split metadata in REDIS         │
│     Key: tip:{paymentHash}                                   │
│     TTL: 24 hours (auto-expire)                             │
│     Value: {baseAmount, tipAmount, userWallet, etc}         │
└─────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│  2. Payment Detected → Retrieve from REDIS                  │
│     - Fast lookup (sub-millisecond)                         │
│     - If not in Redis → check Postgres (fallback)          │
└─────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│  3. Process Payment Split                                    │
│     - Forward base amount to user                           │
│     - Send tip to recipient                                 │
└─────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│  4. Archive & Cleanup                                        │
│     - Write completed payment to POSTGRES                   │
│     - Delete from REDIS (immediately)                       │
│     - Keep in Postgres for audit/analytics                  │
└─────────────────────────────────────────────────────────────┘
```

## 🗄️ Database Schema Design

### PostgreSQL Tables

#### **Table: `payment_splits`**
Main table for completed payment split records.

```sql
CREATE TABLE payment_splits (
    -- Primary identification
    id BIGSERIAL PRIMARY KEY,
    payment_hash VARCHAR(64) UNIQUE NOT NULL,
    
    -- User context
    user_wallet_id VARCHAR(100) NOT NULL,
    user_api_key_encrypted TEXT NOT NULL, -- Encrypted for security
    username VARCHAR(50),
    
    -- Amount breakdown
    total_amount BIGINT NOT NULL,
    base_amount BIGINT NOT NULL,
    tip_amount BIGINT NOT NULL,
    tip_percent DECIMAL(5,2),
    
    -- Display currency info
    display_currency VARCHAR(10) DEFAULT 'BTC',
    base_amount_display DECIMAL(20,8),
    tip_amount_display DECIMAL(20,8),
    
    -- Recipient info
    tip_recipient VARCHAR(50),
    
    -- Status tracking
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    -- Status values: 'pending', 'processing', 'completed', 'failed'
    
    -- Processing timestamps
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    paid_at TIMESTAMP,
    processed_at TIMESTAMP,
    
    -- Processing results
    user_payment_hash VARCHAR(64), -- Hash of payment to user
    tip_payment_hash VARCHAR(64),  -- Hash of payment to tip recipient
    error_message TEXT,
    
    -- Metadata
    memo TEXT,
    invoice_satoshis BIGINT,
    
    -- Indexes for common queries
    INDEX idx_payment_hash (payment_hash),
    INDEX idx_user_wallet (user_wallet_id),
    INDEX idx_created_at (created_at),
    INDEX idx_status (status),
    INDEX idx_tip_recipient (tip_recipient)
);
```

#### **Table: `payment_events`**
Audit trail for all state changes.

```sql
CREATE TABLE payment_events (
    id BIGSERIAL PRIMARY KEY,
    payment_hash VARCHAR(64) NOT NULL,
    event_type VARCHAR(50) NOT NULL,
    -- Event types: 'created', 'paid', 'forwarding_started', 'forwarding_completed', 
    --              'tip_sent', 'failed', 'expired'
    
    event_data JSONB, -- Flexible storage for event-specific data
    timestamp TIMESTAMP NOT NULL DEFAULT NOW(),
    
    INDEX idx_payment_hash_events (payment_hash),
    INDEX idx_event_type (event_type),
    INDEX idx_timestamp (timestamp),
    
    FOREIGN KEY (payment_hash) REFERENCES payment_splits(payment_hash)
);
```

#### **Table: `tip_recipients_stats`**
Aggregate statistics for tip recipients.

```sql
CREATE TABLE tip_recipients_stats (
    id BIGSERIAL PRIMARY KEY,
    recipient_username VARCHAR(50) UNIQUE NOT NULL,
    
    total_tips_received BIGINT DEFAULT 0,
    total_tips_count INTEGER DEFAULT 0,
    average_tip_amount DECIMAL(20,2),
    
    first_tip_received_at TIMESTAMP,
    last_tip_received_at TIMESTAMP,
    
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    
    INDEX idx_recipient (recipient_username)
);
```

#### **Table: `system_metrics`**
Track system performance and health.

```sql
CREATE TABLE system_metrics (
    id BIGSERIAL PRIMARY KEY,
    metric_name VARCHAR(100) NOT NULL,
    metric_value DECIMAL(20,4),
    metric_unit VARCHAR(20),
    timestamp TIMESTAMP NOT NULL DEFAULT NOW(),
    
    metadata JSONB, -- Additional context
    
    INDEX idx_metric_name (metric_name),
    INDEX idx_timestamp_metrics (timestamp)
);
```

## 🔴 Redis Strategy

### **Key Structure**

```
# Active payment splits (ephemeral, 24h TTL)
tip:{paymentHash} → JSON string of split metadata

# Rate limiting (optional)
ratelimit:user:{walletId}:invoice → Counter (1 hour TTL)

# Processing locks (prevent duplicate processing)
lock:payment:{paymentHash} → "1" (5 minute TTL)

# Stats cache (1 hour TTL)
stats:recipient:{username} → JSON string
stats:daily:{date} → JSON string
```

### **Data Structure Example**

```json
// Key: tip:a1b2c3d4e5f6...
{
  "baseAmount": 10000,
  "tipAmount": 1500,
  "tipPercent": 15,
  "tipRecipient": "pretyflaco",
  "userApiKey": "encrypted_api_key_here",
  "userWalletId": "wallet_id_here",
  "displayCurrency": "USD",
  "baseAmountDisplay": 10.00,
  "tipAmountDisplay": 1.50,
  "createdAt": 1730000000000,
  "expiresAt": 1730086400000
}
```

### **TTL Strategy**

| Key Type | TTL | Reason |
|----------|-----|--------|
| `tip:{hash}` | 24 hours | Match invoice expiration |
| `lock:{hash}` | 5 minutes | Prevent race conditions |
| `ratelimit:*` | 1 hour | Rolling window rate limiting |
| `stats:*` | 1 hour | Reduce DB load |

## 🏗️ Implementation Plan

### **Phase 1: Infrastructure Setup** (Week 1)

#### 1.1 Install Dependencies
```bash
npm install redis ioredis pg
npm install --save-dev @types/pg
```

#### 1.2 Environment Configuration
Add to `.env.local`:
```bash
# Redis Configuration
REDIS_URL=redis://localhost:6379
REDIS_PASSWORD=your_redis_password
REDIS_TLS=false

# PostgreSQL Configuration
DATABASE_URL=postgresql://user:password@localhost:5432/blinkpos
DATABASE_POOL_MIN=2
DATABASE_POOL_MAX=10

# Feature Flags
USE_HYBRID_STORAGE=true
FALLBACK_TO_FILE_STORAGE=true
```

#### 1.3 Docker Compose for Local Development
Create `docker-compose.yml`:
```yaml
version: '3.8'

services:
  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data
    command: redis-server --appendonly yes
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 3s
      retries: 3

  postgres:
    image: postgres:15-alpine
    environment:
      POSTGRES_DB: blinkpos
      POSTGRES_USER: blinkuser
      POSTGRES_PASSWORD: blinkpass
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./database/init.sql:/docker-entrypoint-initdb.d/init.sql
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U blinkuser"]
      interval: 10s
      timeout: 3s
      retries: 3

volumes:
  redis_data:
  postgres_data:
```

### **Phase 2: Core Library Implementation** (Week 2)

#### 2.1 Redis Client (`lib/redis-client.js`)

```javascript
const Redis = require('ioredis');

class RedisClient {
  constructor() {
    this.client = null;
    this.isConnected = false;
  }

  async connect() {
    if (this.isConnected) return this.client;

    try {
      this.client = new Redis(process.env.REDIS_URL, {
        password: process.env.REDIS_PASSWORD,
        retryStrategy: (times) => {
          const delay = Math.min(times * 50, 2000);
          return delay;
        },
        maxRetriesPerRequest: 3,
      });

      this.client.on('connect', () => {
        console.log('✅ Redis connected');
        this.isConnected = true;
      });

      this.client.on('error', (err) => {
        console.error('❌ Redis error:', err);
        this.isConnected = false;
      });

      return this.client;
    } catch (error) {
      console.error('Failed to connect to Redis:', error);
      throw error;
    }
  }

  async disconnect() {
    if (this.client) {
      await this.client.quit();
      this.isConnected = false;
    }
  }

  getClient() {
    if (!this.isConnected) {
      throw new Error('Redis client not connected. Call connect() first.');
    }
    return this.client;
  }
}

// Singleton instance
const redisClient = new RedisClient();
module.exports = redisClient;
```

#### 2.2 Database Client (`lib/db-client.js`)

```javascript
const { Pool } = require('pg');

class DatabaseClient {
  constructor() {
    this.pool = null;
  }

  connect() {
    if (this.pool) return this.pool;

    this.pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      min: parseInt(process.env.DATABASE_POOL_MIN || '2'),
      max: parseInt(process.env.DATABASE_POOL_MAX || '10'),
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    });

    this.pool.on('connect', () => {
      console.log('✅ PostgreSQL connected');
    });

    this.pool.on('error', (err) => {
      console.error('❌ PostgreSQL error:', err);
    });

    return this.pool;
  }

  async query(text, params) {
    const client = await this.pool.connect();
    try {
      return await client.query(text, params);
    } finally {
      client.release();
    }
  }

  async transaction(callback) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await callback(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async disconnect() {
    if (this.pool) {
      await this.pool.end();
      this.pool = null;
    }
  }
}

// Singleton instance
const dbClient = new DatabaseClient();
module.exports = dbClient;
```

#### 2.3 Hybrid Tip Store (`lib/tip-store-hybrid.js`)

```javascript
const redisClient = require('./redis-client');
const dbClient = require('./db-client');
const AuthManager = require('./auth');

class HybridTipStore {
  constructor() {
    this.useHybrid = process.env.USE_HYBRID_STORAGE === 'true';
    this.fallbackToFile = process.env.FALLBACK_TO_FILE_STORAGE === 'true';
    this.fileStore = this.fallbackToFile ? require('./tip-store') : null;
  }

  async initialize() {
    if (!this.useHybrid) return;
    
    try {
      await redisClient.connect();
      dbClient.connect();
      console.log('✅ Hybrid storage initialized');
    } catch (error) {
      console.error('❌ Failed to initialize hybrid storage:', error);
      if (!this.fallbackToFile) throw error;
      console.log('⚠️ Falling back to file-based storage');
    }
  }

  async storeTipData(paymentHash, tipData) {
    const startTime = Date.now();
    
    try {
      // Step 1: Store in Redis (hot cache)
      if (this.useHybrid) {
        const redis = redisClient.getClient();
        const key = `tip:${paymentHash}`;
        const value = JSON.stringify({
          ...tipData,
          createdAt: Date.now(),
          expiresAt: Date.now() + (24 * 60 * 60 * 1000)
        });
        
        // Set with 24 hour expiry
        await redis.setex(key, 86400, value);
        
        console.log(`💾 Stored in Redis: ${key} (${Date.now() - startTime}ms)`);
      }

      // Step 2: Store in Postgres (persistent)
      if (this.useHybrid) {
        const db = dbClient;
        const encryptedApiKey = AuthManager.encryptApiKey(tipData.userApiKey);
        
        await db.query(`
          INSERT INTO payment_splits (
            payment_hash, user_wallet_id, user_api_key_encrypted,
            total_amount, base_amount, tip_amount, tip_percent,
            display_currency, base_amount_display, tip_amount_display,
            tip_recipient, status, memo
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
          ON CONFLICT (payment_hash) DO NOTHING
        `, [
          paymentHash,
          tipData.userWalletId,
          encryptedApiKey,
          (tipData.baseAmount || 0) + (tipData.tipAmount || 0),
          tipData.baseAmount || 0,
          tipData.tipAmount || 0,
          tipData.tipPercent || 0,
          tipData.displayCurrency || 'BTC',
          tipData.baseAmountDisplay,
          tipData.tipAmountDisplay,
          tipData.tipRecipient,
          'pending',
          tipData.memo || null
        ]);

        // Log event
        await db.query(`
          INSERT INTO payment_events (payment_hash, event_type, event_data)
          VALUES ($1, $2, $3)
        `, [paymentHash, 'created', JSON.stringify(tipData)]);

        console.log(`💾 Stored in Postgres: ${paymentHash} (${Date.now() - startTime}ms)`);
      }

      // Fallback to file storage if enabled
      if (this.fallbackToFile && this.fileStore) {
        this.fileStore.storeTipData(paymentHash, tipData);
      }

    } catch (error) {
      console.error('❌ Error storing tip data:', error);
      
      // Emergency fallback to file
      if (this.fallbackToFile && this.fileStore) {
        console.log('⚠️ Using file storage fallback');
        this.fileStore.storeTipData(paymentHash, tipData);
      } else {
        throw error;
      }
    }
  }

  async getTipData(paymentHash) {
    const startTime = Date.now();
    
    try {
      // Step 1: Try Redis first (fastest)
      if (this.useHybrid) {
        const redis = redisClient.getClient();
        const key = `tip:${paymentHash}`;
        const cached = await redis.get(key);
        
        if (cached) {
          console.log(`📋 Retrieved from Redis: ${key} (${Date.now() - startTime}ms)`);
          return JSON.parse(cached);
        }
        
        console.log(`⚠️ Not found in Redis: ${key}`);
      }

      // Step 2: Fallback to Postgres
      if (this.useHybrid) {
        const db = dbClient;
        const result = await db.query(`
          SELECT 
            payment_hash, user_wallet_id, user_api_key_encrypted,
            base_amount, tip_amount, tip_percent,
            display_currency, base_amount_display, tip_amount_display,
            tip_recipient, status
          FROM payment_splits
          WHERE payment_hash = $1 AND status = 'pending'
        `, [paymentHash]);

        if (result.rows.length > 0) {
          const row = result.rows[0];
          const tipData = {
            baseAmount: parseInt(row.base_amount),
            tipAmount: parseInt(row.tip_amount),
            tipPercent: parseFloat(row.tip_percent),
            tipRecipient: row.tip_recipient,
            userApiKey: AuthManager.decryptApiKey(row.user_api_key_encrypted),
            userWalletId: row.user_wallet_id,
            displayCurrency: row.display_currency,
            baseAmountDisplay: parseFloat(row.base_amount_display),
            tipAmountDisplay: parseFloat(row.tip_amount_display)
          };

          // Restore to Redis for next lookup
          const redis = redisClient.getClient();
          await redis.setex(`tip:${paymentHash}`, 86400, JSON.stringify(tipData));

          console.log(`📋 Retrieved from Postgres: ${paymentHash} (${Date.now() - startTime}ms)`);
          return tipData;
        }
      }

      // Step 3: Fallback to file storage
      if (this.fallbackToFile && this.fileStore) {
        console.log('⚠️ Checking file storage fallback');
        return this.fileStore.getTipData(paymentHash);
      }

      return null;

    } catch (error) {
      console.error('❌ Error retrieving tip data:', error);
      
      if (this.fallbackToFile && this.fileStore) {
        return this.fileStore.getTipData(paymentHash);
      }
      
      throw error;
    }
  }

  async removeTipData(paymentHash, result = {}) {
    try {
      // Step 1: Mark as processed in Postgres
      if (this.useHybrid) {
        const db = dbClient;
        
        await db.transaction(async (client) => {
          // Update payment split status
          await client.query(`
            UPDATE payment_splits 
            SET 
              status = $1,
              processed_at = NOW(),
              user_payment_hash = $2,
              tip_payment_hash = $3,
              error_message = $4
            WHERE payment_hash = $5
          `, [
            result.success ? 'completed' : 'failed',
            result.userPaymentHash || null,
            result.tipPaymentHash || null,
            result.error || null,
            paymentHash
          ]);

          // Log completion event
          await client.query(`
            INSERT INTO payment_events (payment_hash, event_type, event_data)
            VALUES ($1, $2, $3)
          `, [
            paymentHash,
            result.success ? 'completed' : 'failed',
            JSON.stringify(result)
          ]);

          // Update recipient stats if successful
          if (result.success && result.tipRecipient && result.tipAmount) {
            await client.query(`
              INSERT INTO tip_recipients_stats 
                (recipient_username, total_tips_received, total_tips_count, 
                 first_tip_received_at, last_tip_received_at)
              VALUES ($1, $2, 1, NOW(), NOW())
              ON CONFLICT (recipient_username) DO UPDATE SET
                total_tips_received = tip_recipients_stats.total_tips_received + $2,
                total_tips_count = tip_recipients_stats.total_tips_count + 1,
                last_tip_received_at = NOW(),
                updated_at = NOW()
            `, [result.tipRecipient, result.tipAmount]);
          }
        });
      }

      // Step 2: Remove from Redis
      if (this.useHybrid) {
        const redis = redisClient.getClient();
        await redis.del(`tip:${paymentHash}`);
        console.log(`🗑️ Removed from Redis: tip:${paymentHash}`);
      }

      // Step 3: Remove from file storage
      if (this.fallbackToFile && this.fileStore) {
        this.fileStore.removeTipData(paymentHash);
      }

    } catch (error) {
      console.error('❌ Error removing tip data:', error);
      // Don't throw - cleanup is best effort
    }
  }

  async getStats() {
    try {
      if (!this.useHybrid) {
        return this.fileStore ? this.fileStore.getStats() : {};
      }

      const db = dbClient;
      
      // Get stats from Postgres
      const result = await db.query(`
        SELECT 
          COUNT(*) FILTER (WHERE status = 'pending') as pending_count,
          COUNT(*) FILTER (WHERE status = 'processing') as processing_count,
          COUNT(*) FILTER (WHERE status = 'completed') as completed_count,
          COUNT(*) FILTER (WHERE status = 'failed') as failed_count,
          SUM(tip_amount) FILTER (WHERE status = 'completed') as total_tips_processed
        FROM payment_splits
        WHERE created_at > NOW() - INTERVAL '24 hours'
      `);

      return {
        last24Hours: result.rows[0],
        storage: 'hybrid (Redis + PostgreSQL)'
      };

    } catch (error) {
      console.error('Error getting stats:', error);
      return this.fileStore ? this.fileStore.getStats() : {};
    }
  }
}

// Export singleton
const hybridStore = new HybridTipStore();
module.exports = hybridStore;
```

### **Phase 3: Migration Strategy** (Week 3)

#### 3.1 Database Migrations

Create `database/migrations/001_initial_schema.sql`:
```sql
-- Run this file to set up the database
\i init.sql
```

Create `database/init.sql` with the schema from above.

#### 3.2 Data Migration Tool

Create `scripts/migrate-to-hybrid.js`:
```javascript
const fs = require('fs');
const path = require('path');
const hybridStore = require('../lib/tip-store-hybrid');

async function migrateFromFileStorage() {
  console.log('🔄 Starting migration from file storage to hybrid...');
  
  const STORE_FILE = path.join(process.cwd(), '.tip-store.json');
  
  if (!fs.existsSync(STORE_FILE)) {
    console.log('✅ No existing file storage found. Nothing to migrate.');
    return;
  }

  try {
    // Read existing data
    const data = JSON.parse(fs.readFileSync(STORE_FILE, 'utf8'));
    const entries = Object.entries(data);
    
    console.log(`📊 Found ${entries.length} entries to migrate`);

    // Initialize hybrid storage
    await hybridStore.initialize();

    let migrated = 0;
    let failed = 0;

    // Migrate each entry
    for (const [paymentHash, tipData] of entries) {
      try {
        await hybridStore.storeTipData(paymentHash, tipData);
        migrated++;
        console.log(`✅ Migrated: ${paymentHash}`);
      } catch (error) {
        failed++;
        console.error(`❌ Failed to migrate ${paymentHash}:`, error.message);
      }
    }

    console.log(`\n📊 Migration Summary:`);
    console.log(`  Total: ${entries.length}`);
    console.log(`  Migrated: ${migrated}`);
    console.log(`  Failed: ${failed}`);

    // Backup old file
    const backupFile = `${STORE_FILE}.backup.${Date.now()}`;
    fs.copyFileSync(STORE_FILE, backupFile);
    console.log(`\n💾 Backed up original file to: ${backupFile}`);

  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

// Run migration
migrateFromFileStorage()
  .then(() => {
    console.log('✅ Migration completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Migration error:', error);
    process.exit(1);
  });
```

#### 3.3 Gradual Rollout Strategy

1. **Phase 3.1**: Deploy with `FALLBACK_TO_FILE_STORAGE=true`
   - Writes to both systems
   - Reads from hybrid with file fallback
   - Zero risk, can roll back instantly

2. **Phase 3.2**: Monitor for 1 week
   - Check Redis hit rate
   - Verify Postgres writes
   - Monitor error rates

3. **Phase 3.3**: Disable fallback
   - Set `FALLBACK_TO_FILE_STORAGE=false`
   - Fully on hybrid storage
   - Remove file-based code in next release

### **Phase 4: API Integration** (Week 4)

#### 4.1 Update Create Invoice Endpoint

```javascript
// pages/api/blink/create-invoice.js
const hybridStore = require('../../../lib/tip-store-hybrid');

// Initialize on server start
hybridStore.initialize().catch(console.error);

// In the handler, replace:
// tipStore.storeTipData(...)
// with:
await hybridStore.storeTipData(invoice.paymentHash, { ... });
```

#### 4.2 Update Forward with Tips Endpoint

```javascript
// pages/api/blink/forward-with-tips.js
const hybridStore = require('../../../lib/tip-store-hybrid');

// Replace:
// const tipData = tipStore.getTipData(paymentHash);
// with:
const tipData = await hybridStore.getTipData(paymentHash);

// Replace:
// tipStore.removeTipData(paymentHash);
// with:
await hybridStore.removeTipData(paymentHash, {
  success: true,
  userPaymentHash: userInvoice.paymentHash,
  tipPaymentHash: tipResult?.paymentHash,
  tipRecipient: tipData.tipRecipient,
  tipAmount: tipData.tipAmount
});
```

## 📈 Monitoring & Observability

### **Metrics to Track**

```javascript
// lib/metrics.js
class MetricsCollector {
  async recordMetric(name, value, unit = 'count', metadata = {}) {
    const db = require('./db-client');
    
    await db.query(`
      INSERT INTO system_metrics (metric_name, metric_value, metric_unit, metadata)
      VALUES ($1, $2, $3, $4)
    `, [name, value, unit, JSON.stringify(metadata)]);
  }

  async recordPaymentProcessingTime(paymentHash, durationMs) {
    await this.recordMetric('payment_processing_time', durationMs, 'ms', {
      paymentHash: paymentHash.substring(0, 8)
    });
  }

  async recordRedisHit() {
    await this.recordMetric('redis_cache_hit', 1);
  }

  async recordRedisMiss() {
    await this.recordMetric('redis_cache_miss', 1);
  }
}

module.exports = new MetricsCollector();
```

### **Health Check Endpoint**

```javascript
// pages/api/health.js
const redisClient = require('../../lib/redis-client');
const dbClient = require('../../lib/db-client');

export default async function handler(req, res) {
  const health = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    checks: {}
  };

  // Check Redis
  try {
    const redis = redisClient.getClient();
    await redis.ping();
    health.checks.redis = { status: 'up', latency: 0 };
  } catch (error) {
    health.checks.redis = { status: 'down', error: error.message };
    health.status = 'degraded';
  }

  // Check Postgres
  try {
    const start = Date.now();
    await dbClient.query('SELECT 1');
    health.checks.postgres = { 
      status: 'up', 
      latency: Date.now() - start 
    };
  } catch (error) {
    health.checks.postgres = { status: 'down', error: error.message };
    health.status = 'degraded';
  }

  res.status(health.status === 'healthy' ? 200 : 503).json(health);
}
```

## 🚀 Deployment Checklist

### **Before Deployment**

- [ ] Set up Redis instance (AWS ElastiCache, Redis Cloud, etc.)
- [ ] Set up PostgreSQL instance (AWS RDS, Heroku Postgres, etc.)
- [ ] Run database migrations
- [ ] Update environment variables
- [ ] Test connections from app server to Redis/Postgres
- [ ] Set up monitoring alerts

### **Deployment Steps**

1. Deploy with hybrid storage + file fallback enabled
2. Run migration script to move existing data
3. Monitor for 24-48 hours
4. Verify all payments process correctly
5. Disable file fallback
6. Remove old file-based code

### **Rollback Plan**

If issues occur:
1. Set `USE_HYBRID_STORAGE=false`
2. App automatically falls back to file storage
3. No data loss (dual writes during transition)
4. Fix issues and redeploy

## 💰 Cost Estimates

### **AWS Example** (10,000 payments/day)

| Service | Configuration | Monthly Cost |
|---------|--------------|--------------|
| ElastiCache Redis | cache.t3.micro | $15 |
| RDS PostgreSQL | db.t3.micro | $20 |
| Data Transfer | 50GB/month | $5 |
| **Total** | | **~$40/month** |

### **Heroku Example**

| Service | Plan | Monthly Cost |
|---------|------|--------------|
| Heroku Redis | Mini | $15 |
| Heroku Postgres | Mini | $5 |
| **Total** | | **~$20/month** |

## 🎯 Performance Expectations

| Operation | File-Based | Hybrid | Improvement |
|-----------|-----------|---------|-------------|
| Store tip data | 5-10ms | <1ms (Redis) | 5-10x faster |
| Retrieve tip data | 5-10ms | <1ms (Redis) | 5-10x faster |
| Concurrent writes | ❌ Unsafe | ✅ Safe | Eliminates corruption |
| Multi-server | ❌ Broken | ✅ Works | Enables scaling |
| Data durability | ⚠️ At risk | ✅ Guaranteed | Much safer |
| Audit trail | ❌ None | ✅ Full | Compliance-ready |

## 📚 Next Steps

1. Review this architecture plan
2. Set up local Docker environment (`docker-compose up`)
3. Implement Phase 1 (infrastructure)
4. Test locally with hybrid storage
5. Deploy to staging with fallback enabled
6. Monitor and iterate
7. Production deployment

---

**Questions or concerns?** Review each phase carefully and adjust based on your specific requirements, budget, and timeline.

