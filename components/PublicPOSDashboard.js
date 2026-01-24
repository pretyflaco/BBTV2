import { useState, useEffect, useRef, useCallback } from 'react';
import { useCurrencies } from '../lib/hooks/useCurrencies';
import { useDarkMode } from '../lib/hooks/useDarkMode';
import { useNFC } from './NFCPayment';
import { isBitcoinCurrency } from '../lib/currency-utils';
import POS from './POS';
import ItemCart from './ItemCart';
import QRCode from 'react-qr-code';
import PaymentAnimation from './PaymentAnimation';
import { bech32 } from 'bech32';
import { FORMAT_OPTIONS, FORMAT_LABELS, FORMAT_DESCRIPTIONS, getFormatPreview, BITCOIN_FORMAT_OPTIONS, BITCOIN_FORMAT_LABELS, BITCOIN_FORMAT_DESCRIPTIONS, getBitcoinFormatPreview } from '../lib/number-format';

/**
 * PublicPOSDashboard - Public-facing POS for any Blink username
 * 
 * Similar to main Dashboard but:
 * - Only Cart and POS views (no transactions)
 * - Limited menu (Display Currency, Paycodes, Sound Effects)
 * - No authentication required
 * - Invoices go directly to the Blink user's wallet
 * - 150% zoom on desktop
 * - Polls for payment status (no webhook)
 */

// Spinner colors for transitions
const SPINNER_COLORS = [
  'border-blue-600',
  'border-green-600',
  'border-orange-500',
  'border-red-600',
  'border-yellow-500',
  'border-purple-600',
  'border-cyan-500',
  'border-pink-500',
];

export default function PublicPOSDashboard({ username, walletCurrency }) {
  const { currencies, loading: currenciesLoading, getAllCurrencies } = useCurrencies();
  const { darkMode, toggleDarkMode } = useDarkMode();
  
  // View state
  const [currentView, setCurrentView] = useState('pos'); // 'cart' or 'pos' only
  const [isViewTransitioning, setIsViewTransitioning] = useState(false);
  const [transitionColorIndex, setTransitionColorIndex] = useState(0);
  const [cartCheckoutData, setCartCheckoutData] = useState(null);
  const [showingInvoice, setShowingInvoice] = useState(false);
  
  // Payment state for polling
  const [currentInvoice, setCurrentInvoice] = useState(null);
  const [paymentSuccess, setPaymentSuccess] = useState(false);
  const [paymentData, setPaymentData] = useState(null); // For PaymentAnimation
  
  // Exchange rate state for sats equivalent display
  const [exchangeRate, setExchangeRate] = useState(null);
  const [loadingRate, setLoadingRate] = useState(false);
  
  // Settings state (must be declared before useNFC which uses soundEnabled/soundTheme)
  const [displayCurrency, setDisplayCurrency] = useState('USD');
  const [numberFormat, setNumberFormat] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('publicpos-numberFormat') || 'auto';
    }
    return 'auto';
  });
  const [bitcoinFormat, setBitcoinFormat] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('publicpos-bitcoinFormat') || 'bip177';
    }
    return 'bip177';
  });
  const [soundEnabled, setSoundEnabled] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('publicpos-soundEnabled');
      return saved !== null ? JSON.parse(saved) : true;
    }
    return true;
  });
  const [soundTheme, setSoundTheme] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('publicpos-soundTheme');
      return saved || 'success';
    }
    return 'success';
  });
  
  // Setup NFC for Boltcard payments (after soundEnabled/soundTheme are declared)
  const nfcState = useNFC({
    paymentRequest: currentInvoice?.paymentRequest,
    onPaymentSuccess: () => {
      console.log('🎉 NFC Boltcard payment successful (Public POS)');
      // Payment will be picked up by polling
    },
    onPaymentError: (error) => {
      console.error('NFC payment error (Public POS):', error);
    },
    soundEnabled,
    soundTheme,
  });
  
  // Menu state
  const [sideMenuOpen, setSideMenuOpen] = useState(false);
  const [showCurrencySettings, setShowCurrencySettings] = useState(false);
  const [showRegionalSettings, setShowRegionalSettings] = useState(false);
  const [showSoundSettings, setShowSoundSettings] = useState(false);
  const [showPaycode, setShowPaycode] = useState(false);
  const [paycodeAmount, setPaycodeAmount] = useState('');
  const [paycodeGeneratingPdf, setPaycodeGeneratingPdf] = useState(false);
  
  // Refs
  const posRef = useRef(null);
  const cartRef = useRef(null);
  const posPaymentReceivedRef = useRef(null);
  
  // Touch handling for swipe navigation
  const touchStartX = useRef(0);
  const touchStartY = useRef(0);
  
  // Poll for payment status when showing invoice
  useEffect(() => {
    if (!currentInvoice?.paymentRequest || !showingInvoice) return;
    
    let cancelled = false;
    let pollCount = 0;
    const maxPolls = 180; // 15 minutes at 5 second intervals
    
    const pollPayment = async () => {
      if (cancelled || pollCount >= maxPolls) {
        return;
      }
      
      try {
        // Query Blink API directly for payment status (public query)
        const response = await fetch('https://api.blink.sv/graphql', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            query: `
              query LnInvoicePaymentStatus($input: LnInvoicePaymentStatusInput!) {
                lnInvoicePaymentStatus(input: $input) {
                  status
                }
              }
            `,
            variables: {
              input: { paymentRequest: currentInvoice.paymentRequest }
            }
          })
        });
        
        const data = await response.json();
        const status = data.data?.lnInvoicePaymentStatus?.status;
        
        if (status === 'PAID') {
          console.log('✅ Public invoice payment received!');
          
          // Set payment data for animation
          setPaymentData({
            amount: currentInvoice.satAmount || currentInvoice.amount,
            currency: 'BTC', // Always show sats
            memo: currentInvoice.memo
          });
          setPaymentSuccess(true);
          
          // Note: Sound is handled by PaymentAnimation component
          return;
        }
      } catch (err) {
        console.warn('Payment poll error:', err);
      }
      
      pollCount++;
      if (!cancelled) {
        setTimeout(pollPayment, 5000); // Poll every 5 seconds
      }
    };
    
    // Start polling after a short delay
    const initialDelay = setTimeout(pollPayment, 2000);
    
    return () => {
      cancelled = true;
      clearTimeout(initialDelay);
    };
  }, [currentInvoice, showingInvoice, soundEnabled]);
  
  // Handle invoice changes from POS
  const handleInvoiceChange = useCallback((invoice) => {
    setCurrentInvoice(invoice);
  }, []);
  
  // Handle payment animation dismiss
  const handlePaymentAnimationHide = useCallback(() => {
    setPaymentSuccess(false);
    setPaymentData(null);
    setCurrentInvoice(null);
    if (posPaymentReceivedRef.current) {
      posPaymentReceivedRef.current();
    }
  }, []);
  
  // NOTE: CSS zoom removed - it caused C/OK button visibility issues
  // Instead, we scale up elements natively using larger Tailwind classes
  
  // Save sound preference
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('publicpos-soundEnabled', JSON.stringify(soundEnabled));
    }
  }, [soundEnabled]);
  
  // Save sound theme preference
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('publicpos-soundTheme', soundTheme);
    }
  }, [soundTheme]);

  // Save number format preference
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('publicpos-numberFormat', numberFormat);
    }
  }, [numberFormat]);

  // Save Bitcoin format preference
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('publicpos-bitcoinFormat', bitcoinFormat);
    }
  }, [bitcoinFormat]);

  // Fetch exchange rate when currency changes (for sats equivalent display)
  const fetchExchangeRate = async () => {
    if (isBitcoinCurrency(displayCurrency)) {
      setExchangeRate({ satPriceInCurrency: 1, currency: 'BTC' });
      return;
    }
    
    setLoadingRate(true);
    try {
      const response = await fetch('/api/blink/exchange-rate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currency: displayCurrency,
          useBlinkpos: true // Public POS always uses BlinkPOS credentials
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
        console.error('Failed to fetch exchange rate:', data.error);
      }
    } catch (error) {
      console.error('Exchange rate error:', error);
    } finally {
      setLoadingRate(false);
    }
  };
  
  // Fetch exchange rate on mount and when display currency changes
  useEffect(() => {
    fetchExchangeRate();
  }, [displayCurrency]);

  // View transition handler
  const handleViewTransition = useCallback((newView) => {
    if (newView === currentView || isViewTransitioning) return;
    
    setTransitionColorIndex(prev => (prev + 1) % SPINNER_COLORS.length);
    setIsViewTransitioning(true);
    
    setTimeout(() => {
      setCurrentView(newView);
      setIsViewTransitioning(false);
      
      // Reset cart navigation when entering cart view
      if (newView === 'cart' && cartRef.current) {
        cartRef.current.resetNavigation?.();
      }
    }, 150);
  }, [currentView, isViewTransitioning]);

  // Touch handlers for swipe navigation
  const handleTouchStart = useCallback((e) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
  }, []);

  const handleTouchMove = useCallback((e) => {
    // Prevent default to avoid scrolling during swipe
  }, []);

  const handleTouchEnd = useCallback((e) => {
    const touchEndX = e.changedTouches[0].clientX;
    const touchEndY = e.changedTouches[0].clientY;
    
    const deltaX = touchEndX - touchStartX.current;
    const deltaY = touchEndY - touchStartY.current;
    
    // Only handle horizontal swipes (ignore if vertical movement is larger)
    if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > 50) {
      if (deltaX > 0) {
        // Swipe right: POS → Cart
        if (currentView === 'pos') {
          handleViewTransition('cart');
        }
      } else {
        // Swipe left: Cart → POS
        if (currentView === 'cart') {
          handleViewTransition('pos');
        }
      }
    }
  }, [currentView, handleViewTransition]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Skip if menu is open or in input
      if (sideMenuOpen || showCurrencySettings || showSoundSettings || showPaycode) return;
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      
      // Check if cart is active and can handle keyboard navigation
      if (currentView === 'cart' && cartRef.current?.isCartNavActive?.()) {
        if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Enter', 'Escape', 'Backspace', ' '].includes(e.key)) {
          const handled = cartRef.current.handleCartKey(e.key);
          if (handled) {
            e.preventDefault();
            return;
          }
          // If not handled (e.g., ArrowUp from Search), fall through to global navigation
        }
      }
      
      // If cart view but exited to global nav, DOWN arrow re-enters local cart navigation
      if (currentView === 'cart' && e.key === 'ArrowDown' && cartRef.current?.enterLocalNav) {
        if (!cartRef.current.isCartNavActive?.()) {
          e.preventDefault();
          cartRef.current.enterLocalNav();
          return;
        }
      }
      
      // POS numpad keyboard input (only when not showing invoice)
      if (currentView === 'pos' && !showingInvoice && posRef.current) {
        // Digit keys (top row and numpad)
        if (/^[0-9]$/.test(e.key)) {
          e.preventDefault();
          posRef.current.handleDigitPress(e.key);
          return;
        }
        // Decimal point
        if (e.key === '.' || e.key === ',') {
          e.preventDefault();
          posRef.current.handleDigitPress('.');
          return;
        }
        // Backspace
        if (e.key === 'Backspace') {
          e.preventDefault();
          posRef.current.handleBackspace();
          return;
        }
        // Escape = Clear
        if (e.key === 'Escape') {
          e.preventDefault();
          posRef.current.handleClear();
          return;
        }
        // Enter = Submit (OK) - only if there's a valid amount
        if (e.key === 'Enter') {
          e.preventDefault();
          if (posRef.current.hasValidAmount?.()) {
            posRef.current.handleSubmit();
          }
          return;
        }
        // Plus key = add to stack
        if (e.key === '+') {
          e.preventDefault();
          posRef.current.handlePlusPress();
          return;
        }
      }
      
      // Escape key for checkout screens
      if (e.key === 'Escape') {
        // Payment success animation - Done
        if (paymentSuccess) {
          e.preventDefault();
          handlePaymentAnimationHide();
          return;
        }
        
        // POS checkout screen - Cancel
        if (currentView === 'pos' && showingInvoice) {
          e.preventDefault();
          posRef.current?.handleClear?.();
          return;
        }
      }
      
      // Arrow key navigation (only when not showing invoice)
      if (!showingInvoice && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
        e.preventDefault();
        if (e.key === 'ArrowLeft' && currentView === 'pos') {
          handleViewTransition('cart');
        } else if (e.key === 'ArrowRight' && currentView === 'cart') {
          handleViewTransition('pos');
        }
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentView, sideMenuOpen, showingInvoice, showCurrencySettings, showSoundSettings, showPaycode, handleViewTransition, paymentSuccess]);

  const isFixedView = currentView === 'pos' || currentView === 'cart';

  return (
    <div className={`bg-white dark:bg-black ${isFixedView ? 'h-screen overflow-hidden fixed inset-0' : 'min-h-screen'}`}>
      
      {/* Header - Hidden when showing invoice */}
      {!showingInvoice && (
        <header className="bg-gray-50 dark:bg-blink-dark shadow dark:shadow-black sticky top-0 z-40">
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
              
              {/* Navigation Dots - Center (only Cart and POS) */}
              <div className="flex gap-2">
                <button
                  onClick={() => handleViewTransition('cart')}
                  disabled={isViewTransitioning}
                  className={`w-2 h-2 rounded-full transition-colors ${
                    currentView === 'cart'
                      ? 'bg-blink-accent'
                      : 'bg-gray-300 dark:bg-gray-600 hover:bg-gray-400 dark:hover:bg-gray-500'
                  }`}
                  aria-label="Cart"
                />
                <button
                  onClick={() => handleViewTransition('pos')}
                  disabled={isViewTransitioning}
                  className={`w-2 h-2 rounded-full transition-colors ${
                    currentView === 'pos'
                      ? 'bg-blink-accent'
                      : 'bg-gray-300 dark:bg-gray-600 hover:bg-gray-400 dark:hover:bg-gray-500'
                  }`}
                  aria-label="POS"
                />
              </div>
              
              {/* Menu Button - Right */}
              <button
                onClick={() => setSideMenuOpen(!sideMenuOpen)}
                className="p-2 rounded-md text-gray-400 dark:text-gray-500 hover:text-gray-500 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-blink-dark focus:outline-none"
                aria-label="Open menu"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>
            </div>
          </div>
        </header>
      )}

      {/* Side Menu */}
      {sideMenuOpen && (
        <div className="fixed inset-0 bg-white dark:bg-black z-50 overflow-y-auto">
          <div className="min-h-screen" style={{fontFamily: "'Source Sans Pro', sans-serif"}}>
            {/* Menu Header */}
            <div className="bg-gray-50 dark:bg-blink-dark shadow dark:shadow-black sticky top-0 z-10">
              <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="flex justify-between items-center h-16">
                  <button
                    onClick={() => setSideMenuOpen(false)}
                    className="flex items-center text-gray-700 dark:text-white hover:text-blink-accent"
                  >
                    <span className="text-2xl mr-2">‹</span>
                    <span className="text-lg">Back</span>
                  </button>
                  <h1 className="text-xl font-bold text-gray-900 dark:text-white">Menu</h1>
                  <div className="w-16"></div>
                </div>
              </div>
            </div>

            {/* Menu Content */}
            <div className="max-w-md mx-auto px-4 py-6">
              <div className="space-y-4">
                
                {/* Profile - Links to sign in */}
                <a
                  href="/"
                  className={`block w-full rounded-lg p-4 ${darkMode ? 'bg-gray-900 hover:bg-gray-800' : 'bg-gray-50 hover:bg-gray-100'} transition-colors`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center bg-blink-accent/20`}>
                      <svg className="w-5 h-5 text-blink-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                      </svg>
                    </div>
                    <div className="flex-1">
                      <p className="text-base font-medium text-blink-accent">Sign in to Blink Bitcoin Terminal</p>
                      <p className="text-sm text-gray-500 dark:text-gray-400">Access full features</p>
                    </div>
                    <span className="text-gray-400">›</span>
                  </div>
                </a>

                {/* Display Currency */}
                <button
                  onClick={() => setShowCurrencySettings(true)}
                  className={`w-full rounded-lg p-4 ${darkMode ? 'bg-gray-900 hover:bg-gray-800' : 'bg-gray-50 hover:bg-gray-100'} transition-colors`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-900 dark:text-white">Display Currency</span>
                    <div className="flex items-center text-sm text-gray-500 dark:text-gray-400">
                      <span>{displayCurrency}</span>
                      <span className="ml-1">›</span>
                    </div>
                  </div>
                </button>

                {/* Regional Settings (Number Format) */}
                <button
                  onClick={() => setShowRegionalSettings(true)}
                  className={`w-full rounded-lg p-4 ${darkMode ? 'bg-gray-900 hover:bg-gray-800' : 'bg-gray-50 hover:bg-gray-100'} transition-colors`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-900 dark:text-white">Regional</span>
                    <div className="flex items-center text-sm text-gray-500 dark:text-gray-400">
                      <span>{FORMAT_LABELS[numberFormat]}</span>
                      <span className="ml-1">›</span>
                    </div>
                  </div>
                </button>

                {/* Paycodes */}
                <button
                  onClick={() => {
                    setShowPaycode(true);
                    setSideMenuOpen(false);
                  }}
                  className={`w-full rounded-lg p-4 ${darkMode ? 'bg-gray-900 hover:bg-gray-800' : 'bg-gray-50 hover:bg-gray-100'} transition-colors`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-900 dark:text-white">Paycodes</span>
                    <span className="text-gray-400">›</span>
                  </div>
                </button>

                {/* Sound Effects */}
                <button
                  onClick={() => setShowSoundSettings(true)}
                  className={`w-full rounded-lg p-4 ${darkMode ? 'bg-gray-900 hover:bg-gray-800' : 'bg-gray-50 hover:bg-gray-100'} transition-colors`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-900 dark:text-white">Sound Effects</span>
                    <div className="flex items-center text-sm text-gray-500 dark:text-gray-400">
                      <span>{!soundEnabled ? 'None' : soundTheme === 'success' ? 'Success' : soundTheme === 'zelda' ? 'Zelda' : soundTheme === 'free' ? 'Free' : soundTheme === 'retro' ? 'Retro' : 'None'}</span>
                      <span className="ml-1">›</span>
                    </div>
                  </div>
                </button>

              </div>
            </div>
          </div>
        </div>
      )}

      {/* Currency Settings Overlay */}
      {showCurrencySettings && (
        <div className="fixed inset-0 bg-white dark:bg-black z-50 overflow-y-auto">
          <div className="min-h-screen" style={{fontFamily: "'Source Sans Pro', sans-serif"}}>
            <div className="bg-gray-50 dark:bg-blink-dark shadow dark:shadow-black sticky top-0 z-10">
              <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="flex justify-between items-center h-16">
                  <button
                    onClick={() => setShowCurrencySettings(false)}
                    className="flex items-center text-gray-700 dark:text-white hover:text-blink-accent"
                  >
                    <span className="text-2xl mr-2">‹</span>
                    <span className="text-lg">Back</span>
                  </button>
                  <h1 className="text-xl font-bold text-gray-900 dark:text-white">Currency</h1>
                  <div className="w-16"></div>
                </div>
              </div>
            </div>

            <div className="max-w-md mx-auto px-4 py-6">
              <div className="space-y-2">
                {currenciesLoading ? (
                  <div className="text-center py-4 text-gray-500">Loading...</div>
                ) : (
                  getAllCurrencies().map((currency) => (
                    <button
                      key={currency.id}
                      onClick={() => {
                        setDisplayCurrency(currency.id);
                        setShowCurrencySettings(false);
                      }}
                      className={`w-full p-3 rounded-lg text-left transition-all ${
                        displayCurrency === currency.id
                          ? 'bg-blink-accent/20 border-2 border-blink-accent'
                          : darkMode
                            ? 'bg-gray-900 hover:bg-gray-800 border-2 border-transparent'
                            : 'bg-gray-50 hover:bg-gray-100 border-2 border-transparent'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className={`text-sm font-medium ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                          {currency.flag ? `${currency.flag} ` : ''}{currency.displayId || currency.id} - {currency.name}
                        </span>
                        {displayCurrency === currency.id && (
                          <svg className="w-5 h-5 text-blink-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Regional Settings Overlay */}
      {showRegionalSettings && (
        <div className="fixed inset-0 bg-white dark:bg-black z-50 overflow-y-auto">
          <div className="min-h-screen" style={{fontFamily: "'Source Sans Pro', sans-serif"}}>
            {/* Header */}
            <div className="bg-gray-50 dark:bg-blink-dark shadow dark:shadow-black sticky top-0 z-10">
              <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="flex justify-between items-center h-16">
                  <button
                    onClick={() => setShowRegionalSettings(false)}
                    className="flex items-center text-gray-700 dark:text-white hover:text-blink-accent dark:hover:text-blink-accent"
                  >
                    <span className="text-2xl mr-2">‹</span>
                    <span className="text-lg">Back</span>
                  </button>
                  <h1 className="text-xl font-bold text-gray-900 dark:text-white">
                    Regional
                  </h1>
                  <div className="w-16"></div>
                </div>
              </div>
            </div>

            {/* Regional Settings Content */}
            <div className="max-w-md mx-auto px-4 py-6 space-y-6">
              {/* Number Format Section */}
              <div>
                <h3 className={`text-sm font-medium mb-3 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                  Number Format
                </h3>
                <div className="space-y-2">
                  {FORMAT_OPTIONS.map((format) => (
                    <button
                      key={format}
                      onClick={() => setNumberFormat(format)}
                      className={`w-full p-3 rounded-lg text-left transition-all ${
                        numberFormat === format
                          ? 'bg-blink-accent/20 border-2 border-blink-accent'
                          : darkMode
                            ? 'bg-gray-900 hover:bg-gray-800 border-2 border-transparent'
                            : 'bg-gray-50 hover:bg-gray-100 border-2 border-transparent'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <span className={`text-sm font-medium ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                            {FORMAT_LABELS[format]}
                          </span>
                          <p className={`text-xs mt-0.5 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                            {FORMAT_DESCRIPTIONS[format]}
                          </p>
                        </div>
                        {numberFormat === format && (
                          <svg className="w-5 h-5 text-blink-accent flex-shrink-0 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </div>
                    </button>
                  ))}
                </div>

                {/* Live Preview */}
                <div className={`mt-4 p-4 rounded-lg ${darkMode ? 'bg-gray-900' : 'bg-gray-50'}`}>
                  <h4 className={`text-xs font-medium mb-2 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                    Preview
                  </h4>
                  <div className={`space-y-1 ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                    <div className="flex justify-between text-sm">
                      <span>Bitcoin:</span>
                      <span className="font-mono">{getBitcoinFormatPreview(bitcoinFormat, numberFormat)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span>USD:</span>
                      <span className="font-mono">${getFormatPreview(numberFormat).decimal}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Bitcoin Format Section */}
              <div>
                <h3 className={`text-sm font-medium mb-3 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                  Bitcoin Format
                </h3>
                <div className="space-y-2">
                  {BITCOIN_FORMAT_OPTIONS.map((format) => (
                    <button
                      key={format}
                      onClick={() => setBitcoinFormat(format)}
                      className={`w-full p-3 rounded-lg text-left transition-all ${
                        bitcoinFormat === format
                          ? 'bg-blink-accent/20 border-2 border-blink-accent'
                          : darkMode
                            ? 'bg-gray-900 hover:bg-gray-800 border-2 border-transparent'
                            : 'bg-gray-50 hover:bg-gray-100 border-2 border-transparent'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="flex items-center gap-3">
                            <span className={`text-sm font-medium ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                              {BITCOIN_FORMAT_LABELS[format]}
                            </span>
                            <span className={`text-sm font-mono ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                              {getBitcoinFormatPreview(format, numberFormat)}
                            </span>
                          </div>
                          <p className={`text-xs mt-0.5 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                            {BITCOIN_FORMAT_DESCRIPTIONS[format]}
                          </p>
                        </div>
                        {bitcoinFormat === format && (
                          <svg className="w-5 h-5 text-blink-accent flex-shrink-0 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Language Section (Placeholder) */}
              <div>
                <h3 className={`text-sm font-medium mb-3 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                  Language
                </h3>
                <div 
                  className={`p-3 rounded-lg ${darkMode ? 'bg-gray-900' : 'bg-gray-50'} opacity-60 cursor-not-allowed`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <span className={`text-sm font-medium ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                        English
                      </span>
                      <p className={`text-xs mt-0.5 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                        More languages coming soon
                      </p>
                    </div>
                    <svg className="w-5 h-5 text-blink-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Sound Settings Overlay */}
      {showSoundSettings && (
        <div className="fixed inset-0 bg-white dark:bg-black z-50 overflow-y-auto">
          <div className="min-h-screen" style={{fontFamily: "'Source Sans Pro', sans-serif"}}>
            <div className="bg-gray-50 dark:bg-blink-dark shadow dark:shadow-black sticky top-0 z-10">
              <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="flex justify-between items-center h-16">
                  <button
                    onClick={() => setShowSoundSettings(false)}
                    className="flex items-center text-gray-700 dark:text-white hover:text-blink-accent"
                  >
                    <span className="text-2xl mr-2">‹</span>
                    <span className="text-lg">Back</span>
                  </button>
                  <h1 className="text-xl font-bold text-gray-900 dark:text-white">Sound Effects</h1>
                  <div className="w-16"></div>
                </div>
              </div>
            </div>

            <div className="max-w-md mx-auto px-4 py-6">
              <div className="space-y-4">
                {/* None - Sounds Off */}
                <button
                  onClick={() => {
                    setSoundEnabled(false);
                    setShowSoundSettings(false);
                  }}
                  className={`w-full p-4 rounded-lg border-2 transition-all ${
                    !soundEnabled
                      ? 'border-blue-600 dark:border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                      : 'border-gray-300 dark:border-gray-700 bg-white dark:bg-blink-dark hover:border-gray-400 dark:hover:border-gray-600'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="text-left">
                      <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">
                        None
                      </h3>
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        No payment sounds
                      </p>
                    </div>
                    {!soundEnabled && (
                      <div className="text-blue-600 dark:text-blue-400 text-2xl">✓</div>
                    )}
                  </div>
                </button>

                {/* Success Theme */}
                <button
                  onClick={() => {
                    setSoundEnabled(true);
                    setSoundTheme('success');
                    setShowSoundSettings(false);
                  }}
                  className={`w-full p-4 rounded-lg border-2 transition-all ${
                    soundEnabled && soundTheme === 'success'
                      ? 'border-blue-600 dark:border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                      : 'border-gray-300 dark:border-gray-700 bg-white dark:bg-blink-dark hover:border-gray-400 dark:hover:border-gray-600'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="text-left">
                      <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">
                        Success
                      </h3>
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        Classic payment sounds
                      </p>
                    </div>
                    {soundEnabled && soundTheme === 'success' && (
                      <div className="text-blue-600 dark:text-blue-400 text-2xl">✓</div>
                    )}
                  </div>
                </button>

                {/* Zelda Theme */}
                <button
                  onClick={() => {
                    setSoundEnabled(true);
                    setSoundTheme('zelda');
                    setShowSoundSettings(false);
                  }}
                  className={`w-full p-4 rounded-lg border-2 transition-all ${
                    soundEnabled && soundTheme === 'zelda'
                      ? 'border-blue-600 dark:border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                      : 'border-gray-300 dark:border-gray-700 bg-white dark:bg-blink-dark hover:border-gray-400 dark:hover:border-gray-600'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="text-left">
                      <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">
                        Zelda
                      </h3>
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        Breath of the Wild sounds
                      </p>
                    </div>
                    {soundEnabled && soundTheme === 'zelda' && (
                      <div className="text-blue-600 dark:text-blue-400 text-2xl">✓</div>
                    )}
                  </div>
                </button>

                {/* Free Theme */}
                <button
                  onClick={() => {
                    setSoundEnabled(true);
                    setSoundTheme('free');
                    setShowSoundSettings(false);
                  }}
                  className={`w-full p-4 rounded-lg border-2 transition-all ${
                    soundEnabled && soundTheme === 'free'
                      ? 'border-blue-600 dark:border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                      : 'border-gray-300 dark:border-gray-700 bg-white dark:bg-blink-dark hover:border-gray-400 dark:hover:border-gray-600'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="text-left">
                      <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">
                        Free
                      </h3>
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        Freedom sounds
                      </p>
                    </div>
                    {soundEnabled && soundTheme === 'free' && (
                      <div className="text-blue-600 dark:text-blue-400 text-2xl">✓</div>
                    )}
                  </div>
                </button>

                {/* Retro Theme */}
                <button
                  onClick={() => {
                    setSoundEnabled(true);
                    setSoundTheme('retro');
                    setShowSoundSettings(false);
                  }}
                  className={`w-full p-4 rounded-lg border-2 transition-all ${
                    soundEnabled && soundTheme === 'retro'
                      ? 'border-blue-600 dark:border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                      : 'border-gray-300 dark:border-gray-700 bg-white dark:bg-blink-dark hover:border-gray-400 dark:hover:border-gray-600'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="text-left">
                      <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">
                        Retro
                      </h3>
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        Classic 8-bit sounds
                      </p>
                    </div>
                    {soundEnabled && soundTheme === 'retro' && (
                      <div className="text-blue-600 dark:text-blue-400 text-2xl">✓</div>
                    )}
                  </div>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Paycode Overlay */}
      {showPaycode && (() => {
        // Generate LNURL for the paycode
        const hasFixedAmount = paycodeAmount && parseInt(paycodeAmount) > 0;
        
        // Use our custom LNURL-pay endpoint for fixed amounts (sets min=max)
        // Use Blink's endpoint for variable amounts
        const lnurlPayEndpoint = hasFixedAmount
          ? `https://track.twentyone.ist/api/paycode/lnurlp/${username}?amount=${paycodeAmount}`
          : `https://pay.blink.sv/.well-known/lnurlp/${username}`;
        
        // Encode to LNURL using bech32
        const words = bech32.toWords(Buffer.from(lnurlPayEndpoint, 'utf8'));
        const lnurl = bech32.encode('lnurl', words, 1500);
        
        // Web fallback URL - for wallets that don't support LNURL, camera apps open this page
        const webURL = `https://pay.blink.sv/${username}`;
        
        // Use raw LNURL for Blink mobile compatibility
        const paycodeURL = lnurl.toUpperCase();
        const lightningAddress = `${username}@blink.sv`;

        // Generate PDF function
        const generatePaycodePdf = async () => {
          setPaycodeGeneratingPdf(true);
          try {
            // Create a canvas from the QR code to get data URL
            const qrCanvas = document.createElement('canvas');
            const QRCodeLib = await import('qrcode');
            await QRCodeLib.toCanvas(qrCanvas, paycodeURL, {
              width: 400,
              margin: 2,
              errorCorrectionLevel: 'H'
            });
            const qrDataUrl = qrCanvas.toDataURL('image/png');

            // Call the PDF API
            const response = await fetch('/api/paycode/pdf', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                lightningAddress,
                qrDataUrl,
                amount: paycodeAmount ? parseInt(paycodeAmount) : null,
                displayAmount: paycodeAmount ? `${parseInt(paycodeAmount).toLocaleString()} sats` : null,
                webUrl: webURL
              })
            });

            if (!response.ok) {
              throw new Error('Failed to generate PDF');
            }

            const { pdf } = await response.json();
            
            // Download the PDF
            const link = document.createElement('a');
            link.href = `data:application/pdf;base64,${pdf}`;
            link.download = `paycode-${username}${paycodeAmount ? `-${paycodeAmount}sats` : ''}.pdf`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
          } catch (error) {
            console.error('Error generating PDF:', error);
            alert('Failed to generate PDF. Please try again.');
          } finally {
            setPaycodeGeneratingPdf(false);
          }
        };

        return (
          <div className="fixed inset-0 bg-white dark:bg-black z-50 overflow-y-auto">
            <div className="min-h-screen" style={{fontFamily: "'Source Sans Pro', sans-serif"}}>
              {/* Header */}
              <div className="bg-gray-50 dark:bg-blink-dark shadow dark:shadow-black sticky top-0 z-10">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                  <div className="flex justify-between items-center h-16">
                    <button
                      onClick={() => {
                        setShowPaycode(false);
                        setPaycodeAmount('');
                      }}
                      className="flex items-center text-gray-700 dark:text-white hover:text-blink-accent dark:hover:text-blink-accent"
                    >
                      <span className="text-2xl mr-2">‹</span>
                      <span className="text-lg">Back</span>
                    </button>
                    <h1 className="text-xl font-bold text-gray-900 dark:text-white">
                      Paycodes
                    </h1>
                    <div className="w-16"></div>
                  </div>
                </div>
              </div>

              {/* Paycode Content */}
              <div className="max-w-md mx-auto px-4 py-6">
                <div className="text-center space-y-6">
                  {/* Lightning Address Header */}
                  <div>
                    <p className="text-lg font-semibold text-blink-accent">
                      Pay {lightningAddress}
                    </p>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">
                      Display this static QR code to accept Lightning payments.
                    </p>
                  </div>

                  {/* Amount Configuration */}
                  <div className={`p-4 rounded-lg ${darkMode ? 'bg-gray-900' : 'bg-gray-100'}`}>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Fixed Amount (optional)
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        value={paycodeAmount}
                        onChange={(e) => setPaycodeAmount(e.target.value)}
                        placeholder="Any amount"
                        min="1"
                        className={`flex-1 px-3 py-2 rounded-lg border text-center ${
                          darkMode 
                            ? 'bg-gray-800 border-gray-700 text-white placeholder-gray-500' 
                            : 'bg-white border-gray-300 text-gray-900 placeholder-gray-400'
                        } focus:outline-none focus:ring-2 focus:ring-purple-500`}
                      />
                      <span className="text-sm text-gray-500 dark:text-gray-400">sats</span>
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                      {paycodeAmount && parseInt(paycodeAmount) > 0 
                        ? `QR will request exactly ${parseInt(paycodeAmount).toLocaleString()} sats`
                        : 'Leave empty to allow payer to choose any amount'}
                    </p>
                  </div>

                  {/* QR Code */}
                  <div className="flex justify-center">
                    <div className="bg-white p-4 rounded-lg shadow-lg border-2 border-gray-200 dark:border-gray-600">
                      <QRCode
                        value={paycodeURL}
                        size={256}
                        bgColor="#ffffff"
                        fgColor="#000000"
                        level="H"
                      />
                    </div>
                  </div>

                  {/* Amount Display (if set) */}
                  {paycodeAmount && parseInt(paycodeAmount) > 0 && (
                    <div className="bg-purple-100 dark:bg-purple-900/30 px-4 py-2 rounded-lg">
                      <p className="text-lg font-bold text-purple-700 dark:text-purple-300">
                        {parseInt(paycodeAmount).toLocaleString()} sats
                      </p>
                    </div>
                  )}

                  {/* Troubleshooting Note */}
                  <div className={`p-4 rounded-lg ${darkMode ? 'bg-yellow-900/30' : 'bg-yellow-50'}`}>
                    <p className="text-sm text-yellow-700 dark:text-yellow-300">
                      <strong>Having trouble scanning?</strong>{' '}
                      Some wallets don't support static QR codes. Scan with your phone's camera app to open a webpage for creating a fresh invoice.
                    </p>
                  </div>

                  {/* Action Buttons */}
                  <div className="space-y-3">
                    {/* Download PDF Button */}
                    <button
                      onClick={generatePaycodePdf}
                      disabled={paycodeGeneratingPdf}
                      className="w-full py-3 bg-purple-600 hover:bg-purple-700 disabled:bg-purple-400 text-white rounded-lg text-base font-medium transition-colors flex items-center justify-center gap-2"
                    >
                      {paycodeGeneratingPdf ? (
                        <>
                          <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent"></div>
                          Generating PDF...
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

                    {/* Copy Lightning Address */}
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(lightningAddress);
                      }}
                      className="w-full py-3 bg-blink-accent hover:bg-blue-600 text-white rounded-lg text-base font-medium transition-colors flex items-center justify-center gap-2"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                      </svg>
                      Copy Lightning Address
                    </button>

                    {/* Copy Paycode LNURL */}
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(paycodeURL);
                      }}
                      className={`w-full py-3 rounded-lg text-base font-medium transition-colors flex items-center justify-center gap-2 ${
                        darkMode 
                          ? 'bg-gray-800 hover:bg-gray-700 text-white' 
                          : 'bg-gray-200 hover:bg-gray-300 text-gray-900'
                      }`}
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                      </svg>
                      Copy Paycode LNURL
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Main Content */}
      <main 
        className={`max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mobile-content ${isFixedView ? 'h-[calc(100vh-80px)] overflow-hidden py-2' : 'py-6'}`}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {/* Spacer - Fixed height to prevent numpad jumping when switching views */}
        {!showingInvoice && (
          <div className="h-16 mb-2 flex flex-col justify-center bg-white dark:bg-black">
            {/* Owner Display Row - 3-column layout: Owner | View Label | Spacer */}
            <div className="flex items-center justify-between">
              {/* Left side: Owner info */}
              <div className="flex-1 flex items-center gap-2">
                <img src="/bluedot.svg" alt="Owner" className="w-2 h-2" />
                <span className="font-semibold text-blue-600 dark:text-blue-400" style={{fontSize: '11.2px'}}>
                  {username}
                </span>
              </div>
              
              {/* Center: View label */}
              <div className="flex-1 text-center">
                <span className="text-xs text-gray-400 dark:text-gray-500 uppercase tracking-wider">
                  {currentView === 'cart' ? 'Item Cart' : 'Point Of Sale'}
                </span>
              </div>
              
              {/* Right side: Spacer for balance */}
              <div className="flex-1"></div>
            </div>
          </div>
        )}

        {/* View Transition Loading Overlay */}
        {isViewTransitioning && (
          <div className="fixed inset-0 z-40 bg-white/80 dark:bg-black/80 flex items-center justify-center backdrop-blur-sm">
            <div className={`animate-spin rounded-full h-12 w-12 border-4 ${SPINNER_COLORS[transitionColorIndex]} border-t-transparent`}></div>
          </div>
        )}
        
        {/* Payment Success Animation */}
        <PaymentAnimation
          show={paymentSuccess}
          payment={paymentData}
          onHide={handlePaymentAnimationHide}
          soundEnabled={soundEnabled}
          soundTheme={soundTheme}
        />

        {/* Conditional Content Based on Current View */}
        {currentView === 'cart' ? (
          <div className="h-[calc(100vh-160px)] min-h-[400px]">
            <ItemCart
              ref={cartRef}
              displayCurrency={displayCurrency}
              numberFormat={numberFormat}
              bitcoinFormat={bitcoinFormat}
              currencies={currencies}
              publicKey={null} // No auth in public mode - cart items stored locally
              onCheckout={(checkoutData) => {
                setCartCheckoutData(checkoutData);
                handleViewTransition('pos');
              }}
              soundEnabled={soundEnabled}
              darkMode={darkMode}
              toggleDarkMode={toggleDarkMode}
              isViewTransitioning={isViewTransitioning}
              exchangeRate={exchangeRate}
            />
          </div>
        ) : (
          <POS 
            ref={posRef}
            apiKey={null} // No API key - uses public invoice creation
            user={{ username }}
            displayCurrency={displayCurrency}
            numberFormat={numberFormat}
            bitcoinFormat={bitcoinFormat}
            currencies={currencies}
            wallets={[]} // No wallets in public mode
            onPaymentReceived={posPaymentReceivedRef}
            connected={false}
            tipsEnabled={false}
            tipPresets={[]}
            tipRecipients={[]}
            soundEnabled={soundEnabled}
            onInvoiceStateChange={setShowingInvoice}
            onInvoiceChange={handleInvoiceChange}
            darkMode={darkMode}
            toggleDarkMode={toggleDarkMode}
            nfcState={nfcState}
            activeBlinkAccount={{ username, type: 'public' }}
            cartCheckoutData={cartCheckoutData}
            onCartCheckoutProcessed={() => setCartCheckoutData(null)}
            onInternalTransition={() => {
              setTransitionColorIndex(prev => (prev + 1) % SPINNER_COLORS.length);
              setIsViewTransitioning(true);
              setTimeout(() => setIsViewTransitioning(false), 120);
            }}
            // Public POS specific props
            isPublicPOS={true}
            publicUsername={username}
          />
        )}
      </main>
    </div>
  );
}
