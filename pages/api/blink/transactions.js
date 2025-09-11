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

    // Parse query parameters
    const { first = 100, after } = req.query;

    // Create Blink API instance
    const blink = new BlinkAPI(userData.apiKey);
    
    // Get transactions
    const transactionData = await blink.getTransactions(parseInt(first), after);
    
    // Format transactions
    const formattedTransactions = transactionData.edges.map(edge => {
      const tx = edge.node;
      return {
        id: tx.id,
        direction: tx.direction,
        status: tx.status,
        amount: BlinkAPI.getTransactionAmount(tx),
        currency: tx.settlementCurrency,
        date: BlinkAPI.formatDate(tx.createdAt),
        memo: tx.memo || '-',
        cursor: edge.cursor
      };
    });

    res.status(200).json({
      success: true,
      transactions: formattedTransactions,
      pageInfo: transactionData.pageInfo
    });

  } catch (error) {
    console.error('Transactions API error:', error);
    res.status(500).json({ 
      error: 'Failed to fetch transactions',
      details: error.message 
    });
  }
}
