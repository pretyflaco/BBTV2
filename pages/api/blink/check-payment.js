/**
 * API endpoint to check if a payment has been received for a given payment hash
 * 
 * Used when the app regains focus after being in the background to check
 * if a pending invoice was paid while the user was away.
 */

import BlinkAPI from '../../../lib/blink-api';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { paymentHash } = req.body;

    if (!paymentHash) {
      return res.status(400).json({ error: 'Payment hash is required' });
    }

    // Get BlinkPOS credentials
    const blinkposApiKey = process.env.BLINKPOS_API_KEY;
    const blinkposBtcWalletId = process.env.BLINKPOS_BTC_WALLET_ID;

    if (!blinkposApiKey || !blinkposBtcWalletId) {
      return res.status(500).json({ error: 'BlinkPOS configuration missing' });
    }

    const blinkposAPI = new BlinkAPI(blinkposApiKey);

    // Query transactions to find if this payment hash was received
    const query = `
      query GetTransactionByHash($walletId: WalletId!, $first: Int) {
        me {
          defaultAccount {
            walletById(walletId: $walletId) {
              transactionsByPaymentHash(paymentHash: "${paymentHash}") {
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
    `;

    try {
      const result = await blinkposAPI.query(query, { 
        walletId: blinkposBtcWalletId,
        first: 1 
      });

      const transactions = result?.me?.defaultAccount?.walletById?.transactionsByPaymentHash || [];
      
      // Check if we have a matching incoming transaction
      const receivedTx = transactions.find(tx => 
        tx.direction === 'RECEIVE' && 
        tx.status === 'SUCCESS'
      );

      if (receivedTx) {
        console.log(`✅ [CheckPayment] Payment found for hash ${paymentHash.substring(0, 16)}...`);
        return res.status(200).json({
          paid: true,
          transaction: {
            id: receivedTx.id,
            amount: receivedTx.settlementAmount,
            createdAt: receivedTx.createdAt,
            status: receivedTx.status
          }
        });
      }

      // If transactionsByPaymentHash doesn't work (API limitation), 
      // check recent transactions as fallback
      console.log(`ℹ️ [CheckPayment] No transaction found by paymentHash query, checking recent transactions...`);
      
      const recentQuery = `
        query GetRecentTransactions($walletId: WalletId!) {
          me {
            defaultAccount {
              walletById(walletId: $walletId) {
                transactions(first: 20) {
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
                      }
                    }
                  }
                }
              }
            }
          }
        }
      `;

      const recentResult = await blinkposAPI.query(recentQuery, { walletId: blinkposBtcWalletId });
      const recentTransactions = recentResult?.me?.defaultAccount?.walletById?.transactions?.edges || [];

      const matchingTx = recentTransactions.find(edge => {
        const tx = edge.node;
        return tx.direction === 'RECEIVE' && 
               tx.status === 'SUCCESS' &&
               tx.initiationVia?.paymentHash === paymentHash;
      });

      if (matchingTx) {
        console.log(`✅ [CheckPayment] Payment found in recent transactions for hash ${paymentHash.substring(0, 16)}...`);
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
      
      // If the specific paymentHash query fails, try the fallback
      // This can happen if transactionsByPaymentHash is not supported
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
