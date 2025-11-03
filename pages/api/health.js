/**
 * Health Check Endpoint
 * Used by Docker and monitoring systems to verify service health
 */

import { getHybridStore } from '../../lib/storage/hybrid-store';

export default async function handler(req, res) {
  const startTime = Date.now();
  const health = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    checks: {},
    uptime: process.uptime(),
    version: process.env.npm_package_version || '1.0.0'
  };

  try {
    // Check Hybrid Storage (Redis + PostgreSQL)
    if (process.env.ENABLE_HYBRID_STORAGE === 'true') {
      try {
        const hybridStore = await getHybridStore();
        const storageHealth = await hybridStore.healthCheck();
        
        health.checks.redis = {
          status: storageHealth.redis ? 'up' : 'down',
          enabled: true
        };
        
        health.checks.postgres = {
          status: storageHealth.postgres ? 'up' : 'down',
          enabled: true
        };

        // If PostgreSQL is down, service is unhealthy
        if (!storageHealth.postgres) {
          health.status = 'unhealthy';
        }
        // If Redis is down but PostgreSQL is up, service is degraded
        else if (!storageHealth.redis) {
          health.status = 'degraded';
        }
      } catch (error) {
        health.checks.storage = {
          status: 'down',
          error: error.message
        };
        health.status = 'unhealthy';
      }
    }

    // Check Blink API credentials
    health.checks.blinkConfig = {
      status: process.env.BLINKPOS_API_KEY && process.env.BLINKPOS_BTC_WALLET_ID ? 'configured' : 'missing',
      apiKey: process.env.BLINKPOS_API_KEY ? 'set' : 'missing',
      walletId: process.env.BLINKPOS_BTC_WALLET_ID ? 'set' : 'missing'
    };

    if (!process.env.BLINKPOS_API_KEY || !process.env.BLINKPOS_BTC_WALLET_ID) {
      health.status = 'unhealthy';
    }

    // Response time
    health.responseTime = Date.now() - startTime;

    // Set appropriate status code
    const statusCode = health.status === 'healthy' ? 200 : 
                      health.status === 'degraded' ? 200 : 503;

    res.status(statusCode).json(health);
  } catch (error) {
    console.error('Health check error:', error);
    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: error.message,
      responseTime: Date.now() - startTime
    });
  }
}

