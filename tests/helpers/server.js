// Test harness shared by every suite: boots a real server on a free port with a fresh, freshly seeded database,
// and gives a small API client plus one token per demo persona (admin, seller, helper, buyer, new).
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const PNG = 'data:image/png;base64,iVBORw0KGgo=';

export async function startServer() {
  const db = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'cl-')), 'db.json');
  const proc = spawn(process.execPath, [path.join(ROOT, 'server', 'index.js'), '--reset'], { cwd: ROOT, env: { ...process.env, PORT: '0', DB_FILE: db }, stdio: ['ignore', 'pipe', 'inherit'] });
  const port = await new Promise((resolve, reject) => {
    let out = '';
    proc.stdout.on('data', (c) => { out += c; const m = out.match(/Local:\s+http:\/\/localhost:(\d+)/); if (m) resolve(+m[1]); });
    proc.on('exit', (code) => reject(new Error(`server exited (${code}) before listening:\n${out}`)));
  });
  proc.stdout.resume();
  const base = `http://localhost:${port}/api`;

  const call = async (p, { method = 'GET', body, token } = {}) => {
    const r = await fetch(base + p, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) }, body: body ? JSON.stringify(body) : undefined });
    return { status: r.status, data: await r.json() };
  };
  const ok = async (...a) => { const r = await call(...a); assert.equal(r.status, 200, JSON.stringify(r.data)); return r.data; };
  const post = (p, token, body = {}) => ok(p, { method: 'POST', token, body });

  const cfg = await ok('/config');
  const tokens = {};
  for (const u of cfg.demoUsers) tokens[u.persona.split(' ')[0].toLowerCase()] = (await post('/auth/demo', null, { userId: u.id })).token;

  return { base, cfg, tokens, call, ok, post, me: (token) => ok('/me', { token }), stop: () => proc.kill() };
}
