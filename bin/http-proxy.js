#!/usr/bin/env node
// bin/http-proxy.js
// Simple proxy that forwards MCP JSON‑RPC requests received on stdin
// to the local HTTP server (src/server.ts) and writes the HTTP response
// back to stdout, allowing MCP clients to use the HTTP endpoint.

import { stdout, stderr, stdin } from 'node:process';

let payload = '';
stdin.setEncoding('utf8');
stdin.on('data', chunk => (payload += chunk));
stdin.on('end', async () => {
  try {
    const port = process.env.MCP_HTTP_PORT || '3000';
    const url = `http://localhost:${port}/optimize`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: payload,
    });
    const body = await response.text();
    stdout.write(body);
  } catch (e) {
    stderr.write(`http-proxy error: ${e}\n`);
    process.exit(1);
  }
});
