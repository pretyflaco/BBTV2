/**
 * NostrLoginForm - Sign-in component with multiple Nostr authentication methods
 * 
 * Supports:
 * - Browser extension (keys.band, Alby) - Desktop
 * - External signer (Amber) - Mobile
 */

import { useState, useEffect } from 'react';
import { useNostrAuth } from '../../lib/hooks/useNostrAuth';

export default function NostrLoginForm() {
  const {
    loading,
    error,
    hasExtension,
    isMobile,
    availableMethods,
    signInWithExtension,
    signInWithExternalSigner,
    checkPendingSignerFlow
  } = useNostrAuth();

  const [signingIn, setSigningIn] = useState(false);
  const [localError, setLocalError] = useState(null);

  // Check for pending signer flow on focus (user returning from Amber)
  useEffect(() => {
    const handleFocus = async () => {
      const result = await checkPendingSignerFlow();
      if (result.success) {
        // Sign-in completed successfully
        console.log('Signed in via external signer');
      }
    };

    window.addEventListener('focus', handleFocus);
    
    // Also check on mount
    handleFocus();

    return () => window.removeEventListener('focus', handleFocus);
  }, [checkPendingSignerFlow]);

  const handleExtensionSignIn = async () => {
    setSigningIn(true);
    setLocalError(null);

    const result = await signInWithExtension();

    if (!result.success) {
      setLocalError(result.error);
    }

    setSigningIn(false);
  };

  const handleExternalSignerSignIn = async () => {
    setSigningIn(true);
    setLocalError(null);

    const result = await signInWithExternalSigner();

    if (result.pending) {
      // User will be redirected to external signer
      // When they return, the page reloads fresh with new state.
      // However, if navigation fails silently, we should reset after a timeout.
      setTimeout(() => {
        // If we're still on this page after 5 seconds, navigation likely failed
        setSigningIn(false);
      }, 5000);
      return;
    }

    if (!result.success) {
      setLocalError(result.error);
    }
    
    // Always reset signing state when not pending
    setSigningIn(false);
  };

  const displayError = localError || error;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-black">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blink-accent mx-auto"></div>
          <p className="mt-4 text-gray-600 dark:text-gray-400">Checking authentication...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-black">
      <div className="max-w-md w-full space-y-8 p-8">
        {/* Logo */}
        <div className="text-center">
          <div className="flex justify-center mb-6">
            <img 
              src="/logos/blink-logo-full.svg" 
              alt="Blink POS" 
              className="h-24"
            />
          </div>
          <h2 className="text-3xl font-extrabold text-gray-900 dark:text-gray-100">
            Blink POS
          </h2>
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
            Sign in with your Nostr identity
          </p>
        </div>

        {/* Sign-in Methods */}
        <div className="space-y-4">
          {/* Extension Sign-In (Desktop) */}
          {hasExtension && (
            <button
              onClick={handleExtensionSignIn}
              disabled={signingIn}
              className="group relative w-full flex justify-center items-center py-4 px-6 border border-transparent text-lg font-medium rounded-xl text-white bg-purple-600 hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {signingIn ? (
                <>
                  <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Connecting...
                </>
              ) : (
                <>
                  <svg className="w-6 h-6 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                  </svg>
                  Sign in with Extension
                </>
              )}
            </button>
          )}

          {/* Show extension install hint if not available on desktop */}
          {!hasExtension && !isMobile && (
            <div className="text-center p-4 bg-blue-50 dark:bg-blue-900/20 rounded-xl border border-blue-200 dark:border-blue-800">
              <p className="text-sm text-blue-700 dark:text-blue-300">
                💡 Install a Nostr extension like{' '}
                <a 
                  href="https://keys.band" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="font-medium underline hover:text-blue-800 dark:hover:text-blue-200"
                >
                  keys.band
                </a>{' '}
                or{' '}
                <a 
                  href="https://getalby.com" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="font-medium underline hover:text-blue-800 dark:hover:text-blue-200"
                >
                  Alby
                </a>{' '}
                for easy sign-in
              </p>
            </div>
          )}

          {/* Divider */}
          {hasExtension && (
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-300 dark:border-gray-700"></div>
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-2 bg-gray-50 dark:bg-black text-gray-500">or</span>
              </div>
            </div>
          )}

          {/* External Signer (Amber) */}
          <button
            onClick={handleExternalSignerSignIn}
            disabled={signingIn}
            className="group relative w-full flex justify-center items-center py-4 px-6 border-2 border-amber-500 text-lg font-medium rounded-xl text-amber-600 dark:text-amber-400 bg-transparent hover:bg-amber-50 dark:hover:bg-amber-900/20 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-amber-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {signingIn ? (
              <>
                <svg className="animate-spin -ml-1 mr-3 h-5 w-5" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Opening Signer...
              </>
            ) : (
              <>
                <svg className="w-6 h-6 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
                </svg>
                Sign in with Amber
              </>
            )}
          </button>

          {/* Mobile hint */}
          {isMobile && (
            <p className="text-xs text-center text-gray-500 dark:text-gray-400">
              Don't have Amber?{' '}
              <a 
                href="https://github.com/greenart7c3/Amber" 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-amber-600 dark:text-amber-400 underline"
              >
                Get it here
              </a>
            </p>
          )}
        </div>

        {/* Error Display */}
        {displayError && (
          <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
            <p className="text-sm text-red-600 dark:text-red-400">
              {displayError}
            </p>
          </div>
        )}

        {/* Info Section */}
        <div className="mt-8 text-center space-y-2">
          <p className="text-xs text-gray-500 dark:text-gray-400">
            🔐 Your credentials are encrypted and stored locally
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            After signing in, you'll connect your Blink account
          </p>
        </div>

        {/* What is Nostr? */}
        <div className="mt-6 text-center">
          <details className="text-left">
            <summary className="cursor-pointer text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300">
              What is Nostr?
            </summary>
            <div className="mt-2 p-4 bg-gray-100 dark:bg-gray-800 rounded-lg text-sm text-gray-600 dark:text-gray-300">
              <p>
                Nostr is a decentralized protocol for identity and communication. 
                Your Nostr identity (public key) acts as your login across many apps.
              </p>
              <p className="mt-2">
                <strong>Browser extensions</strong> (keys.band, Alby) keep your keys secure on desktop.
              </p>
              <p className="mt-2">
                <strong>Amber</strong> is a mobile app that securely manages your Nostr keys on Android.
              </p>
            </div>
          </details>
        </div>
      </div>
    </div>
  );
}

