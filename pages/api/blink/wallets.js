import BlinkAPI from '../../../lib/blink-api';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { apiKey } = req.body;

    // Validate required fields
    if (!apiKey) {
      return res.status(400).json({ 
        error: 'Missing required field: apiKey' 
      });
    }

    const blinkAPI = new BlinkAPI(apiKey);

    try {
      const wallets = await blinkAPI.getWalletInfo();

      res.status(200).json({
        success: true,
        wallets: wallets
      });

    } catch (blinkError) {
      console.error('Blink API error:', blinkError);
      
      return res.status(400).json({ 
        error: 'Failed to fetch wallet information',
        details: blinkError.message 
      });
    }

  } catch (error) {
    console.error('Wallets API error:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}
