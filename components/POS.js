import { useState, useEffect } from 'react';
import QRCode from 'react-qr-code';
import { formatDisplayAmount as formatCurrency, getCurrencyById } from '../lib/currency-utils';
import { useNFC } from './NFCPayment';

const POS = ({ apiKey, user, displayCurrency, currencies, wallets, onPaymentReceived, connected, manualReconnect, reconnectAttempts, blinkposConnected, blinkposConnect, blinkposDisconnect, blinkposReconnect, blinkposReconnectAttempts, tipsEnabled, tipPresets, tipRecipients = [], soundEnabled, onInvoiceStateChange, onInvoiceChange, darkMode, toggleDarkMode, nfcState, activeNWC, nwcClientReady, nwcMakeInvoice, nwcLookupInvoice, activeBlinkAccount, activeNpubCashWallet, cartCheckoutData, onCartCheckoutProcessed, onInternalTransition, triggerPaymentAnimation }) => {
  const [amount, setAmount] = useState('');
  const [total, setTotal] = useState(0);
  const [items, setItems] = useState([]);
  const [invoice, setInvoice] = useState(null);
  const [loading, setLoading] = useState(false);
  const [creatingInvoice, setCreatingInvoice] = useState(false);
  const [error, setError] = useState('');
  const [selectedWallet, setSelectedWallet] = useState(null);
  const [exchangeRate, setExchangeRate] = useState(null);
  const [loadingRate, setLoadingRate] = useState(false);
  
  // Tip functionality state (local)
  const [selectedTipPercent, setSelectedTipPercent] = useState(0);
  const [showTipDialog, setShowTipDialog] = useState(false);
  const [pendingTipSelection, setPendingTipSelection] = useState(null);
  const [showCustomTipInput, setShowCustomTipInput] = useState(false);
  const [customTipValue, setCustomTipValue] = useState('');
  
  // Cart memo (when coming from item cart)
  const [cartMemo, setCartMemo] = useState('');

  // Helper function to get dynamic font size based on amount length
  const getDynamicFontSize = (displayText) => {
    // Extract only numeric characters (remove currency symbols, spaces, "sats", commas, etc.)
    const numericOnly = String(displayText).replace(/[^0-9.]/g, '');
    const length = numericOnly.length;
    
    // More aggressive scaling to prevent word breaks on mobile
    if (length <= 6) return 'text-6xl';      // Standard size (up to 6 digits) - 999,999
    if (length <= 9) return 'text-5xl';      // (7-9 digits) - millions
    if (length <= 11) return 'text-4xl';     // (10-11 digits) - billions
    if (length <= 13) return 'text-3xl';     // (12-13 digits) - trillions
    if (length <= 15) return 'text-2xl';     // (14-15 digits) - quadrillions
    if (length <= 16) return 'text-xl';      // (16 digits) - max bitcoin supply
    return 'text-lg';                         // Minimum size (17+ digits - shouldn't happen)
  };

  // Handle tip selection and create invoice after state update
  useEffect(() => {
    if (pendingTipSelection !== null) {
      const newTipPercent = pendingTipSelection;
      
      // Trigger transition animation when confirming tip selection
      if (onInternalTransition) onInternalTransition();
      
      setSelectedTipPercent(newTipPercent);
      setShowTipDialog(false);
      setPendingTipSelection(null);
      
      // Create invoice with the specific tip percentage
      createInvoiceWithTip(newTipPercent);
    }
  }, [pendingTipSelection]);

  // Set default wallet when wallets are loaded or account is switched
  useEffect(() => {
    console.log('Wallets changed:', wallets);
    if (wallets && wallets.length > 0) {
      // Always use BTC wallet for POS
      const btcWallet = wallets.find(w => w.walletCurrency === 'BTC');
      
      if (!btcWallet) {
        console.error('No BTC wallet found in:', wallets);
        setError('No BTC wallet available for invoice generation');
        return;
      }

      // Update wallet if:
      // 1. No wallet is selected yet (initial load)
      // 2. Current wallet is from a different account (account switched)
      //    Detected by checking if current wallet ID exists in new wallets list
      const currentWalletStillValid = selectedWallet && 
        wallets.some(w => w.id === selectedWallet.id);
      
      if (!selectedWallet || !currentWalletStillValid) {
        console.log('Updating selected wallet:', { 
          reason: !selectedWallet ? 'initial load' : 'account switched',
          oldWallet: selectedWallet?.id,
          newWallet: btcWallet.id 
        });
        setSelectedWallet(btcWallet);
      }
    }
  }, [wallets]);

  // Check if we have a Blink Lightning Address wallet (no API key required)
  const hasBlinkLnAddressWallet = activeBlinkAccount?.type === 'ln-address';
  
  // Check if we have an npub.cash wallet (no API key required - uses LNURL-pay)
  const hasNpubCashWallet = activeNpubCashWallet?.type === 'npub-cash' && !!activeNpubCashWallet?.lightningAddress;

  // Fetch exchange rate when currency changes
  // For NWC-only or LN Address users (no apiKey), use BlinkPOS credentials via useBlinkpos flag
  useEffect(() => {
    if (displayCurrency !== 'BTC' && (apiKey || activeNWC || hasBlinkLnAddressWallet || hasNpubCashWallet)) {
      fetchExchangeRate();
    } else if (displayCurrency === 'BTC') {
      setExchangeRate({ satPriceInCurrency: 1, currency: 'BTC' });
    }
  }, [displayCurrency, apiKey, activeNWC, hasBlinkLnAddressWallet, hasNpubCashWallet]);

  // Clear invoice when payment is received
  useEffect(() => {
    if (onPaymentReceived) {
      const clearInvoiceOnPayment = () => {
        console.log('Payment received - clearing invoice and returning to numpad');
        setInvoice(null);
        if (onInvoiceChange) {
          onInvoiceChange(null);
        }
        setAmount('');
        setTotal(0);
        setItems([]);
        setCartMemo(''); // Clear cart memo
        setError('');
        setSelectedTipPercent(0);
        setShowTipDialog(false);
        setPendingTipSelection(null);
      };
      
      // Set up the callback
      onPaymentReceived.current = clearInvoiceOnPayment;
    }
  }, [onPaymentReceived, onInvoiceChange]);

  // Handle cart checkout data - prefill total when coming from cart
  useEffect(() => {
    if (cartCheckoutData && cartCheckoutData.total > 0) {
      console.log('Cart checkout data received:', cartCheckoutData);
      // Set the total from cart
      setTotal(cartCheckoutData.total);
      setAmount('');
      // Store the cart memo for invoice creation
      setCartMemo(cartCheckoutData.memo || '');
      // We use items array to store numeric values for the calculation display
      setItems([cartCheckoutData.total]);
      setError('');
      
      // Mark as processed
      if (onCartCheckoutProcessed) {
        onCartCheckoutProcessed();
      }
    }
  }, [cartCheckoutData, onCartCheckoutProcessed]);

  // Check if invoice was paid when app regains focus (handles webhook forwarding case)
  useEffect(() => {
    if (!invoice?.paymentHash) return;

    const checkPaymentOnFocus = async () => {
      try {
        console.log('🔍 Checking if invoice was paid while app was in background...');
        const response = await fetch('/api/blink/check-payment', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ paymentHash: invoice.paymentHash })
        });

        if (response.ok) {
          const result = await response.json();
          if (result.paid) {
            console.log('✅ Invoice was paid while app was in background!');
            const paymentAmount = result.transaction?.amount || invoice.satoshis || invoice.amount;
            
            // For NWC wallets, we need to forward the payment from client
            // (webhook cannot forward NWC payments - it releases the claim for client to handle)
            console.log('🔍 NWC check:', { 
              hasActiveNWC: !!activeNWC, 
              nwcClientReady, 
              hasNwcMakeInvoice: !!nwcMakeInvoice 
            });
            
            if (activeNWC && nwcMakeInvoice) {
              // Note: nwcClientReady might be false after app was in background
              // We'll try to forward anyway - nwcMakeInvoice should handle reconnection internally
              if (!nwcClientReady) {
                console.log('⚠️ NWC client not ready - attempting forwarding anyway...');
              }
              console.log('💳 NWC wallet detected - forwarding payment from client...');
              try {
                // Step 1: Get tip data and base amount (defer tips for correct chronology)
                const tipResponse = await fetch('/api/blink/forward-nwc-with-tips', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    paymentHash: invoice.paymentHash,
                    totalAmount: paymentAmount,
                    memo: invoice.memo,
                    deferTips: true  // Get tip data but don't send yet
                  })
                });
                
                if (tipResponse.status === 409) {
                  console.log('ℹ️ Payment already being processed (409)');
                } else if (tipResponse.ok) {
                  const tipResult = await tipResponse.json();
                  
                  if (tipResult.alreadyProcessed) {
                    console.log('ℹ️ Payment was already processed');
                  } else {
                    const baseAmount = tipResult.baseAmount || paymentAmount;
                    const enhancedMemo = tipResult.enhancedMemo || invoice.memo;
                    
                    console.log('📄 NWC forwarding data:', { baseAmount, hasTips: !!tipResult.tipData });
                    
                    // Step 2: Create NWC invoice for base amount
                    console.log('📝 Creating NWC invoice for base amount:', baseAmount);
                    let nwcInvoiceResult;
                    try {
                      nwcInvoiceResult = await nwcMakeInvoice({
                        amount: baseAmount * 1000, // NWC uses millisats
                        description: enhancedMemo,
                        expiry: 3600
                      });
                      console.log('📋 NWC makeInvoice result:', nwcInvoiceResult);
                    } catch (nwcError) {
                      console.error('❌ NWC makeInvoice threw error:', nwcError);
                      nwcInvoiceResult = { success: false, error: nwcError.message };
                    }
                    
                    if (nwcInvoiceResult?.success && nwcInvoiceResult?.invoice) {
                      console.log('✅ NWC invoice created, paying from BlinkPOS...');
                      
                      // Step 3: Pay NWC invoice from BlinkPOS
                      const payResponse = await fetch('/api/blink/pay-invoice', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          paymentRequest: nwcInvoiceResult.invoice,
                          memo: enhancedMemo
                        })
                      });
                      
                      if (payResponse.ok) {
                        console.log('✅ NWC base amount forwarded successfully!');
                        
                        // Step 4: Send tips if there are deferred tips
                        if (tipResult.tipsDeferred && tipResult.tipData) {
                          console.log('💰 Sending deferred tips...');
                          await fetch('/api/blink/send-nwc-tips', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                              paymentHash: invoice.paymentHash,
                              tipData: tipResult.tipData
                            })
                          });
                          console.log('✅ Tips sent!');
                        }
                      } else {
                        console.error('❌ Failed to pay NWC invoice:', await payResponse.text());
                      }
                    } else {
                      console.error('❌ Failed to create NWC invoice:', nwcInvoiceResult);
                    }
                  }
                } else {
                  console.error('❌ Failed to get NWC forwarding data:', await tipResponse.text());
                }
              } catch (forwardError) {
                console.error('❌ Error forwarding NWC payment:', forwardError);
              }
            }
            
            // Trigger the payment animation with sound (same as real-time payment)
            if (triggerPaymentAnimation) {
              triggerPaymentAnimation({
                amount: paymentAmount,
                currency: 'BTC',
                memo: invoice.memo || `BlinkPOS: ${paymentAmount} sats`,
                isForwarded: true
              });
            }
            
            // Clear the invoice after animation is triggered
            if (onPaymentReceived?.current) {
              onPaymentReceived.current();
            }
          }
        }
      } catch (error) {
        console.error('Failed to check payment status:', error);
      }
    };

    const handleVisibilityChange = () => {
      if (!document.hidden && invoice?.paymentHash) {
        // Small delay to let the app settle after focus
        setTimeout(checkPaymentOnFocus, 500);
      }
    };

    const handleFocus = () => {
      if (invoice?.paymentHash) {
        setTimeout(checkPaymentOnFocus, 500);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleFocus);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleFocus);
    };
  }, [invoice?.paymentHash, invoice?.satoshis, invoice?.amount, invoice?.memo, onPaymentReceived, triggerPaymentAnimation]);

  // Notify parent when invoice or tip dialog state changes
  useEffect(() => {
    if (onInvoiceStateChange) {
      // Consider both invoice and tip dialog as "showing invoice" state
      onInvoiceStateChange(!!invoice || showTipDialog);
    }
  }, [invoice, showTipDialog, onInvoiceStateChange]);


  const fetchExchangeRate = async () => {
    if (displayCurrency === 'BTC') return;
    
    setLoadingRate(true);
    try {
      const response = await fetch('/api/blink/exchange-rate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          apiKey: apiKey,
          currency: displayCurrency,
          // For NWC-only, LN Address, or npub.cash users, use BlinkPOS credentials to fetch exchange rate
          useBlinkpos: !apiKey && (!!activeNWC || hasBlinkLnAddressWallet || hasNpubCashWallet)
        }),
      });
      
      const data = await response.json();
      
      if (data.success) {
        setExchangeRate({
          satPriceInCurrency: data.satPriceInCurrency,
          currency: data.currency
        });
        console.log(`Exchange rate for ${displayCurrency}:`, data.satPriceInCurrency);
      } else {
        throw new Error(data.error || 'Failed to fetch exchange rate');
      }
    } catch (error) {
      console.error('Exchange rate error:', error);
      setError(`Failed to fetch ${displayCurrency} exchange rate: ${error.message}`);
    } finally {
      setLoadingRate(false);
    }
  };

  const formatDisplayAmount = (value, currency) => {
    // Use dynamic currency formatting from currency-utils
    return formatCurrency(value, currency, currencies);
  };

  // Get current currency metadata
  const getCurrentCurrency = () => {
    return getCurrencyById(displayCurrency, currencies);
  };

  // Validate if amount meets minimum requirements for the currency
  const isValidAmount = (amountValue) => {
    if (!amountValue || amountValue === '' || amountValue === '0') {
      return false;
    }

    const numValue = parseFloat(amountValue);
    if (isNaN(numValue) || numValue <= 0) {
      return false;
    }

    // For BTC, check minimum 1 sat
    if (displayCurrency === 'BTC') {
      return numValue >= 1;
    }

    // For fiat currencies, check minimum based on fraction digits
    const currency = getCurrentCurrency();
    if (!currency) {
      return numValue > 0; // Fallback
    }

    // Minimum is 1 in the smallest unit (e.g., 0.01 for 2 decimals, 1 for 0 decimals)
    const minimumAmount = currency.fractionDigits > 0 
      ? 1 / Math.pow(10, currency.fractionDigits)
      : 1;
    
    if (numValue < minimumAmount) {
      return false;
    }

    // Also check if it converts to at least 1 satoshi
    if (exchangeRate && exchangeRate.satPriceInCurrency) {
      const sats = convertToSatoshis(numValue, displayCurrency);
      if (sats < 1) {
        return false;
      }
    }

    return true;
  };

  // Check if current amount or total is valid for creating invoice
  const hasValidAmount = () => {
    if (total > 0) {
      return true; // If there's a total from items, it's valid
    }
    return isValidAmount(amount);
  };

  // Convert display currency amount to satoshis for invoice creation
  const convertToSatoshis = (amount, currency) => {
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
  };

  // Calculate tip amount based on percentage
  const calculateTipAmount = (baseAmount, tipPercent) => {
    return (tipPercent / 100) * baseAmount;
  };

  // Get total amount including selected tip
  const getTotalWithTip = () => {
    let finalTotal = total;
    if (amount) {
      const numericAmount = parseFloat(amount);
      if (!isNaN(numericAmount) && numericAmount > 0) {
        finalTotal += numericAmount;
      }
    }
    
    if (selectedTipPercent > 0) {
      const tipAmount = calculateTipAmount(finalTotal, selectedTipPercent);
      return finalTotal + tipAmount;
    }
    
    return finalTotal;
  };

  // Get tip amount in current display currency
  const getTipAmount = () => {
    let finalTotal = total;
    if (amount) {
      const numericAmount = parseFloat(amount);
      if (!isNaN(numericAmount) && numericAmount > 0) {
        finalTotal += numericAmount;
      }
    }
    
    if (selectedTipPercent > 0) {
      return calculateTipAmount(finalTotal, selectedTipPercent);
    }
    
    return 0;
  };

  // Play keystroke sound
  const playKeystrokeSound = () => {
    if (soundEnabled) {
      const audio = new Audio('/click.mp3');
      audio.volume = 0.3; // Set volume to 30% to avoid being too loud
      audio.play().catch(console.error);
    }
  };

  const handleDigitPress = (digit) => {
    // Play sound effect for keystroke
    playKeystrokeSound();
    
    // Maximum bitcoin supply in sats: 21,000,000 BTC * 100,000,000 sats/BTC = 2,100,000,000,000,000 sats
    const MAX_SATS = 2100000000000000;
    
    // Check if adding this digit would exceed the maximum bitcoin supply
    if (digit !== '.') {
      const newAmount = amount + digit;
      const numericValue = parseFloat(newAmount.replace(/[^0-9.]/g, ''));
      
      // For BTC currency, the amount is in sats already
      if (displayCurrency === 'BTC' && numericValue > MAX_SATS) {
        return; // Don't allow exceeding max bitcoin supply
      }
      
      // For fiat currencies, we can't validate until we have exchange rate,
      // but we cap at 16 digits as a reasonable limit
      const currentNumericDigits = amount.replace(/[^0-9]/g, '').length;
      if (currentNumericDigits >= 16) {
        return; // Already at max 16 digits
      }
    }
    
    // Special handling for '0' as first digit: treat as "0." for fiat currencies
    if (amount === '' && digit === '0') {
      if (displayCurrency === 'BTC') {
        setAmount('0');
      } else {
        setAmount('0.');
      }
      return;
    }
    
    // Special handling for '.' as first digit: treat same as '0' (i.e., "0." for fiat)
    if (amount === '' && digit === '.') {
      // Don't allow decimal points for zero-decimal currencies (BTC, JPY, XOF, etc.)
      const currency = getCurrentCurrency();
      if (displayCurrency === 'BTC' || currency?.fractionDigits === 0) {
        return;
      } else {
        setAmount('0.');
      }
      return;
    }
    
    if (amount === '0' && digit !== '.') {
      setAmount(digit);
    } else if (digit === '.' && amount.includes('.')) {
      // Don't add multiple decimal points
      return;
    } else if (digit === '.') {
      // Don't allow decimal points for zero-decimal currencies (BTC, JPY, XOF, HUF, etc.)
      const currency = getCurrentCurrency();
      if (displayCurrency === 'BTC' || currency?.fractionDigits === 0) {
        return;
      }
      setAmount(amount + digit);
    } else if (amount.includes('.')) {
      // Check decimal places based on currency fractionDigits
      const currency = getCurrentCurrency();
      const maxDecimals = currency ? currency.fractionDigits : 2;
      const currentDecimals = amount.split('.')[1].length;
      
      if (currentDecimals >= maxDecimals) {
        // Don't allow more decimals than the currency supports
        return;
      }
      setAmount(amount + digit);
    } else {
      setAmount(amount + digit);
    }
  };

  const handleBackspace = () => {
    playKeystrokeSound();
    setAmount(amount.slice(0, -1));
  };

  const handleClear = () => {
    playKeystrokeSound();
    
    // Trigger transition animation when canceling from invoice view
    if (invoice && onInternalTransition) {
      onInternalTransition();
    }
    
    setAmount('');
    setTotal(0);
    setItems([]);
    setInvoice(null);
    setCartMemo(''); // Clear cart memo
    if (onInvoiceChange) {
      onInvoiceChange(null);
    }
    setError('');
    // Reset all tip-related state
    setSelectedTipPercent(0);
    setShowTipDialog(false);
    setPendingTipSelection(null);
    
    // Disconnect WebSocket when clearing invoice (user cancelled/abandoned)
    if (blinkposConnected && blinkposDisconnect) {
      console.log('💤 Disconnecting BlinkPOS WebSocket (invoice cleared)');
      blinkposDisconnect();
    }
  };

  const handlePlusPress = () => {
    playKeystrokeSound();
    
    // Silently ignore if no amount entered or amount is invalid
    if (!amount) {
      return;
    }
    
    const numericAmount = parseFloat(amount);
    if (isNaN(numericAmount) || numericAmount <= 0) {
      return;
    }
    
    // Add current amount to items and total
    setItems(prev => [...prev, numericAmount]);
    setTotal(prev => prev + numericAmount);
    setAmount(''); // Clear input for next item
    setError('');
  };


  // Create invoice with specific tip percentage (bypasses state timing issues)
  const createInvoiceWithTip = async (tipPercent) => {
    return createInvoice(true, tipPercent);
  };

  const createInvoice = async (skipTipDialog = false, forceTipPercent = null) => {
    // Ensure skipTipDialog is a boolean (handle event objects)
    const shouldSkipTipDialog = typeof skipTipDialog === 'boolean' ? skipTipDialog : false;
    
    // Use forced tip percent if provided, otherwise use state
    const effectiveTipPercent = forceTipPercent !== null ? forceTipPercent : selectedTipPercent;
    
    
    // Calculate final total (current amount + existing total)
    let finalTotal = total;
    
    if (amount) {
      const numericAmount = parseFloat(amount);
      if (isNaN(numericAmount) || numericAmount <= 0) {
        setError('Please enter a valid amount');
        return;
      }
      
      // Validate minimum amount for currency
      if (!isValidAmount(amount)) {
        const currency = getCurrentCurrency();
        const minAmount = currency && currency.fractionDigits > 0 
          ? (1 / Math.pow(10, currency.fractionDigits)).toFixed(currency.fractionDigits)
          : '1';
        setError(`Minimum amount is ${formatDisplayAmount(minAmount, displayCurrency)}`);
        return;
      }
      
      finalTotal += numericAmount;
    }
    
    if (finalTotal <= 0) {
      setError('Please add some items or enter an amount');
      return;
    }

    // Show tip overlay if tips are enabled and we haven't skipped it
    if (tipsEnabled && tipRecipients && tipRecipients.length > 0 && !shouldSkipTipDialog && effectiveTipPercent === 0) {
      if (onInternalTransition) onInternalTransition();
      setShowTipDialog(true);
      return;
    }

    // Invoices are always created via Blink's blinkpos account
    // Payments are forwarded to either:
    // - User's Blink wallet via API key (if they have one), OR
    // - User's Blink wallet via Lightning Address (if they have one), OR
    // - User's NWC wallet (if active)
    const hasBlinkApiKeyWallet = selectedWallet && apiKey;
    const hasNwcWallet = activeNWC && nwcClientReady;
    
    if (!hasBlinkApiKeyWallet && !hasNwcWallet && !hasBlinkLnAddressWallet && !hasNpubCashWallet) {
      setError('No wallet available. Please connect a Blink, NWC, or npub.cash wallet.');
      return;
    }

    // Connect BlinkPOS WebSocket if not already connected (lazy-loading)
    if (!blinkposConnected && blinkposConnect) {
      console.log('🔗 Connecting BlinkPOS WebSocket before invoice creation...');
      blinkposConnect();
      
      // Give it a moment to connect before proceeding
      // Note: The invoice will be created even if connection is still in progress
      // The WebSocket will pick up the payment when it connects
    }

    setLoading(true);
    setCreatingInvoice(true);
    setError('');

    try {
      // Calculate total including tip using effective tip percent
      const tipAmount = effectiveTipPercent > 0 ? calculateTipAmount(finalTotal, effectiveTipPercent) : 0;
      const totalWithTip = finalTotal + tipAmount;
      
      // Convert the final total to satoshis if using fiat currency
      let finalTotalInSats = totalWithTip;
      let memo = '';
      
      if (displayCurrency !== 'BTC') {
        // Check if we have exchange rates
        if (!exchangeRate) {
          setError(`Exchange rate not available for ${displayCurrency}. Please try again.`);
          setLoading(false);
          return;
        }
        
        finalTotalInSats = convertToSatoshis(totalWithTip, displayCurrency);
        
        // Validate minimum 1 satoshi
        if (finalTotalInSats < 1) {
          setError(`Amount too small. Converts to less than 1 satoshi. Minimum is ${formatDisplayAmount(0.01, displayCurrency)}`);
          setLoading(false);
          return;
        }
        
        // Build memo - use cart memo if available, otherwise show calculation
        if (cartMemo) {
          // Cart checkout - show item names with amounts
          if (effectiveTipPercent > 0) {
            memo = `${cartMemo} + ${effectiveTipPercent}% tip = ${formatDisplayAmount(totalWithTip, displayCurrency)} (${finalTotalInSats} sats)`;
          } else {
            memo = `${cartMemo} = ${formatDisplayAmount(finalTotal, displayCurrency)} (${finalTotalInSats} sats)`;
          }
        } else {
          // Manual numpad entry - show calculation
          const allItems = amount ? [...items, parseFloat(amount)] : items;
          if (effectiveTipPercent > 0) {
            if (allItems.length > 1) {
              memo = `${allItems.join(' + ')} + ${effectiveTipPercent}% tip = ${formatDisplayAmount(totalWithTip, displayCurrency)} (${finalTotalInSats} sats)`;
            } else {
              memo = `${formatDisplayAmount(finalTotal, displayCurrency)} + ${effectiveTipPercent}% tip = ${formatDisplayAmount(totalWithTip, displayCurrency)} (${finalTotalInSats} sats)`;
            }
          } else {
            if (allItems.length > 1) {
              memo = `${allItems.join(' + ')} = ${formatDisplayAmount(finalTotal, displayCurrency)} (${finalTotalInSats} sats)`;
            } else {
              memo = `${formatDisplayAmount(finalTotal, displayCurrency)} (${finalTotalInSats} sats)`;
            }
          }
        }
      } else {
        // BTC - show calculation in sats
        if (cartMemo) {
          // Cart checkout - show item names with amounts
          if (effectiveTipPercent > 0) {
            memo = `${cartMemo} + ${effectiveTipPercent}% tip = ${totalWithTip} sats`;
          } else {
            memo = `${cartMemo} = ${finalTotal} sats`;
          }
        } else {
          // Manual numpad entry
          const allItems = amount ? [...items, parseFloat(amount)] : items;
          if (effectiveTipPercent > 0) {
            memo = allItems.length > 1 ? `${allItems.join(' + ')} + ${effectiveTipPercent}% tip = ${totalWithTip} sats` : `${finalTotal} + ${effectiveTipPercent}% tip = ${totalWithTip} sats`;
          } else {
            // Even with no tip, include amount in memo to avoid Blink's default "From $username"
            memo = allItems.length > 1 ? `${allItems.join(' + ')} = ${finalTotal} sats` : `${finalTotal} sats`;
          }
        }
        finalTotalInSats = Math.round(totalWithTip);
      }

      // Create invoice via Blink API (always through blinkpos account)
      // For NWC-only or LN Address users, Blink wallet fields are optional
      // Calculate base and tip amounts in sats
      // CRITICAL: Calculate tip as (total - base) to avoid rounding errors
      // When base and tip are rounded independently, their sum may differ from total
      const baseInSats = convertToSatoshis(finalTotal, displayCurrency !== 'BTC' ? displayCurrency : 'BTC');
      // Tip is the difference between total invoice and base (ensures base + tip = total)
      const tipInSats = effectiveTipPercent > 0 ? Math.max(0, finalTotalInSats - baseInSats) : 0;
      
      const requestBody = {
        amount: finalTotalInSats,
        currency: 'BTC', // Always create BTC invoices
        memo: memo, // Show calculation in memo
        displayCurrency: displayCurrency, // Pass the actual display currency for tip memo
        // Tip information for payment splitting
        baseAmount: baseInSats,
        tipAmount: tipInSats,
        tipPercent: effectiveTipPercent,
        tipRecipients: tipRecipients || [],
        // Display currency amounts for memo calculation
        baseAmountDisplay: finalTotal,
        tipAmountDisplay: tipAmount,
        // Include Blink wallet info only if available (for Blink API key forwarding)
        // NWC-only or LN Address users won't have these
        ...(selectedWallet && {
          walletId: selectedWallet.id,
          userWalletId: selectedWallet.id
        }),
        ...(apiKey && { apiKey }),
        // Flag to indicate if NWC is active (for forwarding logic)
        nwcActive: !!activeNWC && nwcClientReady,
        // Flag and data for Blink Lightning Address wallet (no API key required)
        ...(hasBlinkLnAddressWallet && {
          blinkLnAddress: true,
          blinkLnAddressWalletId: activeBlinkAccount.walletId,
          blinkLnAddressUsername: activeBlinkAccount.username
        }),
        // Flag and data for npub.cash wallet (uses LNURL-pay)
        ...(hasNpubCashWallet && {
          npubCashActive: true,
          npubCashLightningAddress: activeNpubCashWallet.lightningAddress
        })
      };

        console.log('Creating invoice with request body:', requestBody);

        const response = await fetch('/api/blink/create-invoice', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(requestBody),
        });

        const data = await response.json();

        console.log('Invoice response:', data);

        if (!response.ok) {
          throw new Error(data.error || `Server error: ${response.status}`);
        }

        if (data.success && data.invoice) {
          // Enhance invoice with display currency information
          const enhancedInvoice = {
            ...data.invoice,
            displayAmount: totalWithTip, // Use totalWithTip to include tip amount
            displayCurrency: displayCurrency,
            satAmount: finalTotalInSats
          };
          setInvoice(enhancedInvoice);
          // Notify parent of invoice creation for NFC scanning and payment hash tracking
          if (onInvoiceChange) {
            console.log('📋 Invoice created with payment hash:', data.invoice.paymentHash?.substring(0, 16) + '...');
            onInvoiceChange({
              paymentRequest: data.invoice.paymentRequest,
              paymentHash: data.invoice.paymentHash
            });
          }
        } else {
          throw new Error('Invalid response from server');
        }

    } catch (err) {
      console.error('Invoice creation error:', err);
      setError(err.message || 'Failed to create invoice');
      setCreatingInvoice(false);
    } finally {
      setLoading(false);
      // Keep creatingInvoice true for a moment to show the animation
      setTimeout(() => setCreatingInvoice(false), 500);
    }
  };

  const copyToClipboard = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      // You could add a toast notification here
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  // Show loading animation while creating invoice
  if (creatingInvoice) {
    // Calculate display values for loading state
    const finalTotal = total + (parseFloat(amount) || 0);
    const tipAmount = selectedTipPercent > 0 ? calculateTipAmount(finalTotal, selectedTipPercent) : 0;
    const totalWithTip = finalTotal + tipAmount;

    return (
      <div className="h-full flex flex-col bg-white dark:bg-black" style={{fontFamily: "'Source Sans Pro', sans-serif"}}>
        {/* Error Message Space - Same as numpad view */}
        <div className="mx-3 mt-1 min-h-[44px]"></div>

        {/* Amount Display - Same as numpad */}
        <div className="px-4 pt-2 pb-2">
          <div className="text-center mb-4">
            <div className="text-center">
              <div className="text-6xl font-semibold text-gray-800 dark:text-gray-100 mb-1 min-h-[96px] flex items-center justify-center leading-none tracking-normal">
                {total > 0 ? (
                  <div>
                    <span className="text-blink-accent">{formatDisplayAmount(total, displayCurrency)}</span>
                    {amount && <span className="text-4xl text-gray-600 dark:text-gray-400"> + {amount}</span>}
                  </div>
                ) : (
                  (amount === '0' || amount === '0.') ? (displayCurrency === 'BTC' || getCurrencyById(displayCurrency, currencies)?.fractionDigits === 0 ? '0' : getCurrencyById(displayCurrency, currencies)?.symbol + '0.') : (amount ? formatDisplayAmount(amount, displayCurrency) : formatDisplayAmount(0, displayCurrency))
                )}
              </div>
              {selectedTipPercent > 0 && (
                <div className="text-2xl text-green-600 dark:text-green-400 font-semibold">
                  + {selectedTipPercent}% tip ({formatDisplayAmount(tipAmount, displayCurrency)})
                  <div className="text-3xl text-green-700 dark:text-green-400 mt-1">
                    Total: {formatDisplayAmount(totalWithTip, displayCurrency)}
                  </div>
                </div>
              )}
            </div>
            <div className="text-sm text-gray-600 dark:text-gray-400">
              <div className="mb-1 min-h-[20px]">
                {items.length > 0 && (
                  <div>
                    Items: {items.join(' + ')}
                    {amount && ` + ${amount}`}
                    {total > 0 && amount && ` = ${formatDisplayAmount(total + (parseFloat(amount) || 0), displayCurrency)}`}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Loading Animation - Contained in center */}
        <div className="flex-1 flex items-center justify-center">
          <div className="flex flex-col items-center bg-gray-50 dark:bg-blink-dark rounded-lg p-8 shadow-lg">
            <div className="animate-spin rounded-full h-16 w-16 border-4 border-blink-accent border-t-transparent mb-4"></div>
            <div className="text-xl font-semibold text-gray-800 dark:text-gray-100">
              Creating Invoice...
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (invoice) {
    return (
      <div className="h-full flex flex-col bg-white dark:bg-black" style={{fontFamily: "'Source Sans Pro', sans-serif"}}>
        {/* Header - Match main header structure exactly */}
        <div className="bg-white dark:bg-blink-dark border-b border-gray-200 dark:border-gray-700 shadow-sm dark:shadow-black">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between py-4">
              {/* Blink Logo - Left (tap to toggle dark mode) */}
              <button 
                onClick={toggleDarkMode}
                className="flex items-center focus:outline-none"
                aria-label="Toggle dark mode"
              >
                <img 
                  src="/logos/blink-icon-light.svg" 
                  alt="Blink" 
                  className="h-12 w-12 dark:hidden"
                />
                <img 
                  src="/logos/blink-icon-dark.svg" 
                  alt="Blink" 
                  className="h-12 w-12 hidden dark:block"
                />
              </button>
              
              {/* NFC Icon - Center (only if supported) */}
              {nfcState && nfcState.isNfcSupported && (
                <div className="absolute left-1/2 transform -translate-x-1/2">
                  <button
                    onClick={nfcState.activateNfcScan}
                    disabled={nfcState.hasNFCPermission}
                    className="flex items-center justify-center transition-all hover:scale-110 disabled:cursor-default"
                    aria-label={nfcState.hasNFCPermission ? "NFC Activated" : "Activate NFC"}
                    title={nfcState.hasNFCPermission ? "NFC ready - tap your card now" : "Click to activate NFC"}
                  >
                    <img 
                      src={nfcState.hasNFCPermission ? "/greennfc.svg" : "/bluenfc.svg"}
                      alt="NFC" 
                      className="h-10 w-10"
                    />
                  </button>
                </div>
              )}
              
              {/* Spacer for layout balance */}
              <div className="w-12"></div>
            </div>
          </div>
        </div>

        {/* Invoice Display */}
        <div className="flex-1 flex flex-col">
          {/* Error Message Space - Same as numpad view */}
          <div className="mx-3 mt-1 min-h-[44px]"></div>

          {/* Amount - Fixed at top position - Same as numpad */}
          <div className="px-4 pt-2 pb-2">
            <div className="text-center mb-4">
          <div className="text-center">
                <div className="text-6xl font-semibold text-gray-800 dark:text-gray-100 mb-1 min-h-[96px] flex items-center justify-center leading-none tracking-normal">
              {invoice.displayCurrency !== 'BTC' ? (
                <div>
                  <div>{formatDisplayAmount(invoice.displayAmount, invoice.displayCurrency)}</div>
                  <div className="text-lg text-gray-600 dark:text-gray-400 mt-1">({invoice.satAmount} sats)</div>
                </div>
              ) : (
                formatDisplayAmount(invoice.amount, invoice.currency)
              )}
                </div>
                <div className="text-sm text-gray-600 dark:text-gray-400">
                  <div className="mb-1 min-h-[20px]"></div>
                </div>
              </div>
            </div>
          </div>

          {/* QR Code and Invoice - Centered in remaining space */}
          <div className="flex-1 flex flex-col items-center justify-center space-y-4 px-6">
          {/* QR Code */}
          <div className="bg-white dark:bg-white p-4 rounded-lg shadow-lg border-2 border-gray-200 dark:border-gray-600">
            <QRCode 
              value={invoice.paymentRequest} 
              size={256}
              bgColor="#ffffff"
              fgColor="#000000"
            />
          </div>

          {/* Payment Request */}
          <div className="w-full max-w-md">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Lightning Invoice
            </label>
            <div className="flex">
              <input
                type="text"
                value={invoice.paymentRequest}
                readOnly
                autoComplete="off"
                data-1p-ignore
                data-lpignore="true"
                className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-l-md bg-gray-50 dark:bg-blink-dark text-sm font-mono text-black dark:text-gray-100"
              />
              <button
                onClick={() => copyToClipboard(invoice.paymentRequest)}
                className="px-4 py-2 bg-blue-500 dark:bg-blue-600 text-white rounded-r-md hover:bg-blue-600 dark:hover:bg-blue-700 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              </button>
            </div>
            </div>
          </div>

          {/* Cancel Button - Bottom Left */}
          <div className="px-4 pb-4 pt-6">
            <button
              onClick={handleClear}
              className="w-full h-12 bg-white dark:bg-black border-2 border-red-600 dark:border-red-500 hover:border-red-700 dark:hover:border-red-400 hover:bg-red-50 dark:hover:bg-red-900 text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 rounded-lg text-lg font-normal transition-colors shadow-md"
              style={{fontFamily: "'Source Sans Pro', sans-serif"}}
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-white dark:bg-black relative" style={{fontFamily: "'Source Sans Pro', sans-serif"}}>
      {/* Compact Amount Display */}
      <div className="px-4">
        <div className="text-center">
          <div className="text-center">
            <div className={`font-semibold text-gray-800 dark:text-gray-100 min-h-[72px] flex items-center justify-center leading-none tracking-normal max-w-full overflow-hidden px-2 ${
              showTipDialog 
                ? getDynamicFontSize(formatDisplayAmount(total + (parseFloat(amount) || 0), displayCurrency))
                : total > 0 
                  ? getDynamicFontSize(formatDisplayAmount(total, displayCurrency) + (amount ? ' + ' + amount : ''))
                  : getDynamicFontSize((amount === '0' || amount === '0.') ? (displayCurrency === 'BTC' || getCurrencyById(displayCurrency, currencies)?.fractionDigits === 0 ? '0' : getCurrencyById(displayCurrency, currencies)?.symbol + '0.') : (amount ? formatDisplayAmount(amount, displayCurrency) : formatDisplayAmount(0, displayCurrency)))
            }`} style={{fontFamily: "'Source Sans Pro', sans-serif", wordBreak: 'keep-all', overflowWrap: 'normal'}}>
              {showTipDialog ? (
                // When tip dialog is showing, show the combined total in white/black (not orange)
                <div className="max-w-full">
                  <span className="text-gray-800 dark:text-white">{formatDisplayAmount(total + (parseFloat(amount) || 0), displayCurrency)}</span>
                </div>
              ) : total > 0 ? (
                <div className="max-w-full flex flex-wrap items-center justify-center gap-2">
                  <span className="text-blink-accent">{formatDisplayAmount(total, displayCurrency)}</span>
                  {amount && (
                    <span className={`text-gray-600 dark:text-gray-400 ${
                      // Secondary amount is 2 sizes smaller than main amount
                      getDynamicFontSize(amount) === 'text-6xl' ? 'text-4xl' :
                      getDynamicFontSize(amount) === 'text-5xl' ? 'text-3xl' :
                      getDynamicFontSize(amount) === 'text-4xl' ? 'text-2xl' :
                      getDynamicFontSize(amount) === 'text-3xl' ? 'text-xl' :
                      getDynamicFontSize(amount) === 'text-2xl' ? 'text-lg' :
                      'text-base'
                    }`}> + {amount}</span>
                  )}
                </div>
              ) : (
                <div className="max-w-full">
                  {(amount === '0' || amount === '0.') ? (displayCurrency === 'BTC' || getCurrencyById(displayCurrency, currencies)?.fractionDigits === 0 ? '0' : getCurrencyById(displayCurrency, currencies)?.symbol + '0.') : (amount ? formatDisplayAmount(amount, displayCurrency) : formatDisplayAmount(0, displayCurrency))}
                </div>
              )}
            </div>
            {selectedTipPercent > 0 && (
              <div className={`text-green-600 dark:text-green-400 font-semibold max-w-full overflow-hidden px-2 ${getDynamicFontSize(formatDisplayAmount(getTipAmount(), displayCurrency)) === 'text-6xl' ? 'text-2xl' : getDynamicFontSize(formatDisplayAmount(getTipAmount(), displayCurrency)) === 'text-5xl' ? 'text-xl' : 'text-lg'}`}>
                + {selectedTipPercent}% tip ({formatDisplayAmount(getTipAmount(), displayCurrency)})
                <div className={`text-green-700 dark:text-green-400 mt-1 max-w-full ${getDynamicFontSize(formatDisplayAmount(getTotalWithTip(), displayCurrency))}`} style={{wordBreak: 'keep-all', overflowWrap: 'normal'}}>
                  Total: {formatDisplayAmount(getTotalWithTip(), displayCurrency)}
                </div>
              </div>
            )}
          </div>
          <div className="text-sm text-gray-600 dark:text-gray-400">
            <div className="mb-1 min-h-[20px] max-w-full overflow-x-auto px-2">
              {items.length > 0 && (
                <div className="whitespace-nowrap">
                  {items.join(' + ')}
                  {amount && ` + ${amount}`}
                  {!showTipDialog && total > 0 && amount && ` = ${formatDisplayAmount(total + (parseFloat(amount) || 0), displayCurrency)}`}
                </div>
              )}
            </div>
          </div>
          {/* Error Message - inline below amount */}
          {error && (
            <div className="mt-2 bg-red-100 dark:bg-red-900 border border-red-400 dark:border-red-700 text-red-700 dark:text-red-200 px-3 py-2 rounded text-sm animate-pulse">
              {error}
            </div>
          )}
        </div>

      </div>

      {/* Redesigned Numpad */}
      <div className="flex-1 px-4 pb-4 relative">
        {/* Spacer to align numpad with item list (below Search/Add Item row level) */}
        <div className="h-16 mb-2"></div>
        <div className="grid grid-cols-4 gap-3 max-w-sm mx-auto" data-1p-ignore data-lpignore="true">
          {/* Row 1: 1, 2, 3, + */}
          <button
            onClick={() => handleDigitPress('1')}
            className="h-16 bg-white dark:bg-black border-2 border-blue-600 dark:border-blue-500 hover:border-blue-700 dark:hover:border-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900 text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 rounded-lg text-xl font-normal leading-none tracking-normal transition-colors shadow-md"
            style={{fontFamily: "'Source Sans Pro', sans-serif"}}
          >
            1
          </button>
          <button
            onClick={() => handleDigitPress('2')}
            className="h-16 bg-white dark:bg-black border-2 border-blue-600 dark:border-blue-500 hover:border-blue-700 dark:hover:border-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900 text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 rounded-lg text-xl font-normal leading-none tracking-normal transition-colors shadow-md"
            style={{fontFamily: "'Source Sans Pro', sans-serif"}}
          >
            2
          </button>
          <button
            onClick={() => handleDigitPress('3')}
            className="h-16 bg-white dark:bg-black border-2 border-blue-600 dark:border-blue-500 hover:border-blue-700 dark:hover:border-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900 text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 rounded-lg text-xl font-normal leading-none tracking-normal transition-colors shadow-md"
            style={{fontFamily: "'Source Sans Pro', sans-serif"}}
          >
            3
          </button>
          <button
            onClick={handlePlusPress}
            disabled={!amount || parseFloat(amount) <= 0}
            className="h-16 bg-white dark:bg-black border-2 border-blue-600 dark:border-blue-500 hover:border-blue-700 dark:hover:border-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900 text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 disabled:bg-gray-200 dark:disabled:bg-blink-dark disabled:border-gray-400 dark:disabled:border-gray-600 disabled:text-gray-400 dark:disabled:text-gray-500 disabled:cursor-not-allowed rounded-lg text-xl font-normal leading-none tracking-normal transition-colors shadow-md flex items-center justify-center"
            style={{fontFamily: "'Source Sans Pro', sans-serif"}}
          >
            +
          </button>

          {/* Row 2: 4, 5, 6, OK (starts) */}
          <button
            onClick={() => handleDigitPress('4')}
            className="h-16 bg-white dark:bg-black border-2 border-blue-600 dark:border-blue-500 hover:border-blue-700 dark:hover:border-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900 text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 rounded-lg text-xl font-normal leading-none tracking-normal transition-colors shadow-md"
            style={{fontFamily: "'Source Sans Pro', sans-serif"}}
          >
            4
          </button>
          <button
            onClick={() => handleDigitPress('5')}
            className="h-16 bg-white dark:bg-black border-2 border-blue-600 dark:border-blue-500 hover:border-blue-700 dark:hover:border-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900 text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 rounded-lg text-xl font-normal leading-none tracking-normal transition-colors shadow-md"
            style={{fontFamily: "'Source Sans Pro', sans-serif"}}
          >
            5
          </button>
          <button
            onClick={() => handleDigitPress('6')}
            className="h-16 bg-white dark:bg-black border-2 border-blue-600 dark:border-blue-500 hover:border-blue-700 dark:hover:border-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900 text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 rounded-lg text-xl font-normal leading-none tracking-normal transition-colors shadow-md"
            style={{fontFamily: "'Source Sans Pro', sans-serif"}}
          >
            6
          </button>
          <button
            onClick={() => createInvoice()}
            disabled={!hasValidAmount() || loading || (!selectedWallet && !activeNWC && !hasBlinkLnAddressWallet && !hasNpubCashWallet) || (displayCurrency !== 'BTC' && !exchangeRate) || loadingRate}
            className={`h-[136px] ${!hasValidAmount() || loading ? 'bg-gray-200 dark:bg-blink-dark border-2 border-gray-400 dark:border-gray-600 text-gray-400 dark:text-gray-500' : 'bg-white dark:bg-black border-2 border-green-600 dark:border-green-500 hover:border-green-700 dark:hover:border-green-400 hover:bg-green-50 dark:hover:bg-green-900 text-green-600 dark:text-green-400 hover:text-green-700 dark:hover:text-green-300'} disabled:bg-gray-200 dark:disabled:bg-blink-dark disabled:border-gray-400 dark:disabled:border-gray-600 disabled:text-gray-400 dark:disabled:text-gray-500 rounded-lg text-lg font-normal leading-none tracking-normal transition-colors shadow-md flex items-center justify-center row-span-2`}
            style={{fontFamily: "'Source Sans Pro', sans-serif"}}
          >
            {loading ? 'Creating...' : 'OK'}
          </button>

          {/* Row 3: 7, 8, 9, OK (continues) */}
          <button
            onClick={() => handleDigitPress('7')}
            className="h-16 bg-white dark:bg-black border-2 border-blue-600 dark:border-blue-500 hover:border-blue-700 dark:hover:border-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900 text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 rounded-lg text-xl font-normal leading-none tracking-normal transition-colors shadow-md"
            style={{fontFamily: "'Source Sans Pro', sans-serif"}}
          >
            7
          </button>
          <button
            onClick={() => handleDigitPress('8')}
            className="h-16 bg-white dark:bg-black border-2 border-blue-600 dark:border-blue-500 hover:border-blue-700 dark:hover:border-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900 text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 rounded-lg text-xl font-normal leading-none tracking-normal transition-colors shadow-md"
            style={{fontFamily: "'Source Sans Pro', sans-serif"}}
          >
            8
          </button>
          <button
            onClick={() => handleDigitPress('9')}
            className="h-16 bg-white dark:bg-black border-2 border-blue-600 dark:border-blue-500 hover:border-blue-700 dark:hover:border-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900 text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 rounded-lg text-xl font-normal leading-none tracking-normal transition-colors shadow-md"
            style={{fontFamily: "'Source Sans Pro', sans-serif"}}
          >
            9
          </button>

          {/* Row 4: C, 0, ., ⌫ */}
          <button
            onClick={handleClear}
            className="h-16 bg-white dark:bg-black border-2 border-red-600 dark:border-red-500 hover:border-red-700 dark:hover:border-red-400 hover:bg-red-50 dark:hover:bg-red-900 text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 rounded-lg text-lg font-normal leading-none tracking-normal transition-colors shadow-md"
            style={{fontFamily: "'Source Sans Pro', sans-serif"}}
          >
            C
          </button>
          <button
            onClick={() => handleDigitPress('0')}
            className="h-16 bg-white dark:bg-black border-2 border-blue-600 dark:border-blue-500 hover:border-blue-700 dark:hover:border-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900 text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 rounded-lg text-xl font-normal leading-none tracking-normal transition-colors shadow-md"
            style={{fontFamily: "'Source Sans Pro', sans-serif"}}
          >
            0
          </button>
          <button
            onClick={() => handleDigitPress('.')}
            disabled={displayCurrency === 'BTC' || (getCurrentCurrency()?.fractionDigits === 0)}
            className="h-16 bg-white dark:bg-black border-2 border-blue-600 dark:border-blue-500 hover:border-blue-700 dark:hover:border-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900 text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 disabled:bg-gray-200 dark:disabled:bg-blink-dark disabled:border-gray-400 dark:disabled:border-gray-600 disabled:text-gray-400 dark:disabled:text-gray-500 disabled:cursor-not-allowed rounded-lg text-xl font-normal leading-none tracking-normal transition-colors shadow-md"
            style={{fontFamily: "'Source Sans Pro', sans-serif"}}
          >
            .
          </button>
          <button
            onClick={handleBackspace}
            className="h-16 bg-white dark:bg-black border-2 border-orange-500 dark:border-orange-500 hover:border-orange-600 dark:hover:border-orange-400 hover:bg-orange-50 dark:hover:bg-orange-900 text-orange-500 dark:text-orange-400 hover:text-orange-600 dark:hover:text-orange-300 rounded-lg text-lg font-normal leading-none tracking-normal transition-colors flex items-center justify-center shadow-md"
            style={{fontFamily: "'Source Sans Pro', sans-serif"}}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2M3 12l6.414 6.414a2 2 0 001.414.586H19a2 2 0 002-2V7a2 2 0 00-2-2h-8.172a2 2 0 00-1.414.586L3 12z" />
            </svg>
          </button>
      </div>

      {/* Tip Selection Overlay (over numpad) */}
        {showTipDialog && !showCustomTipInput && (
          <div className="absolute inset-0 bg-white dark:bg-black z-30 pt-24">
            <div className="grid grid-cols-4 gap-3 max-w-sm mx-auto" style={{fontFamily: "'Source Sans Pro', sans-serif"}}>
              <h3 className="col-span-4 text-xl font-bold mb-2 text-center text-gray-800 dark:text-white">Tip Options</h3>
              
              {/* Tip preset buttons in grid */}
              {(tipPresets || [10, 15, 20]).slice(0, 2).map(percent => (
                <button
                  key={percent}
                  onClick={() => {
                    setPendingTipSelection(percent);
                  }}
                  className="col-span-2 h-16 bg-white dark:bg-black border-2 border-green-500 hover:border-green-400 hover:bg-green-50 dark:hover:bg-green-900 text-green-600 dark:text-green-400 hover:text-green-700 dark:hover:text-green-300 rounded-lg text-lg font-normal transition-colors shadow-md"
                >
                  {percent}%
                  <div className="text-sm">
                    +{formatDisplayAmount(calculateTipAmount(total + (parseFloat(amount) || 0), percent), displayCurrency)}
                  </div>
                </button>
              ))}
              
              {/* Second row of tip presets */}
              {(tipPresets || [10, 15, 20]).slice(2, 4).map(percent => (
                <button
                  key={percent}
                  onClick={() => {
                    setPendingTipSelection(percent);
                  }}
                  className="col-span-2 h-16 bg-white dark:bg-black border-2 border-green-500 hover:border-green-400 hover:bg-green-50 dark:hover:bg-green-900 text-green-600 dark:text-green-400 hover:text-green-700 dark:hover:text-green-300 rounded-lg text-lg font-normal transition-colors shadow-md"
                >
                  {percent}%
                  <div className="text-sm">
                    +{formatDisplayAmount(calculateTipAmount(total + (parseFloat(amount) || 0), percent), displayCurrency)}
            </div>
                </button>
              ))}
              
              {/* Show Custom button when exactly 3 presets */}
              {(tipPresets || []).length === 3 && (
              <button
                onClick={() => {
                    setShowCustomTipInput(true);
                    setCustomTipValue('');
                }}
                  className="col-span-2 h-16 bg-white dark:bg-black border-2 border-blue-600 dark:border-blue-500 hover:border-blue-700 dark:hover:border-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900 text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 rounded-lg text-lg font-normal transition-colors shadow-md"
              >
                  Custom
              </button>
              )}
              
              {/* Cancel and No Tip buttons */}
              <button
                onClick={() => {
                  if (onInternalTransition) onInternalTransition();
                  setShowTipDialog(false);
                }}
                className="col-span-2 h-16 bg-white dark:bg-black border-2 border-red-500 hover:border-red-600 hover:bg-red-50 dark:hover:bg-red-900 text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 rounded-lg text-lg font-normal transition-colors shadow-md"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setPendingTipSelection(0);
                }}
                className="col-span-2 h-16 bg-white dark:bg-black border-2 border-yellow-500 dark:border-yellow-400 hover:border-yellow-600 dark:hover:border-yellow-300 hover:bg-yellow-50 dark:hover:bg-yellow-900 text-yellow-600 dark:text-yellow-400 hover:text-yellow-700 dark:hover:text-yellow-300 rounded-lg text-lg font-normal transition-colors shadow-md"
              >
                No Tip
              </button>
            </div>
          </div>
        )}

        {/* Custom Tip Input Overlay */}
        {showTipDialog && showCustomTipInput && (
          <div className="absolute inset-0 bg-white dark:bg-black flex items-center justify-center z-30">
            <div className="max-w-sm w-full" style={{fontFamily: "'Source Sans Pro', sans-serif"}}>
              <h3 className="text-xl font-bold mb-4 text-center text-gray-800 dark:text-white">Custom Tip</h3>
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 text-center">
                  Enter Tip Percentage
                </label>
                <input
                  type="number"
                  value={customTipValue}
                  onChange={(e) => setCustomTipValue(e.target.value)}
                  placeholder="e.g., 15"
                  min="0"
                  max="100"
                  step="0.5"
                  className="w-full px-4 py-3 text-center text-2xl border-2 border-blue-600 dark:border-blue-500 rounded-lg bg-white dark:bg-blink-dark text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-600"
                  autoFocus
                />
                {customTipValue && parseFloat(customTipValue) > 0 && (
                  <div className="mt-2 text-center text-gray-600 dark:text-gray-400">
                    +{formatDisplayAmount(calculateTipAmount(total + (parseFloat(amount) || 0), parseFloat(customTipValue)), displayCurrency)}
                  </div>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => {
                    setShowCustomTipInput(false);
                    setCustomTipValue('');
                  }}
                  className="h-16 bg-white dark:bg-black border-2 border-gray-500 hover:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-900 text-gray-600 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 rounded-lg text-lg font-normal transition-colors shadow-md"
                >
                  Back
                </button>
                <button
                  onClick={() => {
                    const tipPercent = parseFloat(customTipValue) || 0;
                    if (tipPercent >= 0 && tipPercent <= 100) {
                      setPendingTipSelection(tipPercent);
                      setShowCustomTipInput(false);
                      setCustomTipValue('');
                    }
                  }}
                  disabled={!customTipValue || parseFloat(customTipValue) < 0 || parseFloat(customTipValue) > 100}
                  className="h-16 bg-white dark:bg-black border-2 border-green-500 hover:border-green-600 hover:bg-green-50 dark:hover:bg-green-900 text-green-600 dark:text-green-400 hover:text-green-700 dark:hover:text-green-300 disabled:border-gray-400 disabled:text-gray-400 disabled:cursor-not-allowed disabled:hover:bg-white dark:disabled:hover:bg-black rounded-lg text-lg font-normal transition-colors shadow-md"
                >
                  Apply
              </button>
            </div>
          </div>
        </div>
      )}

      </div>

    </div>
  );
};

export default POS;
