// Wallet ledger and escrow: hold, refund and release.
import { db, find, uid } from '../core/db.js';
import { fail, now } from '../core/util.js';
import { afterPaid, step } from './deals.js';

export const payoutView = (p) => ({ id: p.id, amount: p.amount, upi: p.upiMasked, status: p.status, createdAt: p.createdAt, paidAt: p.paidAt || null, ref: p.ref || null, reason: p.reason || null });
export function ledger(userId, type, amount, note, dealId = null) {
  db.ledger.push({ id: uid('l'), userId, type, amount, note, dealId, at: now() });
}
export function hold(u, total, note, ref) {
  if (total <= 0) return;
  if (u.wallet.balance < total) fail(402, `Insufficient wallet balance. You need ₹${total - u.wallet.balance} more — top up via UPI first.`, { need: total - u.wallet.balance });
  u.wallet.balance -= total; u.wallet.escrow += total;
  ledger(u.id, 'hold', -total, note, ref);
}
export function refundHold(u, total, note, ref) {
  if (total <= 0) return;
  u.wallet.escrow -= total; u.wallet.balance += total;
  ledger(u.id, 'refund', total, note, ref);
}
export function releaseDeal(d, note = 'Released after both sides confirmed') {
  const payer = find('users', d.payerId), payee = find('users', d.payeeId);
  if (d.escrow > 0) {
    payer.wallet.escrow -= d.escrow;
    payer.wallet.spent += d.total;
    payee.wallet.balance += d.amount; payee.wallet.earned += d.amount;
    db.meta.platformRevenue += d.fee;
    ledger(payer.id, 'paid', 0, `Paid ₹${d.total} to ${payee.name} (from escrow)`, d.id);
    ledger(payee.id, 'earning', d.amount, `Earned from “${d.title}”`, d.id);
  }
  d.escrow = 0;
  step(d, 'confirmed', null, note);
  step(d, 'paid', null, d.amount > 0 ? `₹${d.amount} released to ${payee.name}` : 'Free handover completed');
  d.paidAt = now();
  afterPaid(d);
}
