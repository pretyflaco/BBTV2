class BlinkAPI {
  constructor(apiKey) {
    this.apiKey = apiKey;
    this.baseUrl = 'https://api.blink.sv/graphql';
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
  convertToSatoshis(amount, currency, exchangeRate) {
    if (currency === 'BTC') {
      return Math.round(amount); // Already in sats
    }

    if (!exchangeRate || !exchangeRate.satPriceInCurrency) {
      throw new Error(`Exchange rate not available for ${currency}`);
    }

    // Convert major currency units to minor units (e.g., KES to cents), then to sats
    const amountInMinorUnits = amount * 100; // Convert to cents/minor units
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

  // Get transaction history
  async getTransactions(first = 100, after = null) {
    const query = `
      query TransactionsList($first: Int!, $after: String) {
        me {
          defaultAccount {
            transactions(first: $first, after: $after) {
              edges {
                cursor
                node {
                  id
                  direction
                  status
                  settlementAmount
                  settlementCurrency
                  createdAt
                  memo
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
    return data.me?.defaultAccount?.transactions || { edges: [], pageInfo: {} };
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
  async payLnInvoice(walletId, paymentRequest) {
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
        paymentRequest
      }
    };

    const data = await this.query(query, variables);
    
    if (data.lnInvoicePaymentSend?.errors?.length > 0) {
      throw new Error(data.lnInvoicePaymentSend.errors[0].message);
    }
    
    return data.lnInvoicePaymentSend;
  }

  // Send payment to Lightning Address (for tips)
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
