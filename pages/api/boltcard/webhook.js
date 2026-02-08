const boltcard = require('../../../lib/boltcard');

/**
 * Webhook endpoint for Boltcard payment notifications
 * 
 * POST /api/boltcard/webhook
 * 
 * This endpoint is called by Blink when a payment is received
 * for a card top-up invoice.
 * 
 * Body:
 * {
 *   paymentHash: string,
 *   status: 'PAID' | 'PENDING' | 'FAILED',
 *   ...
 * }
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { paymentHash, status } = req.body;

    if (!paymentHash) {
      return res.status(400).json({ error: 'Missing paymentHash' });
    }

    console.log('[Boltcard Webhook] Received:', { paymentHash: paymentHash.substring(0, 16) + '...', status });

    // Only process paid invoices
    if (status !== 'PAID') {
      console.log('[Boltcard Webhook] Ignoring non-PAID status:', status);
      return res.status(200).json({ ok: true, message: 'Ignored non-PAID status' });
    }

    // Check if this is a pending top-up
    const pendingTopUp = boltcard.lnurlp.getPendingTopUp(paymentHash);

    if (!pendingTopUp) {
      console.log('[Boltcard Webhook] No pending top-up found for:', paymentHash.substring(0, 16) + '...');
      return res.status(200).json({ ok: true, message: 'No pending top-up' });
    }

    // Process the top-up
    const result = await boltcard.lnurlp.processTopUpPayment(paymentHash);

    if (result.success) {
      console.log('✅ [Boltcard Webhook] Top-up processed:', {
        cardId: result.cardId,
        amount: result.amount,
        newBalance: result.balance
      });

      return res.status(200).json({
        ok: true,
        message: 'Top-up processed',
        cardId: result.cardId,
        amount: result.amount,
        balance: result.balance
      });
    } else {
      console.error('❌ [Boltcard Webhook] Top-up failed:', result.error);
      return res.status(500).json({
        ok: false,
        error: result.error
      });
    }

  } catch (error) {
    console.error('❌ [Boltcard Webhook] Error:', error);
    return res.status(500).json({
      ok: false,
      error: 'Internal server error'
    });
  }
}

/**
 * Also handle GET for health check
 */
export const config = {
  api: {
    bodyParser: true,
  },
};
