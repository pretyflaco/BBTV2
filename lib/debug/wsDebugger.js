/**
 * WebSocket Debugger - Intercepts all WebSocket traffic for debugging
 * 
 * This monkey-patches the global WebSocket to log all:
 * - Connection opens
 * - Messages sent
 * - Messages received
 * - Errors
 * - Close events
 * 
 * Usage: Import and call installWebSocketDebugger() before any WebSocket connections
 */

let isInstalled = false;
let OriginalWebSocket = null;

/**
 * Install the WebSocket debugger
 * Should be called early in the app lifecycle, before any WebSocket connections
 */
export function installWebSocketDebugger() {
  if (typeof window === 'undefined') return;
  if (isInstalled) {
    console.log('[WSDebug] Already installed');
    return;
  }
  
  OriginalWebSocket = window.WebSocket;
  
  window.WebSocket = function(url, protocols) {
    console.log('[WSDebug] ====== NEW CONNECTION ======');
    console.log('[WSDebug] Connecting to:', url);
    console.log('[WSDebug] Protocols:', protocols);
    
    // Create the actual WebSocket
    const ws = protocols 
      ? new OriginalWebSocket(url, protocols) 
      : new OriginalWebSocket(url);
    
    // Store original send
    const originalSend = ws.send.bind(ws);
    
    // Wrap send to log outgoing messages
    ws.send = function(data) {
      const timestamp = new Date().toISOString().split('T')[1].split('.')[0];
      
      // Log the raw data
      console.log(`[WSDebug][${timestamp}] >>> SENDING to ${url}:`);
      
      if (typeof data === 'string') {
        console.log('[WSDebug] >>> Type: string, Length:', data.length);
        console.log('[WSDebug] >>> Content:', data.slice(0, 500));
        
        // Try to parse as JSON for prettier logging
        try {
          const parsed = JSON.parse(data);
          console.log('[WSDebug] >>> Parsed JSON:', JSON.stringify(parsed, null, 2).slice(0, 1000));
        } catch (e) {
          // Not JSON, that's fine
        }
        
        // Check for potential encoding issues
        const encoder = new TextEncoder();
        const bytes = encoder.encode(data);
        console.log('[WSDebug] >>> UTF-8 byte length:', bytes.length);
        console.log('[WSDebug] >>> First 20 bytes:', Array.from(bytes.slice(0, 20)).join(', '));
        
        // Check for BOM or weird characters
        if (bytes[0] === 0xEF || bytes[0] === 0xFE || bytes[0] === 0xFF) {
          console.warn('[WSDebug] >>> WARNING: Possible BOM detected!');
        }
        if (data.charCodeAt(0) === 0xFEFF) {
          console.warn('[WSDebug] >>> WARNING: BOM character at start!');
        }
        
      } else if (data instanceof ArrayBuffer) {
        console.log('[WSDebug] >>> Type: ArrayBuffer, Size:', data.byteLength);
        const view = new Uint8Array(data);
        console.log('[WSDebug] >>> First 50 bytes:', Array.from(view.slice(0, 50)).join(', '));
      } else if (data instanceof Blob) {
        console.log('[WSDebug] >>> Type: Blob, Size:', data.size);
      } else {
        console.log('[WSDebug] >>> Type:', typeof data, Object.prototype.toString.call(data));
      }
      
      // Call original send
      return originalSend(data);
    };
    
    // Log open event
    ws.addEventListener('open', (event) => {
      console.log(`[WSDebug] <<< CONNECTED to ${url}`);
      console.log('[WSDebug] <<< readyState:', ws.readyState);
      console.log('[WSDebug] <<< protocol:', ws.protocol);
    });
    
    // Log incoming messages
    ws.addEventListener('message', (event) => {
      const timestamp = new Date().toISOString().split('T')[1].split('.')[0];
      console.log(`[WSDebug][${timestamp}] <<< RECEIVED from ${url}:`);
      
      if (typeof event.data === 'string') {
        console.log('[WSDebug] <<< Type: string, Length:', event.data.length);
        console.log('[WSDebug] <<< Content:', event.data.slice(0, 500));
        
        // Try to parse as JSON
        try {
          const parsed = JSON.parse(event.data);
          console.log('[WSDebug] <<< Parsed JSON:', JSON.stringify(parsed, null, 2).slice(0, 1000));
          
          // Check for specific Nostr relay messages
          if (Array.isArray(parsed)) {
            const [type, ...rest] = parsed;
            console.log('[WSDebug] <<< Nostr message type:', type);
            
            if (type === 'NOTICE') {
              console.warn('[WSDebug] <<< RELAY NOTICE:', rest[0]);
            } else if (type === 'OK') {
              console.log('[WSDebug] <<< Event accepted:', rest[0], 'Success:', rest[1], 'Message:', rest[2]);
            } else if (type === 'EOSE') {
              console.log('[WSDebug] <<< End of stored events for subscription:', rest[0]);
            } else if (type === 'EVENT') {
              console.log('[WSDebug] <<< Event received for subscription:', rest[0]);
              if (rest[1]) {
                console.log('[WSDebug] <<< Event kind:', rest[1].kind, 'pubkey:', rest[1].pubkey?.slice(0, 16) + '...');
              }
            } else if (type === 'CLOSED') {
              console.warn('[WSDebug] <<< Subscription closed:', rest[0], 'Reason:', rest[1]);
            } else if (type === 'AUTH') {
              console.log('[WSDebug] <<< Auth challenge received');
            }
          }
        } catch (e) {
          // Not JSON
        }
      } else {
        console.log('[WSDebug] <<< Type:', typeof event.data);
      }
    });
    
    // Log errors
    ws.addEventListener('error', (event) => {
      console.error(`[WSDebug] !!! ERROR on ${url}:`, event);
      console.error('[WSDebug] !!! readyState:', ws.readyState);
    });
    
    // Log close
    ws.addEventListener('close', (event) => {
      console.log(`[WSDebug] XXX CLOSED ${url}`);
      console.log('[WSDebug] XXX Code:', event.code);
      console.log('[WSDebug] XXX Reason:', event.reason || '(no reason)');
      console.log('[WSDebug] XXX wasClean:', event.wasClean);
    });
    
    return ws;
  };
  
  // Copy static properties
  window.WebSocket.CONNECTING = OriginalWebSocket.CONNECTING;
  window.WebSocket.OPEN = OriginalWebSocket.OPEN;
  window.WebSocket.CLOSING = OriginalWebSocket.CLOSING;
  window.WebSocket.CLOSED = OriginalWebSocket.CLOSED;
  
  isInstalled = true;
  console.log('[WSDebug] WebSocket debugger installed');
}

/**
 * Uninstall the WebSocket debugger
 */
export function uninstallWebSocketDebugger() {
  if (typeof window === 'undefined') return;
  if (!isInstalled || !OriginalWebSocket) return;
  
  window.WebSocket = OriginalWebSocket;
  isInstalled = false;
  console.log('[WSDebug] WebSocket debugger uninstalled');
}

/**
 * Check if the debugger is installed
 */
export function isDebuggerInstalled() {
  return isInstalled;
}
