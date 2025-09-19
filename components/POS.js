import { useState, useEffect } from 'react';
import QRCode from 'react-qr-code';

const POS = ({ apiKey, user, displayCurrency, wallets, onPaymentReceived, connected, manualReconnect, reconnectAttempts, blinkposConnected, blinkposReconnect, blinkposReconnectAttempts, tipsEnabled, tipPresets, tipRecipient, soundEnabled }) => {
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
        console.log('🎉 Payment received - clearing invoice and returning to numpad');
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
    // Handle empty or invalid values by showing 0 in the appropriate format
    const numValue = parseFloat(value) || 0;

    if (currency === 'BTC') {
      return `${numValue.toLocaleString()} sats`;
    } else if (currency === 'USD') {
      return `$${numValue.toFixed(2)}`;
    } else if (currency === 'KES') {
      return `KSh ${numValue.toFixed(2)}`;
    }
    return `${numValue} ${currency}`;
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
    } else if ((displayCurrency === 'USD' || displayCurrency === 'KES') && amount.includes('.') && amount.split('.')[1].length >= 2) {
      // Don't allow more than 2 decimal places for fiat currencies
      return;
    } else if (displayCurrency === 'BTC' && digit === '.') {
      // Don't allow decimal points for BTC (sats are integers)
      return;
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

    // Warn if not connected but allow creating invoice
    if (!connected || !blinkposConnected) {
      const issues = [];
      if (!connected) issues.push('User WebSocket disconnected');
      if (!blinkposConnected) issues.push('BlinkPOS WebSocket disconnected');
      
      const proceed = window.confirm(
        `⚠ ${issues.join(' and ')}! Invoice can be created but payment detection/forwarding may not work. Try reconnecting first, or proceed anyway?`
      );
      if (!proceed) {
        return;
      }
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
          return;
        }
        
        finalTotalInSats = convertToSatoshis(totalWithTip, displayCurrency);
        
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

      console.log('Creating invoice with:', {
        displayAmount: finalTotal,
        displayCurrency,
        amountInSats: finalTotalInSats,
        walletId: selectedWallet.id,
        hasApiKey: !!apiKey
      });

      const response = await fetch('/api/blink/create-invoice', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          amount: finalTotalInSats,
          currency: 'BTC', // Always create BTC invoices
          memo: memo, // Show calculation in memo
          walletId: selectedWallet.id, // This will be ignored in the new flow
          userWalletId: selectedWallet.id, // User's wallet for payment forwarding
          apiKey: apiKey, // Pass user's API key for payment forwarding
          // Tip information for payment splitting
          baseAmount: convertToSatoshis(finalTotal, displayCurrency !== 'BTC' ? displayCurrency : 'BTC'),
          tipAmount: effectiveTipPercent > 0 ? convertToSatoshis(tipAmount, displayCurrency !== 'BTC' ? displayCurrency : 'BTC') : 0,
          tipPercent: effectiveTipPercent,
          tipRecipient: tipRecipient || null
        }),
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
      <div className="h-full flex flex-col bg-white">
        {/* Header */}
        <div className="bg-blink-orange text-white p-4 flex items-center justify-between">
          <button
            onClick={handleClear}
            className="text-white hover:text-gray-200 flex items-center"
          >
            <svg className="w-6 h-6 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
            </svg>
            Cancel
          </button>
          <h2 className="text-xl font-bold">Payment Request</h2>
          <div className="w-8"></div>
        </div>

        {/* Invoice Display */}
        <div className="flex-1 p-6 flex flex-col items-center justify-center space-y-6">
          {/* Amount */}
          <div className="text-center">
            <div className="text-3xl font-bold text-gray-800">
              {invoice.displayCurrency !== 'BTC' ? (
                <div>
                  <div>{formatDisplayAmount(invoice.displayAmount, invoice.displayCurrency)}</div>
                  <div className="text-lg text-gray-600 mt-1">({invoice.satAmount} sats)</div>
                </div>
              ) : (
                formatDisplayAmount(invoice.amount, invoice.currency)
              )}
            </div>
          </div>

          {/* QR Code */}
          <div className="bg-white p-4 rounded-lg shadow-lg border-2 border-gray-200">
            <QRCode 
              value={invoice.paymentRequest} 
              size={256}
              bgColor="#ffffff"
              fgColor="#000000"
            />
          </div>

          {/* Payment Request */}
          <div className="w-full max-w-md">
            <label className="block text-sm font-medium text-gray-700 mb-2">
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
                className="flex-1 px-3 py-2 border border-gray-300 rounded-l-md bg-gray-50 text-sm font-mono"
              />
              <button
                onClick={() => copyToClipboard(invoice.paymentRequest)}
                className="px-4 py-2 bg-blue-500 text-white rounded-r-md hover:bg-blue-600 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              </button>
            </div>
          </div>

          {/* Instructions */}
          <div className="text-center text-gray-600 text-sm max-w-md">
            <p>Scan the QR code with a Lightning wallet or copy the invoice to complete the payment.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-white relative">
      {/* Compact Header */}
      <div className="bg-blink-orange text-white p-3">
        <h2 className="text-lg font-bold text-center">Point of Sale</h2>
        {tipsEnabled && tipRecipient && (
          <div className="text-xs text-center text-orange-100 mt-1">
            💰 Tips enabled → {tipRecipient}@blink.sv
          </div>
        )}
      </div>

      {/* Error Message */}
      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-3 py-2 mx-3 mt-3 rounded text-sm">
          {error}
        </div>
      )}

      {/* Compact Amount Display */}
      <div className="p-4">
        <div className="text-center mb-4">
          <div className="text-center">
            <div className="text-3xl font-bold text-gray-800 mb-1 min-h-[48px] flex items-center justify-center">
              {total > 0 ? (
                <div>
                  <span className="text-blink-orange">{formatDisplayAmount(total, displayCurrency)}</span>
                  {amount && <span className="text-lg text-gray-600"> + {amount}</span>}
                </div>
              ) : (
                amount ? formatDisplayAmount(amount, displayCurrency) : formatDisplayAmount(0, displayCurrency)
              )}
            </div>
            {selectedTipPercent > 0 && (
              <div className="text-lg text-green-600 font-semibold">
                + {selectedTipPercent}% tip ({formatDisplayAmount(getTipAmount(), displayCurrency)})
                <div className="text-xl text-green-700 mt-1">
                  Total: {formatDisplayAmount(getTotalWithTip(), displayCurrency)}
                </div>
              </div>
            )}
          </div>
          <div className="text-sm text-gray-600">
            <div className="mb-1 min-h-[20px]">
              {items.length > 0 && (
                <div>
                  Items: {items.join(' + ')}
                  {amount && ` + ${amount}`}
                  {total > 0 && amount && ` = ${formatDisplayAmount(total + (parseFloat(amount) || 0), displayCurrency)}`}
                </div>
              )}
            </div>
            <div className="min-h-[20px]">
              {!connected || !blinkposConnected ? (
                <div className="flex flex-col items-center space-y-1">
                  {!connected && (
                    <div className="flex items-center space-x-2">
                      <span className="text-red-600">⚠ User disconnected</span>
                      {reconnectAttempts > 0 && (
                        <span className="text-xs text-gray-500">(retry {reconnectAttempts})</span>
                      )}
                      <button
                        onClick={manualReconnect}
                        className="text-xs bg-blue-500 hover:bg-blue-600 text-white px-1 py-1 rounded"
                      >
                        Reconnect
                      </button>
                    </div>
                  )}
                  {!blinkposConnected && (
                    <div className="flex items-center space-x-2">
                      <span className="text-orange-600">⚠ BlinkPOS disconnected</span>
                      {blinkposReconnectAttempts > 0 && (
                        <span className="text-xs text-gray-500">(retry {blinkposReconnectAttempts})</span>
                      )}
                      <button
                        onClick={blinkposReconnect}
                        className="text-xs bg-orange-500 hover:bg-orange-600 text-white px-1 py-1 rounded"
                      >
                        Reconnect
                      </button>
                    </div>
                  )}
                </div>
              ) : loadingRate ? '🔄 Loading exchange rate...' :
               !apiKey ? '⚠ No API key' : 
               !selectedWallet?.id ? '⚠ Loading wallet...' : 
               displayCurrency !== 'BTC' && !exchangeRate ? '⚠ Exchange rate not available' :
               '✓ Ready (User + BlinkPOS connected)'}
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
            className="h-16 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xl font-bold transition-colors shadow-md"
          >
            1
          </button>
          <button
            onClick={() => handleDigitPress('2')}
            className="h-16 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xl font-bold transition-colors shadow-md"
          >
            2
          </button>
          <button
            onClick={() => handleDigitPress('3')}
            className="h-16 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xl font-bold transition-colors shadow-md"
          >
            3
          </button>
          <button
            onClick={handlePlusPress}
            className="h-16 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xl font-bold transition-colors shadow-md flex items-center justify-center"
          >
            +
          </button>

          {/* Row 2: 4, 5, 6, OK (starts) */}
          <button
            onClick={() => handleDigitPress('4')}
            className="h-16 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xl font-bold transition-colors shadow-md"
          >
            4
          </button>
          <button
            onClick={() => handleDigitPress('5')}
            className="h-16 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xl font-bold transition-colors shadow-md"
          >
            5
          </button>
          <button
            onClick={() => handleDigitPress('6')}
            className="h-16 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xl font-bold transition-colors shadow-md"
          >
            6
          </button>
          <button
            onClick={() => createInvoice()}
            disabled={(total === 0 && (!amount || parseFloat(amount) === 0)) || loading || !selectedWallet || !apiKey || (displayCurrency !== 'BTC' && !exchangeRate) || loadingRate || !blinkposConnected}
            className={`h-[136px] ${(!connected || !blinkposConnected) ? 'bg-orange-500 hover:bg-orange-600' : (total === 0 && (!amount || parseFloat(amount) === 0)) ? 'bg-gray-400' : 'bg-green-600 hover:bg-green-700'} disabled:bg-gray-400 text-white rounded-lg text-lg font-bold transition-colors shadow-md flex items-center justify-center row-span-2`}
          >
            {loading ? 'Creating...' : (!connected || !blinkposConnected) ? 'OK ⚠' : 'OK'}
          </button>

          {/* Row 3: 7, 8, 9, OK (continues) */}
          <button
            onClick={() => handleDigitPress('7')}
            className="h-16 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xl font-bold transition-colors shadow-md"
          >
            7
          </button>
          <button
            onClick={() => handleDigitPress('8')}
            className="h-16 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xl font-bold transition-colors shadow-md"
          >
            8
          </button>
          <button
            onClick={() => handleDigitPress('9')}
            className="h-16 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xl font-bold transition-colors shadow-md"
          >
            9
          </button>

          {/* Row 4: C, 0, ., ⌫ */}
          <button
            onClick={handleClear}
            className="h-16 bg-red-600 hover:bg-red-700 text-white rounded-lg text-lg font-bold transition-colors shadow-md"
          >
            C
          </button>
          <button
            onClick={() => handleDigitPress('0')}
            className="h-16 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xl font-bold transition-colors shadow-md"
          >
            0
          </button>
          <button
            onClick={() => handleDigitPress('.')}
            disabled={displayCurrency === 'BTC'}
            className="h-16 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white rounded-lg text-xl font-bold transition-colors shadow-md"
          >
            .
          </button>
          <button
            onClick={handleBackspace}
            className="h-16 bg-orange-500 hover:bg-orange-600 text-white rounded-lg text-lg font-bold transition-colors flex items-center justify-center shadow-md"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2M3 12l6.414 6.414a2 2 0 001.414.586H19a2 2 0 002-2V7a2 2 0 00-2-2h-8.172a2 2 0 00-1.414.586L3 12z" />
            </svg>
          </button>
        </div>

      </div>

      {/* Tip Selection Overlay (over numpad) */}
      {showTipDialog && (
        <div className="absolute inset-0 bg-black bg-opacity-70 flex items-center justify-center z-30">
          <div className="bg-white rounded-lg p-6 max-w-sm w-full mx-4">
            <h3 className="text-xl font-bold mb-4 text-center text-gray-800">Add Tip?</h3>
            <div className="mb-4 text-center">
              <div className="text-lg text-gray-700">
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
                  className="h-16 bg-green-600 hover:bg-green-700 text-white rounded-lg text-lg font-bold transition-colors shadow-lg"
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
                className="flex-1 h-12 bg-gray-500 hover:bg-gray-600 text-white rounded-lg font-bold transition-colors"
              >
                No Tip
              </button>
              <button
                onClick={() => setShowTipDialog(false)}
                className="flex-1 h-12 bg-red-500 hover:bg-red-600 text-white rounded-lg font-bold transition-colors"
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
