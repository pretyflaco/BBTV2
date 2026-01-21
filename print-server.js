#!/usr/bin/env node
/**
 * Local Print Server for Blink Bitcoin Terminal
 * 
 * Bridges the web app to local ESC/POS printers (Bluetooth, USB, Serial).
 * Run this on the same machine as the browser accessing the web app.
 * 
 * Usage:
 *   node print-server.js [device]
 * 
 * Examples:
 *   node print-server.js /dev/rfcomm0        # Bluetooth
 *   node print-server.js /dev/usb/lp0        # USB
 * 
 * The server listens on:
 *   - HTTP POST http://localhost:9100/print  (accepts raw ESC/POS bytes as Base64)
 *   - WebSocket ws://localhost:9100          (for real-time status updates)
 */

const http = require('http');
const fs = require('fs');
const WebSocket = require('ws');

// Configuration
const PORT = process.env.PRINT_PORT || 9100;
const DEVICE = process.argv[2] || process.env.PRINT_DEVICE || '/dev/rfcomm0';

// Track printer status
let printerStatus = {
  connected: false,
  device: DEVICE,
  lastPrint: null,
  printCount: 0,
  error: null
};

// Check if device exists
function checkDevice() {
  try {
    if (fs.existsSync(DEVICE)) {
      printerStatus.connected = true;
      printerStatus.error = null;
      return true;
    } else {
      printerStatus.connected = false;
      printerStatus.error = `Device not found: ${DEVICE}`;
      return false;
    }
  } catch (err) {
    printerStatus.connected = false;
    printerStatus.error = err.message;
    return false;
  }
}

// Print data to device
async function printToDevice(data) {
  return new Promise((resolve, reject) => {
    if (!checkDevice()) {
      reject(new Error(printerStatus.error));
      return;
    }

    try {
      fs.writeFileSync(DEVICE, data);
      printerStatus.lastPrint = new Date().toISOString();
      printerStatus.printCount++;
      printerStatus.error = null;
      resolve({ success: true, bytesWritten: data.length });
    } catch (err) {
      printerStatus.error = err.message;
      reject(err);
    }
  });
}

// Create HTTP server
const server = http.createServer(async (req, res) => {
  // CORS headers for local development
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // Health check / status endpoint
  if (req.method === 'GET' && (req.url === '/' || req.url === '/status')) {
    checkDevice();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(printerStatus, null, 2));
    return;
  }

  // Print endpoint
  if (req.method === 'POST' && req.url === '/print') {
    let body = '';
    
    req.on('data', chunk => {
      body += chunk.toString();
    });

    req.on('end', async () => {
      try {
        const json = JSON.parse(body);
        
        if (!json.data) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Missing "data" field (Base64 encoded ESC/POS bytes)' }));
          return;
        }

        // Decode Base64 to bytes
        const bytes = Buffer.from(json.data, 'base64');
        
        console.log(`[PRINT] Received ${bytes.length} bytes`);
        
        const result = await printToDevice(bytes);
        
        console.log(`[PRINT] Success - ${result.bytesWritten} bytes written to ${DEVICE}`);
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ 
          success: true, 
          bytesWritten: result.bytesWritten,
          printCount: printerStatus.printCount
        }));
        
        // Notify WebSocket clients
        broadcast({ type: 'print_success', ...result });
        
      } catch (err) {
        console.error(`[PRINT] Error:`, err.message);
        
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
        
        // Notify WebSocket clients
        broadcast({ type: 'print_error', error: err.message });
      }
    });
    return;
  }

  // 404 for unknown routes
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found' }));
});

// WebSocket server for real-time status
const wss = new WebSocket.Server({ server });

wss.on('connection', (ws) => {
  console.log('[WS] Client connected');
  
  // Send current status on connect
  checkDevice();
  ws.send(JSON.stringify({ type: 'status', ...printerStatus }));
  
  ws.on('message', (message) => {
    try {
      const msg = JSON.parse(message);
      
      if (msg.type === 'status') {
        checkDevice();
        ws.send(JSON.stringify({ type: 'status', ...printerStatus }));
      }
    } catch (err) {
      console.error('[WS] Invalid message:', err.message);
    }
  });
  
  ws.on('close', () => {
    console.log('[WS] Client disconnected');
  });
});

// Broadcast to all WebSocket clients
function broadcast(data) {
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(data));
    }
  });
}

// Start server
server.listen(PORT, () => {
  checkDevice();
  
  console.log('');
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║           Blink Bitcoin Terminal - Print Server            ║');
  console.log('╠════════════════════════════════════════════════════════════╣');
  console.log(`║  HTTP:      http://localhost:${PORT}/print                    ║`);
  console.log(`║  WebSocket: ws://localhost:${PORT}                            ║`);
  console.log(`║  Status:    http://localhost:${PORT}/status                   ║`);
  console.log('╠════════════════════════════════════════════════════════════╣');
  console.log(`║  Device:    ${DEVICE.padEnd(46)}║`);
  console.log(`║  Status:    ${(printerStatus.connected ? 'Connected' : 'Not connected').padEnd(46)}║`);
  if (printerStatus.error) {
    console.log(`║  Error:     ${printerStatus.error.slice(0, 46).padEnd(46)}║`);
  }
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log('');
  console.log('Waiting for print requests...');
  console.log('');
});

// Periodic device check
setInterval(() => {
  const wasConnected = printerStatus.connected;
  checkDevice();
  
  if (wasConnected !== printerStatus.connected) {
    console.log(`[STATUS] Printer ${printerStatus.connected ? 'connected' : 'disconnected'}`);
    broadcast({ type: 'status', ...printerStatus });
  }
}, 5000);
