/**
 * BoltcardDetails - Card details modal
 * 
 * Shows:
 * - Full card info
 * - Transaction history
 * - Top-up QR code
 * - Edit limits
 * - Disable/wipe actions
 * - Reset card with deeplink QR (spec-compliant)
 */

import { useState, useEffect } from 'react';
import { useTheme } from '../../lib/hooks/useTheme';
import { CardStatus } from './useBoltcards';
import BoltcardTopUp from './BoltcardTopUp';
import { QRCodeSVG } from 'qrcode.react';

/**
 * Format balance for display
 */
function formatBalance(balance, currency) {
  if (currency === 'USD') {
    return `$${(balance / 100).toFixed(2)}`;
  }
  if (balance >= 100000) {
    return `${(balance / 100000000).toFixed(8)} BTC`;
  }
  return `${balance.toLocaleString()} sats`;
}

/**
 * Format date for display
 */
function formatDate(dateString) {
  if (!dateString) return 'Never';
  const date = new Date(dateString);
  return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

/**
 * Get transaction type display
 */
function getTransactionTypeInfo(type) {
  switch (type) {
    case 'topup':
      return { label: 'Top Up', color: 'text-green-500', sign: '+' };
    case 'withdraw':
      return { label: 'Payment', color: 'text-red-500', sign: '-' };
    case 'adjust':
      return { label: 'Adjustment', color: 'text-blue-500', sign: '' };
    case 'refund':
      return { label: 'Refund', color: 'text-green-500', sign: '+' };
    default:
      return { label: type, color: 'text-gray-500', sign: '' };
  }
}

/**
 * Tabs for the details view
 */
const Tabs = {
  DETAILS: 'details',
  TOPUP: 'topup',
  HISTORY: 'history',
  SETTINGS: 'settings',
};

/**
 * Generate reset deeplink URL
 * Format: boltcard://reset?url={serverUrl}/api/boltcard/reset/{cardId}
 */
function generateResetDeeplink(cardId) {
  // Get the server URL from environment or current location
  const serverUrl = typeof window !== 'undefined' 
    ? window.location.origin 
    : process.env.NEXT_PUBLIC_BASE_URL || '';
  
  const resetUrl = `${serverUrl}/api/boltcard/reset/${cardId}`;
  return `boltcard://reset?url=${encodeURIComponent(resetUrl)}`;
}

/**
 * BoltcardDetails component
 */
export default function BoltcardDetails({
  card,
  onClose,
  onUpdate,
  onDisable,
  onEnable,
  onWipe,
  onResetDaily,
  onFund,
  fetchDetails,
}) {
  const { darkMode } = useTheme();
  const [activeTab, setActiveTab] = useState(Tabs.DETAILS);
  const [loading, setLoading] = useState(false);
  const [transactions, setTransactions] = useState([]);
  const [topUpQR, setTopUpQR] = useState(null);
  
  // Edit state
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(card.name || '');
  const [editMaxTx, setEditMaxTx] = useState(
    card.maxTxAmount 
      ? card.walletCurrency === 'USD' 
        ? (card.maxTxAmount / 100).toString()
        : card.maxTxAmount.toString()
      : ''
  );
  const [editDailyLimit, setEditDailyLimit] = useState(
    card.dailyLimit
      ? card.walletCurrency === 'USD'
        ? (card.dailyLimit / 100).toString()
        : card.dailyLimit.toString()
      : ''
  );
  const [error, setError] = useState(null);
  
  // Reset card state
  const [showResetModal, setShowResetModal] = useState(false);
  const [resetDeeplink, setResetDeeplink] = useState(null);
  const [showResetQRCode, setShowResetQRCode] = useState(false);
  const [wipeKeys, setWipeKeys] = useState(null);
  const [wipeKeysLoading, setWipeKeysLoading] = useState(false);
  const [wipeKeysError, setWipeKeysError] = useState(null);
  const [keysRevealed, setKeysRevealed] = useState(false);
  const [copiedKey, setCopiedKey] = useState(null);

  // Platform detection for mobile-first UI
  const [isMobile, setIsMobile] = useState(false);
  const [isAndroidDevice, setIsAndroidDevice] = useState(false);
  const [isIOSDevice, setIsIOSDevice] = useState(false);

  // Detect mobile on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const ua = navigator.userAgent.toLowerCase();
      const mobile = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(ua);
      setIsMobile(mobile);
      setIsAndroidDevice(/android/i.test(ua));
      setIsIOSDevice(/iphone|ipad|ipod/i.test(ua));
    }
  }, []);

  // Load card details on mount
  useEffect(() => {
    const loadDetails = async () => {
      if (fetchDetails) {
        setLoading(true);
        const result = await fetchDetails(card.id, true);
        if (result.success) {
          setTransactions(result.transactions || []);
          setTopUpQR(result.topUpQR);
        }
        setLoading(false);
      }
    };
    loadDetails();
  }, [card.id, fetchDetails]);

  /**
   * Handle save settings
   */
  const handleSave = async () => {
    setError(null);
    setLoading(true);

    const updates = {};
    
    if (editName !== (card.name || '')) {
      updates.name = editName.trim() || null;
    }

    const newMaxTx = editMaxTx 
      ? card.walletCurrency === 'USD'
        ? Math.round(parseFloat(editMaxTx) * 100)
        : parseInt(editMaxTx)
      : null;
    if (newMaxTx !== card.maxTxAmount) {
      updates.maxTxAmount = newMaxTx;
    }

    const newDailyLimit = editDailyLimit
      ? card.walletCurrency === 'USD'
        ? Math.round(parseFloat(editDailyLimit) * 100)
        : parseInt(editDailyLimit)
      : null;
    if (newDailyLimit !== card.dailyLimit) {
      updates.dailyLimit = newDailyLimit;
    }

    if (Object.keys(updates).length === 0) {
      setEditing(false);
      setLoading(false);
      return;
    }

    const result = await onUpdate(card.id, updates);
    setLoading(false);

    if (result.success) {
      setEditing(false);
    } else {
      setError(result.error || 'Failed to update card');
    }
  };

  /**
   * Handle wipe with confirmation
   */
  const handleWipe = async () => {
    if (!window.confirm('Are you sure you want to wipe this card? This cannot be undone.')) {
      return;
    }
    
    setLoading(true);
    const result = await onWipe(card.id);
    setLoading(false);
    
    if (result.success) {
      onClose();
    } else {
      setError(result.error || 'Failed to wipe card');
    }
  };

  /**
   * Handle reset card - show reset modal and fetch wipe keys
   */
  const handleShowResetModal = async () => {
    const deeplink = generateResetDeeplink(card.id);
    setResetDeeplink(deeplink);
    setShowResetModal(true);
    setShowResetQRCode(!isMobile);
    setKeysRevealed(false);
    setWipeKeys(null);
    setWipeKeysError(null);
    
    // Fetch wipe keys from the API
    setWipeKeysLoading(true);
    try {
      const response = await fetch(`/api/boltcard/wipe-keys/${card.id}`, {
        credentials: 'include', // Include cookies for session auth
      });
      
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || data.error || 'Failed to fetch wipe keys');
      }
      
      const data = await response.json();
      setWipeKeys(data);
    } catch (error) {
      console.error('Failed to fetch wipe keys:', error);
      setWipeKeysError(error.message);
    } finally {
      setWipeKeysLoading(false);
    }
  };

  /**
   * Handle opening reset deeplink directly (mobile)
   */
  const handleOpenResetDeeplink = () => {
    if (resetDeeplink) {
      window.location.href = resetDeeplink;
    }
  };

  /**
   * Copy key to clipboard
   */
  const handleCopyKey = async (keyName, keyValue) => {
    try {
      await navigator.clipboard.writeText(keyValue);
      setCopiedKey(keyName);
      setTimeout(() => setCopiedKey(null), 2000);
    } catch (error) {
      console.error('Failed to copy:', error);
    }
  };

  /**
   * Copy wipe JSON to clipboard
   */
  const handleCopyWipeJson = async () => {
    if (!wipeKeys?.wipeJson) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(wipeKeys.wipeJson, null, 2));
      setCopiedKey('wipeJson');
      setTimeout(() => setCopiedKey(null), 2000);
    } catch (error) {
      console.error('Failed to copy:', error);
    }
  };

  /**
   * Render tab button
   */
  const TabButton = ({ tab, label, icon }) => (
    <button
      onClick={() => setActiveTab(tab)}
      className={`flex-1 py-2 text-sm font-medium transition-colors ${
        activeTab === tab
          ? 'text-blink-accent border-b-2 border-blink-accent'
          : darkMode
            ? 'text-gray-400 hover:text-gray-300'
            : 'text-gray-500 hover:text-gray-700'
      }`}
    >
      {label}
    </button>
  );

  /**
   * Render reset modal with wipe keys
   */
  const renderResetModal = () => {
    if (!showResetModal) return null;

    const wipeJsonString = wipeKeys?.wipeJson ? JSON.stringify(wipeKeys.wipeJson) : null;

    return (
      <div className="fixed inset-0 z-[60] bg-black/70 flex items-center justify-center p-4">
        <div className={`w-full max-w-sm max-h-[90vh] rounded-xl shadow-2xl overflow-hidden flex flex-col ${
          darkMode ? 'bg-gray-900' : 'bg-white'
        }`}>
          {/* Header */}
          <div className={`flex-shrink-0 flex items-center justify-between px-4 py-3 border-b ${
            darkMode ? 'border-gray-700' : 'border-gray-200'
          }`}>
            <h3 className={`text-lg font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>
              Reset Card
            </h3>
            <button
              onClick={() => setShowResetModal(false)}
              className={`p-2 -mr-2 rounded-md ${
                darkMode 
                  ? 'text-gray-400 hover:text-gray-300 hover:bg-gray-800' 
                  : 'text-gray-600 hover:text-gray-800 hover:bg-gray-100'
              }`}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Content - Scrollable */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            
            {/* Loading state */}
            {wipeKeysLoading && (
              <div className="text-center py-8">
                <div className="animate-spin w-8 h-8 border-2 border-blink-accent border-t-transparent rounded-full mx-auto mb-3" />
                <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                  Loading wipe keys...
                </p>
              </div>
            )}

            {/* Error state */}
            {wipeKeysError && (
              <div className={`p-4 rounded-lg border ${
                darkMode ? 'bg-red-900/10 border-red-500/30' : 'bg-red-50 border-red-200'
              }`}>
                <h5 className={`text-sm font-medium mb-1 ${darkMode ? 'text-red-400' : 'text-red-700'}`}>
                  Failed to load wipe keys
                </h5>
                <p className={`text-xs ${darkMode ? 'text-red-300' : 'text-red-600'}`}>
                  {wipeKeysError}
                </p>
              </div>
            )}

            {/* Success state with keys */}
            {wipeKeys && !wipeKeysLoading && (
              <>
                {/* Security warning (must acknowledge before revealing keys) */}
                {!keysRevealed ? (
                  <div className="space-y-4">
                    <div className={`p-4 rounded-lg border ${
                      darkMode ? 'bg-yellow-900/10 border-yellow-500/30' : 'bg-yellow-50 border-yellow-200'
                    }`}>
                      <h5 className={`text-sm font-bold mb-2 flex items-center gap-2 ${darkMode ? 'text-yellow-400' : 'text-yellow-700'}`}>
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                        Security Warning
                      </h5>
                      <p className={`text-xs mb-3 ${darkMode ? 'text-yellow-300' : 'text-yellow-600'}`}>
                        The keys you are about to view are sensitive cryptographic secrets. 
                        <strong> Anyone with access to these keys can reset your card.</strong>
                      </p>
                      <ul className={`text-xs space-y-1 list-disc list-inside ${darkMode ? 'text-yellow-300' : 'text-yellow-600'}`}>
                        <li>Do not share these keys with anyone</li>
                        <li>Do not screenshot or save them insecurely</li>
                        <li>Close this window after you're done</li>
                      </ul>
                    </div>

                    <button
                      onClick={() => setKeysRevealed(true)}
                      className="w-full py-3 bg-yellow-500 text-black text-sm font-medium rounded-lg hover:bg-yellow-400 transition-colors"
                    >
                      I Understand, Show Keys
                    </button>
                  </div>
                ) : (
                  <>
                    {/* Card info */}
                    <div className={`p-3 rounded-lg ${darkMode ? 'bg-gray-800' : 'bg-gray-100'}`}>
                      <div className="flex justify-between text-sm">
                        <span className={darkMode ? 'text-gray-400' : 'text-gray-500'}>Card UID</span>
                        <span className={`font-mono ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                          {wipeKeys.card?.uid?.toUpperCase() || 'Unknown'}
                        </span>
                      </div>
                      <div className="flex justify-between text-sm mt-1">
                        <span className={darkMode ? 'text-gray-400' : 'text-gray-500'}>Key Version</span>
                        <span className={darkMode ? 'text-white' : 'text-gray-900'}>
                          {wipeKeys.card?.version || 1}
                        </span>
                      </div>
                    </div>

                    {/* Wipe JSON QR Code */}
                    {wipeJsonString && (
                      <div className={`p-4 rounded-lg ${darkMode ? 'bg-gray-800' : 'bg-gray-100'}`}>
                        <p className={`text-xs text-center mb-3 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                          Scan with NFC Programmer app (Reset screen)
                        </p>
                        <div className="flex justify-center mb-3">
                          <div className="p-3 bg-white rounded-lg">
                            <QRCodeSVG
                              value={wipeJsonString}
                              size={180}
                              level="M"
                              includeMargin={false}
                            />
                          </div>
                        </div>
                        <button
                          onClick={handleCopyWipeJson}
                          className={`w-full py-2 text-xs font-medium rounded-md transition-colors flex items-center justify-center gap-2 ${
                            copiedKey === 'wipeJson'
                              ? 'bg-green-500 text-white'
                              : darkMode
                                ? 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                          }`}
                        >
                          {copiedKey === 'wipeJson' ? (
                            <>
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                              </svg>
                              Copied!
                            </>
                          ) : (
                            <>
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                              </svg>
                              Copy Wipe JSON
                            </>
                          )}
                        </button>
                      </div>
                    )}

                    {/* Individual keys with copy buttons */}
                    <div className={`rounded-lg overflow-hidden ${darkMode ? 'bg-gray-800' : 'bg-gray-100'}`}>
                      <div className={`px-3 py-2 ${darkMode ? 'bg-gray-700' : 'bg-gray-200'}`}>
                        <h5 className={`text-xs font-medium ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                          Individual Keys (for manual entry)
                        </h5>
                      </div>
                      <div className="p-2 space-y-1">
                        {wipeKeys.keys && Object.entries(wipeKeys.keys).map(([keyName, keyValue]) => (
                          <button
                            key={keyName}
                            onClick={() => handleCopyKey(keyName, keyValue)}
                            className={`w-full flex items-center justify-between px-3 py-2 rounded-md transition-colors ${
                              copiedKey === keyName
                                ? 'bg-green-500 text-white'
                                : darkMode
                                  ? 'hover:bg-gray-700'
                                  : 'hover:bg-gray-200'
                            }`}
                          >
                            <span className={`text-xs font-bold ${
                              copiedKey === keyName ? 'text-white' : darkMode ? 'text-blink-accent' : 'text-blink-accent'
                            }`}>
                              {keyName.toUpperCase()}
                            </span>
                            <span className={`font-mono text-xs ${
                              copiedKey === keyName ? 'text-white' : darkMode ? 'text-gray-300' : 'text-gray-700'
                            }`}>
                              {copiedKey === keyName ? 'Copied!' : keyValue}
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Instructions */}
                    <div className={`p-3 rounded-lg ${darkMode ? 'bg-gray-800' : 'bg-gray-100'}`}>
                      <h5 className={`text-xs font-medium mb-2 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                        How to Reset:
                      </h5>
                      <ol className={`text-xs space-y-1 list-decimal list-inside ${
                        darkMode ? 'text-gray-400' : 'text-gray-500'
                      }`}>
                        <li>Open the Bolt Card NFC Programmer app</li>
                        <li>Go to the "Reset" screen</li>
                        <li>Scan the QR code above, OR enter keys manually</li>
                        <li>Tap your card on your phone when prompted</li>
                        <li>Wait for reset to complete</li>
                      </ol>
                    </div>

                    {/* App download links */}
                    <div className={`p-3 rounded-lg border ${
                      darkMode ? 'bg-blue-900/10 border-blue-500/30' : 'bg-blue-50 border-blue-200'
                    }`}>
                      <p className={`text-xs mb-2 ${darkMode ? 'text-blue-300' : 'text-blue-700'}`}>
                        Need the NFC Programmer app?
                      </p>
                      <div className="flex gap-2">
                        <a 
                          href="https://play.google.com/store/apps/details?id=com.lightningnfcapp"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex-1 py-2 px-3 bg-blink-accent/20 text-blink-accent text-xs font-medium rounded-md text-center hover:bg-blink-accent/30 transition-colors"
                        >
                          Google Play
                        </a>
                        <a 
                          href="https://apps.apple.com/app/boltcard-nfc-programmer/id6450968873"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex-1 py-2 px-3 bg-blink-accent/20 text-blink-accent text-xs font-medium rounded-md text-center hover:bg-blink-accent/30 transition-colors"
                        >
                          App Store
                        </a>
                      </div>
                    </div>
                  </>
                )}
              </>
            )}

            {/* Done button - just closes the modal */}
            <button
              onClick={() => setShowResetModal(false)}
              className={`w-full py-2 text-sm font-medium rounded-md transition-colors ${
                darkMode
                  ? 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
            >
              {keysRevealed ? "I've Reset My Card" : 'Close'}
            </button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center">
        <div 
          className={`w-full sm:max-w-md max-h-[90vh] sm:max-h-[85vh] sm:mx-4 sm:rounded-xl shadow-2xl overflow-hidden flex flex-col ${
            darkMode ? 'bg-black' : 'bg-white'
          }`}
        >
          {/* Header */}
          <div className={`flex items-center justify-between px-4 py-3 border-b ${
            darkMode ? 'border-gray-700' : 'border-gray-200'
          }`}>
            <h2 className={`text-lg font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>
              {card.name || 'Boltcard'}
            </h2>
            <button
              onClick={onClose}
              className={`p-2 -mr-2 rounded-md ${
                darkMode 
                  ? 'text-gray-400 hover:text-gray-300 hover:bg-gray-800' 
                  : 'text-gray-600 hover:text-gray-800 hover:bg-gray-100'
              }`}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Tabs */}
          <div className={`flex border-b ${darkMode ? 'border-gray-700' : 'border-gray-200'}`}>
            <TabButton tab={Tabs.DETAILS} label="Details" />
            <TabButton tab={Tabs.TOPUP} label="Top Up" />
            <TabButton tab={Tabs.HISTORY} label="History" />
            <TabButton tab={Tabs.SETTINGS} label="Settings" />
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-4">
            {/* Details Tab */}
            {activeTab === Tabs.DETAILS && (
              <div className="space-y-4">
                {/* Balance Card */}
                <div className={`p-4 rounded-xl ${
                  darkMode ? 'bg-gradient-to-br from-gray-800 to-gray-900' : 'bg-gradient-to-br from-gray-100 to-gray-200'
                }`}>
                  <p className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>Balance</p>
                  <div className="flex items-baseline gap-2 mt-1">
                    <span className={`text-3xl font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                      {formatBalance(card.balance || 0, card.walletCurrency)}
                    </span>
                  </div>
                  
                  {/* Status */}
                  <div className="mt-3 flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${
                      card.status === CardStatus.ACTIVE ? 'bg-green-500' :
                      card.status === CardStatus.PENDING ? 'bg-yellow-500' :
                      card.status === CardStatus.DISABLED ? 'bg-red-500' : 'bg-gray-500'
                    }`} />
                    <span className={`text-sm ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>
                      {card.status.charAt(0).toUpperCase() + card.status.slice(1)}
                    </span>
                  </div>
                  
                  {/* Fund Card Button */}
                  {onFund && card.status !== CardStatus.WIPED && (
                    <button
                      onClick={() => onFund(card)}
                      className="w-full mt-4 py-2.5 text-sm font-medium bg-blink-accent text-black rounded-lg hover:bg-blink-accent/90 transition-colors flex items-center justify-center gap-2"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
                      </svg>
                      Fund Card
                    </button>
                  )}
                </div>

                {/* Card Info */}
                <div className={`rounded-lg p-3 space-y-2 ${darkMode ? 'bg-gray-900' : 'bg-gray-50'}`}>
                  {/* Only show cardUid if available, otherwise show cardIdHash */}
                  {card.cardUid ? (
                    <div className="flex justify-between text-sm">
                      <span className={darkMode ? 'text-gray-400' : 'text-gray-500'}>Card UID</span>
                      <span className={`font-mono ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                        {card.cardUid.toUpperCase()}
                      </span>
                    </div>
                  ) : card.cardIdHash && (
                    <div className="flex justify-between text-sm">
                      <span className={darkMode ? 'text-gray-400' : 'text-gray-500'}>Card ID</span>
                      <span className={`font-mono text-xs ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                        {card.cardIdHash.slice(0, 12)}...
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between text-sm">
                    <span className={darkMode ? 'text-gray-400' : 'text-gray-500'}>Currency</span>
                    <span className={darkMode ? 'text-white' : 'text-gray-900'}>{card.walletCurrency}</span>
                  </div>
                  {card.maxTxAmount && (
                    <div className="flex justify-between text-sm">
                      <span className={darkMode ? 'text-gray-400' : 'text-gray-500'}>Max per tx</span>
                      <span className={darkMode ? 'text-white' : 'text-gray-900'}>
                        {formatBalance(card.maxTxAmount, card.walletCurrency)}
                      </span>
                    </div>
                  )}
                  {card.dailyLimit && (
                    <div className="flex justify-between text-sm">
                      <span className={darkMode ? 'text-gray-400' : 'text-gray-500'}>Daily limit</span>
                      <span className={darkMode ? 'text-white' : 'text-gray-900'}>
                        {formatBalance(card.dailySpent || 0, card.walletCurrency)} / {formatBalance(card.dailyLimit, card.walletCurrency)}
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between text-sm">
                    <span className={darkMode ? 'text-gray-400' : 'text-gray-500'}>Created</span>
                    <span className={darkMode ? 'text-white' : 'text-gray-900'}>
                      {formatDate(card.createdAt)}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className={darkMode ? 'text-gray-400' : 'text-gray-500'}>Last used</span>
                    <span className={darkMode ? 'text-white' : 'text-gray-900'}>
                      {formatDate(card.lastUsedAt)}
                    </span>
                  </div>
                </div>

                {/* Quick Actions */}
                <div className="flex gap-2">
                  {card.status === CardStatus.ACTIVE && (
                    <button
                      onClick={() => onDisable(card.id)}
                      disabled={loading}
                      className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${
                        darkMode
                          ? 'bg-red-900/20 text-red-400 hover:bg-red-900/30'
                          : 'bg-red-50 text-red-600 hover:bg-red-100'
                      }`}
                    >
                      Disable Card
                    </button>
                  )}
                  {card.status === CardStatus.DISABLED && (
                    <button
                      onClick={() => onEnable(card.id)}
                      disabled={loading}
                      className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${
                        darkMode
                          ? 'bg-green-900/20 text-green-400 hover:bg-green-900/30'
                          : 'bg-green-50 text-green-600 hover:bg-green-100'
                      }`}
                    >
                      Enable Card
                    </button>
                  )}
                  {card.dailyLimit && (
                    <button
                      onClick={() => onResetDaily(card.id)}
                      disabled={loading}
                      className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${
                        darkMode
                          ? 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                          : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                      }`}
                    >
                      Reset Daily
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Top Up Tab */}
            {activeTab === Tabs.TOPUP && (
              <BoltcardTopUp
                card={card}
                topUpQR={topUpQR}
                loading={loading}
              />
            )}

            {/* History Tab */}
            {activeTab === Tabs.HISTORY && (
              <div className="space-y-2">
                {loading ? (
                  <div className="text-center py-8">
                    <div className={`animate-spin w-6 h-6 border-2 border-blink-accent border-t-transparent rounded-full mx-auto`} />
                  </div>
                ) : transactions.length === 0 ? (
                  <div className={`text-center py-8 ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                    <svg className="w-10 h-10 mx-auto mb-2 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                    </svg>
                    <p className="text-sm">No transactions yet</p>
                  </div>
                ) : (
                  transactions.map((tx, index) => {
                    const typeInfo = getTransactionTypeInfo(tx.type);
                    return (
                      <div
                        key={tx.id || index}
                        className={`p-3 rounded-lg ${darkMode ? 'bg-gray-900' : 'bg-gray-50'}`}
                      >
                        <div className="flex justify-between items-start">
                          <div>
                            <span className={`text-sm font-medium ${typeInfo.color}`}>
                              {typeInfo.label}
                            </span>
                            {tx.description && (
                              <p className={`text-xs mt-0.5 ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                                {tx.description}
                              </p>
                            )}
                          </div>
                          <div className="text-right">
                            <span className={`font-medium ${typeInfo.color}`}>
                              {typeInfo.sign}{formatBalance(Math.abs(tx.amount), card.walletCurrency)}
                            </span>
                            <p className={`text-xs ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                              {formatDate(tx.createdAt)}
                            </p>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            )}

            {/* Settings Tab */}
            {activeTab === Tabs.SETTINGS && (
              <div className="space-y-4">
                {/* Edit Form */}
                <div className={`rounded-lg p-3 ${darkMode ? 'bg-gray-900' : 'bg-gray-50'}`}>
                  <h4 className={`text-sm font-medium mb-3 ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                    Card Settings
                  </h4>
                  
                  <div className="space-y-3">
                    <div>
                      <label className={`block text-xs mb-1 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                        Card Name
                      </label>
                      <input
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        placeholder="My Boltcard"
                        className={`w-full px-3 py-2 rounded-md border text-sm ${
                          darkMode 
                            ? 'bg-gray-800 border-gray-600 text-white placeholder-gray-500' 
                            : 'bg-white border-gray-300 text-gray-900 placeholder-gray-400'
                        } focus:outline-none focus:ring-2 focus:ring-blink-accent focus:border-transparent`}
                      />
                    </div>
                    
                    <div>
                      <label className={`block text-xs mb-1 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                        Max per transaction ({card.walletCurrency === 'USD' ? 'USD' : 'sats'})
                      </label>
                      <input
                        type="number"
                        value={editMaxTx}
                        onChange={(e) => setEditMaxTx(e.target.value)}
                        placeholder="No limit"
                        min="0"
                        step={card.walletCurrency === 'USD' ? '0.01' : '1'}
                        className={`w-full px-3 py-2 rounded-md border text-sm ${
                          darkMode 
                            ? 'bg-gray-800 border-gray-600 text-white placeholder-gray-500' 
                            : 'bg-white border-gray-300 text-gray-900 placeholder-gray-400'
                        } focus:outline-none focus:ring-2 focus:ring-blink-accent focus:border-transparent`}
                      />
                    </div>
                    
                    <div>
                      <label className={`block text-xs mb-1 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                        Daily limit ({card.walletCurrency === 'USD' ? 'USD' : 'sats'})
                      </label>
                      <input
                        type="number"
                        value={editDailyLimit}
                        onChange={(e) => setEditDailyLimit(e.target.value)}
                        placeholder="No limit"
                        min="0"
                        step={card.walletCurrency === 'USD' ? '0.01' : '1'}
                        className={`w-full px-3 py-2 rounded-md border text-sm ${
                          darkMode 
                            ? 'bg-gray-800 border-gray-600 text-white placeholder-gray-500' 
                            : 'bg-white border-gray-300 text-gray-900 placeholder-gray-400'
                        } focus:outline-none focus:ring-2 focus:ring-blink-accent focus:border-transparent`}
                      />
                    </div>
                  </div>

                  {error && (
                    <p className="text-sm text-red-500 mt-2">{error}</p>
                  )}

                  <button
                    onClick={handleSave}
                    disabled={loading}
                    className="w-full mt-3 py-2 bg-blink-accent text-black text-sm font-medium rounded-md hover:bg-blink-accent/90 disabled:opacity-50 transition-colors"
                  >
                    {loading ? 'Saving...' : 'Save Changes'}
                  </button>
                </div>

                {/* Reset Card Section */}
                <div className={`rounded-lg p-3 border ${
                  darkMode ? 'bg-orange-900/10 border-orange-500/30' : 'bg-orange-50 border-orange-200'
                }`}>
                  <h4 className={`text-sm font-medium mb-2 ${darkMode ? 'text-orange-400' : 'text-orange-700'}`}>
                    Reset Card
                  </h4>
                  <p className={`text-xs mb-3 ${darkMode ? 'text-orange-300' : 'text-orange-600'}`}>
                    Get the keys needed to reset your card using the NFC Programmer app. 
                    You'll be able to reprogram it afterward or use it with a different service.
                  </p>
                  <button
                    onClick={handleShowResetModal}
                    disabled={loading || card.status === CardStatus.WIPED}
                    className={`w-full py-2 text-sm font-medium rounded-md transition-colors ${
                      darkMode
                        ? 'bg-orange-900/30 text-orange-400 hover:bg-orange-900/50 disabled:opacity-50'
                        : 'bg-orange-100 text-orange-700 hover:bg-orange-200 disabled:opacity-50'
                    }`}
                  >
                    {card.status === CardStatus.WIPED ? 'Card Already Reset' : 'Get Reset Keys'}
                  </button>
                </div>

                {/* Danger Zone */}
                <div className={`rounded-lg p-3 border ${
                  darkMode ? 'bg-red-900/10 border-red-500/30' : 'bg-red-50 border-red-200'
                }`}>
                  <h4 className={`text-sm font-medium mb-2 ${darkMode ? 'text-red-400' : 'text-red-700'}`}>
                    Danger Zone
                  </h4>
                  <p className={`text-xs mb-3 ${darkMode ? 'text-red-300' : 'text-red-600'}`}>
                    Wiping a card from the database will permanently delete it and its transaction history. 
                    This cannot be undone. Use "Reset Card" above to also reset the physical card.
                  </p>
                  <button
                    onClick={handleWipe}
                    disabled={loading}
                    className={`w-full py-2 text-sm font-medium rounded-md transition-colors ${
                      darkMode
                        ? 'bg-red-900/30 text-red-400 hover:bg-red-900/50'
                        : 'bg-red-100 text-red-700 hover:bg-red-200'
                    }`}
                  >
                    Delete Card from Database
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Reset Modal */}
      {renderResetModal()}
    </>
  );
}
