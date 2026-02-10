const boltcard = require('../../../../lib/boltcard');
const BlinkAPI = require('../../../../lib/blink-api').default || require('../../../../lib/blink-api');
const { getApiUrlForEnvironment } = require('../../../../lib/config/api');

/**
 * LNURL-pay endpoint for Boltcard top-up
 * 
 * GET /api/boltcard/lnurlp/[cardId]
 * Returns LNURL-pay metadata (LUD-06)
 * 
 * GET /api/boltcard/lnurlp/[cardId]?amount=...
 * Returns invoice for the specified amount (callback)
 */
export default async function handler(req, res) {
  const { cardId } = req.query;

  if (!cardId) {
    return res.status(400).json({ status: 'ERROR', reason: 'Missing cardId' });
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ status: 'ERROR', reason: 'Method not allowed' });
  }

  // Check if this is a callback request (has amount parameter)
  const amount = req.query.amount;
  
  if (amount) {
    return handlePayCallback(req, res, cardId, amount);
  } else {
    return handlePayRequest(req, res, cardId);
  }
}

/**
 * Handle initial LNURL-pay request - return metadata
 */
async function handlePayRequest(req, res, cardId) {
  try {
    const serverUrl = getServerUrl(req);
    const response = await boltcard.lnurlp.handleTopUpRequest(cardId, serverUrl);

    if (response.status === 'ERROR') {
      return res.status(400).json(response);
    }

    return res.status(200).json(response);

  } catch (error) {
    console.error('❌ LNURL-pay request error:', error);
    return res.status(500).json({
      status: 'ERROR',
      reason: 'Internal server error'
    });
  }
}

/**
 * Handle LNURL-pay callback - create invoice
 */
async function handlePayCallback(req, res, cardId, amountMsats) {
  try {
    const comment = req.query.comment || '';
    const amount = parseInt(amountMsats);

    if (isNaN(amount) || amount <= 0) {
      return res.status(400).json({
        status: 'ERROR',
        reason: 'Invalid amount'
      });
    }

    // Create invoice function - uses different Blink mutation based on wallet currency
    const createInvoice = async (amountSats, memo, walletId, apiKey, environment, walletCurrency) => {
      try {
        const apiUrl = getApiUrlForEnvironment(environment);
        const blinkAPI = new BlinkAPI(apiKey, apiUrl);

        let invoice;
        
        // Use different mutation based on wallet currency
        if (walletCurrency === 'USD') {
          // For USD/Stablesats wallets, use lnUsdInvoiceCreate
          // Amount is in cents for USD cards
          invoice = await blinkAPI.createLnUsdInvoice(walletId, amountSats, memo);
        } else {
          // For BTC wallets, use lnInvoiceCreate
          invoice = await blinkAPI.createLnInvoice(walletId, amountSats, memo);
        }

        if (!invoice) {
          return { error: 'Failed to create invoice' };
        }

        return {
          invoice: invoice.paymentRequest,
          paymentHash: invoice.paymentHash,
        };
      } catch (error) {
        console.error('❌ Invoice creation error:', error);
        return { error: error.message };
      }
    };

    // Process the callback
    const response = await boltcard.lnurlp.handleTopUpCallback(
      cardId,
      amount,
      comment,
      createInvoice
    );

    if (response.status === 'ERROR') {
      return res.status(400).json(response);
    }

    return res.status(200).json(response);

  } catch (error) {
    console.error('❌ LNURL-pay callback error:', error);
    return res.status(500).json({
      status: 'ERROR',
      reason: 'Internal server error'
    });
  }
}

/**
 * Get the server URL from the request
 */
function getServerUrl(req) {
  const forwardedProto = req.headers['x-forwarded-proto'];
  const forwardedHost = req.headers['x-forwarded-host'];
  
  if (forwardedProto && forwardedHost) {
    return `${forwardedProto}://${forwardedHost}`;
  }
  
  const host = req.headers.host;
  const protocol = host?.includes('localhost') ? 'http' : 'https';
  
  return `${protocol}://${host}`;
}
