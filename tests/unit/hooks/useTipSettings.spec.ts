import { renderHook, act } from '@testing-library/react';
import { useTipSettings } from '../../../lib/hooks/useTipSettings';
import type { TipProfile } from '../../../lib/hooks/useTipSettings';

describe('useTipSettings', () => {
  // Mock localStorage
  const localStorageMock = (() => {
    let store: Record<string, string> = {};
    return {
      getItem: jest.fn((key: string) => store[key] || null),
      setItem: jest.fn((key: string, value: string) => {
        store[key] = value;
      }),
      removeItem: jest.fn((key: string) => {
        delete store[key];
      }),
      clear: jest.fn(() => {
        store = {};
      }),
    };
  })();

  beforeEach(() => {
    Object.defineProperty(window, 'localStorage', {
      value: localStorageMock,
      writable: true,
    });
    localStorageMock.clear();
    jest.clearAllMocks();
  });

  // Helper to create a mock tip profile matching Dashboard.js TIP_PROFILES structure
  const createMockProfile = (overrides: Partial<TipProfile> = {}): TipProfile => ({
    id: 'na',
    name: 'North America (US/CA)',
    tipOptions: [18, 20, 25],
    ...overrides,
  });

  describe('initial state', () => {
    it('initializes with tips disabled by default', () => {
      const { result } = renderHook(() => useTipSettings());
      expect(result.current.tipsEnabled).toBe(false);
    });

    it('initializes with default tip presets as number array', () => {
      const { result } = renderHook(() => useTipSettings());
      expect(result.current.tipPresets).toEqual([7.5, 10, 12.5, 20]);
    });

    it('initializes with empty tip recipient', () => {
      const { result } = renderHook(() => useTipSettings());
      expect(result.current.tipRecipient).toBe('');
    });

    it('initializes with default username validation state', () => {
      const { result } = renderHook(() => useTipSettings());
      expect(result.current.usernameValidation).toEqual({
        status: null,
        message: '',
        isValidating: false,
      });
    });

    it('initializes with null active tip profile', () => {
      const { result } = renderHook(() => useTipSettings());
      expect(result.current.activeTipProfile).toBeNull();
    });

    it('loads tipsEnabled from localStorage if set to true', () => {
      localStorageMock.getItem.mockReturnValueOnce('true');
      const { result } = renderHook(() => useTipSettings());
      expect(result.current.tipsEnabled).toBe(true);
    });

    it('loads tipPresets from localStorage if set', () => {
      const customPresets = [5, 10, 15];
      localStorageMock.getItem
        .mockReturnValueOnce(null) // tipsEnabled
        .mockReturnValueOnce(JSON.stringify(customPresets)); // tipPresets
      const { result } = renderHook(() => useTipSettings());
      expect(result.current.tipPresets).toEqual(customPresets);
    });

    it('loads activeTipProfile from localStorage if set', () => {
      const profile = createMockProfile();
      localStorageMock.getItem
        .mockReturnValueOnce(null) // tipsEnabled
        .mockReturnValueOnce(null) // tipPresets
        .mockReturnValueOnce(JSON.stringify(profile)); // activeTipProfile
      const { result } = renderHook(() => useTipSettings());
      expect(result.current.activeTipProfile).toEqual(profile);
    });

    it('uses fallback if localStorage contains invalid JSON for tipPresets', () => {
      localStorageMock.getItem
        .mockReturnValueOnce(null) // tipsEnabled
        .mockReturnValueOnce('invalid-json'); // tipPresets
      const { result } = renderHook(() => useTipSettings());
      expect(result.current.tipPresets).toEqual([7.5, 10, 12.5, 20]);
    });

    it('uses fallback if localStorage contains invalid JSON for activeTipProfile', () => {
      localStorageMock.getItem
        .mockReturnValueOnce(null) // tipsEnabled
        .mockReturnValueOnce(null) // tipPresets
        .mockReturnValueOnce('not-valid-json'); // activeTipProfile
      const { result } = renderHook(() => useTipSettings());
      expect(result.current.activeTipProfile).toBeNull();
    });

    it('reads from correct blinkpos- localStorage keys', () => {
      renderHook(() => useTipSettings());
      expect(localStorageMock.getItem).toHaveBeenCalledWith('blinkpos-tips-enabled');
      expect(localStorageMock.getItem).toHaveBeenCalledWith('blinkpos-tip-presets');
      expect(localStorageMock.getItem).toHaveBeenCalledWith('blinkpos-active-tip-profile');
    });
  });

  describe('tipsEnabled actions', () => {
    it('setTipsEnabled enables tips', () => {
      const { result } = renderHook(() => useTipSettings());

      act(() => {
        result.current.setTipsEnabled(true);
      });

      expect(result.current.tipsEnabled).toBe(true);
      expect(localStorageMock.setItem).toHaveBeenCalledWith('blinkpos-tips-enabled', 'true');
    });

    it('setTipsEnabled disables tips', () => {
      localStorageMock.getItem.mockReturnValueOnce('true');
      const { result } = renderHook(() => useTipSettings());

      act(() => {
        result.current.setTipsEnabled(false);
      });

      expect(result.current.tipsEnabled).toBe(false);
      expect(localStorageMock.setItem).toHaveBeenCalledWith('blinkpos-tips-enabled', 'false');
    });

    it('toggleTipsEnabled toggles the state', () => {
      const { result } = renderHook(() => useTipSettings());
      expect(result.current.tipsEnabled).toBe(false);

      act(() => {
        result.current.toggleTipsEnabled();
      });
      expect(result.current.tipsEnabled).toBe(true);

      act(() => {
        result.current.toggleTipsEnabled();
      });
      expect(result.current.tipsEnabled).toBe(false);
    });

    it('setTipsEnabled accepts a function', () => {
      const { result } = renderHook(() => useTipSettings());

      act(() => {
        result.current.setTipsEnabled((prev) => !prev);
      });

      expect(result.current.tipsEnabled).toBe(true);
    });
  });

  describe('tipPresets actions', () => {
    it('setTipPresets updates presets with number array', () => {
      const { result } = renderHook(() => useTipSettings());
      const newPresets = [5, 15, 25];

      act(() => {
        result.current.setTipPresets(newPresets);
      });

      expect(result.current.tipPresets).toEqual(newPresets);
      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        'blinkpos-tip-presets',
        JSON.stringify(newPresets)
      );
    });

    it('setTipPresets persists to localStorage with blinkpos key', () => {
      const { result } = renderHook(() => useTipSettings());

      act(() => {
        result.current.setTipPresets([18, 20, 25]);
      });

      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        'blinkpos-tip-presets',
        '[18,20,25]'
      );
    });

    it('setTipPresets accepts a function', () => {
      const { result } = renderHook(() => useTipSettings());

      act(() => {
        result.current.setTipPresets((prev) => [...prev, 30]);
      });

      expect(result.current.tipPresets).toEqual([7.5, 10, 12.5, 20, 30]);
    });

    it('setTipPresets can set empty array', () => {
      const { result } = renderHook(() => useTipSettings());

      act(() => {
        result.current.setTipPresets([]);
      });

      expect(result.current.tipPresets).toEqual([]);
    });

    it('setTipPresets supports decimal percentages', () => {
      const { result } = renderHook(() => useTipSettings());

      act(() => {
        result.current.setTipPresets([2.5, 5.0, 7.5]);
      });

      expect(result.current.tipPresets).toEqual([2.5, 5.0, 7.5]);
    });
  });

  describe('tip recipient actions', () => {
    it('setTipRecipient updates the recipient', () => {
      const { result } = renderHook(() => useTipSettings());

      act(() => {
        result.current.setTipRecipient('alice');
      });

      expect(result.current.tipRecipient).toBe('alice');
    });

    it('setUsernameValidation updates validation state', () => {
      const { result } = renderHook(() => useTipSettings());

      act(() => {
        result.current.setUsernameValidation({
          status: 'validating',
          message: 'Checking...',
          isValidating: true,
        });
      });

      expect(result.current.usernameValidation).toEqual({
        status: 'validating',
        message: 'Checking...',
        isValidating: true,
      });
    });

    it('clearUsernameValidation resets validation state', () => {
      const { result } = renderHook(() => useTipSettings());

      act(() => {
        result.current.setUsernameValidation({
          status: 'success',
          message: 'Valid user',
          isValidating: false,
        });
      });

      act(() => {
        result.current.clearUsernameValidation();
      });

      expect(result.current.usernameValidation).toEqual({
        status: null,
        message: '',
        isValidating: false,
      });
    });

    it('resetTipRecipient clears recipient and validation', () => {
      const { result } = renderHook(() => useTipSettings());

      act(() => {
        result.current.setTipRecipient('bob');
        result.current.setUsernameValidation({
          status: 'success',
          message: 'Valid',
          isValidating: false,
        });
      });

      act(() => {
        result.current.resetTipRecipient();
      });

      expect(result.current.tipRecipient).toBe('');
      expect(result.current.usernameValidation).toEqual({
        status: null,
        message: '',
        isValidating: false,
      });
    });
  });

  describe('tip profile actions', () => {
    it('setActiveTipProfile sets the active profile', () => {
      const { result } = renderHook(() => useTipSettings());
      const profile = createMockProfile();

      act(() => {
        result.current.setActiveTipProfile(profile);
      });

      expect(result.current.activeTipProfile).toEqual(profile);
      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        'blinkpos-active-tip-profile',
        JSON.stringify(profile)
      );
    });

    it('setActiveTipProfile can clear the profile', () => {
      const { result } = renderHook(() => useTipSettings());

      act(() => {
        result.current.setActiveTipProfile(createMockProfile());
      });

      act(() => {
        result.current.setActiveTipProfile(null);
      });

      expect(result.current.activeTipProfile).toBeNull();
      expect(localStorageMock.removeItem).toHaveBeenCalledWith('blinkpos-active-tip-profile');
    });

    it('setActiveTipProfile accepts a function', () => {
      const { result } = renderHook(() => useTipSettings());
      const profile = createMockProfile();

      act(() => {
        result.current.setActiveTipProfile(profile);
      });

      act(() => {
        result.current.setActiveTipProfile((prev) => 
          prev ? { ...prev, name: 'Updated Name' } : null
        );
      });

      expect(result.current.activeTipProfile?.name).toBe('Updated Name');
    });

    it('profile structure matches Dashboard.js TIP_PROFILES format', () => {
      const { result } = renderHook(() => useTipSettings());

      // Matches: { id: 'na', name: 'North America (US/CA)', tipOptions: [18, 20, 25] }
      const profile: TipProfile = {
        id: 'eu',
        name: 'Western Europe (Standard)',
        tipOptions: [5, 10, 15],
      };

      act(() => {
        result.current.setActiveTipProfile(profile);
      });

      expect(result.current.activeTipProfile).toEqual(profile);
      expect(result.current.activeTipProfile?.id).toBe('eu');
      expect(result.current.activeTipProfile?.name).toBe('Western Europe (Standard)');
      expect(result.current.activeTipProfile?.tipOptions).toEqual([5, 10, 15]);
    });

    it('handles all predefined TIP_PROFILES from Dashboard.js', () => {
      const { result } = renderHook(() => useTipSettings());

      const tipProfiles: TipProfile[] = [
        { id: 'na', name: 'North America (US/CA)', tipOptions: [18, 20, 25] },
        { id: 'eu', name: 'Western Europe (Standard)', tipOptions: [5, 10, 15] },
        { id: 'africa', name: 'Africa (Standard/South)', tipOptions: [10, 12, 15] },
        { id: 'africa-low', name: 'Africa (Low/Round Up)', tipOptions: [5, 10] },
        { id: 'asia', name: 'Asia & Oceania (Low)', tipOptions: [2, 5, 10] },
        { id: 'latam', name: 'Latin America (Included)', tipOptions: [10, 12, 15] },
        { id: 'mena', name: 'Middle East (Variable)', tipOptions: [5, 10, 15] },
      ];

      for (const profile of tipProfiles) {
        act(() => {
          result.current.setActiveTipProfile(profile);
        });
        expect(result.current.activeTipProfile).toEqual(profile);
      }
    });
  });

  describe('does not expose UI visibility states', () => {
    it('does not have showTipSettings (managed by useUIVisibility)', () => {
      const { result } = renderHook(() => useTipSettings());
      expect((result.current as any).showTipSettings).toBeUndefined();
    });

    it('does not have showTipProfileSettings (managed by useUIVisibility)', () => {
      const { result } = renderHook(() => useTipSettings());
      expect((result.current as any).showTipProfileSettings).toBeUndefined();
    });

    it('does not have updateTipPreset (not applicable to number[])', () => {
      const { result } = renderHook(() => useTipSettings());
      expect((result.current as any).updateTipPreset).toBeUndefined();
    });
  });

  describe('callback stability', () => {
    it('setTipsEnabled maintains referential equality', () => {
      const { result, rerender } = renderHook(() => useTipSettings());
      const firstRef = result.current.setTipsEnabled;

      rerender();

      expect(result.current.setTipsEnabled).toBe(firstRef);
    });

    it('setTipPresets maintains referential equality', () => {
      const { result, rerender } = renderHook(() => useTipSettings());
      const firstRef = result.current.setTipPresets;

      rerender();

      expect(result.current.setTipPresets).toBe(firstRef);
    });

    it('setActiveTipProfile maintains referential equality', () => {
      const { result, rerender } = renderHook(() => useTipSettings());
      const firstRef = result.current.setActiveTipProfile;

      rerender();

      expect(result.current.setActiveTipProfile).toBe(firstRef);
    });

    it('clearUsernameValidation maintains referential equality', () => {
      const { result, rerender } = renderHook(() => useTipSettings());
      const firstRef = result.current.clearUsernameValidation;

      rerender();

      expect(result.current.clearUsernameValidation).toBe(firstRef);
    });

    it('resetTipRecipient maintains referential equality', () => {
      const { result, rerender } = renderHook(() => useTipSettings());
      const firstRef = result.current.resetTipRecipient;

      rerender();

      expect(result.current.resetTipRecipient).toBe(firstRef);
    });

    it('toggleTipsEnabled maintains referential equality', () => {
      const { result, rerender } = renderHook(() => useTipSettings());
      const firstRef = result.current.toggleTipsEnabled;

      rerender();

      expect(result.current.toggleTipsEnabled).toBe(firstRef);
    });
  });

  describe('typical workflow scenarios', () => {
    it('handles enable tips and set recipient workflow', () => {
      const { result } = renderHook(() => useTipSettings());

      // User enables tips
      act(() => {
        result.current.setTipsEnabled(true);
      });

      // User sets tip recipient
      act(() => {
        result.current.setTipRecipient('server123');
      });

      // Validation in progress
      act(() => {
        result.current.setUsernameValidation({
          status: 'validating',
          message: 'Validating...',
          isValidating: true,
        });
      });

      // Validation succeeds
      act(() => {
        result.current.setUsernameValidation({
          status: 'success',
          message: 'Valid Blink user',
          isValidating: false,
        });
      });

      expect(result.current.tipsEnabled).toBe(true);
      expect(result.current.tipRecipient).toBe('server123');
      expect(result.current.usernameValidation.status).toBe('success');
    });

    it('handles customize tip presets workflow with number array', () => {
      const { result } = renderHook(() => useTipSettings());

      // Direct array replacement (how Dashboard.js works)
      act(() => {
        result.current.setTipPresets([15, 18, 20, 25]);
      });

      expect(result.current.tipPresets).toEqual([15, 18, 20, 25]);
      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        'blinkpos-tip-presets',
        '[15,18,20,25]'
      );
    });

    it('handles switch tip profile workflow', () => {
      const { result } = renderHook(() => useTipSettings());

      const naProfile = createMockProfile({
        id: 'na',
        name: 'North America (US/CA)',
        tipOptions: [18, 20, 25],
      });

      const euProfile = createMockProfile({
        id: 'eu',
        name: 'Western Europe (Standard)',
        tipOptions: [5, 10, 15],
      });

      // Set NA profile
      act(() => {
        result.current.setActiveTipProfile(naProfile);
      });

      expect(result.current.activeTipProfile?.id).toBe('na');

      // Switch to EU profile
      act(() => {
        result.current.setActiveTipProfile(euProfile);
      });

      expect(result.current.activeTipProfile?.id).toBe('eu');
      expect(result.current.activeTipProfile?.tipOptions).toEqual([5, 10, 15]);
    });

    it('handles profile selection syncing tipPresets (Dashboard pattern)', () => {
      const { result } = renderHook(() => useTipSettings());

      // Simulate Dashboard.js pattern: when profile changes, sync tipPresets
      const profile = createMockProfile({
        id: 'asia',
        name: 'Asia & Oceania (Low)',
        tipOptions: [2, 5, 10],
      });

      act(() => {
        result.current.setActiveTipProfile(profile);
        // Dashboard.js does: setTipPresets(activeTipProfile.tipOptions)
        result.current.setTipPresets(profile.tipOptions);
      });

      expect(result.current.activeTipProfile?.tipOptions).toEqual([2, 5, 10]);
      expect(result.current.tipPresets).toEqual([2, 5, 10]);
    });

    it('handles validation error workflow', () => {
      const { result } = renderHook(() => useTipSettings());

      // User types invalid recipient
      act(() => {
        result.current.setTipRecipient('invalid-user');
      });

      // Validation starts
      act(() => {
        result.current.setUsernameValidation({
          status: 'validating',
          message: 'Checking...',
          isValidating: true,
        });
      });

      // Validation fails
      act(() => {
        result.current.setUsernameValidation({
          status: 'error',
          message: 'User not found',
          isValidating: false,
        });
      });

      expect(result.current.usernameValidation.status).toBe('error');
      expect(result.current.usernameValidation.message).toBe('User not found');

      // User clears and tries again
      act(() => {
        result.current.resetTipRecipient();
      });

      expect(result.current.tipRecipient).toBe('');
      expect(result.current.usernameValidation.status).toBeNull();
    });

    it('handles disable tips workflow', () => {
      const { result } = renderHook(() => useTipSettings());

      // Enable tips first
      act(() => {
        result.current.setTipsEnabled(true);
        result.current.setTipRecipient('waiter');
        result.current.setUsernameValidation({
          status: 'success',
          message: 'Valid',
          isValidating: false,
        });
      });

      // Disable tips
      act(() => {
        result.current.toggleTipsEnabled();
      });

      // Tips should be disabled but recipient config preserved
      expect(result.current.tipsEnabled).toBe(false);
      expect(result.current.tipRecipient).toBe('waiter');
    });

    it('handles clear profile workflow', () => {
      const { result } = renderHook(() => useTipSettings());

      // Set a profile
      act(() => {
        result.current.setActiveTipProfile(createMockProfile());
      });

      expect(result.current.activeTipProfile).not.toBeNull();

      // Clear the profile (like Dashboard line 569: localStorage.removeItem)
      act(() => {
        result.current.setActiveTipProfile(null);
      });

      expect(result.current.activeTipProfile).toBeNull();
      expect(localStorageMock.removeItem).toHaveBeenCalledWith('blinkpos-active-tip-profile');
    });
  });
});
