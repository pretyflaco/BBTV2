const AuthManager = require('../../../lib/auth');
const StorageManager = require('../../../lib/storage');
const BlinkAPI = require('../../../lib/blink-api');

export default async function handler(req, res) {
  if (req.method !== 'POST') {
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

    // Get wallet IDs from request body
    const { walletIds } = req.body;
    
    if (!walletIds || !Array.isArray(walletIds) || walletIds.length === 0) {
      return res.status(400).json({ error: 'walletIds array is required' });
    }

    // Create Blink API instance
    const blink = new BlinkAPI(userData.apiKey);
    
    // Get CSV data from Blink (base64 encoded)
    const csvBase64 = await blink.getCsvTransactions(walletIds);
    
    if (!csvBase64) {
      return res.status(404).json({ error: 'No CSV data available' });
    }

    // Decode base64 to get the actual CSV content
    const csvContent = Buffer.from(csvBase64, 'base64').toString('utf-8');

    res.status(200).json({
      success: true,
      csv: csvContent
    });

  } catch (error) {
    console.error('CSV Export API error:', error);
    res.status(500).json({ 
      error: 'Failed to export CSV',
      details: error.message 
    });
  }
}

