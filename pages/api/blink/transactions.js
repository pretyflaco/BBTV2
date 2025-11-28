const AuthManager = require('../../../lib/auth');
const StorageManager = require('../../../lib/storage');
const BlinkAPI = require('../../../lib/blink-api');

/**
 * Transactions API - Supports both legacy and Nostr authentication
 * 
 * Authentication methods:
 * 1. Legacy: auth-token cookie (JWT session)
 * 2. Nostr: X-API-KEY header (passed directly from client)
 */
export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    let apiKey = null;

    // Method 1: Check for API key in header (Nostr auth)
    const headerApiKey = req.headers['x-api-key'];
    if (headerApiKey) {
      apiKey = headerApiKey;
    } else {
      // Method 2: Legacy cookie-based auth
      const token = req.cookies['auth-token'];
      const session = AuthManager.verifySession(token);
      
      if (!session) {
        return res.status(401).json({ error: 'Unauthorized - no valid session or API key' });
      }

      // Get user's API key from server storage
      const userData = await StorageManager.loadUserData(session.username);
      if (!userData?.apiKey) {
        return res.status(400).json({ error: 'No API key found' });
      }
      apiKey = userData.apiKey;
    }

    if (!apiKey) {
      return res.status(401).json({ error: 'No API key available' });
    }

    // Parse query parameters
    const { first = 100, after } = req.query;

    // Create Blink API instance
    const blink = new BlinkAPI(apiKey);
    
    // Get transactions
    const transactionData = await blink.getTransactions(parseInt(first), after);
    
    // Format transactions for display (preserving all raw data for CSV export)
    const formattedTransactions = transactionData.edges.map(edge => {
      const tx = edge.node;
      return {
        // Display fields (for UI)
        id: tx.id,
        direction: tx.direction,
        status: tx.status,
        amount: BlinkAPI.getTransactionAmount(tx),
        currency: tx.settlementCurrency,
        date: BlinkAPI.formatDate(tx.createdAt),
        memo: tx.memo || '-',
        cursor: edge.cursor,
        // Raw fields (for CSV export) - pass through all data
        walletId: tx.walletId,
        settlementAmount: tx.settlementAmount,
        settlementFee: tx.settlementFee,
        settlementCurrency: tx.settlementCurrency,
        settlementDisplayAmount: tx.settlementDisplayAmount,
        settlementDisplayCurrency: tx.settlementDisplayCurrency,
        settlementDisplayFee: tx.settlementDisplayFee,
        createdAt: tx.createdAt,
        initiationVia: tx.initiationVia,
        settlementVia: tx.settlementVia
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
