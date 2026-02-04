import Head from 'next/head';
import PublicPOSDashboard from '../components/PublicPOSDashboard';

// Note: getApiUrl cannot be used in getServerSideProps since it relies on client-side localStorage
// For SSR, we always validate against production. Staging validation happens client-side.
// This means:
// 1. SSR checks if username exists on MAINNET (fast 404 for invalid users)
// 2. If user is in staging mode, client-side re-validates against STAGING API
// 3. If user exists on mainnet but not staging, client shows an error
const getServerApiUrl = () => {
  // Always use production for SSR validation
  // Staging validation is handled client-side in PublicPOSDashboard
  return 'https://api.blink.sv/graphql';
};

/**
 * Public POS Page - Pay any Blink user directly
 * 
 * URL: track.twentyone.ist/[blinkusername]
 * 
 * Features:
 * - No authentication required
 * - Creates invoices directly to user's Blink wallet
 * - Same design as authenticated POS (dark/light modes, numpad, etc.)
 * - Only Cart and POS views (no transaction history)
 * - Limited menu (Display Currency, Paycodes, Sound Effects)
 * - 150% zoom on desktop
 */

// Validate username on server side
export async function getServerSideProps(context) {
  const { blinkusername } = context.params;
  
  // Basic username validation (alphanumeric, 3-30 chars)
  const usernameRegex = /^[a-zA-Z0-9_]{3,30}$/;
  if (!usernameRegex.test(blinkusername)) {
    return { notFound: true };
  }

  // Check if user exists by querying Blink API
  try {
    const response = await fetch(getServerApiUrl(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: `
          query AccountDefaultWallet($username: Username!) {
            accountDefaultWallet(username: $username) {
              id
              walletCurrency
            }
          }
        `,
        variables: { username: blinkusername }
      })
    });

    const data = await response.json();
    
    if (data.errors || !data.data?.accountDefaultWallet?.id) {
      console.log(`[PublicPOS] User not found: ${blinkusername}`);
      return { notFound: true };
    }

    return {
      props: {
        username: blinkusername,
        walletCurrency: data.data.accountDefaultWallet.walletCurrency || 'BTC'
      }
    };
  } catch (error) {
    console.error('[PublicPOS] Error validating username:', error);
    return { notFound: true };
  }
}

export default function PublicPOS({ username, walletCurrency }) {
  return (
    <>
      <Head>
        <title>Pay {username} | Blink Bitcoin Terminal</title>
        <meta name="description" content={`Pay ${username} with Bitcoin Lightning`} />
        <meta name="theme-color" content="#ffffff" media="(prefers-color-scheme: light)" />
        <meta name="theme-color" content="#000000" media="(prefers-color-scheme: dark)" />
        <link rel="icon" href="/icons/icon-ios-192x192.png" />
        <link rel="apple-touch-icon" href="/icons/icon-ios-192x192.png" />
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
      </Head>

      <PublicPOSDashboard 
        username={username} 
        walletCurrency={walletCurrency} 
      />
    </>
  );
}
