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
  // Verify Nostr session
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
  const { apiKey, preferredCurrency = 'BTC' } = req.body;
  
  if (!apiKey) {
    return res.status(400).json({ error: 'API key is required' });
  }
  
  // Validate the API key with Blink
  const blinkApi = new BlinkAPI(apiKey);
  let userInfo;
  
  try {
    userInfo = await blinkApi.getUserInfo();
    if (!userInfo?.id) {
      return res.status(400).json({ error: 'Invalid Blink API key' });
    }
  } catch (error) {
    return res.status(400).json({ 
      error: 'Failed to validate API key',
      details: error.message 
    });
  }
  
  // Store encrypted API key
  const encryptedApiKey = AuthManager.encryptApiKey(apiKey);
  
  await StorageManager.saveUserData(username, {
    apiKey: encryptedApiKey,
    blinkUsername: userInfo.username,
    blinkUserId: userInfo.id,
    preferredCurrency,
    pubkey,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });
  
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

