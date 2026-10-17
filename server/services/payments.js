// Razorpay wallet top-ups: server-side orders, signature checks and exactly-once crediting.
// Flow: create order → Razorpay Checkout in the browser → /verify with the signed result (and/or the webhook) → credit.
import crypto from 'node:crypto';
import { RAZORPAY } from '../config/env.js';
import { db, find, uid } from '../core/db.js';
import { push } from '../core/realtime.js';
import { fail, now } from '../core/util.js';
import { notify } from './notifications.js';
import { ledger } from './wallet.js';

const basic = () => 'Basic ' + Buffer.from(`${RAZORPAY.keyId}:${RAZORPAY.keySecret}`).toString('base64');
const safeEq = (a, b) => { const x = Buffer.from(String(a || '')), y = Buffer.from(String(b || '')); return x.length === y.length && crypto.timingSafeEqual(x, y); };

export async function createOrder(user, amount) {
  let r, data = {};
  try {
    r = await fetch(`${RAZORPAY.base}/v1/orders`, {
      method: 'POST', headers: { authorization: basic(), 'content-type': 'application/json' }, signal: AbortSignal.timeout(10_000),
      body: JSON.stringify({ amount: amount * 100, currency: 'INR', receipt: uid('w').slice(0, 40), notes: { userId: user.id, purpose: 'wallet_topup' } }),
    });
    data = await r.json().catch(() => ({}));
  } catch (e) { console.error('[razorpay] order request failed:', e.message); }
  if (!r?.ok || !data.id) {
    if (r) console.error(`[razorpay] order ${r.status}:`, data?.error?.description || data);
    fail(502, 'The payment service is not responding. Please try again in a minute.');
  }
  const p = { id: uid('pay'), provider: 'razorpay', orderId: data.id, userId: user.id, amount, status: 'created', createdAt: now() };
  db.payments.push(p);
  return p;
}

export const checkoutSignatureOk = (orderId, paymentId, signature) =>
  safeEq(crypto.createHmac('sha256', RAZORPAY.keySecret).update(`${orderId}|${paymentId}`).digest('hex'), signature);
export const webhookSignatureOk = (raw, signature) =>
  !!RAZORPAY.webhookSecret && !!raw && safeEq(crypto.createHmac('sha256', RAZORPAY.webhookSecret).update(raw).digest('hex'), signature);

// Credits the wallet once per order, whichever confirmation (browser or webhook) arrives first.
export function creditPayment(p, paymentId, via) {
  if (p.status === 'paid') return false;
  const u = find('users', p.userId);
  if (!u) return false;
  Object.assign(p, { status: 'paid', paymentId, paidAt: now(), via });
  u.wallet.balance += p.amount;
  ledger(u.id, 'topup', p.amount, `Wallet top-up · Razorpay ${paymentId}`);
  notify(u.id, 'wallet', 'Money added', `₹${p.amount} was added to your wallet.`, '#/wallet');
  push(u.id, 'wallet', {});
  return true;
}
