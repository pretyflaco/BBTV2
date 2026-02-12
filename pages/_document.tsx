import { Html, Head, Main, NextScript } from "next/document"

export default function Document() {
  return (
    <Html>
      <Head>
        {/* WebSocket debugger - runs BEFORE any JS */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
          (function() {
            try {
              var ua = navigator.userAgent;
              var isMobile = /iPad|iPhone|iPod|Android/.test(ua);
              if (!isMobile) return;
              
              var platform = /iPad|iPhone|iPod/.test(ua) ? 'ios' : 'android';
              var wsDeviceId = 'ws-' + platform + '-' + Math.random().toString(36).substr(2, 6);
              
              function sendSync(msg) {
                try {
                  var xhr = new XMLHttpRequest();
                  xhr.open('POST', '/api/debug/remote-log', false);
                  xhr.setRequestHeader('Content-Type', 'application/json');
                  xhr.send(JSON.stringify({ logs: [msg], deviceId: wsDeviceId, userAgent: ua }));
                } catch(e) {}
              }
              
              sendSync('[WSDebug] v44: _document script running!');
              
              var logQueue = [];
              function flushLogs() {
                if (logQueue.length === 0) return;
                var data = JSON.stringify({ logs: logQueue.splice(0, 50), deviceId: wsDeviceId, userAgent: ua });
                if (navigator.sendBeacon) navigator.sendBeacon('/api/debug/remote-log', new Blob([data], {type: 'application/json'}));
              }
              function wsLog(msg) {
                console.log(msg);
                logQueue.push('[LOG] ' + msg);
                setTimeout(flushLogs, 50);
              }
              
              var OrigWS = window.WebSocket;
              if (!OrigWS) { sendSync('[WSDebug] ERROR: no WebSocket!'); return; }
              
              window.WebSocket = function(url, protocols) {
                wsLog('[WSDebug] NEW WS: ' + url);
                var ws = protocols ? new OrigWS(url, protocols) : new OrigWS(url);
                var origSend = ws.send.bind(ws);
                
                ws.send = function(data) {
                  wsLog('[WSDebug] >>> SEND ' + url.substring(0,30));
                  if (typeof data === 'string') {
                    wsLog('[WSDebug] >>> len=' + data.length + ' data=' + data.substring(0, 300));
                    var codes = [];
                    for (var i = 0; i < Math.min(40, data.length); i++) codes.push(data.charCodeAt(i));
                    wsLog('[WSDebug] >>> codes: ' + codes.join(','));
                  }
                  return origSend(data);
                };
                
                ws.addEventListener('open', function() { wsLog('[WSDebug] <<< OPEN ' + url); });
                ws.addEventListener('message', function(e) {
                  wsLog('[WSDebug] <<< RECV ' + url.substring(0,30));
                  if (typeof e.data === 'string') wsLog('[WSDebug] <<< data=' + e.data.substring(0, 300));
                });
                ws.addEventListener('error', function() { wsLog('[WSDebug] !!! ERR ' + url); });
                ws.addEventListener('close', function(e) { wsLog('[WSDebug] XXX CLOSE ' + url + ' code=' + e.code); });
                
                return ws;
              };
              window.WebSocket.CONNECTING = OrigWS.CONNECTING;
              window.WebSocket.OPEN = OrigWS.OPEN;
              window.WebSocket.CLOSING = OrigWS.CLOSING;
              window.WebSocket.CLOSED = OrigWS.CLOSED;
              
              sendSync('[WSDebug] v44: WebSocket patched!');
            } catch(err) {
              try {
                var xhr = new XMLHttpRequest();
                xhr.open('POST', '/api/debug/remote-log', false);
                xhr.setRequestHeader('Content-Type', 'application/json');
                xhr.send(JSON.stringify({ logs: ['[WSDebug] FATAL: ' + err], deviceId: 'ws-error', userAgent: navigator.userAgent }));
              } catch(e) {}
            }
          })();
        `,
          }}
        />

        {/* Google Fonts - Source Sans Pro */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter+Tight:wght@400;500;600;700&family=Source+Sans+Pro:wght@400;600&display=swap"
          rel="stylesheet"
        />

        {/* PWA Manifest */}
        <link rel="manifest" href="/manifest.json" />

        {/* PWA Meta Tags */}
        <meta name="application-name" content="Blink POS" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="Blink POS" />
        <meta name="format-detection" content="telephone=no" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="theme-color" content="#f59e0b" />

        {/* Prevent password managers from auto-triggering */}
        <meta name="password" content="false" />
        <meta name="1password-ignore" content="all" />

        {/* Favicon and Apple Touch Icons */}
        <link rel="icon" href="/favicon.ico" sizes="any" />
        <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
        <link
          rel="icon"
          type="image/png"
          sizes="192x192"
          href="/icons/icon-ios-192x192.png"
        />
        <link rel="apple-touch-icon" href="/icons/icon-ios-152x152.png" />
        <link rel="apple-touch-icon" sizes="180x180" href="/icons/icon-ios-192x192.png" />

        {/* Apple Splash Screens */}
        <meta name="apple-mobile-web-app-capable" content="yes" />

        {/* Microsoft Tiles */}
        <meta name="msapplication-TileColor" content="#f59e0b" />
        <meta name="msapplication-TileImage" content="/icons/icon-ios-144x144.png" />
        <meta name="msapplication-config" content="/browserconfig.xml" />
      </Head>
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  )
}
