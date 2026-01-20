import { useState, useEffect, useRef, useCallback, forwardRef, useImperativeHandle } from 'react';
import QRCode from 'react-qr-code';
import { bech32 } from 'bech32';
import { formatDisplayAmount as formatCurrency, getCurrencyById } from '../lib/currency-utils';
import { DEFAULT_EXPIRY } from './ExpirySelector';

const Voucher = forwardRef(({ voucherWallet, displayCurrency, currencies, darkMode, toggleDarkMode, soundEnabled, onInternalTransition, onVoucherStateChange, commissionEnabled, commissionPresets = [1, 2, 3] }, ref) => {
  const [amount, setAmount] = useState('');
  const [voucher, setVoucher] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [exchangeRate, setExchangeRate] = useState(null);
  const [loadingRate, setLoadingRate] = useState(false);
  const [redeemed, setRedeemed] = useState(false);
  const [showPrintModal, setShowPrintModal] = useState(false);
  const [printFormat, setPrintFormat] = useState('a4');
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [companionAppInstalled, setCompanionAppInstalled] = useState(false);
  const [printing, setPrinting] = useState(false);
  // Commission selection state
  const [showCommissionDialog, setShowCommissionDialog] = useState(false);
  const [selectedCommissionPercent, setSelectedCommissionPercent] = useState(0);
  const [pendingCommissionSelection, setPendingCommissionSelection] = useState(null);
  const [commissionOptionIndex, setCommissionOptionIndex] = useState(0); // Keyboard navigation index
  // Expiry selection state
  const [selectedExpiry, setSelectedExpiry] = useState(DEFAULT_EXPIRY);
  const pollingIntervalRef = useRef(null);
  const successSoundRef = useRef(null);
  const qrRef = useRef(null);

  // Notify parent when voucher QR or commission dialog is showing (to hide header elements)
  useEffect(() => {
    if (onVoucherStateChange) {
      // Hide header when voucher QR is showing OR commission dialog is showing
      onVoucherStateChange((!!voucher && !redeemed) || showCommissionDialog);
    }
  }, [voucher, redeemed, showCommissionDialog, onVoucherStateChange]);

  // Check if POS companion app is installed
  useEffect(() => {
    const checkCompanionApp = async () => {
      try {
        if ('getInstalledRelatedApps' in navigator) {
          const apps = await navigator.getInstalledRelatedApps();
          const hasCompanion = apps.some(app => app.id === 'com.blink.pos.companion');
          setCompanionAppInstalled(hasCompanion);
          if (hasCompanion) {
            console.log('✅ POS companion app detected');
          }
        }
      } catch (error) {
        console.log('Could not check for companion app:', error.message);
      }
    };
    checkCompanionApp();
  }, []);

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

  // Handle commission selection and create voucher after state update
  useEffect(() => {
    if (pendingCommissionSelection !== null) {
      const newCommissionPercent = pendingCommissionSelection;
      
      // Trigger transition animation when confirming commission selection
      if (onInternalTransition) onInternalTransition();
      
      setSelectedCommissionPercent(newCommissionPercent);
      setShowCommissionDialog(false);
      setPendingCommissionSelection(null);
      
      // Create voucher with the specific commission percentage
      createVoucherWithCommission(newCommissionPercent);
    }
  }, [pendingCommissionSelection]);

  // Reset commission option index when dialog opens
  useEffect(() => {
    if (showCommissionDialog) {
      setCommissionOptionIndex(0);
    }
  }, [showCommissionDialog]);

  // Calculate commission amount
  const calculateCommissionAmount = (baseAmount, commissionPercent) => {
    return (commissionPercent / 100) * baseAmount;
  };

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
    // Reset commission state
    setSelectedCommissionPercent(0);
    setShowCommissionDialog(false);
    setPendingCommissionSelection(null);
    // Reset expiry to default
    setSelectedExpiry(DEFAULT_EXPIRY);
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

  // Create voucher with specific commission percentage (bypasses state timing issues)
  const createVoucherWithCommission = async (commissionPercent) => {
    return createVoucherInternal(true, commissionPercent);
  };

  const createVoucher = async () => {
    return createVoucherInternal(false, null);
  };

  // Expose numpad handlers for keyboard navigation
  useImperativeHandle(ref, () => ({
    handleDigitPress,
    handleBackspace,
    handleClear,
    handleSubmit: () => createVoucher(),
    hasVoucher: () => !!voucher,
    hasValidAmount: () => isValidAmount(),
    isRedeemed: () => redeemed,
    // Expiry state for external rendering
    getSelectedExpiry: () => selectedExpiry,
    setSelectedExpiry: (expiryId) => setSelectedExpiry(expiryId),
    // Commission dialog keyboard navigation
    isCommissionDialogOpen: () => showCommissionDialog,
    handleCommissionDialogKey: (key) => {
      if (!showCommissionDialog) return false;
      
      const presetCount = commissionPresets.length;
      const totalOptions = presetCount + 2;
      const cancelIndex = presetCount;
      const noCommissionIndex = presetCount + 1;
      
      // Build column indices for proper up/down navigation
      // Column 0: even preset indices + Cancel
      // Column 1: odd preset indices + No Commission
      const col0Indices = [];
      const col1Indices = [];
      for (let i = 0; i < presetCount; i++) {
        if (i % 2 === 0) col0Indices.push(i);
        else col1Indices.push(i);
      }
      col0Indices.push(cancelIndex);
      col1Indices.push(noCommissionIndex);
      
      // Determine which column current index is in
      const getColumn = (idx) => {
        if (col0Indices.includes(idx)) return 0;
        return 1;
      };
      
      if (key === 'ArrowRight') {
        setCommissionOptionIndex(prev => (prev + 1) % totalOptions);
        return true;
      } else if (key === 'ArrowLeft') {
        setCommissionOptionIndex(prev => (prev - 1 + totalOptions) % totalOptions);
        return true;
      } else if (key === 'ArrowDown') {
        setCommissionOptionIndex(prev => {
          const col = getColumn(prev);
          const colIndices = col === 0 ? col0Indices : col1Indices;
          const posInCol = colIndices.indexOf(prev);
          if (posInCol < colIndices.length - 1) {
            return colIndices[posInCol + 1];
          }
          return prev; // Already at bottom of column
        });
        return true;
      } else if (key === 'ArrowUp') {
        setCommissionOptionIndex(prev => {
          const col = getColumn(prev);
          const colIndices = col === 0 ? col0Indices : col1Indices;
          const posInCol = colIndices.indexOf(prev);
          if (posInCol > 0) {
            return colIndices[posInCol - 1];
          }
          return prev; // Already at top of column
        });
        return true;
      } else if (key === 'Enter') {
        if (commissionOptionIndex < commissionPresets.length) {
          setPendingCommissionSelection(commissionPresets[commissionOptionIndex]);
        } else if (commissionOptionIndex === totalOptions - 2) {
          if (onInternalTransition) onInternalTransition();
          setShowCommissionDialog(false);
        } else if (commissionOptionIndex === totalOptions - 1) {
          setPendingCommissionSelection(0);
        }
        return true;
      } else if (key === 'Escape') {
        if (onInternalTransition) onInternalTransition();
        setShowCommissionDialog(false);
        return true;
      }
      return false;
    },
  }));

  const createVoucherInternal = async (skipCommissionDialog = false, forceCommissionPercent = null) => {
    // Ensure skipCommissionDialog is a boolean
    const shouldSkipCommissionDialog = typeof skipCommissionDialog === 'boolean' ? skipCommissionDialog : false;
    
    // Use forced commission percent if provided, otherwise use state
    const effectiveCommissionPercent = forceCommissionPercent !== null ? forceCommissionPercent : selectedCommissionPercent;

    if (!isValidAmount()) {
      setError('Please enter a valid amount (minimum 1 sat)');
      return;
    }

    if (!voucherWallet || !voucherWallet.apiKey || !voucherWallet.walletId) {
      setError('Voucher wallet not configured');
      return;
    }

    // Show commission dialog if commission is enabled and we haven't skipped it
    if (commissionEnabled && commissionPresets && commissionPresets.length > 0 && !shouldSkipCommissionDialog && effectiveCommissionPercent === 0) {
      if (onInternalTransition) onInternalTransition();
      setShowCommissionDialog(true);
      return;
    }

    setLoading(true);
    setError('');

    try {
      const numericAmount = parseFloat(amount);
      
      // Calculate commission-adjusted amount
      // Commission is deducted from the voucher value
      // E.g., $100 voucher with 2% commission = voucher encodes $98 worth of sats
      const commissionAmount = effectiveCommissionPercent > 0 ? calculateCommissionAmount(numericAmount, effectiveCommissionPercent) : 0;
      const netAmount = numericAmount - commissionAmount;
      
      // Convert to sats if needed (use netAmount after commission deduction)
      let amountInSats;
      if (displayCurrency === 'BTC') {
        amountInSats = Math.round(netAmount);
      } else {
        if (!exchangeRate || !exchangeRate.satPriceInCurrency) {
          throw new Error(`Exchange rate not available for ${displayCurrency}`);
        }
        amountInSats = convertToSatoshis(netAmount, displayCurrency);
        
        if (amountInSats < 1) {
          throw new Error('Amount too small. Converts to less than 1 satoshi.');
        }
      }

      console.log('🔨 Creating voucher:', {
        displayAmount: numericAmount,
        displayCurrency: displayCurrency,
        commissionPercent: effectiveCommissionPercent,
        commissionAmount: commissionAmount,
        netAmount: netAmount,
        amountInSats: amountInSats,
        exchangeRate: exchangeRate,
        expiryId: selectedExpiry
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
          walletId: voucherWallet.walletId,
          expiryId: selectedExpiry,
          // Include commission info for memo and printout
          commissionPercent: effectiveCommissionPercent,
          displayAmount: numericAmount,
          displayCurrency: displayCurrency
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
          displayAmount: numericAmount, // Original entered amount (voucher price)
          displayCurrency: displayCurrency,
          commissionPercent: effectiveCommissionPercent,
          commissionAmount: commissionAmount,
          netAmount: netAmount, // Amount after commission deduction
          expiresAt: data.voucher.expiresAt // Include expiry for PDF
        });

        console.log('✅ Voucher created:', {
          chargeId: data.voucher.id.substring(0, 8) + '...',
          amount: amountInSats,
          displayAmount: numericAmount,
          displayCurrency: displayCurrency,
          commissionPercent: effectiveCommissionPercent,
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

  // Generate QR code as PNG data URL for PDF (PNG is better supported than SVG)
  const getQrDataUrl = () => {
    return new Promise((resolve, reject) => {
      if (!qrRef.current) {
        reject(new Error('QR ref not found'));
        return;
      }
      
      const svg = qrRef.current.querySelector('svg');
      if (!svg) {
        reject(new Error('SVG element not found'));
        return;
      }
      
      // Clone SVG and set dimensions
      const clonedSvg = svg.cloneNode(true);
      clonedSvg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
      
      // Get dimensions
      const width = 256;
      const height = 256;
      clonedSvg.setAttribute('width', width);
      clonedSvg.setAttribute('height', height);
      
      // Serialize SVG to string
      const svgData = new XMLSerializer().serializeToString(clonedSvg);
      const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
      const svgUrl = URL.createObjectURL(svgBlob);
      
      // Create image and canvas to convert to PNG
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        
        // Draw white background
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, width, height);
        
        // Draw SVG
        ctx.drawImage(img, 0, 0, width, height);
        
        // Get PNG data URL
        const pngDataUrl = canvas.toDataURL('image/png');
        URL.revokeObjectURL(svgUrl);
        
        console.log('✅ QR code converted to PNG, length:', pngDataUrl.length);
        resolve(pngDataUrl);
      };
      
      img.onerror = (err) => {
        URL.revokeObjectURL(svgUrl);
        reject(new Error('Failed to load SVG image'));
      };
      
      img.src = svgUrl;
    });
  };

  // Convert Blink logo SVG to PNG data URL (using black version for print)
  const getLogoDataUrl = () => {
    return new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        // Use wider canvas for the full "blink" logo with text
        const canvas = document.createElement('canvas');
        canvas.width = 300;
        canvas.height = 125;
        const ctx = canvas.getContext('2d');
        // White background for print
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, 300, 125);
        resolve(canvas.toDataURL('image/png'));
      };
      img.onerror = () => {
        console.warn('Could not load logo');
        resolve(null);
      };
      img.src = '/blink-logo-black.svg';
    });
  };

  // Generate a formatted voucher secret from the charge ID
  const generateVoucherSecret = (chargeId) => {
    if (!chargeId) return null;
    // Take first 12 characters and format as "xxxx xxxx xxxx"
    const cleaned = chargeId.replace(/-/g, '').substring(0, 12);
    return cleaned;
  };

  // Generate and download PDF
  const generatePdf = async () => {
    if (!voucher) return;
    
    setGeneratingPdf(true);
    setError('');
    
    try {
      console.log('📄 Starting PDF generation...');
      
      // Get QR code and logo as PNG data URLs
      const [qrDataUrl, logoDataUrl] = await Promise.all([
        getQrDataUrl(),
        getLogoDataUrl()
      ]);
      
      if (!qrDataUrl) {
        throw new Error('Could not capture QR code');
      }
      
      console.log('📷 QR captured, logo:', logoDataUrl ? 'yes' : 'no');
      
      // Build fiat amount string
      let fiatAmount = null;
      if (voucher.displayCurrency && voucher.displayCurrency !== 'BTC') {
        fiatAmount = formatDisplayAmount(voucher.displayAmount, voucher.displayCurrency);
      }
      
      // Generate voucher secret for display
      const voucherSecret = generateVoucherSecret(voucher.id);
      
      // Call PDF generation API
      const response = await fetch('/api/voucher/pdf', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          vouchers: [{
            satsAmount: voucher.amount,
            fiatAmount: fiatAmount,
            qrDataUrl: qrDataUrl,
            logoDataUrl: logoDataUrl,
            identifierCode: voucher.id?.substring(0, 8)?.toUpperCase() || null,
            voucherSecret: voucherSecret,
            commissionPercent: voucher.commissionPercent || 0,
            expiresAt: voucher.expiresAt || null,
            issuedBy: voucherWallet?.username || null
          }],
          format: printFormat
        }),
      });
      
      const data = await response.json();
      console.log('📦 API response:', { success: data.success, error: data.error, pdfLength: data.pdf?.length });
      
      if (!response.ok || !data.success) {
        throw new Error(data.error || data.message || 'Failed to generate PDF');
      }
      
      // Convert base64 to blob and download
      const byteCharacters = atob(data.pdf);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: 'application/pdf' });
      
      // Create download link
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `blink-voucher-${voucher.amount}sats.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      
      setShowPrintModal(false);
      console.log('✅ PDF downloaded successfully');
      
    } catch (err) {
      console.error('PDF generation error:', err);
      setError(err.message || 'Failed to generate PDF');
    } finally {
      setGeneratingPdf(false);
    }
  };

  // Print voucher using companion app (like Blink voucher app does)
  const printVoucher = () => {
    if (!voucher) return;
    
    // Build the display amounts
    let voucherPrice = '';
    if (voucher.displayCurrency && voucher.displayCurrency !== 'BTC') {
      voucherPrice = formatDisplayAmount(voucher.displayAmount, voucher.displayCurrency);
    }
    
    const voucherAmount = `${voucher.amount} sats`;
    const voucherSecret = voucher.id?.replace(/-/g, '').substring(0, 12) || '';
    const identifierCode = voucher.id?.substring(0, 8)?.toUpperCase() || '';
    const commissionPercent = voucher.commissionPercent || 0;
    
    // Build companion app deep link URL (same format as Blink voucher app)
    const deepLinkUrl = `blink-pos-companion://print?app=voucher&lnurl=${encodeURIComponent(voucher.lnurl)}&voucherPrice=${encodeURIComponent(voucherPrice)}&voucherAmount=${encodeURIComponent(voucherAmount)}&voucherSecret=${encodeURIComponent(voucherSecret)}&commissionPercentage=${encodeURIComponent(commissionPercent)}&identifierCode=${encodeURIComponent(identifierCode)}`;
    
    console.log('🖨️ Printing via companion app:', deepLinkUrl);
    
    // Use window.location.href to trigger the deep link (same as Blink voucher app)
    window.location.href = deepLinkUrl;
    
    setShowPrintModal(false);
  };
  
  // Browser print fallback (for desktop or when companion app is not available)
  const browserPrint = async () => {
    if (!voucher) return;
    
    setPrinting(true);
    setError('');
    
    try {
      // Build the display amounts
      let voucherPrice = '';
      if (voucher.displayCurrency && voucher.displayCurrency !== 'BTC') {
        voucherPrice = formatDisplayAmount(voucher.displayAmount, voucher.displayCurrency);
      }
      
      const voucherAmount = `${voucher.amount} sats`;
      const voucherSecret = voucher.id?.replace(/-/g, '').substring(0, 12) || '';
      const identifierCode = voucher.id?.substring(0, 8)?.toUpperCase() || '';
      const commissionPercent = voucher.commissionPercent || 0;
      const qrDataUrl = await getQrDataUrl();
      
      // Create a printable iframe (better than popup for some browsers)
      const printFrame = document.createElement('iframe');
      printFrame.style.position = 'fixed';
      printFrame.style.top = '-10000px';
      printFrame.style.left = '-10000px';
      printFrame.style.width = '0';
      printFrame.style.height = '0';
      document.body.appendChild(printFrame);
      
      const printDoc = printFrame.contentDocument || printFrame.contentWindow.document;
      printDoc.write(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Blink Voucher</title>
          <style>
            body { 
              font-family: Helvetica, Arial, sans-serif; 
              padding: 20px; 
              max-width: 300px; 
              margin: 0 auto;
              text-align: center;
            }
            .logo { max-width: 150px; margin-bottom: 15px; }
            .info { text-align: left; margin: 10px 0; font-size: 14px; }
            .info-row { display: flex; margin: 5px 0; }
            .info-label { width: 80px; }
            .info-value { font-weight: bold; }
            .qr { margin: 15px 0; }
            .qr img { max-width: 200px; }
            .dashed { border-top: 1px dashed #666; margin: 10px 0; }
            .secret { margin: 10px 0; padding: 10px; border-top: 1px dashed #666; border-bottom: 1px dashed #666; }
            .secret-label { font-size: 12px; color: #666; }
            .secret-code { font-size: 16px; font-weight: bold; letter-spacing: 2px; }
            .footer { margin-top: 15px; font-size: 12px; }
          </style>
        </head>
        <body>
          <img src="/blink-logo-black.svg" alt="Blink" class="logo">
          <div class="info">
            ${voucherPrice ? `<div class="info-row"><span class="info-label">Price:</span><span class="info-value">${voucherPrice}</span></div>` : ''}
            <div class="info-row"><span class="info-label">Value:</span><span class="info-value">${voucherAmount}</span></div>
            <div class="info-row"><span class="info-label">Identifier:</span><span class="info-value">${identifierCode}</span></div>
            ${commissionPercent > 0 ? `<div class="info-row"><span class="info-label">Commission:</span><span class="info-value">${commissionPercent}%</span></div>` : ''}
          </div>
          <div class="dashed"></div>
          <div class="qr">
            ${qrDataUrl ? `<img src="${qrDataUrl}" alt="QR Code">` : '<p>QR Code</p>'}
          </div>
          <div class="secret">
            <div class="secret-label">voucher secret</div>
            <div class="secret-code">${voucherSecret.match(/.{1,4}/g)?.join(' ') || voucherSecret}</div>
          </div>
          <div class="footer">blink.sv</div>
        </body>
        </html>
      `);
      printDoc.close();
      
      // Wait for content to load then print
      setTimeout(() => {
        printFrame.contentWindow.print();
        // Clean up after print dialog closes
        setTimeout(() => {
          document.body.removeChild(printFrame);
        }, 1000);
      }, 250);
      
      setShowPrintModal(false);
    } catch (err) {
      console.error('Print error:', err);
      setError(err.message || 'Failed to print');
    } finally {
      setPrinting(false);
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

  // Success screen when voucher is redeemed - Full screen overlay
  if (redeemed && voucher) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col bg-purple-600 dark:bg-purple-800 transition-colors duration-500" style={{fontFamily: "'Source Sans Pro', sans-serif"}}>
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
        <div className="px-6 pb-10 pt-6">
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
      <div className="h-full flex flex-col bg-white dark:bg-black overflow-hidden" style={{fontFamily: "'Source Sans Pro', sans-serif"}}>
        {/* Header - Match main header structure exactly */}
        <div className="bg-white dark:bg-blink-dark border-b border-gray-200 dark:border-gray-700 shadow-sm dark:shadow-black flex-shrink-0">
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
              
              {/* Print Icon - Center */}
              <div className="absolute left-1/2 transform -translate-x-1/2">
                <button
                  onClick={() => setShowPrintModal(true)}
                  className="flex items-center justify-center transition-all hover:scale-110"
                  aria-label="Print voucher"
                  title="Print voucher"
                >
                  <svg className="h-10 w-10 text-purple-600 dark:text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                  </svg>
                </button>
              </div>
              
              {/* Spacer for layout balance */}
              <div className="w-12"></div>
            </div>
          </div>
        </div>

        {/* Voucher Display - Scrollable content area */}
        <div className="flex-1 overflow-y-auto overscroll-contain flex flex-col">
          {/* Amount - Fixed at top position */}
          <div className="px-4 pt-4 pb-2">
            <div className="text-center">
              <div className="text-6xl font-semibold text-purple-600 dark:text-purple-400 mb-1 leading-none tracking-normal">
                {voucher.displayCurrency && voucher.displayCurrency !== 'BTC' ? (
                  <div>
                    <div>{formatDisplayAmount(voucher.displayAmount, voucher.displayCurrency)}</div>
                    <div className="text-lg text-gray-600 dark:text-gray-400 mt-1">({voucher.amount} sats)</div>
                  </div>
                ) : (
                  <div>{voucher.amount} sats</div>
                )}
              </div>
            </div>
          </div>

          {/* QR Code and LNURL - Centered */}
          <div className="flex-1 flex flex-col items-center justify-center space-y-4 px-6">
            {/* QR Code */}
            <div ref={qrRef} className="bg-white dark:bg-white p-4 rounded-lg shadow-lg border-2 border-gray-200 dark:border-gray-600">
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

          {/* Cancel Button - Bottom */}
          <div className="px-4 pb-4 pt-4">
            <button
              onClick={handleClear}
              className="w-full h-12 bg-white dark:bg-black border-2 border-red-600 dark:border-red-500 hover:border-red-700 dark:hover:border-red-400 hover:bg-red-50 dark:hover:bg-red-900 text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 rounded-lg text-lg font-normal transition-colors shadow-md"
              style={{fontFamily: "'Source Sans Pro', sans-serif"}}
            >
              Cancel
            </button>
          </div>
        </div>

        {/* Print Modal */}
        {showPrintModal && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
              <div className="bg-white dark:bg-gray-900 rounded-lg shadow-xl max-w-sm w-full p-6">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
                  Print Voucher
                </h3>
                
                {/* Format Selection */}
                <div className="mb-6">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                    Paper Format
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => setPrintFormat('a4')}
                      className={`p-3 rounded-lg border-2 transition-colors ${
                        printFormat === 'a4'
                          ? 'border-purple-500 bg-purple-50 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300'
                          : 'border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:border-gray-400'
                      }`}
                    >
                      <div className="font-medium">A4</div>
                      <div className="text-xs opacity-70">210×297mm</div>
                    </button>
                    <button
                      onClick={() => setPrintFormat('letter')}
                      className={`p-3 rounded-lg border-2 transition-colors ${
                        printFormat === 'letter'
                          ? 'border-purple-500 bg-purple-50 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300'
                          : 'border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:border-gray-400'
                      }`}
                    >
                      <div className="font-medium">Letter</div>
                      <div className="text-xs opacity-70">8.5×11 in</div>
                    </button>
                    <button
                      onClick={() => setPrintFormat('thermal-80')}
                      className={`p-3 rounded-lg border-2 transition-colors ${
                        printFormat === 'thermal-80'
                          ? 'border-purple-500 bg-purple-50 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300'
                          : 'border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:border-gray-400'
                      }`}
                    >
                      <div className="font-medium">Thermal 80mm</div>
                      <div className="text-xs opacity-70">Receipt printer</div>
                    </button>
                    <button
                      onClick={() => setPrintFormat('thermal-58')}
                      className={`p-3 rounded-lg border-2 transition-colors ${
                        printFormat === 'thermal-58'
                          ? 'border-purple-500 bg-purple-50 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300'
                          : 'border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:border-gray-400'
                      }`}
                    >
                      <div className="font-medium">Thermal 58mm</div>
                      <div className="text-xs opacity-70">Mini printer</div>
                    </button>
                  </div>
                </div>
                
                {/* Action Buttons */}
                <div className="flex flex-col gap-3">
                  {/* Thermal Print Button - For POS devices with companion app */}
                  <button
                    onClick={printVoucher}
                    className="w-full px-4 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors flex items-center justify-center gap-2"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                    </svg>
                    Print (Thermal)
                  </button>
                  
                  {/* Download PDF Button */}
                  <button
                    onClick={generatePdf}
                    disabled={generatingPdf}
                    className="w-full px-4 py-3 border-2 border-purple-600 text-purple-600 dark:text-purple-400 dark:border-purple-400 rounded-lg hover:bg-purple-50 dark:hover:bg-purple-900/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {generatingPdf ? (
                      <>
                        <div className="animate-spin w-4 h-4 border-2 border-purple-600 dark:border-purple-400 border-t-transparent rounded-full"></div>
                        Generating...
                      </>
                    ) : (
                      <>
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        Download PDF
                      </>
                    )}
                  </button>
                  
                  {/* Browser Print Button - Fallback for desktop */}
                  <button
                    onClick={browserPrint}
                    disabled={printing}
                    className="w-full px-4 py-2 text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {printing ? (
                      <>
                        <div className="animate-spin w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full"></div>
                        Preparing...
                      </>
                    ) : (
                      <>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                        </svg>
                        Browser Print
                      </>
                    )}
                  </button>
                  
                  {/* Cancel Button */}
                  <button
                    onClick={() => setShowPrintModal(false)}
                    className="w-full px-4 py-2 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          )}
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
              Single Voucher
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
        {/* Spacer for consistent layout */}
        <div className="h-16 mb-2"></div>
        <div className="grid grid-cols-4 gap-3 max-w-sm mx-auto" data-1p-ignore data-lpignore="true">
          {/* Row 1: 1, 2, 3, (empty) */}
          <button
            onClick={() => handleDigitPress('1')}
            className="h-16 bg-white dark:bg-black border-2 border-purple-400 dark:border-purple-400 hover:border-purple-500 dark:hover:border-purple-300 hover:bg-purple-50 dark:hover:bg-purple-900 text-purple-500 dark:text-purple-400 hover:text-purple-600 dark:hover:text-purple-300 rounded-lg text-xl font-normal leading-none tracking-normal transition-colors shadow-md"
            style={{fontFamily: "'Source Sans Pro', sans-serif"}}
          >
            1
          </button>
          <button
            onClick={() => handleDigitPress('2')}
            className="h-16 bg-white dark:bg-black border-2 border-purple-400 dark:border-purple-400 hover:border-purple-500 dark:hover:border-purple-300 hover:bg-purple-50 dark:hover:bg-purple-900 text-purple-500 dark:text-purple-400 hover:text-purple-600 dark:hover:text-purple-300 rounded-lg text-xl font-normal leading-none tracking-normal transition-colors shadow-md"
            style={{fontFamily: "'Source Sans Pro', sans-serif"}}
          >
            2
          </button>
          <button
            onClick={() => handleDigitPress('3')}
            className="h-16 bg-white dark:bg-black border-2 border-purple-400 dark:border-purple-400 hover:border-purple-500 dark:hover:border-purple-300 hover:bg-purple-50 dark:hover:bg-purple-900 text-purple-500 dark:text-purple-400 hover:text-purple-600 dark:hover:text-purple-300 rounded-lg text-xl font-normal leading-none tracking-normal transition-colors shadow-md"
            style={{fontFamily: "'Source Sans Pro', sans-serif"}}
          >
            3
          </button>
          <div></div>

          {/* Row 2: 4, 5, 6, OK (starts) */}
          <button
            onClick={() => handleDigitPress('4')}
            className="h-16 bg-white dark:bg-black border-2 border-purple-400 dark:border-purple-400 hover:border-purple-500 dark:hover:border-purple-300 hover:bg-purple-50 dark:hover:bg-purple-900 text-purple-500 dark:text-purple-400 hover:text-purple-600 dark:hover:text-purple-300 rounded-lg text-xl font-normal leading-none tracking-normal transition-colors shadow-md"
            style={{fontFamily: "'Source Sans Pro', sans-serif"}}
          >
            4
          </button>
          <button
            onClick={() => handleDigitPress('5')}
            className="h-16 bg-white dark:bg-black border-2 border-purple-400 dark:border-purple-400 hover:border-purple-500 dark:hover:border-purple-300 hover:bg-purple-50 dark:hover:bg-purple-900 text-purple-500 dark:text-purple-400 hover:text-purple-600 dark:hover:text-purple-300 rounded-lg text-xl font-normal leading-none tracking-normal transition-colors shadow-md"
            style={{fontFamily: "'Source Sans Pro', sans-serif"}}
          >
            5
          </button>
          <button
            onClick={() => handleDigitPress('6')}
            className="h-16 bg-white dark:bg-black border-2 border-purple-400 dark:border-purple-400 hover:border-purple-500 dark:hover:border-purple-300 hover:bg-purple-50 dark:hover:bg-purple-900 text-purple-500 dark:text-purple-400 hover:text-purple-600 dark:hover:text-purple-300 rounded-lg text-xl font-normal leading-none tracking-normal transition-colors shadow-md"
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
            className="h-16 bg-white dark:bg-black border-2 border-purple-400 dark:border-purple-400 hover:border-purple-500 dark:hover:border-purple-300 hover:bg-purple-50 dark:hover:bg-purple-900 text-purple-500 dark:text-purple-400 hover:text-purple-600 dark:hover:text-purple-300 rounded-lg text-xl font-normal leading-none tracking-normal transition-colors shadow-md"
            style={{fontFamily: "'Source Sans Pro', sans-serif"}}
          >
            7
          </button>
          <button
            onClick={() => handleDigitPress('8')}
            className="h-16 bg-white dark:bg-black border-2 border-purple-400 dark:border-purple-400 hover:border-purple-500 dark:hover:border-purple-300 hover:bg-purple-50 dark:hover:bg-purple-900 text-purple-500 dark:text-purple-400 hover:text-purple-600 dark:hover:text-purple-300 rounded-lg text-xl font-normal leading-none tracking-normal transition-colors shadow-md"
            style={{fontFamily: "'Source Sans Pro', sans-serif"}}
          >
            8
          </button>
          <button
            onClick={() => handleDigitPress('9')}
            className="h-16 bg-white dark:bg-black border-2 border-purple-400 dark:border-purple-400 hover:border-purple-500 dark:hover:border-purple-300 hover:bg-purple-50 dark:hover:bg-purple-900 text-purple-500 dark:text-purple-400 hover:text-purple-600 dark:hover:text-purple-300 rounded-lg text-xl font-normal leading-none tracking-normal transition-colors shadow-md"
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
            className="h-16 bg-white dark:bg-black border-2 border-purple-400 dark:border-purple-400 hover:border-purple-500 dark:hover:border-purple-300 hover:bg-purple-50 dark:hover:bg-purple-900 text-purple-500 dark:text-purple-400 hover:text-purple-600 dark:hover:text-purple-300 rounded-lg text-xl font-normal leading-none tracking-normal transition-colors shadow-md"
            style={{fontFamily: "'Source Sans Pro', sans-serif"}}
          >
            0
          </button>
          <button
            onClick={() => handleDigitPress('.')}
            disabled={displayCurrency === 'BTC' || (getCurrentCurrency()?.fractionDigits === 0)}
            className="h-16 bg-white dark:bg-black border-2 border-purple-400 dark:border-purple-400 hover:border-purple-500 dark:hover:border-purple-300 hover:bg-purple-50 dark:hover:bg-purple-900 text-purple-500 dark:text-purple-400 hover:text-purple-600 dark:hover:text-purple-300 disabled:bg-gray-200 dark:disabled:bg-blink-dark disabled:border-gray-400 dark:disabled:border-gray-600 disabled:text-gray-400 dark:disabled:text-gray-500 disabled:cursor-not-allowed rounded-lg text-xl font-normal leading-none tracking-normal transition-colors shadow-md"
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

        {/* Commission Selection Overlay (over numpad) */}
        {showCommissionDialog && (() => {
          const totalOptions = commissionPresets.length + 2;
          const cancelIndex = totalOptions - 2;
          const noCommissionIndex = totalOptions - 1;
          
          return (
          <div className="absolute inset-0 bg-white dark:bg-black z-30 pt-24">
            <div className="grid grid-cols-4 gap-3 max-w-sm mx-auto" style={{fontFamily: "'Source Sans Pro', sans-serif"}}>
              <h3 className="col-span-4 text-xl font-bold mb-2 text-center text-gray-800 dark:text-white">Commission Options</h3>
              
              {/* Commission preset buttons in grid - render all presets */}
              {commissionPresets.map((percent, index) => (
                <button
                  key={percent}
                  onClick={() => {
                    setPendingCommissionSelection(percent);
                  }}
                  className={`col-span-2 h-16 bg-white dark:bg-black border-2 rounded-lg text-lg font-normal transition-colors shadow-md ${
                    commissionOptionIndex === index 
                      ? 'border-purple-400 ring-2 ring-purple-400 bg-purple-50 dark:bg-purple-900 text-purple-700 dark:text-purple-300' 
                      : 'border-purple-500 hover:border-purple-400 hover:bg-purple-50 dark:hover:bg-purple-900 text-purple-600 dark:text-purple-400 hover:text-purple-700 dark:hover:text-purple-300'
                  }`}
                >
                  {percent}%
                  <div className="text-sm">
                    -{formatDisplayAmount(calculateCommissionAmount(parseFloat(amount) || 0, percent), displayCurrency)}
                  </div>
                </button>
              ))}
              
              {/* Empty placeholder after odd number of presets to complete the row */}
              {commissionPresets.length % 2 === 1 && (
                <div className="col-span-2"></div>
              )}
              
              {/* Cancel and No Commission buttons - always on the same row */}
              <button
                onClick={() => {
                  if (onInternalTransition) onInternalTransition();
                  setShowCommissionDialog(false);
                }}
                className={`col-span-2 h-16 bg-white dark:bg-black border-2 rounded-lg text-lg font-normal transition-colors shadow-md ${
                  commissionOptionIndex === cancelIndex 
                    ? 'border-red-400 ring-2 ring-red-400 bg-red-50 dark:bg-red-900 text-red-700 dark:text-red-300' 
                    : 'border-red-500 hover:border-red-600 hover:bg-red-50 dark:hover:bg-red-900 text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300'
                }`}
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setPendingCommissionSelection(0);
                }}
                className={`col-span-2 h-16 bg-white dark:bg-black border-2 rounded-lg text-lg font-normal transition-colors shadow-md ${
                  commissionOptionIndex === noCommissionIndex 
                    ? 'border-yellow-400 ring-2 ring-yellow-400 bg-yellow-50 dark:bg-yellow-900 text-yellow-700 dark:text-yellow-300' 
                    : 'border-yellow-500 dark:border-yellow-400 hover:border-yellow-600 dark:hover:border-yellow-300 hover:bg-yellow-50 dark:hover:bg-yellow-900 text-yellow-600 dark:text-yellow-400 hover:text-yellow-700 dark:hover:text-yellow-300'
                }`}
              >
                No Commission
              </button>
            </div>
          </div>
          );
        })()}
      </div>
    </div>
  );
});

Voucher.displayName = 'Voucher';
export default Voucher;
