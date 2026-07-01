'use strict';
/*
 * send-signal.js — self-contained, dependency-free sender for the SuperNoNo
 * unified signal protocol, VENDORED into this plugin on purpose.
 *
 * Why vendored: when Codex installs the plugin it copies this folder into its
 * cache (…/.codex/plugins/cache/<marketplace>/<plugin>/<version>/hooks) and runs
 * the hooks from there. The repo's adapters/shared/send-signal.js is NOT present
 * in that cache, so the hooks must not require() up out of the plugin. This file
 * keeps the plugin self-contained; keep it in sync with
 * adapters/shared/send-signal.js.
 *
 * Uses only Node's built-in `http`, adds no dependencies, and NEVER throws: if
 * the pet isn't running (or anything else fails) the send resolves silently so
 * Codex is never blocked. It only relays STATE; a `command` field is descriptive
 * text for the pet UI and is never executed.
 */
const http = require('http');

const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_PORT = Number(process.env.SUPERNONO_BRIDGE_PORT || 4174);
const DEFAULT_AGENT = 'codex';
const DEFAULT_ADAPTER = 'codex-desktop';
const DEFAULT_TIMEOUT_MS = 800;

/**
 * Send one protocol event to the SuperNoNo bridge.
 * Always resolves to { ok, status?, error? }; never rejects, never throws.
 * @param {object} event   { type, agent?, adapter?, sessionId?, taskId?, payload? }
 * @param {object} [options] { host?, port?, timeoutMs? }
 * @returns {Promise<{ok:boolean,status?:number,error?:string}>}
 */
function sendSignal(event, options) {
  return new Promise((resolve) => {
    try {
      event = event || {};
      options = options || {};

      const type = typeof event.type === 'string' ? event.type.trim() : '';
      if (!type) { resolve({ ok: false, error: 'missing type' }); return; }

      const envelope = {
        type,
        agent: event.agent || DEFAULT_AGENT,
        adapter: event.adapter || DEFAULT_ADAPTER,
        sessionId: event.sessionId || null,
        taskId: event.taskId || null,
        payload: (event.payload && typeof event.payload === 'object') ? event.payload : {},
      };

      const data = Buffer.from(JSON.stringify(envelope));
      const req = http.request(
        {
          host: options.host || DEFAULT_HOST,
          port: Number(options.port || DEFAULT_PORT),
          path: '/signal',
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Content-Length': data.length },
          timeout: Number(options.timeoutMs || DEFAULT_TIMEOUT_MS),
        },
        (res) => {
          res.resume(); // drain the response so the socket can close
          resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode });
        }
      );

      // Pet not running / timeout / any transport error -> resolve silently.
      req.on('error', (err) => resolve({ ok: false, error: (err && err.message) || 'request error' }));
      req.on('timeout', () => { req.destroy(); resolve({ ok: false, error: 'timeout' }); });

      req.write(data);
      req.end();
    } catch (err) {
      resolve({ ok: false, error: (err && err.message) || 'send failed' });
    }
  });
}

module.exports = { sendSignal, DEFAULT_PORT, DEFAULT_AGENT, DEFAULT_ADAPTER };
