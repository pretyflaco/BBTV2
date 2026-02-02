/**
 * NostrConnectModal - Mobile-friendly modal for NIP-46 connection
 * 
 * v29: Added progress stepper UI for blocking sign-in flow.
 * - Shows connection options (Open in Amber, Copy Link, QR, Bunker URL)
 * - After connection: shows progress stepper (connected → signing → syncing → complete)
 * - Handles retry from signing stage if still connected
 * - Clean cancel returns to login form
 * 
 * v27: Fixed for mobile - shows clickable link and copy button instead of
 * relying on QR scanning (can't scan QR on the same device!)
 */

import { useState, useEffect, useCallback } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import NostrConnectService from '../../lib/nostr/NostrConnectService';

// Progress Stepper Component
function ProgressStepper({ currentStage, errorStage }) {
  const stages = [
    { id: 'connected', label: 'Connected to signer' },
    { id: 'signing', label: 'Signing authentication' },
    { id: 'syncing', label: 'Loading your data' },
  ];
  
  const getStageStatus = (stageId) => {
    const order = ['connected', 'signing', 'syncing', 'complete'];
    const currentIndex = order.indexOf(currentStage);
    const stageIndex = order.indexOf(stageId);
    
    // If we're in error state, mark the error stage appropriately
    if (errorStage === stageId) return 'error';
    if (currentStage === 'error' && stageIndex >= order.indexOf(errorStage || 'signing')) return 'pending';
    
    if (stageIndex < currentIndex || currentStage === 'complete') return 'complete';
    if (stageIndex === currentIndex) return 'current';
    return 'pending';
  };
  
  return (
    <div className="space-y-3 my-4">
      {stages.map((s) => {
        const status = getStageStatus(s.id);
        return (
          <div key={s.id} className="flex items-center gap-3">
            {/* Icon */}
            {status === 'complete' && (
              <div className="w-6 h-6 rounded-full bg-green-500 flex items-center justify-center flex-shrink-0">
                <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                </svg>
              </div>
            )}
            {status === 'current' && (
              <div className="w-6 h-6 rounded-full border-2 border-purple-500 flex items-center justify-center flex-shrink-0">
                <svg className="w-4 h-4 text-purple-500 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
              </div>
            )}
            {status === 'pending' && (
              <div className="w-6 h-6 rounded-full border-2 border-gray-300 dark:border-gray-600 flex-shrink-0" />
            )}
            {status === 'error' && (
              <div className="w-6 h-6 rounded-full bg-red-500 flex items-center justify-center flex-shrink-0">
                <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </div>
            )}
            
            {/* Label */}
            <span className={`text-sm ${
              status === 'complete' ? 'text-green-600 dark:text-green-400' :
              status === 'current' ? 'text-purple-600 dark:text-purple-400 font-medium' :
              status === 'error' ? 'text-red-600 dark:text-red-400' :
              'text-gray-400 dark:text-gray-500'
            }`}>
              {s.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/**
 * @param {Object} props
 * @param {string} props.uri - nostrconnect:// URI
 * @param {Function} props.onSuccess - Called when sign-in is fully complete
 * @param {Function} props.onCancel - Called when user cancels
 * @param {Function} props.signInWithNostrConnect - The sign-in function from useNostrAuth
 */
export default function NostrConnectModal({
  uri,
  onSuccess,
  onCancel,
  signInWithNostrConnect
}) {
  // UI state
  const [showBunkerInput, setShowBunkerInput] = useState(false);
  const [showQRCode, setShowQRCode] = useState(false);
  const [bunkerUrl, setBunkerUrl] = useState('');
  const [copied, setCopied] = useState(false);
  
  // Connection state machine: 'idle' | 'waiting' | 'connected' | 'signing' | 'syncing' | 'complete' | 'error'
  const [stage, setStage] = useState('idle');
  const [connectedPubkey, setConnectedPubkey] = useState(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [errorStage, setErrorStage] = useState(null);
  const [showSlowWarning, setShowSlowWarning] = useState(false);
  
  // Timer refs
  const slowTimerRef = { current: null };

  // Reset copied state after 2 seconds
  useEffect(() => {
    if (copied) {
      const timer = setTimeout(() => setCopied(false), 2000);
      return () => clearTimeout(timer);
    }
  }, [copied]);

  // Start waiting for connection when modal mounts with URI
  useEffect(() => {
    if (uri && stage === 'idle') {
      // Start waiting in background, but don't show waiting UI until user taps
      // This allows the QR/buttons to be visible
    }
  }, [uri, stage]);

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(uri);
      setCopied(true);
      console.log('[NostrConnectModal] v30: Copied URI to clipboard');
    } catch (err) {
      console.error('[NostrConnectModal] v30: Failed to copy:', err);
      window.prompt('Copy this link:', uri);
    }
  };

  const handleOpenInSigner = () => {
    console.log('[NostrConnectModal] v30: Opening in signer app and starting wait...');
    setStage('waiting');
    // Open the nostrconnect:// URI - Amber/Aegis should handle it
    window.location.href = uri;
    // Start waiting for the connection
    startWaitingForConnection();
  };

  const startWaitingForConnection = useCallback(async () => {
    console.log('[NostrConnectModal] v30: Waiting for NIP-46 connection...');
    
    try {
      const result = await NostrConnectService.waitForConnection(uri);
      
      if (result.success && result.publicKey) {
        console.log('[NostrConnectModal] v30: Connection successful, pubkey:', result.publicKey.substring(0, 16) + '...');
        setConnectedPubkey(result.publicKey);
        await handleConnectionSuccess(result.publicKey);
      } else {
        console.error('[NostrConnectModal] v30: Connection failed:', result.error);
        setStage('error');
        setErrorMessage(result.error || 'Connection failed');
        setErrorStage('connected');
      }
    } catch (error) {
      console.error('[NostrConnectModal] v30: Exception during connection:', error);
      setStage('error');
      setErrorMessage(error.message || 'Connection failed');
      setErrorStage('connected');
    }
  }, [uri]);

  const handleConnectionSuccess = async (pubkey) => {
    console.log('[NostrConnectModal] v30: Handling connection success...');
    setStage('connected');
    setConnectedPubkey(pubkey);
    
    // Clear any previous slow warning
    setShowSlowWarning(false);
    
    // Start slow warning timer (15 seconds)
    slowTimerRef.current = setTimeout(() => {
      setShowSlowWarning(true);
    }, 15000);
    
    // Small delay to show the "connected" state
    await new Promise(resolve => setTimeout(resolve, 300));
    
    setStage('signing');
    
    try {
      // Call the sign-in function with progress callback
      const result = await signInWithNostrConnect(pubkey, {
        onProgress: (progressStage, message) => {
          console.log('[NostrConnectModal] v30: Progress:', progressStage, message);
          if (progressStage === 'signing') setStage('signing');
          else if (progressStage === 'syncing') setStage('syncing');
          else if (progressStage === 'complete') setStage('complete');
        },
        timeout: 30000
      });
      
      // Clear the slow warning timer
      if (slowTimerRef.current) {
        clearTimeout(slowTimerRef.current);
        slowTimerRef.current = null;
      }
      
      if (result.success) {
        setStage('complete');
        // Small delay to show completion before closing
        setTimeout(() => {
          onSuccess?.(pubkey);
        }, 600);
      } else {
        setStage('error');
        setErrorStage(result.errorType === 'timeout' ? 'signing' : 'signing');
        setErrorMessage(result.error || 'Authentication failed');
      }
    } catch (error) {
      if (slowTimerRef.current) {
        clearTimeout(slowTimerRef.current);
        slowTimerRef.current = null;
      }
      setStage('error');
      setErrorStage('signing');
      setErrorMessage(error.message || 'An unexpected error occurred');
    }
  };

  const handleBunkerSubmit = async (e) => {
    e.preventDefault();
    if (!bunkerUrl.trim()) return;
    
    console.log('[NostrConnectModal] v30: Connecting with bunker URL...');
    setStage('waiting');
    setErrorMessage('');
    
    try {
      const result = await NostrConnectService.connectWithBunkerURL(bunkerUrl.trim());
      
      if (result.success && result.publicKey) {
        console.log('[NostrConnectModal] v30: Bunker connection successful');
        await handleConnectionSuccess(result.publicKey);
      } else {
        setStage('error');
        setErrorMessage(result.error || 'Bunker connection failed');
        setErrorStage('connected');
      }
    } catch (error) {
      setStage('error');
      setErrorMessage(error.message || 'Bunker connection failed');
      setErrorStage('connected');
    }
  };

  const handleRetry = async () => {
    console.log('[NostrConnectModal] v30: Retrying...');
    setErrorMessage('');
    setShowSlowWarning(false);
    setErrorStage(null);
    
    // Check if we still have a relay connection
    if (NostrConnectService.isConnected() && connectedPubkey) {
      // Retry just the NIP-98 part
      console.log('[NostrConnectModal] v30: Still connected, retrying from signing stage');
      setStage('signing');
      await handleConnectionSuccess(connectedPubkey);
    } else {
      // Need to reconnect from scratch
      console.log('[NostrConnectModal] v30: Not connected, restarting from beginning');
      setStage('idle');
      setConnectedPubkey(null);
    }
  };

  const handleCancel = () => {
    console.log('[NostrConnectModal] v30: User cancelled');
    // Clean disconnect
    if (slowTimerRef.current) {
      clearTimeout(slowTimerRef.current);
    }
    NostrConnectService.disconnect();
    onCancel?.();
  };

  const handleBackToOptions = () => {
    setStage('idle');
    setShowSlowWarning(false);
    setErrorMessage('');
    setErrorStage(null);
  };

  // Determine what to render based on stage
  const isInConnectionFlow = ['waiting', 'connected', 'signing', 'syncing', 'complete'].includes(stage);
  const isInErrorState = stage === 'error';

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-900 rounded-2xl max-w-sm w-full shadow-xl overflow-hidden max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="px-6 pt-6 pb-4 text-center border-b border-gray-100 dark:border-gray-800">
          <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
            {stage === 'complete' ? '✓ Connected!' : 
             isInErrorState ? '⚠️ Connection Failed' :
             isInConnectionFlow ? '🔗 Connecting...' : 
             '🔗 Connect with Nostr Signer'}
          </h3>
          {!isInConnectionFlow && !isInErrorState && (
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              NIP-46 Nostr Connect
            </p>
          )}
        </div>

        {/* Content */}
        <div className="px-6 py-5">
          
          {/* Connection Progress View */}
          {isInConnectionFlow && (
            <div className="py-2">
              <ProgressStepper currentStage={stage} errorStage={null} />
              
              {/* Slow warning */}
              {showSlowWarning && stage === 'signing' && (
                <div className="mt-4 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
                  <p className="text-sm text-amber-700 dark:text-amber-400">
                    ⏳ Taking longer than expected? Make sure Amber is open and tap <strong>"Approve"</strong> when prompted.
                  </p>
                </div>
              )}
              
              {/* Success message */}
              {stage === 'complete' && (
                <div className="mt-4 text-center">
                  <div className="w-16 h-16 mx-auto mb-3 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                    <svg className="w-8 h-8 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <p className="text-green-600 dark:text-green-400 font-medium">
                    Successfully signed in!
                  </p>
                </div>
              )}
              
              {/* Back button during waiting/signing */}
              {stage !== 'complete' && (
                <button
                  onClick={handleBackToOptions}
                  className="mt-4 w-full text-center text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
                >
                  ← Back to options
                </button>
              )}
            </div>
          )}

          {/* Error View */}
          {isInErrorState && (
            <div className="py-4 text-center">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                <svg className="w-8 h-8 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </div>
              
              <p className="text-gray-700 dark:text-gray-300 mb-2">
                {errorMessage}
              </p>
              
              <div className="flex gap-3 mt-6">
                <button
                  onClick={handleRetry}
                  className="flex-1 py-3 px-4 text-base font-semibold text-white bg-purple-600 hover:bg-purple-700 rounded-xl transition-colors"
                >
                  Try Again
                </button>
                <button
                  onClick={handleCancel}
                  className="flex-1 py-3 px-4 text-base font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-xl transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Main Options View (idle state) */}
          {stage === 'idle' && (
            <>
              {/* Primary Actions */}
              <div className="space-y-3 mb-5">
                {/* Open in Signer App Button */}
                <button
                  onClick={handleOpenInSigner}
                  className="w-full py-3 px-4 text-base font-semibold text-white bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-700 hover:to-purple-800 rounded-xl transition-all shadow-md hover:shadow-lg flex items-center justify-center gap-2"
                >
                  <span>📱</span>
                  <span>Open in Signer App</span>
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
                  <li>Tap <strong>"Open in Signer App"</strong> above</li>
                  <li>Select your signer (Amber, Aegis, etc.)</li>
                  <li>Approve the connection request</li>
                  <li>Approve the authentication</li>
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
                        In Amber: Applications → + → Copy bunker URL<br/>
                        In Aegis: Settings → Copy bunker URL
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

        {/* Footer - only show cancel button when in idle state */}
        {stage === 'idle' && (
          <div className="px-6 pb-6">
            <button
              onClick={handleCancel}
              className="w-full py-3 px-4 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition-colors"
            >
              Cancel
            </button>
          </div>
        )}
        
        {/* Footer for connection flow - subtle cancel */}
        {isInConnectionFlow && stage !== 'complete' && (
          <div className="px-6 pb-6 pt-2">
            <button
              onClick={handleCancel}
              className="w-full text-center text-sm text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-400"
            >
              Cancel sign-in
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
