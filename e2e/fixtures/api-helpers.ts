/**
 * API Helpers for E2E Tests
 * 
 * Direct Blink API calls for test setup and verification.
 * These helpers bypass the UI to perform actions needed for testing.
 */

import { API_ENDPOINTS, TEST_CREDENTIALS } from './test-data';

// Types
export interface WalletInfo {
  id: string;
  walletCurrency: 'BTC' | 'USD';
  balance: number;
}

export interface BalanceResult {
  btcWallet: WalletInfo | null;
  usdWallet: WalletInfo | null;
  btcBalance: number;
  usdBalance: number;
}

export interface PaymentResult {
  success: boolean;
  status?: string;
  error?: {
    code: string;
    message: string;
  };
}

export interface UserInfo {
  username: string;
  displayCurrency: string;
}

/**
 * Make a GraphQL request to Blink API
 */
async function blinkQuery<T>(
  apiKey: string,
  query: string,
  variables: Record<string, unknown> = {},
  useStaging = true
): Promise<T> {
  const url = useStaging ? API_ENDPOINTS.staging : API_ENDPOINTS.production;
  
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-KEY': apiKey,
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!response.ok) {
    throw new Error(`Blink API HTTP error: ${response.status}`);
  }

  const data = await response.json();

  if (data.errors && data.errors.length > 0) {
    throw new Error(`Blink API error: ${data.errors[0].message}`);
  }

  return data.data as T;
}

/**
 * Get user info (username and display currency)
 */
export async function getUserInfo(
  apiKey: string = TEST_CREDENTIALS.apiKeys.readReceiveWrite
): Promise<UserInfo> {
  const query = `
    query Me {
      me {
        username
        defaultAccount {
          displayCurrency
        }
      }
    }
  `;

  const data = await blinkQuery<{ me: { username: string; defaultAccount: { displayCurrency: string } } }>(
    apiKey,
    query
  );

  return {
    username: data.me.username,
    displayCurrency: data.me.defaultAccount.displayCurrency,
  };
}

/**
 * Get wallet balances
 */
export async function getWalletBalance(
  apiKey: string = TEST_CREDENTIALS.apiKeys.readReceiveWrite
): Promise<BalanceResult> {
  const query = `
    query {
      me {
        defaultAccount {
          wallets {
            id
            walletCurrency
            balance
          }
        }
      }
    }
  `;

  const data = await blinkQuery<{
    me: {
      defaultAccount: {
        wallets: WalletInfo[];
      };
    };
  }>(apiKey, query);

  const wallets = data.me.defaultAccount.wallets;
  const btcWallet = wallets.find(w => w.walletCurrency === 'BTC') || null;
  const usdWallet = wallets.find(w => w.walletCurrency === 'USD') || null;

  return {
    btcWallet,
    usdWallet,
    btcBalance: btcWallet?.balance ?? 0,
    usdBalance: usdWallet?.balance ?? 0,
  };
}

/**
 * Get wallet ID for a specific currency
 */
export async function getWalletId(
  apiKey: string = TEST_CREDENTIALS.apiKeys.readReceiveWrite,
  currency: 'BTC' | 'USD' = 'BTC'
): Promise<string | null> {
  const balance = await getWalletBalance(apiKey);
  
  if (currency === 'BTC') {
    return balance.btcWallet?.id ?? null;
  } else {
    return balance.usdWallet?.id ?? null;
  }
}

/**
 * Send payment to a Lightning Address
 * 
 * Uses lnAddressPaymentSend mutation
 * 
 * @param apiKey - Blink API key with write permissions
 * @param lnAddress - Recipient's Lightning Address (e.g., test@pay.staging.blink.sv)
 * @param amountSats - Amount in satoshis
 * @param walletId - Sender's wallet ID (optional, will fetch BTC wallet if not provided)
 */
export async function sendPaymentToLightningAddress(
  apiKey: string = TEST_CREDENTIALS.apiKeys.readReceiveWrite,
  lnAddress: string,
  amountSats: number,
  walletId?: string
): Promise<PaymentResult> {
  // Get wallet ID if not provided
  if (!walletId) {
    walletId = await getWalletId(apiKey, 'BTC') ?? undefined;
    if (!walletId) {
      return {
        success: false,
        error: {
          code: 'NO_WALLET',
          message: 'Could not find BTC wallet',
        },
      };
    }
  }

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
      walletId,
      lnAddress,
      amount: amountSats,
    },
  };

  try {
    const data = await blinkQuery<{
      lnAddressPaymentSend: {
        status: string;
        errors: Array<{ message: string; code: string }>;
      };
    }>(apiKey, mutation, variables);

    const result = data.lnAddressPaymentSend;

    if (result.errors && result.errors.length > 0) {
      return {
        success: false,
        status: result.status,
        error: {
          code: result.errors[0].code || 'PAYMENT_FAILED',
          message: result.errors[0].message,
        },
      };
    }

    return {
      success: true,
      status: result.status,
    };
  } catch (error) {
    return {
      success: false,
      error: {
        code: 'NETWORK_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
    };
  }
}

/**
 * Get transaction history
 */
export async function getTransactionHistory(
  apiKey: string = TEST_CREDENTIALS.apiKeys.readReceiveWrite,
  first: number = 10
): Promise<Array<{
  id: string;
  status: string;
  direction: string;
  settlementAmount: number;
  createdAt: string;
}>> {
  const query = `
    query TransactionHistory($first: Int) {
      me {
        defaultAccount {
          transactions(first: $first) {
            edges {
              node {
                id
                status
                direction
                settlementAmount
                createdAt
              }
            }
          }
        }
      }
    }
  `;

  const data = await blinkQuery<{
    me: {
      defaultAccount: {
        transactions: {
          edges: Array<{
            node: {
              id: string;
              status: string;
              direction: string;
              settlementAmount: number;
              createdAt: string;
            };
          }>;
        };
      };
    };
  }>(apiKey, query, { first });

  return data.me.defaultAccount.transactions.edges.map(edge => edge.node);
}

/**
 * Create a Lightning invoice
 */
export async function createInvoice(
  apiKey: string = TEST_CREDENTIALS.apiKeys.readReceive,
  amountSats: number,
  memo?: string,
  walletId?: string
): Promise<{
  success: boolean;
  paymentRequest?: string;
  paymentHash?: string;
  error?: string;
}> {
  // Get wallet ID if not provided
  if (!walletId) {
    walletId = await getWalletId(apiKey, 'BTC') ?? undefined;
    if (!walletId) {
      return {
        success: false,
        error: 'Could not find BTC wallet',
      };
    }
  }

  const mutation = `
    mutation LnInvoiceCreate($input: LnInvoiceCreateInput!) {
      lnInvoiceCreate(input: $input) {
        invoice {
          paymentRequest
          paymentHash
        }
        errors {
          message
        }
      }
    }
  `;

  const variables = {
    input: {
      walletId,
      amount: amountSats,
      memo: memo || undefined,
    },
  };

  try {
    const data = await blinkQuery<{
      lnInvoiceCreate: {
        invoice: {
          paymentRequest: string;
          paymentHash: string;
        };
        errors: Array<{ message: string }>;
      };
    }>(apiKey, mutation, variables);

    const result = data.lnInvoiceCreate;

    if (result.errors && result.errors.length > 0) {
      return {
        success: false,
        error: result.errors[0].message,
      };
    }

    return {
      success: true,
      paymentRequest: result.invoice.paymentRequest,
      paymentHash: result.invoice.paymentHash,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Poll for balance change
 * 
 * Useful for waiting for a transaction to settle
 * 
 * @param apiKey - Blink API key
 * @param initialBalance - Starting balance to compare against
 * @param direction - 'increase' or 'decrease'
 * @param timeoutMs - Maximum time to wait
 * @param intervalMs - Polling interval
 */
export async function waitForBalanceChange(
  apiKey: string = TEST_CREDENTIALS.apiKeys.readReceiveWrite,
  initialBalance: number,
  direction: 'increase' | 'decrease' = 'decrease',
  timeoutMs: number = 10000,
  intervalMs: number = 1000
): Promise<{
  changed: boolean;
  newBalance: number;
  difference: number;
}> {
  const startTime = Date.now();
  
  while (Date.now() - startTime < timeoutMs) {
    const balance = await getWalletBalance(apiKey);
    const currentBalance = balance.btcBalance;
    
    const hasChanged = direction === 'increase'
      ? currentBalance > initialBalance
      : currentBalance < initialBalance;
    
    if (hasChanged) {
      return {
        changed: true,
        newBalance: currentBalance,
        difference: currentBalance - initialBalance,
      };
    }
    
    // Wait before next poll
    await new Promise(resolve => setTimeout(resolve, intervalMs));
  }
  
  // Timeout - return current state
  const finalBalance = await getWalletBalance(apiKey);
  return {
    changed: false,
    newBalance: finalBalance.btcBalance,
    difference: finalBalance.btcBalance - initialBalance,
  };
}
