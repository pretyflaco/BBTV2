const AuthManager = require('../../../lib/auth');
const StorageManager = require('../../../lib/storage');

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Verify authentication
    const token = req.cookies['auth-token'];
    const session = AuthManager.verifySession(token);
    
    if (!session) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Get user's API key
    const userData = await StorageManager.loadUserData(session.username);
    if (!userData?.apiKey) {
      return res.status(400).json({ error: 'No API key found' });
    }

    res.status(200).json({
      success: true,
      apiKey: userData.apiKey
    });

  } catch (error) {
    console.error('Get API key error:', error);
    res.status(500).json({ 
      error: 'Failed to get API key',
      details: error.message 
    });
  }
}
