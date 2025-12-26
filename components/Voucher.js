import { useState, useEffect, useRef, useCallback } from 'react';
import QRCode from 'react-qr-code';
import { bech32 } from 'bech32';
import { formatDisplayAmount as formatCurrency, getCurrencyById } from '../lib/currency-utils';

const Voucher = ({ voucherWallet, displayCurrency, currencies, darkMode, toggleDarkMode, soundEnabled, onInternalTransition }) => {
  const [amount, setAmount] = useState('');
  const [voucher, setVoucher] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [exchangeRate, setExchangeRate] = useState(null);
  const [loadingRate, setLoadingRate] = useState(false);
  const [redeemed, setRedeemed] = useState(false);
  const pollingIntervalRef = useRef(null);
  const successSoundRef = useRef(null);

  // Play success sound
  const playSuccessSound = useCallback(() => {
    if (soundEnabled) {
      const audio = new Audio('/success.mp3');
      audio.volume = 0.5;
      audio.play().catch(console.error);
      successSoundRef.current = audio;
    }
  }, [soundEnabled]);

  // Poll voucher status to detect redemption
  const pollVoucherStatus = useCallback(async (chargeId) => {
    try {
      const response = await fetch(`/api/voucher/status/${chargeId}`);
      const data = await response.json();
      
      if (data.claimed) {
        console.log('✅ Voucher has been redeemed!');
        setRedeemed(true);
        playSuccessSound();
        
        // Stop polling
        if (pollingIntervalRef.current) {
          clearInterval(pollingIntervalRef.current);
          pollingIntervalRef.current = null;
        }
      }
    } catch (error) {
      console.error('Error polling voucher status:', error);
    }
  }, [playSuccessSound]);

  // Start polling when voucher is created
  useEffect(() => {
    if (voucher && voucher.id && !redeemed) {
      console.log('🔄 Starting voucher status polling for:', voucher.id);
      
      // Poll immediately
      pollVoucherStatus(voucher.id);
      
      // Then poll every 2 seconds
      pollingIntervalRef.current = setInterval(() => {
        pollVoucherStatus(voucher.id);
      }, 2000);
      
      return () => {
        if (pollingIntervalRef.current) {
          clearInterval(pollingIntervalRef.current);
          pollingIntervalRef.current = null;
        }
      };
    }
  }, [voucher, redeemed, pollVoucherStatus]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
      }
      if (successSoundRef.current) {
        successSoundRef.current.pause();
      }
    };
  }, []);

  // Helper function to get dynamic font size based on amount length
  const getDynamicFontSize = (displayText) => {
    const numericOnly = String(displayText).replace(/[^0-9.]/g, '');
    const length = numericOnly.length;
    
    if (length <= 6) return 'text-6xl';
    if (length <= 9) return 'text-5xl';
    if (length <= 11) return 'text-4xl';
    if (length <= 13) return 'text-3xl';
    if (length <= 15) return 'text-2xl';
    if (length <= 16) return 'text-xl';
    return 'text-lg';
  };

  // Format display amount
  const formatDisplayAmount = (value, currency) => {
    return formatCurrency(value, currency, currencies);
  };

  // Get current currency metadata
  const getCurrentCurrency = () => {
    return getCurrencyById(displayCurrency, currencies);
  };

  // Fetch exchange rate when currency changes
  useEffect(() => {
    if (displayCurrency !== 'BTC') {
      fetchExchangeRate();
    } else {
      setExchangeRate({ satPriceInCurrency: 1, currency: 'BTC' });
    }
  }, [displayCurrency]);

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
          currency: displayCurrency,
          useBlinkpos: true // Use BlinkPOS credentials for exchange rate
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

  // Play keystroke sound
  const playKeystrokeSound = () => {
    if (soundEnabled) {
      const audio = new Audio('/click.mp3');
      audio.volume = 0.3;
      audio.play().catch(console.error);
    }
  };

  // Convert display currency amount to satoshis
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

  const handleDigitPress = (digit) => {
    playKeystrokeSound();
    
    const MAX_SATS = 2100000000000000;
    
    if (digit !== '.') {
      const newAmount = amount + digit;
      const numericValue = parseFloat(newAmount.replace(/[^0-9.]/g, ''));
      
      // For BTC currency, validate against max sats
      if (displayCurrency === 'BTC' && numericValue > MAX_SATS) {
        return;
      }
      
      // Cap at 16 digits
      const currentNumericDigits = amount.replace(/[^0-9]/g, '').length;
      if (currentNumericDigits >= 16) {
        return;
      }
    }
    
    // Special handling for '0' as first digit
    if (amount === '' && digit === '0') {
      if (displayCurrency === 'BTC') {
        setAmount('0');
      } else {
        setAmount('0.');
      }
      return;
    }
    
    // Special handling for '.' as first digit
    if (amount === '' && digit === '.') {
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
      // Don't allow decimal points for zero-decimal currencies
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
    
    if ((voucher || redeemed) && onInternalTransition) {
      onInternalTransition();
    }
    
    // Stop polling
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }
    
    setAmount('');
    setVoucher(null);
    setError('');
    setRedeemed(false);
  };

  const isValidAmount = () => {
    if (!amount || amount === '' || amount === '0') {
      return false;
    }

    const numValue = parseFloat(amount);
    if (isNaN(numValue) || numValue <= 0) {
      return false;
    }

    // For BTC, minimum 1 sat
    if (displayCurrency === 'BTC') {
      return numValue >= 1;
    }

    // For fiat, check minimum based on fraction digits
    const currency = getCurrentCurrency();
    if (!currency) {
      return numValue > 0;
    }

    const minimumAmount = currency.fractionDigits > 0 
      ? 1 / Math.pow(10, currency.fractionDigits)
      : 1;
    
    if (numValue < minimumAmount) {
      return false;
    }

    // Also check if it converts to at least 1 satoshi
    if (exchangeRate && exchangeRate.satPriceInCurrency) {
      try {
        const sats = convertToSatoshis(numValue, displayCurrency);
        if (sats < 1) {
          return false;
        }
      } catch (e) {
        return false;
      }
    }

    return true;
  };

  const encodeLnurl = (url) => {
    try {
      console.log('🔨 Encoding URL to LNURL:', url);
      const bytes = new TextEncoder().encode(url);
      console.log('📦 Bytes length:', bytes.length);
      const words = bech32.toWords(bytes);
      console.log('📝 Words length:', words.length);
      const encoded = bech32.encode('lnurl', words, 2000);
      console.log('✅ Encoded (lowercase):', encoded);
      
      // Verify by decoding
      try {
        const decoded = bech32.decode(encoded, 2000);
        const decodedBytes = bech32.fromWords(decoded.words);
        const decodedUrl = new TextDecoder().decode(new Uint8Array(decodedBytes));
        console.log('✓ Verification - Decoded URL:', decodedUrl);
        console.log('✓ URL match:', url === decodedUrl);
      } catch (verifyError) {
        console.error('⚠️ Verification failed:', verifyError);
      }
      
      return encoded.toUpperCase();
    } catch (error) {
      console.error('Failed to encode LNURL:', error);
      throw error;
    }
  };

  const createVoucher = async () => {
    if (!isValidAmount()) {
      setError('Please enter a valid amount (minimum 1 sat)');
      return;
    }

    if (!voucherWallet || !voucherWallet.apiKey || !voucherWallet.walletId) {
      setError('Voucher wallet not configured');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const numericAmount = parseFloat(amount);
      
      // Convert to sats if needed
      let amountInSats;
      if (displayCurrency === 'BTC') {
        amountInSats = Math.round(numericAmount);
      } else {
        if (!exchangeRate || !exchangeRate.satPriceInCurrency) {
          throw new Error(`Exchange rate not available for ${displayCurrency}`);
        }
        amountInSats = convertToSatoshis(numericAmount, displayCurrency);
        
        if (amountInSats < 1) {
          throw new Error('Amount too small. Converts to less than 1 satoshi.');
        }
      }

      console.log('🔨 Creating voucher:', {
        displayAmount: numericAmount,
        displayCurrency: displayCurrency,
        amountInSats: amountInSats,
        exchangeRate: exchangeRate
      });

      // Create voucher charge
      const response = await fetch('/api/voucher/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          amount: amountInSats,
          apiKey: voucherWallet.apiKey,
          walletId: voucherWallet.walletId
        }),
      });

      const data = await response.json();
      console.log('📦 Voucher creation response:', data);

      if (!response.ok) {
        throw new Error(data.error || `Server error: ${response.status}`);
      }

      if (data.success && data.voucher) {
        // Build LNURL
        const protocol = window.location.protocol;
        const host = window.location.host;
        const lnurlUrl = `${protocol}//${host}/api/voucher/lnurl/${data.voucher.id}/${amountInSats}`;
        
        console.log('🔗 LNURL URL:', lnurlUrl);
        
        // Encode as bech32 LNURL
        const lnurl = encodeLnurl(lnurlUrl);
        
        console.log('🔐 Encoded LNURL:', lnurl);

        setVoucher({
          ...data.voucher,
          lnurl: lnurl,
          displayAmount: numericAmount,
          displayCurrency: displayCurrency
        });

        console.log('✅ Voucher created:', {
          chargeId: data.voucher.id.substring(0, 8) + '...',
          amount: amountInSats,
          displayAmount: numericAmount,
          displayCurrency: displayCurrency,
          lnurlUrl: lnurlUrl,
          lnurl: lnurl.substring(0, 30) + '...'
        });
      } else {
        throw new Error('Invalid response from server');
      }
    } catch (err) {
      console.error('Voucher creation error:', err);
      setError(err.message || 'Failed to create voucher');
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  if (loading) {
    return (
      <div className="h-full flex flex-col bg-white dark:bg-black" style={{fontFamily: "'Source Sans Pro', sans-serif"}}>
        {/* Error Message Space */}
        <div className="mx-3 mt-1 min-h-[44px]"></div>

        {/* Amount Display */}
        <div className="px-4 pt-2 pb-2">
          <div className="text-center mb-4">
            <div className="text-6xl font-semibold text-purple-600 dark:text-purple-400 mb-1 min-h-[96px] flex items-center justify-center leading-none tracking-normal">
              {amount ? formatDisplayAmount(amount, displayCurrency) : formatDisplayAmount(0, displayCurrency)}
            </div>
          </div>
        </div>

        {/* Loading Animation */}
        <div className="flex-1 flex items-center justify-center">
          <div className="flex flex-col items-center bg-gray-50 dark:bg-blink-dark rounded-lg p-8 shadow-lg">
            <div className="animate-spin rounded-full h-16 w-16 border-4 border-purple-500 border-t-transparent mb-4"></div>
            <div className="text-xl font-semibold text-gray-800 dark:text-gray-100">
              Creating Voucher...
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Success screen when voucher is redeemed
  if (redeemed && voucher) {
    return (
      <div className="h-full flex flex-col bg-purple-600 dark:bg-purple-800 transition-colors duration-500" style={{fontFamily: "'Source Sans Pro', sans-serif"}}>
        {/* Success Animation - Full screen purple */}
        <div className="flex-1 flex flex-col items-center justify-center">
          {/* Animated Checkmark */}
          <div className="relative mb-8">
            <div className="w-32 h-32 rounded-full bg-white dark:bg-white flex items-center justify-center shadow-2xl animate-pulse">
              <svg 
                className="w-20 h-20 text-purple-600 dark:text-purple-700" 
                fill="none" 
                stroke="currentColor" 
                viewBox="0 0 24 24"
              >
                <path 
                  strokeLinecap="round" 
                  strokeLinejoin="round" 
                  strokeWidth="3" 
                  d="M5 13l4 4L19 7"
                  className="animate-[draw_0.5s_ease-out_forwards]"
                  style={{
                    strokeDasharray: 24,
                    strokeDashoffset: 0
                  }}
                />
              </svg>
            </div>
            {/* Animated rings */}
            <div className="absolute inset-0 w-32 h-32 rounded-full border-4 border-white opacity-50 animate-ping"></div>
          </div>
          
          {/* Success Text */}
          <div className="text-center text-white">
            <h2 className="text-3xl font-bold mb-2">Voucher Redeemed!</h2>
            <div className="text-2xl font-semibold mb-1">
              {voucher.displayCurrency && voucher.displayCurrency !== 'BTC' ? (
                <div>
                  <div>{formatDisplayAmount(voucher.displayAmount, voucher.displayCurrency)}</div>
                  <div className="text-lg opacity-80 mt-1">({voucher.amount} sats)</div>
                </div>
              ) : (
                <div>{voucher.amount} sats</div>
              )}
            </div>
            <p className="text-lg opacity-80 mt-4">Successfully sent to wallet</p>
          </div>
        </div>

        {/* Done Button */}
        <div className="px-4 pb-8 pt-6">
          <button
            onClick={handleClear}
            className="w-full h-14 bg-white dark:bg-white hover:bg-gray-100 dark:hover:bg-gray-100 text-purple-600 dark:text-purple-700 rounded-lg text-xl font-semibold transition-colors shadow-lg"
            style={{fontFamily: "'Source Sans Pro', sans-serif"}}
          >
            Done
          </button>
        </div>
      </div>
    );
  }

  if (voucher) {
    return (
      <div className="h-full flex flex-col bg-white dark:bg-black" style={{fontFamily: "'Source Sans Pro', sans-serif"}}>
        {/* Voucher Display - No duplicate header */}
        <div className="flex-1 flex flex-col">
          {/* Error Message Space - Same as POS */}
          <div className="mx-3 mt-1 min-h-[44px]"></div>

          {/* Amount - Fixed at top position - Same as POS */}
          <div className="px-4 pt-2 pb-2">
            <div className="text-center mb-4">
              <div className="text-center">
                <div className="text-6xl font-semibold text-purple-600 dark:text-purple-400 mb-1 min-h-[96px] flex items-center justify-center leading-none tracking-normal">
                  {voucher.displayCurrency && voucher.displayCurrency !== 'BTC' ? (
                    <div>
                      <div>{formatDisplayAmount(voucher.displayAmount, voucher.displayCurrency)}</div>
                      <div className="text-lg text-gray-600 dark:text-gray-400 mt-1">({voucher.amount} sats)</div>
                    </div>
                  ) : (
                    <div>{voucher.amount} sats</div>
                  )}
                </div>
                <div className="text-sm text-gray-600 dark:text-gray-400">
                  <div className="mb-1 min-h-[20px]">Scan to redeem</div>
                </div>
              </div>
            </div>
          </div>

          {/* QR Code and LNURL - Centered in remaining space - Same as POS */}
          <div className="flex-1 flex flex-col items-center justify-center space-y-4 px-6">
            {/* QR Code */}
            <div className="bg-white dark:bg-white p-4 rounded-lg shadow-lg border-2 border-gray-200 dark:border-gray-600">
              <QRCode 
                value={voucher.lnurl} 
                size={256}
                bgColor="#ffffff"
                fgColor="#000000"
              />
            </div>

            {/* LNURL */}
            <div className="w-full max-w-md">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                LNURL-withdraw
              </label>
              <div className="flex">
                <input
                  type="text"
                  value={voucher.lnurl}
                  readOnly
                  autoComplete="off"
                  data-1p-ignore
                  data-lpignore="true"
                  className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-l-md bg-gray-50 dark:bg-blink-dark text-sm font-mono text-black dark:text-gray-100"
                />
                <button
                  onClick={() => copyToClipboard(voucher.lnurl)}
                  className="px-4 py-2 bg-purple-500 dark:bg-purple-600 text-white rounded-r-md hover:bg-purple-600 dark:hover:bg-purple-700 transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                </button>
              </div>
            </div>
          </div>

          {/* Cancel Button - Bottom Left - Same as POS */}
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
      {/* Compact Amount Display - Match POS spacing */}
      <div className="px-4">
        <div className="text-center">
          <div className="text-center">
            <div className={`font-semibold text-purple-600 dark:text-purple-400 min-h-[72px] flex items-center justify-center leading-none tracking-normal max-w-full overflow-hidden px-2 ${
              getDynamicFontSize(formatDisplayAmount(amount || 0, displayCurrency))
            }`} style={{fontFamily: "'Source Sans Pro', sans-serif", wordBreak: 'keep-all', overflowWrap: 'normal'}}>
              <div className="max-w-full">
                {amount === '0' || amount === '0.' 
                  ? (displayCurrency === 'BTC' || getCurrencyById(displayCurrency, currencies)?.fractionDigits === 0 
                      ? '0' 
                      : getCurrencyById(displayCurrency, currencies)?.symbol + '0.')
                  : (amount ? formatDisplayAmount(amount, displayCurrency) : formatDisplayAmount(0, displayCurrency))
                }
              </div>
            </div>
          </div>
          <div className="text-sm text-gray-600 dark:text-gray-400">
            <div className="mb-1 min-h-[20px] max-w-full overflow-x-auto px-2">
              Enter voucher amount
            </div>
          </div>
          {error && (
            <div className="mt-2 bg-red-100 dark:bg-red-900 border border-red-400 dark:border-red-700 text-red-700 dark:text-red-200 px-3 py-2 rounded text-sm animate-pulse">
              {error}
            </div>
          )}
        </div>
      </div>

      {/* Numpad - Match POS layout exactly */}
      <div className="flex-1 px-4 pb-4 relative">
        {/* Spacer to align numpad with item list (below Search/Add Item row level) */}
        <div className="h-16 mb-2"></div>
        <div className="grid grid-cols-4 gap-3 max-w-sm mx-auto" data-1p-ignore data-lpignore="true">
          {/* Row 1: 1, 2, 3, (empty) */}
          <button
            onClick={() => handleDigitPress('1')}
            className="h-16 bg-white dark:bg-black border-2 border-purple-600 dark:border-purple-500 hover:border-purple-700 dark:hover:border-purple-400 hover:bg-purple-50 dark:hover:bg-purple-900 text-purple-600 dark:text-purple-400 hover:text-purple-700 dark:hover:text-purple-300 rounded-lg text-xl font-normal leading-none tracking-normal transition-colors shadow-md"
            style={{fontFamily: "'Source Sans Pro', sans-serif"}}
          >
            1
          </button>
          <button
            onClick={() => handleDigitPress('2')}
            className="h-16 bg-white dark:bg-black border-2 border-purple-600 dark:border-purple-500 hover:border-purple-700 dark:hover:border-purple-400 hover:bg-purple-50 dark:hover:bg-purple-900 text-purple-600 dark:text-purple-400 hover:text-purple-700 dark:hover:text-purple-300 rounded-lg text-xl font-normal leading-none tracking-normal transition-colors shadow-md"
            style={{fontFamily: "'Source Sans Pro', sans-serif"}}
          >
            2
          </button>
          <button
            onClick={() => handleDigitPress('3')}
            className="h-16 bg-white dark:bg-black border-2 border-purple-600 dark:border-purple-500 hover:border-purple-700 dark:hover:border-purple-400 hover:bg-purple-50 dark:hover:bg-purple-900 text-purple-600 dark:text-purple-400 hover:text-purple-700 dark:hover:text-purple-300 rounded-lg text-xl font-normal leading-none tracking-normal transition-colors shadow-md"
            style={{fontFamily: "'Source Sans Pro', sans-serif"}}
          >
            3
          </button>
          <div></div>

          {/* Row 2: 4, 5, 6, OK (starts) */}
          <button
            onClick={() => handleDigitPress('4')}
            className="h-16 bg-white dark:bg-black border-2 border-purple-600 dark:border-purple-500 hover:border-purple-700 dark:hover:border-purple-400 hover:bg-purple-50 dark:hover:bg-purple-900 text-purple-600 dark:text-purple-400 hover:text-purple-700 dark:hover:text-purple-300 rounded-lg text-xl font-normal leading-none tracking-normal transition-colors shadow-md"
            style={{fontFamily: "'Source Sans Pro', sans-serif"}}
          >
            4
          </button>
          <button
            onClick={() => handleDigitPress('5')}
            className="h-16 bg-white dark:bg-black border-2 border-purple-600 dark:border-purple-500 hover:border-purple-700 dark:hover:border-purple-400 hover:bg-purple-50 dark:hover:bg-purple-900 text-purple-600 dark:text-purple-400 hover:text-purple-700 dark:hover:text-purple-300 rounded-lg text-xl font-normal leading-none tracking-normal transition-colors shadow-md"
            style={{fontFamily: "'Source Sans Pro', sans-serif"}}
          >
            5
          </button>
          <button
            onClick={() => handleDigitPress('6')}
            className="h-16 bg-white dark:bg-black border-2 border-purple-600 dark:border-purple-500 hover:border-purple-700 dark:hover:border-purple-400 hover:bg-purple-50 dark:hover:bg-purple-900 text-purple-600 dark:text-purple-400 hover:text-purple-700 dark:hover:text-purple-300 rounded-lg text-xl font-normal leading-none tracking-normal transition-colors shadow-md"
            style={{fontFamily: "'Source Sans Pro', sans-serif"}}
          >
            6
          </button>
          <button
            onClick={createVoucher}
            disabled={!isValidAmount() || loading}
            className={`h-[136px] ${!isValidAmount() || loading ? 'bg-gray-200 dark:bg-blink-dark border-2 border-gray-400 dark:border-gray-600 text-gray-400 dark:text-gray-500' : 'bg-white dark:bg-black border-2 border-green-600 dark:border-green-500 hover:border-green-700 dark:hover:border-green-400 hover:bg-green-50 dark:hover:bg-green-900 text-green-600 dark:text-green-400 hover:text-green-700 dark:hover:text-green-300'} disabled:bg-gray-200 dark:disabled:bg-blink-dark disabled:border-gray-400 dark:disabled:border-gray-600 disabled:text-gray-400 dark:disabled:text-gray-500 rounded-lg text-lg font-normal leading-none tracking-normal transition-colors shadow-md flex items-center justify-center row-span-2`}
            style={{fontFamily: "'Source Sans Pro', sans-serif"}}
          >
            OK
          </button>

          {/* Row 3: 7, 8, 9, OK (continues) */}
          <button
            onClick={() => handleDigitPress('7')}
            className="h-16 bg-white dark:bg-black border-2 border-purple-600 dark:border-purple-500 hover:border-purple-700 dark:hover:border-purple-400 hover:bg-purple-50 dark:hover:bg-purple-900 text-purple-600 dark:text-purple-400 hover:text-purple-700 dark:hover:text-purple-300 rounded-lg text-xl font-normal leading-none tracking-normal transition-colors shadow-md"
            style={{fontFamily: "'Source Sans Pro', sans-serif"}}
          >
            7
          </button>
          <button
            onClick={() => handleDigitPress('8')}
            className="h-16 bg-white dark:bg-black border-2 border-purple-600 dark:border-purple-500 hover:border-purple-700 dark:hover:border-purple-400 hover:bg-purple-50 dark:hover:bg-purple-900 text-purple-600 dark:text-purple-400 hover:text-purple-700 dark:hover:text-purple-300 rounded-lg text-xl font-normal leading-none tracking-normal transition-colors shadow-md"
            style={{fontFamily: "'Source Sans Pro', sans-serif"}}
          >
            8
          </button>
          <button
            onClick={() => handleDigitPress('9')}
            className="h-16 bg-white dark:bg-black border-2 border-purple-600 dark:border-purple-500 hover:border-purple-700 dark:hover:border-purple-400 hover:bg-purple-50 dark:hover:bg-purple-900 text-purple-600 dark:text-purple-400 hover:text-purple-700 dark:hover:text-purple-300 rounded-lg text-xl font-normal leading-none tracking-normal transition-colors shadow-md"
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
            className="h-16 bg-white dark:bg-black border-2 border-purple-600 dark:border-purple-500 hover:border-purple-700 dark:hover:border-purple-400 hover:bg-purple-50 dark:hover:bg-purple-900 text-purple-600 dark:text-purple-400 hover:text-purple-700 dark:hover:text-purple-300 rounded-lg text-xl font-normal leading-none tracking-normal transition-colors shadow-md"
            style={{fontFamily: "'Source Sans Pro', sans-serif"}}
          >
            0
          </button>
          <button
            onClick={() => handleDigitPress('.')}
            disabled={displayCurrency === 'BTC' || (getCurrentCurrency()?.fractionDigits === 0)}
            className="h-16 bg-white dark:bg-black border-2 border-purple-600 dark:border-purple-500 hover:border-purple-700 dark:hover:border-purple-400 hover:bg-purple-50 dark:hover:bg-purple-900 text-purple-600 dark:text-purple-400 hover:text-purple-700 dark:hover:text-purple-300 disabled:bg-gray-200 dark:disabled:bg-blink-dark disabled:border-gray-400 dark:disabled:border-gray-600 disabled:text-gray-400 dark:disabled:text-gray-500 disabled:cursor-not-allowed rounded-lg text-xl font-normal leading-none tracking-normal transition-colors shadow-md"
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
    </div>
  );
};

export default Voucher;
