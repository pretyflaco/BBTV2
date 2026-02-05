/**
 * API endpoint to check if a payment has been received for a given payment hash
 * 
 * Used when the app regains focus after being in the background to check
 * if a pending invoice was paid while the user was away.
 */

import BlinkAPI from '../../../lib/blink-api';
import { getApiUrlForEnvironment } from '../../../lib/config/api';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { paymentHash, environment = 'production' } = req.body;

    if (!paymentHash) {
      return res.status(400).json({ error: 'Payment hash is required' });
    }

    // Get BlinkPOS credentials based on environment
    const isStaging = environment === 'staging';
    const blinkposApiKey = isStaging 
      ? process.env.BLINKPOS_STAGING_API_KEY 
      : process.env.BLINKPOS_API_KEY;
    const blinkposBtcWalletId = isStaging 
      ? process.env.BLINKPOS_STAGING_BTC_WALLET_ID 
      : process.env.BLINKPOS_BTC_WALLET_ID;
    const apiUrl = getApiUrlForEnvironment(environment);

    if (!blinkposApiKey || !blinkposBtcWalletId) {
      return res.status(500).json({ error: 'BlinkPOS configuration missing' });
    }

    const blinkposAPI = new BlinkAPI(blinkposApiKey, apiUrl);

    // Query recent transactions and look for matching payment hash
    const query = `
      query GetRecentTransactions($walletId: WalletId!) {
        me {
          defaultAccount {
            walletById(walletId: $walletId) {
              transactions(first: 30) {
                edges {
                  node {
                    id
                    status
                    direction
                    settlementAmount
                    createdAt
                    initiationVia {
                      ... on InitiationViaLn {
                        paymentHash
                      }
                      ... on InitiationViaIntraLedger {
                        counterPartyUsername
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    `;

    try {
      const result = await blinkposAPI.query(query, { walletId: blinkposBtcWalletId });
      const transactions = result?.me?.defaultAccount?.walletById?.transactions?.edges || [];

      // Find a matching receive transaction by payment hash
      const matchingTx = transactions.find(edge => {
        const tx = edge.node;
        return tx.direction === 'RECEIVE' && 
               tx.status === 'SUCCESS' &&
               tx.initiationVia?.paymentHash === paymentHash;
      });

      if (matchingTx) {
        console.log(`✅ [CheckPayment] Payment found for hash ${paymentHash.substring(0, 16)}...`);
        return res.status(200).json({
          paid: true,
          transaction: {
            id: matchingTx.node.id,
            amount: matchingTx.node.settlementAmount,
            createdAt: matchingTx.node.createdAt,
            status: matchingTx.node.status
          }
        });
      }

      console.log(`ℹ️ [CheckPayment] No payment found for hash ${paymentHash.substring(0, 16)}...`);
      return res.status(200).json({ paid: false });

    } catch (queryError) {
      console.error('❌ [CheckPayment] Query error:', queryError.message);
      return res.status(200).json({ 
        paid: false, 
        error: 'Could not verify payment status' 
      });
    }

  } catch (error) {
    console.error('❌ [CheckPayment] Error:', error);
    return res.status(500).json({ 
      error: 'Failed to check payment status',
      details: error.message 
    });
  }
}
