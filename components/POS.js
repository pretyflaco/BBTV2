import { useState, useEffect } from 'react';
import QRCode from 'react-qr-code';
import { formatDisplayAmount as formatCurrency, getCurrencyById } from '../lib/currency-utils';

const POS = ({ apiKey, user, displayCurrency, currencies, wallets, onPaymentReceived, connected, manualReconnect, reconnectAttempts, blinkposConnected, blinkposConnect, blinkposDisconnect, blinkposReconnect, blinkposReconnectAttempts, tipsEnabled, tipPresets, tipRecipient, soundEnabled, onInvoiceStateChange }) => {
  const [amount, setAmount] = useState('');
  const [total, setTotal] = useState(0);
  const [items, setItems] = useState([]);
  const [invoice, setInvoice] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selectedWallet, setSelectedWallet] = useState(null);
  const [exchangeRate, setExchangeRate] = useState(null);
  const [loadingRate, setLoadingRate] = useState(false);
  
  // Tip functionality state (local)
  const [selectedTipPercent, setSelectedTipPercent] = useState(0);
  const [showTipDialog, setShowTipDialog] = useState(false);
  const [pendingTipSelection, setPendingTipSelection] = useState(null);

  // Handle tip selection and create invoice after state update
  useEffect(() => {
    if (pendingTipSelection !== null) {
      const newTipPercent = pendingTipSelection;
      setSelectedTipPercent(newTipPercent);
      setShowTipDialog(false);
      setPendingTipSelection(null);
      
      // Create invoice with the specific tip percentage
      createInvoiceWithTip(newTipPercent);
    }
  }, [pendingTipSelection]);

  // Set default wallet when wallets are loaded
  useEffect(() => {
    console.log('Wallets changed:', wallets);
    if (wallets && wallets.length > 0) {
      // Always use BTC wallet for POS
      const btcWallet = wallets.find(w => w.walletCurrency === 'BTC');
      if (btcWallet && !selectedWallet) {
        setSelectedWallet(btcWallet);
        console.log('Selected BTC wallet:', btcWallet);
      } else if (!btcWallet) {
        console.error('No BTC wallet found in:', wallets);
        setError('No BTC wallet available for invoice generation');
      }
    }
  }, [wallets, selectedWallet]);

  // Fetch exchange rate when currency changes
  useEffect(() => {
    if (displayCurrency !== 'BTC' && apiKey) {
      fetchExchangeRate();
    } else if (displayCurrency === 'BTC') {
      setExchangeRate({ satPriceInCurrency: 1, currency: 'BTC' });
    }
  }, [displayCurrency, apiKey]);

  // Clear invoice when payment is received
  useEffect(() => {
    if (onPaymentReceived) {
      const clearInvoiceOnPayment = () => {
        console.log('Payment received - clearing invoice and returning to numpad');
        setInvoice(null);
        setAmount('');
        setTotal(0);
        setItems([]);
        setError('');
        setSelectedTipPercent(0);
        setShowTipDialog(false);
        setPendingTipSelection(null);
      };
      
      // Set up the callback
      onPaymentReceived.current = clearInvoiceOnPayment;
    }
  }, [onPaymentReceived]);

  // Notify parent when invoice state changes
  useEffect(() => {
    if (onInvoiceStateChange) {
      onInvoiceStateChange(!!invoice);
    }
  }, [invoice, onInvoiceStateChange]);


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
          currency: displayCurrency
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
      const audio = new Audio('/stroke1.mp3');
      audio.volume = 0.3; // Set volume to 30% to avoid being too loud
      audio.play().catch(console.error);
    }
  };

  const handleDigitPress = (digit) => {
    // Play sound effect for keystroke
    playKeystrokeSound();
    
    if (amount === '0' && digit !== '.') {
      setAmount(digit);
    } else if (digit === '.' && amount.includes('.')) {
      // Don't add multiple decimal points
      return;
    } else if (displayCurrency === 'BTC' && digit === '.') {
      // Don't allow decimal points for BTC (sats are integers)
      return;
    } else if (digit === '.' && amount.includes('.')) {
      // Already has a decimal point
      return;
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
    setAmount('');
    setTotal(0);
    setItems([]);
    setInvoice(null);
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
    
    if (!amount) {
      setError('Enter an amount before adding');
      return;
    }
    
    const numericAmount = parseFloat(amount);
    if (isNaN(numericAmount) || numericAmount <= 0) {
      setError('Enter a valid amount');
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
    if (tipsEnabled && tipRecipient && tipRecipient.length > 0 && !shouldSkipTipDialog && effectiveTipPercent === 0) {
      setShowTipDialog(true);
      return;
    }

    if (!selectedWallet) {
      setError('No BTC wallet available. Please try refreshing.');
      return;
    }

    if (!apiKey) {
      setError('No API key available. Please log in again.');
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
        
        // Build memo showing conversion and tip
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
      } else {
        // BTC - show calculation in sats
        const allItems = amount ? [...items, parseFloat(amount)] : items;
        if (effectiveTipPercent > 0) {
          memo = allItems.length > 1 ? `${allItems.join(' + ')} + ${effectiveTipPercent}% tip = ${totalWithTip} sats` : `${finalTotal} + ${effectiveTipPercent}% tip = ${totalWithTip} sats`;
        } else {
          memo = allItems.length > 1 ? `${allItems.join(' + ')} = ${finalTotal} sats` : '';
        }
        finalTotalInSats = Math.round(totalWithTip);
      }

      const requestBody = {
        amount: finalTotalInSats,
        currency: 'BTC', // Always create BTC invoices
        memo: memo, // Show calculation in memo
        walletId: selectedWallet.id, // This will be ignored in the new flow
        userWalletId: selectedWallet.id, // User's wallet for payment forwarding
        apiKey: apiKey, // Pass user's API key for payment forwarding
        displayCurrency: displayCurrency, // Pass the actual display currency for tip memo
        // Tip information for payment splitting
        baseAmount: convertToSatoshis(finalTotal, displayCurrency !== 'BTC' ? displayCurrency : 'BTC'),
        tipAmount: effectiveTipPercent > 0 ? convertToSatoshis(tipAmount, displayCurrency !== 'BTC' ? displayCurrency : 'BTC') : 0,
        tipPercent: effectiveTipPercent,
        tipRecipient: tipRecipient || null,
        // Display currency amounts for memo calculation
        baseAmountDisplay: finalTotal,
        tipAmountDisplay: tipAmount
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
      } else {
        throw new Error('Invalid response from server');
      }

    } catch (err) {
      console.error('Invoice creation error:', err);
      setError(err.message || 'Failed to create invoice');
    } finally {
      setLoading(false);
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

  if (invoice) {
    return (
      <div className="h-full flex flex-col bg-white dark:bg-black" style={{fontFamily: "'Source Sans Pro', sans-serif"}}>
        {/* Header */}
        <div className="bg-white dark:bg-blink-dark border-b border-gray-200 dark:border-gray-700 p-4 flex items-center justify-between">
          <button
            onClick={handleClear}
            className="text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100 flex items-center"
          >
            <svg className="w-6 h-6 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
            </svg>
            Cancel
          </button>
          <h2 className="text-xl font-bold text-black dark:text-white">Payment Request</h2>
          <div className="w-8"></div>
        </div>

        {/* Invoice Display */}
        <div className="flex-1 p-6 flex flex-col items-center justify-center space-y-6">
          {/* Amount */}
          <div className="text-center">
            <div className="text-3xl font-bold text-gray-800 dark:text-gray-100">
              {invoice.displayCurrency !== 'BTC' ? (
                <div>
                  <div>{formatDisplayAmount(invoice.displayAmount, invoice.displayCurrency)}</div>
                  <div className="text-lg text-gray-600 dark:text-gray-400 mt-1">({invoice.satAmount} sats)</div>
                </div>
              ) : (
                formatDisplayAmount(invoice.amount, invoice.currency)
              )}
            </div>
          </div>

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
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-white dark:bg-black relative" style={{fontFamily: "'Source Sans Pro', sans-serif"}}>
      {/* Error Message - Fixed height container to prevent layout shift */}
      <div className="mx-3 mt-3 min-h-[44px]">
        {error && (
          <div className="bg-red-100 dark:bg-red-900 border border-red-400 dark:border-red-700 text-red-700 dark:text-red-200 px-3 py-2 rounded text-sm animate-pulse">
            {error}
          </div>
        )}
      </div>

      {/* Compact Amount Display */}
      <div className="p-4">
        <div className="text-center mb-4">
          <div className="text-center">
            <div className="text-6xl font-semibold text-gray-800 dark:text-gray-100 mb-1 min-h-[96px] flex items-center justify-center leading-none tracking-normal" style={{fontFamily: "'Source Sans Pro', sans-serif"}}>
              {total > 0 ? (
                <div>
                  <span className="text-blink-accent">{formatDisplayAmount(total, displayCurrency)}</span>
                  {amount && <span className="text-4xl text-gray-600 dark:text-gray-400"> + {amount}</span>}
                </div>
              ) : (
                amount ? formatDisplayAmount(amount, displayCurrency) : formatDisplayAmount(0, displayCurrency)
              )}
            </div>
            {selectedTipPercent > 0 && (
              <div className="text-2xl text-green-600 dark:text-green-400 font-semibold">
                + {selectedTipPercent}% tip ({formatDisplayAmount(getTipAmount(), displayCurrency)})
                <div className="text-3xl text-green-700 dark:text-green-400 mt-1">
                  Total: {formatDisplayAmount(getTotalWithTip(), displayCurrency)}
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

      {/* Redesigned Numpad */}
      <div className="flex-1 px-4 pb-4">
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
            className="h-16 bg-white dark:bg-black border-2 border-blue-600 dark:border-blue-500 hover:border-blue-700 dark:hover:border-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900 text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 rounded-lg text-xl font-normal leading-none tracking-normal transition-colors shadow-md flex items-center justify-center"
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
            disabled={!hasValidAmount() || loading || !selectedWallet || !apiKey || (displayCurrency !== 'BTC' && !exchangeRate) || loadingRate}
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
            disabled={displayCurrency === 'BTC'}
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

      </div>

      {/* Tip Selection Overlay (over numpad) */}
      {showTipDialog && (
        <div className="absolute inset-0 bg-black bg-opacity-70 dark:bg-opacity-80 flex items-center justify-center z-30">
          <div className="bg-white dark:bg-blink-dark rounded-lg p-6 max-w-sm w-full mx-4" style={{fontFamily: "'Source Sans Pro', sans-serif"}}>
            <h3 className="text-xl font-bold mb-4 text-center text-gray-800 dark:text-gray-100">Add Tip?</h3>
            <div className="mb-4 text-center">
              <div className="text-lg text-gray-700 dark:text-gray-300">
                Order: {formatDisplayAmount(total + (parseFloat(amount) || 0), displayCurrency)}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 mb-4">
              {(tipPresets || [10, 15, 20]).map(percent => (
                <button
                  key={percent}
                  onClick={() => {
                    setPendingTipSelection(percent);
                  }}
                  className="h-16 bg-green-600 dark:bg-green-700 hover:bg-green-700 dark:hover:bg-green-600 text-white rounded-lg text-lg font-bold transition-colors shadow-lg"
                >
                  {percent}%
                  <div className="text-sm opacity-90">
                    +{formatDisplayAmount(calculateTipAmount(total + (parseFloat(amount) || 0), percent), displayCurrency)}
                  </div>
                </button>
              ))}
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setPendingTipSelection(0);
                }}
                className="flex-1 h-12 bg-gray-500 dark:bg-gray-600 hover:bg-gray-600 dark:hover:bg-gray-700 text-white rounded-lg font-bold transition-colors"
              >
                No Tip
              </button>
              <button
                onClick={() => setShowTipDialog(false)}
                className="flex-1 h-12 bg-red-500 dark:bg-red-600 hover:bg-red-600 dark:hover:bg-red-700 text-white rounded-lg font-bold transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default POS;
