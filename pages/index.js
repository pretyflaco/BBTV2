import { useCombinedAuth } from '../lib/hooks/useCombinedAuth';
import NostrLoginForm from '../components/auth/NostrLoginForm';
import BlinkAccountSetup from '../components/auth/BlinkAccountSetup';
import Dashboard from '../components/Dashboard';

/**
 * Home Page - Handles authentication flow
 * 
 * Authentication States:
 * 1. Loading: Show spinner while checking auth
 * 2. Not authenticated: Show Nostr login
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

  // Not authenticated - show Nostr login
  if (!isAuthenticated) {
    return <NostrLoginForm />;
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
