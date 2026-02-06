/**
 * usePreferences - Hook for cross-device synced UI preferences
 * 
 * Manages:
 * - Sound enabled/disabled
 * - Sound theme
 * - Dark mode
 * - Display currency
 * - Tips enabled
 * - Tip presets
 * 
 * Storage strategy:
 * - Primary: localStorage (fast, works offline)
 * - Secondary: Server sync (cross-device)
 */

import { useState, useCallback, useEffect, useRef } from 'react';

// localStorage keys
const PREFERENCES_KEYS = {
  soundEnabled: 'soundEnabled',
  soundTheme: 'soundTheme',
  darkMode: 'blinkpos-dark-mode',
  displayCurrency: 'blinkpos-display-currency',
  tipsEnabled: 'blinkpos-tips-enabled',
  tipPresets: 'blinkpos-tip-presets',
  activeTipProfile: 'blinkpos-active-tip-profile',
  numberFormat: 'blinkpos-number-format',
  voucherCurrencyMode: 'blinkpos-voucher-currency-mode',
  voucherExpiry: 'blinkpos-voucher-expiry'
};

// Default values
const DEFAULT_PREFERENCES = {
  soundEnabled: true,
  soundTheme: 'success',
  darkMode: false,
  displayCurrency: 'BTC',
  tipsEnabled: false,
  tipPresets: [7.5, 10, 12.5, 20],
  numberFormat: 'auto',  // Uses browser locale by default
  voucherCurrencyMode: 'BTC',  // 'BTC' for Bitcoin vouchers, 'USD' for Dollar/Stablesats vouchers
  voucherExpiry: '24h'  // Default voucher expiry (synced cross-device)
};

// Server sync debounce
const SERVER_SYNC_DEBOUNCE_MS = 2000;

/**
 * Hook for managing user preferences with cross-device sync
 * @param {string} userPubkey - User's public key for server sync
 */
export function usePreferences(userPubkey) {
  const [preferences, setPreferences] = useState(DEFAULT_PREFERENCES);
  const [loading, setLoading] = useState(true);
  const [serverSynced, setServerSynced] = useState(false);
  
  // Server sync debounce timer
  const syncTimerRef = useRef(null);
  
  // Track if initial load has happened
  const initialLoadRef = useRef(false);

  /**
   * Load preferences from localStorage
   */
  const loadFromLocalStorage = useCallback(() => {
    if (typeof window === 'undefined') return DEFAULT_PREFERENCES;
    
    try {
      return {
        soundEnabled: localStorage.getItem(PREFERENCES_KEYS.soundEnabled) !== null 
          ? JSON.parse(localStorage.getItem(PREFERENCES_KEYS.soundEnabled)) 
          : DEFAULT_PREFERENCES.soundEnabled,
        soundTheme: localStorage.getItem(PREFERENCES_KEYS.soundTheme) || DEFAULT_PREFERENCES.soundTheme,
        darkMode: localStorage.getItem(PREFERENCES_KEYS.darkMode) === 'true',
        displayCurrency: localStorage.getItem(PREFERENCES_KEYS.displayCurrency) || DEFAULT_PREFERENCES.displayCurrency,
        tipsEnabled: localStorage.getItem(PREFERENCES_KEYS.tipsEnabled) === 'true',
        tipPresets: localStorage.getItem(PREFERENCES_KEYS.tipPresets) 
          ? JSON.parse(localStorage.getItem(PREFERENCES_KEYS.tipPresets))
          : DEFAULT_PREFERENCES.tipPresets,
        numberFormat: localStorage.getItem(PREFERENCES_KEYS.numberFormat) || DEFAULT_PREFERENCES.numberFormat,
        voucherCurrencyMode: localStorage.getItem(PREFERENCES_KEYS.voucherCurrencyMode) || DEFAULT_PREFERENCES.voucherCurrencyMode,
        voucherExpiry: localStorage.getItem(PREFERENCES_KEYS.voucherExpiry) || DEFAULT_PREFERENCES.voucherExpiry
      };
    } catch (err) {
      console.error('[usePreferences] Failed to load from localStorage:', err);
      return DEFAULT_PREFERENCES;
    }
  }, []);

  /**
   * Save preferences to localStorage
   */
  const saveToLocalStorage = useCallback((prefs) => {
    if (typeof window === 'undefined') return;
    
    try {
      localStorage.setItem(PREFERENCES_KEYS.soundEnabled, JSON.stringify(prefs.soundEnabled));
      localStorage.setItem(PREFERENCES_KEYS.soundTheme, prefs.soundTheme);
      localStorage.setItem(PREFERENCES_KEYS.darkMode, prefs.darkMode.toString());
      localStorage.setItem(PREFERENCES_KEYS.displayCurrency, prefs.displayCurrency);
      localStorage.setItem(PREFERENCES_KEYS.tipsEnabled, prefs.tipsEnabled.toString());
      localStorage.setItem(PREFERENCES_KEYS.tipPresets, JSON.stringify(prefs.tipPresets));
      localStorage.setItem(PREFERENCES_KEYS.numberFormat, prefs.numberFormat);
      localStorage.setItem(PREFERENCES_KEYS.voucherCurrencyMode, prefs.voucherCurrencyMode);
      localStorage.setItem(PREFERENCES_KEYS.voucherExpiry, prefs.voucherExpiry);
    } catch (err) {
      console.error('[usePreferences] Failed to save to localStorage:', err);
    }
  }, []);

  /**
   * Sync preferences to server (debounced)
   */
  const syncToServer = useCallback(async (prefs) => {
    if (!userPubkey) return;
    
    // Clear existing timer
    if (syncTimerRef.current) {
      clearTimeout(syncTimerRef.current);
    }
    
    // Debounce the sync
    syncTimerRef.current = setTimeout(async () => {
      try {
        console.log('[usePreferences] Syncing preferences to server...');
        
        const response = await fetch('/api/user/sync', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            pubkey: userPubkey,
            field: 'preferences',
            data: prefs
          })
        });
        
        if (response.ok) {
          console.log('[usePreferences] ✓ Preferences synced to server');
          setServerSynced(true);
        } else {
          console.error('[usePreferences] Server sync failed:', response.status);
        }
      } catch (err) {
        console.error('[usePreferences] Server sync error:', err);
      }
    }, SERVER_SYNC_DEBOUNCE_MS);
  }, [userPubkey]);

  /**
   * Fetch preferences from server
   */
  const fetchFromServer = useCallback(async () => {
    if (!userPubkey) return null;
    
    try {
      console.log('[usePreferences] Fetching preferences from server...');
      const response = await fetch(`/api/user/sync?pubkey=${userPubkey}`);
      
      if (!response.ok) {
        console.error('[usePreferences] Server fetch failed:', response.status);
        return null;
      }
      
      const data = await response.json();
      return data.preferences;
    } catch (err) {
      console.error('[usePreferences] Server fetch error:', err);
      return null;
    }
  }, [userPubkey]);

  /**
   * Update a single preference
   */
  const updatePreference = useCallback((key, value) => {
    setPreferences(prev => {
      const updated = { ...prev, [key]: value };
      saveToLocalStorage(updated);
      syncToServer(updated);
      return updated;
    });
  }, [saveToLocalStorage, syncToServer]);

  /**
   * Update multiple preferences at once
   */
  const updatePreferences = useCallback((updates) => {
    setPreferences(prev => {
      const updated = { ...prev, ...updates };
      saveToLocalStorage(updated);
      syncToServer(updated);
      return updated;
    });
  }, [saveToLocalStorage, syncToServer]);

  /**
   * Reset preferences to defaults
   */
  const resetPreferences = useCallback(() => {
    setPreferences(DEFAULT_PREFERENCES);
    saveToLocalStorage(DEFAULT_PREFERENCES);
    syncToServer(DEFAULT_PREFERENCES);
  }, [saveToLocalStorage, syncToServer]);

  /**
   * Initial load: localStorage first, then server sync
   */
  useEffect(() => {
    if (initialLoadRef.current) return;
    initialLoadRef.current = true;
    
    const loadPreferences = async () => {
      setLoading(true);
      
      // Load from localStorage (fast)
      const localPrefs = loadFromLocalStorage();
      setPreferences(localPrefs);
      
      // Fetch from server for cross-device sync
      if (userPubkey) {
        const serverPrefs = await fetchFromServer();
        
        if (serverPrefs) {
          // Server has preferences - check if they're newer/different
          // Use server as source of truth for cross-device consistency
          const mergedPrefs = {
            ...DEFAULT_PREFERENCES,
            ...serverPrefs
          };
          
          setPreferences(mergedPrefs);
          saveToLocalStorage(mergedPrefs);
          setServerSynced(true);
          console.log('[usePreferences] Loaded preferences from server');
        } else {
          // No server preferences - sync local to server
          console.log('[usePreferences] No server preferences, syncing local to server');
          syncToServer(localPrefs);
        }
      }
      
      setLoading(false);
    };
    
    loadPreferences();
  }, [userPubkey, loadFromLocalStorage, fetchFromServer, saveToLocalStorage, syncToServer]);

  // Reset initial load flag when user changes
  useEffect(() => {
    initialLoadRef.current = false;
  }, [userPubkey]);

  // Cleanup sync timer on unmount
  useEffect(() => {
    return () => {
      if (syncTimerRef.current) {
        clearTimeout(syncTimerRef.current);
      }
    };
  }, []);

  return {
    preferences,
    loading,
    serverSynced,
    
    // Individual setters for convenience
    setSoundEnabled: (value) => updatePreference('soundEnabled', value),
    setSoundTheme: (value) => updatePreference('soundTheme', value),
    setDarkMode: (value) => updatePreference('darkMode', value),
    setDisplayCurrency: (value) => updatePreference('displayCurrency', value),
    setTipsEnabled: (value) => updatePreference('tipsEnabled', value),
    setTipPresets: (value) => updatePreference('tipPresets', value),
    setNumberFormat: (value) => updatePreference('numberFormat', value),
    setVoucherCurrencyMode: (value) => updatePreference('voucherCurrencyMode', value),
    setVoucherExpiry: (value) => updatePreference('voucherExpiry', value),
    
    // Batch update
    updatePreferences,
    
    // Reset
    resetPreferences,
    
    // Manual sync
    syncToServer: () => syncToServer(preferences),
    fetchFromServer
  };
}

export default usePreferences;

