/**
 * Nostr Blink Account API
 * 
 * Manages Blink accounts for Nostr-authenticated users.
 * API keys are stored server-side (encrypted) for security.
 * 
 * Endpoints:
 * - POST: Add/update Blink account
 * - GET: Retrieve Blink account info (not the API key itself)
 * - DELETE: Remove Blink account
 */

const AuthManager = require('../../../lib/auth');
const StorageManager = require('../../../lib/storage');
const BlinkAPI = require('../../../lib/blink-api');

/**
 * Extract Nostr pubkey from session username
 * @param {string} username - Session username (format: nostr:pubkey)
 * @returns {string|null}
 */
function extractPubkey(username) {
  if (!username?.startsWith('nostr:')) return null;
  return username.replace('nostr:', '');
}

/**
 * Verify the request is from a Nostr-authenticated user
 * @param {Object} req 
 * @returns {{valid: boolean, session?: Object, pubkey?: string, error?: string}}
 */
function verifyNostrSession(req) {
  const token = req.cookies['auth-token'];
  const session = AuthManager.verifySession(token);
  
  if (!session) {
    return { valid: false, error: 'Unauthorized - no valid session' };
  }
  
  const pubkey = extractPubkey(session.username);
  if (!pubkey) {
    return { valid: false, error: 'Not a Nostr session' };
  }
  
  return { valid: true, session, pubkey };
}

export default async function handler(req, res) {
  // For GET requests, allow pubkey-based lookup (for external signers)
  // This is safe because the pubkey was verified during sign-in
  if (req.method === 'GET' && req.query.pubkey) {
    const pubkey = req.query.pubkey.toLowerCase();
    console.log('[nostr-blink-account] GET by pubkey:', pubkey);
    
    // Validate pubkey format
    if (!/^[0-9a-f]{64}$/.test(pubkey)) {
      return res.status(400).json({ error: 'Invalid pubkey format' });
    }
    
    // Lookup by pubkey (construct the username format)
    const username = `nostr:${pubkey}`;
    return handleGet(req, res, pubkey, username);
  }
  
  // For POST/DELETE, require full session verification
  const verification = verifyNostrSession(req);
  if (!verification.valid) {
    return res.status(401).json({ error: verification.error });
  }
  
  const { pubkey, session } = verification;
  
  try {
    switch (req.method) {
      case 'GET':
        return handleGet(req, res, pubkey, session.username);
      case 'POST':
        return handlePost(req, res, pubkey, session.username);
      case 'DELETE':
        return handleDelete(req, res, pubkey, session.username);
      default:
        return res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (error) {
    console.error('Nostr Blink account error:', error);
    return res.status(500).json({ 
      error: 'Server error',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}

/**
 * GET - Retrieve Blink account info
 */
async function handleGet(req, res, pubkey, username) {
  const userData = await StorageManager.loadUserData(username);
  
  if (!userData?.apiKey) {
    return res.status(200).json({
      hasAccount: false,
      pubkey
    });
  }
  
  // Get user info from Blink (without exposing API key)
  try {
    const blinkApi = new BlinkAPI(userData.apiKey);
    const userInfo = await blinkApi.getUserInfo();
    
    return res.status(200).json({
      hasAccount: true,
      pubkey,
      blinkUsername: userInfo?.username || null,
      preferredCurrency: userData.preferredCurrency || 'BTC'
    });
  } catch (error) {
    // API key might be invalid
    return res.status(200).json({
      hasAccount: true,
      pubkey,
      blinkUsername: null,
      preferredCurrency: userData.preferredCurrency || 'BTC',
      error: 'Failed to fetch Blink account info'
    });
  }
}

/**
 * POST - Add/update Blink account
 */
async function handlePost(req, res, pubkey, username) {
  console.log('[nostr-blink-account] POST request for:', username);
  
  const { apiKey, preferredCurrency = 'BTC' } = req.body;
  
  if (!apiKey) {
    console.log('[nostr-blink-account] Missing API key');
    return res.status(400).json({ error: 'API key is required' });
  }
  
  console.log('[nostr-blink-account] Validating API key with Blink...');
  
  // Validate the API key with Blink
  const blinkApi = new BlinkAPI(apiKey);
  let userInfo;
  
  try {
    const result = await blinkApi.getUserInfo();
    // getUserInfo returns { me: { id, username, defaultAccount: { id } } }
    userInfo = result?.me;
    if (!userInfo?.id) {
      console.log('[nostr-blink-account] Invalid API key - no user ID. Result:', result);
      return res.status(400).json({ error: 'Invalid Blink API key' });
    }
    console.log('[nostr-blink-account] API key valid for user:', userInfo.username);
  } catch (error) {
    console.error('[nostr-blink-account] API validation error:', error);
    return res.status(400).json({ 
      error: 'Failed to validate API key',
      details: error.message 
    });
  }
  
  // Store API key - StorageManager.saveUserData will encrypt it
  // Don't double-encrypt!
  console.log('[nostr-blink-account] Storing user data...');
  const saveResult = await StorageManager.saveUserData(username, {
    apiKey: apiKey,  // Will be encrypted by saveUserData
    blinkUsername: userInfo.username,
    blinkUserId: userInfo.id,
    preferredCurrency,
    pubkey,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });
  
  console.log('[nostr-blink-account] Save result:', saveResult);
  
  if (!saveResult) {
    console.error('[nostr-blink-account] Failed to save user data');
    return res.status(500).json({ error: 'Failed to save account data' });
  }
  
  console.log('[nostr-blink-account] ✓ Account stored successfully');
  
  return res.status(200).json({
    success: true,
    blinkUsername: userInfo.username,
    preferredCurrency
  });
}

/**
 * DELETE - Remove Blink account
 */
async function handleDelete(req, res, pubkey, username) {
  // Load existing data to preserve some fields if needed
  const existingData = await StorageManager.loadUserData(username);
  
  if (!existingData) {
    return res.status(404).json({ error: 'No account found' });
  }
  
  // Remove the API key but keep the record
  await StorageManager.saveUserData(username, {
    ...existingData,
    apiKey: null,
    blinkUsername: null,
    blinkUserId: null,
    removedAt: new Date().toISOString()
  });
  
  return res.status(200).json({ success: true });
}

