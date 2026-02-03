const voucherStore = require('../../../../../lib/voucher-store');
const BlinkAPI = require('../../../../../lib/blink-api');
/**
 * LNURL-withdraw endpoint for vouchers
 * Returns LnurlWithdrawResponse when scanned by a Lightning wallet
 * 
 * GET /api/voucher/lnurl/[chargeId]/[amount]
 * 
 * Following LUD-03 spec: https://github.com/lnurl/luds/blob/luds/03.md
 * Always returns HTTP 200 with status in JSON body
 */
export default async function handler(req, res) {
  // Add CORS headers for LNURL compatibility
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(200).json({
      status: 'ERROR',
      reason: 'Method not allowed'
    });
  }

  console.log("we are inside lnur; fetch")

  try {
    const { chargeId, amount } = req.query;

    console.log('🔔 LNURL-withdraw request received:', {
      chargeId: chargeId ? chargeId.substring(0, 8) + '...' : 'missing',
      amount: amount || 'missing',
      timestamp: new Date().toISOString()
    });

    // Validate parameters
    if (!chargeId || !amount) {
      console.error('❌ Missing chargeId or amount');
      return res.status(200).json({
        status: 'ERROR',
        reason: 'Missing chargeId or amount'
      });
    }

    const amountNum = parseInt(amount);
    if (isNaN(amountNum) || amountNum <= 0) {
      console.error('❌ Invalid amount:', amount);
      return res.status(200).json({
        status: 'ERROR',
        reason: 'Invalid amount'
      });
    }

    // Get voucher from store (PostgreSQL)
    const voucher = await voucherStore.getVoucher(chargeId);
    console.log("voucher is:", voucher);
    if (!voucher) {
      console.error('❌ Voucher not found or expired:', chargeId);
      return res.status(200).json({
        status: 'ERROR',
        reason: 'Voucher not found or expired'
      });
    }

    // Verify amount matches voucher
    if (voucher.amount !== amountNum) {
      console.error('❌ Amount mismatch:', { requested: amountNum, voucher: voucher.amount });
      return res.status(200).json({
        status: 'ERROR',
        reason: `Amount mismatch. Expected ${voucher.amount} sats`
      });
    }

    // Check if already claimed
    if (voucher.claimed) {
      console.error('❌ Voucher already claimed:', chargeId);
      return res.status(200).json({
        status: 'ERROR',
        reason: 'Voucher has already been claimed'
      });
    }

    // Build callback URL (full URL required by LNURL spec)
    const protocol = req.headers['x-forwarded-proto'] || 'http';
    const host = req.headers['x-forwarded-host'] || req.headers.host;
    const callbackUrl = `${protocol}://${host}/api/voucher/callback`;

    console.log('📋 LNURL-withdraw serving voucher:', {
      chargeId: chargeId.substring(0, 8) + '...',
      amount: amountNum,
      voucherAmount: voucher.amount,
      callback: callbackUrl
    });

    if (voucher.displayCurrency == "USD") {
  
      // convert the usd value in sats
      const usdbtcRate = await getBtcUsdFromCoingecko();
     
      console.log("usdbtcRate is:", usdbtcRate);

      console.log("voucher.amountNum is:", voucher.amount);
      const usdToSats = Math.floor((Number(voucher.amount) / usdbtcRate.btcUsd) * 100_000_000);
      console.log("usdToSats is:", usdToSats);
      const response = {
        tag: 'withdrawRequest',
        callback: callbackUrl,
        k1: chargeId,
        minWithdrawable: usdToSats * 1000, // Convert sats to millisats
        maxWithdrawable: 10_000_000_000, // Convert sats to millisats
        defaultDescription: `BlinkPOS Voucher: ${usdToSats} sats`
      };
      console.log('✅ Returning LNURL-withdraw response for usd');
      return res.status(200).json(response);
    }
    // Return LNURL-withdraw response
    // Following LUD-03 spec: https://github.com/lnurl/luds/blob/luds/03.md
    const response = {
      tag: 'withdrawRequest',
      callback: callbackUrl,
      k1: chargeId,
      minWithdrawable: amountNum * 1000, // Convert sats to millisats
      maxWithdrawable: amountNum * 1000, // Convert sats to millisats
      defaultDescription: `BlinkPOS Voucher: ${amountNum} sats`
    };

    console.log('✅ Returning LNURL-withdraw response - sats');
    return res.status(200).json(response);

  } catch (error) {
    console.error('❌ LNURL-withdraw error:', error);

    // LNURL spec: always return 200 with status in body
    return res.status(200).json({
      status: 'ERROR',
      reason: 'Internal server error'
    });
  }
}


/**
 * Fetch BTC → USD rate from CoinGecko
 * Returns sat price in USD
 */
async function getBtcUsdFromCoingecko() {
  const res = await fetch(
    "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd"
  );

  if (!res.ok) {
    throw new Error("Failed to fetch BTC/USD from CoinGecko");
  }

  const data = await res.json();
  const btcUsd = data?.bitcoin?.usd;

  if (!btcUsd) {
    throw new Error("Invalid CoinGecko response");
  }

  return {
    btcUsd: btcUsd,
    provider: "coingecko",
  };
}
