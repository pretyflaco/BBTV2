import { useState, useEffect, useRef, useCallback, forwardRef, useImperativeHandle } from 'react';
import QRCode from 'react-qr-code';
import { bech32 } from 'bech32';
import { formatDisplayAmount as formatCurrency, getCurrencyById } from '../lib/currency-utils';

// Grid configuration options
const GRID_OPTIONS = [
  { id: '2x2', label: '2x2', perPage: 4, description: '4 per page' },
  { id: '2x3', label: '2x3', perPage: 6, description: '6 per page' },
  { id: '3x3', label: '3x3', perPage: 9, description: '9 per page' },
  { id: '3x4', label: '3x4', perPage: 12, description: '12 per page' },
];

const MultiVoucher = forwardRef(({ 
  voucherWallet, 
  displayCurrency, 
  currencies, 
  darkMode, 
  toggleDarkMode, 
  soundEnabled, 
  onInternalTransition,
  commissionEnabled,
  commissionPresets = [1, 2, 3]
}, ref) => {
  // Amount input state
  const [amount, setAmount] = useState('');
  const [exchangeRate, setExchangeRate] = useState(null);
  const [loadingRate, setLoadingRate] = useState(false);
  const [error, setError] = useState('');
  
  // Multi-voucher configuration
  const [quantity, setQuantity] = useState(4);
  const [gridSize, setGridSize] = useState('2x2');
  const [selectedCommissionPercent, setSelectedCommissionPercent] = useState(0);
  
  // Generation state
  const [generating, setGenerating] = useState(false);
  const [generatedVouchers, setGeneratedVouchers] = useState([]);
  const [showPreview, setShowPreview] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  
  // UI state
  const [currentStep, setCurrentStep] = useState('amount'); // 'amount', 'config', 'generating', 'preview'
  const [showCommissionDialog, setShowCommissionDialog] = useState(false);
  const [commissionOptionIndex, setCommissionOptionIndex] = useState(0);
  const [pendingCommissionSelection, setPendingCommissionSelection] = useState(null);
  
  const qrRefs = useRef([]);

  // Fetch exchange rate when currency changes
  useEffect(() => {
    if (displayCurrency !== 'BTC') {
      fetchExchangeRate();
    } else {
      setExchangeRate({ satPriceInCurrency: 1, currency: 'BTC' });
    }
  }, [displayCurrency]);

  // Handle commission selection
  useEffect(() => {
    if (pendingCommissionSelection !== null) {
      const newCommissionPercent = pendingCommissionSelection;
      if (onInternalTransition) onInternalTransition();
      setSelectedCommissionPercent(newCommissionPercent);
      setShowCommissionDialog(false);
      setPendingCommissionSelection(null);
      // Move to config step after commission selection
      setCurrentStep('config');
    }
  }, [pendingCommissionSelection, onInternalTransition]);

  // Reset commission option index when dialog opens
  useEffect(() => {
    if (showCommissionDialog) {
      setCommissionOptionIndex(0);
    }
  }, [showCommissionDialog]);

  const fetchExchangeRate = async () => {
    if (displayCurrency === 'BTC') return;
    
    setLoadingRate(true);
    try {
      const response = await fetch('/api/blink/exchange-rate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currency: displayCurrency,
          useBlinkpos: true
        }),
      });
      
      const data = await response.json();
      
      if (data.success) {
        setExchangeRate({
          satPriceInCurrency: data.satPriceInCurrency,
          currency: data.currency
        });
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

  // Format display amount
  const formatDisplayAmount = (value, currency) => {
    return formatCurrency(value, currency, currencies);
  };

  // Get current currency metadata
  const getCurrentCurrency = () => {
    return getCurrencyById(displayCurrency, currencies);
  };

  // Helper function to get dynamic font size
  const getDynamicFontSize = (displayText) => {
    const numericOnly = String(displayText).replace(/[^0-9.]/g, '');
    const length = numericOnly.length;
    
    if (length <= 6) return 'text-5xl';
    if (length <= 9) return 'text-4xl';
    if (length <= 11) return 'text-3xl';
    if (length <= 13) return 'text-2xl';
    return 'text-xl';
  };

  // Calculate commission amount
  const calculateCommissionAmount = (baseAmount, commissionPercent) => {
    return (commissionPercent / 100) * baseAmount;
  };

  // Convert display currency amount to satoshis
  const convertToSatoshis = (amount, currency) => {
    if (currency === 'BTC') {
      return Math.round(amount);
    }

    if (!exchangeRate || !exchangeRate.satPriceInCurrency) {
      throw new Error(`Exchange rate not available for ${currency}`);
    }

    const amountInMinorUnits = amount * 100;
    const satsAmount = Math.round(amountInMinorUnits / exchangeRate.satPriceInCurrency);
    
    return satsAmount;
  };

  const handleDigitPress = (digit) => {
    playKeystrokeSound();
    
    const MAX_SATS = 2100000000000000;
    
    if (digit !== '.') {
      const newAmount = amount + digit;
      const numericValue = parseFloat(newAmount.replace(/[^0-9.]/g, ''));
      
      if (displayCurrency === 'BTC' && numericValue > MAX_SATS) {
        return;
      }
      
      const currentNumericDigits = amount.replace(/[^0-9]/g, '').length;
      if (currentNumericDigits >= 16) {
        return;
      }
    }
    
    if (amount === '' && digit === '0') {
      if (displayCurrency === 'BTC') {
        setAmount('0');
      } else {
        setAmount('0.');
      }
      return;
    }
    
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
      return;
    } else if (digit === '.') {
      const currency = getCurrentCurrency();
      if (displayCurrency === 'BTC' || currency?.fractionDigits === 0) {
        return;
      }
      setAmount(amount + digit);
    } else if (amount.includes('.')) {
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
    
    if (onInternalTransition && (currentStep !== 'amount' || generatedVouchers.length > 0)) {
      onInternalTransition();
    }
    
    setAmount('');
    setError('');
    setCurrentStep('amount');
    setGeneratedVouchers([]);
    setShowPreview(false);
    setSelectedCommissionPercent(0);
    setShowCommissionDialog(false);
  };

  const isValidAmount = () => {
    if (!amount || amount === '' || amount === '0') {
      return false;
    }

    const numValue = parseFloat(amount);
    if (isNaN(numValue) || numValue <= 0) {
      return false;
    }

    if (displayCurrency === 'BTC') {
      return numValue >= 1;
    }

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
      const bytes = new TextEncoder().encode(url);
      const words = bech32.toWords(bytes);
      const encoded = bech32.encode('lnurl', words, 2000);
      return encoded.toUpperCase();
    } catch (error) {
      console.error('Failed to encode LNURL:', error);
      throw error;
    }
  };

  // Handle OK button press - either show commission dialog or go to config
  const handleOkPress = () => {
    if (!isValidAmount()) {
      setError('Please enter a valid amount (minimum 1 sat)');
      return;
    }

    if (commissionEnabled && commissionPresets && commissionPresets.length > 0) {
      if (onInternalTransition) onInternalTransition();
      setShowCommissionDialog(true);
    } else {
      if (onInternalTransition) onInternalTransition();
      setCurrentStep('config');
    }
  };

  // Generate multiple vouchers
  const generateVouchers = async () => {
    if (!isValidAmount()) {
      setError('Please enter a valid amount');
      return;
    }

    if (!voucherWallet || !voucherWallet.apiKey || !voucherWallet.walletId) {
      setError('Voucher wallet not configured');
      return;
    }

    setGenerating(true);
    setCurrentStep('generating');
    setError('');
    setGeneratedVouchers([]);

    try {
      const numericAmount = parseFloat(amount);
      const commissionAmount = selectedCommissionPercent > 0 
        ? calculateCommissionAmount(numericAmount, selectedCommissionPercent) 
        : 0;
      const netAmount = numericAmount - commissionAmount;
      
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

      console.log(`Creating ${quantity} vouchers of ${amountInSats} sats each...`);

      const vouchers = [];
      
      for (let i = 0; i < quantity; i++) {
        const response = await fetch('/api/voucher/create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            amount: amountInSats,
            apiKey: voucherWallet.apiKey,
            walletId: voucherWallet.walletId,
            commissionPercent: selectedCommissionPercent,
            displayAmount: numericAmount,
            displayCurrency: displayCurrency
          }),
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || `Failed to create voucher ${i + 1}`);
        }

        if (data.success && data.voucher) {
          const protocol = window.location.protocol;
          const host = window.location.host;
          const lnurlUrl = `${protocol}//${host}/api/voucher/lnurl/${data.voucher.id}/${amountInSats}`;
          const lnurl = encodeLnurl(lnurlUrl);

          vouchers.push({
            ...data.voucher,
            lnurl: lnurl,
            displayAmount: numericAmount,
            displayCurrency: displayCurrency,
            commissionPercent: selectedCommissionPercent,
            commissionAmount: commissionAmount,
            netAmount: netAmount,
            index: i + 1
          });
        }
      }

      setGeneratedVouchers(vouchers);
      setCurrentStep('preview');
      console.log(`Successfully created ${vouchers.length} vouchers`);

    } catch (err) {
      console.error('Voucher generation error:', err);
      setError(err.message || 'Failed to create vouchers');
      setCurrentStep('config');
    } finally {
      setGenerating(false);
    }
  };

  // Get QR code as data URL
  const getQrDataUrl = (qrElement) => {
    return new Promise((resolve, reject) => {
      if (!qrElement) {
        reject(new Error('QR element not found'));
        return;
      }
      
      const svg = qrElement.querySelector('svg');
      if (!svg) {
        reject(new Error('SVG element not found'));
        return;
      }
      
      const clonedSvg = svg.cloneNode(true);
      clonedSvg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
      
      const width = 256;
      const height = 256;
      clonedSvg.setAttribute('width', width);
      clonedSvg.setAttribute('height', height);
      
      const svgData = new XMLSerializer().serializeToString(clonedSvg);
      const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
      const svgUrl = URL.createObjectURL(svgBlob);
      
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);
        
        const pngDataUrl = canvas.toDataURL('image/png');
        URL.revokeObjectURL(svgUrl);
        resolve(pngDataUrl);
      };
      
      img.onerror = () => {
        URL.revokeObjectURL(svgUrl);
        reject(new Error('Failed to load SVG image'));
      };
      
      img.src = svgUrl;
    });
  };

  // Get logo data URL
  const getLogoDataUrl = () => {
    return new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = 300;
        canvas.height = 125;
        const ctx = canvas.getContext('2d');
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

  // Generate voucher secret from charge ID
  const generateVoucherSecret = (chargeId) => {
    if (!chargeId) return null;
    return chargeId.replace(/-/g, '').substring(0, 12);
  };

  // Download PDF with all vouchers
  const downloadPdf = async () => {
    if (generatedVouchers.length === 0) return;
    
    setDownloadingPdf(true);
    setError('');
    
    try {
      // Get logo
      const logoDataUrl = await getLogoDataUrl();
      
      // Get QR codes for all vouchers
      const voucherData = await Promise.all(
        generatedVouchers.map(async (voucher, index) => {
          const qrElement = qrRefs.current[index];
          const qrDataUrl = qrElement ? await getQrDataUrl(qrElement) : null;
          
          let fiatAmount = null;
          if (voucher.displayCurrency && voucher.displayCurrency !== 'BTC') {
            fiatAmount = formatDisplayAmount(voucher.displayAmount, voucher.displayCurrency);
          }
          
          return {
            satsAmount: voucher.amount,
            fiatAmount: fiatAmount,
            qrDataUrl: qrDataUrl,
            logoDataUrl: logoDataUrl,
            identifierCode: voucher.id?.substring(0, 8)?.toUpperCase() || null,
            voucherSecret: generateVoucherSecret(voucher.id),
            commissionPercent: voucher.commissionPercent || 0
          };
        })
      );
      
      // Call PDF API with grid size
      const response = await fetch('/api/voucher/pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vouchers: voucherData,
          format: 'a4',
          gridSize: gridSize
        }),
      });
      
      const data = await response.json();
      
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
      
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `blink-vouchers-${quantity}x-${generatedVouchers[0]?.amount}sats.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      
      console.log('PDF downloaded successfully');
      
    } catch (err) {
      console.error('PDF generation error:', err);
      setError(err.message || 'Failed to generate PDF');
    } finally {
      setDownloadingPdf(false);
    }
  };

  // Expose handlers for keyboard navigation
  useImperativeHandle(ref, () => ({
    handleDigitPress,
    handleBackspace,
    handleClear,
    handleSubmit: () => {
      if (currentStep === 'amount') {
        handleOkPress();
      } else if (currentStep === 'config') {
        generateVouchers();
      } else if (currentStep === 'preview') {
        downloadPdf();
      }
    },
    hasValidAmount: () => isValidAmount(),
    getCurrentStep: () => currentStep,
    isCommissionDialogOpen: () => showCommissionDialog,
    handleCommissionDialogKey: (key) => {
      if (!showCommissionDialog) return false;
      
      const presetCount = commissionPresets.length;
      const totalOptions = presetCount + 2;
      const cancelIndex = presetCount;
      const noCommissionIndex = presetCount + 1;
      
      if (key === 'ArrowRight') {
        setCommissionOptionIndex(prev => (prev + 1) % totalOptions);
        return true;
      } else if (key === 'ArrowLeft') {
        setCommissionOptionIndex(prev => (prev - 1 + totalOptions) % totalOptions);
        return true;
      } else if (key === 'Enter') {
        if (commissionOptionIndex < commissionPresets.length) {
          setPendingCommissionSelection(commissionPresets[commissionOptionIndex]);
        } else if (commissionOptionIndex === cancelIndex) {
          if (onInternalTransition) onInternalTransition();
          setShowCommissionDialog(false);
        } else if (commissionOptionIndex === noCommissionIndex) {
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

  // Render amount input step
  const renderAmountStep = () => (
    <div className="h-full flex flex-col bg-white dark:bg-black relative" style={{fontFamily: "'Source Sans Pro', sans-serif"}}>
      {/* Amount Display */}
      <div className="px-4">
        <div className="text-center">
          <div className={`font-semibold text-purple-600 dark:text-purple-400 min-h-[72px] flex items-center justify-center leading-none tracking-normal max-w-full overflow-hidden px-2 ${
            getDynamicFontSize(formatDisplayAmount(amount || 0, displayCurrency))
          }`}>
            <div className="max-w-full">
              {amount === '0' || amount === '0.' 
                ? (displayCurrency === 'BTC' || getCurrentCurrency()?.fractionDigits === 0 
                    ? '0' 
                    : getCurrentCurrency()?.symbol + '0.')
                : (amount ? formatDisplayAmount(amount, displayCurrency) : formatDisplayAmount(0, displayCurrency))
              }
            </div>
          </div>
          <div className="text-sm text-gray-600 dark:text-gray-400">
            <div className="mb-1 min-h-[20px]">
              Multi-Voucher
            </div>
          </div>
          {error && (
            <div className="mt-2 bg-red-100 dark:bg-red-900 border border-red-400 dark:border-red-700 text-red-700 dark:text-red-200 px-3 py-2 rounded text-sm animate-pulse">
              {error}
            </div>
          )}
        </div>
      </div>

      {/* Numpad */}
      <div className="flex-1 px-4 pb-4 relative">
        <div className="h-16 mb-2"></div>
        <div className="grid grid-cols-4 gap-3 max-w-sm mx-auto">
          {/* Row 1: 1, 2, 3 */}
          {['1', '2', '3'].map(digit => (
            <button
              key={digit}
              onClick={() => handleDigitPress(digit)}
              className="h-16 bg-white dark:bg-black border-2 border-purple-600 dark:border-purple-500 hover:border-purple-700 dark:hover:border-purple-400 hover:bg-purple-50 dark:hover:bg-purple-900 text-purple-600 dark:text-purple-400 rounded-lg text-xl font-normal transition-colors shadow-md"
            >
              {digit}
            </button>
          ))}
          <div></div>

          {/* Row 2: 4, 5, 6, OK */}
          {['4', '5', '6'].map(digit => (
            <button
              key={digit}
              onClick={() => handleDigitPress(digit)}
              className="h-16 bg-white dark:bg-black border-2 border-purple-600 dark:border-purple-500 hover:border-purple-700 dark:hover:border-purple-400 hover:bg-purple-50 dark:hover:bg-purple-900 text-purple-600 dark:text-purple-400 rounded-lg text-xl font-normal transition-colors shadow-md"
            >
              {digit}
            </button>
          ))}
          <button
            onClick={handleOkPress}
            disabled={!isValidAmount()}
            className={`h-[136px] ${!isValidAmount() ? 'bg-gray-200 dark:bg-blink-dark border-2 border-gray-400 dark:border-gray-600 text-gray-400 dark:text-gray-500' : 'bg-white dark:bg-black border-2 border-green-600 dark:border-green-500 hover:border-green-700 dark:hover:border-green-400 hover:bg-green-50 dark:hover:bg-green-900 text-green-600 dark:text-green-400'} rounded-lg text-lg font-normal transition-colors shadow-md flex items-center justify-center row-span-2`}
          >
            OK
          </button>

          {/* Row 3: 7, 8, 9 */}
          {['7', '8', '9'].map(digit => (
            <button
              key={digit}
              onClick={() => handleDigitPress(digit)}
              className="h-16 bg-white dark:bg-black border-2 border-purple-600 dark:border-purple-500 hover:border-purple-700 dark:hover:border-purple-400 hover:bg-purple-50 dark:hover:bg-purple-900 text-purple-600 dark:text-purple-400 rounded-lg text-xl font-normal transition-colors shadow-md"
            >
              {digit}
            </button>
          ))}

          {/* Row 4: C, 0, ., Backspace */}
          <button
            onClick={handleClear}
            className="h-16 bg-white dark:bg-black border-2 border-red-600 dark:border-red-500 hover:border-red-700 dark:hover:border-red-400 hover:bg-red-50 dark:hover:bg-red-900 text-red-600 dark:text-red-400 rounded-lg text-lg font-normal transition-colors shadow-md"
          >
            C
          </button>
          <button
            onClick={() => handleDigitPress('0')}
            className="h-16 bg-white dark:bg-black border-2 border-purple-600 dark:border-purple-500 hover:border-purple-700 dark:hover:border-purple-400 hover:bg-purple-50 dark:hover:bg-purple-900 text-purple-600 dark:text-purple-400 rounded-lg text-xl font-normal transition-colors shadow-md"
          >
            0
          </button>
          <button
            onClick={() => handleDigitPress('.')}
            disabled={displayCurrency === 'BTC' || getCurrentCurrency()?.fractionDigits === 0}
            className="h-16 bg-white dark:bg-black border-2 border-purple-600 dark:border-purple-500 hover:border-purple-700 dark:hover:border-purple-400 hover:bg-purple-50 dark:hover:bg-purple-900 text-purple-600 dark:text-purple-400 disabled:bg-gray-200 dark:disabled:bg-blink-dark disabled:border-gray-400 dark:disabled:border-gray-600 disabled:text-gray-400 rounded-lg text-xl font-normal transition-colors shadow-md"
          >
            .
          </button>
          <button
            onClick={handleBackspace}
            className="h-16 bg-white dark:bg-black border-2 border-orange-500 dark:border-orange-500 hover:border-orange-600 dark:hover:border-orange-400 hover:bg-orange-50 dark:hover:bg-orange-900 text-orange-500 dark:text-orange-400 rounded-lg text-lg font-normal transition-colors flex items-center justify-center shadow-md"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2M3 12l6.414 6.414a2 2 0 001.414.586H19a2 2 0 002-2V7a2 2 0 00-2-2h-8.172a2 2 0 00-1.414.586L3 12z" />
            </svg>
          </button>
        </div>

        {/* Commission Selection Overlay */}
        {showCommissionDialog && (() => {
          const totalOptions = commissionPresets.length + 2;
          const cancelIndex = totalOptions - 2;
          const noCommissionIndex = totalOptions - 1;
          
          return (
            <div className="absolute inset-0 bg-white dark:bg-black z-30 pt-24">
              <div className="grid grid-cols-4 gap-3 max-w-sm mx-auto">
                <h3 className="col-span-4 text-xl font-bold mb-2 text-center text-gray-800 dark:text-white">Commission Options</h3>
                
                {commissionPresets.map((percent, index) => (
                  <button
                    key={percent}
                    onClick={() => setPendingCommissionSelection(percent)}
                    className={`col-span-2 h-16 bg-white dark:bg-black border-2 rounded-lg text-lg font-normal transition-colors shadow-md ${
                      commissionOptionIndex === index 
                        ? 'border-purple-400 ring-2 ring-purple-400 bg-purple-50 dark:bg-purple-900 text-purple-700 dark:text-purple-300' 
                        : 'border-purple-500 hover:border-purple-400 hover:bg-purple-50 dark:hover:bg-purple-900 text-purple-600 dark:text-purple-400'
                    }`}
                  >
                    {percent}%
                    <div className="text-sm">
                      -{formatDisplayAmount(calculateCommissionAmount(parseFloat(amount) || 0, percent), displayCurrency)}
                    </div>
                  </button>
                ))}
                
                {commissionPresets.length % 2 === 1 && <div className="col-span-2"></div>}
                
                <button
                  onClick={() => {
                    if (onInternalTransition) onInternalTransition();
                    setShowCommissionDialog(false);
                  }}
                  className={`col-span-2 h-16 bg-white dark:bg-black border-2 rounded-lg text-lg font-normal transition-colors shadow-md ${
                    commissionOptionIndex === cancelIndex 
                      ? 'border-red-400 ring-2 ring-red-400 bg-red-50 dark:bg-red-900 text-red-700 dark:text-red-300' 
                      : 'border-red-500 hover:border-red-600 hover:bg-red-50 dark:hover:bg-red-900 text-red-600 dark:text-red-400'
                  }`}
                >
                  Cancel
                </button>
                <button
                  onClick={() => setPendingCommissionSelection(0)}
                  className={`col-span-2 h-16 bg-white dark:bg-black border-2 rounded-lg text-lg font-normal transition-colors shadow-md ${
                    commissionOptionIndex === noCommissionIndex 
                      ? 'border-yellow-400 ring-2 ring-yellow-400 bg-yellow-50 dark:bg-yellow-900 text-yellow-700 dark:text-yellow-300' 
                      : 'border-yellow-500 dark:border-yellow-400 hover:border-yellow-600 dark:hover:border-yellow-300 hover:bg-yellow-50 dark:hover:bg-yellow-900 text-yellow-600 dark:text-yellow-400'
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

  // Render configuration step
  const renderConfigStep = () => (
    <div className="h-full flex flex-col bg-white dark:bg-black" style={{fontFamily: "'Source Sans Pro', sans-serif"}}>
      {/* Header */}
      <div className="px-4 pt-4 pb-2">
        <div className="text-center">
          <div className="text-3xl font-semibold text-purple-600 dark:text-purple-400 mb-2">
            {formatDisplayAmount(amount, displayCurrency)}
            {selectedCommissionPercent > 0 && (
              <span className="text-lg text-gray-500 dark:text-gray-400 ml-2">
                ({selectedCommissionPercent}% commission)
              </span>
            )}
          </div>
          <div className="text-sm text-gray-600 dark:text-gray-400">
            Configure your voucher batch
          </div>
        </div>
      </div>

      {/* Configuration Options */}
      <div className="flex-1 px-4 py-4 overflow-y-auto">
        {/* Quantity Selector */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
            Number of Vouchers
          </label>
          <div className="flex items-center justify-center gap-4">
            <button
              onClick={() => setQuantity(Math.max(1, quantity - 1))}
              className="w-12 h-12 bg-white dark:bg-black border-2 border-purple-500 dark:border-purple-400 text-purple-600 dark:text-purple-400 rounded-lg text-2xl font-bold hover:bg-purple-50 dark:hover:bg-purple-900 transition-colors"
            >
              -
            </button>
            <div className="w-20 text-center">
              <span className="text-4xl font-bold text-purple-600 dark:text-purple-400">{quantity}</span>
            </div>
            <button
              onClick={() => setQuantity(Math.min(24, quantity + 1))}
              className="w-12 h-12 bg-white dark:bg-black border-2 border-purple-500 dark:border-purple-400 text-purple-600 dark:text-purple-400 rounded-lg text-2xl font-bold hover:bg-purple-50 dark:hover:bg-purple-900 transition-colors"
            >
              +
            </button>
          </div>
          <div className="text-center mt-2 text-sm text-gray-500 dark:text-gray-400">
            Total: {formatDisplayAmount(parseFloat(amount) * quantity, displayCurrency)}
          </div>
        </div>

        {/* Grid Size Selector */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
            Grid Layout (vouchers per page)
          </label>
          <div className="grid grid-cols-2 gap-2">
            {GRID_OPTIONS.map(option => (
              <button
                key={option.id}
                onClick={() => setGridSize(option.id)}
                className={`p-3 rounded-lg border-2 transition-colors ${
                  gridSize === option.id
                    ? 'border-purple-500 bg-purple-50 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300'
                    : 'border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:border-gray-400'
                }`}
              >
                <div className="font-medium">{option.label}</div>
                <div className="text-xs opacity-70">{option.description}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Summary */}
        <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4 mb-4">
          <h4 className="font-medium text-gray-800 dark:text-gray-200 mb-2">Summary</h4>
          <div className="space-y-1 text-sm text-gray-600 dark:text-gray-400">
            <div className="flex justify-between">
              <span>Vouchers:</span>
              <span className="font-medium">{quantity}</span>
            </div>
            <div className="flex justify-between">
              <span>Amount each:</span>
              <span className="font-medium">{formatDisplayAmount(amount, displayCurrency)}</span>
            </div>
            <div className="flex justify-between">
              <span>Total:</span>
              <span className="font-medium">{formatDisplayAmount(parseFloat(amount) * quantity, displayCurrency)}</span>
            </div>
            <div className="flex justify-between">
              <span>Pages:</span>
              <span className="font-medium">{Math.ceil(quantity / GRID_OPTIONS.find(g => g.id === gridSize)?.perPage || 4)}</span>
            </div>
          </div>
        </div>

        {error && (
          <div className="bg-red-100 dark:bg-red-900 border border-red-400 dark:border-red-700 text-red-700 dark:text-red-200 px-3 py-2 rounded text-sm mb-4">
            {error}
          </div>
        )}
      </div>

      {/* Action Buttons */}
      <div className="px-4 pb-4 space-y-3">
        <button
          onClick={generateVouchers}
          className="w-full h-14 bg-purple-600 dark:bg-purple-500 hover:bg-purple-700 dark:hover:bg-purple-600 text-white rounded-lg text-lg font-semibold transition-colors shadow-md flex items-center justify-center gap-2"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
          </svg>
          Generate {quantity} Vouchers
        </button>
        <button
          onClick={handleClear}
          className="w-full h-12 bg-white dark:bg-black border-2 border-gray-400 dark:border-gray-600 text-gray-600 dark:text-gray-400 rounded-lg text-lg font-normal transition-colors"
        >
          Back
        </button>
      </div>
    </div>
  );

  // Render generating step
  const renderGeneratingStep = () => (
    <div className="h-full flex flex-col bg-white dark:bg-black items-center justify-center" style={{fontFamily: "'Source Sans Pro', sans-serif"}}>
      <div className="flex flex-col items-center bg-gray-50 dark:bg-blink-dark rounded-lg p-8 shadow-lg">
        <div className="animate-spin rounded-full h-16 w-16 border-4 border-purple-500 border-t-transparent mb-4"></div>
        <div className="text-xl font-semibold text-gray-800 dark:text-gray-100 mb-2">
          Creating Vouchers...
        </div>
        <div className="text-sm text-gray-600 dark:text-gray-400">
          {generatedVouchers.length} of {quantity} created
        </div>
      </div>
    </div>
  );

  // Render preview step
  const renderPreviewStep = () => (
    <div className="h-full flex flex-col bg-white dark:bg-black" style={{fontFamily: "'Source Sans Pro', sans-serif"}}>
      {/* Title Section */}
      <div className="px-4 py-4">
        <div className="text-center">
          <div className="text-2xl font-semibold text-purple-600 dark:text-purple-400">
            {generatedVouchers.length} Vouchers Created
          </div>
          <div className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            {formatDisplayAmount(amount, displayCurrency)} each
          </div>
        </div>
      </div>

      {/* Voucher Grid Preview */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        <div className="grid grid-cols-2 gap-3">
          {generatedVouchers.map((voucher, index) => (
            <div 
              key={voucher.id}
              className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg p-3 shadow-sm"
            >
              <div className="text-center mb-2">
                <div className="text-xs text-gray-500 dark:text-gray-400">#{index + 1}</div>
                <div className="text-sm font-medium text-gray-800 dark:text-gray-200">
                  {voucher.amount} sats
                </div>
              </div>
              <div 
                ref={el => qrRefs.current[index] = el}
                className="flex justify-center"
              >
                <QRCode 
                  value={voucher.lnurl} 
                  size={80}
                  bgColor="#ffffff"
                  fgColor="#000000"
                />
              </div>
              <div className="text-center mt-2 text-xs text-gray-500 dark:text-gray-400 font-mono">
                {voucher.id?.substring(0, 8)?.toUpperCase()}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Action Buttons */}
      <div className="px-4 pb-4 space-y-3">
        <button
          onClick={downloadPdf}
          disabled={downloadingPdf}
          className="w-full h-14 bg-purple-600 dark:bg-purple-500 hover:bg-purple-700 dark:hover:bg-purple-600 text-white rounded-lg text-lg font-semibold transition-colors shadow-md flex items-center justify-center gap-2 disabled:opacity-50"
        >
          {downloadingPdf ? (
            <>
              <div className="animate-spin w-5 h-5 border-2 border-white border-t-transparent rounded-full"></div>
              Generating PDF...
            </>
          ) : (
            <>
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              Download PDF ({gridSize})
            </>
          )}
        </button>
        <button
          onClick={handleClear}
          className="w-full h-12 bg-white dark:bg-black border-2 border-red-500 dark:border-red-400 text-red-600 dark:text-red-400 rounded-lg text-lg font-normal transition-colors"
        >
          Create New Batch
        </button>
        
        {error && (
          <div className="bg-red-100 dark:bg-red-900 border border-red-400 dark:border-red-700 text-red-700 dark:text-red-200 px-3 py-2 rounded text-sm">
            {error}
          </div>
        )}
      </div>
    </div>
  );

  // Main render
  switch (currentStep) {
    case 'amount':
      return renderAmountStep();
    case 'config':
      return renderConfigStep();
    case 'generating':
      return renderGeneratingStep();
    case 'preview':
      return renderPreviewStep();
    default:
      return renderAmountStep();
  }
});

MultiVoucher.displayName = 'MultiVoucher';
export default MultiVoucher;
