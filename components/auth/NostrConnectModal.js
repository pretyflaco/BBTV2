/**
 * NostrConnectModal - Clean modal for NIP-46 QR code display and connection
 * 
 * Displays a QR code for the user to scan with Amber, with alternative
 * option to paste a bunker:// URL directly.
 */

import { useState, useEffect } from 'react';
import { QRCodeSVG } from 'qrcode.react';

/**
 * @param {Object} props
 * @param {string} props.uri - nostrconnect:// URI to display as QR
 * @param {boolean} props.waiting - Whether we're waiting for connection
 * @param {string|null} props.error - Error message to display
 * @param {Function} props.onClose - Called when user cancels
 * @param {Function} props.onBunkerSubmit - Called with bunker URL when user submits manually
 * @param {Function} props.onRetry - Called when user wants to show QR again
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
  const [bunkerUrl, setBunkerUrl] = useState('');
  const [showTimeoutOption, setShowTimeoutOption] = useState(false);

  // Show "Taking too long?" after 30 seconds of waiting
  useEffect(() => {
    if (waiting) {
      setShowTimeoutOption(false);
      const timer = setTimeout(() => {
        setShowTimeoutOption(true);
      }, 30000);
      return () => clearTimeout(timer);
    }
  }, [waiting]);

  const handleBunkerSubmit = (e) => {
    e.preventDefault();
    if (bunkerUrl.trim()) {
      onBunkerSubmit(bunkerUrl.trim());
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-900 rounded-2xl max-w-sm w-full shadow-xl overflow-hidden">
        {/* Header */}
        <div className="px-6 pt-6 pb-4 text-center border-b border-gray-100 dark:border-gray-800">
          <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
            Connect with Nostr Connect
          </h3>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Scan this QR code with Amber
          </p>
        </div>

        {/* Content */}
        <div className="px-6 py-6">
          {error && (
            <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
              <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
            </div>
          )}

          {waiting ? (
            /* Waiting State */
            <div className="text-center py-8">
              <div className="inline-flex items-center justify-center w-16 h-16 mb-4">
                <svg className="animate-spin h-12 w-12 text-amber-500" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
              </div>
              <p className="text-gray-900 dark:text-gray-100 font-medium">
                Waiting for connection...
              </p>
              <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                Approve the request in Amber when prompted
              </p>

              {showTimeoutOption && (
                <div className="mt-6 pt-4 border-t border-gray-100 dark:border-gray-800">
                  <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">
                    Taking too long?
                  </p>
                  <button
                    onClick={onRetry}
                    className="px-4 py-2 text-sm font-medium text-amber-600 dark:text-amber-400 hover:text-amber-700 dark:hover:text-amber-300 transition-colors"
                  >
                    Show QR Code Again
                  </button>
                </div>
              )}
            </div>
          ) : (
            /* QR Code State */
            <>
              {/* QR Code */}
              <div className="flex justify-center mb-6">
                <div className="p-4 bg-white rounded-xl shadow-sm border border-gray-100">
                  <QRCodeSVG
                    value={uri}
                    size={200}
                    level="M"
                    includeMargin={false}
                  />
                </div>
              </div>

              {/* Instructions */}
              <div className="space-y-2 mb-6">
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-gray-200 dark:bg-gray-700 text-xs font-medium text-gray-700 dark:text-gray-300 mr-2">1</span>
                  Open <strong>Amber</strong> on your phone
                </p>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-gray-200 dark:bg-gray-700 text-xs font-medium text-gray-700 dark:text-gray-300 mr-2">2</span>
                  Go to <strong>Settings → Nostr Connect</strong>
                </p>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-gray-200 dark:bg-gray-700 text-xs font-medium text-gray-700 dark:text-gray-300 mr-2">3</span>
                  Tap <strong>Scan QR</strong> and scan this code
                </p>
              </div>

              {/* Alternative: Bunker URL */}
              <div className="border-t border-gray-100 dark:border-gray-800 pt-4">
                {!showBunkerInput ? (
                  <button
                    onClick={() => setShowBunkerInput(true)}
                    className="w-full text-center text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
                  >
                    Or paste bunker URL instead
                  </button>
                ) : (
                  <form onSubmit={handleBunkerSubmit} className="space-y-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                        Bunker URL from Amber
                      </label>
                      <input
                        type="text"
                        value={bunkerUrl}
                        onChange={(e) => setBunkerUrl(e.target.value)}
                        placeholder="bunker://..."
                        className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                        autoFocus
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={!bunkerUrl.trim()}
                      className="w-full py-2 px-4 text-sm font-medium text-white bg-amber-500 hover:bg-amber-600 disabled:bg-gray-300 dark:disabled:bg-gray-600 rounded-lg transition-colors disabled:cursor-not-allowed"
                    >
                      Connect with URL
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setShowBunkerInput(false);
                        setBunkerUrl('');
                      }}
                      className="w-full text-center text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
                    >
                      Back to QR code
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
