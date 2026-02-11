/**
 * Tests for useThemeStyles hook
 *
 * @jest-environment jsdom
 */

import { renderHook } from "@testing-library/react"

// Mock useTheme hook
jest.mock("@/lib/hooks/useTheme", () => ({
  useTheme: jest.fn(),
  THEMES: {
    DARK: "dark",
    BLINK_CLASSIC_DARK: "blink-classic-dark",
    LIGHT: "light",
    BLINK_CLASSIC_LIGHT: "blink-classic-light",
  },
}))

import { useTheme } from "@/lib/hooks/useTheme"
import { useThemeStyles } from "@/lib/hooks/useThemeStyles"

const mockUseTheme = useTheme as jest.MockedFunction<typeof useTheme>

describe("useThemeStyles", () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe("dark theme", () => {
    beforeEach(() => {
      mockUseTheme.mockReturnValue({
        theme: "dark",
        darkMode: true,
        isBlinkClassic: false,
        isBlinkClassicDark: false,
        isBlinkClassicLight: false,
        isDark: true,
        isLight: false,
        setTheme: jest.fn(),
        cycleTheme: jest.fn(),
        toggleDarkMode: jest.fn(),
      })
    })

    it("returns correct menu tile classes", () => {
      const { result } = renderHook(() => useThemeStyles())
      expect(result.current.getMenuTileClasses()).toBe(
        "bg-gray-900 hover:bg-gray-800"
      )
    })

    it("returns correct submenu bg classes", () => {
      const { result } = renderHook(() => useThemeStyles())
      expect(result.current.getSubmenuBgClasses()).toBe("bg-white dark:bg-black")
    })

    it("returns correct primary text classes", () => {
      const { result } = renderHook(() => useThemeStyles())
      expect(result.current.getPrimaryTextClasses()).toBe("text-white")
    })

    it("returns correct secondary text classes", () => {
      const { result } = renderHook(() => useThemeStyles())
      expect(result.current.getSecondaryTextClasses()).toBe("text-gray-400")
    })

    it("returns correct wallet use button classes", () => {
      const { result } = renderHook(() => useThemeStyles())
      expect(result.current.getWalletUseButtonClasses()).toBe(
        "bg-gray-800 text-gray-300 hover:bg-gray-700"
      )
    })

    it("returns correct wallet icon classes for active state", () => {
      const { result } = renderHook(() => useThemeStyles())
      expect(result.current.getWalletIconClasses(true)).toBe("bg-blink-accent/20")
    })

    it("returns correct wallet icon classes for inactive state", () => {
      const { result } = renderHook(() => useThemeStyles())
      expect(result.current.getWalletIconClasses(false)).toBe("bg-gray-800")
    })
  })

  describe("light theme", () => {
    beforeEach(() => {
      mockUseTheme.mockReturnValue({
        theme: "light",
        darkMode: false,
        isBlinkClassic: false,
        isBlinkClassicDark: false,
        isBlinkClassicLight: false,
        isDark: false,
        isLight: true,
        setTheme: jest.fn(),
        cycleTheme: jest.fn(),
        toggleDarkMode: jest.fn(),
      })
    })

    it("returns correct menu tile classes", () => {
      const { result } = renderHook(() => useThemeStyles())
      expect(result.current.getMenuTileClasses()).toBe("bg-gray-50 hover:bg-gray-100")
    })

    it("returns correct primary text classes", () => {
      const { result } = renderHook(() => useThemeStyles())
      expect(result.current.getPrimaryTextClasses()).toBe("text-gray-900")
    })

    it("returns correct secondary text classes", () => {
      const { result } = renderHook(() => useThemeStyles())
      expect(result.current.getSecondaryTextClasses()).toBe("text-gray-500")
    })

    it("returns correct wallet icon classes for inactive state", () => {
      const { result } = renderHook(() => useThemeStyles())
      expect(result.current.getWalletIconClasses(false)).toBe("bg-gray-200")
    })
  })

  describe("blink-classic-dark theme", () => {
    beforeEach(() => {
      mockUseTheme.mockReturnValue({
        theme: "blink-classic-dark",
        darkMode: true,
        isBlinkClassic: true,
        isBlinkClassicDark: true,
        isBlinkClassicLight: false,
        isDark: false,
        isLight: false,
        setTheme: jest.fn(),
        cycleTheme: jest.fn(),
        toggleDarkMode: jest.fn(),
      })
    })

    it("returns correct menu tile classes", () => {
      const { result } = renderHook(() => useThemeStyles())
      expect(result.current.getMenuTileClasses()).toBe(
        "bg-transparent border border-blink-classic-border hover:bg-blink-classic-bg hover:border-blink-classic-amber"
      )
    })

    it("returns correct submenu bg classes", () => {
      const { result } = renderHook(() => useThemeStyles())
      expect(result.current.getSubmenuBgClasses()).toBe("bg-black")
    })

    it("returns correct submenu header classes", () => {
      const { result } = renderHook(() => useThemeStyles())
      expect(result.current.getSubmenuHeaderClasses()).toBe(
        "bg-black border-b border-blink-classic-border"
      )
    })

    it("returns correct primary text classes", () => {
      const { result } = renderHook(() => useThemeStyles())
      expect(result.current.getPrimaryTextClasses()).toBe("text-white")
    })

    it("returns correct checkmark classes", () => {
      const { result } = renderHook(() => useThemeStyles())
      expect(result.current.getCheckmarkClasses()).toBe("text-blink-classic-amber")
    })

    it("returns correct wallet card active classes", () => {
      const { result } = renderHook(() => useThemeStyles())
      expect(result.current.getWalletCardActiveClasses()).toBe(
        "bg-blink-classic-bg border border-blink-classic-amber rounded-xl"
      )
    })

    it("returns correct input classes", () => {
      const { result } = renderHook(() => useThemeStyles())
      expect(result.current.getInputClasses()).toBe(
        "bg-transparent border-blink-classic-border text-white placeholder-gray-500 focus:border-blink-classic-amber focus:ring-blink-classic-amber"
      )
    })
  })

  describe("blink-classic-light theme", () => {
    beforeEach(() => {
      mockUseTheme.mockReturnValue({
        theme: "blink-classic-light",
        darkMode: false,
        isBlinkClassic: true,
        isBlinkClassicDark: false,
        isBlinkClassicLight: true,
        isDark: false,
        isLight: false,
        setTheme: jest.fn(),
        cycleTheme: jest.fn(),
        toggleDarkMode: jest.fn(),
      })
    })

    it("returns correct menu tile classes", () => {
      const { result } = renderHook(() => useThemeStyles())
      expect(result.current.getMenuTileClasses()).toBe(
        "bg-transparent border border-blink-classic-border-light hover:bg-blink-classic-hover-light hover:border-blink-classic-amber"
      )
    })

    it("returns correct submenu bg classes", () => {
      const { result } = renderHook(() => useThemeStyles())
      expect(result.current.getSubmenuBgClasses()).toBe("bg-white")
    })

    it("returns correct submenu header classes", () => {
      const { result } = renderHook(() => useThemeStyles())
      expect(result.current.getSubmenuHeaderClasses()).toBe(
        "bg-white border-b border-blink-classic-border-light"
      )
    })

    it("returns correct primary text classes", () => {
      const { result } = renderHook(() => useThemeStyles())
      expect(result.current.getPrimaryTextClasses()).toBe("text-black")
    })

    it("returns correct checkmark classes", () => {
      const { result } = renderHook(() => useThemeStyles())
      expect(result.current.getCheckmarkClasses()).toBe("text-blink-classic-amber")
    })
  })

  describe("wallet card active classes with accent colors", () => {
    beforeEach(() => {
      mockUseTheme.mockReturnValue({
        theme: "dark",
        darkMode: true,
        isBlinkClassic: false,
        isBlinkClassicDark: false,
        isBlinkClassicLight: false,
        isDark: true,
        isLight: false,
        setTheme: jest.fn(),
        cycleTheme: jest.fn(),
        toggleDarkMode: jest.fn(),
      })
    })

    it("returns correct classes for amber accent (default)", () => {
      const { result } = renderHook(() => useThemeStyles())
      expect(result.current.getWalletCardActiveClasses()).toContain(
        "border-blink-accent"
      )
    })

    it("returns correct classes for purple accent", () => {
      const { result } = renderHook(() => useThemeStyles())
      expect(result.current.getWalletCardActiveClasses("purple")).toContain(
        "purple"
      )
    })

    it("returns correct classes for teal accent", () => {
      const { result } = renderHook(() => useThemeStyles())
      expect(result.current.getWalletCardActiveClasses("teal")).toContain("teal")
    })
  })

  describe("wallet active badge classes with accent colors", () => {
    beforeEach(() => {
      mockUseTheme.mockReturnValue({
        theme: "dark",
        darkMode: true,
        isBlinkClassic: false,
        isBlinkClassicDark: false,
        isBlinkClassicLight: false,
        isDark: true,
        isLight: false,
        setTheme: jest.fn(),
        cycleTheme: jest.fn(),
        toggleDarkMode: jest.fn(),
      })
    })

    it("returns correct badge classes for amber accent (default)", () => {
      const { result } = renderHook(() => useThemeStyles())
      expect(result.current.getWalletActiveBadgeClasses()).toBe(
        "bg-blink-accent/20 text-blink-accent"
      )
    })

    it("returns correct badge classes for purple accent", () => {
      const { result } = renderHook(() => useThemeStyles())
      expect(result.current.getWalletActiveBadgeClasses("purple")).toBe(
        "bg-purple-500/20 text-purple-400"
      )
    })

    it("returns correct badge classes for teal accent", () => {
      const { result } = renderHook(() => useThemeStyles())
      expect(result.current.getWalletActiveBadgeClasses("teal")).toBe(
        "bg-teal-500/20 text-teal-400"
      )
    })
  })

  describe("exposes theme state", () => {
    it("exposes theme value", () => {
      mockUseTheme.mockReturnValue({
        theme: "dark",
        darkMode: true,
        isBlinkClassic: false,
        isBlinkClassicDark: false,
        isBlinkClassicLight: false,
        isDark: true,
        isLight: false,
        setTheme: jest.fn(),
        cycleTheme: jest.fn(),
        toggleDarkMode: jest.fn(),
      })
      const { result } = renderHook(() => useThemeStyles())
      expect(result.current.theme).toBe("dark")
    })

    it("exposes darkMode boolean", () => {
      mockUseTheme.mockReturnValue({
        theme: "dark",
        darkMode: true,
        isBlinkClassic: false,
        isBlinkClassicDark: false,
        isBlinkClassicLight: false,
        isDark: true,
        isLight: false,
        setTheme: jest.fn(),
        cycleTheme: jest.fn(),
        toggleDarkMode: jest.fn(),
      })
      const { result } = renderHook(() => useThemeStyles())
      expect(result.current.darkMode).toBe(true)
    })

    it("exposes isBlinkClassic boolean", () => {
      mockUseTheme.mockReturnValue({
        theme: "blink-classic-dark",
        darkMode: true,
        isBlinkClassic: true,
        isBlinkClassicDark: true,
        isBlinkClassicLight: false,
        isDark: false,
        isLight: false,
        setTheme: jest.fn(),
        cycleTheme: jest.fn(),
        toggleDarkMode: jest.fn(),
      })
      const { result } = renderHook(() => useThemeStyles())
      expect(result.current.isBlinkClassic).toBe(true)
    })
  })

  describe("selection tile classes", () => {
    it("returns correct unselected classes for dark theme", () => {
      mockUseTheme.mockReturnValue({
        theme: "dark",
        darkMode: true,
        isBlinkClassic: false,
        isBlinkClassicDark: false,
        isBlinkClassicLight: false,
        isDark: true,
        isLight: false,
        setTheme: jest.fn(),
        cycleTheme: jest.fn(),
        toggleDarkMode: jest.fn(),
      })
      const { result } = renderHook(() => useThemeStyles())
      expect(result.current.getSelectionTileClasses()).toContain("border-gray-300")
    })

    it("returns correct active classes for dark theme", () => {
      mockUseTheme.mockReturnValue({
        theme: "dark",
        darkMode: true,
        isBlinkClassic: false,
        isBlinkClassicDark: false,
        isBlinkClassicLight: false,
        isDark: true,
        isLight: false,
        setTheme: jest.fn(),
        cycleTheme: jest.fn(),
        toggleDarkMode: jest.fn(),
      })
      const { result } = renderHook(() => useThemeStyles())
      expect(result.current.getSelectionTileActiveClasses()).toContain(
        "border-blink-accent"
      )
    })

    it("returns correct unselected classes for blink-classic-dark", () => {
      mockUseTheme.mockReturnValue({
        theme: "blink-classic-dark",
        darkMode: true,
        isBlinkClassic: true,
        isBlinkClassicDark: true,
        isBlinkClassicLight: false,
        isDark: false,
        isLight: false,
        setTheme: jest.fn(),
        cycleTheme: jest.fn(),
        toggleDarkMode: jest.fn(),
      })
      const { result } = renderHook(() => useThemeStyles())
      expect(result.current.getSelectionTileClasses()).toContain(
        "border-blink-classic-border"
      )
    })

    it("returns correct active classes for blink-classic-dark", () => {
      mockUseTheme.mockReturnValue({
        theme: "blink-classic-dark",
        darkMode: true,
        isBlinkClassic: true,
        isBlinkClassicDark: true,
        isBlinkClassicLight: false,
        isDark: false,
        isLight: false,
        setTheme: jest.fn(),
        cycleTheme: jest.fn(),
        toggleDarkMode: jest.fn(),
      })
      const { result } = renderHook(() => useThemeStyles())
      expect(result.current.getSelectionTileActiveClasses()).toContain(
        "border-blink-classic-amber"
      )
    })
  })

  describe("preview box and section label classes", () => {
    it("returns correct preview box classes for dark theme", () => {
      mockUseTheme.mockReturnValue({
        theme: "dark",
        darkMode: true,
        isBlinkClassic: false,
        isBlinkClassicDark: false,
        isBlinkClassicLight: false,
        isDark: true,
        isLight: false,
        setTheme: jest.fn(),
        cycleTheme: jest.fn(),
        toggleDarkMode: jest.fn(),
      })
      const { result } = renderHook(() => useThemeStyles())
      expect(result.current.getPreviewBoxClasses()).toBe("bg-gray-900")
    })

    it("returns correct preview box classes for light theme", () => {
      mockUseTheme.mockReturnValue({
        theme: "light",
        darkMode: false,
        isBlinkClassic: false,
        isBlinkClassicDark: false,
        isBlinkClassicLight: false,
        isDark: false,
        isLight: true,
        setTheme: jest.fn(),
        cycleTheme: jest.fn(),
        toggleDarkMode: jest.fn(),
      })
      const { result } = renderHook(() => useThemeStyles())
      expect(result.current.getPreviewBoxClasses()).toBe("bg-gray-50")
    })

    it("returns correct section label classes for dark theme", () => {
      mockUseTheme.mockReturnValue({
        theme: "dark",
        darkMode: true,
        isBlinkClassic: false,
        isBlinkClassicDark: false,
        isBlinkClassicLight: false,
        isDark: true,
        isLight: false,
        setTheme: jest.fn(),
        cycleTheme: jest.fn(),
        toggleDarkMode: jest.fn(),
      })
      const { result } = renderHook(() => useThemeStyles())
      expect(result.current.getSectionLabelClasses()).toBe("text-gray-400")
    })

    it("returns correct section label classes for light theme", () => {
      mockUseTheme.mockReturnValue({
        theme: "light",
        darkMode: false,
        isBlinkClassic: false,
        isBlinkClassicDark: false,
        isBlinkClassicLight: false,
        isDark: false,
        isLight: true,
        setTheme: jest.fn(),
        cycleTheme: jest.fn(),
        toggleDarkMode: jest.fn(),
      })
      const { result } = renderHook(() => useThemeStyles())
      expect(result.current.getSectionLabelClasses()).toBe("text-gray-600")
    })
  })
})
