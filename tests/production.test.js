// Real-deployment mode (DEMO=0): config validation, no seeding, SMS OTP, admins from ADMIN_PHONES,
// Razorpay top-ups (order → signature verify → webhook, credited exactly once) and admin-paid withdrawals.
// MSG91 and Razorpay are replaced by a local mock server, so no real SMS is sent and no money moves.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { startServer, TEST_ENV } from './helpers/server.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const KEY_ID = 'rzp_test_campora', KEY_SECRET = 'test_secret_123', HOOK_SECRET = 'hook_secret_456';
const ADMIN = '9000000001', STUDENT = '9000000002', SMS_DOWN = '9000000099';
const sms = new Map(); // mobile → last OTP the "SMS provider" received
let mock, mockUrl, srv, orders = 0;

before(async () => {
  mock = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    let body = ''; req.on('data', (c) => { body += c; });
    req.on('end', () => {
      const json = (code, d) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(d)); };
      if (url.pathname === '/api/v5/otp') {
        if (req.headers.authkey !== 'msg91-key' || url.searchParams.get('template_id') !== 'tmpl-1') return json(401, { type: 'error', message: 'bad auth' });
        if (url.searchParams.get('mobile') === '91' + SMS_DOWN) return json(500, { type: 'error', message: 'provider down' });
        sms.set(url.searchParams.get('mobile'), url.searchParams.get('otp'));
        return json(200, { type: 'success' });
      }
      if (url.pathname === '/v1/orders') {
        if (req.headers.authorization !== 'Basic ' + Buffer.from(`${KEY_ID}:${KEY_SECRET}`).toString('base64')) return json(401, { error: { description: 'bad key' } });
        const b = JSON.parse(body);
        return json(200, { id: `order_${++orders}`, amount: b.amount, currency: b.currency, status: 'created' });
      }
      json(404, {});
    });
  });
  await new Promise((r) => mock.listen(0, r));
  mockUrl = `http://127.0.0.1:${mock.address().port}`;
  srv = await startServer({ demo: false, env: {
    DEMO: '0', DATA_KEY: 'k'.repeat(64), CAMPUS_NAME: 'Test College', CAMPUS_DOMAINS: 'testcollege.edu.in', ADMIN_PHONES: ADMIN,
    SMS_PROVIDER: 'msg91', MSG91_AUTH_KEY: 'msg91-key', MSG91_TEMPLATE_ID: 'tmpl-1', MSG91_API_BASE: mockUrl,
    RAZORPAY_KEY_ID: KEY_ID, RAZORPAY_KEY_SECRET: KEY_SECRET, RAZORPAY_WEBHOOK_SECRET: HOOK_SECRET, RAZORPAY_API_BASE: mockUrl,
  } });
});
after(() => { srv?.stop(); mock?.close(); });

let n = 0;
async function signup(phone, name) {
  const otp = await srv.post('/auth/otp', null, { phone, purpose: 'signup' });
  assert.equal(otp.demoOtp, undefined, 'OTP is never returned to the browser');
  const code = sms.get('91' + phone);
  assert.match(code, /^\d{6}$/, 'OTP delivered through the SMS provider');
  return srv.post('/auth/signup', null, { name, email: `p${++n}@testcollege.edu.in`, collegeId: `TC${20000 + n}`, dept: 'CSE', year: 2, residence: 'day', phone, otp: code, consent: { terms: true, privacy: true } });
}
const sign = (secret, s) => crypto.createHmac('sha256', secret).update(s).digest('hex');
const webhook = (raw, sig) => fetch(srv.base + '/payments/razorpay/webhook', { method: 'POST', headers: { 'content-type': 'application/json', 'x-razorpay-signature': sig }, body: raw });

function runRaw(env, args = []) {
  return new Promise((resolve) => {
    const p = spawn(process.execPath, [path.join(ROOT, 'server', 'index.js'), ...args], { cwd: ROOT, env: { ...process.env, ...TEST_ENV, PORT: '0', ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = ''; p.stdout.on('data', (c) => { out += c; if (/Local:/.test(out)) p.kill(); }); p.stderr.on('data', (c) => { out += c; });
    p.on('exit', (code) => resolve({ code, out }));
  });
}

test('refuses to start without the required configuration, or with --reset, or on a demo database', async () => {
  const bare = await runRaw({ DEMO: '0', SMS_PROVIDER: '' });
  assert.equal(bare.code, 1);
  for (const v of ['DATA_KEY', 'CAMPUS_NAME', 'CAMPUS_DOMAINS', 'ADMIN_PHONES', 'SMS_PROVIDER']) assert.match(bare.out, new RegExp(v));
  const good = { DEMO: '0', DATA_KEY: 'k'.repeat(64), CAMPUS_NAME: 'T', CAMPUS_DOMAINS: 'testcollege.edu.in', ADMIN_PHONES: ADMIN, SMS_PROVIDER: 'console' };
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'clp-'));
  const reset = await runRaw({ ...good, DB_FILE: path.join(dir, 'a.json') }, ['--reset']);
  assert.equal(reset.code, 1); assert.match(reset.out, /only allowed in demo mode/);
  const demoDb = path.join(dir, 'demo.json');
  await runRaw({ DB_FILE: demoDb }, ['--reset', '--seed-only']); // a demo database
  const onDemo = await runRaw({ ...good, DB_FILE: demoDb });
  assert.equal(onDemo.code, 1); assert.match(onDemo.out, /contains demo data/);
});

test('real deployment: empty campus, no demo logins, OTP by SMS, admins from ADMIN_PHONES', async () => {
  const cfg = await srv.ok('/config');
  assert.equal(cfg.demo, false); assert.deepEqual(cfg.demoUsers, []); assert.equal(cfg.payments.keyId, KEY_ID); assert.equal(cfg.campus.name, 'Test College');
  assert.equal((await srv.call('/auth/demo', { method: 'POST', body: { userId: 'x' } })).status, 403);
  assert.equal((await srv.ok('/listings', { token: (await signup(STUDENT, 'Student One')).token })).length, 0, 'no seeded listings');
  const admin = await signup(ADMIN, 'Campus Admin');
  assert.equal(admin.me.isAdmin, true);
  const student = await srv.post('/auth/otp', null, { phone: STUDENT, purpose: 'login' }).then(() => srv.post('/auth/login', null, { phone: STUDENT, otp: sms.get('91' + STUDENT) }));
  assert.equal(student.me.isAdmin, false);
  assert.equal(student.me.wallet.balance, 0, 'no demo welcome credit');
  assert.equal((await srv.call('/auth/login', { method: 'POST', body: { phone: STUDENT, otp: sms.get('91' + STUDENT) } })).status, 400, 'an OTP works once');
  const down = await srv.call('/auth/otp', { method: 'POST', body: { phone: SMS_DOWN, purpose: 'signup' } });
  assert.equal(down.status, 502, 'SMS failure is reported, not hidden');
  assert.equal((await srv.call('/auth/signup', { method: 'POST', body: { phone: SMS_DOWN, otp: '123456' } })).status, 400);
});

test('Razorpay top-up: order, signature verification, webhook — credited exactly once', async () => {
  const otp = await srv.post('/auth/otp', null, { phone: STUDENT, purpose: 'login' });
  assert.ok(otp.sent);
  const { token } = await srv.post('/auth/login', null, { phone: STUDENT, otp: sms.get('91' + STUDENT) });
  assert.equal((await srv.call('/wallet/topup', { method: 'POST', token, body: { amount: 500 } })).data.checkout, true, 'no free money');
  const o = await srv.post('/wallet/topup/order', token, { amount: 500 });
  assert.equal(o.amount, 50000); assert.equal(o.keyId, KEY_ID);
  const bad = await srv.call('/wallet/topup/verify', { method: 'POST', token, body: { razorpay_order_id: o.orderId, razorpay_payment_id: 'pay_1', razorpay_signature: 'forged' } });
  assert.equal(bad.status, 400);
  const res = { razorpay_order_id: o.orderId, razorpay_payment_id: 'pay_1', razorpay_signature: sign(KEY_SECRET, `${o.orderId}|pay_1`) };
  assert.equal((await srv.post('/wallet/topup/verify', token, res)).wallet.balance, 500);
  assert.equal((await srv.post('/wallet/topup/verify', token, res)).wallet.balance, 500, 'replaying the same payment does not credit twice');
  const evt = (orderId, amount) => JSON.stringify({ event: 'payment.captured', payload: { payment: { entity: { id: 'pay_w' + orderId, order_id: orderId, amount } } } });
  assert.equal((await webhook(evt(o.orderId, 50000), 'forged')).status, 400, 'webhook signature checked');
  const raw1 = evt(o.orderId, 50000);
  assert.equal((await webhook(raw1, sign(HOOK_SECRET, raw1))).status, 200);
  assert.equal((await srv.me(token)).wallet.balance, 500, 'webhook after checkout does not double-credit');
  const o2 = await srv.post('/wallet/topup/order', token, { amount: 200 });
  const raw2 = evt(o2.orderId, 20000);
  await webhook(raw2, sign(HOOK_SECRET, raw2));
  assert.equal((await srv.me(token)).wallet.balance, 700, 'webhook alone credits when the browser never returned');
  const o3 = await srv.post('/wallet/topup/order', token, { amount: 300 });
  const raw3 = evt(o3.orderId, 100); // amount mismatch
  await webhook(raw3, sign(HOOK_SECRET, raw3));
  assert.equal((await srv.me(token)).wallet.balance, 700, 'amount must match the order');
});

test('withdrawals are paid by an admin and recorded with the UPI reference', async () => {
  const login = async (phone) => { await srv.post('/auth/otp', null, { phone, purpose: 'login' }); return (await srv.post('/auth/login', null, { phone, otp: sms.get('91' + phone) })).token; };
  const [tok, adm] = [await login(STUDENT), await login(ADMIN)];
  const before = (await srv.me(tok)).wallet.balance;
  const w = await srv.post('/wallet/withdraw', tok, { amount: 100, upiId: 'student.one@okaxis' });
  assert.equal(w.wallet.balance, before - 100); assert.equal(w.payout.status, 'requested');
  assert.equal((await srv.call('/admin/payouts', { token: tok })).status, 403);
  const q = await srv.ok('/admin/payouts', { token: adm });
  assert.equal(q[0].upiFull, 'student.one@okaxis');
  assert.equal((await srv.call(`/admin/payouts/${q[0].id}`, { method: 'POST', token: adm, body: { action: 'paid', ref: '1' } })).status, 400, 'UTR required');
  await srv.post(`/admin/payouts/${q[0].id}`, adm, { action: 'paid', ref: '412345678901' });
  const mine = (await srv.ok('/wallet', { token: tok })).payouts[0];
  assert.equal(mine.status, 'paid'); assert.equal(mine.ref, '412345678901'); assert.ok(!('upiFull' in mine));
  const w2 = await srv.post('/wallet/withdraw', tok, { amount: 50, upiId: 'wrong@upi' });
  await srv.post(`/admin/payouts/${w2.payout.id}`, adm, { action: 'reject', reason: 'UPI ID is invalid' });
  assert.equal((await srv.me(tok)).wallet.balance, before - 100, 'rejected withdrawal goes back to the wallet');
});
