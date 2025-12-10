/**
 * API endpoint to validate a Blink Lightning Address and get wallet ID
 * 
 * This endpoint:
 * 1. Validates the Blink username/lightning address exists
 * 2. Returns the default wallet ID for that account
 * 
 * Used for connecting wallets via Lightning Address instead of API key.
 */

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

    // Query Blink public API to get account default wallet
    const query = `
      query accountDefaultWallet($username: Username!) {
        accountDefaultWallet(username: $username) {
          __typename
          id
          walletCurrency
        }
      }
    `;

    const response = await fetch('https://api.blink.sv/graphql', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query,
        variables: { username }
      })
    });

    if (!response.ok) {
      console.error('Blink API error:', response.status, response.statusText);
      return res.status(502).json({ error: 'Failed to validate lightning address' });
    }

    const data = await response.json();

    if (data.errors && data.errors.length > 0) {
      console.error('Blink GraphQL errors:', data.errors);
      
      // Check for "account not found" error
      const notFoundError = data.errors.find(e => 
        e.message?.toLowerCase().includes('not found') ||
        e.message?.toLowerCase().includes('no account') ||
        e.message?.toLowerCase().includes('no user')
      );
      
      if (notFoundError) {
        return res.status(404).json({ 
          error: 'Blink account not found. Please check the username.' 
        });
      }
      
      return res.status(400).json({ error: data.errors[0].message || 'Validation failed' });
    }

    const wallet = data.data?.accountDefaultWallet;

    if (!wallet || !wallet.id) {
      return res.status(404).json({ 
        error: 'Blink account not found. Please check the username.' 
      });
    }

    // Return validated wallet info
    res.status(200).json({
      success: true,
      username,
      walletId: wallet.id,
      walletCurrency: wallet.walletCurrency || 'BTC',
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

