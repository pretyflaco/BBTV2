// Import centralized API configuration
// Note: We use dynamic import pattern for compatibility with both client and server
const getApiUrlFromConfig = () => {
  try {
    // Try to use the centralized config
    const { getApiUrl } = require('./config/api.js');
    return getApiUrl();
  } catch (e) {
    // Fallback if config not available (e.g., during SSR build)
    return process.env.BLINK_API_URL || 'https://api.blink.sv/graphql';
  }
};

class BlinkAPI {
  constructor(apiKey) {
    this.apiKey = apiKey;
    this.baseUrl = getApiUrlFromConfig();
  }

  // Make GraphQL request to Blink API
  async query(query, variables = {}) {
    try {
      const response = await fetch(this.baseUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-KEY': this.apiKey
        },
        body: JSON.stringify({ query, variables })
      });

      // Check if response is OK before parsing JSON
      if (!response.ok) {
        const contentType = response.headers.get('content-type');
        let errorMessage = `Blink API HTTP error: ${response.status}`;
        
        // Try to get error details if it's JSON
        if (contentType && contentType.includes('application/json')) {
          try {
            const errorData = await response.json();
            errorMessage = errorData.message || errorData.error || errorMessage;
          } catch (e) {
            // Failed to parse error as JSON, use default message
          }
        } else {
          // Response is not JSON (likely HTML error page)
          const text = await response.text();
          console.error('Blink API non-JSON response:', text.substring(0, 200));
          errorMessage = `Blink API returned non-JSON response (${response.status})`;
        }
        
        throw new Error(errorMessage);
      }

      const data = await response.json();
      
      if (data.errors) {
        throw new Error(data.errors[0]?.message || 'GraphQL error');
      }

      return data.data;
    } catch (error) {
      console.error('Blink API error:', error);
      throw error;
    }
  }

  // Get user information including display currency
  async getMe() {
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

    const data = await this.query(query);
    return data.me;
  }

  // Get exchange rate for a currency
  async getExchangeRate(currency) {
    if (currency === 'BTC') {
      return { satPriceInCurrency: 1 }; // 1 sat = 1 sat
    }

    const query = `
      query realtimePrice($currency: DisplayCurrency!) {
        realtimePrice(currency: $currency) {
          btcSatPrice {
            base
            offset
          }
        }
      }
    `;

    const variables = {
      currency: currency.toUpperCase()
    };

    const data = await this.query(query, variables);
    
    if (!data.realtimePrice || !data.realtimePrice.btcSatPrice) {
      throw new Error(`Exchange rate not available for ${currency}`);
    }

    const btcSatPrice = data.realtimePrice.btcSatPrice;
    // Calculate price of 1 sat in the queried currency
    const satPriceInCurrency = btcSatPrice.base / Math.pow(10, btcSatPrice.offset);
    
    
    return {
      satPriceInCurrency: satPriceInCurrency,
      currency: currency.toUpperCase()
    };
  }

  // Convert fiat currency amount to satoshis
  convertToSatoshis(amount, currency, exchangeRate, fractionDigits = 2) {
    if (currency === 'BTC') {
      return Math.round(amount); // Already in sats
    }

    if (!exchangeRate || !exchangeRate.satPriceInCurrency) {
      throw new Error(`Exchange rate not available for ${currency}`);
    }

    // Use currency's fractionDigits (0 for KRW/JPY, 2 for USD/EUR, etc.)
    const amountInMinorUnits = amount * Math.pow(10, fractionDigits);
    const satsAmount = Math.round(amountInMinorUnits / exchangeRate.satPriceInCurrency);
    
    return satsAmount;
  }

  // Get wallet balances
  async getBalance() {
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

    const data = await this.query(query);
    return data.me?.defaultAccount?.wallets || [];
  }

  // Get transaction history with all fields for CSV export
  async getTransactions(first = 100, after = null) {
    const query = `
      query TransactionsList($first: Int!, $after: String) {
        me {
          defaultAccount {
            id
            transactions(first: $first, after: $after) {
              edges {
                cursor
                node {
                  id
                  direction
                  status
                  settlementAmount
                  settlementFee
                  settlementCurrency
                  settlementDisplayAmount
                  settlementDisplayCurrency
                  settlementDisplayFee
                  createdAt
                  memo
                  initiationVia {
                    __typename
                    ... on InitiationViaLn {
                      paymentHash
                    }
                    ... on InitiationViaOnChain {
                      address
                    }
                    ... on InitiationViaIntraLedger {
                      counterPartyUsername
                      counterPartyWalletId
                    }
                  }
                  settlementVia {
                    __typename
                    ... on SettlementViaLn {
                      preImage
                    }
                    ... on SettlementViaOnChain {
                      transactionHash
                      vout
                    }
                    ... on SettlementViaIntraLedger {
                      counterPartyUsername
                      counterPartyWalletId
                      preImage
                    }
                  }
                }
              }
              pageInfo {
                hasNextPage
                endCursor
              }
            }
          }
        }
      }
    `;

    const data = await this.query(query, { first, after });
    const transactions = data.me?.defaultAccount?.transactions || { edges: [], pageInfo: {} };
    
    // Add walletId to each transaction for CSV export
    const walletId = data.me?.defaultAccount?.id;
    if (walletId && transactions.edges) {
      transactions.edges = transactions.edges.map(edge => ({
        ...edge,
        node: {
          ...edge.node,
          walletId
        }
      }));
    }
    
    return transactions;
  }

  // Get user info
  async getUserInfo() {
    const query = `
      query {
        me {
          id
          username
          defaultAccount {
            id
          }
        }
      }
    `;

    return await this.query(query);
  }

  // Get CSV export from Blink (official backend-generated CSV with all fields)
  async getCsvTransactions(walletIds) {
    const query = `
      query ExportCsv($walletIds: [WalletId!]!) {
        me {
          id
          defaultAccount {
            id
            csvTransactions(walletIds: $walletIds)
          }
        }
      }
    `;

    const data = await this.query(query, { walletIds });
    return data.me?.defaultAccount?.csvTransactions;
  }

  // Create Lightning invoice for BTC payments
  async createLnInvoice(walletId, amount, memo = '') {
    const query = `
      mutation LnInvoiceCreate($input: LnInvoiceCreateInput!) {
        lnInvoiceCreate(input: $input) {
          invoice {
            paymentRequest
            paymentHash
            paymentSecret
            satoshis
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
        amount,
        memo
      }
    };

    const data = await this.query(query, variables);
    
    if (data.lnInvoiceCreate?.errors?.length > 0) {
      throw new Error(data.lnInvoiceCreate.errors[0].message);
    }
    
    return data.lnInvoiceCreate?.invoice;
  }

  // Create Lightning invoice for USD payments
  async createLnUsdInvoice(walletId, amount, memo = '') {
    const query = `
      mutation LnUsdInvoiceCreate($input: LnUsdInvoiceCreateInput!) {
        lnUsdInvoiceCreate(input: $input) {
          invoice {
            paymentRequest
            paymentHash
            paymentSecret
            satoshis
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
        amount,
        memo
      }
    };

    const data = await this.query(query, variables);
    
    if (data.lnUsdInvoiceCreate?.errors?.length > 0) {
      throw new Error(data.lnUsdInvoiceCreate.errors[0].message);
    }
    
    return data.lnUsdInvoiceCreate?.invoice;
  }

  // Get wallet IDs and currencies
  async getWalletInfo() {
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

    const data = await this.query(query);
    return data.me?.defaultAccount?.wallets || [];
  }

  // Format amount for display
  static formatAmount(amount, currency) {
    if (currency === 'BTC') {
      // Amount is already in sats from Blink API
      return `${Math.round(amount).toLocaleString()} sats`;
    }
    
    if (currency === 'USD') {
      // Amount is in cents, convert to dollars
      const dollars = amount / 100;
      return `${dollars.toFixed(2)} USD`;
    }
    
    return `${amount.toLocaleString()} ${currency}`;
  }

  // Pay a Lightning invoice (for payment forwarding)
  // memo: Optional memo to associate with the payment (shows in receiver's transaction history for intra-ledger)
  async payLnInvoice(walletId, paymentRequest, memo = '') {
    const query = `
      mutation LnInvoicePaymentSend($input: LnInvoicePaymentInput!) {
        lnInvoicePaymentSend(input: $input) {
          status
          errors {
            message
            path
            code
          }
        }
      }
    `;

    const variables = {
      input: {
        walletId,
        paymentRequest,
        ...(memo && { memo }) // Only include memo if provided
      }
    };

    const data = await this.query(query, variables);
    
    if (data.lnInvoicePaymentSend?.errors?.length > 0) {
      throw new Error(data.lnInvoicePaymentSend.errors[0].message);
    }
    
    return data.lnInvoicePaymentSend;
  }

  // Send payment to Lightning Address (for tips)
  // NOTE: Currently commented out as LN Address payments don't support custom memos
  // May be used later for external Lightning addresses
  /*
  async payLnAddress(walletId, lnAddress, amount, memo = '') {
    
    const query = `
      mutation LnAddressPaymentSend($input: LnAddressPaymentSendInput!) {
        lnAddressPaymentSend(input: $input) {
          status
          errors {
            code
            message
            path
          }
        }
      }
    `;

    // Note: Based on the provided schema, memo is not supported in LnAddressPaymentSend
    const variables = {
      input: {
        walletId,
        lnAddress,
        amount: amount.toString() // Convert to string as per schema
      }
    };

    try {
      const data = await this.query(query, variables);
      
      if (data.lnAddressPaymentSend?.errors?.length > 0) {
        console.error('❌ LN Address payment errors:', data.lnAddressPaymentSend.errors);
        throw new Error(`LN Address payment failed: ${data.lnAddressPaymentSend.errors[0].message} (Code: ${data.lnAddressPaymentSend.errors[0].code})`);
      }
      
      return data.lnAddressPaymentSend;
    } catch (error) {
      console.error('❌ LN Address payment failed:', error);
      throw error;
    }
  }
  */

  // Get exchange rate without authentication (uses mainnet public endpoint)
  // This is useful for public POS and other unauthenticated scenarios
  static async getExchangeRatePublic(currency) {
    if (currency === 'BTC' || currency === 'SAT') {
      return { satPriceInCurrency: 1, currency: 'BTC' }; // 1 sat = 1 sat
    }

    const query = `
      query realtimePrice($currency: DisplayCurrency!) {
        realtimePrice(currency: $currency) {
          btcSatPrice {
            base
            offset
          }
        }
      }
    `;

    const variables = {
      currency: currency.toUpperCase()
    };

    try {
      // Always use mainnet for public exchange rates (no auth required)
      const mainnetUrl = 'https://api.blink.sv/graphql';
      
      const response = await fetch(mainnetUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          // No API key needed for public realtimePrice query
        },
        body: JSON.stringify({ query, variables })
      });

      if (!response.ok) {
        const text = await response.text();
        console.error('Public exchange rate API error response:', text.substring(0, 200));
        throw new Error(`Failed to fetch public exchange rate: ${response.status}`);
      }

      const data = await response.json();
      
      if (data.errors) {
        throw new Error(data.errors[0]?.message || 'GraphQL error fetching exchange rate');
      }

      if (!data.data?.realtimePrice?.btcSatPrice) {
        throw new Error(`Exchange rate not available for ${currency}`);
      }

      const btcSatPrice = data.data.realtimePrice.btcSatPrice;
      // Calculate price of 1 sat in the queried currency
      const satPriceInCurrency = btcSatPrice.base / Math.pow(10, btcSatPrice.offset);
      
      return {
        satPriceInCurrency: satPriceInCurrency,
        currency: currency.toUpperCase()
      };
    } catch (error) {
      console.error('❌ Error getting public exchange rate:', currency, error);
      throw error;
    }
  }

  // Get wallet information for a Blink username (unauthenticated call)
  static async getWalletByUsername(username) {
    const query = `
      query AccountDefaultWallet($username: Username!) {
        accountDefaultWallet(username: $username) {
          id
          currency
        }
      }
    `;

    const variables = { username };

    try {
      const response = await fetch(getApiUrlFromConfig(), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query, variables })
      });

      const data = await response.json();
      
      if (data.errors) {
        throw new Error(data.errors[0]?.message || 'Error fetching wallet information');
      }

      return {
        id: data.data.accountDefaultWallet?.id,
        currency: data.data.accountDefaultWallet?.currency
      };
    } catch (error) {
      console.error('❌ Error getting wallet for username:', username, error);
      throw error;
    }
  }

  // Get BTC wallet for a username
  // Uses walletCurrency parameter to directly query for BTC wallet,
  // even if user's default wallet is USD
  static async getBtcWalletByUsername(username) {
    const query = `
      query AccountDefaultWallet($username: Username!, $walletCurrency: WalletCurrency) {
        accountDefaultWallet(username: $username, walletCurrency: $walletCurrency) {
          id
          currency
        }
      }
    `;

    const variables = { 
      username,
      walletCurrency: 'BTC' // Explicitly request BTC wallet
    };

    try {
      const response = await fetch(getApiUrlFromConfig(), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query, variables })
      });

      const data = await response.json();
      
      if (data.errors) {
        throw new Error(data.errors[0]?.message || 'Error fetching wallet information');
      }

      const btcWallet = data.data.accountDefaultWallet;
      if (!btcWallet?.id) {
        throw new Error(`No BTC wallet found for username: ${username}. User may not have a BTC wallet set up.`);
      }

      if (btcWallet.currency !== 'BTC') {
        throw new Error(`Expected BTC wallet but got ${btcWallet.currency} wallet for username: ${username}`);
      }

      return {
        id: btcWallet.id,
        currency: btcWallet.currency
      };
    } catch (error) {
      console.error('❌ Error getting BTC wallet for username:', username, error);
      throw error;
    }
  }

  // Create invoice on behalf of recipient with custom memo (unauthenticated call)
  static async createInvoiceOnBehalfOfRecipient(recipientWalletId, amount, memo, expiresInMinutes = 15) {
    const mutation = `
      mutation LnInvoiceCreateOnBehalfOfRecipient($input: LnInvoiceCreateOnBehalfOfRecipientInput!) {
        lnInvoiceCreateOnBehalfOfRecipient(input: $input) {
          invoice {
            paymentRequest
            paymentHash
            satoshis
          }
        }
      }
    `;

    const variables = {
      input: {
        recipientWalletId,
        amount: amount.toString(),
        memo,
        expiresIn: expiresInMinutes.toString()
      }
    };

    try {
      const response = await fetch(getApiUrlFromConfig(), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query: mutation, variables })
      });

      const data = await response.json();
      
      if (data.errors) {
        throw new Error(data.errors[0]?.message || 'Error creating invoice on behalf of recipient');
      }

      return data.data.lnInvoiceCreateOnBehalfOfRecipient.invoice;
    } catch (error) {
      console.error('❌ Error creating invoice on behalf of recipient:', error);
      throw error;
    }
  }

  // Send tip by creating invoice on behalf of recipient and paying it
  async sendTipViaInvoice(fromWalletId, recipientUsername, amount, memo) {
    try {
      console.log('💡 Sending tip via invoice creation approach:', {
        fromWalletId,
        recipientUsername,
        amount,
        memo
      });

      // Step 1: Get recipient's BTC wallet ID (required for BTC invoice creation)
      // This will throw an error if the user's default wallet is not BTC
      const recipientWallet = await BlinkAPI.getBtcWalletByUsername(recipientUsername);
      if (!recipientWallet?.id) {
        throw new Error(`Could not find BTC wallet for username: ${recipientUsername}`);
      }

      console.log('📋 Recipient BTC wallet found:', recipientWallet);

      // Step 2: Create invoice on behalf of recipient with custom memo
      const invoice = await BlinkAPI.createInvoiceOnBehalfOfRecipient(
        recipientWallet.id,
        amount,
        memo,
        15 // 15 minutes expiry
      );

      if (!invoice || !invoice.paymentHash) {
        throw new Error(`Failed to create invoice for ${recipientUsername}: invoice creation returned null or invalid response`);
      }

      console.log('📄 Invoice created on behalf of recipient:', {
        paymentHash: invoice.paymentHash,
        satoshis: invoice.satoshis
      });

      // Step 3: Pay the invoice from our wallet (pass memo for intra-ledger visibility)
      const paymentResult = await this.payLnInvoice(fromWalletId, invoice.paymentRequest, memo);

      console.log('💰 Invoice payment result:', paymentResult);

      return {
        status: 'SUCCESS',
        paymentHash: invoice.paymentHash,
        satoshis: invoice.satoshis,
        memo
      };

    } catch (error) {
      console.error('❌ Tip via invoice failed:', error);
      throw error;
    }
  }

  // Format date for display
  static formatDate(dateString) {
    try {
      let date;
      
      // Handle different date formats
      if (typeof dateString === 'number') {
        // Unix timestamp (seconds)
        date = new Date(dateString * 1000);
      } else if (typeof dateString === 'string') {
        // Check if it's an ISO date string first
        if (dateString.includes('T') || dateString.includes('-')) {
          // ISO date string format
          date = new Date(dateString);
        } else {
          // Check if it's a timestamp in milliseconds or seconds
          const numericValue = parseInt(dateString);
          if (!isNaN(numericValue)) {
            // If it's a very large number, it's likely milliseconds
            if (numericValue > 1000000000000) {
              date = new Date(numericValue);
            } else {
              // Otherwise it's likely seconds
              date = new Date(numericValue * 1000);
            }
          } else {
            // Regular date string
            date = new Date(dateString);
          }
        }
      } else {
        date = new Date(dateString);
      }
      
      // Validate the date
      if (isNaN(date.getTime())) {
        return dateString;
      }
      
      return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch (error) {
      console.error('Date formatting error:', error, 'Input:', dateString);
      return dateString;
    }
  }

  // Determine transaction amount with proper sign
  static getTransactionAmount(transaction) {
    const amount = Math.abs(transaction.settlementAmount);
    const sign = transaction.direction === 'RECEIVE' ? '+' : '-';
    const formattedAmount = BlinkAPI.formatAmount(amount, transaction.settlementCurrency);
    
    return `${sign}${formattedAmount}`;
  }
}

module.exports = BlinkAPI;
