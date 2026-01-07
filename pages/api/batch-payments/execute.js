/**
 * API: POST /api/batch-payments/execute
 *
 * Executes all validated payments in a batch.
 * Accepts validation results directly from client (serverless-compatible).
 *
 * Request body:
 * {
 *   apiKey: string,
 *   walletId: string,
 *   validationResults: ValidationResult[],  // From validate endpoint
 *   confirm: boolean
 * }
 *
 * Response:
 * {
 *   success: boolean,
 *   status: 'COMPLETE' | 'FAILED',
 *   summary: { total, successful, failed, totalSent, totalFees },
 *   results: PaymentResult[]
 * }
 */

import { executeBatchPayments } from '../../../lib/batch-payments/payment-executor';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { apiKey, walletId, validationResults, confirm } = req.body;

    // Validate required fields
    if (!apiKey) {
      return res.status(400).json({ error: 'apiKey is required' });
    }

    if (!walletId) {
      return res.status(400).json({ error: 'walletId is required' });
    }

    if (!validationResults || !Array.isArray(validationResults)) {
      return res.status(400).json({ error: 'validationResults array is required' });
    }

    // Filter to only valid recipients
    const validRecipients = validationResults.filter(r => r.valid);

    if (validRecipients.length === 0) {
      return res.status(400).json({
        error: 'No valid recipients in batch'
      });
    }

    // If not confirmed, just return count
    if (!confirm) {
      return res.status(200).json({
        success: true,
        status: 'READY',
        validRecipients: validRecipients.length,
        message: 'Set confirm=true to execute payments'
      });
    }

    // Execute payments
    const executionStarted = Date.now();

    const executionResult = await executeBatchPayments({
      apiKey,
      senderWalletId: walletId,
      validationResults: validRecipients,
      onProgress: () => {
        // Progress tracking not needed for serverless
      }
    });

    const executionCompleted = Date.now();

    // Return results
    return res.status(200).json({
      success: true,
      status: 'COMPLETE',
      summary: executionResult.summary,
      results: executionResult.results.map(r => ({
        rowNumber: r.recipient.rowNumber,
        recipient: r.recipient.original,
        normalized: r.recipient.normalized,
        type: r.recipient.type,
        amountSats: r.recipient.amountSats,
        success: r.success,
        status: r.status,
        feeSats: r.feeSats,
        error: r.error
      })),
      timing: {
        started: executionStarted,
        completed: executionCompleted,
        durationMs: executionCompleted - executionStarted
      }
    });

  } catch (error) {
    console.error('Batch execution error:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}
