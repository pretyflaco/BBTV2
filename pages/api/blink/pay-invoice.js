import BlinkAPI from '../../../lib/blink-api';
const { getHybridStore } = require('../../../lib/storage/hybrid-store');

/**
 * API endpoint to pay a lightning invoice from BlinkPOS account
 * Used for forwarding payments to NWC wallets
 * 
 * SECURITY: This endpoint requires a valid paymentHash that corresponds to
 * a pending payment in our database. This prevents unauthorized invoice payments.
 * 
 * POST /api/blink/pay-invoice
 * Body: { paymentHash: string, invoice: string, memo?: string }
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  let hybridStore = null;
  let claimSucceeded = false;
  let paymentHash = null;

  try {
    // Support both 'invoice' and 'paymentRequest' field names for compatibility
    const { paymentHash: reqPaymentHash, invoice: invoiceField, paymentRequest, memo = '' } = req.body;
    const invoice = invoiceField || paymentRequest;
    paymentHash = reqPaymentHash;

    // SECURITY: Require paymentHash to prevent unauthorized payments
    if (!paymentHash) {
      console.error('❌ SECURITY: Missing paymentHash - rejecting unauthenticated request');
      return res.status(401).json({ 
        error: 'Unauthorized: paymentHash is required to verify payment legitimacy' 
      });
    }

    // Validate required fields
    if (!invoice) {
      console.error('❌ Missing invoice for payment');
      return res.status(400).json({ 
        error: 'Missing required field: invoice or paymentRequest' 
      });
    }

    // Basic invoice validation (should start with lnbc)
    if (!invoice.toLowerCase().startsWith('lnbc')) {
      console.error('❌ Invalid invoice format');
      return res.status(400).json({ 
        error: 'Invalid invoice format' 
      });
    }

    // SECURITY: Verify this is a legitimate payment by claiming it from the database
    // This ensures only payments created through BlinkPOS can be forwarded
    hybridStore = await getHybridStore();
    const claimResult = await hybridStore.claimPaymentForProcessing(paymentHash);

    if (!claimResult.claimed) {
      console.log(`🔒 SECURITY: Payment claim failed for ${paymentHash?.substring(0, 16)}... - ${claimResult.reason}`);
      
      if (claimResult.reason === 'already_completed') {
        // Payment already processed - return success (idempotent)
        return res.status(200).json({
          success: true,
          message: 'Payment already processed',
          alreadyProcessed: true
        });
      } else if (claimResult.reason === 'already_processing') {
        // Another request is processing this payment
        return res.status(409).json({
          error: 'Payment is being processed by another request',
          retryable: false
        });
      } else {
        // Payment not found - reject to prevent unauthorized payments
        console.error(`❌ SECURITY: Payment ${paymentHash?.substring(0, 16)}... not found - rejecting`);
        return res.status(401).json({
          error: 'Unauthorized: Payment not found or already processed'
        });
      }
    }

    claimSucceeded = true;
    console.log(`✅ SECURITY: Claimed payment ${paymentHash?.substring(0, 16)}... for NWC forwarding`);

    // Get BlinkPOS credentials from environment
    const blinkposApiKey = process.env.BLINKPOS_API_KEY;
    const blinkposBtcWalletId = process.env.BLINKPOS_BTC_WALLET_ID;

    if (!blinkposApiKey || !blinkposBtcWalletId) {
      console.error('Missing BlinkPOS environment variables');
      return res.status(500).json({ 
        error: 'BlinkPOS configuration missing' 
      });
    }

    console.log('⚡ Paying invoice from BlinkPOS:', {
      paymentHash: paymentHash?.substring(0, 16) + '...',
      invoicePrefix: invoice.substring(0, 50) + '...',
      memo: memo || 'NWC forwarding',
      timestamp: new Date().toISOString()
    });

    // Pay the invoice from BlinkPOS account
    // Pass memo for better transaction history visibility
    const blinkposAPI = new BlinkAPI(blinkposApiKey);
    
    const paymentResult = await blinkposAPI.payLnInvoice(blinkposBtcWalletId, invoice, memo || 'BlinkPOS: Payment forwarded');
    
    if (paymentResult.status !== 'SUCCESS') {
      throw new Error(`Payment failed: ${paymentResult.status}`);
    }

    console.log('✅ Invoice paid successfully from BlinkPOS');

    // Log the successful forwarding
    await hybridStore.logEvent(paymentHash, 'nwc_invoice_paid', 'success', {
      memo,
      invoicePrefix: invoice.substring(0, 30)
    });

    // Note: We don't mark as completed here because tips may still need to be sent
    // The /api/blink/send-nwc-tips endpoint or the caller will handle completion

    res.status(200).json({
      success: true,
      message: 'Invoice paid successfully',
      details: {
        status: paymentResult.status,
        preimage: paymentResult.preimage
      }
    });

  } catch (error) {
    console.error('❌ Pay invoice error:', error);
    
    // Release claim if we claimed but failed to complete
    if (claimSucceeded && hybridStore && paymentHash) {
      try {
        await hybridStore.releaseFailedClaim(paymentHash, error.message);
        console.log(`🔓 Released claim for failed payment ${paymentHash?.substring(0, 16)}...`);
      } catch (releaseError) {
        console.error('❌ Failed to release claim:', releaseError);
      }
    }
    
    let errorMessage = 'Failed to pay invoice';
    if (error.message.includes('balance')) {
      errorMessage = 'Insufficient balance in BlinkPOS account';
    } else if (error.message.includes('expired')) {
      errorMessage = 'Invoice has expired';
    } else if (error.message.includes('already paid')) {
      errorMessage = 'Invoice has already been paid';
    }

    res.status(500).json({ 
      error: errorMessage,
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}

