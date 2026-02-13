/**
 * Remote Log Receiver - Receives console logs from mobile devices
 *
 * POST /api/debug/remote-log - Receive logs
 * GET /api/debug/remote-log - SSE stream for real-time log viewing
 */

import type { NextApiRequest, NextApiResponse } from "next"

interface LogEntry {
  timestamp: string
  deviceId: string
  userAgent: string
  logs: unknown[]
}

// In-memory log buffer (last 500 logs)
const logBuffer: LogEntry[] = []
const MAX_LOGS = 500

// SSE clients
const clients = new Set<NextApiResponse>()

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (process.env.NODE_ENV === "production") {
    return res.status(404).json({ error: "Not found" })
  }

  if (req.method === "POST") {
    // Receive logs from mobile device
    try {
      const { logs, deviceId, userAgent } = req.body as {
        logs: unknown
        deviceId?: string
        userAgent?: string
      }

      const timestamp = new Date().toISOString()
      const entry = {
        timestamp,
        deviceId: deviceId || "unknown",
        userAgent: userAgent?.slice(0, 100) || "unknown",
        logs: Array.isArray(logs) ? logs : [logs],
      }

      // Add to buffer
      logBuffer.push(entry)
      if (logBuffer.length > MAX_LOGS) {
        logBuffer.shift()
      }

      // Broadcast to SSE clients
      const message = JSON.stringify(entry)
      clients.forEach((client) => {
        client.write(`data: ${message}\n\n`)
      })

      // Also log to server console for docker logs
      console.log(`[RemoteLog][${entry.deviceId}]`, entry.logs.join(" | "))

      return res.status(200).json({ received: true, count: entry.logs.length })
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unknown error"
      console.error("[RemoteLog] Error:", error)
      return res.status(500).json({ error: message })
    }
  }

  if (req.method === "GET") {
    // Check if requesting SSE stream or log dump
    const { stream, clear } = req.query as { stream?: string; clear?: string }

    if (clear === "true") {
      logBuffer.length = 0
      return res.status(200).json({ cleared: true })
    }

    if (stream === "true") {
      // SSE stream for real-time viewing
      res.setHeader("Content-Type", "text/event-stream")
      res.setHeader("Cache-Control", "no-cache")
      res.setHeader("Connection", "keep-alive")
      res.setHeader("Access-Control-Allow-Origin", "*")

      // Send existing logs first
      logBuffer.forEach((entry) => {
        res.write(`data: ${JSON.stringify(entry)}\n\n`)
      })

      // Add to clients set
      clients.add(res)

      // Keep connection alive
      const keepAlive = setInterval(() => {
        res.write(": keepalive\n\n")
      }, 30000)

      // Cleanup on close
      req.on("close", () => {
        clearInterval(keepAlive)
        clients.delete(res)
      })

      return
    }

    // Return HTML viewer
    const html = getViewerHTML()
    res.setHeader("Content-Type", "text/html")
    return res.status(200).send(html)
  }

  return res.status(405).json({ error: "Method not allowed" })
}

function getViewerHTML(): string {
  return `<!DOCTYPE html>
<html>
<head>
  <title>Remote Log Viewer</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    * { box-sizing: border-box; }
    body { 
      font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace; 
      background: #1a1a2e; 
      color: #eee; 
      margin: 0; 
      padding: 10px;
    }
    h1 { 
      color: #00d4ff; 
      margin: 0 0 10px 0;
      font-size: 18px;
    }
    .controls {
      margin-bottom: 10px;
      display: flex;
      gap: 10px;
      flex-wrap: wrap;
      align-items: center;
    }
    button {
      background: #00d4ff;
      color: #1a1a2e;
      border: none;
      padding: 8px 16px;
      cursor: pointer;
      border-radius: 4px;
      font-weight: bold;
    }
    button:hover { background: #00a8cc; }
    .status {
      padding: 8px 16px;
      border-radius: 4px;
      font-size: 12px;
    }
    .connected { background: #00ff88; color: #000; }
    .disconnected { background: #ff4444; color: #fff; }
    #filter {
      padding: 8px;
      border-radius: 4px;
      border: 1px solid #333;
      background: #0a0a1a;
      color: #fff;
      flex: 1;
      min-width: 150px;
    }
    #logs {
      background: #0a0a1a;
      border-radius: 8px;
      padding: 10px;
      height: calc(100vh - 120px);
      overflow-y: auto;
      font-size: 12px;
      line-height: 1.4;
    }
    .log-entry {
      border-bottom: 1px solid #222;
      padding: 8px 0;
    }
    .log-entry:last-child { border-bottom: none; }
    .log-time { color: #888; font-size: 10px; }
    .log-device { color: #00d4ff; font-size: 10px; margin-left: 10px; }
    .log-content { margin-top: 4px; white-space: pre-wrap; word-break: break-all; }
    .log-warn { color: #ffaa00; }
    .log-error { color: #ff4444; }
    .log-debug { color: #888; }
    .highlight { background: #444400; }
  </style>
</head>
<body>
  <h1>📱 Remote Log Viewer</h1>
  <div class="controls">
    <span id="status" class="status disconnected">Disconnected</span>
    <button onclick="clearLogs()">Clear</button>
    <button id="scrollBtn" onclick="toggleAutoScroll()">Auto-scroll: ON</button>
    <input type="text" id="filter" placeholder="Filter logs (e.g., NostrConnect)..." oninput="filterLogs()">
  </div>
  <div id="logs"></div>
  
  <script>
    let autoScroll = true;
    let allLogs = [];
    let eventSource;
    
    function connect() {
      eventSource = new EventSource('/api/debug/remote-log?stream=true');
      
      eventSource.onopen = function() {
        document.getElementById('status').textContent = 'Connected';
        document.getElementById('status').className = 'status connected';
      };
      
      eventSource.onerror = function() {
        document.getElementById('status').textContent = 'Disconnected';
        document.getElementById('status').className = 'status disconnected';
        setTimeout(connect, 3000);
      };
      
      eventSource.onmessage = function(event) {
        const entry = JSON.parse(event.data);
        allLogs.push(entry);
        if (allLogs.length > 1000) allLogs.shift();
        renderLog(entry);
      };
    }
    
    function escapeHtml(text) {
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    }
    
    function renderLog(entry) {
      const filter = document.getElementById('filter').value.toLowerCase();
      const logsDiv = document.getElementById('logs');
      
      entry.logs.forEach(function(log) {
        if (filter && !log.toLowerCase().includes(filter)) return;
        
        const div = document.createElement('div');
        div.className = 'log-entry';
        
        let logClass = '';
        if (log.includes('ERROR') || log.includes('error')) logClass = 'log-error';
        else if (log.includes('WARN') || log.includes('warn')) logClass = 'log-warn';
        else if (log.includes('DEBUG') || log.includes('debug')) logClass = 'log-debug';
        
        const time = entry.timestamp.split('T')[1].split('.')[0];
        const escapedLog = escapeHtml(log);
        
        div.innerHTML = '<span class="log-time">' + time + '</span>' +
          '<span class="log-device">' + escapeHtml(entry.deviceId) + '</span>' +
          '<div class="log-content ' + logClass + '">' + escapedLog + '</div>';
        logsDiv.appendChild(div);
      });
      
      if (autoScroll) {
        logsDiv.scrollTop = logsDiv.scrollHeight;
      }
    }
    
    function clearLogs() {
      fetch('/api/debug/remote-log?clear=true');
      document.getElementById('logs').innerHTML = '';
      allLogs = [];
    }
    
    function toggleAutoScroll() {
      autoScroll = !autoScroll;
      document.getElementById('scrollBtn').textContent = 'Auto-scroll: ' + (autoScroll ? 'ON' : 'OFF');
    }
    
    function filterLogs() {
      document.getElementById('logs').innerHTML = '';
      allLogs.forEach(renderLog);
    }
    
    connect();
  </script>
</body>
</html>`
}
