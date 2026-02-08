/**
 * API endpoint for funding a Boltcard from the Sending Wallet
 * 
 * POST /api/boltcard/fund
 * 
 * This endpoint increments the card's virtual balance. The actual sats/cents
 * stay in the user's Sending Wallet - the card balance is just a spending limit.
 * 
 * Body:
 * - cardId: string - The card ID to fund
 * - amount: number - Amount to add (sats for BTC cards, cents for USD cards)
 * - walletBalance: number - Current wallet balance for validation (optional)
 */

const boltcard = require('../../../lib/boltcard');

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { cardId, amount, description } = req.body;

    // Validate required fields
    if (!cardId) {
      return res.status(400).json({ error: 'Missing cardId' });
    }

    if (amount === undefined || amount === null) {
      return res.status(400).json({ error: 'Missing amount' });
    }

    const fundAmount = parseInt(amount);

    if (isNaN(fundAmount) || fundAmount <= 0) {
      return res.status(400).json({ error: 'Amount must be a positive number' });
    }

    // Get the card
    const card = await boltcard.store.getCard(cardId);
    
    if (!card) {
      return res.status(404).json({ error: 'Card not found' });
    }

    // Check card status
    if (card.status === 'wiped') {
      return res.status(400).json({ error: 'Cannot fund a wiped card' });
    }

    // Calculate new balance
    const currentBalance = card.balance || 0;
    const newBalance = currentBalance + fundAmount;

    // Update the card balance
    const success = await boltcard.store.updateCardBalance(cardId, newBalance);

    if (!success) {
      return res.status(500).json({ error: 'Failed to update card balance' });
    }

    // Record the transaction
    await boltcard.store.recordTransaction(cardId, {
      type: boltcard.TxType.TOPUP, // Use TOPUP type for funding
      amount: fundAmount,
      balanceAfter: newBalance,
      description: description || 'Funded from Sending Wallet',
    });

    console.log('✅ Card funded:', {
      cardId,
      cardName: card.name,
      amount: fundAmount,
      currency: card.walletCurrency,
      previousBalance: currentBalance,
      newBalance,
    });

    // Get updated card data
    const updatedCard = await boltcard.store.getCard(cardId);

    res.status(200).json({
      success: true,
      message: `Card funded with ${fundAmount} ${card.walletCurrency === 'USD' ? 'cents' : 'sats'}`,
      card: {
        id: updatedCard.id,
        name: updatedCard.name,
        balance: updatedCard.balance,
        walletCurrency: updatedCard.walletCurrency,
        status: updatedCard.status,
      },
      transaction: {
        type: 'topup',
        amount: fundAmount,
        balanceAfter: newBalance,
      },
    });

  } catch (error) {
    console.error('❌ Fund card error:', error);
    res.status(500).json({
      error: 'Failed to fund card',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
}
