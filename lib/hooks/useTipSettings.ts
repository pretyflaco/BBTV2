import { useState, useCallback } from 'react';

/**
 * Validation status for tip recipient
 */
export type ValidationStatus = 'success' | 'error' | 'validating' | null;

/**
 * Username validation state
 */
export interface UsernameValidationState {
  status: ValidationStatus;
  message: string;
  isValidating: boolean;
}

/**
 * Tip profile for preset configurations
 * Matches Dashboard.js TIP_PROFILES structure: { id, name, tipOptions }
 */
export interface TipProfile {
  id: string;
  name: string;
  tipOptions: number[];
}

/**
 * Return type for useTipSettings hook
 */
export interface UseTipSettingsReturn {
  // Core tip settings
  tipsEnabled: boolean;
  setTipsEnabled: React.Dispatch<React.SetStateAction<boolean>>;
  tipPresets: number[];
  setTipPresets: React.Dispatch<React.SetStateAction<number[]>>;

  // Tip recipient
  tipRecipient: string;
  setTipRecipient: React.Dispatch<React.SetStateAction<string>>;
  usernameValidation: UsernameValidationState;
  setUsernameValidation: React.Dispatch<React.SetStateAction<UsernameValidationState>>;

  // Tip profiles
  activeTipProfile: TipProfile | null;
  setActiveTipProfile: React.Dispatch<React.SetStateAction<TipProfile | null>>;

  // Utility functions
  clearUsernameValidation: () => void;
  resetTipRecipient: () => void;
  toggleTipsEnabled: () => void;
}

/**
 * Default tip presets - array of percentage numbers
 * Matches Dashboard.js: [7.5, 10, 12.5, 20]
 */
const DEFAULT_TIP_PRESETS: number[] = [7.5, 10, 12.5, 20];

/**
 * Default username validation state
 */
const DEFAULT_USERNAME_VALIDATION: UsernameValidationState = {
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
} as const;

/**
 * Helper to safely parse JSON from localStorage
 */
function safeParseJson<T>(value: string | null, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

/**
 * Helper to check if code is running in browser
 */
function isBrowser(): boolean {
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
 */
export function useTipSettings(): UseTipSettingsReturn {
  // Core tip settings with localStorage persistence
  const [tipsEnabled, setTipsEnabled] = useState<boolean>(() => {
    if (!isBrowser()) return false;
    const stored = localStorage.getItem(STORAGE_KEYS.TIPS_ENABLED);
    return stored === 'true';
  });

  const [tipPresets, setTipPresets] = useState<number[]>(() => {
    if (!isBrowser()) return DEFAULT_TIP_PRESETS;
    const stored = localStorage.getItem(STORAGE_KEYS.TIP_PRESETS);
    return safeParseJson(stored, DEFAULT_TIP_PRESETS);
  });

  // Tip recipient state
  const [tipRecipient, setTipRecipient] = useState<string>('');
  const [usernameValidation, setUsernameValidation] = useState<UsernameValidationState>(
    DEFAULT_USERNAME_VALIDATION
  );

  // Tip profiles
  const [activeTipProfile, setActiveTipProfile] = useState<TipProfile | null>(() => {
    if (!isBrowser()) return null;
    const stored = localStorage.getItem(STORAGE_KEYS.ACTIVE_TIP_PROFILE);
    return safeParseJson(stored, null);
  });

  /**
   * Wrapper for setTipsEnabled that persists to localStorage
   */
  const setTipsEnabledPersistent = useCallback((value: boolean | ((prev: boolean) => boolean)) => {
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
  const setTipPresetsPersistent = useCallback((value: number[] | ((prev: number[]) => number[])) => {
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
  const setActiveTipProfilePersistent = useCallback((value: TipProfile | null | ((prev: TipProfile | null) => TipProfile | null)) => {
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
  const clearUsernameValidation = useCallback((): void => {
    setUsernameValidation(DEFAULT_USERNAME_VALIDATION);
  }, []);

  /**
   * Reset tip recipient and validation
   */
  const resetTipRecipient = useCallback((): void => {
    setTipRecipient('');
    setUsernameValidation(DEFAULT_USERNAME_VALIDATION);
  }, []);

  /**
   * Toggle tips enabled state
   */
  const toggleTipsEnabled = useCallback((): void => {
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
