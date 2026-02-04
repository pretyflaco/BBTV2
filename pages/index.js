import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/router';
import { useCombinedAuth } from '../lib/hooks/useCombinedAuth';
import WalletSetup from '../components/wallet/WalletSetup';
import Dashboard from '../components/Dashboard';
import SessionEstablishmentModal from '../components/auth/SessionEstablishmentModal';

/**
 * Home Page - Smart router based on authentication state
 * 
 * Authentication States:
 * 1. Loading: Show spinner while checking auth
 * 2. Not authenticated: Redirect to /signin
 * 3. Nostr auth but no wallet (Blink or NWC): Show WalletSetup
 * 4. Fully authenticated with wallet: Show Dashboard
 * 
 * User Journey:
 * - Unauthenticated users (including after logout) are redirected to /signin
 * - From /signin users can choose to use Public POS (/setuppwa) or sign in
 * - Authenticated users see Dashboard or WalletSetup
 */
export default function Home() {
  const router = useRouter();
  const { 
    loading, 
    isAuthenticated, 
    authMode, 
    needsWalletSetup,
    hasNWC,
    hasBlinkAccount,
    user,
    publicKey,
    hasServerSession,
    establishServerSession,
    logout,
    _nostr
  } = useCombinedAuth();
  
  // Track wallet setup completion to force re-render
  // This is needed because useNWC state is per-component
  const [walletSetupComplete, setWalletSetupComplete] = useState(false);
  
  // Track if we're redirecting to prevent flash
  const [redirecting, setRedirecting] = useState(false);
  
  // Track the previous user to detect user changes
  const prevUserRef = useRef(publicKey);
  
  // Reset walletSetupComplete when user changes (including logout/login)
  useEffect(() => {
    if (prevUserRef.current !== publicKey) {
      console.log('[Home] User changed from', prevUserRef.current?.slice(0, 8), 'to', publicKey?.slice(0, 8), '- resetting walletSetupComplete');
      setWalletSetupComplete(false);
      prevUserRef.current = publicKey;
    }
  }, [publicKey]);

  // Redirect unauthenticated users to /signin
  useEffect(() => {
    if (!loading && !isAuthenticated) {
      console.log('[Home] Not authenticated - redirecting to /signin');
      setRedirecting(true);
      router.replace('/signin');
    }
  }, [loading, isAuthenticated, router]);

  console.log('Home render - loading:', loading, 'authenticated:', isAuthenticated, 'authMode:', authMode, 'needsWalletSetup:', needsWalletSetup, 'hasNWC:', hasNWC, 'walletSetupComplete:', walletSetupComplete, 'hasServerSession:', hasServerSession);

  // Loading state or redirecting
  if (loading || redirecting || !isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-black">
        <div className="text-center">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blink-accent mx-auto"></div>
          <p className="mt-4 text-gray-600 dark:text-gray-400">
            {loading ? 'Loading authentication...' : 'Redirecting...'}
          </p>
        </div>
      </div>
    );
  }

  // Nostr authenticated but server session not yet established
  // This prevents the "partial sign-in" race condition where Dashboard
  // fetches data before NIP-98 session cookie is set (causing 401 errors)
  // Only applies to Nostr auth - legacy auth doesn't need NIP-98 session
  if (authMode === 'nostr' && !hasServerSession) {
    console.log('[Home] Nostr auth but no server session yet - showing session modal');
    return (
      <SessionEstablishmentModal
        hasServerSession={hasServerSession}
        signInMethod={_nostr?.method || 'extension'}
        onRetry={() => {
          // Trigger NIP-98 login retry
          console.log('[Home] Retrying session establishment...');
          establishServerSession?.();
        }}
        onCancel={() => {
          // Sign out and redirect to signin
          console.log('[Home] User cancelled - signing out');
          logout();
        }}
      />
    );
  }

  // Nostr authenticated but needs wallet setup (Blink OR NWC)
  // Check both needsWalletSetup AND !walletSetupComplete to handle state update race condition
  if (needsWalletSetup && !walletSetupComplete) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-black p-4">
        <WalletSetup 
          onComplete={(result) => {
            console.log('Wallet added successfully:', result.type);
            // Force re-render to show Dashboard
            setWalletSetupComplete(true);
          }}
          onSkip={() => {
            // Allow skipping - user can add later from settings
            console.log('User skipped wallet setup');
            setWalletSetupComplete(true);
          }}
        />
      </div>
    );
  }

  // Fully authenticated with wallet - show dashboard
  return <Dashboard />;
}
