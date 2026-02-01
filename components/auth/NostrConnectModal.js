/**
 * NostrConnectModal - Mobile-friendly modal for NIP-46 connection
 * 
 * v27: Fixed for mobile - shows clickable link and copy button instead of
 * relying on QR scanning (can't scan QR on the same device!)
 * 
 * Options:
 * 1. "Open in Amber" - Direct deep link tap
 * 2. "Copy Link" - Copy nostrconnect:// URI to clipboard, paste in Amber
 * 3. QR code - For scanning from another device (shown smaller)
 * 4. Bunker URL input - For pasting bunker:// URL from Amber
 */

import { useState, useEffect } from 'react';
import { QRCodeSVG } from 'qrcode.react';

/**
 * @param {Object} props
 * @param {string} props.uri - nostrconnect:// URI
 * @param {boolean} props.waiting - Whether we're waiting for connection
 * @param {string|null} props.error - Error message to display
 * @param {Function} props.onClose - Called when user cancels
 * @param {Function} props.onBunkerSubmit - Called with bunker URL when user submits manually
 * @param {Function} props.onRetry - Called when user wants to retry
 */
export default function NostrConnectModal({
  uri,
  waiting,
  error,
  onClose,
  onBunkerSubmit,
  onRetry
}) {
  const [showBunkerInput, setShowBunkerInput] = useState(false);
  const [showQRCode, setShowQRCode] = useState(false);
  const [bunkerUrl, setBunkerUrl] = useState('');
  const [copied, setCopied] = useState(false);
  const [openedAmber, setOpenedAmber] = useState(false);

  // Reset copied state after 2 seconds
  useEffect(() => {
    if (copied) {
      const timer = setTimeout(() => setCopied(false), 2000);
      return () => clearTimeout(timer);
    }
  }, [copied]);

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(uri);
      setCopied(true);
      console.log('[NostrConnectModal] Copied URI to clipboard');
    } catch (err) {
      console.error('[NostrConnectModal] Failed to copy:', err);
      // Fallback: show the URI in a prompt
      window.prompt('Copy this link:', uri);
    }
  };

  const handleOpenInAmber = () => {
    console.log('[NostrConnectModal] Opening in Amber:', uri);
    setOpenedAmber(true);
    // Open the nostrconnect:// URI - Amber should handle it
    window.location.href = uri;
  };

  const handleBunkerSubmit = (e) => {
    e.preventDefault();
    if (bunkerUrl.trim()) {
      onBunkerSubmit(bunkerUrl.trim());
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-900 rounded-2xl max-w-sm w-full shadow-xl overflow-hidden max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="px-6 pt-6 pb-4 text-center border-b border-gray-100 dark:border-gray-800">
          <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
            🔗 Connect with Amber
          </h3>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            NIP-46 Nostr Connect
          </p>
        </div>

        {/* Content */}
        <div className="px-6 py-5">
          {error && (
            <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
              <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
            </div>
          )}

          {waiting && openedAmber ? (
            /* Waiting State - Only show after user explicitly opened Amber */
            <div className="text-center py-6">
              <div className="inline-flex items-center justify-center w-16 h-16 mb-4">
                <svg className="animate-spin h-12 w-12 text-purple-500" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
              </div>
              <p className="text-gray-900 dark:text-gray-100 font-medium">
                Waiting for Amber...
              </p>
              <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                Approve the connection request in Amber
              </p>
              <button
                onClick={() => setOpenedAmber(false)}
                className="mt-4 px-4 py-2 text-sm font-medium text-purple-600 dark:text-purple-400 hover:text-purple-700 dark:hover:text-purple-300 transition-colors"
              >
                ← Back to options
              </button>
            </div>
          ) : (
            /* Main Options */
            <>
              {/* Primary Actions */}
              <div className="space-y-3 mb-5">
                {/* Open in Amber Button */}
                <button
                  onClick={handleOpenInAmber}
                  className="w-full py-3 px-4 text-base font-semibold text-white bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-700 hover:to-purple-800 rounded-xl transition-all shadow-md hover:shadow-lg flex items-center justify-center gap-2"
                >
                  <span>📱</span>
                  <span>Open in Amber</span>
                </button>

                {/* Copy Link Button */}
                <button
                  onClick={handleCopyLink}
                  className={`w-full py-3 px-4 text-base font-medium rounded-xl transition-all flex items-center justify-center gap-2 ${
                    copied 
                      ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 border-2 border-green-500'
                      : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 border-2 border-transparent'
                  }`}
                >
                  {copied ? (
                    <>
                      <span>✓</span>
                      <span>Copied! Paste in Amber</span>
                    </>
                  ) : (
                    <>
                      <span>📋</span>
                      <span>Copy Link</span>
                    </>
                  )}
                </button>
              </div>

              {/* Instructions */}
              <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-4 mb-5">
                <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  How to connect:
                </p>
                <ol className="text-sm text-gray-600 dark:text-gray-400 space-y-1.5 list-decimal list-inside">
                  <li>Tap <strong>"Open in Amber"</strong> above</li>
                  <li>Or copy the link and paste in Amber's <strong>Nostr Connect</strong> section</li>
                  <li>Approve the connection in Amber</li>
                  <li>Return to this app</li>
                </ol>
              </div>

              {/* Expandable QR Code Section */}
              <div className="border-t border-gray-100 dark:border-gray-800 pt-4 mb-4">
                <button
                  onClick={() => setShowQRCode(!showQRCode)}
                  className="w-full text-center text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 transition-colors flex items-center justify-center gap-1"
                >
                  <span>{showQRCode ? '▼' : '▶'}</span>
                  <span>Show QR code (for scanning from another device)</span>
                </button>
                
                {showQRCode && (
                  <div className="mt-4 flex justify-center">
                    <div className="p-3 bg-white rounded-xl shadow-sm border border-gray-200">
                      <QRCodeSVG
                        value={uri}
                        size={160}
                        level="M"
                        includeMargin={false}
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Alternative: Bunker URL Input */}
              <div className="border-t border-gray-100 dark:border-gray-800 pt-4">
                {!showBunkerInput ? (
                  <button
                    onClick={() => setShowBunkerInput(true)}
                    className="w-full text-center text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
                  >
                    Or paste bunker URL from Amber instead
                  </button>
                ) : (
                  <form onSubmit={handleBunkerSubmit} className="space-y-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                        Paste bunker:// URL from Amber
                      </label>
                      <input
                        type="text"
                        value={bunkerUrl}
                        onChange={(e) => setBunkerUrl(e.target.value)}
                        placeholder="bunker://..."
                        className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                        autoFocus
                      />
                      <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
                        In Amber: Applications → + → Copy bunker URL
                      </p>
                    </div>
                    <button
                      type="submit"
                      disabled={!bunkerUrl.trim()}
                      className="w-full py-2.5 px-4 text-sm font-medium text-white bg-purple-600 hover:bg-purple-700 disabled:bg-gray-300 dark:disabled:bg-gray-600 rounded-lg transition-colors disabled:cursor-not-allowed"
                    >
                      Connect with Bunker URL
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setShowBunkerInput(false);
                        setBunkerUrl('');
                      }}
                      className="w-full text-center text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
                    >
                      ← Back
                    </button>
                  </form>
                )}
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 pb-6">
          <button
            onClick={onClose}
            className="w-full py-3 px-4 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
