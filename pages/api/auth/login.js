const AuthManager = require('../../../lib/auth');
const StorageManager = require('../../../lib/storage');
const BlinkAPI = require('../../../lib/blink-api');

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { username, apiKey } = req.body;
    console.log('Login attempt with API key length:', apiKey?.length);

    if (!apiKey) {
      return res.status(400).json({ error: 'API key is required' });
    }

    // Validate API key with Blink and fetch username
    console.log('Creating BlinkAPI instance...');
    const blinkAPI = new BlinkAPI(apiKey);
    let userInfo;
    
    try {
      console.log('Calling blinkAPI.getMe()...');
      userInfo = await blinkAPI.getMe();
      console.log('getMe() response:', userInfo);
      
      if (!userInfo || !userInfo.username) {
        console.error('Invalid user info received:', userInfo);
        return res.status(401).json({ error: 'Invalid API key or unable to fetch user info' });
      }
    } catch (error) {
      console.error('Blink API error:', error);
      return res.status(401).json({ error: 'Invalid API key' });
    }

    const fetchedUsername = userInfo.username;

    // Generate session token
    const sessionToken = AuthManager.generateSession(fetchedUsername);

    // Save user data with fetched username
    await StorageManager.saveUserData(fetchedUsername, {
      username: fetchedUsername,
      apiKey,
      lastLogin: Date.now()
    });

    // Set secure cookie
    res.setHeader('Set-Cookie', [
      `auth-token=${sessionToken}; HttpOnly; Path=/; SameSite=Strict; Max-Age=${24 * 60 * 60}` // 24 hours
    ]);

    res.status(200).json({
      success: true,
      user: { username: fetchedUsername },
      message: 'Authentication successful'
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Authentication failed' });
  }
}
