/**
 * User Sync API
 * 
 * Unified endpoint for cross-device sync of all user data:
 * - Blink Lightning Address wallets
 * - NWC connections (encrypted)
 * - UI preferences
 * 
 * This complements the existing endpoints:
 * - /api/auth/nostr-blink-account (Blink API Key wallets)
 * - /api/split-profiles (Split Payment Profiles)
 * 
 * Endpoints:
 * - GET: Retrieve all synced data for user
 * - POST: Save/update synced data
 * - PATCH: Partial update (specific fields only)
 */

const AuthManager = require('../../../lib/auth');
const StorageManager = require('../../../lib/storage');

/**
 * Extract Nostr pubkey from request
 * @param {Object} req 
 * @returns {string|null}
 */
function extractPubkey(req) {
  // Check query params (GET requests)
  if (req.query?.pubkey) {
    const pubkey = req.query.pubkey.toLowerCase();
    if (/^[0-9a-f]{64}$/.test(pubkey)) {
      return pubkey;
    }
  }
  
  // Check body (POST/PATCH requests)
  if (req.body?.pubkey) {
    const pubkey = req.body.pubkey.toLowerCase();
    if (/^[0-9a-f]{64}$/.test(pubkey)) {
      return pubkey;
    }
  }
  
  // Check session cookie
  const token = req.cookies?.['auth-token'];
  if (token) {
    const session = AuthManager.verifySession(token);
    if (session?.username?.startsWith('nostr:')) {
      return session.username.replace('nostr:', '');
    }
  }
  
  return null;
}

/**
 * Encrypt sensitive data (NWC URIs)
 */
function encryptNWCUri(uri) {
  if (!uri) return null;
  return AuthManager.encryptApiKey(uri); // Reuse existing encryption
}

/**
 * Decrypt sensitive data (NWC URIs)
 */
function decryptNWCUri(encrypted) {
  if (!encrypted) return null;
  return AuthManager.decryptApiKey(encrypted);
}

export default async function handler(req, res) {
  console.log('[user/sync] Request method:', req.method);
  
  const pubkey = extractPubkey(req);
  
  if (!pubkey) {
    return res.status(400).json({ error: 'Missing or invalid pubkey' });
  }
  
  const username = `nostr:${pubkey}`;
  console.log('[user/sync] User:', username);
  
  try {
    switch (req.method) {
      case 'GET':
        return handleGet(req, res, pubkey, username);
      case 'POST':
        return handlePost(req, res, pubkey, username);
      case 'PATCH':
        return handlePatch(req, res, pubkey, username);
      default:
        return res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (error) {
    console.error('[user/sync] Error:', error);
    return res.status(500).json({ 
      error: 'Server error',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}

/**
 * GET - Retrieve all synced data
 */
async function handleGet(req, res, pubkey, username) {
  console.log('[user/sync] GET for user:', username);
  
  const userData = await StorageManager.loadUserData(username);
  
  if (!userData) {
    return res.status(200).json({
      pubkey,
      blinkLnAddressWallets: [],
      nwcConnections: [],
      preferences: getDefaultPreferences()
    });
  }
  
  // Decrypt NWC connection URIs for the client
  const nwcConnections = (userData.nwcConnections || []).map(conn => ({
    ...conn,
    uri: decryptNWCUri(conn.uri)
  }));
  
  return res.status(200).json({
    pubkey,
    blinkLnAddressWallets: userData.blinkLnAddressWallets || [],
    nwcConnections,
    preferences: userData.preferences || getDefaultPreferences(),
    lastSynced: userData.lastSynced || null
  });
}

/**
 * POST - Save/replace all synced data
 */
async function handlePost(req, res, pubkey, username) {
  console.log('[user/sync] POST for user:', username);
  
  const { blinkLnAddressWallets, nwcConnections, preferences } = req.body;
  
  // Load existing data to preserve non-synced fields
  const existingData = await StorageManager.loadUserData(username) || {};
  
  // Encrypt NWC connection URIs before storage
  const encryptedNWCConnections = (nwcConnections || []).map(conn => ({
    ...conn,
    uri: encryptNWCUri(conn.uri)
  }));
  
  // Validate and sanitize Blink LN Address wallets
  const sanitizedLnAddressWallets = (blinkLnAddressWallets || []).map(wallet => ({
    id: wallet.id,
    label: wallet.label,
    username: wallet.username,
    lightningAddress: wallet.lightningAddress,
    walletId: wallet.walletId,
    isActive: !!wallet.isActive,
    createdAt: wallet.createdAt || new Date().toISOString(),
    lastUsed: wallet.lastUsed
  }));
  
  // Merge preferences with defaults
  const mergedPreferences = {
    ...getDefaultPreferences(),
    ...(preferences || {})
  };
  
  const saveResult = await StorageManager.saveUserData(username, {
    ...existingData,
    blinkLnAddressWallets: sanitizedLnAddressWallets,
    nwcConnections: encryptedNWCConnections,
    preferences: mergedPreferences,
    lastSynced: new Date().toISOString()
  });
  
  if (!saveResult) {
    return res.status(500).json({ error: 'Failed to save data' });
  }
  
  console.log('[user/sync] ✓ Data saved successfully');
  
  return res.status(200).json({
    success: true,
    lastSynced: new Date().toISOString()
  });
}

/**
 * PATCH - Partial update (specific fields only)
 */
async function handlePatch(req, res, pubkey, username) {
  console.log('[user/sync] PATCH for user:', username);
  
  const { field, data } = req.body;
  
  if (!field || !['blinkLnAddressWallets', 'nwcConnections', 'preferences'].includes(field)) {
    return res.status(400).json({ error: 'Invalid field. Must be: blinkLnAddressWallets, nwcConnections, or preferences' });
  }
  
  // Load existing data
  const existingData = await StorageManager.loadUserData(username) || {};
  
  let processedData = data;
  
  // Special handling for NWC connections - encrypt URIs
  if (field === 'nwcConnections' && Array.isArray(data)) {
    processedData = data.map(conn => ({
      ...conn,
      uri: encryptNWCUri(conn.uri)
    }));
  }
  
  // Special handling for preferences - merge with defaults
  if (field === 'preferences') {
    processedData = {
      ...getDefaultPreferences(),
      ...(existingData.preferences || {}),
      ...(data || {})
    };
  }
  
  const saveResult = await StorageManager.saveUserData(username, {
    ...existingData,
    [field]: processedData,
    lastSynced: new Date().toISOString()
  });
  
  if (!saveResult) {
    return res.status(500).json({ error: 'Failed to save data' });
  }
  
  console.log(`[user/sync] ✓ Field '${field}' updated successfully`);
  
  return res.status(200).json({
    success: true,
    field,
    lastSynced: new Date().toISOString()
  });
}

/**
 * Default preferences
 */
function getDefaultPreferences() {
  return {
    soundEnabled: true,
    soundTheme: 'success',
    darkMode: false,
    displayCurrency: 'BTC',
    tipsEnabled: false,
    tipPresets: [7.5, 10, 12.5, 20]
  };
}

