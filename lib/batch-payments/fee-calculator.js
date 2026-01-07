/**
 * Fee Calculator for Batch Payments
 *
 * Estimates fees for batch payments:
 * - Intra-ledger (Blink to Blink): 0 fees
 * - External (Lightning Network): Estimated based on amount
 *
 * For MVP, uses conservative fee estimation.
 * Phase 2 will add actual route probing.
 */

const { RECIPIENT_TYPES } = require('./csv-parser');

/**
 * Default fee rate for external payments (conservative estimate)
 * Based on typical Lightning Network routing fees
 */
const DEFAULT_FEE_RATE = 0.003; // 0.3%
const MIN_FEE_SATS = 1; // Minimum 1 sat fee
const MAX_FEE_RATE = 0.01; // Cap at 1%

/**
 * Estimate fee for a single recipient
 * @param {object} validationResult - Validation result with recipient data
 * @returns {object} Fee estimate
 */
function estimateFee(validationResult) {
  const { recipient, valid, walletId, lnurlData } = validationResult;

  if (!valid) {
    return {
      recipient,
      success: false,
      error: 'Recipient validation failed'
    };
  }

  const amountSats = recipient.amountSats || 0;

  // Intra-ledger payments have zero fees
  if (recipient.type === RECIPIENT_TYPES.BLINK || walletId) {
    return {
      recipient,
      success: true,
      isIntraLedger: true,
      fee: {
        sats: 0,
        percentage: 0
      }
    };
  }

  // External payment - estimate fee
  // For MVP, use conservative percentage-based estimate
  let feeSats = Math.ceil(amountSats * DEFAULT_FEE_RATE);

  // Apply minimum fee
  feeSats = Math.max(feeSats, MIN_FEE_SATS);

  // Cap at max rate
  const maxFee = Math.ceil(amountSats * MAX_FEE_RATE);
  feeSats = Math.min(feeSats, maxFee);

  return {
    recipient,
    success: true,
    isIntraLedger: false,
    fee: {
      sats: feeSats,
      percentage: (feeSats / amountSats) * 100
    },
    estimated: true // Flag that this is an estimate, not actual probe
  };
}

/**
 * Calculate fee summary for all recipients
 * @param {object[]} validationResults - Array of validation results
 * @returns {object} Fee summary
 */
function calculateFeeSummary(validationResults) {
  const validRecipients = validationResults.filter(r => r.valid);
  const feeEstimates = validRecipients.map(estimateFee);

  const successful = feeEstimates.filter(f => f.success);
  const failed = feeEstimates.filter(f => !f.success);

  const intraLedger = successful.filter(f => f.isIntraLedger);
  const external = successful.filter(f => !f.isIntraLedger);

  // Calculate totals
  const totalAmountSats = successful.reduce(
    (sum, f) => sum + (f.recipient.amountSats || 0),
    0
  );

  const totalFeesSats = successful.reduce(
    (sum, f) => sum + (f.fee?.sats || 0),
    0
  );

  const intraLedgerAmount = intraLedger.reduce(
    (sum, f) => sum + (f.recipient.amountSats || 0),
    0
  );

  const externalAmount = external.reduce(
    (sum, f) => sum + (f.recipient.amountSats || 0),
    0
  );

  const externalFees = external.reduce(
    (sum, f) => sum + (f.fee?.sats || 0),
    0
  );

  return {
    totalAmountSats,
    totalFeesSats,
    grandTotalSats: totalAmountSats + totalFeesSats,
    averageFeePercent: totalAmountSats > 0
      ? (totalFeesSats / totalAmountSats) * 100
      : 0,
    recipientsWithFees: successful.length,
    recipientsFailed: failed.length,
    breakdown: {
      intraLedger: {
        count: intraLedger.length,
        amountSats: intraLedgerAmount,
        feesSats: 0
      },
      external: {
        count: external.length,
        amountSats: externalAmount,
        feesSats: externalFees,
        averageFeePercent: externalAmount > 0
          ? (externalFees / externalAmount) * 100
          : 0
      }
    },
    details: feeEstimates,
    isEstimate: true // All fees are estimates in MVP
  };
}

/**
 * Validate sufficient balance for batch
 * @param {object} feeSummary - Fee summary from calculateFeeSummary
 * @param {number} balanceSats - User's available balance in sats
 * @returns {object} Balance validation result
 */
function validateBalance(feeSummary, balanceSats) {
  const required = feeSummary.grandTotalSats;

  if (balanceSats < required) {
    return {
      valid: false,
      error: {
        code: 'INSUFFICIENT_BALANCE',
        message: `Insufficient balance. Required: ${required.toLocaleString()} sats (${feeSummary.totalAmountSats.toLocaleString()} + ${feeSummary.totalFeesSats.toLocaleString()} fees). Available: ${balanceSats.toLocaleString()} sats.`
      },
      details: {
        required,
        available: balanceSats,
        shortfall: required - balanceSats
      }
    };
  }

  return {
    valid: true,
    details: {
      required,
      available: balanceSats,
      remaining: balanceSats - required
    }
  };
}

module.exports = {
  estimateFee,
  calculateFeeSummary,
  validateBalance,
  DEFAULT_FEE_RATE,
  MIN_FEE_SATS,
  MAX_FEE_RATE
};
