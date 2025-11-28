import { useState, useEffect } from 'react';
import { useCombinedAuth } from '../lib/hooks/useCombinedAuth';
import LoginForm from '../components/LoginForm';
import NostrLoginForm from '../components/auth/NostrLoginForm';
import BlinkAccountSetup from '../components/auth/BlinkAccountSetup';
import Dashboard from '../components/Dashboard';

/**
 * Home Page - Handles authentication flow
 * 
 * Authentication States:
 * 1. Loading: Show spinner while checking auth
 * 2. Not authenticated: Show login options
 *    - New users: NostrLoginForm (default)
 *    - Legacy option: API key LoginForm
 * 3. Nostr auth but no Blink: Show BlinkAccountSetup
 * 4. Fully authenticated: Show Dashboard
 */
export default function Home() {
  const { 
    loading, 
    isAuthenticated, 
    authMode, 
    needsBlinkSetup,
    user 
  } = useCombinedAuth();

  // Track which login view to show (nostr vs legacy)
  const [loginView, setLoginView] = useState('nostr');

  console.log('Home render - loading:', loading, 'authenticated:', isAuthenticated, 'authMode:', authMode, 'needsBlinkSetup:', needsBlinkSetup);

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

  // Not authenticated - show login form
  if (!isAuthenticated) {
    if (loginView === 'legacy') {
      return (
        <div>
          <LoginForm />
          <div className="fixed bottom-4 left-0 right-0 text-center">
            <button 
              onClick={() => setLoginView('nostr')}
              className="text-sm text-gray-500 dark:text-gray-400 hover:text-blink-accent dark:hover:text-blink-accent underline"
            >
              ← Sign in with Nostr instead
            </button>
          </div>
        </div>
      );
    }

    // Default: Nostr login with option to switch to legacy
    return (
      <div>
        <NostrLoginForm />
        <div className="fixed bottom-4 left-0 right-0 text-center">
          <button 
            onClick={() => setLoginView('legacy')}
            className="text-sm text-gray-500 dark:text-gray-400 hover:text-blink-accent dark:hover:text-blink-accent underline"
          >
            Sign in with API key instead →
          </button>
        </div>
      </div>
    );
  }

  // Nostr authenticated but needs Blink account setup
  if (needsBlinkSetup) {
    return (
      <BlinkAccountSetup 
        onComplete={() => {
          // Profile will be updated automatically via ProfileProvider
          console.log('Blink account added successfully');
        }}
        onSkip={() => {
          // Allow skipping - user can add later from settings
          console.log('User skipped Blink account setup');
        }}
      />
    );
  }

  // Fully authenticated - show dashboard
  return <Dashboard />;
}
