import React from 'react';
import { THEMES } from '../lib/hooks/useTheme';

/**
 * Reusable Numpad component with theme support
 * 
 * @param {Object} props
 * @param {string} props.theme - Current theme ('dark' | 'blink-classic-dark' | 'light' | 'blink-classic-light')
 * @param {Function} props.onDigitPress - Handler for digit presses (0-9, .)
 * @param {Function} props.onClear - Handler for clear button
 * @param {Function} props.onBackspace - Handler for backspace button
 * @param {Function} props.onPlusPress - Optional handler for plus button (POS mode)
 * @param {Function} props.onOkPress - Handler for OK button
 * @param {boolean} props.okDisabled - Whether OK button is disabled
 * @param {string} props.okLabel - Label for OK button (default: "OK")
 * @param {boolean} props.decimalDisabled - Whether decimal button is disabled
 * @param {boolean} props.plusDisabled - Whether plus button is disabled
 * @param {string} props.accentColor - Accent color for buttons ('blue' | 'purple')
 * @param {boolean} props.showPlus - Whether to show plus button (default: true)
 * @param {boolean} props.showCurrencyToggle - Whether to show currency toggle (BTC/USD) in top-right when showPlus=false
 * @param {string} props.voucherCurrencyMode - Current voucher currency mode ('BTC' | 'USD')
 * @param {Function} props.onCurrencyToggle - Handler for currency toggle
 */
export default function Numpad({
  theme = THEMES.DARK,
  onDigitPress,
  onClear,
  onBackspace,
  onPlusPress,
  onOkPress,
  okDisabled = false,
  okLabel = 'OK',
  decimalDisabled = false,
  plusDisabled = false,
  accentColor = 'blue',
  showPlus = true,
  showCurrencyToggle = false,
  voucherCurrencyMode = 'BTC',
  onCurrencyToggle,
}) {
  const isBlinkClassicDark = theme === THEMES.BLINK_CLASSIC_DARK;
  const isBlinkClassicLight = theme === THEMES.BLINK_CLASSIC_LIGHT;
  const isBlinkClassic = isBlinkClassicDark || isBlinkClassicLight;
  
  // Base button styles for different themes
  const getButtonClasses = (type = 'digit') => {
    if (isBlinkClassicDark) {
      // BC Dark: transparent bg, #393939 border, hover → #1D1D1D bg + #FFAD0D border
      const baseClassic = 'h-16 md:h-20 bg-transparent border border-blink-classic-border hover:bg-blink-classic-bg hover:border-blink-classic-amber rounded-xl text-xl md:text-2xl font-bold transition-colors';
      
      switch (type) {
        case 'digit':
          return `${baseClassic} text-white`;
        case 'plus':
          return `${baseClassic} text-white disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center`;
        case 'clear':
          return `${baseClassic} text-blink-classic-amber`;
        case 'backspace':
          return `${baseClassic} text-blink-classic-amber flex items-center justify-center`;
        case 'decimal':
          return `${baseClassic} text-white disabled:opacity-50 disabled:cursor-not-allowed`;
        case 'currencyToggle':
          // Dynamic border and text color based on voucher currency mode
          const toggleColorDark = voucherCurrencyMode === 'BTC' 
            ? 'border-orange-500 text-orange-500 hover:border-orange-400 hover:text-orange-400' 
            : 'border-green-500 text-green-500 hover:border-green-400 hover:text-green-400';
          return `h-16 md:h-20 bg-transparent border ${toggleColorDark} rounded-xl text-xl md:text-2xl font-bold transition-colors flex items-center justify-center`;
        case 'ok':
          return 'h-[136px] md:h-[172px] bg-transparent border border-blink-classic-border hover:bg-blink-classic-bg hover:border-blink-classic-amber rounded-xl text-lg md:text-xl font-bold transition-colors text-white disabled:opacity-50 disabled:cursor-not-allowed row-span-2 flex items-center justify-center';
        default:
          return baseClassic;
      }
    }
    
    if (isBlinkClassicLight) {
      // BC Light: transparent bg, #E2E2E4 border, hover → #F2F2F4 bg + #FFAD0D border
      const baseClassic = 'h-16 md:h-20 bg-transparent border border-blink-classic-border-light hover:bg-blink-classic-hover-light hover:border-blink-classic-amber rounded-xl text-xl md:text-2xl font-bold transition-colors';
      
      switch (type) {
        case 'digit':
          return `${baseClassic} text-black`;
        case 'plus':
          return `${baseClassic} text-black disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center`;
        case 'clear':
          return `${baseClassic} text-blink-classic-amber`;
        case 'backspace':
          return `${baseClassic} text-blink-classic-amber flex items-center justify-center`;
        case 'decimal':
          return `${baseClassic} text-black disabled:opacity-50 disabled:cursor-not-allowed`;
        case 'currencyToggle':
          // Dynamic border and text color based on voucher currency mode
          const toggleColorLight = voucherCurrencyMode === 'BTC' 
            ? 'border-orange-500 text-orange-500 hover:border-orange-400 hover:text-orange-400' 
            : 'border-green-500 text-green-500 hover:border-green-400 hover:text-green-400';
          return `h-16 md:h-20 bg-transparent border ${toggleColorLight} rounded-xl text-xl md:text-2xl font-bold transition-colors flex items-center justify-center`;
        case 'ok':
          return 'h-[136px] md:h-[172px] bg-transparent border border-blink-classic-border-light hover:bg-blink-classic-hover-light hover:border-blink-classic-amber rounded-xl text-lg md:text-xl font-bold transition-colors text-black disabled:opacity-50 disabled:cursor-not-allowed row-span-2 flex items-center justify-center';
        default:
          return baseClassic;
      }
    }
    
    // Standard dark/light theme styling
    const colorMap = {
      blue: {
        border: 'border-blue-600 dark:border-blue-500',
        hoverBorder: 'hover:border-blue-700 dark:hover:border-blue-400',
        text: 'text-blue-600 dark:text-blue-400',
        hoverText: 'hover:text-blue-700 dark:hover:text-blue-300',
        hoverBg: 'hover:bg-blue-50 dark:hover:bg-blue-900',
      },
      purple: {
        border: 'border-purple-400 dark:border-purple-400',
        hoverBorder: 'hover:border-purple-500 dark:hover:border-purple-300',
        text: 'text-purple-600 dark:text-purple-400',
        hoverText: 'hover:text-purple-700 dark:hover:text-purple-300',
        hoverBg: 'hover:bg-purple-50 dark:hover:bg-purple-900',
      },
    };
    
    const colors = colorMap[accentColor] || colorMap.blue;
    const baseStandard = `h-16 md:h-20 bg-white dark:bg-black border-2 rounded-lg text-xl md:text-2xl font-normal leading-none tracking-normal transition-colors shadow-md`;
    
    switch (type) {
      case 'digit':
        return `${baseStandard} ${colors.border} ${colors.hoverBorder} ${colors.hoverBg} ${colors.text} ${colors.hoverText}`;
      case 'plus':
        return `${baseStandard} ${colors.border} ${colors.hoverBorder} ${colors.hoverBg} ${colors.text} ${colors.hoverText} disabled:bg-gray-200 dark:disabled:bg-blink-dark disabled:border-gray-400 dark:disabled:border-gray-600 disabled:text-gray-400 dark:disabled:text-gray-500 disabled:cursor-not-allowed flex items-center justify-center`;
      case 'clear':
        return `${baseStandard} border-red-600 dark:border-red-500 hover:border-red-700 dark:hover:border-red-400 hover:bg-red-50 dark:hover:bg-red-900 text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300`;
      case 'backspace':
        return `${baseStandard} border-orange-500 dark:border-orange-500 hover:border-orange-600 dark:hover:border-orange-400 hover:bg-orange-50 dark:hover:bg-orange-900 text-orange-500 dark:text-orange-400 hover:text-orange-600 dark:hover:text-orange-300 flex items-center justify-center`;
      case 'decimal':
        return `${baseStandard} ${colors.border} ${colors.hoverBorder} ${colors.hoverBg} ${colors.text} ${colors.hoverText} disabled:bg-gray-200 dark:disabled:bg-blink-dark disabled:border-gray-400 dark:disabled:border-gray-600 disabled:text-gray-400 dark:disabled:text-gray-500 disabled:cursor-not-allowed`;
      case 'currencyToggle':
        // Dynamic border and text color based on voucher currency mode
        const toggleColorStd = voucherCurrencyMode === 'BTC'
          ? 'border-orange-500 dark:border-orange-500 hover:border-orange-600 dark:hover:border-orange-400 hover:bg-orange-50 dark:hover:bg-orange-900/30 text-orange-500 dark:text-orange-400'
          : 'border-green-500 dark:border-green-500 hover:border-green-600 dark:hover:border-green-400 hover:bg-green-50 dark:hover:bg-green-900/30 text-green-500 dark:text-green-400';
        return `${baseStandard} ${toggleColorStd} flex items-center justify-center`;
      case 'ok':
        return `h-[136px] md:h-[172px] bg-white dark:bg-black border-2 border-green-600 dark:border-green-500 hover:border-green-700 dark:hover:border-green-400 hover:bg-green-50 dark:hover:bg-green-900 text-green-600 dark:text-green-400 hover:text-green-700 dark:hover:text-green-300 disabled:bg-gray-200 dark:disabled:bg-blink-dark disabled:border-gray-400 dark:disabled:border-gray-600 disabled:text-gray-400 dark:disabled:text-gray-500 rounded-lg text-lg md:text-xl font-normal leading-none tracking-normal transition-colors shadow-md flex items-center justify-center row-span-2`;
      default:
        return baseStandard;
    }
  };

  // Container background based on theme
  // Note: BC themes use pb-4 only (no top/horizontal padding) to maintain consistent numpad positioning and key widths across all themes
  const getContainerClasses = () => {
    if (isBlinkClassicDark) {
      return 'bg-black pb-4 rounded-xl';
    }
    if (isBlinkClassicLight) {
      return 'bg-white pb-4 rounded-xl';
    }
    return ''; // Standard themes don't need container bg
  };

  const fontStyle = { fontFamily: "'Source Sans Pro', sans-serif" };

  // Backspace icon SVG
  const BackspaceIcon = () => (
    <svg className="w-5 h-5 md:w-6 md:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={isBlinkClassic ? "1.75" : "2"} d="M12 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2M3 12l6.414 6.414a2 2 0 001.414.586H19a2 2 0 002-2V7a2 2 0 00-2-2h-8.172a2 2 0 00-1.414.586L3 12z" />
    </svg>
  );

  const containerClasses = getContainerClasses();

  return (
    <div className={containerClasses} data-testid="numpad">
      <div className="grid grid-cols-4 gap-3 max-w-sm md:max-w-md mx-auto" data-1p-ignore data-lpignore="true">
        {/* Row 1: 7, 8, 9, + */}
        <button
          onClick={() => onDigitPress('7')}
          className={getButtonClasses('digit')}
          style={fontStyle}
          data-testid="numpad-7"
        >
          7
        </button>
        <button
          onClick={() => onDigitPress('8')}
          className={getButtonClasses('digit')}
          style={fontStyle}
          data-testid="numpad-8"
        >
          8
        </button>
        <button
          onClick={() => onDigitPress('9')}
          className={getButtonClasses('digit')}
          style={fontStyle}
          data-testid="numpad-9"
        >
          9
        </button>
        {showPlus ? (
          <button
            onClick={onPlusPress}
            disabled={plusDisabled}
            className={getButtonClasses('plus')}
            style={fontStyle}
            data-testid="numpad-plus"
          >
            +
          </button>
        ) : showCurrencyToggle && onCurrencyToggle ? (
          <button
            onClick={onCurrencyToggle}
            className={getButtonClasses('currencyToggle')}
            style={fontStyle}
            data-testid="numpad-currency-toggle"
            title={voucherCurrencyMode === 'BTC' ? 'Bitcoin voucher (click to switch to USD)' : 'USD voucher (click to switch to Bitcoin)'}
          >
            {voucherCurrencyMode === 'BTC' ? (
              <span className="text-lg md:text-xl">&#8383;</span>
            ) : (
              <span className="text-lg md:text-xl">$</span>
            )}
          </button>
        ) : (
          <div></div> // Empty cell when showPlus is false and no toggle
        )}

        {/* Row 2: 4, 5, 6, OK (starts) */}
        <button
          onClick={() => onDigitPress('4')}
          className={getButtonClasses('digit')}
          style={fontStyle}
          data-testid="numpad-4"
        >
          4
        </button>
        <button
          onClick={() => onDigitPress('5')}
          className={getButtonClasses('digit')}
          style={fontStyle}
          data-testid="numpad-5"
        >
          5
        </button>
        <button
          onClick={() => onDigitPress('6')}
          className={getButtonClasses('digit')}
          style={fontStyle}
          data-testid="numpad-6"
        >
          6
        </button>
        <button
          onClick={onOkPress}
          disabled={okDisabled}
          className={getButtonClasses('ok')}
          style={fontStyle}
          data-testid="generate-invoice"
        >
          {okLabel}
        </button>

        {/* Row 3: 1, 2, 3, OK (continues via row-span-2) */}
        <button
          onClick={() => onDigitPress('1')}
          className={getButtonClasses('digit')}
          style={fontStyle}
          data-testid="numpad-1"
        >
          1
        </button>
        <button
          onClick={() => onDigitPress('2')}
          className={getButtonClasses('digit')}
          style={fontStyle}
          data-testid="numpad-2"
        >
          2
        </button>
        <button
          onClick={() => onDigitPress('3')}
          className={getButtonClasses('digit')}
          style={fontStyle}
          data-testid="numpad-3"
        >
          3
        </button>

        {/* Row 4: C, 0, ., ⌫ */}
        <button
          onClick={onClear}
          className={getButtonClasses('clear')}
          style={fontStyle}
          data-testid="clear-button"
        >
          C
        </button>
        <button
          onClick={() => onDigitPress('0')}
          className={getButtonClasses('digit')}
          style={fontStyle}
          data-testid="numpad-0"
        >
          0
        </button>
        <button
          onClick={() => onDigitPress('.')}
          disabled={decimalDisabled}
          className={getButtonClasses('decimal')}
          style={fontStyle}
          data-testid="numpad-decimal"
        >
          .
        </button>
        <button
          onClick={onBackspace}
          className={getButtonClasses('backspace')}
          style={fontStyle}
          data-testid="numpad-backspace"
        >
          <BackspaceIcon />
        </button>
      </div>
    </div>
  );
}
