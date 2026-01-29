/**
 * NostrLoginForm - Sign-in component with multiple Nostr authentication methods
 * 
 * Supports:
 * - Browser extension (keys.band, Alby) - Desktop
 * - External signer (Amber) - Mobile
 * - In-app key generation with password protection
 */

import { useState, useEffect } from 'react';
import { useNostrAuth } from '../../lib/hooks/useNostrAuth';
import { useTheme } from '../../lib/hooks/useTheme';
import NostrAuthService from '../../lib/nostr/NostrAuthService';

export default function NostrLoginForm() {
  const { darkMode } = useTheme();
  const {
    loading,
    error,
    hasExtension,
    isMobile,
    availableMethods,
    pendingAmberApproval,
    signInWithExtension,
    signInWithExternalSigner,
    checkPendingSignerFlow,
    createAccountWithPassword,
    signInWithPassword
  } = useNostrAuth();

  const [signingIn, setSigningIn] = useState(false);
  const [localError, setLocalError] = useState(null);
  const [checkingReturn, setCheckingReturn] = useState(true);
  const [hasPendingFlow, setHasPendingFlow] = useState(false);
  
  // In-app key generation state
  const [authMode, setAuthMode] = useState('main'); // 'main', 'create', 'password'
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [hasStoredAccount, setHasStoredAccount] = useState(false);
  
  // Detect iOS vs Android for showing appropriate mobile options
  const isIOS = typeof navigator !== 'undefined' && /iPad|iPhone|iPod/.test(navigator.userAgent);
  const isAndroid = typeof navigator !== 'undefined' && /Android/.test(navigator.userAgent);
  
  // Check for stored account and pending flow on mount
  useEffect(() => {
    setHasStoredAccount(NostrAuthService.hasStoredEncryptedNsec());
    
    // Check if there's a pending Amber flow
    const pendingFlow = NostrAuthService.getPendingChallengeFlow();
    if (pendingFlow) {
      const flowAge = Date.now() - pendingFlow.timestamp;
      // Only consider flows less than 2 minutes old as "pending"
      setHasPendingFlow(flowAge < 120000);
    }
  }, []);

  // Check for pending signer flow on mount and focus (user returning from Amber)
  useEffect(() => {
    const checkSignerReturn = async () => {
      const result = await checkPendingSignerFlow();
      if (result.success) {
        // Sign-in completed successfully
        console.log('Signed in via external signer');
      } else if (result.error && result.pending !== false) {
        // Show error only if there was a pending flow that failed
        setLocalError(result.error);
      }
      setCheckingReturn(false);
    };

    // Check immediately on mount (handles redirect return)
    checkSignerReturn();

    // Also check on focus (handles manual app switch)
    const handleFocus = () => {
      checkSignerReturn();
    };

    window.addEventListener('focus', handleFocus);
    
    // Also listen for visibility change (more reliable on mobile)
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        checkSignerReturn();
      }
    };
    
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
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
    console.log('[NostrLoginForm] handleExternalSignerSignIn called');
    
    // Check if there's already a pending flow - prevent double-clicks
    const pendingFlow = NostrAuthService.getPendingChallengeFlow();
    if (pendingFlow) {
      console.log('[NostrLoginForm] Pending flow detected, step:', pendingFlow.step);
      
      // Check if flow is recent (within 30 seconds) - user might be waiting for Amber
      const flowAge = Date.now() - pendingFlow.timestamp;
      if (flowAge < 30000) {
        console.log('[NostrLoginForm] Flow is recent (' + Math.round(flowAge/1000) + 's old), showing waiting message');
        setLocalError('Waiting for Amber response... If Amber did not open, please try again.');
        // Show error for 3 seconds then clear
        setTimeout(() => setLocalError(null), 3000);
        return;
      }
      
      // Flow is stale, clear it and proceed
      console.log('[NostrLoginForm] Flow is stale (' + Math.round(flowAge/1000) + 's old), clearing and restarting');
      NostrAuthService.clearPendingChallengeFlow();
    }
    
    setSigningIn(true);
    setLocalError(null);

    try {
      console.log('[NostrLoginForm] Calling signInWithExternalSigner...');
      const result = await signInWithExternalSigner();
      console.log('[NostrLoginForm] signInWithExternalSigner result:', result);

      if (result.pending) {
        // User will be redirected to external signer
        // When they return, the page reloads fresh with new state.
        // Keep button disabled longer to prevent re-clicks
        console.log('[NostrLoginForm] Redirect pending, waiting...');
        setHasPendingFlow(true);
        // Don't reset signingIn here - let it stay disabled
        // It will reset when page reloads or after longer timeout
        setTimeout(() => {
          setSigningIn(false);
        }, 10000); // Increased to 10 seconds
        return;
      }

      if (!result.success) {
        console.log('[NostrLoginForm] Sign-in failed:', result.error);
        setLocalError(result.error);
      }
    } catch (error) {
      console.error('[NostrLoginForm] Exception in handleExternalSignerSignIn:', error);
      setLocalError(error.message || 'Sign-in failed');
    }
    
    // Always reset signing state when not pending
    setSigningIn(false);
  };

  // Handle create new account with password
  const handleCreateAccount = async (e) => {
    e.preventDefault();
    setSigningIn(true);
    setLocalError(null);

    try {
      // Validate password
      if (password.length < 8) {
        setLocalError('Password must be at least 8 characters');
        setSigningIn(false);
        return;
      }

      if (password !== confirmPassword) {
        setLocalError('Passwords do not match');
        setSigningIn(false);
        return;
      }

      // Use the hook method which handles everything including state update
      const result = await createAccountWithPassword(password);
      
      if (!result.success) {
        setLocalError(result.error);
        setSigningIn(false);
        return;
      }

      // Success! State is already updated by the hook - no reload needed
      console.log('[NostrLoginForm] Account created successfully');
      setSigningIn(false);
    } catch (err) {
      console.error('Create account failed:', err);
      setLocalError(err.message || 'Failed to create account');
      setSigningIn(false);
    }
  };

  // Handle sign in with password (existing account)
  const handlePasswordSignIn = async (e) => {
    e.preventDefault();
    setSigningIn(true);
    setLocalError(null);

    try {
      // Use the hook method which handles everything including state update
      const result = await signInWithPassword(password);
      
      if (!result.success) {
        setLocalError(result.error);
        setSigningIn(false);
        return;
      }

      // Success! State is already updated by the hook - no reload needed
      console.log('[NostrLoginForm] Signed in with password successfully');
      setSigningIn(false);
    } catch (err) {
      console.error('Password sign in failed:', err);
      setLocalError(err.message || 'Failed to sign in');
      setSigningIn(false);
    }
  };

  // Reset to main view
  const handleBackToMain = () => {
    setAuthMode('main');
    setPassword('');
    setConfirmPassword('');
    setLocalError(null);
  };

  const displayError = localError || error;

  if (loading || checkingReturn) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-black">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-4 border-blink-accent border-t-transparent mx-auto"></div>
          <p className="mt-4 text-gray-600 dark:text-gray-400">
            {checkingReturn ? 'Completing sign-in...' : 'Checking authentication...'}
          </p>
        </div>
      </div>
    );
  }

  // Waiting for Amber approval view
  if (pendingAmberApproval) {
    const handleRetryAmber = () => {
      // Clear the pending flow and re-trigger Amber
      NostrAuthService.clearPendingChallengeFlow();
      handleExternalSignerSignIn();
    };
    
    const handleCancelAmber = () => {
      // Clear the pending flow and go back to main view
      NostrAuthService.clearPendingChallengeFlow();
      window.location.reload();
    };
    
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-black">
        <div className="max-w-md w-full space-y-6 p-8 text-center">
          {/* Amber icon */}
          <div className="flex justify-center mb-6">
            <div className="w-20 h-20 bg-gradient-to-br from-amber-400 to-orange-600 rounded-2xl flex items-center justify-center animate-pulse">
              <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
              </svg>
            </div>
          </div>
          
          <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            Waiting for Amber
          </h2>
          
          <p className="text-gray-600 dark:text-gray-400">
            Please open the Amber app and <strong>approve the sign-in request</strong>.
          </p>
          
          <p className="text-sm text-gray-500 dark:text-gray-500">
            After approving in Amber, return to this page.
          </p>
          
          {/* Retry button to re-open Amber */}
          <button
            onClick={handleRetryAmber}
            className="w-full flex justify-center items-center py-4 px-6 border-2 border-amber-500 text-lg font-medium rounded-xl text-amber-600 dark:text-amber-400 bg-transparent hover:bg-amber-50 dark:hover:bg-amber-900/20 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-amber-500 transition-colors"
          >
            <svg className="w-6 h-6 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Retry / Open Amber Again
          </button>
          
          {/* Cancel button */}
          <button
            onClick={handleCancelAmber}
            className="w-full text-center text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
          >
            Cancel and go back
          </button>
        </div>
      </div>
    );
  }

  // Create Account View
  if (authMode === 'create') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-black">
        <div className="max-w-md w-full space-y-8 p-8">
          {/* Header */}
          <div className="text-center">
            <div className="flex justify-center mb-6">
              <div className="w-16 h-16 bg-gradient-to-br from-emerald-400 to-teal-600 rounded-2xl flex items-center justify-center">
                <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                </svg>
              </div>
            </div>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
              Create New Account
            </h2>
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
              Your private key will be encrypted with this password
            </p>
          </div>

          {/* Create Account Form */}
          <form onSubmit={handleCreateAccount} className="space-y-4">
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter a strong password"
                className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                required
                minLength={8}
                autoFocus
                autoComplete="new-password"
              />
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                Minimum 8 characters
              </p>
            </div>

            <div>
              <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Confirm Password
              </label>
              <input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirm your password"
                className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                required
                minLength={8}
                autoComplete="new-password"
              />
            </div>

            {/* Error Display */}
            {displayError && (
              <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                <p className="text-sm text-red-600 dark:text-red-400">
                  {displayError}
                </p>
              </div>
            )}

            <button
              type="submit"
              disabled={signingIn || password.length < 8 || password !== confirmPassword}
              className="w-full flex justify-center items-center py-4 px-6 border border-transparent text-lg font-medium rounded-xl text-white bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              {signingIn ? (
                <>
                  <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Creating Account...
                </>
              ) : (
                'Create Account'
              )}
            </button>
          </form>

          {/* Back Button */}
          <button
            onClick={handleBackToMain}
            className="w-full text-center text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
          >
            ← Back to sign-in options
          </button>

          {/* Warning */}
          <div className="p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
            <p className="text-sm text-amber-700 dark:text-amber-300">
              ⚠️ <strong>Important:</strong> Remember your password! It's the only way to access your account. We cannot recover it.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Password Sign-In View (returning users)
  if (authMode === 'password') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-black">
        <div className="max-w-md w-full space-y-8 p-8">
          {/* Header */}
          <div className="text-center">
            <div className="flex justify-center mb-6">
              <div className="w-16 h-16 bg-gradient-to-br from-blue-400 to-indigo-600 rounded-2xl flex items-center justify-center">
                <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                </svg>
              </div>
            </div>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
              Welcome Back
            </h2>
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
              Enter your password to sign in
            </p>
          </div>

          {/* Password Sign-In Form */}
          <form onSubmit={handlePasswordSignIn} className="space-y-4">
            <div>
              <label htmlFor="loginPassword" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Password
              </label>
              <input
                id="loginPassword"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                required
                autoFocus
                autoComplete="current-password"
              />
            </div>

            {/* Error Display */}
            {displayError && (
              <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                <p className="text-sm text-red-600 dark:text-red-400">
                  {displayError}
                </p>
              </div>
            )}

            <button
              type="submit"
              disabled={signingIn || !password}
              className="w-full flex justify-center items-center py-4 px-6 border border-transparent text-lg font-medium rounded-xl text-white bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              {signingIn ? (
                <>
                  <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Signing In...
                </>
              ) : (
                'Sign In'
              )}
            </button>
          </form>

          {/* Back Button */}
          <button
            onClick={handleBackToMain}
            className="w-full text-center text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
          >
            ← Back to sign-in options
          </button>
        </div>
      </div>
    );
  }

  // Main View (default)
  
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-black">
      {/* Fixed header with logo like dashboard */}
      <div className="px-4 py-4">
        <img 
          src="/logos/blink-icon-light.svg" 
          alt="Blink" 
          className="h-12 w-12 dark:hidden"
        />
        <img 
          src="/logos/blink-icon-dark.svg" 
          alt="Blink" 
          className="h-12 w-12 hidden dark:block"
        />
      </div>
      
      <div className="flex items-center justify-center min-h-[calc(100vh-80px)]">
        <div className="max-w-md w-full space-y-8 p-8">
          {/* Logo */}
          <div className="text-center">
            {/* Terminal-style ASCII logo */}
            <div className="mb-8 mt-4 flex justify-center">
              {/* ASCII art text - centered */}
              <pre className="font-mono text-[13px] sm:text-base leading-tight text-purple-600 dark:text-purple-400 text-left">
{`╔╗ ╦  ╦╔╗╔╦╔═  ╔╗ ╦╔╦╗╔═╗╔═╗╦╔╗╔
╠╩╗║  ║║║║╠╩╗  ╠╩╗║ ║ ║  ║ ║║║║║
╚═╝╩═╝╩╝╚╝╩ ╩  ╚═╝╩ ╩ ╚═╝╚═╝╩╝╚╝
      ╔╦╗╔═╗╦═╗╔╦╗╦╔╗╔╔═╗╦
       ║ ║╣ ╠╦╝║║║║║║║╠═╣║
       ╩ ╚═╝╩╚═╩ ╩╩╝╚╝╩ ╩╩═╝`}
              </pre>
            </div>
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
              Sign in with your Nostr identity
            </p>
          </div>

        {/* Sign-in Methods */}
        <div className="space-y-4">
          {/* Password Sign-In (if account exists) */}
          {hasStoredAccount && (
            <>
              <button
                onClick={() => setAuthMode('password')}
                disabled={signingIn}
                className="group relative w-full flex justify-center items-center py-4 px-6 border border-transparent text-lg font-medium rounded-xl text-white bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                <svg className="w-6 h-6 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                </svg>
                Sign in with Password
              </button>
              
              {/* Divider */}
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-gray-300 dark:border-gray-700"></div>
                </div>
                <div className="relative flex justify-center text-sm">
                  <span className="px-2 bg-gray-50 dark:bg-black text-gray-500">or use another method</span>
                </div>
              </div>
            </>
          )}

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
          {!hasExtension && !isMobile && !hasStoredAccount && (
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

          {/* Divider before mobile signer - only show on Android */}
          {isAndroid && (hasExtension || hasStoredAccount) && (
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-300 dark:border-gray-700"></div>
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-2 bg-gray-50 dark:bg-black text-gray-500">or</span>
              </div>
            </div>
          )}

          {/* External Signer (Amber) - only show on Android devices */}
          {isAndroid && (
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
                  Opening Amber...
                </>
              ) : hasPendingFlow ? (
                <>
                  <svg className="animate-pulse -ml-1 mr-3 h-5 w-5" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Continue with Amber
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
          )}

          {/* Create New Account Button */}
          <button
            onClick={() => setAuthMode('create')}
            disabled={signingIn}
            className="group relative w-full flex justify-center items-center py-4 px-6 border-2 border-emerald-500 text-lg font-medium rounded-xl text-emerald-600 dark:text-emerald-400 bg-transparent hover:bg-emerald-50 dark:hover:bg-emerald-900/20 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <svg className="w-6 h-6 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
            </svg>
            Create New Account
          </button>

          {/* iOS hint - show when no extension detected */}
          {isIOS && !hasExtension && (
            <div className="text-center p-4 bg-blue-50 dark:bg-blue-900/20 rounded-xl border border-blue-200 dark:border-blue-800">
              <p className="text-sm text-blue-700 dark:text-blue-300">
                📱 On iOS, install the{' '}
                <a 
                  href="https://apps.apple.com/cy/app/nostash/id6744309333" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="font-medium underline hover:text-blue-800 dark:hover:text-blue-200"
                >
                  Nostash
                </a>
                {' '}Safari extension to sign in with your Nostr key.
              </p>
            </div>
          )}

          {/* Android hint */}
          {isAndroid && (
            <p className="text-xs text-center text-gray-500 dark:text-gray-400">
              Works with{' '}
              <a 
                href="https://github.com/greenart7c3/Amber" 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-amber-600 dark:text-amber-400 underline"
              >
                Amber
              </a>
              {' '}for secure key management
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
                <strong>Mobile signers</strong> like Amber (Android) securely manage your Nostr keys on mobile. For iOS, use the Nostash extension for Safari.
              </p>
              <p className="mt-2">
                <strong>Create New Account</strong> generates a Nostr identity protected by your password - works everywhere!
              </p>
            </div>
          </details>
        </div>
      </div>
    </div>
  </div>
  );
}

