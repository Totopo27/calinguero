// NOTICE: Modified for the Calinguero project in 2026.
/**
 * Shared LAN HTTP server for phone setup and M3U uploads. The Luna registration
 * entry point lives in index.ts; lan/service.ts passes the resolved data
 * directory and fans change events out over Luna.
 */

import * as http from 'http';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { randomBytes } from 'crypto';
import {
  bufferFrom,
  isSafeInteger,
  padStart,
  parseUrl,
  secureRandomInt,
} from '../compat';
import {
  parseSetupAction,
  SetupActionStore,
} from '../setup/actions';
import { parseSetupState, SetupStateStore } from '../setup/state';
import { isValidUploadId, UploadStore } from '../upload/store';
import { createLogger } from '../logger';

const log = createLogger('lan');
const uploadLog = createLogger('upload');

export type ServiceChangeEvent = 'uploads-changed' | 'setup-changed';

export interface LanServerOptions {
  allowNullOrigin?: boolean;
}

const PAIRING_MAX_FAILURES = 5;
const PAIRING_LOCK_MS = 60 * 1000;
const LOCAL_CONTROL_ORIGIN = /^https?:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::\d{1,5})?$/i;

function getLanIp(): string {
  const ifaces = os.networkInterfaces();
  for (const name of Object.keys(ifaces)) {
    for (const ni of ifaces[name] || []) {
      if (ni.family === 'IPv4' && !ni.internal) return ni.address;
    }
  }
  return 'localhost';
}

function isLocalInterfaceAddress(hostname: string): boolean {
  if (hostname === '127.0.0.1' || hostname === 'localhost' || hostname === '::1') return true;
  const ifaces = os.networkInterfaces();
  const names = Object.keys(ifaces);
  for (let i = 0; i < names.length; i++) {
    const list = ifaces[names[i]] || [];
    for (let j = 0; j < list.length; j++) {
      const addr = String(list[j].address || '').toLowerCase().replace(/%.*$/, '');
      if (addr && addr === hostname) return true;
    }
  }
  return false;
}

function validateHostHeader(
  rawHost: unknown,
  boundPort: number,
): { allowed: boolean; normalizedHost: string } {
  if (typeof rawHost !== 'string' || !rawHost || /[\0-\x20\x7f]/.test(rawHost)) {
    return { allowed: false, normalizedHost: '' };
  }
  let hostname = '';
  let portPart: string | null = null;
  if (rawHost.charAt(0) === '[') {
    const close = rawHost.indexOf(']');
    if (close <= 1) return { allowed: false, normalizedHost: '' };
    hostname = rawHost.slice(1, close).toLowerCase();
    const rest = rawHost.slice(close + 1);
    if (rest) {
      if (rest.charAt(0) !== ':' || rest.length < 2) {
        return { allowed: false, normalizedHost: '' };
      }
      portPart = rest.slice(1);
    }
  } else {
    const colon = rawHost.indexOf(':');
    if (colon >= 0) {
      if (rawHost.indexOf(':', colon + 1) >= 0 || colon === 0 || colon === rawHost.length - 1) {
        return { allowed: false, normalizedHost: '' };
      }
      hostname = rawHost.slice(0, colon).toLowerCase();
      portPart = rawHost.slice(colon + 1);
    } else {
      hostname = rawHost.toLowerCase();
    }
  }
  if (portPart !== null) {
    if (!/^\d+$/.test(portPart) || Number(portPart) !== boundPort) {
      return { allowed: false, normalizedHost: '' };
    }
  } else if (boundPort !== 80) {
    return { allowed: false, normalizedHost: '' };
  }
  if (!isLocalInterfaceAddress(hostname)) {
    return { allowed: false, normalizedHost: '' };
  }
  return { allowed: true, normalizedHost: rawHost.toLowerCase() };
}

function resolveCorsOrigin(
  req: http.IncomingMessage,
  normalizedHost: string,
  allowNullOrigin: boolean,
): { allowed: boolean; allowOrigin: string } {
  const originHeader = req.headers.origin;
  if (originHeader === undefined || originHeader === '') {
    return { allowed: true, allowOrigin: '' };
  }
  if (typeof originHeader !== 'string') {
    return { allowed: false, allowOrigin: '' };
  }
  if (originHeader.toLowerCase() === 'http://' + normalizedHost) {
    return { allowed: true, allowOrigin: '' };
  }
  if (isLoopback(req)) {
    if (LOCAL_CONTROL_ORIGIN.test(originHeader)) {
      return { allowed: true, allowOrigin: originHeader };
    }
    if (originHeader === 'file://' || (allowNullOrigin && originHeader === 'null')) {
      return { allowed: true, allowOrigin: originHeader };
    }
  }
  return { allowed: false, allowOrigin: '' };
}

function isJsonContentType(req: http.IncomingMessage): boolean {
  const raw = req.headers['content-type'];
  return typeof raw === 'string' && /^application\/json(?:\s*;|$)/i.test(raw.trim());
}

function send(
  res: http.ServerResponse,
  status: number,
  contentType: string,
  body: string | Buffer,
  allowOrigin = '',
): void {
  const buf = typeof body === 'string' ? bufferFrom(body, 'utf-8') : body;
  const headers: http.OutgoingHttpHeaders = {
    'Content-Type': contentType,
    'Content-Length': buf.length,
  };
  if (allowOrigin) {
    headers['Access-Control-Allow-Origin'] = allowOrigin;
    headers['Vary'] = 'Origin';
  }
  res.writeHead(status, headers);
  res.end(buf);
}

function sendJson(res: http.ServerResponse, status: number, data: unknown, allowOrigin = ''): void {
  send(res, status, 'application/json; charset=utf-8', JSON.stringify(data), allowOrigin);
}

function isLoopback(req: http.IncomingMessage): boolean {
  const address = req.socket.remoteAddress || '';
  return address === '127.0.0.1' || address === '::1' ||
    address === '::ffff:127.0.0.1';
}

function readBody(req: http.IncomingMessage, limitBytes = 16 * 1024 * 1024): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size > limitBytes) {
        reject(new Error('Upload too large'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
    req.on('error', reject);
  });
}

// The setup page HTML lives in the sibling setup module so it can be
// edited as real HTML. The file is copied into the build output by build.sh.
let _setupPageCache: string | null = null;
function setupPageHtml(): string {
  if (_setupPageCache !== null) return _setupPageCache;
  _setupPageCache = fs.readFileSync(path.join(__dirname, '../setup/setup-page.html'), 'utf-8');
  return _setupPageCache;
}

/**
 * Bind the HTTP server on all interfaces. Pass `0` to let the OS assign a
 * free ephemeral port (typical production use — the bound port is returned
 * via the resolved promise and reported to the in-app client through Luna).
 *
 * `dataDir` is where uploaded .m3u files and their .json metadata live; pass
 * the result of resolveDataDir() (or any writable directory for tests).
 *
 * `onChange` is invoked synchronously after a successful upload mutation
 * (POST /uploads or DELETE /uploads/:id) or setup-action submission
 * (POST /setup-actions). Use it to fan out a push notification to subscribers
 * through the `serviceEvents` channel.
 */
export function startServer(
  port: number,
  dataDir: string,
  onChange?: (event: ServiceChangeEvent) => void,
  setupActions = new SetupActionStore(),
  setupState = new SetupStateStore(),
  options: LanServerOptions = {},
): Promise<{ server: http.Server; port: number }> {
  let boundPort = port;
  const allowNullOrigin = options.allowNullOrigin !== false;
  const setupToken = randomBytes(6).toString('hex');
  const pairingCode = padStart(String(secureRandomInt(10000)), 4, '0');
  const pairingAttempts = Object.create(null) as {
    [client: string]: { failures: number; blockedUntil: number } | undefined;
  };
  const uploads = new UploadStore(dataDir);

  async function handleRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const hostCheck = validateHostHeader(req.headers.host, boundPort);
    if (!hostCheck.allowed) {
      sendJson(res, 403, { error: 'Forbidden host' });
      return;
    }
    const cors = resolveCorsOrigin(req, hostCheck.normalizedHost, allowNullOrigin);
    if (!cors.allowed) {
      sendJson(res, 403, { error: 'Forbidden origin' });
      return;
    }
    const reply = (status: number, contentType: string, body: string | Buffer): void => {
      send(res, status, contentType, body, cors.allowOrigin);
    };
    const replyJson = (status: number, data: unknown): void => {
      sendJson(res, status, data, cors.allowOrigin);
    };
    if (req.method === 'OPTIONS') {
      const preflight: http.OutgoingHttpHeaders = {
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Max-Age': '600',
        'Content-Length': '0',
      };
      if (cors.allowOrigin) {
        preflight['Access-Control-Allow-Origin'] = cors.allowOrigin;
        preflight['Vary'] = 'Origin';
      }
      if (req.headers['access-control-request-private-network']) {
        preflight['Access-Control-Allow-Private-Network'] = 'true';
      }
      res.writeHead(204, preflight);
      res.end();
      return;
    }

    const urlObj = parseUrl(req.url || '/', 'http://' + hostCheck.normalizedHost);
    const pathname = urlObj.pathname;
    const query = urlObj.query;
    const host = req.headers.host || ('localhost:' + boundPort);

    try {
      if (pathname === '/info') {
        if (!isLoopback(req)) {
          replyJson(403, { error: 'Local access only' });
          return;
        }
        const ip = getLanIp();
        const portText = String(boundPort);
        replyJson(200, {
          ip,
          port: boundPort,
          setupUrl: 'http://' + ip + ':' + portText + '/setup?token=' + setupToken,
          manualUrl: 'http://' + ip + ':' + portText,
          pairingCode,
          dataDir,
        });
      } else if ((pathname === '/' || pathname === '/setup') && req.method === 'GET') {
        reply(200, 'text/html; charset=utf-8', setupPageHtml());
      } else if (pathname === '/pair' && req.method === 'POST') {
        if (!isJsonContentType(req)) {
          replyJson(415, { error: 'Content-Type must be application/json' });
          return;
        }
        const client = req.socket.remoteAddress || 'unknown';
        const now = Date.now();
        let current = pairingAttempts[client];
        if (current && current.blockedUntil > now) {
          replyJson(429, {
            error: 'Too many pairing attempts',
            retryAfter: Math.ceil((current.blockedUntil - now) / 1000),
          });
          return;
        }
        if (current && current.blockedUntil > 0) {
          delete pairingAttempts[client];
          current = undefined;
        }
        let submitted = '';
        try {
          const body = JSON.parse(await readBody(req, 1024)) as { code?: unknown };
          submitted = typeof body.code === 'string' ? body.code : '';
        } catch {
          replyJson(400, { error: 'Invalid pairing request' });
          return;
        }
        if (submitted !== pairingCode) {
          const failures = (current?.failures || 0) + 1;
          const blockedUntil = failures >= PAIRING_MAX_FAILURES ? now + PAIRING_LOCK_MS : 0;
          pairingAttempts[client] = { failures, blockedUntil };
          replyJson(blockedUntil ? 429 : 401, {
            error: blockedUntil ? 'Too many pairing attempts' : 'Invalid pairing code',
            retryAfter: blockedUntil ? Math.ceil(PAIRING_LOCK_MS / 1000) : undefined,
          });
          return;
        }
        delete pairingAttempts[client];
        replyJson(200, { token: setupToken });
      } else if (pathname === '/setup-state' && req.method === 'PUT') {
        if (!isLoopback(req)) {
          replyJson(403, { error: 'Local access only' });
          return;
        }
        if (!isJsonContentType(req)) {
          replyJson(415, { error: 'Content-Type must be application/json' });
          return;
        }
        try {
          setupState.set(parseSetupState(JSON.parse(await readBody(req, 64 * 1024))));
          replyJson(200, { updated: true });
        } catch (e) {
          replyJson(400, { error: e instanceof Error ? e.message : String(e) });
        }
      } else if (pathname === '/setup-state' && req.method === 'GET') {
        if (query('token') !== setupToken) {
          replyJson(403, { error: 'Invalid setup token' });
          return;
        }
        replyJson(200, setupState.get());
      } else if (pathname === '/setup-actions' && req.method === 'POST') {
        if (query('token') !== setupToken) {
          replyJson(403, { error: 'Invalid setup token' });
          return;
        }
        if (!isJsonContentType(req)) {
          replyJson(415, { error: 'Content-Type must be application/json' });
          return;
        }
        try {
          const action = setupActions.add(parseSetupAction(JSON.parse(await readBody(req, 64 * 1024))));
          try { onChange?.('setup-changed'); } catch (cbErr) {
            log.error('onChange callback threw:', cbErr);
          }
          replyJson(201, { id: action.id, type: action.type });
        } catch (e) {
          replyJson(400, { error: e instanceof Error ? e.message : String(e) });
        }
      } else if (pathname === '/setup-actions' && req.method === 'GET') {
        if (!isLoopback(req)) {
          replyJson(403, { error: 'Local access only' });
          return;
        }
        replyJson(200, setupActions.list());
      } else if (pathname.indexOf('/setup-actions/') === 0 && req.method === 'GET') {
        if (query('token') !== setupToken) {
          replyJson(403, { error: 'Invalid setup token' });
          return;
        }
        const id = Number(pathname.slice('/setup-actions/'.length));
        const pending = isSafeInteger(id) &&
          setupActions.list().some(action => action.id === id);
        replyJson(200, { id, pending });
      } else if (pathname.indexOf('/setup-actions/') === 0 && req.method === 'DELETE') {
        if (!isLoopback(req)) {
          replyJson(403, { error: 'Local access only' });
          return;
        }
        const id = Number(pathname.slice('/setup-actions/'.length));
        const deleted = isSafeInteger(id) && setupActions.remove(id);
        replyJson(deleted ? 200 : 404, { deleted, id });
      } else if (pathname === '/uploads' && req.method === 'POST') {
        if (query('token') !== setupToken) {
          replyJson(403, { error: 'Invalid setup token' });
          return;
        }
        try {
          const content = await readBody(req);
          const meta = uploads.save(query('name') || 'playlist.m3u', content);
          uploadLog.info('saved ' + meta.count + ' channels as ' + meta.id + '.m3u');
          try { onChange?.('uploads-changed'); } catch (cbErr) { log.error('onChange callback threw:', cbErr); }
          replyJson(200, meta);
        } catch (e) {
          replyJson(400, { error: e instanceof Error ? e.message : String(e) });
        }
      } else if (pathname === '/uploads' && req.method === 'GET') {
        if (!isLoopback(req) && query('token') !== setupToken) {
          replyJson(403, { error: 'Invalid setup token' });
          return;
        }
        const base = 'http://' + host;
        const items = uploads.list().map((m) => ({
          ...m,
          url: base + '/uploads/' + encodeURIComponent(m.id) + '.m3u',
        }));
        replyJson(200, items);
      } else if (pathname === '/uploads') {
        replyJson(405, { error: 'Method not allowed' });
      } else if (pathname.indexOf('/uploads/') === 0) {
        if (req.method === 'DELETE') {
          if (!isLoopback(req) && query('token') !== setupToken) {
            replyJson(403, { error: 'Invalid setup token' });
            return;
          }
        } else if (req.method === 'GET') {
          if (!isLoopback(req)) {
            replyJson(403, { error: 'Local access only' });
            return;
          }
        } else {
          replyJson(405, { error: 'Method not allowed' });
          return;
        }
        let id: string;
        try {
          id = decodeURIComponent(pathname.slice('/uploads/'.length)).replace(/\.m3u$/i, '');
        } catch {
          replyJson(400, { error: 'Invalid upload id' });
          return;
        }
        if (!isValidUploadId(id)) {
          replyJson(400, { error: 'Invalid upload id' });
          return;
        }
        if (req.method === 'DELETE') {
          const ok = uploads.delete(id);
          if (ok) { try { onChange?.('uploads-changed'); } catch (cbErr) { log.error('onChange callback threw:', cbErr); } }
          replyJson(ok ? 200 : 404, { deleted: ok, id });
        } else {
          try {
            reply(200, 'audio/mpegurl; charset=utf-8', uploads.read(id));
          } catch {
            reply(404, 'text/plain; charset=utf-8', 'Upload not found: ' + id);
          }
        }
      } else if (pathname === '/reset' && req.method === 'POST') {
        if (!isLoopback(req)) {
          replyJson(403, { error: 'Local access only' });
          return;
        }
        if (!isJsonContentType(req)) {
          replyJson(415, { error: 'Content-Type must be application/json' });
          return;
        }
        const removed = uploads.clear();
        setupActions.clear();
        setupState.clear();
        if (removed > 0) {
          try { onChange?.('uploads-changed'); } catch (cbErr) { log.error('onChange callback threw:', cbErr); }
        }
        replyJson(200, { reset: true, removed });
      } else {
        reply(404, 'text/plain; charset=utf-8',
          'Not found. Use /setup, /setup-actions, /uploads, or /info');
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.indexOf('EPIPE') >= 0 || msg.indexOf('ECONNRESET') >= 0) return;
      try { reply(500, 'text/plain; charset=utf-8', 'Internal error: ' + msg); } catch { /* ignore */ }
    }
  }

  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      handleRequest(req, res).catch(() => {
        try { res.writeHead(500); res.end('Internal Server Error'); } catch { /* ignore */ }
      });
    });
    const onError = (err: NodeJS.ErrnoException): void => {
      server.removeListener('listening', onListening);
      reject(err);
    };
    const onListening = (): void => {
      server.removeListener('error', onError);
      const addr = server.address();
      const actualPort = addr && typeof addr === 'object' ? addr.port : port;
      boundPort = actualPort;
      log.info('listening on http://0.0.0.0:' + actualPort);
      log.info('setup page: http://' + getLanIp() + ':' + actualPort + '/setup');
      // Permanent error handler so post-listen errors don't crash the process.
      server.on('error', (e) => log.error('server error:', e));
      resolve({ server, port: actualPort });
    };
    server.once('error', onError);
    server.once('listening', onListening);
    server.listen(port, '0.0.0.0');
  });
}
