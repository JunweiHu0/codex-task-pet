'use strict';
/*
 * send-signal.js — shared, dependency-free sender for the SuperNoNo unified
 * signal protocol (see docs/supernono-signal-protocol.md).
 *
 * Any local agent adapter can require() this to drive the pet by POSTing a
 * protocol envelope to the SuperNoNo local bridge (Milestone 1). It uses only
 * Node's built-in `http`, adds no dependencies, and NEVER throws: if the pet
 * isn't running (or anything else fails) the send resolves silently so the
 * calling agent is never blocked or crashed.
 *
 * It only relays STATE. A `command` field is descriptive text for the pet UI;
 * this sender never executes it.
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
 *
 * @param {object} event
 * @param {string} event.type        required protocol event type (e.g. 'file_reading')
 * @param {string} [event.agent]     default 'codex'
 * @param {string} [event.adapter]   default 'codex-desktop'
 * @param {string} [event.sessionId]
 * @param {string} [event.taskId]
 * @param {object} [event.payload]   event-specific data (file names / command text / summary)
 * @param {object} [options]
 * @param {string} [options.host]      default 127.0.0.1
 * @param {number} [options.port]      default SUPERNONO_BRIDGE_PORT or 4174
 * @param {number} [options.timeoutMs] default 800
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
