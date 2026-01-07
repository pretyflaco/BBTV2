/**
 * Payment Executor for Batch Payments
 *
 * Executes batch payments in chunks:
 * - Intra-ledger: Uses intraLedgerPaymentSend
 * - External LN Address: Uses lnAddressPaymentSend
 * - External LNURL: Fetches invoice from callback, then pays
 */

const { RECIPIENT_TYPES } = require('./csv-parser');

// Execution settings
// Process sequentially to avoid Redlock conflicts (Blink API uses Redis locks per wallet)
const PAYMENT_DELAY_MS = 100; // Delay between each payment

// Blink API
const BLINK_API_URL = 'https://api.blink.sv/graphql';

/**
 * Payment error codes
 */
const PAYMENT_ERROR_CODES = {
  INSUFFICIENT_BALANCE: 'INSUFFICIENT_BALANCE',
  NO_ROUTE: 'NO_ROUTE',
  INVOICE_EXPIRED: 'INVOICE_EXPIRED',
  PAYMENT_FAILED: 'PAYMENT_FAILED',
  TIMEOUT: 'TIMEOUT',
  NETWORK_ERROR: 'NETWORK_ERROR'
};

/**
 * Execute intra-ledger payment (Blink to Blink)
 * @param {object} params - Payment parameters
 * @returns {Promise<object>} Payment result
 */
async function executeIntraLedgerPayment({
  apiKey,
  senderWalletId,
  recipientWalletId,
  amountSats,
  memo
}) {
  const mutation = `
    mutation IntraLedgerPaymentSend($input: IntraLedgerPaymentSendInput!) {
      intraLedgerPaymentSend(input: $input) {
        status
        errors {
          message
          code
        }
      }
    }
  `;

  const variables = {
    input: {
      walletId: senderWalletId,
      recipientWalletId,
      amount: amountSats,
      memo: memo || undefined
    }
  };

  try {
    const response = await fetch(BLINK_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-KEY': apiKey
      },
      body: JSON.stringify({ query: mutation, variables })
    });

    if (!response.ok) {
      throw new Error(`Blink API returned ${response.status}`);
    }

    const data = await response.json();

    if (data.errors && data.errors.length > 0) {
      return {
        success: false,
        error: {
          code: PAYMENT_ERROR_CODES.PAYMENT_FAILED,
          message: data.errors[0].message
        }
      };
    }

    const result = data.data?.intraLedgerPaymentSend;

    if (result?.errors?.length > 0) {
      const error = result.errors[0];
      return {
        success: false,
        error: {
          code: error.code || PAYMENT_ERROR_CODES.PAYMENT_FAILED,
          message: error.message
        }
      };
    }

    return {
      success: true,
      status: result?.status || 'SUCCESS',
      feeSats: 0
    };

  } catch (error) {
    return {
      success: false,
      error: {
        code: PAYMENT_ERROR_CODES.NETWORK_ERROR,
        message: error.message
      }
    };
  }
}

/**
 * Execute Lightning Address payment
 * @param {object} params - Payment parameters
 * @returns {Promise<object>} Payment result
 */
async function executeLnAddressPayment({
  apiKey,
  senderWalletId,
  lnAddress,
  amountSats
}) {
  const mutation = `
    mutation LnAddressPaymentSend($input: LnAddressPaymentSendInput!) {
      lnAddressPaymentSend(input: $input) {
        status
        errors {
          message
          code
        }
      }
    }
  `;

  const variables = {
    input: {
      walletId: senderWalletId,
      lnAddress,
      amount: amountSats
    }
  };

  try {
    const response = await fetch(BLINK_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-KEY': apiKey
      },
      body: JSON.stringify({ query: mutation, variables })
    });

    if (!response.ok) {
      throw new Error(`Blink API returned ${response.status}`);
    }

    const data = await response.json();

    if (data.errors && data.errors.length > 0) {
      return {
        success: false,
        error: {
          code: PAYMENT_ERROR_CODES.PAYMENT_FAILED,
          message: data.errors[0].message
        }
      };
    }

    const result = data.data?.lnAddressPaymentSend;

    if (result?.errors?.length > 0) {
      const error = result.errors[0];

      // Map specific error codes
      let errorCode = PAYMENT_ERROR_CODES.PAYMENT_FAILED;
      if (error.code === 'ROUTE_FINDING_ERROR' || error.message?.includes('route')) {
        errorCode = PAYMENT_ERROR_CODES.NO_ROUTE;
      } else if (error.code === 'INSUFFICIENT_BALANCE') {
        errorCode = PAYMENT_ERROR_CODES.INSUFFICIENT_BALANCE;
      }

      return {
        success: false,
        error: {
          code: errorCode,
          message: error.message
        }
      };
    }

    return {
      success: true,
      status: result?.status || 'SUCCESS'
    };

  } catch (error) {
    return {
      success: false,
      error: {
        code: PAYMENT_ERROR_CODES.NETWORK_ERROR,
        message: error.message
      }
    };
  }
}

/**
 * Execute LNURL payment (fetch invoice from callback, then pay)
 * @param {object} params - Payment parameters
 * @returns {Promise<object>} Payment result
 */
async function executeLnurlPayment({
  apiKey,
  senderWalletId,
  lnurlData,
  amountSats
}) {
  try {
    // Step 1: Get invoice from LNURL callback
    const amountMsats = amountSats * 1000;
    const callbackUrl = new URL(lnurlData.callback);
    callbackUrl.searchParams.set('amount', amountMsats.toString());

    const invoiceResponse = await fetch(callbackUrl.toString(), {
      method: 'GET',
      headers: { 'Accept': 'application/json' }
    });

    if (!invoiceResponse.ok) {
      return {
        success: false,
        error: {
          code: PAYMENT_ERROR_CODES.PAYMENT_FAILED,
          message: `LNURL callback returned ${invoiceResponse.status}`
        }
      };
    }

    const invoiceData = await invoiceResponse.json();

    if (invoiceData.status === 'ERROR') {
      return {
        success: false,
        error: {
          code: PAYMENT_ERROR_CODES.PAYMENT_FAILED,
          message: invoiceData.reason || 'LNURL callback error'
        }
      };
    }

    if (!invoiceData.pr) {
      return {
        success: false,
        error: {
          code: PAYMENT_ERROR_CODES.PAYMENT_FAILED,
          message: 'No invoice returned from LNURL callback'
        }
      };
    }

    // Step 2: Pay the invoice
    const mutation = `
      mutation LnInvoicePaymentSend($input: LnInvoicePaymentInput!) {
        lnInvoicePaymentSend(input: $input) {
          status
          errors {
            message
            code
          }
        }
      }
    `;

    const variables = {
      input: {
        walletId: senderWalletId,
        paymentRequest: invoiceData.pr
      }
    };

    const response = await fetch(BLINK_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-KEY': apiKey
      },
      body: JSON.stringify({ query: mutation, variables })
    });

    if (!response.ok) {
      throw new Error(`Blink API returned ${response.status}`);
    }

    const data = await response.json();

    if (data.errors && data.errors.length > 0) {
      return {
        success: false,
        error: {
          code: PAYMENT_ERROR_CODES.PAYMENT_FAILED,
          message: data.errors[0].message
        }
      };
    }

    const result = data.data?.lnInvoicePaymentSend;

    if (result?.errors?.length > 0) {
      const error = result.errors[0];
      return {
        success: false,
        error: {
          code: error.code || PAYMENT_ERROR_CODES.PAYMENT_FAILED,
          message: error.message
        }
      };
    }

    return {
      success: true,
      status: result?.status || 'SUCCESS'
    };

  } catch (error) {
    return {
      success: false,
      error: {
        code: PAYMENT_ERROR_CODES.NETWORK_ERROR,
        message: error.message
      }
    };
  }
}

/**
 * Process a single payment
 * @param {object} params - Payment parameters
 * @returns {Promise<object>} Payment result
 */
async function processPayment({
  apiKey,
  senderWalletId,
  validationResult
}) {
  // Validation results from API have flattened structure:
  // { recipient: "original string", type, normalized, amountSats, memo, lnurlData, ... }
  const { lnurlData, walletId } = validationResult;

  // Build recipient object from flattened properties for return value
  const recipient = {
    rowNumber: validationResult.rowNumber,
    original: validationResult.recipient,
    type: validationResult.type,
    normalized: validationResult.normalized,
    amount: validationResult.amount,
    amountSats: validationResult.amountSats,
    currency: validationResult.currency,
    memo: validationResult.memo
  };

  try {
    // Intra-ledger payment (Blink user with walletId)
    if (walletId) {
      const result = await executeIntraLedgerPayment({
        apiKey,
        senderWalletId,
        recipientWalletId: walletId,
        amountSats: validationResult.amountSats,
        memo: validationResult.memo
      });

      return {
        recipient,
        ...result
      };
    }

    // Blink user payment - use Lightning Address (username@blink.sv)
    // Blink-to-Blink payments via LN address are automatically intra-ledger (zero fees)
    if (validationResult.type === RECIPIENT_TYPES.BLINK) {
      const blinkLnAddress = `${validationResult.normalized}@blink.sv`;
      const result = await executeLnAddressPayment({
        apiKey,
        senderWalletId,
        lnAddress: blinkLnAddress,
        amountSats: validationResult.amountSats
      });

      return {
        recipient,
        ...result
      };
    }

    // External Lightning Address payment
    if (validationResult.type === RECIPIENT_TYPES.LN_ADDRESS) {
      const result = await executeLnAddressPayment({
        apiKey,
        senderWalletId,
        lnAddress: validationResult.normalized,
        amountSats: validationResult.amountSats
      });

      return {
        recipient,
        ...result
      };
    }

    // LNURL payment
    if (validationResult.type === RECIPIENT_TYPES.LNURL && lnurlData) {
      const result = await executeLnurlPayment({
        apiKey,
        senderWalletId,
        lnurlData,
        amountSats: validationResult.amountSats
      });

      return {
        recipient,
        ...result
      };
    }

    // Unknown payment type
    return {
      recipient,
      success: false,
      error: {
        code: PAYMENT_ERROR_CODES.PAYMENT_FAILED,
        message: `Unknown payment type: ${validationResult.type}`
      }
    };

  } catch (error) {
    return {
      recipient,
      success: false,
      error: {
        code: PAYMENT_ERROR_CODES.NETWORK_ERROR,
        message: error.message
      }
    };
  }
}

/**
 * Execute batch payments sequentially
 * Note: Payments must be sequential to avoid Redlock conflicts in Blink API.
 * The API uses Redis locks per wallet, so parallel payments from the same
 * wallet cause ResourceAttemptsRedlockServiceError.
 * @param {object} params - Execution parameters
 * @returns {Promise<object>} Execution results
 */
async function executeBatchPayments({
  apiKey,
  senderWalletId,
  validationResults,
  onProgress = () => {}
}) {
  const results = [];
  const validRecipients = validationResults.filter(v => v.valid);

  let completed = 0;
  let successful = 0;
  let failed = 0;

  // Process payments sequentially (one at a time)
  for (let i = 0; i < validRecipients.length; i++) {
    const validationResult = validRecipients[i];

    try {
      const result = await processPayment({
        apiKey,
        senderWalletId,
        validationResult
      });

      results.push(result);
      if (result.success) {
        successful++;
      } else {
        failed++;
      }
    } catch (error) {
      // Build recipient object from flattened validation result
      const recipient = {
        rowNumber: validationResult.rowNumber,
        original: validationResult.recipient,
        type: validationResult.type,
        normalized: validationResult.normalized,
        amount: validationResult.amount,
        amountSats: validationResult.amountSats,
        currency: validationResult.currency,
        memo: validationResult.memo
      };
      results.push({
        recipient,
        success: false,
        error: {
          code: PAYMENT_ERROR_CODES.NETWORK_ERROR,
          message: error.message || 'Payment execution failed'
        }
      });
      failed++;
    }

    completed++;

    // Progress callback
    onProgress({
      completed,
      total: validRecipients.length,
      successful,
      failed,
      percent: Math.round((completed / validRecipients.length) * 100)
    });

    // Small delay between payments to avoid rate limiting
    if (i < validRecipients.length - 1) {
      await new Promise(resolve => setTimeout(resolve, PAYMENT_DELAY_MS));
    }
  }

  // Calculate summary
  const successfulPayments = results.filter(r => r.success);
  const failedPayments = results.filter(r => !r.success);

  const totalSent = successfulPayments.reduce(
    (sum, r) => sum + (r.recipient.amountSats || 0),
    0
  );

  const totalFees = successfulPayments.reduce(
    (sum, r) => sum + (r.feeSats || 0),
    0
  );

  return {
    results,
    summary: {
      totalRecipients: validRecipients.length,
      successful: successfulPayments.length,
      failed: failedPayments.length,
      totalSentSats: totalSent,
      totalFeesSats: totalFees
    }
  };
}

module.exports = {
  processPayment,
  executeBatchPayments,
  executeIntraLedgerPayment,
  executeLnAddressPayment,
  executeLnurlPayment,
  PAYMENT_ERROR_CODES,
  PAYMENT_DELAY_MS
};
