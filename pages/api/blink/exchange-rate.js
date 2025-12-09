const BlinkAPI = require('../../../lib/blink-api');

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { apiKey, currency, useBlinkpos } = req.body;

    if (!currency) {
      return res.status(400).json({ error: 'Currency parameter is required' });
    }

    // Determine which API key to use
    let effectiveApiKey = apiKey;
    
    // For NWC-only users (no user API key), use BlinkPOS credentials
    if (!effectiveApiKey && useBlinkpos) {
      effectiveApiKey = process.env.BLINKPOS_API_KEY;
      if (!effectiveApiKey) {
        return res.status(500).json({ error: 'BlinkPOS credentials not configured' });
      }
    }

    if (!effectiveApiKey) {
      return res.status(400).json({ error: 'API key is required (or set useBlinkpos=true)' });
    }

    // Use the API key to fetch exchange rate
    const blinkAPI = new BlinkAPI(effectiveApiKey);
    const exchangeRate = await blinkAPI.getExchangeRate(currency);

    if (!exchangeRate) {
      return res.status(400).json({ error: 'Failed to fetch exchange rate' });
    }

    res.status(200).json({
      success: true,
      currency: currency.toUpperCase(),
      satPriceInCurrency: exchangeRate.satPriceInCurrency
    });
  } catch (error) {
    console.error('Exchange rate API error:', error);
    res.status(500).json({ 
      error: error.message || 'Failed to fetch exchange rate',
      success: false 
    });
  }
}
