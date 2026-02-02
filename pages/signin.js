import { useEffect } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import Script from 'next/script';
import NostrLoginForm from '../components/auth/NostrLoginForm';
import { useCombinedAuth } from '../lib/hooks/useCombinedAuth';
import { installWebSocketDebugger } from '../lib/debug/wsDebugger';

/**
 * Sign In Page - Dedicated Nostr authentication
 * 
 * URL: /signin
 * 
 * Features:
 * - Renders NostrLoginForm for Nostr authentication
 * - Redirects authenticated users to /
 * - Shows "Back to Public POS" link for users who changed their mind
 * - Accepts optional ?redirect= query param for post-auth navigation
 */
export default function SignIn() {
  const router = useRouter();
  const { loading, isAuthenticated } = useCombinedAuth();
  const { redirect } = router.query;

  // Redirect authenticated users away from sign-in page
  useEffect(() => {
    if (!loading && isAuthenticated) {
      // Use redirect param if provided, otherwise go to home
      const destination = redirect && typeof redirect === 'string' ? redirect : '/';
      router.replace(destination);
    }
  }, [loading, isAuthenticated, redirect, router]);

  // Show loading while checking auth or redirecting
  if (loading || isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-black">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-amber-500 border-t-transparent"></div>
      </div>
    );
  }

  return (
    <>
      <Head>
        <title>Sign In | Blink Bitcoin Terminal</title>
        <meta name="description" content="Sign in to Blink Bitcoin Terminal with Nostr" />
        <meta name="theme-color" content="#000000" />
        <link rel="icon" href="/icons/icon-ios-192x192.png" />
        <link rel="apple-touch-icon" href="/icons/icon-ios-192x192.png" />
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
      </Head>

      {/* WebSocket debugger - MUST run before any WebSocket connections */}
      <Script id="ws-debugger-init" strategy="beforeInteractive">
        {`
          (function() {
            // Only install on mobile for debugging
            var ua = navigator.userAgent;
            var isMobile = /iPad|iPhone|iPod|Android/.test(ua);
            if (!isMobile) return;
            
            console.log('[WSDebug] v41: Installing WebSocket debugger inline...');
            
            var OriginalWebSocket = window.WebSocket;
            
            window.WebSocket = function(url, protocols) {
              console.log('[WSDebug] ====== NEW CONNECTION ======');
              console.log('[WSDebug] URL:', url);
              
              var ws = protocols 
                ? new OriginalWebSocket(url, protocols) 
                : new OriginalWebSocket(url);
              
              var originalSend = ws.send.bind(ws);
              
              ws.send = function(data) {
                console.log('[WSDebug] >>> SENDING to ' + url.substring(0, 30) + '...');
                
                if (typeof data === 'string') {
                  console.log('[WSDebug] >>> String length:', data.length);
                  console.log('[WSDebug] >>> Content:', data.substring(0, 300));
                  
                  // Check for encoding issues
                  if (data.charCodeAt(0) === 0xFEFF) {
                    console.warn('[WSDebug] >>> WARNING: BOM at start!');
                  }
                  if (data.length === 0) {
                    console.error('[WSDebug] >>> ERROR: Empty string being sent!');
                  }
                  
                  // Log first few character codes
                  var codes = [];
                  for (var i = 0; i < Math.min(20, data.length); i++) {
                    codes.push(data.charCodeAt(i));
                  }
                  console.log('[WSDebug] >>> First 20 char codes:', codes.join(','));
                }
                
                return originalSend(data);
              };
              
              ws.addEventListener('open', function() {
                console.log('[WSDebug] <<< CONNECTED to ' + url);
              });
              
              ws.addEventListener('message', function(event) {
                console.log('[WSDebug] <<< RECEIVED from ' + url.substring(0, 30) + '...');
                if (typeof event.data === 'string') {
                  console.log('[WSDebug] <<< Length:', event.data.length);
                  console.log('[WSDebug] <<< Content:', event.data.substring(0, 300));
                  
                  // Check for NOTICE messages (relay errors)
                  if (event.data.indexOf('NOTICE') !== -1) {
                    console.warn('[WSDebug] <<< RELAY NOTICE DETECTED');
                  }
                  // Check for invalid secret
                  if (event.data.indexOf('invalid') !== -1) {
                    console.error('[WSDebug] <<< INVALID RESPONSE DETECTED');
                  }
                }
              });
              
              ws.addEventListener('error', function(event) {
                console.error('[WSDebug] !!! ERROR on ' + url);
              });
              
              ws.addEventListener('close', function(event) {
                console.log('[WSDebug] XXX CLOSED ' + url + ' code=' + event.code + ' reason=' + (event.reason || 'none'));
              });
              
              return ws;
            };
            
            window.WebSocket.CONNECTING = OriginalWebSocket.CONNECTING;
            window.WebSocket.OPEN = OriginalWebSocket.OPEN;
            window.WebSocket.CLOSING = OriginalWebSocket.CLOSING;
            window.WebSocket.CLOSED = OriginalWebSocket.CLOSED;
            
            console.log('[WSDebug] v41: WebSocket debugger installed!');
          })();
        `}
      </Script>

      {/* Inline remote logger - runs immediately before React hydration */}
      <Script id="remote-logger-init" strategy="beforeInteractive">
        {`
          (function() {
            // Only run on mobile
            var ua = navigator.userAgent;
            var isMobile = /iPad|iPhone|iPod|Android/.test(ua);
            if (!isMobile) return;
            
            // Generate device ID
            var platform = 'unknown';
            if (/iPad|iPhone|iPod/.test(ua)) {
              if (/CriOS/.test(ua)) platform = 'ios-chrome';
              else if (/FxiOS/.test(ua)) platform = 'ios-firefox';
              else platform = 'ios-safari';
            } else if (/Android/.test(ua)) {
              platform = 'android-chrome';
            }
            var deviceId = platform + '-' + Math.random().toString(36).substr(2, 6);
            
            // Send immediate beacon
            try {
              var data = JSON.stringify({
                logs: ['[IMMEDIATE] RemoteLogger INIT - device: ' + deviceId + ', UA: ' + ua.substring(0,80)],
                deviceId: deviceId,
                userAgent: ua
              });
              
              // Try sendBeacon first (most reliable on iOS)
              if (navigator.sendBeacon) {
                navigator.sendBeacon('/api/debug/remote-log', new Blob([data], {type: 'application/json'}));
              }
              
              // Also try fetch as backup
              fetch('/api/debug/remote-log', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: data,
                keepalive: true
              }).catch(function(){});
              
            } catch(e) {
              // Silent fail
            }
          })();
        `}
      </Script>

      <div className="min-h-screen bg-gray-50 dark:bg-black">
        {/* Nostr Login Form */}
        <NostrLoginForm />
        
        {/* Back to Public POS Link */}
        <div className="fixed bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-gray-50 dark:from-black to-transparent">
          <div className="max-w-md mx-auto text-center">
            <a
              href="/setuppwa"
              className="inline-flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 hover:text-amber-500 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
              Back to Public POS
            </a>
          </div>
        </div>
      </div>
    </>
  );
}
