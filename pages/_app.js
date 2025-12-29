import '../styles/globals.css';
import { AuthProvider } from '../lib/hooks/useAuth';
import { NostrAuthProvider } from '../lib/hooks/useNostrAuth';
import { ProfileProvider } from '../lib/hooks/useProfile';
import { useEffect } from 'react';
import Head from 'next/head';

/**
 * BlinkPOS App - Supports dual authentication methods:
 * 
 * 1. Legacy Auth (AuthProvider): API key-based authentication
 *    - Used by existing users who signed up with Blink API key
 *    - Stored server-side with encrypted credentials
 * 
 * 2. Nostr Auth (NostrAuthProvider + ProfileProvider): Nostr-based authentication
 *    - Sign in with browser extension (keys.band, Alby) or external signer (Amber)
 *    - Credentials encrypted and stored locally (device-key encryption)
 *    - Supports multiple Blink accounts and NWC connections per profile
 * 
 * Provider Hierarchy:
 *   AuthProvider (legacy) 
 *     └── NostrAuthProvider (new)
 *           └── ProfileProvider (profile/credential management)
 *                 └── Component
 */
function MyApp({ Component, pageProps }) {
  useEffect(() => {
    // Only run on client side to prevent hydration mismatch
    if (typeof window === 'undefined') return;

    // Global error handler for WebSocket/relay connection errors
    // These are expected when internet drops and shouldn't crash the app
    const handleError = (event) => {
      const error = event.error || event.reason || event;
      const errorMessage = error?.message || String(error);
      
      // Suppress nostr relay connection errors (expected on network loss)
      if (errorMessage.includes('relay connection closed') ||
          errorMessage.includes('WebSocket') ||
          errorMessage.includes('Failed to fetch') ||
          errorMessage.includes('NetworkError') ||
          errorMessage.includes('Network request failed')) {
        console.warn('[Network] Connection error (suppressed):', errorMessage);
        event.preventDefault?.();
        return true;
      }
    };

    const handleUnhandledRejection = (event) => {
      const errorMessage = event.reason?.message || String(event.reason);
      
      // Suppress nostr relay connection errors
      if (errorMessage.includes('relay connection closed') ||
          errorMessage.includes('WebSocket') ||
          errorMessage.includes('Failed to fetch') ||
          errorMessage.includes('NetworkError') ||
          errorMessage.includes('Network request failed')) {
        console.warn('[Network] Promise rejection (suppressed):', errorMessage);
        event.preventDefault();
        return;
      }
    };

    window.addEventListener('error', handleError);
    window.addEventListener('unhandledrejection', handleUnhandledRejection);
    
    // Initialize dark mode (default to dark)
    const savedMode = localStorage.getItem('darkMode');
    const isDark = savedMode === null ? true : savedMode === 'true';
    if (isDark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    
    // Register service worker for PWA functionality (DISABLED IN DEVELOPMENT)
    // Service Workers aggressively cache files which breaks hot reload during development
    if ('serviceWorker' in navigator && process.env.NODE_ENV === 'production') {
      navigator.serviceWorker
        .register('/sw.js')
        .then((registration) => {
          console.log('Service Worker registered successfully:', registration);
        })
        .catch((error) => {
          console.log('Service Worker registration failed:', error);
        });
    } else if ('serviceWorker' in navigator && process.env.NODE_ENV === 'development') {
      // Unregister any existing service workers in development
      navigator.serviceWorker.getRegistrations().then((registrations) => {
        for (let registration of registrations) {
          registration.unregister();
          console.log('🔥 Development mode: Service Worker unregistered');
        }
        });
    }

    // Force reload for mobile browsers if this is a cached version (preserve PWA cache)
    const lastUpdate = localStorage.getItem('lastUpdate');
    const currentVersion = '2025-11-27-v5-nostr-auth'; // Update this when you deploy
    
    if (lastUpdate !== currentVersion) {
      localStorage.setItem('lastUpdate', currentVersion);
      if (lastUpdate && window.location.reload) {
        // Clear only specific non-PWA caches to preserve install functionality
        if ('caches' in window) {
          caches.keys().then(function(names) {
            for (let name of names) {
              // Don't delete the service worker cache (PWA cache)
              if (!name.includes('blink-tracker') && !name.includes('workbox')) {
                caches.delete(name);
              }
            }
          });
        }
        window.location.reload(true);
      }
    }

    // Cleanup event listeners
    return () => {
      window.removeEventListener('error', handleError);
      window.removeEventListener('unhandledrejection', handleUnhandledRejection);
    };
  }, []);

  return (
    <>
      <Head>
        <meta httpEquiv="Cache-Control" content="no-cache, no-store, must-revalidate" />
        <meta httpEquiv="Pragma" content="no-cache" />
        <meta httpEquiv="Expires" content="0" />
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
      </Head>
      {/* Legacy auth provider for existing API-key users */}
      <AuthProvider>
        {/* New Nostr auth provider for extension/signer login */}
        <NostrAuthProvider>
          {/* Profile management (Blink accounts, NWC, settings) */}
          <ProfileProvider>
            <Component {...pageProps} />
          </ProfileProvider>
        </NostrAuthProvider>
      </AuthProvider>
    </>
  );
}

export default MyApp;
