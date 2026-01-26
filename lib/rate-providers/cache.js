/**
 * Rate Cache Manager
 * 
 * Caches exchange rates in Redis with configurable TTL.
 * Citrusrate recommends 30-60 second caching.
 */

const { createClient } = require('redis');

// Cache configuration
const RATE_CACHE_TTL = 45; // seconds (between 30-60 recommended by Citrusrate)
const CACHE_KEY_PREFIX = 'rate:';

// Redis client singleton
let redisClient = null;
let isConnected = false;

/**
 * Get or create Redis client for rate caching
 */
async function getRedisClient() {
  if (redisClient && isConnected) {
    return redisClient;
  }

  try {
    redisClient = createClient({
      socket: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379')
      },
      password: process.env.REDIS_PASSWORD || undefined,
      database: parseInt(process.env.REDIS_DB || '0')
    });

    redisClient.on('error', (err) => {
      console.error('Rate cache Redis error:', err.message);
      isConnected = false;
    });

    redisClient.on('connect', () => {
      isConnected = true;
    });

    await redisClient.connect();
    return redisClient;
  } catch (error) {
    console.warn('Rate cache Redis connection failed:', error.message);
    isConnected = false;
    return null;
  }
}

/**
 * Generate cache key for a rate
 * @param {string} provider - Provider ID (e.g., 'blink', 'citrusrate_street')
 * @param {string} currency - Currency code
 * @returns {string} Cache key
 */
function getCacheKey(provider, currency) {
  return `${CACHE_KEY_PREFIX}${provider}:${currency.toUpperCase()}`;
}

/**
 * Get cached rate
 * @param {string} provider - Provider ID
 * @param {string} currency - Currency code
 * @returns {Promise<object|null>} Cached rate or null if not found/expired
 */
async function getCachedRate(provider, currency) {
  try {
    const redis = await getRedisClient();
    if (!redis) {
      return null;
    }

    const cacheKey = getCacheKey(provider, currency);
    const cached = await redis.get(cacheKey);

    if (cached) {
      const rate = JSON.parse(cached);
      console.log(`Rate cache HIT: ${cacheKey}`);
      return rate;
    }

    console.log(`Rate cache MISS: ${cacheKey}`);
    return null;
  } catch (error) {
    console.warn('Rate cache get error:', error.message);
    return null;
  }
}

/**
 * Cache a rate
 * @param {string} provider - Provider ID
 * @param {string} currency - Currency code
 * @param {object} rate - Rate data to cache
 * @param {number} ttl - TTL in seconds (optional, defaults to RATE_CACHE_TTL)
 */
async function setCachedRate(provider, currency, rate, ttl = RATE_CACHE_TTL) {
  try {
    const redis = await getRedisClient();
    if (!redis) {
      return;
    }

    const cacheKey = getCacheKey(provider, currency);
    await redis.setEx(cacheKey, ttl, JSON.stringify({
      ...rate,
      cachedAt: new Date().toISOString()
    }));

    console.log(`Rate cached: ${cacheKey} (TTL: ${ttl}s)`);
  } catch (error) {
    console.warn('Rate cache set error:', error.message);
  }
}

/**
 * Invalidate a cached rate
 * @param {string} provider - Provider ID
 * @param {string} currency - Currency code
 */
async function invalidateCachedRate(provider, currency) {
  try {
    const redis = await getRedisClient();
    if (!redis) {
      return;
    }

    const cacheKey = getCacheKey(provider, currency);
    await redis.del(cacheKey);
    console.log(`Rate cache invalidated: ${cacheKey}`);
  } catch (error) {
    console.warn('Rate cache invalidate error:', error.message);
  }
}

/**
 * Clear all cached rates
 */
async function clearAllCachedRates() {
  try {
    const redis = await getRedisClient();
    if (!redis) {
      return;
    }

    const keys = await redis.keys(`${CACHE_KEY_PREFIX}*`);
    if (keys.length > 0) {
      await redis.del(keys);
      console.log(`Cleared ${keys.length} cached rates`);
    }
  } catch (error) {
    console.warn('Rate cache clear error:', error.message);
  }
}

module.exports = {
  getCachedRate,
  setCachedRate,
  invalidateCachedRate,
  clearAllCachedRates,
  RATE_CACHE_TTL
};
