import { useState, useCallback } from 'react';

/**
 * Default tip presets
 */
const DEFAULT_TIP_PRESETS = [
  { percent: 15, enabled: true },
  { percent: 18, enabled: true },
  { percent: 20, enabled: true },
];

/**
 * Default username validation state
 */
const DEFAULT_USERNAME_VALIDATION = {
  status: null,
  message: '',
  isValidating: false,
};

/**
 * LocalStorage keys
 */
const STORAGE_KEYS = {
  TIPS_ENABLED: 'bbt_tips_enabled',
  TIP_PRESETS: 'bbt_tip_presets',
  ACTIVE_TIP_PROFILE: 'bbt_active_tip_profile',
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
 * - Tip percentage presets
 * - Tip recipient configuration
 * - Username validation state
 * - Tip profiles for different preset configurations
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

  // UI state
  const [showTipSettings, setShowTipSettings] = useState(false);
  const [showTipProfileSettings, setShowTipProfileSettings] = useState(false);

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

  /**
   * Update a specific tip preset
   * @param {number} index - Index of preset to update
   * @param {Object} updates - Partial preset updates
   */
  const updateTipPreset = useCallback((index, updates) => {
    setTipPresetsPersistent((prev) => {
      if (index < 0 || index >= prev.length) return prev;
      const updated = [...prev];
      updated[index] = { ...updated[index], ...updates };
      return updated;
    });
  }, [setTipPresetsPersistent]);

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

    // UI state
    showTipSettings,
    setShowTipSettings,
    showTipProfileSettings,
    setShowTipProfileSettings,

    // Utility functions
    clearUsernameValidation,
    resetTipRecipient,
    toggleTipsEnabled,
    updateTipPreset,
  };
}

export default useTipSettings;
