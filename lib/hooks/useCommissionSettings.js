import { useState, useCallback, useEffect } from 'react';

/**
 * Default commission presets
 */
const DEFAULT_COMMISSION_PRESETS = [1, 2, 3];

/**
 * LocalStorage keys
 */
const STORAGE_KEYS = {
  COMMISSION_ENABLED: 'blinkpos-commission-enabled',
  COMMISSION_PRESETS: 'blinkpos-commission-presets',
};

/**
 * Helper to check if code is running in browser
 * @returns {boolean}
 */
function isBrowser() {
  return typeof window !== 'undefined' && typeof localStorage !== 'undefined';
}

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
 * Hook for managing commission settings state
 * 
 * Extracted from Dashboard.js to manage:
 * - Commission enabled/disabled toggle
 * - Commission percentage presets for voucher creation
 * - Commission settings UI visibility
 * 
 * @returns {Object} Commission settings state and actions
 */
export function useCommissionSettings() {
  // Commission state with localStorage persistence
  const [commissionEnabled, setCommissionEnabled] = useState(() => {
    if (!isBrowser()) return false;
    return localStorage.getItem(STORAGE_KEYS.COMMISSION_ENABLED) === 'true';
  });

  const [commissionPresets, setCommissionPresets] = useState(() => {
    if (!isBrowser()) return DEFAULT_COMMISSION_PRESETS;
    const saved = localStorage.getItem(STORAGE_KEYS.COMMISSION_PRESETS);
    return safeParseJson(saved, DEFAULT_COMMISSION_PRESETS);
  });

  // UI state
  const [showCommissionSettings, setShowCommissionSettings] = useState(false);

  // Persist commission enabled to localStorage
  useEffect(() => {
    if (isBrowser()) {
      localStorage.setItem(STORAGE_KEYS.COMMISSION_ENABLED, commissionEnabled.toString());
    }
  }, [commissionEnabled]);

  // Persist commission presets to localStorage
  useEffect(() => {
    if (isBrowser()) {
      localStorage.setItem(STORAGE_KEYS.COMMISSION_PRESETS, JSON.stringify(commissionPresets));
    }
  }, [commissionPresets]);

  /**
   * Toggle commission enabled state
   */
  const toggleCommissionEnabled = useCallback(() => {
    setCommissionEnabled((prev) => !prev);
  }, []);

  /**
   * Update a specific commission preset
   * @param {number} index - Index of preset to update
   * @param {number} value - New value for the preset
   */
  const updateCommissionPreset = useCallback((index, value) => {
    setCommissionPresets((prev) => {
      if (index < 0 || index >= prev.length) return prev;
      const updated = [...prev];
      updated[index] = value;
      return updated;
    });
  }, []);

  /**
   * Reset commission presets to defaults
   */
  const resetCommissionPresets = useCallback(() => {
    setCommissionPresets(DEFAULT_COMMISSION_PRESETS);
  }, []);

  return {
    // Commission state
    commissionEnabled,
    setCommissionEnabled,
    commissionPresets,
    setCommissionPresets,

    // UI state
    showCommissionSettings,
    setShowCommissionSettings,

    // Utility functions
    toggleCommissionEnabled,
    updateCommissionPreset,
    resetCommissionPresets,
  };
}

export default useCommissionSettings;
