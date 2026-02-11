import { useState, useCallback } from 'react';

/**
 * Default tip presets - array of percentage numbers
 * Matches Dashboard.js: [7.5, 10, 12.5, 20]
 */
const DEFAULT_TIP_PRESETS = [7.5, 10, 12.5, 20];

/**
 * Default username validation state
 */
const DEFAULT_USERNAME_VALIDATION = {
  status: null,
  message: '',
  isValidating: false,
};

/**
 * LocalStorage keys - using blinkpos-* prefix to match Dashboard.js
 */
const STORAGE_KEYS = {
  TIPS_ENABLED: 'blinkpos-tips-enabled',
  TIP_PRESETS: 'blinkpos-tip-presets',
  ACTIVE_TIP_PROFILE: 'blinkpos-active-tip-profile',
};

/**
 * Helper to safely parse JSON from localStorage
 * @param {string|null} value - Value to parse
 * @param {*} fallback - Fallback value if parsing fails
 * @returns {*} Parsed value or fallback
 */
function safeParseJson(value, fallback) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

/**
 * Helper to check if code is running in browser
 * @returns {boolean}
 */
function isBrowser() {
  return typeof window !== 'undefined' && typeof localStorage !== 'undefined';
}

/**
 * Hook for managing tip settings state
 * 
 * Extracted from Dashboard.js to manage:
 * - Tips enabled/disabled toggle
 * - Tip percentage presets (number[])
 * - Tip recipient configuration
 * - Username validation state
 * - Tip profiles for different preset configurations
 * 
 * Note: UI visibility states (showTipSettings, showTipProfileSettings)
 * are managed by useUIVisibility hook.
 * 
 * @returns {Object} Tip settings state and actions
 */
export function useTipSettings() {
  // Core tip settings with localStorage persistence
  const [tipsEnabled, setTipsEnabled] = useState(() => {
    if (!isBrowser()) return false;
    const stored = localStorage.getItem(STORAGE_KEYS.TIPS_ENABLED);
    return stored === 'true';
  });

  const [tipPresets, setTipPresets] = useState(() => {
    if (!isBrowser()) return DEFAULT_TIP_PRESETS;
    const stored = localStorage.getItem(STORAGE_KEYS.TIP_PRESETS);
    return safeParseJson(stored, DEFAULT_TIP_PRESETS);
  });

  // Tip recipient state
  const [tipRecipient, setTipRecipient] = useState('');
  const [usernameValidation, setUsernameValidation] = useState(DEFAULT_USERNAME_VALIDATION);

  // Tip profiles
  const [activeTipProfile, setActiveTipProfile] = useState(() => {
    if (!isBrowser()) return null;
    const stored = localStorage.getItem(STORAGE_KEYS.ACTIVE_TIP_PROFILE);
    return safeParseJson(stored, null);
  });

  /**
   * Wrapper for setTipsEnabled that persists to localStorage
   */
  const setTipsEnabledPersistent = useCallback((value) => {
    setTipsEnabled((prev) => {
      const newValue = typeof value === 'function' ? value(prev) : value;
      if (isBrowser()) {
        localStorage.setItem(STORAGE_KEYS.TIPS_ENABLED, String(newValue));
      }
      return newValue;
    });
  }, []);

  /**
   * Wrapper for setTipPresets that persists to localStorage
   */
  const setTipPresetsPersistent = useCallback((value) => {
    setTipPresets((prev) => {
      const newValue = typeof value === 'function' ? value(prev) : value;
      if (isBrowser()) {
        localStorage.setItem(STORAGE_KEYS.TIP_PRESETS, JSON.stringify(newValue));
      }
      return newValue;
    });
  }, []);

  /**
   * Wrapper for setActiveTipProfile that persists to localStorage
   */
  const setActiveTipProfilePersistent = useCallback((value) => {
    setActiveTipProfile((prev) => {
      const newValue = typeof value === 'function' ? value(prev) : value;
      if (isBrowser()) {
        if (newValue) {
          localStorage.setItem(STORAGE_KEYS.ACTIVE_TIP_PROFILE, JSON.stringify(newValue));
        } else {
          localStorage.removeItem(STORAGE_KEYS.ACTIVE_TIP_PROFILE);
        }
      }
      return newValue;
    });
  }, []);

  /**
   * Clear username validation state
   */
  const clearUsernameValidation = useCallback(() => {
    setUsernameValidation(DEFAULT_USERNAME_VALIDATION);
  }, []);

  /**
   * Reset tip recipient and validation
   */
  const resetTipRecipient = useCallback(() => {
    setTipRecipient('');
    setUsernameValidation(DEFAULT_USERNAME_VALIDATION);
  }, []);

  /**
   * Toggle tips enabled state
   */
  const toggleTipsEnabled = useCallback(() => {
    setTipsEnabledPersistent((prev) => !prev);
  }, [setTipsEnabledPersistent]);

  return {
    // Core tip settings
    tipsEnabled,
    setTipsEnabled: setTipsEnabledPersistent,
    tipPresets,
    setTipPresets: setTipPresetsPersistent,

    // Tip recipient
    tipRecipient,
    setTipRecipient,
    usernameValidation,
    setUsernameValidation,

    // Tip profiles
    activeTipProfile,
    setActiveTipProfile: setActiveTipProfilePersistent,

    // Utility functions
    clearUsernameValidation,
    resetTipRecipient,
    toggleTipsEnabled,
  };
}

export default useTipSettings;
