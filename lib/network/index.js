/**
 * Network module - Bitcoin Circular Economy tracking
 * 
 * This module provides functionality for:
 * - Community management (creation, membership, approval)
 * - Data sharing consent and API key management
 * - Transaction sync from member Blink wallets
 * - Metrics aggregation and leaderboards
 * - Heat map data for adoption visualization
 */

const db = require('./db');
const crypto = require('./crypto');

module.exports = {
  db,
  crypto
};
