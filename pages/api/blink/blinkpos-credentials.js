export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Get BlinkPOS credentials from environment
    const blinkposApiKey = process.env.BLINKPOS_API_KEY;

    if (!blinkposApiKey) {
      console.error('Missing BlinkPOS API key in environment');
      return res.status(500).json({ 
        error: 'BlinkPOS configuration missing' 
      });
    }

    // Return only the API key (wallet ID is not needed for WebSocket)
    res.status(200).json({
      apiKey: blinkposApiKey
    });

  } catch (error) {
    console.error('❌ Error getting BlinkPOS credentials:', error);
    res.status(500).json({ 
      error: 'Failed to get BlinkPOS credentials',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}
