import '../public/css/globals.css';
import { AuthProvider } from '../lib/hooks/useAuth';
import { useEffect } from 'react';
import Head from 'next/head';

function MyApp({ Component, pageProps }) {
  useEffect(() => {
    // Only run on client side to prevent hydration mismatch
    if (typeof window === 'undefined') return;
    
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
    const currentVersion = '2025-09-16-v4-pwa-restored'; // Update this when you deploy
    
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
  }, []);

  return (
    <>
      <Head>
        <meta httpEquiv="Cache-Control" content="no-cache, no-store, must-revalidate" />
        <meta httpEquiv="Pragma" content="no-cache" />
        <meta httpEquiv="Expires" content="0" />
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
      </Head>
      <AuthProvider>
        <Component {...pageProps} />
      </AuthProvider>
    </>
  );
}

export default MyApp;
