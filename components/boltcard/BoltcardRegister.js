/**
 * BoltcardRegister - Card registration flow with deeplink QR code
 * 
 * Spec-compliant flow (DETERMINISTIC.md / DEEPLINK.md):
 * 1. User enters optional name and spending limits
 * 2. API creates pending registration (card UID unknown)
 * 3. Show QR code with boltcard://program?url=... deeplink
 * 4. NFC Programmer app scans QR, taps card to discover UID
 * 5. App POSTs UID to keys endpoint, gets keys, programs card
 */

import { useState, useEffect } from 'react';
import { useTheme } from '../../lib/hooks/useTheme';
import { CardCurrency } from './useBoltcards';
import { QRCodeSVG } from 'qrcode.react';

/**
 * Registration steps
 */
const Steps = {
  WALLET_SETTINGS: 'wallet_settings',
  PROGRAMMING_QR: 'programming_qr',
};

/**
 * Detect if user is on a mobile device
 */
const isMobileDevice = () => {
  if (typeof window === 'undefined') return false;
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
    navigator.userAgent
  );
};

/**
 * Detect if user is on Android (NFC Programmer app is primarily for Android)
 */
const isAndroid = () => {
  if (typeof window === 'undefined') return false;
  return /Android/i.test(navigator.userAgent);
};

/**
 * Detect if user is on iOS
 */
const isIOS = () => {
  if (typeof window === 'undefined') return false;
  return /iPhone|iPad|iPod/i.test(navigator.userAgent);
};

/**
 * BoltcardRegister component
 * @param {Object} props
 * @param {Function} props.onRegister - Callback for registration
 * @param {Function} props.onCancel - Callback for cancellation
 * @param {boolean} props.loading - Loading state
 * @param {Object} props.voucherWallet - The configured sending wallet with apiKey
 * @param {string} props.voucherWalletBtcId - BTC wallet ID
 * @param {string} props.voucherWalletUsdId - USD wallet ID (Stablesats)
 */
export default function BoltcardRegister({
  onRegister,
  onCancel,
  loading = false,
  voucherWallet,
  voucherWalletBtcId,
  voucherWalletUsdId,
}) {
  const { darkMode } = useTheme();
  
  // Form state
  const [step, setStep] = useState(Steps.WALLET_SETTINGS);
  const [name, setName] = useState('');
  const [walletCurrency, setWalletCurrency] = useState(CardCurrency.BTC);
  const [maxTxAmount, setMaxTxAmount] = useState('');
  const [dailyLimit, setDailyLimit] = useState('');
  const [error, setError] = useState(null);
  const [isRegistering, setIsRegistering] = useState(false);
  
  // Registration result (deeplink flow)
  const [registrationResult, setRegistrationResult] = useState(null);
  
  // QR code visibility (collapsed by default on mobile)
  const [showQR, setShowQR] = useState(false);
  
  // Expiry countdown
  const [expiresIn, setExpiresIn] = useState(null);
  
  // Platform detection (run once on mount)
  const [isMobile, setIsMobile] = useState(false);
  const [isAndroidDevice, setIsAndroidDevice] = useState(false);
  const [isIOSDevice, setIsIOSDevice] = useState(false);
  
  useEffect(() => {
    setIsMobile(isMobileDevice());
    setIsAndroidDevice(isAndroid());
    setIsIOSDevice(isIOS());
    // Default QR visibility based on platform
    setShowQR(!isMobileDevice());
  }, []);

  /**
   * Countdown timer for pending registration expiry
   */
  useEffect(() => {
    if (!registrationResult?.pendingRegistration?.expiresAt) return;
    
    const expiresAt = new Date(registrationResult.pendingRegistration.expiresAt).getTime();
    
    const updateCountdown = () => {
      const now = Date.now();
      const remaining = Math.max(0, Math.floor((expiresAt - now) / 1000));
      setExpiresIn(remaining);
      
      if (remaining <= 0) {
        setError('Registration expired. Please try again.');
        setStep(Steps.WALLET_SETTINGS);
        setRegistrationResult(null);
      }
    };
    
    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, [registrationResult?.pendingRegistration?.expiresAt]);

  /**
   * Format countdown time
   */
  const formatCountdown = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  /**
   * Handle registration - creates pending registration and gets deeplink
   */
  const handleRegister = async () => {
    setError(null);
    setIsRegistering(true);

    // Get API key from voucherWallet
    const apiKey = voucherWallet?.apiKey;
    if (!apiKey) {
      setError('No Sending Wallet configured. Please add a wallet in Settings first.');
      setIsRegistering(false);
      return;
    }

    // Get wallet ID based on selected currency
    const walletId = walletCurrency === CardCurrency.USD 
      ? voucherWalletUsdId 
      : voucherWalletBtcId;
    
    if (!walletId) {
      setError(`No ${walletCurrency} wallet available. Please configure a Sending Wallet with a ${walletCurrency} wallet.`);
      setIsRegistering(false);
      return;
    }

    // Parse limits (convert to sats for BTC, cents for USD)
    let parsedMaxTx = null;
    let parsedDailyLimit = null;

    if (maxTxAmount) {
      const amount = parseFloat(maxTxAmount);
      if (isNaN(amount) || amount <= 0) {
        setError('Invalid max transaction amount');
        setIsRegistering(false);
        return;
      }
      // For USD, user enters dollars, convert to cents
      // For BTC, user enters sats
      parsedMaxTx = walletCurrency === CardCurrency.USD 
        ? Math.round(amount * 100) 
        : Math.round(amount);
    }

    if (dailyLimit) {
      const amount = parseFloat(dailyLimit);
      if (isNaN(amount) || amount <= 0) {
        setError('Invalid daily limit');
        setIsRegistering(false);
        return;
      }
      parsedDailyLimit = walletCurrency === CardCurrency.USD 
        ? Math.round(amount * 100) 
        : Math.round(amount);
    }

    // Call registration WITHOUT cardUid - this triggers deeplink flow
    const result = await onRegister({
      // No cardUid - triggers deeplink flow
      walletId,
      apiKey,
      name: name.trim() || undefined,
      walletCurrency,
      maxTxAmount: parsedMaxTx,
      dailyLimit: parsedDailyLimit,
    });

    setIsRegistering(false);

    if (result.success) {
      // Deeplink flow returns pendingRegistration and deeplink
      if (result.flow === 'deeplink' && result.pendingRegistration) {
        setRegistrationResult(result);
        setStep(Steps.PROGRAMMING_QR);
      } else if (result.card) {
        // Direct flow (fallback if cardUid was somehow provided)
        setRegistrationResult(result);
        setStep(Steps.PROGRAMMING_QR);
      }
    } else {
      setError(result.error || 'Registration failed');
    }
  };

  /**
   * Render step 1: Wallet settings (now the first step)
   */
  const renderWalletSettingsStep = () => (
    <div className="space-y-4">
      <div>
        <h4 className={`font-medium mb-2 ${darkMode ? 'text-white' : 'text-gray-900'}`}>
          Register New Boltcard
        </h4>
        <p className={`text-sm mb-4 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
          Configure your card settings. After registration, you'll receive a QR code to program your NTAG424DNA card using the Bolt Card NFC Programmer app.
        </p>
      </div>

      {/* Card Name */}
      <div>
        <label className={`block text-sm mb-1 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
          Card Name (optional)
        </label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="My Boltcard"
          autoComplete="off"
          className={`w-full px-3 py-2 rounded-md border text-sm ${
            darkMode 
              ? 'bg-gray-800 border-gray-600 text-white placeholder-gray-500' 
              : 'bg-white border-gray-300 text-gray-900 placeholder-gray-400'
          } focus:outline-none focus:ring-2 focus:ring-blink-accent focus:border-transparent`}
        />
      </div>

      {/* Wallet Currency Selection */}
      <div>
        <label className={`block text-sm mb-2 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
          Wallet Currency
        </label>
        <div className="flex gap-2">
          <button
            onClick={() => setWalletCurrency(CardCurrency.BTC)}
            className={`flex-1 py-3 px-4 rounded-lg border-2 transition-colors ${
              walletCurrency === CardCurrency.BTC
                ? 'border-blink-accent bg-blink-accent/10'
                : darkMode
                  ? 'border-gray-700 bg-gray-800 hover:bg-gray-700'
                  : 'border-gray-200 bg-white hover:bg-gray-50'
            }`}
          >
            <div className="flex flex-col items-center gap-1">
              <span className="text-xl">&#8383;</span>
              <span className={`text-sm font-medium ${
                walletCurrency === CardCurrency.BTC
                  ? 'text-blink-accent'
                  : darkMode ? 'text-white' : 'text-gray-900'
              }`}>
                Bitcoin (sats)
              </span>
            </div>
          </button>
          <button
            onClick={() => setWalletCurrency(CardCurrency.USD)}
            className={`flex-1 py-3 px-4 rounded-lg border-2 transition-colors ${
              walletCurrency === CardCurrency.USD
                ? 'border-blink-accent bg-blink-accent/10'
                : darkMode
                  ? 'border-gray-700 bg-gray-800 hover:bg-gray-700'
                  : 'border-gray-200 bg-white hover:bg-gray-50'
            }`}
          >
            <div className="flex flex-col items-center gap-1">
              <span className="text-xl">$</span>
              <span className={`text-sm font-medium ${
                walletCurrency === CardCurrency.USD
                  ? 'text-blink-accent'
                  : darkMode ? 'text-white' : 'text-gray-900'
              }`}>
                Stablesats (USD)
              </span>
            </div>
          </button>
        </div>
      </div>

      {/* Spending Limits */}
      <div className={`p-3 rounded-lg ${darkMode ? 'bg-gray-800' : 'bg-gray-100'}`}>
        <h5 className={`text-sm font-medium mb-3 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
          Spending Limits (optional)
        </h5>
        
        <div className="space-y-3">
          <div>
            <label className={`block text-xs mb-1 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
              Max per transaction ({walletCurrency === CardCurrency.USD ? 'USD' : 'sats'})
            </label>
            <input
              type="number"
              value={maxTxAmount}
              onChange={(e) => setMaxTxAmount(e.target.value)}
              placeholder={walletCurrency === CardCurrency.USD ? '50.00' : '50000'}
              min="0"
              step={walletCurrency === CardCurrency.USD ? '0.01' : '1'}
              className={`w-full px-3 py-2 rounded-md border text-sm ${
                darkMode 
                  ? 'bg-gray-900 border-gray-600 text-white placeholder-gray-500' 
                  : 'bg-white border-gray-300 text-gray-900 placeholder-gray-400'
              } focus:outline-none focus:ring-2 focus:ring-blink-accent focus:border-transparent`}
            />
          </div>
          
          <div>
            <label className={`block text-xs mb-1 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
              Daily limit ({walletCurrency === CardCurrency.USD ? 'USD' : 'sats'})
            </label>
            <input
              type="number"
              value={dailyLimit}
              onChange={(e) => setDailyLimit(e.target.value)}
              placeholder={walletCurrency === CardCurrency.USD ? '100.00' : '100000'}
              min="0"
              step={walletCurrency === CardCurrency.USD ? '0.01' : '1'}
              className={`w-full px-3 py-2 rounded-md border text-sm ${
                darkMode 
                  ? 'bg-gray-900 border-gray-600 text-white placeholder-gray-500' 
                  : 'bg-white border-gray-300 text-gray-900 placeholder-gray-400'
              } focus:outline-none focus:ring-2 focus:ring-blink-accent focus:border-transparent`}
            />
          </div>
        </div>
      </div>

      {error && (
        <p className="text-sm text-red-500">{error}</p>
      )}

      <div className="flex gap-2">
        <button
          onClick={onCancel}
          className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
            darkMode 
              ? 'bg-gray-800 text-gray-300 hover:bg-gray-700' 
              : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
          }`}
        >
          Cancel
        </button>
        <button
          onClick={handleRegister}
          disabled={loading || isRegistering}
          className="flex-1 py-2 bg-blink-accent text-black text-sm font-medium rounded-md hover:bg-blink-accent/90 disabled:opacity-50 transition-colors"
        >
          {isRegistering ? 'Creating...' : 'Create Card'}
        </button>
      </div>
    </div>
  );

  /**
   * Render step 2: Programming QR code (deeplink)
   */
  const renderProgrammingQRStep = () => {
    if (!registrationResult) return null;

    // Deeplink flow - show boltcard://program?url=... QR code
    const isDeeplinkFlow = registrationResult.flow === 'deeplink';
    const qrPayload = registrationResult.qrPayload || registrationResult.deeplink;
    const pendingReg = registrationResult.pendingRegistration;

    /**
     * Handle opening the deeplink
     */
    const handleOpenDeeplink = () => {
      if (qrPayload) {
        // On mobile, try to open the deeplink
        window.location.href = qrPayload;
      }
    };

    return (
      <div className="space-y-4">
        <div className="text-center">
          <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-blink-accent/20 flex items-center justify-center">
            <svg className="w-6 h-6 text-blink-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
            </svg>
          </div>
          <h4 className={`font-medium mb-2 ${darkMode ? 'text-white' : 'text-gray-900'}`}>
            Program Your Card
          </h4>
          <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
            {isMobile 
              ? 'Open the NFC Programmer app to program your NTAG424DNA card.'
              : 'Scan this QR code with the Bolt Card NFC Programmer app to program your NTAG424DNA card.'
            }
          </p>
        </div>

        {/* Expiry countdown */}
        {isDeeplinkFlow && expiresIn !== null && (
          <div className={`text-center py-2 rounded-lg ${
            expiresIn < 60 
              ? darkMode ? 'bg-red-900/20 text-red-400' : 'bg-red-50 text-red-600'
              : expiresIn < 300
                ? darkMode ? 'bg-yellow-900/20 text-yellow-400' : 'bg-yellow-50 text-yellow-600'
                : darkMode ? 'bg-gray-800 text-gray-300' : 'bg-gray-100 text-gray-600'
          }`}>
            <span className="text-sm">
              Expires in <span className="font-mono font-medium">{formatCountdown(expiresIn)}</span>
            </span>
          </div>
        )}

        {/* Primary action: Open in NFC Programmer (mobile only) */}
        {isMobile && qrPayload && (
          <div className="space-y-3">
            <button
              onClick={handleOpenDeeplink}
              className="w-full py-4 bg-blink-accent text-black font-medium rounded-lg hover:bg-blink-accent/90 transition-colors flex items-center justify-center gap-3"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
              </svg>
              <span>Open in NFC Programmer</span>
            </button>
            
            {/* App download links - shown prominently on mobile */}
            <div className={`p-3 rounded-lg border ${
              darkMode ? 'bg-blue-900/10 border-blue-500/30' : 'bg-blue-50 border-blue-200'
            }`}>
              <p className={`text-sm mb-2 ${darkMode ? 'text-blue-300' : 'text-blue-700'}`}>
                Don't have the NFC Programmer app?
              </p>
              <div className="flex gap-3">
                {isAndroidDevice && (
                  <a 
                    href="https://play.google.com/store/apps/details?id=com.lightningnfcapp"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 py-2 px-3 bg-blink-accent/20 text-blink-accent text-sm font-medium rounded-md text-center hover:bg-blink-accent/30 transition-colors"
                  >
                    Get on Google Play
                  </a>
                )}
                {isIOSDevice && (
                  <a 
                    href="https://apps.apple.com/app/boltcard-nfc-programmer/id6450968873"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 py-2 px-3 bg-blink-accent/20 text-blink-accent text-sm font-medium rounded-md text-center hover:bg-blink-accent/30 transition-colors"
                  >
                    Get on App Store
                  </a>
                )}
                {!isAndroidDevice && !isIOSDevice && (
                  <>
                    <a 
                      href="https://play.google.com/store/apps/details?id=com.lightningnfcapp"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-1 py-2 px-3 bg-blink-accent/20 text-blink-accent text-sm font-medium rounded-md text-center hover:bg-blink-accent/30 transition-colors"
                    >
                      Google Play
                    </a>
                    <a 
                      href="https://apps.apple.com/app/boltcard-nfc-programmer/id6450968873"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-1 py-2 px-3 bg-blink-accent/20 text-blink-accent text-sm font-medium rounded-md text-center hover:bg-blink-accent/30 transition-colors"
                    >
                      App Store
                    </a>
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        {/* QR Code section - collapsible on mobile */}
        {qrPayload && (
          <div className={`rounded-lg ${darkMode ? 'bg-gray-800' : 'bg-gray-100'}`}>
            {/* Toggle header for mobile */}
            {isMobile ? (
              <button
                onClick={() => setShowQR(!showQR)}
                className={`w-full p-3 flex items-center justify-between ${
                  darkMode ? 'text-gray-300 hover:text-white' : 'text-gray-600 hover:text-gray-900'
                } transition-colors`}
              >
                <span className="text-sm font-medium">
                  Or scan with another device
                </span>
                <svg 
                  className={`w-5 h-5 transition-transform ${showQR ? 'rotate-180' : ''}`} 
                  fill="none" 
                  stroke="currentColor" 
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                </svg>
              </button>
            ) : null}
            
            {/* QR Code display */}
            {(showQR || !isMobile) && (
              <div className={`p-4 ${isMobile ? 'border-t ' + (darkMode ? 'border-gray-700' : 'border-gray-200') : ''}`}>
                <div className="flex justify-center mb-3">
                  <div className="p-3 bg-white rounded-lg">
                    <QRCodeSVG
                      value={qrPayload}
                      size={200}
                      level="M"
                      includeMargin={false}
                    />
                  </div>
                </div>
                <p className={`text-xs text-center ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                  Scan with Bolt Card NFC Programmer app
                </p>
              </div>
            )}
          </div>
        )}

        {/* Card info summary */}
        {pendingReg && (
          <div className={`p-3 rounded-lg text-sm ${darkMode ? 'bg-gray-900' : 'bg-gray-50'}`}>
            {pendingReg.name && (
              <div className="flex justify-between mb-1">
                <span className={darkMode ? 'text-gray-400' : 'text-gray-500'}>Name</span>
                <span className={darkMode ? 'text-white' : 'text-gray-900'}>
                  {pendingReg.name}
                </span>
              </div>
            )}
            <div className="flex justify-between mb-1">
              <span className={darkMode ? 'text-gray-400' : 'text-gray-500'}>Currency</span>
              <span className={darkMode ? 'text-white' : 'text-gray-900'}>
                {pendingReg.walletCurrency || walletCurrency}
              </span>
            </div>
            <div className="flex justify-between">
              <span className={darkMode ? 'text-gray-400' : 'text-gray-500'}>Status</span>
              <span className="text-yellow-500">Awaiting Programming</span>
            </div>
          </div>
        )}

        {/* Instructions */}
        <div className={`p-3 rounded-lg border ${
          darkMode ? 'bg-blue-900/10 border-blue-500/30' : 'bg-blue-50 border-blue-200'
        }`}>
          <h5 className={`text-sm font-medium mb-2 ${darkMode ? 'text-blue-400' : 'text-blue-700'}`}>
            Programming Steps:
          </h5>
          <ol className={`text-xs space-y-1 list-decimal list-inside ${
            darkMode ? 'text-blue-300' : 'text-blue-600'
          }`}>
            {isMobile ? (
              <>
                <li>Tap "Open in NFC Programmer" above</li>
                <li>The app will open and prompt you to tap your card</li>
                <li>Hold your NTAG424DNA card to your phone's NFC reader</li>
                <li>Wait for programming to complete</li>
                <li>Your card is ready! Top up to start using it</li>
              </>
            ) : (
              <>
                <li>Open the Bolt Card NFC Programmer app on your phone</li>
                <li>Tap "Scan QR" or use camera to scan the code above</li>
                <li>Hold your NTAG424DNA card to your phone's NFC reader</li>
                <li>Wait for programming to complete</li>
                <li>Your card is ready! Top up to start using it</li>
              </>
            )}
          </ol>
        </div>

        {/* App download links - for desktop users */}
        {!isMobile && (
          <div className={`p-3 rounded-lg ${darkMode ? 'bg-gray-900' : 'bg-gray-50'}`}>
            <p className={`text-xs mb-2 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
              Don't have the app?
            </p>
            <div className="flex gap-2 text-xs">
              <a 
                href="https://apps.apple.com/app/boltcard-nfc-programmer/id6450968873"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blink-accent hover:underline"
              >
                iOS App Store
              </a>
              <span className={darkMode ? 'text-gray-600' : 'text-gray-300'}>|</span>
              <a 
                href="https://play.google.com/store/apps/details?id=com.lightningnfcapp"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blink-accent hover:underline"
              >
                Google Play
              </a>
            </div>
          </div>
        )}

        <div className="flex gap-2">
          <button
            onClick={() => {
              setStep(Steps.WALLET_SETTINGS);
              setRegistrationResult(null);
              setError(null);
            }}
            className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
              darkMode 
                ? 'bg-gray-800 text-gray-300 hover:bg-gray-700' 
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
          >
            Back
          </button>
          <button
            onClick={onCancel}
            className="flex-1 py-2 bg-blink-accent text-black text-sm font-medium rounded-md hover:bg-blink-accent/90 transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className={`rounded-lg p-4 ${darkMode ? 'bg-gray-900' : 'bg-gray-50'}`}>
      {/* Progress indicator */}
      <div className="flex items-center justify-center gap-2 mb-4">
        {[Steps.WALLET_SETTINGS, Steps.PROGRAMMING_QR].map((s, index) => (
          <div
            key={s}
            className={`w-2 h-2 rounded-full transition-colors ${
              step === s
                ? 'bg-blink-accent'
                : index < Object.values(Steps).indexOf(step)
                  ? 'bg-blink-accent/50'
                  : darkMode ? 'bg-gray-700' : 'bg-gray-300'
            }`}
          />
        ))}
      </div>

      {step === Steps.WALLET_SETTINGS && renderWalletSettingsStep()}
      {step === Steps.PROGRAMMING_QR && renderProgrammingQRStep()}
    </div>
  );
}
