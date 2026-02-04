/**
 * API endpoint to validate a Blink Lightning Address and get wallet ID
 * 
 * This endpoint:
 * 1. Validates the Blink username/lightning address exists
 * 2. Returns the default wallet ID for that account
 * 
 * Used for connecting wallets via Lightning Address instead of API key.
 */

const { getApiUrl } = require('../../../lib/config/api');

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { lnAddress } = req.body;

    if (!lnAddress) {
      return res.status(400).json({ error: 'Lightning address is required' });
    }

    // Parse the lightning address to get username
    // Accepts formats: "username", "username@blink.sv", "username@pay.blink.sv"
    let username = lnAddress.trim().toLowerCase();
    
    // Strip domain if present
    if (username.includes('@')) {
      const parts = username.split('@');
      username = parts[0];
      const domain = parts[1];
      
      // Validate it's a Blink domain
      const validDomains = ['blink.sv', 'pay.blink.sv', 'galoy.io'];
      if (!validDomains.includes(domain)) {
        return res.status(400).json({ 
          error: 'Invalid domain. Please use a Blink lightning address (e.g., username@blink.sv)' 
        });
      }
    }

    // Validate username format
    if (!/^[a-z0-9_]{3,50}$/i.test(username)) {
      return res.status(400).json({ 
        error: 'Invalid username format. Use only letters, numbers, and underscores (3-50 characters).' 
      });
    }

    // Query Blink public API to get account's BTC wallet
    // We specifically request the BTC wallet because lnInvoiceCreateOnBehalfOfRecipient
    // only works with BTC wallets (not USD wallets)
    const btcWalletQuery = `
      query accountDefaultWallet($username: Username!) {
        accountDefaultWallet(username: $username, walletCurrency: BTC) {
          __typename
          id
          walletCurrency
        }
      }
    `;

    const btcResponse = await fetch(getApiUrl(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: btcWalletQuery,
        variables: { username }
      })
    });

    if (!btcResponse.ok) {
      console.error('Blink API error:', btcResponse.status, btcResponse.statusText);
      return res.status(502).json({ error: 'Failed to validate lightning address' });
    }

    const btcData = await btcResponse.json();

    // Check for account not found error
    if (btcData.errors && btcData.errors.length > 0) {
      console.error('Blink GraphQL errors:', btcData.errors);
      
      const notFoundError = btcData.errors.find(e => 
        e.message?.toLowerCase().includes('not found') ||
        e.message?.toLowerCase().includes('no account') ||
        e.message?.toLowerCase().includes('no user')
      );
      
      if (notFoundError) {
        return res.status(404).json({ 
          error: 'Blink account not found. Please check the username.' 
        });
      }
      
      return res.status(400).json({ error: btcData.errors[0].message || 'Validation failed' });
    }

    const btcWallet = btcData.data?.accountDefaultWallet;

    if (!btcWallet || !btcWallet.id) {
      // Try to get any wallet (user might only have USD wallet)
      const anyWalletQuery = `
        query accountDefaultWallet($username: Username!) {
          accountDefaultWallet(username: $username) {
            __typename
            id
            walletCurrency
          }
        }
      `;

      const anyResponse = await fetch(getApiUrl(), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: anyWalletQuery,
          variables: { username }
        })
      });

      const anyData = await anyResponse.json();
      const anyWallet = anyData.data?.accountDefaultWallet;

      if (!anyWallet || !anyWallet.id) {
        return res.status(404).json({ 
          error: 'Blink account not found. Please check the username.' 
        });
      }

      // User has an account but no BTC wallet - return with warning
      console.log(`User ${username} has no BTC wallet, defaulting to ${anyWallet.walletCurrency} wallet`);
      
      return res.status(200).json({
        success: true,
        username,
        walletId: anyWallet.id,
        walletCurrency: anyWallet.walletCurrency || 'USD',
        lightningAddress: `${username}@blink.sv`,
        warning: 'This account does not have a BTC wallet. Payments may fail.'
      });
    }

    // Return validated BTC wallet info
    console.log(`Validated ${username} with BTC wallet: ${btcWallet.id}`);
    res.status(200).json({
      success: true,
      username,
      walletId: btcWallet.id,
      walletCurrency: 'BTC',
      lightningAddress: `${username}@blink.sv`
    });

  } catch (error) {
    console.error('Lightning address validation error:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}

