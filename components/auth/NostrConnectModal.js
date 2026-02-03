/**
 * NostrConnectModal - Mobile-friendly modal for NIP-46 connection
 * 
 * v55: QR Code first for desktop, toggle for mobile
 * - Desktop: Shows QR code immediately as primary method for scanning with mobile signers
 * - Desktop: Auto-starts waiting for connection when modal opens
 * - Desktop: Keeps "Open in Desktop Signer" button for Peridot and similar apps
 * - Mobile: Adds "Show QR Code" toggle to scan from another device
 * - Mobile: Keeps existing Open in Amber/Aegis buttons as primary
 * - Both: Bunker URL paste remains as fallback option
 * 
 * v51: Added NDK implementation for more reliable NIP-46 connections
 * - Uses @nostr-dev-kit/ndk instead of nostr-tools when NEXT_PUBLIC_USE_NDK_NIP46=true
 * - NDK handles NIP-46 more robustly, especially with nsec.app on iOS Safari
 * - Supports both bunker:// URLs and NIP-05 identifiers (e.g., user@nsec.app)
 * - Feature flag allows side-by-side comparison during testing
 * 
 * v50: Patched nostr-tools to add 'since' filter to NIP-46 subscriptions
 * - PERMANENT FIX: Using patch-package to modify nostr-tools/nip46.js
 * - Added 'since: Math.floor(Date.now() / 1000) - 60' to subscription filter
 * - This prevents relay from replaying old cached NIP-46 events (the root cause)
 * - Same fix nsec.app backend uses for strfry relay compatibility
 * 
 * v49: Fixed iOS Safari "invalid secret" - OLD RELAY RESPONSES
 * - ROOT CAUSE: nostr-tools uses limit:0 with no 'since' filter
 * - Relay sends ALL historical events including old error responses
 * - When using shared pool, old subscriptions interfere with new ones
 * - FIX: NostrConnectService now creates FRESH pool for each connection
 * - FIX: Always show approval UI on first "invalid secret" (nsec.app needs approval)
 * - FIX: Only mark URL as expired after retry also fails
 * 
 * v48: Fixed auth_url race condition with nsec.app (but nsec.app doesn't use auth_url!)
 * 
 * v47: Fixed iOS Safari "invalid secret" issue
 * - Bunker URL secrets are SINGLE-USE - don't retry with same URL
 * - Clear error messaging when secret is expired/consumed
 * - After approval flow, user MUST generate new bunker URL
 * - Uses shared SimplePool per nostr-tools recommendations
 * 
 * v35: Added nsec.app auth_url approval flow support
 * - When connecting from a new device, nsec.app sends auth_url for approval
 * - Shows "Awaiting Approval" UI with link to approve in nsec.app
 * - After approval, user clicks "I've Approved - Continue" to complete connection
 * 
 * v34: Added nsec.app as recommended cross-platform option
 * - nsec.app works reliably on iOS, Android, and desktop browsers
 * - Shows "Use nsec.app" as primary option on iOS (since native signers have issues)
 * - Added instructions for how to use nsec.app with bunker:// URL
 * - Added helpful tip about nsec.app being recommended for iOS
 * 
 * v32: Simplified Aegis support - fire-and-forget approach.
 * - Uses nostrsigner:// scheme which Aegis registers on both iOS and Android
 * - No callbacks - just open Aegis and wait for relay connection
 * - Shows both "Open in Amber" and "Open in Aegis" buttons on Android
 * - Shows "Open in Aegis" on iOS
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
import NostrConnectServiceNDK from '../../lib/nostr/NostrConnectServiceNDK';

// v51: Feature flag to use NDK implementation
const USE_NDK = process.env.NEXT_PUBLIC_USE_NDK_NIP46 === 'true';

// Get the appropriate service based on feature flag
const getService = () => USE_NDK ? NostrConnectServiceNDK : NostrConnectService;

// Detect iOS
const isIOS = typeof navigator !== 'undefined' && /iPad|iPhone|iPod/.test(navigator.userAgent);
const isAndroid = typeof navigator !== 'undefined' && /Android/.test(navigator.userAgent);

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
  // v55: On desktop, auto-start immediately since QR is shown
  useEffect(() => {
    if (uri && stage === 'idle' && !isIOS && !isAndroid) {
      // Desktop: Auto-start waiting for connection since QR is shown immediately
      console.log('[NostrConnectModal] v55: Desktop - auto-starting connection wait for QR scan');
      setStage('waiting');
      startWaitingForConnection();
    }
  }, [uri, stage, startWaitingForConnection]);

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(uri);
      setCopied(true);
      console.log('[NostrConnectModal] v32: Copied URI to clipboard');
    } catch (err) {
      console.error('[NostrConnectModal] v32: Failed to copy:', err);
      window.prompt('Copy this link:', uri);
    }
  };

  const handleOpenInSigner = () => {
    console.log('[NostrConnectModal] v55: Opening in signer app (nostrconnect://)');
    // Open the nostrconnect:// URI - Amber handles this on Android, desktop signers like Peridot on desktop
    window.location.href = uri;
    
    // If not already waiting (mobile case), start waiting
    if (stage !== 'waiting') {
      setStage('waiting');
      startWaitingForConnection();
    }
  };

  // v32: Open in Aegis using nostrsigner:// scheme
  // This is a fire-and-forget approach - we open Aegis and wait for relay connection
  // No callbacks needed since we're waiting on the relay anyway
  const handleOpenInAegis = () => {
    console.log('[NostrConnectModal] v32: Opening in Aegis (nostrsigner://) and starting wait...');
    
    // Build the Aegis URL using nostrsigner:// scheme
    // Format: nostrsigner://x-callback-url/auth/nip46?method=connect&nostrconnect=<encoded>
    // We omit callbacks since PWAs can't register custom URL schemes
    const nostrConnectEncoded = encodeURIComponent(uri);
    
    // Use nostrsigner:// which Aegis registers on both iOS and Android
    const aegisUrl = `nostrsigner://x-callback-url/auth/nip46?method=connect&nostrconnect=${nostrConnectEncoded}&x-source=blinkpos`;
    
    console.log('[NostrConnectModal] v32: Aegis URL:', aegisUrl.substring(0, 100) + '...');
    
    setStage('waiting');
    
    // Open Aegis
    window.location.href = aegisUrl;
    
    // Start waiting for the connection via relay
    // Aegis will connect to the relay specified in the nostrconnect URI
    startWaitingForConnection();
  };

  const startWaitingForConnection = useCallback(async () => {
    console.log('[NostrConnectModal] v32: Waiting for NIP-46 connection...');
    
    try {
      const result = await NostrConnectService.waitForConnection(uri);
      
      if (result.success && result.publicKey) {
        console.log('[NostrConnectModal] v32: Connection successful, pubkey:', result.publicKey.substring(0, 16) + '...');
        setConnectedPubkey(result.publicKey);
        await handleConnectionSuccess(result.publicKey);
      } else {
        console.error('[NostrConnectModal] v32: Connection failed:', result.error);
        setStage('error');
        setErrorMessage(result.error || 'Connection failed');
        setErrorStage('connected');
      }
    } catch (error) {
      console.error('[NostrConnectModal] v32: Exception during connection:', error);
      setStage('error');
      setErrorMessage(error.message || 'Connection failed');
      setErrorStage('connected');
    }
  }, [uri]);

  const handleConnectionSuccess = async (pubkey) => {
    console.log('[NostrConnectModal] v32: Handling connection success...');
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
          console.log('[NostrConnectModal] v32: Progress:', progressStage, message);
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
    
    console.log(`[NostrConnectModal] v51: Connecting with bunker URL (using ${USE_NDK ? 'NDK' : 'nostr-tools'})...`);
    setStage('waiting');
    setErrorMessage('');
    setAwaitingApproval(false);
    setAuthUrl(null);
    
    // Auth URL callback for nsec.app approval flow (some signers use this)
    const handleAuthUrl = (url) => {
      console.log('[NostrConnectModal] v51: Received auth URL:', url);
      setAuthUrl(url);
      setAwaitingApproval(true);
      setStage('awaiting_approval');
      
      // Open the auth URL in a popup
      const popup = window.open(url, 'nsec_auth', 'width=500,height=700,popup=yes,scrollbars=yes');
      if (!popup) {
        console.warn('[NostrConnectModal] v51: Popup blocked, user needs to click link');
      }
    };
    
    try {
      let result;
      
      if (USE_NDK) {
        // v51: Use NDK implementation
        result = await NostrConnectServiceNDK.connect(bunkerUrl.trim(), {
          onAuthUrl: handleAuthUrl,
          onStatusChange: (status) => {
            console.log('[NostrConnectModal] v51 NDK status:', status);
            if (status === 'awaiting_approval') {
              setStage('awaiting_approval');
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
        console.log('[NostrConnectModal] v51: Signer requires approval, showing approval UI');
        setStage('awaiting_approval');
        setAwaitingApproval(true);
        if (result.error) {
          setErrorMessage(result.error);
        }
        return;
      }
      
      if (result.success && result.publicKey) {
        console.log('[NostrConnectModal] v51: Connection successful');
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
  
  // Handle retry after nsec.app approval
  // v51: Updated to work with both NDK and nostr-tools implementations
  const handleRetryAfterApproval = async () => {
    console.log(`[NostrConnectModal] v51: Retrying after approval (using ${USE_NDK ? 'NDK' : 'nostr-tools'})...`);
    setStage('waiting');
    setAwaitingApproval(false);
    setAuthUrl(null);
    setErrorMessage('');
    
    try {
      let result;
      
      if (USE_NDK) {
        // v51: Retry with NDK
        result = await NostrConnectServiceNDK.connect(bunkerUrl.trim(), {
          onStatusChange: (status) => {
            console.log('[NostrConnectModal] v51 NDK retry status:', status);
          }
        });
      } else {
        // Legacy: Retry with nostr-tools
        result = await NostrConnectService.connectWithBunkerURL(bunkerUrl.trim(), 1, false);
      }
      
      if (result.success && result.publicKey) {
        console.log('[NostrConnectModal] v51: Connection successful after approval');
        await handleConnectionSuccess(result.publicKey);
      } else if (result.needsApproval) {
        // Still needs approval - maybe user didn't actually approve yet
        console.log('[NostrConnectModal] v51: Still needs approval - asking user to try again');
        setStage('awaiting_approval');
        setAwaitingApproval(true);
        setErrorMessage('Please make sure you approved the connection in your signer app, then try again.');
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
    console.log('[NostrConnectModal] v51: Retrying...');
    setErrorMessage('');
    setShowSlowWarning(false);
    setErrorStage(null);
    
    // Check if we still have a relay connection (use appropriate service)
    const service = getService();
    if (service.isConnected() && connectedPubkey) {
      // Retry just the NIP-98 part
      console.log('[NostrConnectModal] v51: Still connected, retrying from signing stage');
      setStage('signing');
      await handleConnectionSuccess(connectedPubkey);
    } else {
      // Need to reconnect from scratch
      console.log('[NostrConnectModal] v51: Not connected, restarting from beginning');
      setStage('idle');
      setConnectedPubkey(null);
    }
  };

  const handleCancel = () => {
    console.log('[NostrConnectModal] v51: User cancelled');
    // Clean disconnect
    if (slowTimerRef.current) {
      clearTimeout(slowTimerRef.current);
    }
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
  };

  // Determine what to render based on stage
  const isInConnectionFlow = ['waiting', 'connected', 'signing', 'syncing', 'complete'].includes(stage);
  const isAwaitingApproval = stage === 'awaiting_approval';
  const isInErrorState = stage === 'error';

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-900 rounded-2xl max-w-sm w-full shadow-xl overflow-hidden max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="px-6 pt-6 pb-4 text-center border-b border-gray-100 dark:border-gray-800">
          <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
            {stage === 'complete' ? '✓ Connected!' : 
             isInErrorState ? '⚠️ Connection Failed' :
             isAwaitingApproval ? '🔐 Approval Required' :
             isInConnectionFlow ? '🔗 Connecting...' : 
             '🔗 Connect with Nostr Signer'}
          </h3>
          {!isInConnectionFlow && !isInErrorState && !isAwaitingApproval && (
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              NIP-46 Nostr Connect
            </p>
          )}
        </div>

        {/* Content */}
        <div className="px-6 py-5">
          
          {/* v55: Desktop waiting view - show QR code while waiting for scan */}
          {stage === 'waiting' && !isIOS && !isAndroid && (
            <div className="py-2">
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
                  (Amber, nsec.app, Aegis, or any NIP-46 signer)
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
              {/* v55: Desktop QR-first experience */}
              {!isIOS && !isAndroid && (
                <div className="space-y-4">
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
                      (Amber, nsec.app, Aegis, or any NIP-46 signer)
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

                  {/* Alternative: Bunker URL Input (fallback) */}
                  <div className="border-t border-gray-100 dark:border-gray-800 pt-4">
                    {!showBunkerInput ? (
                      <button
                        onClick={() => setShowBunkerInput(true)}
                        className="w-full text-center text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 transition-colors flex items-center justify-center gap-1"
                      >
                        <span>▶</span>
                        <span>Paste bunker URL instead</span>
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
                            <strong>nsec.app:</strong> Connect App → Advanced options → Copy Bunker URL<br/>
                            <strong>Amber:</strong> Applications → + → Copy bunker URL
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
                  
                  {/* Divider */}
                  <div className="flex items-center gap-3 my-2">
                    <div className="flex-1 h-px bg-gray-200 dark:bg-gray-700"></div>
                    <span className="text-xs text-gray-400 dark:text-gray-500">or try native signer</span>
                    <div className="flex-1 h-px bg-gray-200 dark:bg-gray-700"></div>
                  </div>
                  
                  {/* Aegis button - secondary option */}
                  <button
                    onClick={handleOpenInAegis}
                    className="w-full py-2.5 px-4 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-xl transition-all flex items-center justify-center gap-2"
                  >
                    <span>📱</span>
                    <span>Open in Aegis</span>
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
                            <strong>nsec.app:</strong> Connect App → Advanced options → Copy Bunker URL<br/>
                            <strong>Aegis:</strong> Settings → Copy bunker URL
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
                  
                  {/* Aegis button - uses nostrsigner:// which Aegis registers */}
                  <button
                    onClick={handleOpenInAegis}
                    className="w-full py-3 px-4 text-base font-semibold text-white bg-gradient-to-r from-purple-600 to-violet-700 hover:from-purple-700 hover:to-violet-800 rounded-xl transition-all shadow-md hover:shadow-lg flex items-center justify-center gap-2"
                  >
                    <span>🛡️</span>
                    <span>Open in Aegis</span>
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
                      <li>Tap <strong>"Open in Amber"</strong> or <strong>"Open in Aegis"</strong></li>
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
                            <strong>Aegis:</strong> Settings → Copy bunker URL<br/>
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

          {/* Awaiting nsec.app Approval View */}
          {isAwaitingApproval && (
            <div className="py-4 text-center">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                <svg className="w-8 h-8 text-blue-500 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              </div>
              
              <h4 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
                Approve in nsec.app
              </h4>
              
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                {authUrl 
                  ? 'A popup should have opened. Please approve the connection request in nsec.app, then tap the button below.'
                  : 'Please open nsec.app and look for a connection request to approve. After approving, tap the button below.'}
              </p>
              
              {/* v49: Instructions for nsec.app if no auth_url was provided */}
              {!authUrl && (
                <div className="mb-4 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg text-left">
                  <p className="text-sm text-amber-700 dark:text-amber-400 font-medium mb-2">
                    📱 In nsec.app:
                  </p>
                  <ol className="text-xs text-amber-600 dark:text-amber-500 space-y-1 list-decimal list-inside">
                    <li>Open the nsec.app tab/window</li>
                    <li>Look for a notification or "Pending" request</li>
                    <li>Tap to approve the connection</li>
                    <li>Return here and tap "Retry Connection"</li>
                  </ol>
                </div>
              )}
              
              {/* Link to open auth URL manually if one was provided but popup was blocked */}
              {authUrl && (
                <div className="mb-4 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                    Popup didn't open? Click here:
                  </p>
                  <a
                    href={authUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-blue-600 dark:text-blue-400 hover:underline break-all"
                  >
                    Open nsec.app approval page →
                  </a>
                </div>
              )}
              
              <div className="flex gap-3">
                <button
                  onClick={handleRetryAfterApproval}
                  className="flex-1 py-3 px-4 text-base font-semibold text-white bg-green-600 hover:bg-green-700 rounded-xl transition-colors"
                >
                  Retry Connection
                </button>
              </div>
              
              {/* Show any error message */}
              {errorMessage && (
                <p className="mt-3 text-sm text-amber-600 dark:text-amber-400">
                  {errorMessage}
                </p>
              )}
              
              <button
                onClick={handleBackToOptions}
                className="mt-3 w-full text-center text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
              >
                ← Back to options
              </button>
            </div>
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
