/**
 * NostrConnectModal - NIP-46 Remote Signer Connection Modal
 * 
 * Supports multiple connection methods:
 * - QR Code scanning (nostrconnect://) - for Amber, other mobile signers
 * - Bunker URL paste (bunker://) - for nsec.app, Portal
 * - Direct app open - for Amber (Android)
 * 
 * Features:
 * - Desktop: Shows QR code as primary method, auto-starts waiting for connection
 * - Mobile: Toggle between QR display and direct app buttons
 * - Progress stepper UI showing connection → signing → syncing → complete
 * - Auto-polling for approval when signer requires confirmation
 * - NDK implementation available via NEXT_PUBLIC_USE_NDK_NIP46=true flag
 */

import { useState, useEffect, useCallback } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import NostrConnectService from '../../lib/nostr/NostrConnectService';
import NostrConnectServiceNDK from '../../lib/nostr/NostrConnectServiceNDK';
import { logAuth, logAuthError, logAuthWarn } from '../../lib/version.js';

// Feature flag to use NDK implementation for bunker:// URLs
const USE_NDK = process.env.NEXT_PUBLIC_USE_NDK_NIP46 === 'true';

// Get the appropriate service based on feature flag
const getService = () => USE_NDK ? NostrConnectServiceNDK : NostrConnectService;

// Detect iOS
const isIOS = typeof navigator !== 'undefined' && /iPad|iPhone|iPod/.test(navigator.userAgent);
const isAndroid = typeof navigator !== 'undefined' && /Android/.test(navigator.userAgent);

// Progress Stepper Component
function ProgressStepper({ currentStage, errorStage, waitingForApproval }) {
  const stages = [
    { id: 'connected', label: waitingForApproval ? 'Waiting for approval' : 'Connected to signer' },
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
    if (stageIndex === currentIndex) return waitingForApproval && stageId === 'connected' ? 'waiting' : 'current';
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
            {status === 'waiting' && (
              <div className="w-6 h-6 rounded-full border-2 border-amber-500 bg-amber-50 dark:bg-amber-900/30 flex items-center justify-center flex-shrink-0">
                <svg className="w-4 h-4 text-amber-500 animate-pulse" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
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
              status === 'waiting' ? 'text-amber-600 dark:text-amber-400 font-medium' :
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
  const [showMobileQR, setShowMobileQR] = useState(false); // v55: QR toggle for mobile
  const [bunkerUrl, setBunkerUrl] = useState('');
  const [copied, setCopied] = useState(false);
  
  // Connection state machine: 'idle' | 'waiting' | 'connected' | 'signing' | 'syncing' | 'complete' | 'error'
  const [stage, setStage] = useState('idle');
  const [connectedPubkey, setConnectedPubkey] = useState(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [errorStage, setErrorStage] = useState(null);
  const [showSlowWarning, setShowSlowWarning] = useState(false);
  
  const [awaitingApproval, setAwaitingApproval] = useState(false);
  const [authUrl, setAuthUrl] = useState(null);
  const [approvalPollCount, setApprovalPollCount] = useState(0);
  
  // Timer refs
  const slowTimerRef = { current: null };
  const approvalPollRef = { current: null };

  // Reset copied state after 2 seconds
  useEffect(() => {
    if (copied) {
      const timer = setTimeout(() => setCopied(false), 2000);
      return () => clearTimeout(timer);
    }
  }, [copied]);

  // Start waiting for connection when modal mounts with URI
  // On desktop, auto-start immediately since QR is shown
  useEffect(() => {
    if (uri && stage === 'idle' && !isIOS && !isAndroid) {
      // Desktop: Auto-start waiting for connection since QR is shown immediately
      logAuth('NostrConnectModal', 'Desktop - auto-starting connection wait for QR scan');
      setStage('waiting');
      startWaitingForConnection();
    }
  }, [uri, stage, startWaitingForConnection]);

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(uri);
      setCopied(true);
      logAuth('NostrConnectModal', 'Copied URI to clipboard');
    } catch (err) {
      logAuthError('NostrConnectModal', 'Failed to copy:', err);
      window.prompt('Copy this link:', uri);
    }
  };

  const handleOpenInSigner = () => {
    logAuth('NostrConnectModal', 'Opening in signer app (nostrconnect://)');
    // Open the nostrconnect:// URI - Amber handles this on Android, desktop signers like Peridot on desktop
    window.location.href = uri;
    
    // If not already waiting (mobile case), start waiting
    if (stage !== 'waiting') {
      setStage('waiting');
      startWaitingForConnection();
    }
  };

  const startWaitingForConnection = useCallback(async () => {
    logAuth('NostrConnectModal', 'Waiting for NIP-46 connection...');
    
    try {
      const result = await NostrConnectService.waitForConnection(uri);
      
      if (result.success && result.publicKey) {
        logAuth('NostrConnectModal', 'Connection successful, pubkey:', result.publicKey.substring(0, 16) + '...');
        setConnectedPubkey(result.publicKey);
        await handleConnectionSuccess(result.publicKey);
      } else {
        logAuthError('NostrConnectModal', 'Connection failed:', result.error);
        setStage('error');
        setErrorMessage(result.error || 'Connection failed');
        setErrorStage('connected');
      }
    } catch (error) {
      logAuthError('NostrConnectModal', 'Exception during connection:', error);
      setStage('error');
      setErrorMessage(error.message || 'Connection failed');
      setErrorStage('connected');
    }
  }, [uri]);

  const handleConnectionSuccess = async (pubkey) => {
    logAuth('NostrConnectModal', 'Handling connection success...');
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
          logAuth('NostrConnectModal', 'Progress:', progressStage, message);
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
    
    logAuth('NostrConnectModal', `Connecting with bunker URL (using ${USE_NDK ? 'NDK' : 'nostr-tools'})...`);
    setStage('connected'); // Go straight to 'connected' stage (showing progress stepper)
    setErrorMessage('');
    setAwaitingApproval(false);
    setAuthUrl(null);
    setApprovalPollCount(0);
    
    // Clear any existing poll timer
    if (approvalPollRef.current) {
      clearInterval(approvalPollRef.current);
      approvalPollRef.current = null;
    }
    
    // Auth URL callback for nsec.app approval flow (some signers use this)
    const handleAuthUrl = (url) => {
      logAuth('NostrConnectModal', 'Received auth URL:', url);
      setAuthUrl(url);
      // Don't change stage, just set awaitingApproval flag to show different UI
      setAwaitingApproval(true);
      
      // Open the auth URL in a popup
      const popup = window.open(url, 'nsec_auth', 'width=500,height=700,popup=yes,scrollbars=yes');
      if (!popup) {
        logAuthWarn('NostrConnectModal', 'Popup blocked, user needs to click link');
      }
    };
    
    try {
      let result;
      
      if (USE_NDK) {
        // Use NDK implementation
        result = await NostrConnectServiceNDK.connect(bunkerUrl.trim(), {
          onAuthUrl: handleAuthUrl,
          onStatusChange: (status) => {
            logAuth('NostrConnectModal', 'NDK status:', status);
            if (status === 'awaiting_approval') {
              // Stay on 'connected' stage but show approval UI
              setAwaitingApproval(true);
            }
          }
        });
      } else {
        // Legacy: Use nostr-tools implementation
        result = await NostrConnectService.connectWithBunkerURL(
          bunkerUrl.trim(), 
          1,
          false, 
          handleAuthUrl
        );
      }
      
      // Handle result - both implementations return similar structure
      if (result.needsApproval) {
        logAuth('NostrConnectModal', 'Signer requires approval, starting auto-poll...');
        setAwaitingApproval(true);
        // Start auto-polling for approval
        startApprovalPolling();
        return;
      }
      
      if (result.success && result.publicKey) {
        logAuth('NostrConnectModal', 'Connection successful');
        stopApprovalPolling();
        setAwaitingApproval(false);
        setAuthUrl(null);
        await handleConnectionSuccess(result.publicKey);
      } else {
        setStage('error');
        setErrorMessage(result.error || 'Connection failed');
        setErrorStage('connected');
      }
    } catch (error) {
      setStage('error');
      setErrorMessage(error.message || 'Connection failed');
      setErrorStage('connected');
    }
  };
  
  // Start auto-polling for approval
  const startApprovalPolling = () => {
    logAuth('NostrConnectModal', 'Starting approval polling...');
    setApprovalPollCount(0);
    
    // Clear any existing timer
    if (approvalPollRef.current) {
      clearInterval(approvalPollRef.current);
    }
    
    // Poll every 4 seconds for up to 2 minutes (30 attempts)
    approvalPollRef.current = setInterval(async () => {
      setApprovalPollCount(prev => {
        const newCount = prev + 1;
        logAuth('NostrConnectModal', `Approval poll attempt ${newCount}/30`);
        
        if (newCount >= 30) {
          // Stop after 2 minutes
          logAuth('NostrConnectModal', 'Polling timeout, stopping');
          stopApprovalPolling();
          return newCount;
        }
        
        return newCount;
      });
      
      // Try to reconnect
      try {
        let result;
        if (USE_NDK) {
          result = await NostrConnectServiceNDK.connect(bunkerUrl.trim(), {
            onStatusChange: (status) => {
              logAuth('NostrConnectModal', 'Poll status:', status);
            }
          });
        } else {
          result = await NostrConnectService.connectWithBunkerURL(bunkerUrl.trim(), 1, false);
        }
        
        if (result.success && result.publicKey) {
          logAuth('NostrConnectModal', 'Poll successful - approval detected!');
          stopApprovalPolling();
          setAwaitingApproval(false);
          setAuthUrl(null);
          await handleConnectionSuccess(result.publicKey);
        }
        // If still needs approval, continue polling (no action needed)
      } catch (error) {
        logAuth('NostrConnectModal', 'Poll attempt failed:', error.message);
        // Continue polling on error
      }
    }, 4000);
  };
  
  // Stop approval polling
  const stopApprovalPolling = () => {
    if (approvalPollRef.current) {
      logAuth('NostrConnectModal', 'Stopping approval polling');
      clearInterval(approvalPollRef.current);
      approvalPollRef.current = null;
    }
  };
  
  // Handle retry after nsec.app approval (manual trigger)
  // This is now just a manual trigger of what polling does automatically
  const handleRetryAfterApproval = async () => {
    logAuth('NostrConnectModal', `Manual retry after approval (using ${USE_NDK ? 'NDK' : 'nostr-tools'})...`);
    
    try {
      let result;
      
      if (USE_NDK) {
        result = await NostrConnectServiceNDK.connect(bunkerUrl.trim(), {
          onStatusChange: (status) => {
            logAuth('NostrConnectModal', 'NDK retry status:', status);
          }
        });
      } else {
        result = await NostrConnectService.connectWithBunkerURL(bunkerUrl.trim(), 1, false);
      }
      
      if (result.success && result.publicKey) {
        logAuth('NostrConnectModal', 'Connection successful after manual retry');
        stopApprovalPolling();
        setAwaitingApproval(false);
        setAuthUrl(null);
        await handleConnectionSuccess(result.publicKey);
      } else if (result.needsApproval) {
        // Still needs approval
        logAuth('NostrConnectModal', 'Still needs approval');
        setErrorMessage('Still waiting for approval. Please approve the connection in your signer app.');
      } else {
        setStage('error');
        setErrorMessage(result.error || 'Connection failed. Please try with a new bunker URL.');
        setErrorStage('connected');
      }
    } catch (error) {
      setStage('error');
      setErrorMessage(error.message || 'Connection failed');
      setErrorStage('connected');
    }
  };

  const handleRetry = async () => {
    logAuth('NostrConnectModal', 'Retrying...');
    setErrorMessage('');
    setShowSlowWarning(false);
    setErrorStage(null);
    
    // Check if we still have a relay connection (use appropriate service)
    const service = getService();
    if (service.isConnected() && connectedPubkey) {
      // Retry just the NIP-98 part
      logAuth('NostrConnectModal', 'Still connected, retrying from signing stage');
      setStage('signing');
      await handleConnectionSuccess(connectedPubkey);
    } else {
      // Need to reconnect from scratch
      logAuth('NostrConnectModal', 'Not connected, restarting from beginning');
      setStage('idle');
      setConnectedPubkey(null);
    }
  };

  const handleCancel = () => {
    logAuth('NostrConnectModal', 'User cancelled');
    // Clean disconnect
    if (slowTimerRef.current) {
      clearTimeout(slowTimerRef.current);
    }
    // Stop approval polling
    stopApprovalPolling();
    // Disconnect using appropriate service
    const service = getService();
    service.disconnect();
    onCancel?.();
  };

  const handleBackToOptions = () => {
    setStage('idle');
    setShowSlowWarning(false);
    setErrorMessage('');
    setErrorStage(null);
    setAwaitingApproval(false);
    setAuthUrl(null);
    // Stop approval polling
    stopApprovalPolling();
  };

  // Determine what to render based on stage
  // isInConnectionFlow now includes states where we're waiting for approval
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
             awaitingApproval ? '⏳ Waiting for Approval' :
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
          
          {/* v58: Desktop waiting view - show tabs with QR code or Bunker URL */}
          {stage === 'waiting' && !isIOS && !isAndroid && (
            <div className="py-2">
              {/* Option selector tabs */}
              <div className="flex rounded-xl bg-gray-100 dark:bg-gray-800 p-1 mb-4">
                <button
                  onClick={() => setShowBunkerInput(false)}
                  className={`flex-1 py-2 px-3 text-sm font-medium rounded-lg transition-all ${
                    !showBunkerInput
                      ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm'
                      : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                  }`}
                >
                  📱 Scan QR Code
                </button>
                <button
                  onClick={() => setShowBunkerInput(true)}
                  className={`flex-1 py-2 px-3 text-sm font-medium rounded-lg transition-all ${
                    showBunkerInput
                      ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm'
                      : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                  }`}
                >
                  🔗 Bunker URL
                </button>
              </div>

              {/* QR Code view */}
              {!showBunkerInput && (
                <>
                  {/* QR Code - Primary for desktop */}
                  <div className="flex flex-col items-center mb-4">
                    <div className="p-4 bg-white rounded-xl shadow-sm border border-gray-200">
                      <QRCodeSVG
                        value={uri}
                        size={200}
                        level="M"
                        includeMargin={false}
                      />
                    </div>
                    <p className="mt-3 text-sm text-gray-600 dark:text-gray-400 text-center">
                      Scan with your mobile signer app
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-500 text-center">
                      (Amber, nsec.app, or any NIP-46 signer)
                    </p>
                  </div>

                  {/* Waiting indicator */}
                  <div className="flex items-center justify-center gap-2 text-purple-600 dark:text-purple-400 mb-4">
                    <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    <span className="text-sm font-medium">Waiting for connection...</span>
                  </div>

                  {/* Divider */}
                  <div className="flex items-center gap-3 mb-4">
                    <div className="flex-1 h-px bg-gray-200 dark:bg-gray-700"></div>
                    <span className="text-xs text-gray-400 dark:text-gray-500">or</span>
                    <div className="flex-1 h-px bg-gray-200 dark:bg-gray-700"></div>
                  </div>

                  {/* Desktop signer button (for Peridot, etc.) */}
                  <button
                    onClick={handleOpenInSigner}
                    className="w-full py-3 px-4 text-base font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-xl transition-all flex items-center justify-center gap-2 mb-3"
                  >
                    <span>🔗</span>
                    <span>Open in Desktop Signer</span>
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
                        <span>Copied! Paste in signer app</span>
                      </>
                    ) : (
                      <>
                        <span>📋</span>
                        <span>Copy Link</span>
                      </>
                    )}
                  </button>
                </>
              )}

              {/* Bunker URL view */}
              {showBunkerInput && (
                <div className="space-y-4">
                  {/* Explanation */}
                  <div className="p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl">
                    <p className="text-sm text-blue-700 dark:text-blue-400">
                      <strong>Signer-initiated flow:</strong> Get a bunker URL from your signer app and paste it here.
                    </p>
                  </div>

                  <form onSubmit={handleBunkerSubmit} className="space-y-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Paste your bunker:// URL
                      </label>
                      <input
                        type="text"
                        value={bunkerUrl}
                        onChange={(e) => setBunkerUrl(e.target.value)}
                        placeholder="bunker://..."
                        className="w-full px-4 py-3 text-base border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                        autoFocus
                      />
                    </div>
                    
                    <button
                      type="submit"
                      disabled={!bunkerUrl.trim()}
                      className="w-full py-3 px-4 text-base font-semibold text-white bg-purple-600 hover:bg-purple-700 disabled:bg-gray-300 dark:disabled:bg-gray-600 rounded-xl transition-colors disabled:cursor-not-allowed"
                    >
                      Connect
                    </button>
                  </form>

                  {/* Instructions */}
                  <div className="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-4">
                    <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      How to get a bunker URL:
                    </p>
                    <div className="text-sm text-gray-600 dark:text-gray-400 space-y-2">
                      <div className="flex items-start gap-2">
                        <span className="font-semibold text-green-600 dark:text-green-400">nsec.app:</span>
                        <span>Connect App → Advanced options → Copy Bunker URL</span>
                      </div>
                      <div className="flex items-start gap-2">
                        <span className="font-semibold text-amber-600 dark:text-amber-400">Amber:</span>
                        <span>Applications → + → Copy bunker URL</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Cancel button */}
              <button
                onClick={handleCancel}
                className="mt-4 w-full text-center text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
              >
                Cancel
              </button>
            </div>
          )}

          {/* Connection Progress View - for mobile waiting OR any platform after connection established */}
          {isInConnectionFlow && (stage !== 'waiting' || isIOS || isAndroid) && (
            <div className="py-2">
              <ProgressStepper currentStage={stage} errorStage={null} waitingForApproval={awaitingApproval} />
              
              {/* Waiting for approval message */}
              {awaitingApproval && stage === 'connected' && (
                <div className="mt-4 p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl">
                  <div className="flex items-start gap-3">
                    <div className="flex-shrink-0 mt-0.5">
                      <svg className="w-5 h-5 text-amber-500 animate-pulse" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                      </svg>
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-amber-800 dark:text-amber-300 mb-1">
                        Action required in signer app
                      </p>
                      <p className="text-sm text-amber-700 dark:text-amber-400 mb-2">
                        Please open <strong>nsec.app</strong> and approve the connection request.
                        {approvalPollCount > 0 && (
                          <span className="text-xs opacity-75 ml-1">
                            (checking... {approvalPollCount}/30)
                          </span>
                        )}
                      </p>
                      <ol className="text-xs text-amber-600 dark:text-amber-500 space-y-1 list-decimal list-inside mb-3">
                        <li>Open nsec.app in another tab</li>
                        <li>Look for a pending connection request</li>
                        <li>Tap <strong>"Approve"</strong> to allow the connection</li>
                      </ol>
                      
                      {/* Auth URL link if provided */}
                      {authUrl && (
                        <div className="mb-3">
                          <a
                            href={authUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-sm text-blue-600 dark:text-blue-400 hover:underline"
                          >
                            Open approval page →
                          </a>
                        </div>
                      )}
                      
                      {/* Manual retry button */}
                      <button
                        onClick={handleRetryAfterApproval}
                        className="w-full py-2 px-3 text-sm font-medium text-amber-700 dark:text-amber-300 bg-amber-100 dark:bg-amber-800/30 hover:bg-amber-200 dark:hover:bg-amber-800/50 rounded-lg transition-colors"
                      >
                        I've approved - check now
                      </button>
                    </div>
                  </div>
                  
                  {/* Show any error message */}
                  {errorMessage && (
                    <p className="mt-3 text-sm text-amber-600 dark:text-amber-400 border-t border-amber-200 dark:border-amber-700 pt-2">
                      {errorMessage}
                    </p>
                  )}
                </div>
              )}
              
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
              {/* v58: Desktop experience with two clear options */}
              {!isIOS && !isAndroid && (
                <div className="space-y-4">
                  {/* Option selector tabs */}
                  <div className="flex rounded-xl bg-gray-100 dark:bg-gray-800 p-1">
                    <button
                      onClick={() => setShowBunkerInput(false)}
                      className={`flex-1 py-2 px-3 text-sm font-medium rounded-lg transition-all ${
                        !showBunkerInput
                          ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm'
                          : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                      }`}
                    >
                      📱 Scan QR Code
                    </button>
                    <button
                      onClick={() => setShowBunkerInput(true)}
                      className={`flex-1 py-2 px-3 text-sm font-medium rounded-lg transition-all ${
                        showBunkerInput
                          ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm'
                          : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                      }`}
                    >
                      🔗 Bunker URL
                    </button>
                  </div>

                  {/* QR Code view */}
                  {!showBunkerInput && (
                    <>
                      {/* QR Code - Primary for desktop */}
                      <div className="flex flex-col items-center">
                        <div className="p-4 bg-white rounded-xl shadow-sm border border-gray-200">
                          <QRCodeSVG
                            value={uri}
                            size={200}
                            level="M"
                            includeMargin={false}
                          />
                        </div>
                        <p className="mt-3 text-sm text-gray-600 dark:text-gray-400 text-center">
                          Scan with your mobile signer app
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-500 text-center">
                          (Amber, nsec.app, or any NIP-46 signer)
                        </p>
                      </div>

                      {/* Divider */}
                      <div className="flex items-center gap-3">
                        <div className="flex-1 h-px bg-gray-200 dark:bg-gray-700"></div>
                        <span className="text-xs text-gray-400 dark:text-gray-500">or</span>
                        <div className="flex-1 h-px bg-gray-200 dark:bg-gray-700"></div>
                      </div>

                      {/* Desktop signer button (for Peridot, etc.) */}
                      <button
                        onClick={handleOpenInSigner}
                        className="w-full py-3 px-4 text-base font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-xl transition-all flex items-center justify-center gap-2"
                      >
                        <span>🔗</span>
                        <span>Open in Desktop Signer</span>
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
                            <span>Copied! Paste in signer app</span>
                          </>
                        ) : (
                          <>
                            <span>📋</span>
                            <span>Copy Link</span>
                          </>
                        )}
                      </button>
                    </>
                  )}

                  {/* Bunker URL view - v58: Now a primary option */}
                  {showBunkerInput && (
                    <div className="space-y-4">
                      {/* Explanation */}
                      <div className="p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl">
                        <p className="text-sm text-blue-700 dark:text-blue-400">
                          <strong>Signer-initiated flow:</strong> Get a bunker URL from your signer app and paste it here.
                        </p>
                      </div>

                      <form onSubmit={handleBunkerSubmit} className="space-y-3">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                            Paste your bunker:// URL
                          </label>
                          <input
                            type="text"
                            value={bunkerUrl}
                            onChange={(e) => setBunkerUrl(e.target.value)}
                            placeholder="bunker://..."
                            className="w-full px-4 py-3 text-base border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                            autoFocus
                          />
                        </div>
                        
                        <button
                          type="submit"
                          disabled={!bunkerUrl.trim()}
                          className="w-full py-3 px-4 text-base font-semibold text-white bg-purple-600 hover:bg-purple-700 disabled:bg-gray-300 dark:disabled:bg-gray-600 rounded-xl transition-colors disabled:cursor-not-allowed"
                        >
                          Connect
                        </button>
                      </form>

                      {/* Instructions */}
                      <div className="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-4">
                        <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                          How to get a bunker URL:
                        </p>
                        <div className="text-sm text-gray-600 dark:text-gray-400 space-y-2">
                          <div className="flex items-start gap-2">
                            <span className="font-semibold text-green-600 dark:text-green-400">nsec.app:</span>
                            <span>Connect App → Advanced options → Copy Bunker URL</span>
                          </div>
                          <div className="flex items-start gap-2">
                            <span className="font-semibold text-amber-600 dark:text-amber-400">Amber:</span>
                            <span>Applications → + → Copy bunker URL</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* v55: Mobile experience - iOS */}
              {isIOS && (
                <div className="space-y-3">
                  {/* nsec.app recommendation banner */}
                  <div className="p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl">
                    <p className="text-sm text-green-700 dark:text-green-400 font-medium">
                      ✅ <strong>Recommended for iOS:</strong> Use nsec.app (web-based signer)
                    </p>
                    <p className="text-xs text-green-600 dark:text-green-500 mt-1">
                      Works reliably in Safari. Native iOS signers have known issues.
                    </p>
                  </div>
                  
                  {/* nsec.app button - opens in new tab */}
                  <a
                    href="https://use.nsec.app"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full py-3 px-4 text-base font-semibold text-white bg-gradient-to-r from-green-600 to-emerald-700 hover:from-green-700 hover:to-emerald-800 rounded-xl transition-all shadow-md hover:shadow-lg flex items-center justify-center gap-2"
                  >
                    <span>🔐</span>
                    <span>Open nsec.app</span>
                  </a>

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
                        <span>Copied! Paste in signer app</span>
                      </>
                    ) : (
                      <>
                        <span>📋</span>
                        <span>Copy Link</span>
                      </>
                    )}
                  </button>

                  {/* Instructions */}
                  <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-4">
                    <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      How to connect:
                    </p>
                    <ol className="text-sm text-gray-600 dark:text-gray-400 space-y-1.5 list-decimal list-inside">
                      <li>Tap <strong>"Open nsec.app"</strong> and sign in or create an account</li>
                      <li>In nsec.app: tap <strong>"Connect App"</strong> → <strong>"Advanced options"</strong></li>
                      <li>Copy the <strong>bunker URL</strong></li>
                      <li>Return here and paste it in <strong>"Use bunker URL"</strong> below</li>
                    </ol>
                  </div>

                  {/* v55: Show QR Code toggle for mobile */}
                  <div className="border-t border-gray-100 dark:border-gray-800 pt-4">
                    <button
                      onClick={() => setShowMobileQR(!showMobileQR)}
                      className="w-full text-center text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 transition-colors flex items-center justify-center gap-1"
                    >
                      <span>{showMobileQR ? '▼' : '▶'}</span>
                      <span>Show QR code (scan from another device)</span>
                    </button>
                    
                    {showMobileQR && (
                      <div className="mt-4 flex flex-col items-center">
                        <div className="p-4 bg-white rounded-xl shadow-sm border border-gray-200">
                          <QRCodeSVG
                            value={uri}
                            size={200}
                            level="M"
                            includeMargin={false}
                          />
                        </div>
                        <p className="mt-3 text-sm text-gray-500 dark:text-gray-400 text-center">
                          Scan this QR from another device
                        </p>
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
                        Paste bunker URL from nsec.app
                      </button>
                    ) : (
                      <form onSubmit={handleBunkerSubmit} className="space-y-3">
                        <div>
                          <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                            Paste bunker:// URL from nsec.app
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
                            <strong>nsec.app:</strong> Connect App → Advanced options → Copy Bunker URL
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
                </div>
              )}

              {/* v55: Mobile experience - Android */}
              {isAndroid && (
                <div className="space-y-3">
                  {/* Amber button - uses nostrconnect:// which Amber registers */}
                  <button
                    onClick={handleOpenInSigner}
                    className="w-full py-3 px-4 text-base font-semibold text-white bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 rounded-xl transition-all shadow-md hover:shadow-lg flex items-center justify-center gap-2"
                  >
                    <span>🔶</span>
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
                        <span>Copied! Paste in signer app</span>
                      </>
                    ) : (
                      <>
                        <span>📋</span>
                        <span>Copy Link</span>
                      </>
                    )}
                  </button>

                  {/* Instructions */}
                  <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-4">
                    <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      How to connect:
                    </p>
                    <ol className="text-sm text-gray-600 dark:text-gray-400 space-y-1.5 list-decimal list-inside">
                      <li>Tap <strong>"Open in Amber"</strong></li>
                      <li>Approve the connection request in your signer</li>
                      <li>Approve the authentication when prompted</li>
                      <li>Return here to complete sign-in</li>
                    </ol>
                  </div>

                  {/* v55: Show QR Code toggle for mobile */}
                  <div className="border-t border-gray-100 dark:border-gray-800 pt-4">
                    <button
                      onClick={() => setShowMobileQR(!showMobileQR)}
                      className="w-full text-center text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 transition-colors flex items-center justify-center gap-1"
                    >
                      <span>{showMobileQR ? '▼' : '▶'}</span>
                      <span>Show QR code (scan from another device)</span>
                    </button>
                    
                    {showMobileQR && (
                      <div className="mt-4 flex flex-col items-center">
                        <div className="p-4 bg-white rounded-xl shadow-sm border border-gray-200">
                          <QRCodeSVG
                            value={uri}
                            size={200}
                            level="M"
                            includeMargin={false}
                          />
                        </div>
                        <p className="mt-3 text-sm text-gray-500 dark:text-gray-400 text-center">
                          Scan this QR from another device
                        </p>
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
                        Or paste bunker URL instead
                      </button>
                    ) : (
                      <form onSubmit={handleBunkerSubmit} className="space-y-3">
                        <div>
                          <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                            Paste bunker:// URL from your signer
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
                            <strong>Amber:</strong> Applications → + → Copy bunker URL<br/>
                            <strong>nsec.app:</strong> Connect App → Advanced options → Copy Bunker URL
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
                </div>
              )}
            </>
          )}

          {/* Old separate "Awaiting Approval" view removed - approval is now shown inline in the connection progress view */}
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
