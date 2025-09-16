import '../public/css/globals.css';
import { AuthProvider } from '../lib/hooks/useAuth';
import { useEffect } from 'react';
import Head from 'next/head';

function MyApp({ Component, pageProps }) {
  useEffect(() => {
    // Force cache refresh on mobile browsers
    const timestamp = Date.now();
    
    // Clear any existing caches
    if ('caches' in window) {
      caches.keys().then(function(names) {
        for (let name of names) {
          caches.delete(name);
        }
      });
    }

    // Register service worker for PWA functionality with cache busting
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker
        .register(`/sw.js?v=${timestamp}`)
        .then((registration) => {
          console.log('Service Worker registered successfully:', registration);
          // Force update if there's an existing service worker
          registration.update();
        })
        .catch((error) => {
          console.log('Service Worker registration failed:', error);
        });
    }

    // Force reload for mobile browsers if this is a cached version
    const lastUpdate = localStorage.getItem('lastUpdate');
    const currentVersion = '2025-09-16-v2'; // Update this when you deploy
    
    if (lastUpdate !== currentVersion) {
      localStorage.setItem('lastUpdate', currentVersion);
      if (lastUpdate && window.location.reload) {
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
