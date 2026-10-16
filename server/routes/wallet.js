// API routes — Wallet balance, ledger, UPI top-up and withdrawal.
import { db } from '../core/db.js';
import { GET, POST, rateLimit } from '../core/http.js';
import { DAY, H, clampStr, fail, int, now } from '../core/util.js';
import { ledger } from '../services/wallet.js';

GET('/api/wallet', ({ user }) => {
  const l = db.ledger.filter((x) => x.userId === user.id).sort((a, b) => b.at - a.at);
  const weeks = [];
  for (let i = 7; i >= 0; i--) {
    const end = now() - i * 7 * DAY, start = end - 7 * DAY;
    weeks.push({ label: new Date(start).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }), earned: l.filter((x) => x.type === 'earning' && x.at > start && x.at <= end).reduce((a, x) => a + x.amount, 0) });
  }
  return { wallet: user.wallet, ledger: l.slice(0, 100), weeks, feeWaivers: user.feeWaivers };
});
POST('/api/wallet/topup', ({ user, body }) => {
  const amount = int(body.amount);
  if (amount < 10 || amount > 2000) fail(400, 'Top up between ₹10 and ₹2000.');
  rateLimit('topup:' + user.id, 10, H);
  user.wallet.balance += amount;
  ledger(user.id, 'topup', amount, `UPI top-up ${body.upiRef ? '· ref ' + clampStr(body.upiRef, 20) : ''}`.trim());
  return { wallet: user.wallet };
});
POST('/api/wallet/withdraw', ({ user, body }) => {
  const amount = int(body.amount);
  if (amount < 1 || amount > user.wallet.balance) fail(400, 'Invalid amount.');
  const upi = clampStr(body.upiId, 50);
  if (!/^[\w.-]{2,}@[a-z]{2,}$/i.test(upi)) fail(400, 'Enter a valid UPI ID (e.g. name@okaxis).');
  user.wallet.balance -= amount;
  ledger(user.id, 'withdraw', -amount, `Withdrawn to ${upi.replace(/^(.{2}).*(@.*)$/, '$1•••$2')}`);
  return { wallet: user.wallet };
});
