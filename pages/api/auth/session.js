/**
 * Session Check API
 * 
 * Simple endpoint to check if a valid session exists.
 * Returns session information if authenticated.
 */

const AuthManager = require('../../../lib/auth');

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const token = req.cookies?.['auth-token'];
    
    if (!token) {
      return res.status(200).json({ authenticated: false });
    }
    
    const session = AuthManager.verifySession(token);
    
    if (!session) {
      return res.status(200).json({ authenticated: false });
    }
    
    // Extract pubkey if it's a Nostr session
    let pubkey = null;
    if (session.username?.startsWith('nostr:')) {
      pubkey = session.username.replace('nostr:', '');
    }
    
    return res.status(200).json({
      authenticated: true,
      username: session.username,
      pubkey,
      isNostrSession: !!pubkey
    });
  } catch (error) {
    console.error('[auth/session] Error:', error);
    return res.status(200).json({ authenticated: false });
  }
}
