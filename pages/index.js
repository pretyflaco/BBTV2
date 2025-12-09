import { useState, useCallback, useEffect, useRef } from 'react';
import { useCombinedAuth } from '../lib/hooks/useCombinedAuth';
import NostrLoginForm from '../components/auth/NostrLoginForm';
import WalletSetup from '../components/wallet/WalletSetup';
import Dashboard from '../components/Dashboard';

/**
 * Home Page - Handles authentication flow
 * 
 * Authentication States:
 * 1. Loading: Show spinner while checking auth
 * 2. Not authenticated: Show Nostr login
 * 3. Nostr auth but no wallet (Blink or NWC): Show WalletSetup
 * 4. Fully authenticated with wallet: Show Dashboard
 */
export default function Home() {
  const { 
    loading, 
    isAuthenticated, 
    authMode, 
    needsWalletSetup,
    hasNWC,
    hasBlinkAccount,
    user,
    publicKey
  } = useCombinedAuth();
  
  // Track wallet setup completion to force re-render
  // This is needed because useNWC state is per-component
  const [walletSetupComplete, setWalletSetupComplete] = useState(false);
  
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

  console.log('Home render - loading:', loading, 'authenticated:', isAuthenticated, 'authMode:', authMode, 'needsWalletSetup:', needsWalletSetup, 'hasNWC:', hasNWC, 'walletSetupComplete:', walletSetupComplete);

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-black">
        <div className="text-center">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blink-accent mx-auto"></div>
          <p className="mt-4 text-gray-600 dark:text-gray-400">Loading authentication...</p>
          <p className="mt-2 text-sm text-gray-400 dark:text-gray-500">This should only show for a few seconds</p>
        </div>
      </div>
    );
  }

  // Not authenticated - show Nostr login
  if (!isAuthenticated) {
    return <NostrLoginForm />;
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
