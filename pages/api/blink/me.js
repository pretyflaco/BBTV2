const BlinkAPI = require('../../../lib/blink-api');
const { verifyToken } = require('../../../lib/auth');

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Get user from JWT token
    const token = req.cookies.token;
    if (!token) {
      return res.status(401).json({ error: 'No authentication token' });
    }

    const userData = verifyToken(token);
    if (!userData || !userData.apiKey) {
      return res.status(401).json({ error: 'Invalid token or missing API key' });
    }

    // Use the API key to fetch user info
    const blinkAPI = new BlinkAPI(userData.apiKey);
    const userInfo = await blinkAPI.getMe();

    if (!userInfo) {
      return res.status(400).json({ error: 'Failed to fetch user information' });
    }

    res.status(200).json({
      success: true,
      user: userInfo
    });
  } catch (error) {
    console.error('Me API error:', error);
    res.status(500).json({ 
      error: error.message || 'Failed to fetch user information',
      success: false 
    });
  }
}
