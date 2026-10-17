// CampusLoop API server — zero dependencies (Node 18+).
// Wires the feature routers in routes/ into one HTTP server that also serves the PWA from public/.
import http from 'node:http';
import { TRUST_PROXY } from './config/env.js';
import { save } from './core/db.js';
import { SEC_HEADERS, readBody, routes, serveStatic } from './core/http.js';
import { streams } from './core/realtime.js';
import { HttpError } from './core/util.js';
import { authUser } from './services/users.js';

// Route modules register themselves with the router on import (order = match order).
import './routes/auth.js';
import './routes/users.js';
import './routes/feed.js';
import './routes/listings.js';
import './routes/tasks.js';
import './routes/deals.js';
import './routes/chat.js';
import './routes/notifications.js';
import './routes/safety.js';
import './routes/wallet.js';
import './routes/community.js';
import './routes/admin.js';
import './routes/admin-moderation.js';

// behind a reverse proxy (Render, Railway, Nginx…) every request comes from the proxy — use the forwarded client address
const clientIp = (req) => (TRUST_PROXY && String(req.headers['x-forwarded-for'] || '').split(',')[0].trim()) || req.socket.remoteAddress;

async function handleApi(req, res, url) {
  const send = (status, data) => { res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...SEC_HEADERS }); res.end(JSON.stringify(data)); };
  try {
    const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '') || url.searchParams.get('token') || '';
    if (url.pathname === '/api/stream') {
      const u = authUser(token);
      if (!u) return send(401, { error: 'Unauthorised' });
      res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive', 'x-accel-buffering': 'no' });
      res.write(`event: hello\ndata: {"ok":true}\n\n`);
      if (!streams.has(u.id)) streams.set(u.id, new Set());
      streams.get(u.id).add(res);
      const ping = setInterval(() => res.write(': ping\n\n'), 25000);
      req.on('close', () => { clearInterval(ping); streams.get(u.id)?.delete(res); });
      return;
    }
    const r = routes.find((x) => x.method === req.method && x.re.test(url.pathname));
    if (!r) return send(404, { error: 'Not found' });
    const m = url.pathname.match(r.re);
    const params = Object.fromEntries(r.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])]));
    const ctx = { req, res, params, query: Object.fromEntries(url.searchParams), token, ip: clientIp(req), body: ['POST', 'PATCH', 'PUT', 'DELETE'].includes(req.method) ? await readBody(req) : {} };
    if (r.opts.auth !== false) {
      ctx.user = authUser(token);
      if (!ctx.user) return send(401, { error: 'Please log in again.' });
      if (r.opts.admin && !ctx.user.isAdmin) return send(403, { error: 'Admins only.' });
    }
    const out = await r.handler(ctx);
    if (req.method !== 'GET' || url.pathname.startsWith('/api/listings/') || url.pathname === '/api/threads' || url.pathname.startsWith('/api/threads/')) save();
    send(200, out ?? { ok: true });
  } catch (e) {
    if (e instanceof HttpError) return send(e.status, { error: e.message, ...(e.extra || {}) });
    console.error(e);
    send(500, { error: 'Something went wrong. Please try again.' });
  }
}
export function createServer() {
  return http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    if (url.pathname.startsWith('/api/')) return handleApi(req, res, url);
    if (req.method !== 'GET' && req.method !== 'HEAD') return res.writeHead(405).end();
    serveStatic(req, res, url.pathname);
  });
}
