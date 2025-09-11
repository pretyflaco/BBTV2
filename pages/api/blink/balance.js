const AuthManager = require('../../../lib/auth');
const StorageManager = require('../../../lib/storage');
const BlinkAPI = require('../../../lib/blink-api');

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

    // Create Blink API instance
    const blink = new BlinkAPI(userData.apiKey);
    
    // Get balance
    const wallets = await blink.getBalance();
    
    // Format response
    const formattedWallets = wallets.map(wallet => ({
      id: wallet.id,
      currency: wallet.walletCurrency,
      balance: wallet.balance,
      formattedBalance: BlinkAPI.formatAmount(wallet.balance, wallet.walletCurrency)
    }));

    res.status(200).json({
      success: true,
      wallets: formattedWallets
    });

  } catch (error) {
    console.error('Balance API error:', error);
    res.status(500).json({ 
      error: 'Failed to fetch balance',
      details: error.message 
    });
  }
}
