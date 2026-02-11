import { renderHook, act } from '@testing-library/react';
import { useCommissionSettings } from '../../../lib/hooks/useCommissionSettings';

describe('useCommissionSettings', () => {
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

  describe('initial state', () => {
    it('initializes with commission disabled by default', () => {
      const { result } = renderHook(() => useCommissionSettings());
      expect(result.current.commissionEnabled).toBe(false);
    });

    it('initializes with default commission presets [1, 2, 3]', () => {
      const { result } = renderHook(() => useCommissionSettings());
      expect(result.current.commissionPresets).toEqual([1, 2, 3]);
    });

    it('initializes with commission settings modal closed', () => {
      const { result } = renderHook(() => useCommissionSettings());
      expect(result.current.showCommissionSettings).toBe(false);
    });

    it('loads commissionEnabled from localStorage if set to true', () => {
      localStorageMock.getItem.mockReturnValueOnce('true');
      const { result } = renderHook(() => useCommissionSettings());
      expect(result.current.commissionEnabled).toBe(true);
    });

    it('loads commissionPresets from localStorage if set', () => {
      const customPresets = [5, 10, 15];
      localStorageMock.getItem
        .mockReturnValueOnce(null) // commissionEnabled
        .mockReturnValueOnce(JSON.stringify(customPresets)); // commissionPresets
      const { result } = renderHook(() => useCommissionSettings());
      expect(result.current.commissionPresets).toEqual(customPresets);
    });

    it('uses fallback if localStorage contains invalid JSON', () => {
      localStorageMock.getItem
        .mockReturnValueOnce(null) // commissionEnabled
        .mockReturnValueOnce('invalid-json'); // commissionPresets
      const { result } = renderHook(() => useCommissionSettings());
      expect(result.current.commissionPresets).toEqual([1, 2, 3]);
    });
  });

  describe('commissionEnabled actions', () => {
    it('setCommissionEnabled enables commission', () => {
      const { result } = renderHook(() => useCommissionSettings());

      act(() => {
        result.current.setCommissionEnabled(true);
      });

      expect(result.current.commissionEnabled).toBe(true);
    });

    it('setCommissionEnabled disables commission', () => {
      localStorageMock.getItem.mockReturnValueOnce('true');
      const { result } = renderHook(() => useCommissionSettings());

      act(() => {
        result.current.setCommissionEnabled(false);
      });

      expect(result.current.commissionEnabled).toBe(false);
    });

    it('toggleCommissionEnabled toggles the state', () => {
      const { result } = renderHook(() => useCommissionSettings());
      expect(result.current.commissionEnabled).toBe(false);

      act(() => {
        result.current.toggleCommissionEnabled();
      });
      expect(result.current.commissionEnabled).toBe(true);

      act(() => {
        result.current.toggleCommissionEnabled();
      });
      expect(result.current.commissionEnabled).toBe(false);
    });

    it('persists commissionEnabled to localStorage', () => {
      const { result } = renderHook(() => useCommissionSettings());

      act(() => {
        result.current.setCommissionEnabled(true);
      });

      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        'blinkpos-commission-enabled',
        'true'
      );
    });
  });

  describe('commissionPresets actions', () => {
    it('setCommissionPresets updates presets', () => {
      const { result } = renderHook(() => useCommissionSettings());
      const newPresets = [5, 10, 15];

      act(() => {
        result.current.setCommissionPresets(newPresets);
      });

      expect(result.current.commissionPresets).toEqual(newPresets);
    });

    it('updateCommissionPreset updates a specific preset', () => {
      const { result } = renderHook(() => useCommissionSettings());

      act(() => {
        result.current.updateCommissionPreset(0, 5);
      });

      expect(result.current.commissionPresets[0]).toBe(5);
      expect(result.current.commissionPresets[1]).toBe(2);
      expect(result.current.commissionPresets[2]).toBe(3);
    });

    it('updateCommissionPreset ignores invalid index (negative)', () => {
      const { result } = renderHook(() => useCommissionSettings());
      const originalPresets = [...result.current.commissionPresets];

      act(() => {
        result.current.updateCommissionPreset(-1, 99);
      });

      expect(result.current.commissionPresets).toEqual(originalPresets);
    });

    it('updateCommissionPreset ignores invalid index (out of bounds)', () => {
      const { result } = renderHook(() => useCommissionSettings());
      const originalPresets = [...result.current.commissionPresets];

      act(() => {
        result.current.updateCommissionPreset(10, 99);
      });

      expect(result.current.commissionPresets).toEqual(originalPresets);
    });

    it('resetCommissionPresets resets to defaults', () => {
      const { result } = renderHook(() => useCommissionSettings());

      act(() => {
        result.current.setCommissionPresets([10, 20, 30]);
      });

      act(() => {
        result.current.resetCommissionPresets();
      });

      expect(result.current.commissionPresets).toEqual([1, 2, 3]);
    });

    it('persists commissionPresets to localStorage', () => {
      const { result } = renderHook(() => useCommissionSettings());
      const newPresets = [5, 10, 15];

      act(() => {
        result.current.setCommissionPresets(newPresets);
      });

      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        'blinkpos-commission-presets',
        JSON.stringify(newPresets)
      );
    });
  });

  describe('UI state actions', () => {
    it('setShowCommissionSettings opens commission settings', () => {
      const { result } = renderHook(() => useCommissionSettings());

      act(() => {
        result.current.setShowCommissionSettings(true);
      });

      expect(result.current.showCommissionSettings).toBe(true);
    });

    it('setShowCommissionSettings closes commission settings', () => {
      const { result } = renderHook(() => useCommissionSettings());

      act(() => {
        result.current.setShowCommissionSettings(true);
      });

      act(() => {
        result.current.setShowCommissionSettings(false);
      });

      expect(result.current.showCommissionSettings).toBe(false);
    });
  });

  describe('callback stability', () => {
    it('toggleCommissionEnabled maintains referential equality', () => {
      const { result, rerender } = renderHook(() => useCommissionSettings());
      const firstRef = result.current.toggleCommissionEnabled;

      rerender();

      expect(result.current.toggleCommissionEnabled).toBe(firstRef);
    });

    it('updateCommissionPreset maintains referential equality', () => {
      const { result, rerender } = renderHook(() => useCommissionSettings());
      const firstRef = result.current.updateCommissionPreset;

      rerender();

      expect(result.current.updateCommissionPreset).toBe(firstRef);
    });

    it('resetCommissionPresets maintains referential equality', () => {
      const { result, rerender } = renderHook(() => useCommissionSettings());
      const firstRef = result.current.resetCommissionPresets;

      rerender();

      expect(result.current.resetCommissionPresets).toBe(firstRef);
    });
  });

  describe('typical workflow scenarios', () => {
    it('handles enable commission and configure presets workflow', () => {
      const { result } = renderHook(() => useCommissionSettings());

      // User opens settings
      act(() => {
        result.current.setShowCommissionSettings(true);
      });

      // User enables commission
      act(() => {
        result.current.setCommissionEnabled(true);
      });

      // User customizes presets
      act(() => {
        result.current.updateCommissionPreset(0, 5);
        result.current.updateCommissionPreset(1, 10);
        result.current.updateCommissionPreset(2, 15);
      });

      // User closes settings
      act(() => {
        result.current.setShowCommissionSettings(false);
      });

      expect(result.current.commissionEnabled).toBe(true);
      expect(result.current.commissionPresets).toEqual([5, 10, 15]);
      expect(result.current.showCommissionSettings).toBe(false);
    });

    it('handles disable commission workflow', () => {
      const { result } = renderHook(() => useCommissionSettings());

      // Enable first
      act(() => {
        result.current.setCommissionEnabled(true);
        result.current.setCommissionPresets([5, 10, 15]);
      });

      // Disable commission
      act(() => {
        result.current.toggleCommissionEnabled();
      });

      // Presets should be preserved
      expect(result.current.commissionEnabled).toBe(false);
      expect(result.current.commissionPresets).toEqual([5, 10, 15]);
    });

    it('handles reset presets workflow', () => {
      const { result } = renderHook(() => useCommissionSettings());

      // Customize presets
      act(() => {
        result.current.setCommissionPresets([10, 20, 30]);
      });

      // Reset to defaults
      act(() => {
        result.current.resetCommissionPresets();
      });

      expect(result.current.commissionPresets).toEqual([1, 2, 3]);
    });
  });
});
