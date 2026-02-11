import { useState, useEffect, useRef, useCallback } from 'react';
import { usePublicPOSSettings } from '../lib/hooks/usePublicPOSSettings';
import { usePublicPOSViewState } from '../lib/hooks/usePublicPOSViewState';
import { usePublicPOSPayment } from '../lib/hooks/usePublicPOSPayment';
import { usePublicPOSMenuState } from '../lib/hooks/usePublicPOSMenuState';
import PublicPOSSideMenu from './PublicPOS/PublicPOSSideMenu';
import PublicPOSCurrencyOverlay from './PublicPOS/PublicPOSCurrencyOverlay';
import PublicPOSRegionalOverlay from './PublicPOS/PublicPOSRegionalOverlay';
import PublicPOSSoundOverlay from './PublicPOS/PublicPOSSoundOverlay';
import PublicPOSPaycodeOverlay from './PublicPOS/PublicPOSPaycodeOverlay';
import { useCurrencies } from '../lib/hooks/useCurrencies';
import { useTheme, THEMES } from '../lib/hooks/useTheme';
import { useNFC } from './NFCPayment';
import { isBitcoinCurrency } from '../lib/currency-utils';
import { getApiUrl, getEnvironment, isStaging } from '../lib/config/api';
import StagingBanner from './StagingBanner';
import POS from './POS';
import ItemCart from './ItemCart';
import PaymentAnimation from './PaymentAnimation';


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

export default function PublicPOSDashboard({ username }) {
  const { currencies, loading: currenciesLoading, getAllCurrencies, popularCurrencyIds, addToPopular, removeFromPopular, isPopularCurrency } = useCurrencies();
  const { theme, cycleTheme, darkMode } = useTheme();
  
  // Username validation state - validates against current environment (production or staging)
  const [validationError, setValidationError] = useState(null);
  const [validating, setValidating] = useState(true); // Start true - validate on mount
  const [validatedWalletCurrency, setValidatedWalletCurrency] = useState('BTC');
  
  // Helper functions for consistent theme styling across all menus/submenus
  const isBlinkClassic = theme === 'blink-classic-dark' || theme === 'blink-classic-light';
  
  // Menu tile styling (for main menu items)
  const getMenuTileClasses = () => {
    switch (theme) {
      case 'blink-classic-dark':
        return 'bg-transparent border border-blink-classic-border hover:bg-blink-classic-bg hover:border-blink-classic-amber';
      case 'blink-classic-light':
        return 'bg-transparent border border-blink-classic-border-light hover:bg-blink-classic-hover-light hover:border-blink-classic-amber';
      case 'light':
        return 'bg-gray-50 hover:bg-gray-100';
      case 'dark':
      default:
        return 'bg-gray-900 hover:bg-gray-800';
    }
  };
  
  // Submenu overlay background
  const getSubmenuBgClasses = () => {
    switch (theme) {
      case 'blink-classic-dark':
        return 'bg-black';
      case 'blink-classic-light':
        return 'bg-white';
      default:
        return 'bg-white dark:bg-black';
    }
  };
  
  // Submenu header styling
  const getSubmenuHeaderClasses = () => {
    switch (theme) {
      case 'blink-classic-dark':
        return 'bg-black border-b border-blink-classic-border';
      case 'blink-classic-light':
        return 'bg-white border-b border-blink-classic-border-light';
      default:
        return 'bg-gray-50 dark:bg-blink-dark shadow dark:shadow-black';
    }
  };
  
  // Selection tile styling (for option buttons in submenus) - unselected state
  const getSelectionTileClasses = () => {
    switch (theme) {
      case 'blink-classic-dark':
        return 'border-blink-classic-border bg-transparent hover:bg-blink-classic-bg hover:border-blink-classic-amber';
      case 'blink-classic-light':
        return 'border-blink-classic-border-light bg-transparent hover:bg-blink-classic-hover-light hover:border-blink-classic-amber';
      default:
        return 'border-gray-300 dark:border-gray-700 bg-white dark:bg-blink-dark hover:border-gray-400 dark:hover:border-gray-600';
    }
  };
  
  // Selection tile styling - selected/active state
  const getSelectionTileActiveClasses = () => {
    switch (theme) {
      case 'blink-classic-dark':
        return 'border-blink-classic-amber bg-blink-classic-bg';
      case 'blink-classic-light':
        return 'border-blink-classic-amber bg-blink-classic-hover-light';
      default:
        return 'border-blink-accent bg-blink-accent/10';
    }
  };
  
  // Refs (declared before hooks that need them)
  const posRef = useRef(null);
  const cartRef = useRef(null);
  const posPaymentReceivedRef = useRef(null);

  // View navigation state
  const {
    currentView, isViewTransitioning, transitionColorIndex,
    cartCheckoutData, setCartCheckoutData,
    showingInvoice, setShowingInvoice,
    handleViewTransition, handleInternalTransition,
    SPINNER_COLORS,
  } = usePublicPOSViewState({ cartRef });
  
  // Payment state and polling
  const {
    currentInvoice, paymentSuccess, paymentData,
    handleInvoiceChange, handlePaymentAnimationHide,
  } = usePublicPOSPayment({ showingInvoice, soundEnabled, posPaymentReceivedRef });
  
  // Exchange rate state for sats equivalent display
  const [exchangeRate, setExchangeRate] = useState(null);
  const [loadingRate, setLoadingRate] = useState(false);
  
  // Settings (display currency, number/bitcoin format, numpad layout, sound)
  const {
    displayCurrency, setDisplayCurrency,
    numberFormat, setNumberFormat,
    bitcoinFormat, setBitcoinFormat,
    numpadLayout, setNumpadLayout,
    soundEnabled, setSoundEnabled,
    soundTheme, setSoundTheme,
  } = usePublicPOSSettings();
  
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
  
  // Menu/overlay visibility state
  const {
    sideMenuOpen, setSideMenuOpen,
    showCurrencySettings, setShowCurrencySettings,
    currencyFilter, setCurrencyFilter, currencyFilterDebounced,
    showRegionalSettings, setShowRegionalSettings,
    showSoundSettings, setShowSoundSettings,
    showPaycode, setShowPaycode,
    paycodeAmount, setPaycodeAmount,
    paycodeGeneratingPdf, setPaycodeGeneratingPdf,
  } = usePublicPOSMenuState();
  
  // Touch handling refs for swipe navigation
  const touchStartX = useRef(0);
  const touchStartY = useRef(0);
  

  // Username validation - validates against current environment (production or staging)
  // SSR only checks username format, actual Blink API validation happens here
  // This allows staging-only users to work when staging is enabled
  useEffect(() => {
    const validateUser = async () => {
      setValidating(true);
      setValidationError(null);
      
      const currentEnv = getEnvironment();
      const apiUrl = getApiUrl();
      
      console.log(`[PublicPOS] Validating user '${username}' on ${currentEnv} (${apiUrl})`);
      
      try {
        const response = await fetch(apiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            query: `
              query AccountDefaultWallet($username: Username!) {
                accountDefaultWallet(username: $username) {
                  id
                  walletCurrency
                }
              }
            `,
            variables: { username }
          })
        });
        
        const data = await response.json();
        
        if (data.errors || !data.data?.accountDefaultWallet?.id) {
          console.log(`[PublicPOS] User '${username}' not found on ${currentEnv}`);
          
          const envLabel = currentEnv === 'staging' ? 'staging/signet' : 'production/mainnet';
          const otherEnv = currentEnv === 'staging' ? 'production' : 'staging';
          
          setValidationError({
            message: `User '${username}' does not exist on ${envLabel}.`,
            suggestion: currentEnv === 'staging' 
              ? `This username may exist on mainnet but not staging. Switch to production mode or use a staging username.`
              : `This username doesn't exist. Check spelling or try a different username.`,
            environment: currentEnv,
            canSwitchEnv: true
          });
        } else {
          console.log(`[PublicPOS] User '${username}' validated on ${currentEnv}:`, data.data.accountDefaultWallet);
          setValidatedWalletCurrency(data.data.accountDefaultWallet.walletCurrency || 'BTC');
          setValidationError(null);
        }
      } catch (error) {
        console.error('[PublicPOS] Error validating user:', error);
        setValidationError({
          message: `Failed to validate user '${username}'.`,
          suggestion: 'Please check your internet connection and try again.',
          environment: currentEnv,
          canSwitchEnv: false
        });
      } finally {
        setValidating(false);
      }
    };
    
    validateUser();
  }, [username]);
  

  

  // Fetch exchange rate when currency changes (for sats equivalent display)
  const fetchExchangeRate = async () => {
    if (isBitcoinCurrency(displayCurrency)) {
      setExchangeRate({ satPriceInCurrency: 1, currency: 'BTC' });
      return;
    }
    
    setLoadingRate(true);
    try {
      const response = await fetch('/api/rates/exchange-rate', {
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
      
      {/* Staging Banner */}
      <StagingBanner />
      
      {/* Username Validation Error */}
      {validationError && (
        <div className="fixed inset-0 z-[100] bg-black/80 flex items-center justify-center p-4">
          <div className={`max-w-md w-full p-6 rounded-xl ${darkMode ? 'bg-gray-900' : 'bg-white'} shadow-2xl`}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-full bg-red-500/20 flex items-center justify-center flex-shrink-0">
                <svg className="w-6 h-6 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <div>
                <h2 className="text-xl font-bold text-red-500">User Not Found</h2>
                <p className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                  {validationError.environment === 'staging' ? 'Staging/Signet' : 'Production/Mainnet'}
                </p>
              </div>
            </div>
            
            <p className={`text-sm leading-relaxed ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>
              {validationError.message}
            </p>
            <p className={`text-sm mt-2 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
              {validationError.suggestion}
            </p>
            
            <div className="mt-6 flex gap-3">
              {validationError.canSwitchEnv && (
                <a
                  href="/signin"
                  className="flex-1 px-4 py-2 text-center rounded-lg bg-blink-accent hover:bg-blue-600 text-white text-sm font-medium transition-colors"
                >
                  Switch Environment
                </a>
              )}
              <a
                href="/setuppwa"
                className={`flex-1 px-4 py-2 text-center rounded-lg text-sm font-medium transition-colors ${
                  darkMode 
                    ? 'bg-gray-800 hover:bg-gray-700 text-white' 
                    : 'bg-gray-200 hover:bg-gray-300 text-gray-900'
                }`}
              >
                Change User
              </a>
            </div>
          </div>
        </div>
      )}
      
      {/* Validation Loading */}
      {validating && (
        <div className="fixed inset-0 z-[100] bg-black/80 flex items-center justify-center">
          <div className="flex flex-col items-center gap-4">
            <div className={`animate-spin rounded-full h-12 w-12 border-4 ${isStaging() ? 'border-orange-500' : 'border-blink-accent'} border-t-transparent`}></div>
            <p className="text-white text-sm">Validating user...</p>
          </div>
        </div>
      )}
      
      {/* Header - Hidden when showing invoice */}
      {!showingInvoice && (
        <header className={`${theme === 'blink-classic-dark' ? 'bg-black' : 'bg-gray-50 dark:bg-blink-dark'} shadow dark:shadow-black sticky top-0 z-40`}>
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between py-4">
              {/* Blink Logo - Left (tap to cycle theme) */}
              <button 
                onClick={cycleTheme}
                className="flex items-center focus:outline-none"
                aria-label="Cycle theme"
              >
                {/* For Blink Classic Dark, header is black so show dark logo */}
                <img 
                  src="/logos/blink-icon-light.svg" 
                  alt="Blink" 
                  className={`h-12 w-12 ${theme === 'light' || theme === 'blink-classic-light' ? 'block' : 'hidden'}`}
                />
                <img 
                  src="/logos/blink-icon-dark.svg" 
                  alt="Blink" 
                  className={`h-12 w-12 ${theme === 'light' || theme === 'blink-classic-light' ? 'hidden' : 'block'}`}
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
        <PublicPOSSideMenu
          onClose={() => setSideMenuOpen(false)}
          theme={theme}
          cycleTheme={cycleTheme}
          displayCurrency={displayCurrency}
          numberFormat={numberFormat}
          soundEnabled={soundEnabled}
          soundTheme={soundTheme}
          onShowCurrencySettings={() => setShowCurrencySettings(true)}
          onShowRegionalSettings={() => setShowRegionalSettings(true)}
          onShowPaycode={() => { setShowPaycode(true); setSideMenuOpen(false); }}
          onShowSoundSettings={() => setShowSoundSettings(true)}
          getSubmenuBgClasses={getSubmenuBgClasses}
          getSubmenuHeaderClasses={getSubmenuHeaderClasses}
          getMenuTileClasses={getMenuTileClasses}
        />
      )}

      {/* Currency Settings Overlay */}
      {showCurrencySettings && (
        <PublicPOSCurrencyOverlay
          onClose={() => setShowCurrencySettings(false)}
          darkMode={darkMode}
          displayCurrency={displayCurrency}
          setDisplayCurrency={setDisplayCurrency}
          currencyFilter={currencyFilter}
          setCurrencyFilter={setCurrencyFilter}
          currencyFilterDebounced={currencyFilterDebounced}
          currenciesLoading={currenciesLoading}
          getAllCurrencies={getAllCurrencies}
          isPopularCurrency={isPopularCurrency}
          addToPopular={addToPopular}
          removeFromPopular={removeFromPopular}
          getSubmenuBgClasses={getSubmenuBgClasses}
          getSubmenuHeaderClasses={getSubmenuHeaderClasses}
        />
      )}

      {/* Regional Settings Overlay */}
      {showRegionalSettings && (
        <PublicPOSRegionalOverlay
          onClose={() => setShowRegionalSettings(false)}
          darkMode={darkMode}
          numberFormat={numberFormat}
          setNumberFormat={setNumberFormat}
          bitcoinFormat={bitcoinFormat}
          setBitcoinFormat={setBitcoinFormat}
          numpadLayout={numpadLayout}
          setNumpadLayout={setNumpadLayout}
          getSubmenuBgClasses={getSubmenuBgClasses}
          getSubmenuHeaderClasses={getSubmenuHeaderClasses}
        />
      )}

      {/* Sound Settings Overlay */}
      {showSoundSettings && (
        <PublicPOSSoundOverlay
          onClose={() => setShowSoundSettings(false)}
          soundEnabled={soundEnabled}
          setSoundEnabled={setSoundEnabled}
          soundTheme={soundTheme}
          setSoundTheme={setSoundTheme}
          getSubmenuBgClasses={getSubmenuBgClasses}
          getSubmenuHeaderClasses={getSubmenuHeaderClasses}
          getSelectionTileClasses={getSelectionTileClasses}
          getSelectionTileActiveClasses={getSelectionTileActiveClasses}
        />
      )}

      {/* Paycode Overlay */}
      {showPaycode && (
        <PublicPOSPaycodeOverlay
          onClose={() => setShowPaycode(false)}
          username={username}
          darkMode={darkMode}
          paycodeAmount={paycodeAmount}
          setPaycodeAmount={setPaycodeAmount}
          paycodeGeneratingPdf={paycodeGeneratingPdf}
          setPaycodeGeneratingPdf={setPaycodeGeneratingPdf}
          getSubmenuBgClasses={getSubmenuBgClasses}
          getSubmenuHeaderClasses={getSubmenuHeaderClasses}
        />
      )}

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
              theme={theme}
              cycleTheme={cycleTheme}
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
            numpadLayout={numpadLayout}
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
            theme={theme}
            cycleTheme={cycleTheme}
            nfcState={nfcState}
            activeBlinkAccount={{ username, type: 'public' }}
            cartCheckoutData={cartCheckoutData}
            onCartCheckoutProcessed={() => setCartCheckoutData(null)}
            onInternalTransition={handleInternalTransition}
            // Public POS specific props
            isPublicPOS={true}
            publicUsername={username}
          />
        )}
      </main>
    </div>
  );
}
