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
 * Tip preset configuration
 */
export interface TipPreset {
  percent: number;
  enabled: boolean;
}

/**
 * Tip profile for preset configurations
 */
export interface TipProfile {
  id: string;
  label: string;
  presets: TipPreset[];
}

/**
 * Return type for useTipSettings hook
 */
export interface UseTipSettingsReturn {
  // Core tip settings
  tipsEnabled: boolean;
  setTipsEnabled: React.Dispatch<React.SetStateAction<boolean>>;
  tipPresets: TipPreset[];
  setTipPresets: React.Dispatch<React.SetStateAction<TipPreset[]>>;

  // Tip recipient
  tipRecipient: string;
  setTipRecipient: React.Dispatch<React.SetStateAction<string>>;
  usernameValidation: UsernameValidationState;
  setUsernameValidation: React.Dispatch<React.SetStateAction<UsernameValidationState>>;

  // Tip profiles
  activeTipProfile: TipProfile | null;
  setActiveTipProfile: React.Dispatch<React.SetStateAction<TipProfile | null>>;

  // UI state
  showTipSettings: boolean;
  setShowTipSettings: React.Dispatch<React.SetStateAction<boolean>>;
  showTipProfileSettings: boolean;
  setShowTipProfileSettings: React.Dispatch<React.SetStateAction<boolean>>;

  // Utility functions
  clearUsernameValidation: () => void;
  resetTipRecipient: () => void;
  toggleTipsEnabled: () => void;
  updateTipPreset: (index: number, updates: Partial<TipPreset>) => void;
}

/**
 * Default tip presets
 */
const DEFAULT_TIP_PRESETS: TipPreset[] = [
  { percent: 15, enabled: true },
  { percent: 18, enabled: true },
  { percent: 20, enabled: true },
];

/**
 * Default username validation state
 */
const DEFAULT_USERNAME_VALIDATION: UsernameValidationState = {
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
 * - Tip percentage presets
 * - Tip recipient configuration
 * - Username validation state
 * - Tip profiles for different preset configurations
 */
export function useTipSettings(): UseTipSettingsReturn {
  // Core tip settings with localStorage persistence
  const [tipsEnabled, setTipsEnabled] = useState<boolean>(() => {
    if (!isBrowser()) return false;
    const stored = localStorage.getItem(STORAGE_KEYS.TIPS_ENABLED);
    return stored === 'true';
  });

  const [tipPresets, setTipPresets] = useState<TipPreset[]>(() => {
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

  // UI state
  const [showTipSettings, setShowTipSettings] = useState<boolean>(false);
  const [showTipProfileSettings, setShowTipProfileSettings] = useState<boolean>(false);

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
  const setTipPresetsPersistent = useCallback((value: TipPreset[] | ((prev: TipPreset[]) => TipPreset[])) => {
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

  /**
   * Update a specific tip preset
   */
  const updateTipPreset = useCallback((index: number, updates: Partial<TipPreset>): void => {
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
