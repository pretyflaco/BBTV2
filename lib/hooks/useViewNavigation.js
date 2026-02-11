/**
 * useViewNavigation Hook
 * 
 * Manages view navigation and transition state for the Dashboard.
 * Handles switching between different views (POS, cart, voucher, etc.)
 * with animated transitions.
 * 
 * @module lib/hooks/useViewNavigation
 */

import { useState, useCallback, useMemo } from 'react';

// ============================================================================
// Constants
// ============================================================================

/**
 * Spinner colors for view transitions
 * @type {readonly string[]}
 */
export const SPINNER_COLORS = [
  'border-blue-600',    // Digits
  'border-green-600',   // OK/Continue
  'border-orange-500',  // Backspace
  'border-red-600',     // Clear
  'border-yellow-500',  // Skip tip
  'border-purple-600',  // Variety
  'border-cyan-500',    // Variety
  'border-pink-500',    // Variety
];

/**
 * Default transition delay in milliseconds
 * @type {number}
 */
export const DEFAULT_TRANSITION_DELAY = 300;

/**
 * Views that have fixed layout (no scrolling)
 * @type {string[]}
 */
export const FIXED_VIEWS = ['pos', 'cart', 'voucher', 'multivoucher', 'vouchermanager'];

/**
 * Voucher-related views
 * @type {string[]}
 */
export const VOUCHER_VIEWS = ['voucher', 'multivoucher', 'vouchermanager'];

// ============================================================================
// Hook Implementation
// ============================================================================

/**
 * Hook for managing view navigation and transitions
 * 
 * @param {string} [initialView='pos'] - Initial view to display
 * @returns {Object} View navigation state and actions
 * 
 * @example
 * ```jsx
 * const {
 *   currentView,
 *   isViewTransitioning,
 *   navigateToView,
 *   toggleSideMenu
 * } = useViewNavigation('pos');
 * 
 * // Navigate to transactions with transition
 * navigateToView('transactions');
 * 
 * // Toggle side menu
 * toggleSideMenu();
 * ```
 */
export function useViewNavigation(initialView = 'pos') {
  // ===========================================================================
  // Core State
  // ===========================================================================
  
  /** @type {[string, function]} */
  const [currentView, setCurrentViewState] = useState(initialView);
  
  /** @type {[boolean, function]} */
  const [isViewTransitioning, setIsViewTransitioning] = useState(false);
  
  /** @type {[number, function]} */
  const [transitionColorIndex, setTransitionColorIndex] = useState(0);
  
  /** @type {[Object|null, function]} */
  const [cartCheckoutData, setCartCheckoutData] = useState(null);
  
  /** @type {[boolean, function]} */
  const [sideMenuOpen, setSideMenuOpen] = useState(false);

  // ===========================================================================
  // Derived State
  // ===========================================================================
  
  /** @type {boolean} */
  const isFixedView = useMemo(() => 
    FIXED_VIEWS.includes(currentView), 
    [currentView]
  );
  
  /** @type {boolean} */
  const isVoucherRelatedView = useMemo(() => 
    VOUCHER_VIEWS.includes(currentView), 
    [currentView]
  );
  
  /** @type {string} */
  const currentSpinnerColor = useMemo(() => 
    SPINNER_COLORS[transitionColorIndex], 
    [transitionColorIndex]
  );
  
  /** @type {boolean} */
  const canNavigateLeft = useMemo(() => {
    return currentView === 'cart' || 
           currentView === 'pos' || 
           currentView === 'multivoucher' || 
           currentView === 'voucher';
  }, [currentView]);
  
  /** @type {boolean} */
  const canNavigateRight = useMemo(() => {
    return currentView === 'transactions' || 
           currentView === 'pos' || 
           currentView === 'vouchermanager' || 
           currentView === 'voucher';
  }, [currentView]);
  
  /** @type {boolean} */
  const canNavigateUp = useMemo(() => {
    return currentView === 'pos' || currentView === 'voucher';
  }, [currentView]);

  // ===========================================================================
  // Core Setters
  // ===========================================================================
  
  /**
   * Set the current view directly
   * @param {string} view - The view to set
   */
  const setCurrentView = useCallback((view) => {
    setCurrentViewState(view);
  }, []);

  // ===========================================================================
  // Convenience Actions
  // ===========================================================================
  
  /**
   * Advance spinner color to next in sequence
   */
  const advanceSpinnerColor = useCallback(() => {
    setTransitionColorIndex(prev => (prev + 1) % SPINNER_COLORS.length);
  }, []);
  
  /**
   * Navigate to a view with transition animation
   * @param {string} view - The view to navigate to
   * @param {number} [transitionDelay=300] - Delay for transition animation
   */
  const navigateToView = useCallback((view, transitionDelay = DEFAULT_TRANSITION_DELAY) => {
    if (view === currentView) return;
    
    // Advance spinner color
    advanceSpinnerColor();
    
    // Start transition
    setIsViewTransitioning(true);
    
    // After delay, switch view and end transition
    setTimeout(() => {
      setCurrentViewState(view);
      setIsViewTransitioning(false);
    }, transitionDelay);
  }, [currentView, advanceSpinnerColor]);
  
  /**
   * Toggle side menu open/closed
   */
  const toggleSideMenu = useCallback(() => {
    setSideMenuOpen(prev => !prev);
  }, []);
  
  /**
   * Open side menu
   */
  const openSideMenu = useCallback(() => {
    setSideMenuOpen(true);
  }, []);
  
  /**
   * Close side menu
   */
  const closeSideMenu = useCallback(() => {
    setSideMenuOpen(false);
  }, []);
  
  /**
   * Clear cart checkout data
   */
  const clearCartCheckoutData = useCallback(() => {
    setCartCheckoutData(null);
  }, []);
  
  /**
   * Navigate left (swipe left gesture)
   * cart <- pos <- voucher <- multivoucher <- vouchermanager <- transactions
   * @param {boolean} [hasVoucherWallet=false] - Whether voucher wallet is available
   */
  const navigateLeft = useCallback((hasVoucherWallet = false) => {
    if (currentView === 'cart') {
      navigateToView('pos');
    } else if (currentView === 'pos') {
      navigateToView('transactions');
    } else if (currentView === 'multivoucher' && hasVoucherWallet) {
      navigateToView('vouchermanager');
    } else if (currentView === 'voucher' && hasVoucherWallet) {
      navigateToView('multivoucher');
    }
  }, [currentView, navigateToView]);
  
  /**
   * Navigate right (swipe right gesture)
   * cart -> pos -> voucher -> multivoucher -> vouchermanager -> transactions
   * @param {boolean} [hasVoucherWallet=false] - Whether voucher wallet is available
   */
  const navigateRight = useCallback((hasVoucherWallet = false) => {
    if (currentView === 'transactions') {
      navigateToView('pos');
    } else if (currentView === 'pos') {
      navigateToView('cart');
    } else if (currentView === 'vouchermanager' && hasVoucherWallet) {
      navigateToView('multivoucher');
    } else if (currentView === 'voucher' && hasVoucherWallet) {
      navigateToView('pos');
    }
  }, [currentView, navigateToView]);
  
  /**
   * Navigate up (swipe up gesture) - for voucher views
   * @param {boolean} [hasVoucherWallet=false] - Whether voucher wallet is available
   */
  const navigateUp = useCallback((hasVoucherWallet = false) => {
    if (!hasVoucherWallet) return;
    
    if (currentView === 'pos') {
      navigateToView('voucher');
    } else if (currentView === 'voucher') {
      navigateToView('pos');
    }
  }, [currentView, navigateToView]);

  // ===========================================================================
  // Return
  // ===========================================================================
  
  return {
    // Core state
    currentView,
    isViewTransitioning,
    transitionColorIndex,
    cartCheckoutData,
    sideMenuOpen,
    
    // Derived state
    isFixedView,
    isVoucherRelatedView,
    currentSpinnerColor,
    canNavigateLeft,
    canNavigateRight,
    canNavigateUp,
    
    // Core setters
    setCurrentView,
    setIsViewTransitioning,
    setTransitionColorIndex,
    setCartCheckoutData,
    setSideMenuOpen,
    
    // Convenience actions
    navigateToView,
    toggleSideMenu,
    openSideMenu,
    closeSideMenu,
    advanceSpinnerColor,
    clearCartCheckoutData,
    navigateLeft,
    navigateRight,
    navigateUp,
  };
}

export default useViewNavigation;
