/**
 * Hybrid Storage Manager for BlinkPOS
 * 
 * Uses Redis for hot data (active payments) and PostgreSQL for cold data (completed payments).
 * 
 * Features:
 * - Fast retrieval of active payment splits via Redis
 * - Persistent storage of all payments in PostgreSQL
 * - Automatic expiration of old Redis keys
 * - Audit trail via payment events
 * - Analytics via PostgreSQL views
 */

const { createClient } = require('redis');
const { Pool } = require('pg');
const crypto = require('crypto');

class HybridStore {
  constructor() {
    this.redis = null;
    this.pg = null;
    this.isRedisConnected = false;
    this.isPostgresConnected = false;
    
    // Configuration from environment
    this.config = {
      redis: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379'),
        password: process.env.REDIS_PASSWORD || undefined,
        db: parseInt(process.env.REDIS_DB || '0')
      },
      postgres: {
        host: process.env.POSTGRES_HOST || 'localhost',
        port: parseInt(process.env.POSTGRES_PORT || '5432'),
        database: process.env.POSTGRES_DB || 'blinkpos',
        user: process.env.POSTGRES_USER || 'blinkpos',
        password: process.env.POSTGRES_PASSWORD || 'blinkpos_dev_password',
        max: 20, // Max pool size
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 2000
      },
      ttl: {
        active: 900, // 15 minutes for active payments
        processing: 1800 // 30 minutes for processing payments
      }
    };
  }

  /**
   * Initialize connections to Redis and PostgreSQL
   */
  async connect() {
    // Connect to Redis
    try {
      this.redis = createClient({
        socket: {
          host: this.config.redis.host,
          port: this.config.redis.port
        },
        password: this.config.redis.password,
        database: this.config.redis.db
      });

      this.redis.on('error', (err) => {
        console.error('❌ Redis error:', err.message);
        this.isRedisConnected = false;
      });

      this.redis.on('connect', () => {
        console.log('✅ Redis connected');
        this.isRedisConnected = true;
      });

      await this.redis.connect();
    } catch (error) {
      console.error('❌ Failed to connect to Redis:', error.message);
      console.log('⚠️  Running in fallback mode without Redis cache');
    }

    // Connect to PostgreSQL
    try {
      this.pg = new Pool(this.config.postgres);

      // Test connection
      const client = await this.pg.connect();
      console.log('✅ PostgreSQL connected');
      this.isPostgresConnected = true;
      client.release();
    } catch (error) {
      console.error('❌ Failed to connect to PostgreSQL:', error.message);
      throw new Error('PostgreSQL connection required for operation');
    }

    // Start background cleanup job
    this.startCleanupJob();
  }

  /**
   * Disconnect from Redis and PostgreSQL
   */
  async disconnect() {
    if (this.redis && this.isRedisConnected) {
      await this.redis.quit();
      console.log('Redis disconnected');
    }
    if (this.pg && this.isPostgresConnected) {
      await this.pg.end();
      console.log('PostgreSQL disconnected');
    }
  }

  /**
   * Hash API key for privacy (don't store raw API keys)
   */
  hashApiKey(apiKey) {
    return crypto.createHash('sha256').update(apiKey).digest('hex');
  }

  /**
   * Generate Redis key for payment hash
   */
  getRedisKey(paymentHash) {
    return `blinkpos:payment:${paymentHash}`;
  }

  /**
   * Store tip data (called when invoice is created)
   */
  async storeTipData(paymentHash, tipData) {
    const startTime = Date.now();
    
    try {
      const {
        baseAmount,
        tipAmount,
        tipPercent,
        tipRecipient,
        userApiKey,
        userWalletId,
        displayCurrency = 'BTC',
        baseAmountDisplay,
        tipAmountDisplay,
        memo
      } = tipData;

      const totalAmount = baseAmount + tipAmount;
      const userApiKeyHash = this.hashApiKey(userApiKey);
      
      // Data to store
      const paymentData = {
        paymentHash,
        totalAmount,
        baseAmount,
        tipAmount,
        tipPercent: tipPercent || 0,
        tipRecipient: tipRecipient || null,
        userApiKeyHash,
        userApiKey, // Store for payment forwarding (TODO: encrypt in production)
        userWalletId,
        displayCurrency,
        baseAmountDisplay: baseAmountDisplay || null,
        tipAmountDisplay: tipAmountDisplay || null,
        memo: memo || null,
        status: 'pending',
        createdAt: new Date().toISOString()
      };

      // 1. Store in PostgreSQL (primary storage)
      // Note: Store userApiKey in metadata JSONB for now (TODO: encrypt in production)
      const metadata = {
        userApiKey, // TODO: Encrypt this in production
        baseAmountDisplay,
        tipAmountDisplay
      };
      
      const pgResult = await this.pg.query(`
        INSERT INTO payment_splits (
          payment_hash,
          user_api_key_hash,
          user_wallet_id,
          total_amount,
          base_amount,
          tip_amount,
          tip_percent,
          tip_recipient,
          display_currency,
          base_amount_display,
          tip_amount_display,
          memo,
          status,
          metadata,
          created_at,
          expires_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, NOW(), NOW() + INTERVAL '15 minutes')
        RETURNING id
      `, [
        paymentHash,
        userApiKeyHash,
        userWalletId,
        totalAmount,
        baseAmount,
        tipAmount,
        tipPercent || 0,
        tipRecipient,
        displayCurrency,
        baseAmountDisplay,
        tipAmountDisplay,
        memo,
        'pending',
        JSON.stringify(metadata)
      ]);

      // 2. Log event
      await this.logEvent(paymentHash, 'created', 'success', {
        totalAmount,
        tipAmount,
        tipRecipient
      });

      // 3. Store in Redis cache (if available)
      if (this.isRedisConnected) {
        try {
          const redisKey = this.getRedisKey(paymentHash);
          await this.redis.setEx(
            redisKey,
            this.config.ttl.active,
            JSON.stringify(paymentData)
          );
        } catch (redisError) {
          console.warn('⚠️  Redis cache write failed:', redisError.message);
          // Continue - PostgreSQL is source of truth
        }
      }

      const duration = Date.now() - startTime;
      console.log(`✅ Stored payment split ${paymentHash} (${duration}ms)`);
      
      return { success: true, id: pgResult.rows[0].id };
    } catch (error) {
      console.error('❌ Failed to store tip data:', error);
      
      // Log failure event
      try {
        await this.logEvent(paymentHash, 'created', 'failure', null, error.message);
      } catch (logError) {
        console.error('Failed to log error event:', logError);
      }
      
      throw error;
    }
  }

  /**
   * Retrieve tip data (called when payment is detected)
   */
  async getTipData(paymentHash) {
    const startTime = Date.now();
    
    try {
      // 1. Try Redis first (hot data)
      if (this.isRedisConnected) {
        try {
          const redisKey = this.getRedisKey(paymentHash);
          const cached = await this.redis.get(redisKey);
          
          if (cached) {
            const duration = Date.now() - startTime;
            console.log(`✅ Retrieved from Redis cache (${duration}ms)`);
            return JSON.parse(cached);
          }
        } catch (redisError) {
          console.warn('⚠️  Redis cache read failed:', redisError.message);
          // Fall through to PostgreSQL
        }
      }

      // 2. Retrieve from PostgreSQL (cold data or cache miss)
      const result = await this.pg.query(`
        SELECT 
          payment_hash as "paymentHash",
          total_amount as "totalAmount",
          base_amount as "baseAmount",
          tip_amount as "tipAmount",
          tip_percent as "tipPercent",
          tip_recipient as "tipRecipient",
          user_api_key_hash as "userApiKeyHash",
          user_wallet_id as "userWalletId",
          display_currency as "displayCurrency",
          base_amount_display as "baseAmountDisplay",
          tip_amount_display as "tipAmountDisplay",
          memo,
          status,
          metadata,
          created_at as "createdAt",
          expires_at as "expiresAt"
        FROM payment_splits
        WHERE payment_hash = $1
      `, [paymentHash]);

      if (result.rows.length === 0) {
        return null;
      }

      const paymentData = result.rows[0];
      
      // Extract userApiKey from metadata
      if (paymentData.metadata && paymentData.metadata.userApiKey) {
        paymentData.userApiKey = paymentData.metadata.userApiKey;
      }
      const duration = Date.now() - startTime;
      console.log(`✅ Retrieved from PostgreSQL (${duration}ms)`);

      // 3. Warm up Redis cache if payment is still active
      if (this.isRedisConnected && paymentData.status === 'pending') {
        try {
          const redisKey = this.getRedisKey(paymentHash);
          await this.redis.setEx(
            redisKey,
            this.config.ttl.active,
            JSON.stringify(paymentData)
          );
        } catch (redisError) {
          console.warn('⚠️  Redis cache warm-up failed:', redisError.message);
        }
      }

      return paymentData;
    } catch (error) {
      console.error('❌ Failed to get tip data:', error);
      throw error;
    }
  }

  /**
   * Update payment status
   */
  async updatePaymentStatus(paymentHash, status, metadata = {}) {
    try {
      // Update PostgreSQL with proper JSONB casting
      await this.pg.query(`
        UPDATE payment_splits
        SET 
          status = $1,
          processed_at = CASE WHEN $2 IN ('completed', 'failed') THEN NOW() ELSE processed_at END,
          metadata = COALESCE(metadata, '{}'::jsonb) || $3::jsonb
        WHERE payment_hash = $4
      `, [status, status, JSON.stringify(metadata), paymentHash]);

      // Update Redis cache if exists
      if (this.isRedisConnected) {
        try {
          const redisKey = this.getRedisKey(paymentHash);
          const cached = await this.redis.get(redisKey);
          
          if (cached) {
            const data = JSON.parse(cached);
            data.status = status;
            data.metadata = metadata;
            
            await this.redis.setEx(
              redisKey,
              status === 'processing' ? this.config.ttl.processing : this.config.ttl.active,
              JSON.stringify(data)
            );
          }
        } catch (redisError) {
          console.warn('⚠️  Redis cache update failed:', redisError.message);
        }
      }

      // Log status change event
      await this.logEvent(paymentHash, `status_${status}`, 'success', metadata);

      console.log(`✅ Updated payment ${paymentHash} status to ${status}`);
    } catch (error) {
      console.error('❌ Failed to update payment status:', error);
      throw error;
    }
  }

  /**
   * Remove tip data (called after successful processing)
   */
  async removeTipData(paymentHash) {
    try {
      // Mark as completed in PostgreSQL (don't delete)
      await this.updatePaymentStatus(paymentHash, 'completed');

      // Remove from Redis cache
      if (this.isRedisConnected) {
        try {
          const redisKey = this.getRedisKey(paymentHash);
          await this.redis.del(redisKey);
        } catch (redisError) {
          console.warn('⚠️  Redis cache deletion failed:', redisError.message);
        }
      }

      console.log(`✅ Removed payment ${paymentHash} from hot storage`);
    } catch (error) {
      console.error('❌ Failed to remove tip data:', error);
      throw error;
    }
  }

  /**
   * Log payment event (audit trail)
   */
  async logEvent(paymentHash, eventType, eventStatus, metadata = null, errorMessage = null) {
    try {
      await this.pg.query(`
        INSERT INTO payment_events (
          payment_hash,
          event_type,
          event_status,
          metadata,
          error_message,
          created_at
        ) VALUES ($1, $2, $3, $4, $5, NOW())
      `, [
        paymentHash,
        eventType,
        eventStatus,
        metadata ? JSON.stringify(metadata) : null,
        errorMessage
      ]);
    } catch (error) {
      console.error('❌ Failed to log event:', error);
      // Don't throw - logging failure shouldn't break main flow
    }
  }

  /**
   * Get payment statistics
   */
  async getStats() {
    try {
      const result = await this.pg.query(`
        SELECT 
          COUNT(*) FILTER (WHERE status = 'pending') as pending_count,
          COUNT(*) FILTER (WHERE status = 'processing') as processing_count,
          COUNT(*) FILTER (WHERE status = 'completed') as completed_count,
          COUNT(*) FILTER (WHERE status = 'failed') as failed_count,
          SUM(total_amount) FILTER (WHERE status = 'completed') as total_volume,
          SUM(tip_amount) FILTER (WHERE status = 'completed') as total_tips,
          AVG(tip_amount) FILTER (WHERE status = 'completed' AND tip_amount > 0) as avg_tip
        FROM payment_splits
        WHERE created_at > NOW() - INTERVAL '24 hours'
      `);

      return result.rows[0];
    } catch (error) {
      console.error('❌ Failed to get stats:', error);
      throw error;
    }
  }

  /**
   * Get active payments (for monitoring)
   */
  async getActivePayments() {
    try {
      const result = await this.pg.query(`
        SELECT * FROM active_payments
        LIMIT 100
      `);

      return result.rows;
    } catch (error) {
      console.error('❌ Failed to get active payments:', error);
      throw error;
    }
  }

  /**
   * Expire old pending payments (cleanup job)
   */
  async expireOldPayments() {
    try {
      const result = await this.pg.query(`
        UPDATE payment_splits
        SET status = 'expired'
        WHERE status IN ('pending', 'processing')
          AND expires_at < NOW()
        RETURNING payment_hash
      `);

      // Remove from Redis cache
      if (this.isRedisConnected && result.rows.length > 0) {
        try {
          const keys = result.rows.map(row => this.getRedisKey(row.payment_hash));
          if (keys.length > 0) {
            await this.redis.del(keys);
          }
        } catch (redisError) {
          console.warn('⚠️  Redis cleanup failed:', redisError.message);
        }
      }

      console.log(`🧹 Expired ${result.rows.length} old payments`);
      return result.rows.length;
    } catch (error) {
      console.error('❌ Failed to expire old payments:', error);
      return 0;
    }
  }

  /**
   * Start background cleanup job
   */
  startCleanupJob() {
    // Run every 5 minutes
    setInterval(() => {
      this.expireOldPayments().catch(error => {
        console.error('Cleanup job error:', error);
      });
    }, 5 * 60 * 1000);

    console.log('🧹 Started background cleanup job (every 5 minutes)');
  }

  /**
   * Health check
   */
  async healthCheck() {
    const health = {
      redis: false,
      postgres: false,
      overall: false
    };

    // Check Redis
    if (this.isRedisConnected) {
      try {
        await this.redis.ping();
        health.redis = true;
      } catch (error) {
        console.error('Redis health check failed:', error);
      }
    }

    // Check PostgreSQL
    if (this.isPostgresConnected) {
      try {
        const result = await this.pg.query('SELECT 1');
        health.postgres = result.rows.length === 1;
      } catch (error) {
        console.error('PostgreSQL health check failed:', error);
      }
    }

    // Overall health requires PostgreSQL (Redis is optional)
    health.overall = health.postgres;

    return health;
  }
}

// Singleton instance
let instance = null;

/**
 * Get singleton instance of HybridStore
 */
async function getHybridStore() {
  if (!instance) {
    instance = new HybridStore();
    await instance.connect();
  }
  return instance;
}

module.exports = {
  HybridStore,
  getHybridStore
};

