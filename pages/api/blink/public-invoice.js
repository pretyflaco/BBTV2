/**
 * Public Invoice Creation API
 * 
 * Creates Lightning invoices directly to any Blink user's wallet.
 * No authentication required - invoices go directly to the recipient.
 * 
 * Used by the Public POS at track.twentyone.ist/[blinkusername]
 * 
 * Supports environment switching (production/staging) via environment parameter.
 * Staging uses signet (not real sats) for testing.
 */

const BlinkAPI = require('../../../lib/blink-api');

// API URLs for each environment
const API_URLS = {
  production: 'https://api.blink.sv/graphql',
  staging: 'https://api.staging.blink.sv/graphql'
};

// Rate limiting: simple in-memory store (per-IP)
const rateLimitStore = new Map();
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX = 30; // max 30 requests per minute per IP

function checkRateLimit(ip) {
  const now = Date.now();
  const record = rateLimitStore.get(ip);
  
  if (!record) {
    rateLimitStore.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW });
    return true;
  }
  
  if (now > record.resetAt) {
    rateLimitStore.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW });
    return true;
  }
  
  if (record.count >= RATE_LIMIT_MAX) {
    return false;
  }
  
  record.count++;
  return true;
}

// Clean up old rate limit records periodically
setInterval(() => {
  const now = Date.now();
  for (const [ip, record] of rateLimitStore.entries()) {
    if (now > record.resetAt) {
      rateLimitStore.delete(ip);
    }
  }
}, 60 * 1000);

export default async function handler(req, res) {
  // Only allow POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Rate limiting
  const clientIp = req.headers['x-forwarded-for']?.split(',')[0] || 
                   req.headers['x-real-ip'] || 
                   req.socket?.remoteAddress || 
                   'unknown';
  
  if (!checkRateLimit(clientIp)) {
    return res.status(429).json({ 
      error: 'Too many requests. Please wait a moment and try again.' 
    });
  }

  try {
    const { username, amount, memo, walletCurrency, environment } = req.body;

    // Validate and sanitize environment parameter
    // Only allow 'production' or 'staging', default to 'production'
    const validEnvironment = (environment === 'staging') ? 'staging' : 'production';
    const apiUrl = API_URLS[validEnvironment];
    
    // Validate required fields
    if (!username) {
      return res.status(400).json({ error: 'Username is required' });
    }

    if (!amount || isNaN(amount) || amount <= 0) {
      return res.status(400).json({ error: 'Valid amount is required (positive number)' });
    }

    // Enforce reasonable limits
    const satsAmount = Math.round(parseFloat(amount));
    if (satsAmount < 1) {
      return res.status(400).json({ error: 'Minimum amount is 1 sat' });
    }
    if (satsAmount > 10000000) { // 0.1 BTC max
      return res.status(400).json({ error: 'Maximum amount is 10,000,000 sats (0.1 BTC)' });
    }

    console.log('📥 Public invoice request:', {
      username,
      amount: satsAmount,
      memo: memo?.substring(0, 50),
      walletCurrency,
      environment: validEnvironment,
      apiUrl,
      ip: clientIp.substring(0, 10) + '...'
    });

    // Determine which wallet to use (BTC or default)
    let walletInfo;
    try {
      if (walletCurrency === 'BTC') {
        // Explicitly request BTC wallet, pass apiUrl for environment
        walletInfo = await BlinkAPI.getBtcWalletByUsername(username, apiUrl);
      } else {
        // Get user's default wallet, pass apiUrl for environment
        walletInfo = await BlinkAPI.getWalletByUsername(username, apiUrl);
      }
    } catch (walletError) {
      console.error('❌ Wallet lookup failed:', walletError.message);
      return res.status(404).json({ 
        error: `User '${username}' not found or has no wallet configured` 
      });
    }

    if (!walletInfo?.id) {
      return res.status(404).json({ 
        error: `Could not find wallet for user '${username}'` 
      });
    }

    console.log('📋 Found wallet:', {
      username,
      walletId: walletInfo.id.substring(0, 8) + '...',
      currency: walletInfo.currency
    });

    // Create the invoice
    const invoiceMemo = memo || `Payment to ${username}`;
    
    let invoice;
    try {
      // Pass apiUrl for environment-aware invoice creation
      invoice = await BlinkAPI.createInvoiceOnBehalfOfRecipient(
        walletInfo.id,
        satsAmount,
        invoiceMemo,
        15, // 15 minutes expiry
        apiUrl // Environment-specific API URL
      );
    } catch (invoiceError) {
      console.error('❌ Invoice creation failed:', invoiceError.message);
      return res.status(500).json({ 
        error: 'Failed to create invoice. Please try again.' 
      });
    }

    if (!invoice?.paymentRequest) {
      return res.status(500).json({ 
        error: 'Invoice creation returned empty result' 
      });
    }

    console.log('✅ Public invoice created:', {
      username,
      paymentHash: invoice.paymentHash?.substring(0, 16) + '...',
      satoshis: invoice.satoshis,
      environment: validEnvironment,
      invoicePrefix: invoice.paymentRequest?.substring(0, 6) // lnbc or lntbs
    });

    // Return invoice details
    return res.status(200).json({
      success: true,
      invoice: {
        paymentRequest: invoice.paymentRequest,
        paymentHash: invoice.paymentHash,
        satoshis: invoice.satoshis || satsAmount,
        username,
        walletCurrency: walletInfo.currency,
        memo: invoiceMemo,
        expiresIn: 15 * 60, // 15 minutes in seconds
        environment: validEnvironment // Include environment in response
      }
    });

  } catch (error) {
    console.error('❌ Public invoice error:', error);
    return res.status(500).json({ 
      error: 'Internal server error',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}
