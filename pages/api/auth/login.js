const AuthManager = require('../../../lib/auth');
const StorageManager = require('../../../lib/storage');

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { username, apiKey } = req.body;

    if (!username || !apiKey) {
      return res.status(400).json({ error: 'Username and API key are required' });
    }

    // Validate API key with Blink
    const isValid = await AuthManager.validateBlinkApiKey(apiKey);
    if (!isValid) {
      return res.status(401).json({ error: 'Invalid API key' });
    }

    // Generate session token
    const sessionToken = AuthManager.generateSession(username);

    // Save user data
    await StorageManager.saveUserData(username, {
      username,
      apiKey,
      lastLogin: Date.now()
    });

    // Set secure cookie
    res.setHeader('Set-Cookie', [
      `auth-token=${sessionToken}; HttpOnly; Path=/; SameSite=Strict; Max-Age=${24 * 60 * 60}` // 24 hours
    ]);

    res.status(200).json({
      success: true,
      user: { username },
      message: 'Authentication successful'
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Authentication failed' });
  }
}
