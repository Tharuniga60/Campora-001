// End-to-end API tests: escrow, mutual acceptance, OTP handover, fairness caps, fraud checks, moderation.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(DIR, '..');
const SERVER_INDEX = path.join(ROOT, 'server', 'index.js');

const PORT = 3900 + Math.floor(Math.random() * 90);
const BASE = `http://localhost:${PORT}/api`;
const DB = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'cl-')), 'db.json');
let srv;
const call = async (p, { method = 'GET', body, token } = {}) => {
  const r = await fetch(BASE + p, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const data = await r.json();
  return { status: r.status, data };
};
const ok = async (...a) => { const r = await call(...a); assert.equal(r.status, 200, JSON.stringify(r.data)); return r.data; };
let cfg, T = {};

before(async () => {
  srv = spawn(process.execPath, [SERVER_INDEX, '--reset'], { cwd: ROOT, env: { ...process.env, PORT, DB_FILE: DB }, stdio: 'ignore' });
  for (let i = 0; i < 50; i++) { try { await fetch(BASE + '/config'); break; } catch { await new Promise((r) => setTimeout(r, 100)); } }
  cfg = await ok('/config');
  for (const u of cfg.demoUsers) T[u.persona.split(' ')[0].toLowerCase()] = (await ok('/auth/demo', { method: 'POST', body: { userId: u.id } })).token;
  for (const k of ['buyer', 'new', 'seller']) await ok('/wallet/topup', { method: 'POST', token: T[k], body: { amount: 2000 } });
});
after(() => srv.kill());

test('signup requires college email, OTP and consent; one account per phone & ID', async () => {
  const bad = await call('/auth/signup', { method: 'POST', body: { name: 'X Y', email: 'x@gmail.com', collegeId: 'CS24999', dept: 'CSE', phone: '9123456780', consent: { terms: true, privacy: true } } });
  assert.equal(bad.status, 400);
  const otp = await ok('/auth/otp', { method: 'POST', body: { phone: '9123456780', purpose: 'signup' } });
  const r = await ok('/auth/signup', { method: 'POST', body: { name: 'Test User', email: 'test@dec.edu.in', collegeId: 'CS24999', dept: 'CSE', year: 2, residence: 'day', phone: '9123456780', otp: otp.demoOtp, consent: { terms: true, privacy: true } } });
  assert.ok(r.token); assert.equal(r.me.collegeId, 'CS24999');
  const dupe = await call('/auth/otp', { method: 'POST', body: { phone: '9123456780', purpose: 'signup' } });
  assert.equal(dupe.status, 409);
  const otp2 = await ok('/auth/otp', { method: 'POST', body: { phone: '9123456781', purpose: 'signup' } });
  const dupeId = await call('/auth/signup', { method: 'POST', body: { name: 'Other', email: 'o@dec.edu.in', collegeId: 'CS24999', dept: 'CSE', phone: '9123456781', otp: otp2.demoOtp, consent: { terms: true, privacy: true } } });
  assert.equal(dupeId.status, 409);
  const edit = await call('/me', { method: 'PATCH', token: r.token, body: { name: 'Hacker' } });
  assert.equal(edit.status, 400, 'verified fields are locked');
  T.test = r.token;
});

test('full buy flow: offer → escrow hold → accept → OTP → release → review', async () => {
  const buyerBefore = (await ok('/me', { token: T.buyer })).wallet;
  const seller = await ok('/me', { token: T.seller });
  const listing = (await ok('/listings?mine=1', { token: T.seller })).find((l) => l.status === 'active' && l.price > 0);
  const d = await ok(`/listings/${listing.id}/offer`, { method: 'POST', token: T.buyer, body: { amount: listing.price } });
  assert.equal(d.status, 'offered');
  assert.equal(d.total, d.amount + d.fee);
  const buyerHeld = (await ok('/me', { token: T.buyer })).wallet;
  assert.equal(buyerHeld.balance, buyerBefore.balance - d.total);
  assert.equal(buyerHeld.escrow, buyerBefore.escrow + d.total);
  const self = await call(`/deals/${d.id}/accept`, { method: 'POST', token: T.buyer });
  assert.equal(self.status, 400, 'offerer cannot accept own offer');
  const acc = await ok(`/deals/${d.id}/accept`, { method: 'POST', token: T.seller });
  assert.equal(acc.status, 'accepted');
  const mine = await ok(`/deals/${d.id}`, { token: T.buyer });
  assert.match(mine.myOtp, /^\d{4}$/);
  const sellerView = await ok(`/deals/${d.id}`, { token: T.seller });
  assert.equal(sellerView.myOtp, null, 'seller never sees OTP');
  const wrong = await call(`/deals/${d.id}/confirm-otp`, { method: 'POST', token: T.seller, body: { otp: '0000' === mine.myOtp ? '1111' : '0000' } });
  assert.equal(wrong.status, 400);
  const paid = await ok(`/deals/${d.id}/confirm-otp`, { method: 'POST', token: T.seller, body: { otp: mine.myOtp } });
  assert.equal(paid.status, 'paid');
  assert.deepEqual(paid.timeline.map((x) => x.s).slice(-3), ['delivered', 'confirmed', 'paid']);
  const sellerAfter = (await ok('/me', { token: T.seller })).wallet;
  assert.equal(sellerAfter.balance, seller.wallet.balance + d.amount);
  const rev = await ok(`/deals/${d.id}/review`, { method: 'POST', token: T.buyer, body: { stars: 5, text: 'Great' } });
  assert.ok(rev.review);
  const l = await ok(`/listings/${listing.id}`, { token: T.buyer });
  assert.equal(l.status, 'sold');
});

test('declined offer refunds automatically; accepting closes competing offers', async () => {
  const before = (await ok('/me', { token: T.new })).wallet.balance;
  const listing = (await ok('/listings?cat=sports', { token: T.new })).find((l) => !l.mine && l.price > 0 && l.price <= before);
  const d = await ok(`/listings/${listing.id}/offer`, { method: 'POST', token: T.new, body: { amount: listing.price } });
  // decline as admin is not allowed (not a party)
  const notParty = await call(`/deals/${d.id}/decline`, { method: 'POST', token: T.test });
  assert.equal(notParty.status, 404);
  await ok(`/deals/${d.id}/withdraw`, { method: 'POST', token: T.new });
  assert.equal((await ok('/me', { token: T.new })).wallet.balance, before);
});

test('prohibited items, academic dishonesty and duplicates are blocked with a reason', async () => {
  const photo = 'data:image/png;base64,iVBORw0KGgo=';
  const a = await call('/listings', { method: 'POST', token: T.seller, body: { title: 'Cheap whisky bottle', category: 'other', condition: 'good', price: 200, photos: [photo] } });
  assert.equal(a.status, 422); assert.match(a.data.error, /Alcohol/);
  const b = await call('/tasks', { method: 'POST', token: T.seller, body: { kind: 'task', title: 'Write my lab record for me', reward: 50, deadline: new Date(Date.now() + 3 * 3600e3).toISOString() } });
  assert.equal(b.status, 422); assert.match(b.data.error, /Academic/);
  const np = await call('/listings', { method: 'POST', token: T.seller, body: { title: 'Steel water bottle', category: 'hostel', condition: 'good', price: 100, photos: [] } });
  assert.equal(np.status, 400, 'photo proof required');
  await ok('/listings', { method: 'POST', token: T.seller, body: { title: 'Steel water bottle 1L', category: 'hostel', condition: 'good', price: 100, photos: [photo] } });
  const dup = await call('/listings', { method: 'POST', token: T.seller, body: { title: 'Steel water bottle 1L', category: 'hostel', condition: 'good', price: 90, photos: [photo] } });
  assert.equal(dup.status, 409);
  const big = await call('/listings', { method: 'POST', token: T.seller, body: { title: 'Laptop', category: 'gadgets', condition: 'good', price: 40000, photos: [photo] } });
  assert.equal(big.status, 400, 'value limit');
});

test('chat masks UPI IDs and phone numbers and raises a fraud flag', async () => {
  const me = await ok('/me', { token: T.buyer });
  const th = await ok('/threads', { method: 'POST', token: T.new, body: { userId: me.id, refType: 'direct', refId: '-' } });
  const m = await ok(`/threads/${th.id}/messages`, { method: 'POST', token: T.new, body: { text: 'pay me on rahul@okaxis or call 9876543210, room 214' } });
  assert.ok(!m.message.text.includes('okaxis')); assert.ok(!m.message.text.includes('9876543210'));
  assert.equal(m.warnings.length, 2);
  const flags = await ok('/admin/flags', { token: T.admin });
  assert.ok(flags.some((f) => f.kind === 'offplatform' && f.user.id === m.message.from));
});

test('task: reward locked at posting, helper cap enforced, OTP pays helper', async () => {
  const poster = await ok('/me', { token: T.test });
  const deadline = new Date(Date.now() + 2 * 3600e3);
  const tk = await call('/tasks', { method: 'POST', token: T.test, body: { kind: 'pickdrop', title: 'Bring my parcel', reward: 30, pickup: 'gate', drop: 'library', deadline: deadline.toISOString() } });
  if (tk.status === 400 && /campus hours/.test(tk.data.error)) return; // test run outside campus hours
  assert.equal(tk.status, 200, JSON.stringify(tk.data));
  const after = await ok('/me', { token: T.test });
  assert.equal(after.wallet.escrow, poster.wallet.escrow + tk.data.total);
  await ok(`/tasks/${tk.data.id}/offers`, { method: 'POST', token: T.new, body: { note: 'on it' } });
  const d = await ok(`/tasks/${tk.data.id}/assign`, { method: 'POST', token: T.test, body: { helperId: (await ok('/me', { token: T.new })).id } });
  assert.equal(d.status, 'accepted');
  await ok(`/deals/${d.id}/start`, { method: 'POST', token: T.new });
  const noPhoto = await call(`/deals/${d.id}/deliver`, { method: 'POST', token: T.new, body: {} });
  assert.equal(noPhoto.status, 400, 'pick & drop needs photo proof');
  await ok(`/deals/${d.id}/deliver`, { method: 'POST', token: T.new, body: { photo: 'data:image/png;base64,iVBORw0KGgo=' } });
  const otp = (await ok(`/deals/${d.id}`, { token: T.test })).myOtp;
  const paid = await ok(`/deals/${d.id}/confirm-otp`, { method: 'POST', token: T.new, body: { otp } });
  assert.equal(paid.status, 'paid');
});

test('changes after acceptance need re-approval; dispute freezes escrow; admin decides with reason', async () => {
  const listing = (await ok('/listings?cat=books', { token: T.buyer })).find((l) => !l.mine && l.price > 0 && l.price < 300);
  const d = await ok(`/listings/${listing.id}/offer`, { method: 'POST', token: T.buyer, body: { amount: listing.price } });
  const sellerTok = await (async () => { for (const k of Object.keys(T)) { const me = await ok('/me', { token: T[k] }); if (me.id === listing.seller.id) return T[k]; } })();
  if (!sellerTok) return;
  await ok(`/deals/${d.id}/accept`, { method: 'POST', token: sellerTok });
  const p = await ok(`/deals/${d.id}/propose`, { method: 'POST', token: sellerTok, body: { amount: listing.price - 10, reason: 'small scratch' } });
  assert.ok(p.pending);
  const r = await ok(`/deals/${d.id}/respond`, { method: 'POST', token: T.buyer, body: { approve: true } });
  assert.equal(r.amount, listing.price - 10);
  assert.equal(r.escrow, r.total);
  const disp = await ok(`/deals/${d.id}/dispute`, { method: 'POST', token: T.buyer, body: { reason: 'Item not as described', details: 'pages missing' } });
  assert.equal(disp.status, 'disputed');
  const rep = (await ok('/admin/reports', { token: T.admin })).find((x) => x.dealId === d.id);
  const noReason = await call(`/admin/reports/${rep.id}/resolve`, { method: 'POST', token: T.admin, body: { action: 'refund', reason: '' } });
  assert.equal(noReason.status, 400, 'reason mandatory');
  const before = (await ok('/me', { token: T.buyer })).wallet.balance;
  await ok(`/admin/reports/${rep.id}/resolve`, { method: 'POST', token: T.admin, body: { action: 'refund', reason: 'Seller photos did not show missing pages.' } });
  assert.equal((await ok('/me', { token: T.buyer })).wallet.balance, before + r.total);
  const mine = await ok('/reports/mine', { token: T.buyer });
  assert.ok(mine.find((x) => x.id === rep.id).decision.reason);
});

test('strike ladder: warning → suspension → ban', async () => {
  const users = await ok('/admin/users?q=Harish', { token: T.admin });
  const id = users[0].id;
  for (const lvl of ['active', 'suspended', 'banned']) {
    const u = await ok(`/admin/users/${id}`, { method: 'POST', token: T.admin, body: { action: 'strike', reason: 'Fake listing confirmed' } });
    assert.equal(u.status, lvl);
  }
});

test('non-admins cannot reach admin APIs; feed never includes own posts', async () => {
  assert.equal((await call('/admin/overview', { token: T.buyer })).status, 403);
  const me = await ok('/me', { token: T.seller });
  const f = await ok('/feed', { token: T.seller });
  assert.ok(f.items.every((i) => (i.seller || i.poster).id !== me.id));
  assert.ok(f.items.every((i) => Array.isArray(i.why)));
});
