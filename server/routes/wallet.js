// API routes — Wallet balance, ledger, Razorpay top-ups (demo top-up in demo mode) and withdrawal requests.
import { RAZORPAY, paymentsEnabled } from '../config/env.js';
import { DEMO } from '../config/rules.js';
import { db, encrypt, uid } from '../core/db.js';
import { GET, POST, rateLimit } from '../core/http.js';
import { push } from '../core/realtime.js';
import { DAY, H, clampStr, fail, int, now } from '../core/util.js';
import { notify } from '../services/notifications.js';
import { checkoutSignatureOk, createOrder, creditPayment, webhookSignatureOk } from '../services/payments.js';
import { ledger, payoutView } from '../services/wallet.js';

const TOPUP_MIN = 10, TOPUP_MAX = 2000;
const topupAmount = (v) => { const a = int(v); if (a < TOPUP_MIN || a > TOPUP_MAX) fail(400, `Top up between ₹${TOPUP_MIN} and ₹${TOPUP_MAX}.`); return a; };

GET('/api/wallet', ({ user }) => {
  const l = db.ledger.filter((x) => x.userId === user.id).sort((a, b) => b.at - a.at);
  const weeks = [];
  for (let i = 7; i >= 0; i--) {
    const end = now() - i * 7 * DAY, start = end - 7 * DAY;
    weeks.push({ label: new Date(start).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }), earned: l.filter((x) => x.type === 'earning' && x.at > start && x.at <= end).reduce((a, x) => a + x.amount, 0) });
  }
  const payouts = db.payouts.filter((p) => p.userId === user.id).sort((a, b) => b.createdAt - a.createdAt).slice(0, 20).map(payoutView);
  return { wallet: user.wallet, ledger: l.slice(0, 100), weeks, feeWaivers: user.feeWaivers, payouts };
});

// Demo-only instant top-up. Real deployments use the Razorpay order → checkout → verify flow below.
POST('/api/wallet/topup', ({ user, body }) => {
  if (paymentsEnabled()) fail(400, 'Use the secure checkout to add money.', { checkout: true });
  if (!DEMO) fail(503, 'Adding money is not available yet. Please contact the campus admin.');
  const amount = topupAmount(body.amount);
  rateLimit('topup:' + user.id, 10, H);
  user.wallet.balance += amount;
  ledger(user.id, 'topup', amount, `UPI top-up ${body.upiRef ? '· ref ' + clampStr(body.upiRef, 20) : ''}`.trim());
  return { wallet: user.wallet };
});
POST('/api/wallet/topup/order', async ({ user, body }) => {
  if (!paymentsEnabled()) fail(503, 'Online payments are not set up on this campus yet.');
  const amount = topupAmount(body.amount);
  rateLimit('order:' + user.id, 15, H);
  const p = await createOrder(user, amount);
  return { orderId: p.orderId, amount: amount * 100, currency: 'INR', keyId: RAZORPAY.keyId };
});
POST('/api/wallet/topup/verify', ({ user, body }) => {
  const p = db.payments.find((x) => x.orderId === body.razorpay_order_id && x.userId === user.id);
  if (!p) fail(404, 'Payment not found.');
  if (!checkoutSignatureOk(body.razorpay_order_id, body.razorpay_payment_id, body.razorpay_signature)) {
    console.warn(`[razorpay] bad checkout signature for order ${p.orderId}`);
    fail(400, 'We could not verify this payment. If money was debited, it will be credited automatically or refunded by your bank.');
  }
  creditPayment(p, clampStr(body.razorpay_payment_id, 40), 'checkout');
  return { wallet: user.wallet, credited: p.amount };
});
// Razorpay → server confirmation (set the URL and secret in the Razorpay dashboard: events payment.captured, order.paid).
POST('/api/payments/razorpay/webhook', ({ req, body }) => {
  if (!webhookSignatureOk(req.rawBody, req.headers['x-razorpay-signature'])) fail(400, 'Invalid signature.');
  const pay = body.payload?.payment?.entity;
  const orderId = pay?.order_id || body.payload?.order?.entity?.id;
  const p = orderId && db.payments.find((x) => x.orderId === orderId);
  if (p && ['payment.captured', 'order.paid'].includes(body.event) && (!pay || pay.amount === p.amount * 100)) creditPayment(p, pay?.id || 'order', 'webhook');
  return { ok: true };
}, { auth: false });

// Withdrawals are requests: the amount leaves the wallet now and an admin pays it by UPI, recording the reference.
POST('/api/wallet/withdraw', ({ user, body }) => {
  const amount = int(body.amount);
  if (amount < 1 || amount > user.wallet.balance) fail(400, 'Invalid amount.');
  const upi = clampStr(body.upiId, 50);
  if (!/^[\w.-]{2,}@[a-z]{2,}$/i.test(upi)) fail(400, 'Enter a valid UPI ID (e.g. name@okaxis).');
  if (db.payouts.filter((p) => p.userId === user.id && p.status === 'requested').length >= 3) fail(429, 'You already have 3 withdrawals waiting to be paid.');
  rateLimit('withdraw:' + user.id, 5, DAY);
  const upiMasked = upi.replace(/^(.{2}).*(@.*)$/, '$1•••$2');
  user.wallet.balance -= amount;
  const p = { id: uid('po'), userId: user.id, amount, upi: encrypt(upi), upiMasked, status: 'requested', createdAt: now() };
  db.payouts.push(p);
  ledger(user.id, 'withdraw', -amount, `Withdrawal requested to ${upiMasked}`);
  for (const a of db.users.filter((u) => u.isAdmin && !u.deleted)) { notify(a.id, 'admin', 'Withdrawal to pay', `${user.name} requested ₹${amount} to UPI.`, '#/admin/payouts'); push(a.id, 'admin', { kind: 'payout' }); }
  return { wallet: user.wallet, payout: payoutView(p) };
});
