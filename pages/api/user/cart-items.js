/**
 * Cart Items API
 * 
 * Stores and retrieves user's saved cart items (product catalog)
 * Items are saved per-user and synced cross-device.
 * 
 * Each item has:
 * - id: unique identifier
 * - name: item name (e.g., "Ice Cream")
 * - price: price in user's display currency (e.g., 1.00)
 * - currency: the display currency used when creating the item (e.g., "USD")
 * - createdAt: timestamp
 * 
 * Endpoints:
 * - GET: Retrieve all cart items for user
 * - POST: Add a new cart item
 * - DELETE: Remove a cart item by id
 * - PATCH: Update an existing cart item
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
  
  // Check body (POST/PATCH/DELETE requests)
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

export default async function handler(req, res) {
  console.log('[cart-items] Request method:', req.method);
  console.log('[cart-items] Request body:', req.body);
  console.log('[cart-items] Request query:', req.query);
  
  const pubkey = extractPubkey(req);
  console.log('[cart-items] Extracted pubkey:', pubkey ? pubkey.slice(0, 16) + '...' : null);
  
  if (!pubkey) {
    console.log('[cart-items] ERROR: Missing or invalid pubkey');
    return res.status(400).json({ error: 'Missing or invalid pubkey' });
  }
  
  const username = `nostr:${pubkey}`;
  console.log('[cart-items] User:', username);
  
  try {
    switch (req.method) {
      case 'GET':
        return handleGet(req, res, pubkey, username);
      case 'POST':
        return handlePost(req, res, pubkey, username);
      case 'DELETE':
        return handleDelete(req, res, pubkey, username);
      case 'PATCH':
        return handlePatch(req, res, pubkey, username);
      default:
        return res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (error) {
    console.error('[cart-items] Error:', error);
    return res.status(500).json({ 
      error: 'Server error',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}

/**
 * GET - Retrieve all cart items
 */
async function handleGet(req, res, pubkey, username) {
  console.log('[cart-items] GET for user:', username);
  
  const userData = await StorageManager.loadUserData(username);
  
  const cartItems = userData?.cartItems || [];
  
  return res.status(200).json({
    success: true,
    cartItems
  });
}

/**
 * POST - Add a new cart item
 */
async function handlePost(req, res, pubkey, username) {
  console.log('[cart-items] POST for user:', username);
  
  const { name, price, currency } = req.body;
  
  // Validate required fields
  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    return res.status(400).json({ error: 'Item name is required' });
  }
  
  if (price === undefined || price === null || isNaN(parseFloat(price)) || parseFloat(price) <= 0) {
    return res.status(400).json({ error: 'Valid price is required' });
  }
  
  if (!currency || typeof currency !== 'string') {
    return res.status(400).json({ error: 'Currency is required' });
  }
  
  // Load existing data
  const userData = await StorageManager.loadUserData(username) || {};
  const cartItems = userData.cartItems || [];
  
  // Create new item
  const newItem = {
    id: `item_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    name: name.trim(),
    price: parseFloat(price),
    currency: currency.toUpperCase(),
    createdAt: new Date().toISOString()
  };
  
  // Add to cart items
  cartItems.push(newItem);
  
  // Save
  const saveResult = await StorageManager.saveUserData(username, {
    ...userData,
    cartItems,
    lastSynced: new Date().toISOString()
  });
  
  if (!saveResult) {
    return res.status(500).json({ error: 'Failed to save cart item' });
  }
  
  console.log('[cart-items] ✓ Item added:', newItem.id);
  
  return res.status(201).json({
    success: true,
    item: newItem
  });
}

/**
 * DELETE - Remove a cart item
 */
async function handleDelete(req, res, pubkey, username) {
  console.log('[cart-items] DELETE for user:', username);
  
  const { itemId } = req.body;
  
  if (!itemId) {
    return res.status(400).json({ error: 'Item ID is required' });
  }
  
  // Load existing data
  const userData = await StorageManager.loadUserData(username) || {};
  const cartItems = userData.cartItems || [];
  
  // Find and remove item
  const itemIndex = cartItems.findIndex(item => item.id === itemId);
  
  if (itemIndex === -1) {
    return res.status(404).json({ error: 'Item not found' });
  }
  
  cartItems.splice(itemIndex, 1);
  
  // Save
  const saveResult = await StorageManager.saveUserData(username, {
    ...userData,
    cartItems,
    lastSynced: new Date().toISOString()
  });
  
  if (!saveResult) {
    return res.status(500).json({ error: 'Failed to delete cart item' });
  }
  
  console.log('[cart-items] ✓ Item deleted:', itemId);
  
  return res.status(200).json({
    success: true,
    deletedId: itemId
  });
}

/**
 * PATCH - Update an existing cart item
 */
async function handlePatch(req, res, pubkey, username) {
  console.log('[cart-items] PATCH for user:', username);
  
  const { itemId, name, price, currency } = req.body;
  
  if (!itemId) {
    return res.status(400).json({ error: 'Item ID is required' });
  }
  
  // Load existing data
  const userData = await StorageManager.loadUserData(username) || {};
  const cartItems = userData.cartItems || [];
  
  // Find item
  const itemIndex = cartItems.findIndex(item => item.id === itemId);
  
  if (itemIndex === -1) {
    return res.status(404).json({ error: 'Item not found' });
  }
  
  // Update fields if provided
  if (name !== undefined && name.trim().length > 0) {
    cartItems[itemIndex].name = name.trim();
  }
  
  if (price !== undefined && !isNaN(parseFloat(price)) && parseFloat(price) > 0) {
    cartItems[itemIndex].price = parseFloat(price);
  }
  
  if (currency !== undefined && currency.trim().length > 0) {
    cartItems[itemIndex].currency = currency.toUpperCase();
  }
  
  cartItems[itemIndex].updatedAt = new Date().toISOString();
  
  // Save
  const saveResult = await StorageManager.saveUserData(username, {
    ...userData,
    cartItems,
    lastSynced: new Date().toISOString()
  });
  
  if (!saveResult) {
    return res.status(500).json({ error: 'Failed to update cart item' });
  }
  
  console.log('[cart-items] ✓ Item updated:', itemId);
  
  return res.status(200).json({
    success: true,
    item: cartItems[itemIndex]
  });
}
