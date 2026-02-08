const boltcard = require('../../../../lib/boltcard');
const BlinkAPI = require('../../../../lib/blink-api').default || require('../../../../lib/blink-api');
const { getApiUrlForEnvironment } = require('../../../../lib/config/api');

/**
 * LNURL-withdraw endpoint for Boltcard payments (card tap)
 * 
 * This endpoint is called when a card is tapped and the wallet fetches the LNURL
 * 
 * GET /api/boltcard/lnurlw/[cardId]?p=...&c=...
 * - p: Encrypted PICCData (32 hex chars)
 * - c: SunMAC authentication (16 hex chars)
 * 
 * Returns LNURL-withdraw response (LUD-03):
 * {
 *   tag: 'withdrawRequest',
 *   callback: 'https://...',
 *   k1: '...',
 *   minWithdrawable: 1000,
 *   maxWithdrawable: 100000000,
 *   defaultDescription: '...'
 * }
 * 
 * POST /api/boltcard/lnurlw/[cardId]/callback
 * - k1: Card ID (from GET response)
 * - pr: BOLT11 invoice to pay
 */
export default async function handler(req, res) {
  const { cardId } = req.query;

  if (!cardId) {
    return res.status(400).json({ status: 'ERROR', reason: 'Missing cardId' });
  }

  if (req.method === 'GET') {
    return handleWithdrawGet(req, res, cardId);
  } else if (req.method === 'POST') {
    return handleWithdrawPost(req, res, cardId);
  } else {
    return res.status(405).json({ status: 'ERROR', reason: 'Method not allowed' });
  }
}

/**
 * Handle GET request - card tap verification and LNURL-withdraw response
 */
async function handleWithdrawGet(req, res, cardId) {
  try {
    const { p: piccData, c: sunMac } = req.query;

    // If no p/c params, this might be a balance check or info request
    if (!piccData || !sunMac) {
      // Return basic card info (without sensitive data)
      const card = await boltcard.store.getCard(cardId);
      
      if (!card) {
        return res.status(404).json({ status: 'ERROR', reason: 'Card not found' });
      }

      // Check if this is a balance request
      if (req.query.balance !== undefined) {
        return res.status(200).json({
          balance: card.balance,
          currency: card.walletCurrency,
          unit: card.walletCurrency === 'USD' ? 'cents' : 'sats',
        });
      }

      return res.status(400).json({
        status: 'ERROR',
        reason: 'Missing authentication parameters (p, c)'
      });
    }

    // Validate parameter formats
    if (!/^[0-9a-fA-F]{32}$/.test(piccData)) {
      return res.status(400).json({
        status: 'ERROR',
        reason: 'Invalid PICCData format'
      });
    }

    if (!/^[0-9a-fA-F]{16}$/.test(sunMac)) {
      return res.status(400).json({
        status: 'ERROR',
        reason: 'Invalid SunMAC format'
      });
    }

    // Build callback URL
    const serverUrl = getServerUrl(req);
    const callbackUrl = `${serverUrl}/api/boltcard/lnurlw/${cardId}/callback`;

    // Process the withdraw request
    const response = await boltcard.lnurlw.handleWithdrawRequest(
      cardId,
      piccData,
      sunMac,
      callbackUrl
    );

    // Return LNURL-withdraw response
    return res.status(response.status === 'ERROR' ? 400 : 200).json(response);

  } catch (error) {
    console.error('❌ LNURL-withdraw GET error:', error);
    return res.status(500).json({
      status: 'ERROR',
      reason: 'Internal server error'
    });
  }
}

/**
 * Handle POST request - invoice submission and payment
 */
async function handleWithdrawPost(req, res, cardId) {
  try {
    // LNURL-withdraw callback parameters
    const k1 = req.body.k1 || req.query.k1;
    const pr = req.body.pr || req.query.pr;

    if (!pr) {
      return res.status(400).json({
        status: 'ERROR',
        reason: 'Missing invoice (pr parameter)'
      });
    }

    // k1 should match cardId for security
    if (k1 && k1 !== cardId) {
      console.warn(`[LNURLW] k1 mismatch: ${k1} !== ${cardId}`);
      return res.status(400).json({
        status: 'ERROR',
        reason: 'Invalid k1 parameter'
      });
    }

    // Create invoice payment function
    const payInvoice = async (amountSats, invoice, apiKey, environment) => {
      try {
        const apiUrl = getApiUrlForEnvironment(environment);
        const blinkAPI = new BlinkAPI(apiKey, apiUrl);
        
        // Get wallet info to find the right wallet
        const wallets = await blinkAPI.getWalletInfo();
        const btcWallet = wallets.find(w => w.walletCurrency === 'BTC');
        
        if (!btcWallet) {
          return { success: false, error: 'No BTC wallet found' };
        }

        // Pay the invoice
        const result = await blinkAPI.payLnInvoice(
          btcWallet.id,
          invoice,
          'Boltcard payment'
        );

        if (result.status === 'SUCCESS') {
          return {
            success: true,
            paymentHash: extractPaymentHash(invoice),
          };
        } else {
          return {
            success: false,
            error: result.errors?.[0]?.message || `Payment status: ${result.status}`
          };
        }
      } catch (error) {
        console.error('❌ Payment error:', error);
        return {
          success: false,
          error: error.message
        };
      }
    };

    // Process the callback
    const response = await boltcard.lnurlw.handleWithdrawCallback(
      cardId,
      pr,
      payInvoice
    );

    return res.status(response.status === 'OK' ? 200 : 400).json(response);

  } catch (error) {
    console.error('❌ LNURL-withdraw POST error:', error);
    return res.status(500).json({
      status: 'ERROR',
      reason: 'Internal server error'
    });
  }
}

/**
 * Extract payment hash from BOLT11 invoice
 */
function extractPaymentHash(invoice) {
  try {
    // The payment hash is in the tagged data section
    // For simplicity, we'll use the bolt11 library if available
    const bolt11 = require('bolt11');
    const decoded = bolt11.decode(invoice);
    return decoded.tags.find(t => t.tagName === 'payment_hash')?.data || null;
  } catch (error) {
    // Return null if we can't extract it
    return null;
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
