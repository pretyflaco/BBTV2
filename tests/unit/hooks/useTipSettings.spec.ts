import { renderHook, act } from '@testing-library/react';
import { useTipSettings } from '../../../lib/hooks/useTipSettings';
import type { TipPreset, TipProfile } from '../../../lib/hooks/useTipSettings';

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

  // Helper to create a mock tip preset
  const createMockPreset = (overrides: Partial<TipPreset> = {}): TipPreset => ({
    percent: 15,
    enabled: true,
    ...overrides,
  });

  // Helper to create a mock tip profile
  const createMockProfile = (overrides: Partial<TipProfile> = {}): TipProfile => ({
    id: 'profile-1',
    label: 'Default Profile',
    presets: [
      createMockPreset({ percent: 10 }),
      createMockPreset({ percent: 15 }),
      createMockPreset({ percent: 20 }),
    ],
    ...overrides,
  });

  describe('initial state', () => {
    it('initializes with tips disabled by default', () => {
      const { result } = renderHook(() => useTipSettings());
      expect(result.current.tipsEnabled).toBe(false);
    });

    it('initializes with default tip presets', () => {
      const { result } = renderHook(() => useTipSettings());
      expect(result.current.tipPresets).toEqual([
        { percent: 15, enabled: true },
        { percent: 18, enabled: true },
        { percent: 20, enabled: true },
      ]);
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

    it('initializes with tip settings modal closed', () => {
      const { result } = renderHook(() => useTipSettings());
      expect(result.current.showTipSettings).toBe(false);
    });

    it('initializes with tip profile settings closed', () => {
      const { result } = renderHook(() => useTipSettings());
      expect(result.current.showTipProfileSettings).toBe(false);
    });

    it('loads tipsEnabled from localStorage if set to true', () => {
      localStorageMock.getItem.mockReturnValueOnce('true');
      const { result } = renderHook(() => useTipSettings());
      expect(result.current.tipsEnabled).toBe(true);
    });

    it('loads tipPresets from localStorage if set', () => {
      const customPresets = [{ percent: 10, enabled: true }, { percent: 25, enabled: false }];
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

    it('uses fallback if localStorage contains invalid JSON', () => {
      localStorageMock.getItem
        .mockReturnValueOnce(null) // tipsEnabled
        .mockReturnValueOnce('invalid-json'); // tipPresets
      const { result } = renderHook(() => useTipSettings());
      // Should use default presets
      expect(result.current.tipPresets).toEqual([
        { percent: 15, enabled: true },
        { percent: 18, enabled: true },
        { percent: 20, enabled: true },
      ]);
    });
  });

  describe('tipsEnabled actions', () => {
    it('setTipsEnabled enables tips', () => {
      const { result } = renderHook(() => useTipSettings());

      act(() => {
        result.current.setTipsEnabled(true);
      });

      expect(result.current.tipsEnabled).toBe(true);
      expect(localStorageMock.setItem).toHaveBeenCalledWith('bbt_tips_enabled', 'true');
    });

    it('setTipsEnabled disables tips', () => {
      localStorageMock.getItem.mockReturnValueOnce('true');
      const { result } = renderHook(() => useTipSettings());

      act(() => {
        result.current.setTipsEnabled(false);
      });

      expect(result.current.tipsEnabled).toBe(false);
      expect(localStorageMock.setItem).toHaveBeenCalledWith('bbt_tips_enabled', 'false');
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
    it('setTipPresets updates presets', () => {
      const { result } = renderHook(() => useTipSettings());
      const newPresets = [createMockPreset({ percent: 10 }), createMockPreset({ percent: 20 })];

      act(() => {
        result.current.setTipPresets(newPresets);
      });

      expect(result.current.tipPresets).toEqual(newPresets);
      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        'bbt_tip_presets',
        JSON.stringify(newPresets)
      );
    });

    it('updateTipPreset updates a specific preset', () => {
      const { result } = renderHook(() => useTipSettings());

      act(() => {
        result.current.updateTipPreset(0, { percent: 10 });
      });

      expect(result.current.tipPresets[0].percent).toBe(10);
      expect(result.current.tipPresets[0].enabled).toBe(true);
    });

    it('updateTipPreset can disable a preset', () => {
      const { result } = renderHook(() => useTipSettings());

      act(() => {
        result.current.updateTipPreset(1, { enabled: false });
      });

      expect(result.current.tipPresets[1].enabled).toBe(false);
    });

    it('updateTipPreset ignores invalid index (negative)', () => {
      const { result } = renderHook(() => useTipSettings());
      const originalPresets = [...result.current.tipPresets];

      act(() => {
        result.current.updateTipPreset(-1, { percent: 99 });
      });

      expect(result.current.tipPresets).toEqual(originalPresets);
    });

    it('updateTipPreset ignores invalid index (out of bounds)', () => {
      const { result } = renderHook(() => useTipSettings());
      const originalPresets = [...result.current.tipPresets];

      act(() => {
        result.current.updateTipPreset(10, { percent: 99 });
      });

      expect(result.current.tipPresets).toEqual(originalPresets);
    });

    it('setTipPresets accepts a function', () => {
      const { result } = renderHook(() => useTipSettings());

      act(() => {
        result.current.setTipPresets((prev) => [...prev, createMockPreset({ percent: 25 })]);
      });

      expect(result.current.tipPresets).toHaveLength(4);
      expect(result.current.tipPresets[3].percent).toBe(25);
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
        'bbt_active_tip_profile',
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
      expect(localStorageMock.removeItem).toHaveBeenCalledWith('bbt_active_tip_profile');
    });

    it('setActiveTipProfile accepts a function', () => {
      const { result } = renderHook(() => useTipSettings());
      const profile = createMockProfile();

      act(() => {
        result.current.setActiveTipProfile(profile);
      });

      act(() => {
        result.current.setActiveTipProfile((prev) => 
          prev ? { ...prev, label: 'Updated' } : null
        );
      });

      expect(result.current.activeTipProfile?.label).toBe('Updated');
    });
  });

  describe('UI state actions', () => {
    it('setShowTipSettings opens tip settings', () => {
      const { result } = renderHook(() => useTipSettings());

      act(() => {
        result.current.setShowTipSettings(true);
      });

      expect(result.current.showTipSettings).toBe(true);
    });

    it('setShowTipSettings closes tip settings', () => {
      const { result } = renderHook(() => useTipSettings());

      act(() => {
        result.current.setShowTipSettings(true);
      });

      act(() => {
        result.current.setShowTipSettings(false);
      });

      expect(result.current.showTipSettings).toBe(false);
    });

    it('setShowTipProfileSettings opens profile settings', () => {
      const { result } = renderHook(() => useTipSettings());

      act(() => {
        result.current.setShowTipProfileSettings(true);
      });

      expect(result.current.showTipProfileSettings).toBe(true);
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

    it('updateTipPreset maintains referential equality', () => {
      const { result, rerender } = renderHook(() => useTipSettings());
      const firstRef = result.current.updateTipPreset;

      rerender();

      expect(result.current.updateTipPreset).toBe(firstRef);
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

    it('handles customize tip presets workflow', () => {
      const { result } = renderHook(() => useTipSettings());

      // Open settings
      act(() => {
        result.current.setShowTipSettings(true);
      });

      // Customize first preset
      act(() => {
        result.current.updateTipPreset(0, { percent: 10 });
      });

      // Disable second preset
      act(() => {
        result.current.updateTipPreset(1, { enabled: false });
      });

      // Customize third preset
      act(() => {
        result.current.updateTipPreset(2, { percent: 25 });
      });

      // Close settings
      act(() => {
        result.current.setShowTipSettings(false);
      });

      expect(result.current.tipPresets[0].percent).toBe(10);
      expect(result.current.tipPresets[1].enabled).toBe(false);
      expect(result.current.tipPresets[2].percent).toBe(25);
      expect(result.current.showTipSettings).toBe(false);
    });

    it('handles switch tip profile workflow', () => {
      const { result } = renderHook(() => useTipSettings());

      const restaurantProfile = createMockProfile({
        id: 'restaurant',
        label: 'Restaurant',
        presets: [
          { percent: 15, enabled: true },
          { percent: 18, enabled: true },
          { percent: 20, enabled: true },
        ],
      });

      const barProfile = createMockProfile({
        id: 'bar',
        label: 'Bar',
        presets: [
          { percent: 10, enabled: true },
          { percent: 15, enabled: true },
          { percent: 20, enabled: true },
        ],
      });

      // Set restaurant profile
      act(() => {
        result.current.setActiveTipProfile(restaurantProfile);
      });

      expect(result.current.activeTipProfile?.id).toBe('restaurant');

      // Switch to bar profile
      act(() => {
        result.current.setActiveTipProfile(barProfile);
      });

      expect(result.current.activeTipProfile?.id).toBe('bar');
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
  });
});
