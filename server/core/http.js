// HTTP plumbing: router, rate limiting, body parsing, static files and security headers.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';
import { paymentsEnabled } from '../config/env.js';
import { sha } from './db.js';
import { HttpError, fail, now } from './util.js';

const PUBLIC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'public');
export const routes = [];
function route(method, pattern, handler, opts = {}) {
  const keys = [];
  const re = new RegExp('^' + pattern.replace(/:(\w+)/g, (_, k) => { keys.push(k); return '([^/]+)'; }) + '$');
  routes.push({ method, re, keys, handler, opts });
}
export const GET = (p, h, o) => route('GET', p, h, o), POST = (p, h, o) => route('POST', p, h, o);
export const PATCH = (p, h, o) => route('PATCH', p, h, o), DEL = (p, h, o) => route('DELETE', p, h, o);
// simple rate limiter
const buckets = new Map();
export function rateLimit(key, max, windowMs) {
  const b = buckets.get(key) || { n: 0, reset: now() + windowMs };
  if (now() > b.reset) { b.n = 0; b.reset = now() + windowMs; }
  b.n++; buckets.set(key, b);
  if (b.n > max) fail(429, 'Too many attempts. Please wait a few minutes and try again.');
}
export const adminOnly = { admin: true };
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2', '.ico': 'image/x-icon', '.txt': 'text/plain' };
const fileCache = new Map();
export function serveStatic(req, res, urlPath) {
  let p = decodeURIComponent(urlPath.split('?')[0]);
  if (p === '/' || !path.extname(p)) p = '/index.html';
  const full = path.join(PUBLIC, path.normalize(p).replace(/^(\.\.[/\\])+/, ''));
  if (!full.startsWith(PUBLIC)) { res.writeHead(403).end(); return; }
  let entry = fileCache.get(full);
  try {
    const st = fs.statSync(full);
    if (!entry || entry.mtime !== st.mtimeMs) {
      const buf = fs.readFileSync(full);
      const ext = path.extname(full);
      const compressible = /\.(html|js|css|json|svg|webmanifest|txt)$/.test(ext);
      entry = { buf, gz: compressible ? zlib.brotliCompressSync(buf) : null, type: MIME[ext] || 'application/octet-stream', etag: '"' + sha(buf).slice(0, 16) + '"', mtime: st.mtimeMs, ext };
      fileCache.set(full, entry);
    }
  } catch { res.writeHead(404, { 'content-type': 'text/plain' }).end('Not found'); return; }
  const headers = { 'content-type': entry.type, etag: entry.etag, 'cache-control': /\.(woff2|png|jpe?g|webp)$/.test(entry.ext) ? 'public, max-age=31536000, immutable' : 'no-cache', ...SEC_HEADERS };
  if (req.headers['if-none-match'] === entry.etag) { res.writeHead(304, headers).end(); return; }
  if (entry.gz && /\bbr\b/.test(req.headers['accept-encoding'] || '')) { headers['content-encoding'] = 'br'; headers.vary = 'accept-encoding'; res.writeHead(200, headers).end(entry.gz); return; }
  res.writeHead(200, headers).end(entry.buf);
}
// Razorpay Checkout needs its script and payment frame; nothing else is loaded from outside the app.
const RZP = paymentsEnabled();
export const SEC_HEADERS = {
  'x-content-type-options': 'nosniff', 'referrer-policy': 'same-origin', 'x-frame-options': 'DENY',
  'permissions-policy': 'geolocation=(self), camera=(self), microphone=(), payment=(self "https://api.razorpay.com")',
  'content-security-policy': `default-src 'self'; img-src 'self' data: blob:${RZP ? ' https://*.razorpay.com' : ''}; style-src 'self' 'unsafe-inline'; script-src 'self'${RZP ? ' https://checkout.razorpay.com' : ''}; connect-src 'self'${RZP ? ' https://*.razorpay.com' : ''}; frame-src ${RZP ? 'https://api.razorpay.com https://checkout.razorpay.com' : "'none'"}; font-src 'self'; frame-ancestors 'none'`,
  ...(process.env.NODE_ENV === 'production' && process.env.DEMO === '0' ? { 'strict-transport-security': 'max-age=31536000; includeSubDomains' } : {}),
};
export function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', (c) => { size += c.length; if (size > 4_000_000) { reject(new HttpError(413, 'Request too large.')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      req.rawBody = Buffer.concat(chunks); // kept for signature checks (payment webhooks)
      try { resolve(JSON.parse(req.rawBody.toString('utf8'))); } catch { reject(new HttpError(400, 'Invalid JSON')); }
    });
    req.on('error', reject);
  });
}
