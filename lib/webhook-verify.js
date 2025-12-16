/**
 * Webhook Signature Verification for Blink/Svix Webhooks
 * 
 * Blink uses Svix for webhook delivery. Svix uses HMAC-SHA256 signatures
 * to verify webhook authenticity.
 * 
 * Headers sent by Svix:
 * - svix-id: Unique message identifier
 * - svix-timestamp: Unix timestamp when the webhook was sent
 * - svix-signature: HMAC signature(s) of the payload
 * 
 * @see https://docs.svix.com/receiving/verifying-payloads/how
 */

const crypto = require('crypto');

// Maximum age of a webhook in seconds (5 minutes)
const WEBHOOK_TOLERANCE_SECONDS = 300;

/**
 * Verify the Svix webhook signature
 * 
 * @param {Object} req - Next.js API request object
 * @param {string} secret - Webhook signing secret (from Blink Dashboard)
 * @returns {boolean} - True if signature is valid
 */
function verifyWebhookSignature(req, secret) {
  try {
    const svixId = req.headers['svix-id'];
    const svixTimestamp = req.headers['svix-timestamp'];
    const svixSignature = req.headers['svix-signature'];

    // All headers are required
    if (!svixId || !svixTimestamp || !svixSignature) {
      console.error('[Webhook Verify] Missing required Svix headers:', {
        hasSvixId: !!svixId,
        hasSvixTimestamp: !!svixTimestamp,
        hasSvixSignature: !!svixSignature
      });
      return false;
    }

    // Verify timestamp is within tolerance
    const timestampSeconds = parseInt(svixTimestamp, 10);
    const now = Math.floor(Date.now() / 1000);
    
    if (isNaN(timestampSeconds)) {
      console.error('[Webhook Verify] Invalid timestamp format:', svixTimestamp);
      return false;
    }

    if (Math.abs(now - timestampSeconds) > WEBHOOK_TOLERANCE_SECONDS) {
      console.error('[Webhook Verify] Timestamp outside tolerance:', {
        webhookTime: timestampSeconds,
        serverTime: now,
        difference: Math.abs(now - timestampSeconds),
        tolerance: WEBHOOK_TOLERANCE_SECONDS
      });
      return false;
    }

    // Get the raw body as a string
    // Note: Next.js parses JSON automatically, so we need to stringify it back
    const payload = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);

    // Construct the signed content
    // Format: {svix-id}.{svix-timestamp}.{body}
    const signedContent = `${svixId}.${svixTimestamp}.${payload}`;

    // The secret may have a 'whsec_' prefix that needs to be removed
    const secretBytes = secret.startsWith('whsec_') 
      ? Buffer.from(secret.substring(6), 'base64')
      : Buffer.from(secret, 'base64');

    // Calculate expected signature
    const expectedSignature = crypto
      .createHmac('sha256', secretBytes)
      .update(signedContent)
      .digest('base64');

    // Svix may send multiple signatures (for key rotation)
    // Format: v1,{sig1} v1,{sig2} ...
    const signatures = svixSignature.split(' ');
    
    for (const versionedSignature of signatures) {
      const [version, signature] = versionedSignature.split(',');
      
      if (version !== 'v1') {
        console.warn('[Webhook Verify] Unknown signature version:', version);
        continue;
      }

      // Use timing-safe comparison
      try {
        const signatureBuffer = Buffer.from(signature, 'base64');
        const expectedBuffer = Buffer.from(expectedSignature, 'base64');
        
        if (signatureBuffer.length === expectedBuffer.length &&
            crypto.timingSafeEqual(signatureBuffer, expectedBuffer)) {
          return true;
        }
      } catch (comparisonError) {
        // Buffer length mismatch or other error
        continue;
      }
    }

    console.error('[Webhook Verify] No valid signature found');
    return false;

  } catch (error) {
    console.error('[Webhook Verify] Verification error:', error);
    return false;
  }
}

/**
 * Verify webhook with raw body (for when body parsing is disabled)
 * 
 * @param {Buffer|string} rawBody - Raw request body
 * @param {Object} headers - Request headers
 * @param {string} secret - Webhook signing secret
 * @returns {boolean} - True if signature is valid
 */
function verifyWebhookSignatureRaw(rawBody, headers, secret) {
  try {
    const svixId = headers['svix-id'];
    const svixTimestamp = headers['svix-timestamp'];
    const svixSignature = headers['svix-signature'];

    if (!svixId || !svixTimestamp || !svixSignature) {
      console.error('[Webhook Verify] Missing required Svix headers');
      return false;
    }

    // Verify timestamp
    const timestampSeconds = parseInt(svixTimestamp, 10);
    const now = Math.floor(Date.now() / 1000);
    
    if (isNaN(timestampSeconds) || Math.abs(now - timestampSeconds) > WEBHOOK_TOLERANCE_SECONDS) {
      console.error('[Webhook Verify] Timestamp invalid or expired');
      return false;
    }

    // Get payload as string
    const payload = Buffer.isBuffer(rawBody) ? rawBody.toString('utf8') : rawBody;

    // Construct signed content
    const signedContent = `${svixId}.${svixTimestamp}.${payload}`;

    // Decode secret
    const secretBytes = secret.startsWith('whsec_') 
      ? Buffer.from(secret.substring(6), 'base64')
      : Buffer.from(secret, 'base64');

    // Calculate expected signature
    const expectedSignature = crypto
      .createHmac('sha256', secretBytes)
      .update(signedContent)
      .digest('base64');

    // Check each signature
    const signatures = svixSignature.split(' ');
    
    for (const versionedSignature of signatures) {
      const [version, signature] = versionedSignature.split(',');
      
      if (version !== 'v1') continue;

      try {
        const signatureBuffer = Buffer.from(signature, 'base64');
        const expectedBuffer = Buffer.from(expectedSignature, 'base64');
        
        if (signatureBuffer.length === expectedBuffer.length &&
            crypto.timingSafeEqual(signatureBuffer, expectedBuffer)) {
          return true;
        }
      } catch {
        continue;
      }
    }

    return false;

  } catch (error) {
    console.error('[Webhook Verify] Raw verification error:', error);
    return false;
  }
}

module.exports = {
  verifyWebhookSignature,
  verifyWebhookSignatureRaw,
  WEBHOOK_TOLERANCE_SECONDS
};
