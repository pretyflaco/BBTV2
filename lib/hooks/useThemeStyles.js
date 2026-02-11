/**
 * Theme Styling Utilities for Dashboard Components
 * 
 * Provides consistent theme-aware class name generation for UI components.
 * Works with the useTheme hook to provide styling based on current theme.
 * 
 * Supports 4 themes:
 * - 'dark' - Standard dark theme
 * - 'light' - Standard light theme
 * - 'blink-classic-dark' - Blink classic dark theme with amber accents
 * - 'blink-classic-light' - Blink classic light theme with amber accents
 */

import { useTheme } from './useTheme';
import { useMemo } from 'react';

/**
 * Hook that provides theme-aware styling utilities for Dashboard components.
 * 
 * @example
 * ```jsx
 * const { theme, getMenuTileClasses, getPrimaryTextClasses } = useThemeStyles();
 * 
 * return (
 *   <div className={getMenuTileClasses()}>
 *     <span className={getPrimaryTextClasses()}>Menu Item</span>
 *   </div>
 * );
 * ```
 * 
 * @returns {Object} Theme styles object with getters for various UI element classes
 */
export function useThemeStyles() {
  const { theme, darkMode, isBlinkClassic, isBlinkClassicDark, isBlinkClassicLight } = useTheme();
  
  const styles = useMemo(() => ({
    /**
     * Menu tile styling (for main menu items)
     * @returns {string} Tailwind class string
     */
    getMenuTileClasses: () => {
      switch (theme) {
        case 'blink-classic-dark':
          return 'bg-transparent border border-blink-classic-border hover:bg-blink-classic-bg hover:border-blink-classic-amber';
        case 'blink-classic-light':
          return 'bg-transparent border border-blink-classic-border-light hover:bg-blink-classic-hover-light hover:border-blink-classic-amber';
        case 'light':
          return 'bg-gray-50 hover:bg-gray-100';
        case 'dark':
        default:
          return 'bg-gray-900 hover:bg-gray-800';
      }
    },
    
    /**
     * Submenu overlay background
     * @returns {string} Tailwind class string
     */
    getSubmenuBgClasses: () => {
      switch (theme) {
        case 'blink-classic-dark':
          return 'bg-black';
        case 'blink-classic-light':
          return 'bg-white';
        default:
          return 'bg-white dark:bg-black';
      }
    },
    
    /**
     * Submenu header styling
     * @returns {string} Tailwind class string
     */
    getSubmenuHeaderClasses: () => {
      switch (theme) {
        case 'blink-classic-dark':
          return 'bg-black border-b border-blink-classic-border';
        case 'blink-classic-light':
          return 'bg-white border-b border-blink-classic-border-light';
        default:
          return 'bg-gray-50 dark:bg-blink-dark shadow dark:shadow-black';
      }
    },
    
    /**
     * Selection tile styling (for option buttons in submenus) - unselected state
     * @returns {string} Tailwind class string
     */
    getSelectionTileClasses: () => {
      switch (theme) {
        case 'blink-classic-dark':
          return 'border-blink-classic-border bg-transparent hover:bg-blink-classic-bg hover:border-blink-classic-amber';
        case 'blink-classic-light':
          return 'border-blink-classic-border-light bg-transparent hover:bg-blink-classic-hover-light hover:border-blink-classic-amber';
        default:
          return 'border-gray-300 dark:border-gray-700 bg-white dark:bg-blink-dark hover:border-gray-400 dark:hover:border-gray-600';
      }
    },
    
    /**
     * Selection tile styling - selected/active state
     * @returns {string} Tailwind class string
     */
    getSelectionTileActiveClasses: () => {
      switch (theme) {
        case 'blink-classic-dark':
          return 'border-blink-classic-amber bg-blink-classic-bg';
        case 'blink-classic-light':
          return 'border-blink-classic-amber bg-blink-classic-hover-light';
        default:
          return 'border-blink-accent bg-blink-accent/10';
      }
    },
    
    /**
     * Input field styling
     * @returns {string} Tailwind class string
     */
    getInputClasses: () => {
      switch (theme) {
        case 'blink-classic-dark':
          return 'bg-transparent border-blink-classic-border text-white placeholder-gray-500 focus:border-blink-classic-amber focus:ring-blink-classic-amber';
        case 'blink-classic-light':
          return 'bg-transparent border-blink-classic-border-light text-black placeholder-gray-400 focus:border-blink-classic-amber focus:ring-blink-classic-amber';
        default:
          return 'bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white';
      }
    },
    
    /**
     * Wallet card styling - inactive state
     * @returns {string} Tailwind class string
     */
    getWalletCardClasses: () => {
      switch (theme) {
        case 'blink-classic-dark':
          return 'bg-transparent border border-blink-classic-border rounded-xl hover:bg-blink-classic-bg hover:border-blink-classic-amber';
        case 'blink-classic-light':
          return 'bg-transparent border border-blink-classic-border-light rounded-xl hover:bg-blink-classic-hover-light hover:border-blink-classic-amber';
        default:
          return 'bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg';
      }
    },
    
    /**
     * Wallet card styling - active state (with accent color support)
     * @param {'amber' | 'purple' | 'teal'} [accentColor='amber'] - Accent color for the card
     * @returns {string} Tailwind class string
     */
    getWalletCardActiveClasses: (accentColor = 'amber') => {
      switch (theme) {
        case 'blink-classic-dark':
          return 'bg-blink-classic-bg border border-blink-classic-amber rounded-xl';
        case 'blink-classic-light':
          return 'bg-blink-classic-hover-light border border-blink-classic-amber rounded-xl';
        default:
          // Standard themes use different accent colors based on wallet type
          if (accentColor === 'purple') return 'bg-purple-50 dark:bg-purple-900/20 border border-purple-400 dark:border-purple-500 rounded-lg';
          if (accentColor === 'teal') return 'bg-teal-50 dark:bg-teal-900/20 border border-teal-400 dark:border-teal-500 rounded-lg';
          return 'bg-blink-accent/5 dark:bg-blink-accent/10 border border-blink-accent rounded-lg';
      }
    },
    
    /**
     * Wallet icon container styling
     * @param {boolean} isActive - Whether the wallet is active
     * @returns {string} Tailwind class string
     */
    getWalletIconClasses: (isActive) => {
      switch (theme) {
        case 'blink-classic-dark':
          return isActive ? 'bg-blink-classic-bg border border-blink-classic-amber' : 'bg-transparent border border-blink-classic-border';
        case 'blink-classic-light':
          return isActive ? 'bg-blink-classic-hover-light border border-blink-classic-amber' : 'bg-transparent border border-blink-classic-border-light';
        default:
          return isActive ? 'bg-blink-accent/20' : (darkMode ? 'bg-gray-800' : 'bg-gray-200');
      }
    },
    
    /**
     * Wallet "Use" button styling
     * @returns {string} Tailwind class string
     */
    getWalletUseButtonClasses: () => {
      switch (theme) {
        case 'blink-classic-dark':
          return 'bg-transparent border border-blink-classic-border text-white hover:bg-blink-classic-bg hover:border-blink-classic-amber';
        case 'blink-classic-light':
          return 'bg-transparent border border-blink-classic-border-light text-black hover:bg-blink-classic-hover-light hover:border-blink-classic-amber';
        default:
          return darkMode ? 'bg-gray-800 text-gray-300 hover:bg-gray-700' : 'bg-gray-200 text-gray-700 hover:bg-gray-300';
      }
    },
    
    /**
     * Wallet "Active" badge styling
     * @param {'amber' | 'purple' | 'teal'} [accentColor='amber'] - Accent color for the badge
     * @returns {string} Tailwind class string
     */
    getWalletActiveBadgeClasses: (accentColor = 'amber') => {
      switch (theme) {
        case 'blink-classic-dark':
        case 'blink-classic-light':
          return 'bg-blink-classic-amber/20 text-blink-classic-amber';
        default:
          if (accentColor === 'purple') return 'bg-purple-500/20 text-purple-400';
          if (accentColor === 'teal') return 'bg-teal-500/20 text-teal-400';
          return 'bg-blink-accent/20 text-blink-accent';
      }
    },
    
    /**
     * Wallet delete button styling
     * @returns {string} Tailwind class string
     */
    getWalletDeleteButtonClasses: () => {
      switch (theme) {
        case 'blink-classic-dark':
          return 'text-gray-500 hover:text-red-400 hover:bg-blink-classic-bg';
        case 'blink-classic-light':
          return 'text-gray-400 hover:text-red-500 hover:bg-blink-classic-hover-light';
        default:
          return darkMode ? 'text-gray-500 hover:text-red-400 hover:bg-gray-800' : 'text-gray-400 hover:text-red-500 hover:bg-gray-100';
      }
    },
    
    /**
     * Submenu option item styling - unselected state (for currency/regional options)
     * @returns {string} Tailwind class string
     */
    getSubmenuOptionClasses: () => {
      switch (theme) {
        case 'blink-classic-dark':
          return 'bg-transparent border border-blink-classic-border rounded-xl hover:bg-blink-classic-bg hover:border-blink-classic-amber';
        case 'blink-classic-light':
          return 'bg-transparent border border-blink-classic-border-light rounded-xl hover:bg-blink-classic-hover-light hover:border-blink-classic-amber';
        default:
          return darkMode ? 'bg-gray-900 hover:bg-gray-800 border-2 border-transparent' : 'bg-gray-50 hover:bg-gray-100 border-2 border-transparent';
      }
    },
    
    /**
     * Submenu option item styling - selected/active state
     * @returns {string} Tailwind class string
     */
    getSubmenuOptionActiveClasses: () => {
      switch (theme) {
        case 'blink-classic-dark':
          return 'bg-blink-classic-bg border border-blink-classic-amber rounded-xl';
        case 'blink-classic-light':
          return 'bg-blink-classic-hover-light border border-blink-classic-amber rounded-xl';
        default:
          return 'bg-blink-accent/20 border-2 border-blink-accent';
      }
    },
    
    /**
     * Preview/info box styling
     * @returns {string} Tailwind class string
     */
    getPreviewBoxClasses: () => {
      switch (theme) {
        case 'blink-classic-dark':
          return 'bg-blink-classic-bg border border-blink-classic-border rounded-xl';
        case 'blink-classic-light':
          return 'bg-blink-classic-hover-light border border-blink-classic-border-light rounded-xl';
        default:
          return darkMode ? 'bg-gray-900' : 'bg-gray-50';
      }
    },
    
    /**
     * Section label text styling
     * @returns {string} Tailwind class string
     */
    getSectionLabelClasses: () => {
      switch (theme) {
        case 'blink-classic-dark':
          return 'text-gray-400';
        case 'blink-classic-light':
          return 'text-gray-600';
        default:
          return darkMode ? 'text-gray-400' : 'text-gray-600';
      }
    },
    
    /**
     * Primary text styling (titles, main text)
     * @returns {string} Tailwind class string
     */
    getPrimaryTextClasses: () => {
      switch (theme) {
        case 'blink-classic-dark':
          return 'text-white';
        case 'blink-classic-light':
          return 'text-black';
        default:
          return darkMode ? 'text-white' : 'text-gray-900';
      }
    },
    
    /**
     * Secondary text styling (descriptions, captions)
     * @returns {string} Tailwind class string
     */
    getSecondaryTextClasses: () => {
      switch (theme) {
        case 'blink-classic-dark':
          return 'text-gray-400';
        case 'blink-classic-light':
          return 'text-gray-500';
        default:
          return darkMode ? 'text-gray-400' : 'text-gray-500';
      }
    },
    
    /**
     * Checkmark styling for selected items
     * @returns {string} Tailwind class string
     */
    getCheckmarkClasses: () => {
      switch (theme) {
        case 'blink-classic-dark':
        case 'blink-classic-light':
          return 'text-blink-classic-amber';
        default:
          return 'text-blink-accent';
      }
    },
  }), [theme, darkMode]);
  
  return {
    theme,
    darkMode,
    isBlinkClassic,
    isBlinkClassicDark,
    isBlinkClassicLight,
    ...styles,
  };
}

export default useThemeStyles;
