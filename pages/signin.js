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
            try {
              // Only install on mobile for debugging
              var ua = navigator.userAgent;
              var isMobile = /iPad|iPhone|iPod|Android/.test(ua);
              if (!isMobile) return;
              
              // Generate device ID for this session
              var platform = /iPad|iPhone|iPod/.test(ua) ? 'ios' : 'android';
              var wsDeviceId = 'ws-' + platform + '-' + Math.random().toString(36).substr(2, 6);
              
              // IMMEDIATE sync send on init - use XHR which is more reliable
              function sendImmediate(msg) {
                try {
                  var xhr = new XMLHttpRequest();
                  xhr.open('POST', '/api/debug/remote-log', false); // SYNC request
                  xhr.setRequestHeader('Content-Type', 'application/json');
                  xhr.send(JSON.stringify({
                    logs: [msg],
                    deviceId: wsDeviceId,
                    userAgent: ua
                  }));
                } catch(e) {}
              }
              
              sendImmediate('[WSDebug] v43: Script starting execution...');
              
              // Async log sender for later
              var logQueue = [];
              var sendTimeout = null;
              
              function sendLogsAsync() {
                if (logQueue.length === 0) return;
                var logs = logQueue.splice(0, 50);
                var data = JSON.stringify({
                  logs: logs,
                  deviceId: wsDeviceId,
                  userAgent: ua
                });
                
                if (navigator.sendBeacon) {
                  navigator.sendBeacon('/api/debug/remote-log', new Blob([data], {type: 'application/json'}));
                }
                fetch('/api/debug/remote-log', {
                  method: 'POST',
                  headers: {'Content-Type': 'application/json'},
                  body: data,
                  keepalive: true
                }).catch(function(){});
              }
              
              function wsLog(msg) {
                console.log(msg);
                logQueue.push('[LOG] ' + msg);
                if (!sendTimeout) {
                  sendTimeout = setTimeout(function() {
                    sendTimeout = null;
                    sendLogsAsync();
                  }, 100);
                }
              }
              
              sendImmediate('[WSDebug] v43: About to patch WebSocket...');
              
              var OriginalWebSocket = window.WebSocket;
              if (!OriginalWebSocket) {
                sendImmediate('[WSDebug] ERROR: window.WebSocket is undefined!');
                return;
              }
              
              window.WebSocket = function(url, protocols) {
                wsLog('[WSDebug] ====== NEW CONNECTION ======');
                wsLog('[WSDebug] URL: ' + url);
                
                var ws = protocols 
                  ? new OriginalWebSocket(url, protocols) 
                  : new OriginalWebSocket(url);
                
                var originalSend = ws.send.bind(ws);
                
                ws.send = function(data) {
                  wsLog('[WSDebug] >>> SEND to ' + url.substring(0, 35));
                  
                  if (typeof data === 'string') {
                    wsLog('[WSDebug] >>> len=' + data.length + ' data=' + data.substring(0, 400));
                    
                    // Log character codes for encoding debugging
                    var codes = [];
                    for (var i = 0; i < Math.min(50, data.length); i++) {
                      codes.push(data.charCodeAt(i));
                    }
                    wsLog('[WSDebug] >>> charCodes: ' + codes.join(','));
                    
                    if (data.charCodeAt(0) === 0xFEFF) {
                      wsLog('[WSDebug] >>> WARNING: BOM DETECTED!');
                    }
                    if (data.length === 0) {
                      wsLog('[WSDebug] >>> ERROR: EMPTY STRING!');
                    }
                  }
                  
                  return originalSend(data);
                };
                
                ws.addEventListener('open', function() {
                  wsLog('[WSDebug] <<< CONNECTED ' + url);
                });
                
                ws.addEventListener('message', function(event) {
                  wsLog('[WSDebug] <<< RECV from ' + url.substring(0, 35));
                  if (typeof event.data === 'string') {
                    wsLog('[WSDebug] <<< len=' + event.data.length + ' data=' + event.data.substring(0, 400));
                  }
                });
                
                ws.addEventListener('error', function() {
                  wsLog('[WSDebug] !!! ERROR ' + url);
                });
                
                ws.addEventListener('close', function(event) {
                  wsLog('[WSDebug] XXX CLOSE ' + url + ' code=' + event.code);
                });
                
                return ws;
              };
              
              window.WebSocket.CONNECTING = OriginalWebSocket.CONNECTING;
              window.WebSocket.OPEN = OriginalWebSocket.OPEN;
              window.WebSocket.CLOSING = OriginalWebSocket.CLOSING;
              window.WebSocket.CLOSED = OriginalWebSocket.CLOSED;
              
              sendImmediate('[WSDebug] v43: WebSocket patched successfully!');
              
            } catch(err) {
              // Try to report the error
              try {
                var xhr = new XMLHttpRequest();
                xhr.open('POST', '/api/debug/remote-log', false);
                xhr.setRequestHeader('Content-Type', 'application/json');
                xhr.send(JSON.stringify({
                  logs: ['[WSDebug] FATAL ERROR: ' + (err.message || err)],
                  deviceId: 'ws-error',
                  userAgent: navigator.userAgent
                }));
              } catch(e) {}
            }
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
