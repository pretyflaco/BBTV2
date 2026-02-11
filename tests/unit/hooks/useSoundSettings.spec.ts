import { renderHook, act } from '@testing-library/react';
import { useSoundSettings } from '../../../lib/hooks/useSoundSettings';
import type { SoundTheme } from '../../../lib/hooks/useSoundSettings';

describe('useSoundSettings', () => {
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
    it('initializes with sound enabled by default', () => {
      const { result } = renderHook(() => useSoundSettings());
      expect(result.current.soundEnabled).toBe(true);
    });

    it('initializes with success theme by default', () => {
      const { result } = renderHook(() => useSoundSettings());
      expect(result.current.soundTheme).toBe('success');
    });

    it('initializes with sound themes modal closed', () => {
      const { result } = renderHook(() => useSoundSettings());
      expect(result.current.showSoundThemes).toBe(false);
    });

    it('loads soundEnabled from localStorage if set to false', () => {
      localStorageMock.getItem.mockReturnValueOnce('false');
      const { result } = renderHook(() => useSoundSettings());
      expect(result.current.soundEnabled).toBe(false);
    });

    it('loads soundEnabled from localStorage if set to true', () => {
      localStorageMock.getItem.mockReturnValueOnce('true');
      const { result } = renderHook(() => useSoundSettings());
      expect(result.current.soundEnabled).toBe(true);
    });

    it('loads soundTheme from localStorage if set', () => {
      localStorageMock.getItem
        .mockReturnValueOnce(null) // soundEnabled
        .mockReturnValueOnce('zelda'); // soundTheme
      const { result } = renderHook(() => useSoundSettings());
      expect(result.current.soundTheme).toBe('zelda');
    });

    it('uses default theme if localStorage has invalid theme', () => {
      localStorageMock.getItem
        .mockReturnValueOnce(null) // soundEnabled
        .mockReturnValueOnce('invalid-theme'); // soundTheme
      const { result } = renderHook(() => useSoundSettings());
      expect(result.current.soundTheme).toBe('success');
    });
  });

  describe('soundEnabled actions', () => {
    it('setSoundEnabled enables sound', () => {
      localStorageMock.getItem.mockReturnValueOnce('false');
      const { result } = renderHook(() => useSoundSettings());

      act(() => {
        result.current.setSoundEnabled(true);
      });

      expect(result.current.soundEnabled).toBe(true);
    });

    it('setSoundEnabled disables sound', () => {
      const { result } = renderHook(() => useSoundSettings());

      act(() => {
        result.current.setSoundEnabled(false);
      });

      expect(result.current.soundEnabled).toBe(false);
    });

    it('toggleSoundEnabled toggles the state', () => {
      const { result } = renderHook(() => useSoundSettings());
      expect(result.current.soundEnabled).toBe(true);

      act(() => {
        result.current.toggleSoundEnabled();
      });
      expect(result.current.soundEnabled).toBe(false);

      act(() => {
        result.current.toggleSoundEnabled();
      });
      expect(result.current.soundEnabled).toBe(true);
    });

    it('persists soundEnabled to localStorage', () => {
      const { result } = renderHook(() => useSoundSettings());

      act(() => {
        result.current.setSoundEnabled(false);
      });

      expect(localStorageMock.setItem).toHaveBeenCalledWith('soundEnabled', 'false');
    });
  });

  describe('soundTheme actions', () => {
    it('setSoundTheme updates theme', () => {
      const { result } = renderHook(() => useSoundSettings());

      act(() => {
        result.current.setSoundTheme('zelda');
      });

      expect(result.current.soundTheme).toBe('zelda');
    });

    it('supports all valid themes', () => {
      const { result } = renderHook(() => useSoundSettings());
      const themes: SoundTheme[] = ['success', 'zelda', 'free', 'retro'];

      themes.forEach((theme) => {
        act(() => {
          result.current.setSoundTheme(theme);
        });
        expect(result.current.soundTheme).toBe(theme);
      });
    });

    it('persists soundTheme to localStorage', () => {
      const { result } = renderHook(() => useSoundSettings());

      act(() => {
        result.current.setSoundTheme('retro');
      });

      expect(localStorageMock.setItem).toHaveBeenCalledWith('soundTheme', 'retro');
    });
  });

  describe('disableSound', () => {
    it('disables sound and closes modal', () => {
      const { result } = renderHook(() => useSoundSettings());

      // Open modal and enable sound
      act(() => {
        result.current.setShowSoundThemes(true);
      });

      act(() => {
        result.current.disableSound();
      });

      expect(result.current.soundEnabled).toBe(false);
      expect(result.current.showSoundThemes).toBe(false);
    });
  });

  describe('getSoundThemeLabel', () => {
    it('returns "None" when sound is disabled', () => {
      const { result } = renderHook(() => useSoundSettings());

      act(() => {
        result.current.setSoundEnabled(false);
      });

      expect(result.current.getSoundThemeLabel()).toBe('None');
    });

    it('returns "Success" for success theme', () => {
      const { result } = renderHook(() => useSoundSettings());
      expect(result.current.getSoundThemeLabel()).toBe('Success');
    });

    it('returns "Zelda" for zelda theme', () => {
      const { result } = renderHook(() => useSoundSettings());

      act(() => {
        result.current.setSoundTheme('zelda');
      });

      expect(result.current.getSoundThemeLabel()).toBe('Zelda');
    });

    it('returns "Free" for free theme', () => {
      const { result } = renderHook(() => useSoundSettings());

      act(() => {
        result.current.setSoundTheme('free');
      });

      expect(result.current.getSoundThemeLabel()).toBe('Free');
    });

    it('returns "Retro" for retro theme', () => {
      const { result } = renderHook(() => useSoundSettings());

      act(() => {
        result.current.setSoundTheme('retro');
      });

      expect(result.current.getSoundThemeLabel()).toBe('Retro');
    });
  });

  describe('UI state actions', () => {
    it('setShowSoundThemes opens sound themes modal', () => {
      const { result } = renderHook(() => useSoundSettings());

      act(() => {
        result.current.setShowSoundThemes(true);
      });

      expect(result.current.showSoundThemes).toBe(true);
    });

    it('setShowSoundThemes closes sound themes modal', () => {
      const { result } = renderHook(() => useSoundSettings());

      act(() => {
        result.current.setShowSoundThemes(true);
      });

      act(() => {
        result.current.setShowSoundThemes(false);
      });

      expect(result.current.showSoundThemes).toBe(false);
    });
  });

  describe('callback stability', () => {
    it('toggleSoundEnabled maintains referential equality', () => {
      const { result, rerender } = renderHook(() => useSoundSettings());
      const firstRef = result.current.toggleSoundEnabled;

      rerender();

      expect(result.current.toggleSoundEnabled).toBe(firstRef);
    });

    it('disableSound maintains referential equality', () => {
      const { result, rerender } = renderHook(() => useSoundSettings());
      const firstRef = result.current.disableSound;

      rerender();

      expect(result.current.disableSound).toBe(firstRef);
    });

    it('getSoundThemeLabel updates when dependencies change', () => {
      const { result } = renderHook(() => useSoundSettings());
      
      const firstLabel = result.current.getSoundThemeLabel();
      expect(firstLabel).toBe('Success');

      act(() => {
        result.current.setSoundTheme('zelda');
      });

      const secondLabel = result.current.getSoundThemeLabel();
      expect(secondLabel).toBe('Zelda');
    });
  });

  describe('typical workflow scenarios', () => {
    it('handles change sound theme workflow', () => {
      const { result } = renderHook(() => useSoundSettings());

      // User opens sound settings
      act(() => {
        result.current.setShowSoundThemes(true);
      });

      // User selects zelda theme
      act(() => {
        result.current.setSoundTheme('zelda');
      });

      // User closes settings
      act(() => {
        result.current.setShowSoundThemes(false);
      });

      expect(result.current.soundTheme).toBe('zelda');
      expect(result.current.soundEnabled).toBe(true);
      expect(result.current.showSoundThemes).toBe(false);
    });

    it('handles disable sound workflow', () => {
      const { result } = renderHook(() => useSoundSettings());

      // User opens sound settings
      act(() => {
        result.current.setShowSoundThemes(true);
      });

      // User clicks "None" to disable sound
      act(() => {
        result.current.disableSound();
      });

      expect(result.current.soundEnabled).toBe(false);
      expect(result.current.showSoundThemes).toBe(false);
      expect(result.current.getSoundThemeLabel()).toBe('None');
    });

    it('handles re-enable sound workflow', () => {
      const { result } = renderHook(() => useSoundSettings());

      // Disable sound first
      act(() => {
        result.current.disableSound();
      });

      // User opens settings and enables sound
      act(() => {
        result.current.setShowSoundThemes(true);
      });

      act(() => {
        result.current.setSoundEnabled(true);
        result.current.setSoundTheme('retro');
      });

      act(() => {
        result.current.setShowSoundThemes(false);
      });

      expect(result.current.soundEnabled).toBe(true);
      expect(result.current.soundTheme).toBe('retro');
      expect(result.current.getSoundThemeLabel()).toBe('Retro');
    });
  });
});
