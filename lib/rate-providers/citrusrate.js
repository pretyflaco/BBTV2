/**
 * Citrusrate API Client
 * 
 * Fetches black market / street exchange rates from Citrusrate API.
 * https://documenter.getpostman.com/view/27524206/2sBXVigpTG
 */

const SATS_PER_BTC = 100_000_000;

class CitrusrateAPI {
  constructor() {
    this.apiKey = process.env.CITRUSRATE_API_KEY;
    this.baseUrl = process.env.CITRUSRATE_BASE_URL || 'https://citrusrate-be.onrender.com';
    this.timeout = 10000; // 10 second timeout as recommended
  }

  /**
   * Make authenticated request to Citrusrate API
   * @param {string} endpoint - API endpoint path
   * @param {object} params - Query parameters
   * @returns {Promise<object>} API response data
   */
  async request(endpoint, params = {}) {
    const url = new URL(`${this.baseUrl}${endpoint}`);
    Object.entries(params).forEach(([key, value]) => {
      url.searchParams.append(key, value);
    });

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(url.toString(), {
        method: 'GET',
        headers: {
          'x-api-key': this.apiKey,
          'Content-Type': 'application/json'
        },
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        
        // Handle rate limiting
        if (response.status === 429) {
          const retryAfter = errorData.retryAfter || 60;
          const error = new Error(`Rate limited. Retry after ${retryAfter} seconds.`);
          error.status = 429;
          error.retryAfter = retryAfter;
          throw error;
        }

        throw new Error(errorData.message || `Citrusrate API error: ${response.status}`);
      }

      const data = await response.json();

      if (data.status !== 'success') {
        throw new Error(data.message || 'Citrusrate API returned error status');
      }

      return data.data;
    } catch (error) {
      clearTimeout(timeoutId);
      
      if (error.name === 'AbortError') {
        throw new Error('Citrusrate API request timed out');
      }
      throw error;
    }
  }

  /**
   * Get black market rate for a specific currency
   * @param {string} currency - 3-letter currency code (e.g., 'MZN')
   * @returns {Promise<object>} Rate data with satPriceInCurrency
   */
  async getBlackMarketRate(currency) {
    // GET /v1/btc/blackmarket?currency=MZN
    // Response: { pair: "BTC/MZN", rate: 6903525.51, timestamp: "...", source: "estimated" }
    
    const data = await this.request('/v1/btc/blackmarket', { currency: currency.toUpperCase() });

    if (!data.rate) {
      throw new Error(`No black market rate available for ${currency}`);
    }

    // Convert BTC rate to satPriceInCurrency format (price of 1 sat in fiat minor units)
    // Citrusrate returns: rate = price of 1 BTC in fiat (e.g., 6,903,525 MZN)
    // We need: satPriceInCurrency = price of 1 sat in fiat cents/minor units
    // Formula: (btcRate / SATS_PER_BTC) * 100 = price of 1 sat in cents
    const satPriceInCurrency = (data.rate / SATS_PER_BTC) * 100;

    return {
      currency: currency.toUpperCase(),
      satPriceInCurrency,
      btcRate: data.rate,
      timestamp: data.timestamp,
      source: data.source || 'citrusrate_blackmarket',
      provider: 'citrusrate_street'
    };
  }

  /**
   * Get official rate for a specific currency (not black market)
   * @param {string} currency - 3-letter currency code
   * @returns {Promise<object>} Rate data
   */
  async getOfficialRate(currency) {
    // GET /v1/btc?currency=NGN
    const data = await this.request('/v1/btc', { currency: currency.toUpperCase() });

    if (!data.rate) {
      throw new Error(`No official rate available for ${currency}`);
    }

    const satPriceInCurrency = (data.rate / SATS_PER_BTC) * 100;

    return {
      currency: currency.toUpperCase(),
      satPriceInCurrency,
      btcRate: data.rate,
      timestamp: data.timestamp,
      source: 'citrusrate_official',
      provider: 'citrusrate'
    };
  }

  /**
   * Get all official rates (batch)
   * @returns {Promise<object>} All rates keyed by currency code
   */
  async getAllOfficialRates() {
    // GET /v1/btc/all
    const data = await this.request('/v1/btc/all');

    if (!data.rates) {
      throw new Error('No rates available from Citrusrate');
    }

    // Convert all rates to satPriceInCurrency format
    const convertedRates = {};
    for (const [currency, btcRate] of Object.entries(data.rates)) {
      convertedRates[currency] = {
        currency,
        satPriceInCurrency: (btcRate / SATS_PER_BTC) * 100,
        btcRate,
        timestamp: data.timestamp,
        source: 'citrusrate_official',
        provider: 'citrusrate'
      };
    }

    return {
      rates: convertedRates,
      timestamp: data.timestamp
    };
  }
}

// Singleton instance
let citrusrateInstance = null;

function getCitrusrateAPI() {
  if (!citrusrateInstance) {
    citrusrateInstance = new CitrusrateAPI();
  }
  return citrusrateInstance;
}

module.exports = {
  CitrusrateAPI,
  getCitrusrateAPI
};
