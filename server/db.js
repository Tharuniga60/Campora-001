// CampusLoop — tiny JSON document store with atomic, debounced writes.
// Zero dependencies: easy to run on any laptop at a hackathon, easy to swap for Postgres later.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const DB_FILE = process.env.DB_FILE || path.join(ROOT, 'data', 'db.json');

export const COLLECTIONS = [
  'users', 'sessions', 'otps', 'listings', 'tasks', 'deals', 'threads', 'messages',
  'notifications', 'reports', 'reviews', 'lostfound', 'announcements', 'ledger',
  'audit', 'sos', 'flags',
];

export function emptyDb() {
  const d = { settings: {}, meta: { createdAt: Date.now(), platformRevenue: 0 } };
  for (const c of COLLECTIONS) d[c] = [];
  return d;
}

export let db = emptyDb();

export function load() {
  try {
    const raw = fs.readFileSync(DB_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    db = Object.assign(emptyDb(), parsed);
    for (const c of COLLECTIONS) if (!Array.isArray(db[c])) db[c] = [];
    return true;
  } catch {
    db = emptyDb();
    return false;
  }
}

export function replace(next) { db = next; flush(); }

let timer = null;
export function save() {
  clearTimeout(timer);
  timer = setTimeout(flush, 150);
}
export function flush() {
  clearTimeout(timer);
  fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });
  const tmp = DB_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db));
  fs.renameSync(tmp, DB_FILE);
}

export function uid(prefix = '') {
  return prefix + Date.now().toString(36) + crypto.randomBytes(4).toString('hex');
}

export const find = (col, id) => db[col].find((x) => x.id === id);

// ---- Encryption at rest for personal contact data (DPDP Act: store securely) ----
const KEY = crypto.createHash('sha256').update(process.env.DATA_KEY || 'campusloop-dev-key-change-me').digest();
export function encrypt(text) {
  if (text == null || text === '') return '';
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', KEY, iv);
  const enc = Buffer.concat([c.update(String(text), 'utf8'), c.final()]);
  return [iv.toString('base64'), c.getAuthTag().toString('base64'), enc.toString('base64')].join('.');
}
export function decrypt(blob) {
  if (!blob) return '';
  try {
    const [iv, tag, data] = blob.split('.').map((s) => Buffer.from(s, 'base64'));
    const d = crypto.createDecipheriv('aes-256-gcm', KEY, iv);
    d.setAuthTag(tag);
    return Buffer.concat([d.update(data), d.final()]).toString('utf8');
  } catch { return ''; }
}
export const hmac = (v) => crypto.createHmac('sha256', KEY).update(String(v).trim().toLowerCase()).digest('hex');
export const sha = (v) => crypto.createHash('sha256').update(String(v)).digest('hex');
