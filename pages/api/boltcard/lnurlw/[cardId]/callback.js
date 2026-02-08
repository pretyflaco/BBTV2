const boltcard = require('../../../../../lib/boltcard');
const BlinkAPI = require('../../../../../lib/blink-api').default || require('../../../../../lib/blink-api');
const { getApiUrlForEnvironment } = require('../../../../../lib/config/api');

/**
 * LNURL-withdraw callback endpoint
 * 
 * POST /api/boltcard/lnurlw/[cardId]/callback
 * 
 * Called by wallet to submit an invoice after LNURL-withdraw scan
 * 
 * Query/Body parameters:
 * - k1: Card ID (for verification)
 * - pr: BOLT11 invoice to pay
 */
export default async function handler(req, res) {
  if (req.method !== 'POST' && req.method !== 'GET') {
    return res.status(405).json({ status: 'ERROR', reason: 'Method not allowed' });
  }

  const { cardId } = req.query;

  if (!cardId) {
    return res.status(400).json({ status: 'ERROR', reason: 'Missing cardId' });
  }

  try {
    // LNURL-withdraw callback parameters (support both query and body)
    const k1 = req.body?.k1 || req.query.k1;
    const pr = req.body?.pr || req.query.pr;

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
    console.error('❌ LNURL-withdraw callback error:', error);
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
    const bolt11 = require('bolt11');
    const decoded = bolt11.decode(invoice);
    return decoded.tags.find(t => t.tagName === 'payment_hash')?.data || null;
  } catch (error) {
    return null;
  }
}
