const BlinkAPI = require('../../../lib/blink-api');

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { apiKey, currency } = req.body;

    // Validate required fields
    if (!apiKey) {
      return res.status(400).json({ error: 'API key is required' });
    }

    if (!currency) {
      return res.status(400).json({ error: 'Currency parameter is required' });
    }

    // Use the API key to fetch exchange rate
    const blinkAPI = new BlinkAPI(apiKey);
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
