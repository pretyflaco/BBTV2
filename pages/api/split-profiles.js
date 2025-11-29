/**
 * Split Profiles API
 * 
 * Manages Split Profiles for Nostr-authenticated users.
 * Split Profiles are stored server-side for cross-device sync.
 * 
 * A Split Profile consists of:
 * - id: Unique identifier (UUID)
 * - label: User-given name for the profile
 * - recipients: Array of recipients with Blink usernames and share percentages
 *   (Currently only 1 recipient at 100%, multi-recipient support planned)
 * 
 * Endpoints:
 * - GET: Retrieve all split profiles for user
 * - POST: Create/update a split profile
 * - DELETE: Remove a split profile
 */

const StorageManager = require('../../lib/storage');

/**
 * Extract Nostr pubkey from session or request
 * @param {Object} req 
 * @returns {string|null}
 */
function extractPubkey(req) {
  // Check query params first (for GET requests)
  if (req.query.pubkey) {
    const pubkey = req.query.pubkey.toLowerCase();
    if (/^[0-9a-f]{64}$/.test(pubkey)) {
      return pubkey;
    }
  }
  
  // Check body (for POST/DELETE requests)
  if (req.body?.pubkey) {
    const pubkey = req.body.pubkey.toLowerCase();
    if (/^[0-9a-f]{64}$/.test(pubkey)) {
      return pubkey;
    }
  }
  
  return null;
}

export default async function handler(req, res) {
  console.log('[split-profiles] Request method:', req.method);
  
  const pubkey = extractPubkey(req);
  
  if (!pubkey) {
    return res.status(400).json({ error: 'Missing or invalid pubkey' });
  }
  
  const username = `nostr:${pubkey}`;
  console.log('[split-profiles] User:', username);
  
  try {
    switch (req.method) {
      case 'GET':
        return handleGet(req, res, pubkey, username);
      case 'POST':
        return handlePost(req, res, pubkey, username);
      case 'DELETE':
        return handleDelete(req, res, pubkey, username);
      default:
        return res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (error) {
    console.error('[split-profiles] Error:', error);
    return res.status(500).json({ 
      error: 'Server error',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}

/**
 * GET - Retrieve all split profiles
 */
async function handleGet(req, res, pubkey, username) {
  console.log('[split-profiles] GET for user:', username);
  
  const userData = await StorageManager.loadUserData(username);
  
  // Return split profiles (or empty array if none)
  const splitProfiles = userData?.splitProfiles || [];
  const activeSplitProfileId = userData?.activeSplitProfileId || null;
  
  console.log('[split-profiles] Found', splitProfiles.length, 'profiles');
  
  return res.status(200).json({
    splitProfiles,
    activeSplitProfileId,
    pubkey
  });
}

/**
 * POST - Create or update a split profile
 * Body: { profile: { id?, label, recipients: [{ username, share }] }, setActive?: boolean }
 */
async function handlePost(req, res, pubkey, username) {
  console.log('[split-profiles] POST for user:', username);
  
  const { profile, setActive } = req.body;
  
  if (!profile) {
    return res.status(400).json({ error: 'Profile data is required' });
  }
  
  if (!profile.label || typeof profile.label !== 'string') {
    return res.status(400).json({ error: 'Profile label is required' });
  }
  
  if (!profile.recipients || !Array.isArray(profile.recipients) || profile.recipients.length === 0) {
    return res.status(400).json({ error: 'At least one recipient is required' });
  }
  
  // Validate recipients
  for (const recipient of profile.recipients) {
    if (!recipient.username || typeof recipient.username !== 'string') {
      return res.status(400).json({ error: 'Recipient username is required' });
    }
    if (typeof recipient.share !== 'number' || recipient.share < 0 || recipient.share > 100) {
      return res.status(400).json({ error: 'Recipient share must be a number between 0 and 100' });
    }
  }
  
  // Validate that shares sum to 100
  const totalShare = profile.recipients.reduce((sum, r) => sum + r.share, 0);
  if (Math.abs(totalShare - 100) > 0.01) {
    return res.status(400).json({ error: 'Recipient shares must sum to 100%' });
  }
  
  // Load existing data
  const userData = await StorageManager.loadUserData(username) || {};
  const splitProfiles = userData.splitProfiles || [];
  
  // Generate ID if new profile
  const profileId = profile.id || require('crypto').randomUUID();
  
  // Check if updating existing or creating new
  const existingIndex = splitProfiles.findIndex(p => p.id === profileId);
  
  const savedProfile = {
    id: profileId,
    label: profile.label.trim(),
    recipients: profile.recipients.map(r => ({
      username: r.username.trim().toLowerCase().replace(/@blink\.sv$/, ''),
      share: r.share
    })),
    createdAt: existingIndex >= 0 ? splitProfiles[existingIndex].createdAt : new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  
  if (existingIndex >= 0) {
    splitProfiles[existingIndex] = savedProfile;
    console.log('[split-profiles] Updated profile:', profileId);
  } else {
    splitProfiles.push(savedProfile);
    console.log('[split-profiles] Created profile:', profileId);
  }
  
  // Update active profile if requested
  let activeSplitProfileId = userData.activeSplitProfileId;
  if (setActive) {
    activeSplitProfileId = profileId;
    console.log('[split-profiles] Set active profile:', profileId);
  }
  
  // Save back to storage
  const saveResult = await StorageManager.saveUserData(username, {
    ...userData,
    splitProfiles,
    activeSplitProfileId
  });
  
  if (!saveResult) {
    return res.status(500).json({ error: 'Failed to save profile' });
  }
  
  return res.status(200).json({
    success: true,
    profile: savedProfile,
    activeSplitProfileId
  });
}

/**
 * DELETE - Remove a split profile
 * Body: { profileId: string }
 */
async function handleDelete(req, res, pubkey, username) {
  console.log('[split-profiles] DELETE for user:', username);
  
  const { profileId } = req.body;
  
  if (!profileId) {
    return res.status(400).json({ error: 'Profile ID is required' });
  }
  
  // Load existing data
  const userData = await StorageManager.loadUserData(username);
  
  if (!userData?.splitProfiles) {
    return res.status(404).json({ error: 'No profiles found' });
  }
  
  const splitProfiles = userData.splitProfiles.filter(p => p.id !== profileId);
  
  if (splitProfiles.length === userData.splitProfiles.length) {
    return res.status(404).json({ error: 'Profile not found' });
  }
  
  // Clear active profile if it was deleted
  let activeSplitProfileId = userData.activeSplitProfileId;
  if (activeSplitProfileId === profileId) {
    activeSplitProfileId = null;
  }
  
  // Save back to storage
  await StorageManager.saveUserData(username, {
    ...userData,
    splitProfiles,
    activeSplitProfileId
  });
  
  console.log('[split-profiles] Deleted profile:', profileId);
  
  return res.status(200).json({ success: true });
}

