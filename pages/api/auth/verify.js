const AuthManager = require('../../../lib/auth');
const StorageManager = require('../../../lib/storage');

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const token = req.cookies['auth-token'];
    
    if (!token) {
      return res.status(401).json({ error: 'No authentication token' });
    }

    const session = AuthManager.verifySession(token);
    if (!session) {
      return res.status(401).json({ error: 'Invalid session' });
    }

    // Load user data
    const userData = await StorageManager.loadUserData(session.username);
    if (!userData) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.status(200).json({
      success: true,
      user: {
        username: session.username,
        lastLogin: userData.lastLogin
      }
    });

  } catch (error) {
    console.error('Verify error:', error);
    res.status(500).json({ error: 'Verification failed' });
  }
}
