/**
 * usePWAInstall Hook
 *
 * Manages Progressive Web App (PWA) installation prompt state.
 * Handles the beforeinstallprompt event and provides controls
 * for showing/triggering the install prompt.
 *
 * State includes:
 * - Deferred prompt event reference
 * - Show install prompt modal visibility
 * - Installation status tracking
 *
 * @module lib/hooks/usePWAInstall
 */

import { useState, useCallback, useEffect } from 'react';

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Check if app is running in standalone mode (already installed)
 * @returns {boolean} Whether app is running standalone
 */
function checkIsStandalone() {
  if (typeof window === 'undefined') return false;

  // Check display-mode media query
  const isStandaloneMedia = window.matchMedia('(display-mode: standalone)').matches;

  // Check iOS standalone mode
  const isIOSStandalone = window.navigator.standalone === true;

  // Check if launched from home screen on Android
  const isAndroidTWA = document.referrer.includes('android-app://');

  return isStandaloneMedia || isIOSStandalone || isAndroidTWA;
}

// ============================================================================
// Hook Implementation
// ============================================================================

/**
 * Hook for managing PWA installation prompt
 *
 * @returns {Object} PWA installation state and actions
 * @property {Object|null} deferredPrompt - Deferred install prompt event
 * @property {function(Object|null): void} setDeferredPrompt - Set deferred prompt
 * @property {boolean} hasDeferredPrompt - Whether prompt is available
 * @property {boolean} showInstallPrompt - Whether install modal is visible
 * @property {function(boolean): void} setShowInstallPrompt - Set modal visibility
 * @property {function(): void} openInstallPrompt - Open install modal
 * @property {function(): void} closeInstallPrompt - Close install modal
 * @property {'idle'|'prompted'|'accepted'|'dismissed'} installStatus - Installation status
 * @property {boolean} isInstalled - Whether app is installed
 * @property {boolean} isStandalone - Whether running in standalone mode
 * @property {function(): Promise<boolean>} triggerInstall - Trigger installation
 * @property {function(): void} dismissInstall - Dismiss installation
 * @property {function(): void} resetInstallState - Reset installation state
 *
 * @example
 * const {
 *   deferredPrompt,
 *   showInstallPrompt,
 *   openInstallPrompt,
 *   closeInstallPrompt,
 *   triggerInstall,
 *   hasDeferredPrompt,
 *   isInstalled,
 *   isStandalone
 * } = usePWAInstall();
 *
 * // Show install button only if installation is available
 * {hasDeferredPrompt && !isStandalone && (
 *   <button onClick={openInstallPrompt}>
 *     Install App
 *   </button>
 * )}
 *
 * // Install prompt modal
 * {showInstallPrompt && (
 *   <InstallModal
 *     onInstall={triggerInstall}
 *     onDismiss={closeInstallPrompt}
 *   />
 * )}
 */
export function usePWAInstall() {
  // ---------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------

  const [deferredPrompt, setDeferredPromptState] = useState(null);
  const [showInstallPrompt, setShowInstallPromptState] = useState(false);
  const [installStatus, setInstallStatus] = useState('idle');
  const [isStandalone, setIsStandalone] = useState(false);

  // ---------------------------------------------------------------------------
  // Effects - Listen for beforeinstallprompt event
  // ---------------------------------------------------------------------------

  useEffect(() => {
    // Check if already in standalone mode
    setIsStandalone(checkIsStandalone());

    const handleBeforeInstallPrompt = (e) => {
      // Prevent the mini-infobar from appearing on mobile
      e.preventDefault();
      // Store the event for later use
      setDeferredPromptState(e);
      console.log('PWA: beforeinstallprompt event captured');
    };

    const handleAppInstalled = () => {
      console.log('PWA: App was installed');
      setInstallStatus('accepted');
      setDeferredPromptState(null);
      setShowInstallPromptState(false);
    };

    // Listen for the beforeinstallprompt event
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    // Listen for successful installation
    window.addEventListener('appinstalled', handleAppInstalled);

    // Check standalone mode on visibility change (user might have installed)
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        setIsStandalone(checkIsStandalone());
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  // ---------------------------------------------------------------------------
  // Callbacks - Deferred Prompt
  // ---------------------------------------------------------------------------

  const setDeferredPrompt = useCallback((prompt) => {
    setDeferredPromptState(prompt);
  }, []);

  // ---------------------------------------------------------------------------
  // Callbacks - Install Prompt Modal
  // ---------------------------------------------------------------------------

  const setShowInstallPrompt = useCallback((show) => {
    setShowInstallPromptState(show);
  }, []);

  const openInstallPrompt = useCallback(() => {
    setShowInstallPromptState(true);
  }, []);

  const closeInstallPrompt = useCallback(() => {
    setShowInstallPromptState(false);
  }, []);

  // ---------------------------------------------------------------------------
  // Callbacks - Installation Actions
  // ---------------------------------------------------------------------------

  const triggerInstall = useCallback(async () => {
    if (!deferredPrompt) {
      console.log('PWA: No deferred prompt available');
      return false;
    }

    try {
      // Show the install prompt
      setInstallStatus('prompted');
      await deferredPrompt.prompt();

      // Wait for the user's choice
      const choiceResult = await deferredPrompt.userChoice;

      if (choiceResult.outcome === 'accepted') {
        console.log('PWA: User accepted the install prompt');
        setInstallStatus('accepted');
        setDeferredPromptState(null);
        setShowInstallPromptState(false);
        return true;
      } else {
        console.log('PWA: User dismissed the install prompt');
        setInstallStatus('dismissed');
        return false;
      }
    } catch (error) {
      console.error('PWA: Error triggering install:', error);
      setInstallStatus('idle');
      return false;
    }
  }, [deferredPrompt]);

  const dismissInstall = useCallback(() => {
    setShowInstallPromptState(false);
    setInstallStatus('dismissed');
  }, []);

  const resetInstallState = useCallback(() => {
    setShowInstallPromptState(false);
    setInstallStatus('idle');
    // Note: We don't reset deferredPrompt as it comes from the browser event
  }, []);

  // ---------------------------------------------------------------------------
  // Derived State
  // ---------------------------------------------------------------------------

  const hasDeferredPrompt = deferredPrompt !== null;
  const isInstalled = installStatus === 'accepted' || isStandalone;

  // ---------------------------------------------------------------------------
  // Return
  // ---------------------------------------------------------------------------

  return {
    // Deferred prompt state
    deferredPrompt,
    setDeferredPrompt,
    hasDeferredPrompt,

    // Install prompt modal visibility
    showInstallPrompt,
    setShowInstallPrompt,
    openInstallPrompt,
    closeInstallPrompt,

    // Installation status
    installStatus,
    isInstalled,
    isStandalone,

    // Actions
    triggerInstall,
    dismissInstall,
    resetInstallState,
  };
}

export default usePWAInstall;
