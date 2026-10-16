// Deals: creation, allowed actions, views, completion and cancellation.
import crypto from 'node:crypto';
import { breakdown } from '../config/rules.js';
import { db, decrypt, encrypt, find, uid } from '../core/db.js';
import { push } from '../core/realtime.js';
import { DAY, S, clampStr, now } from '../core/util.js';
import { ensureThread, sysMsg } from './chat.js';
import { reportView } from './moderation.js';
import { flag, notify } from './notifications.js';
import { publicUser } from './users.js';
import { hold, refundHold } from './wallet.js';

export const ACTIVE = ['accepted', 'in_progress', 'delivered'];
export function step(d, status, by, note = '') {
  d.status = status;
  d.timeline.push({ s: status, at: now(), by, note });
}
function newOtp() { return String(crypto.randomInt(1000, 9999)); }
export function createDeal({ type, refId, title, payer, payee, amount, offeredBy, note, meetPoint, when, fromTask = false, status = 'offered', escrowHeld = 0, fee, total }) {
  const waiver = !fromTask && payer.feeWaivers > 0 && amount > 0;
  const br = fee != null ? { amount, fee, total, feeWaived: false } : breakdown(amount, S(), waiver);
  if (br.feeWaived) payer.feeWaivers -= 1;
  const d = {
    id: uid('d'), type, refId, title, payerId: payer.id, payeeId: payee.id,
    amount: br.amount, fee: br.fee, total: br.total, feeWaived: br.feeWaived,
    status: 'offered', offeredBy, note: clampStr(note, 300), meetPoint: meetPoint || null, when: when || null,
    createdAt: now(), timeline: [], otp: encrypt(newOtp()), otpTries: 0, pending: null, proof: null,
    tracking: null, escrow: 0, reviewed: {}, fromTask,
  };
  d.timeline.push({ s: 'offered', at: now(), by: offeredBy, note: d.note });
  if (escrowHeld) d.escrow = escrowHeld;
  else if (br.total > 0) { hold(payer, br.total, `Escrow for “${title}”`, d.id); d.escrow = br.total; }
  if (status === 'accepted') { step(d, 'accepted', payer.id === offeredBy ? payee.id : payer.id, 'Both sides accepted'); d.acceptedAt = now(); }
  const t = ensureThread([payer.id, payee.id], 'deal', d.id, title);
  d.threadId = t.id;
  db.deals.push(d);
  sysMsg(t, status === 'accepted' ? `Deal accepted by both sides. ₹${d.total} is safe in escrow.` : `Offer of ₹${d.amount} sent. Money is held in escrow until the deal completes or is declined.`);
  return d;
}
function dealActions(d, me) {
  const isPayer = me.id === d.payerId, isPayee = me.id === d.payeeId;
  const a = [];
  if (d.status === 'offered') {
    if (me.id !== d.offeredBy) a.push('accept', 'decline'); else a.push('withdraw');
  }
  if (ACTIVE.includes(d.status)) {
    if (d.pending) { if (d.pending.by !== me.id) a.push('respond_pending'); }
    else a.push('propose_change', 'request_cancel');
    if (isPayee && d.status === 'accepted') a.push('start');
    if (isPayee && d.status === 'in_progress') a.push('track', 'deliver');
    if (isPayee && ['accepted', 'in_progress', 'delivered'].includes(d.status)) a.push('enter_otp');
    if (isPayer && ['in_progress', 'delivered', 'accepted'].includes(d.status)) a.push('show_otp', 'confirm_received');
    a.push('dispute');
  }
  if (d.status === 'paid' && !d.reviewed[me.id]) a.push('review');
  if (!isPayer && !isPayee && me.isAdmin) a.push('admin_view');
  return a;
}
export function dealView(d, me) {
  const isPayer = me.id === d.payerId;
  const ref = d.type === 'buy' ? find('listings', d.refId) : find('tasks', d.refId);
  const counterpart = find('users', isPayer ? d.payeeId : d.payerId);
  return {
    ...d, otp: undefined,
    myOtp: isPayer && ACTIVE.includes(d.status) ? decrypt(d.otp) : null,
    role: isPayer ? 'payer' : me.id === d.payeeId ? 'payee' : 'observer',
    counterpart: publicUser(counterpart, me),
    payer: publicUser(find('users', d.payerId), me), payee: publicUser(find('users', d.payeeId), me),
    ref: ref ? { id: ref.id, title: ref.title, photo: ref.photos?.[0] || null, kind: ref.kind || 'listing', pickup: ref.pickup, drop: ref.drop, location: ref.location || ref.meetPoint, category: ref.category } : null,
    actions: dealActions(d, me),
    review: db.reviews.find((r) => r.dealId === d.id && r.from === me.id) || null,
    dispute: d.disputeId ? reportView(find('reports', d.disputeId)) : null,
  };
}
export function afterPaid(d) {
  if (d.type === 'buy') { const l = find('listings', d.refId); if (l) l.status = 'sold'; }
  else { const t = find('tasks', d.refId); if (t && t.kind !== 'group') t.status = 'done'; }
  for (const id of [d.payerId, d.payeeId]) {
    notify(id, 'deal', 'Deal completed ✓', `“${d.title}” is complete${d.amount ? `, ₹${d.amount} released` : ''}. Please rate your experience.`, `#/deal/${d.id}`);
    push(id, 'deal', { id: d.id });
  }
  // referral reward: first completed deal of a referred user → both get a fee-free deal
  for (const id of [d.payerId, d.payeeId]) {
    const u = find('users', id);
    if (u.referredBy && !u.referralRewarded) {
      u.referralRewarded = true; u.feeWaivers += 1;
      const r = find('users', u.referredBy); if (r) { r.feeWaivers += 1; notify(r.id, 'referral', 'Referral reward 🎉', `${u.name} completed their first deal. You both get one fee-free deal.`); }
    }
  }
  const t = find('threads', d.threadId); if (t) sysMsg(t, 'Deal completed. Payment released. Leave a rating to help the community.');
}
export function dealUpdate(d, by, title, body) {
  const other = by === d.payerId ? d.payeeId : d.payerId;
  if (title) notify(other, 'deal', title, body, `#/deal/${d.id}`);
  push(d.payerId, 'deal', { id: d.id }); push(d.payeeId, 'deal', { id: d.id });
}
export function cancelDeal(d, by, reason, { toTask = true } = {}) {
  const payer = find('users', d.payerId);
  if (d.fromTask) {
    const t = find('tasks', d.refId);
    if (t && t.status === 'assigned') {
      if (toTask && t.deadline > now() + 10 * 60000) {
        // reward goes back to the task (still secured) so another helper can take it
        t.status = 'open'; t.escrow = d.escrow; t.dealId = null; t.offers = t.offers.filter((o) => o.helperId !== d.payeeId); d.escrow = 0;
      } else t.status = 'cancelled';
    }
  }
  if (d.escrow > 0) refundHold(payer, d.escrow, `Refund: “${d.title}”`, d.id);
  d.escrow = 0;
  d.cancelBy = by; d.cancelReason = reason; d.closedAt = now();
  step(d, 'cancelled', by, reason);
  if (d.type === 'buy') { const l = find('listings', d.refId); if (l && l.status === 'reserved') l.status = 'active'; }
  // fraud heuristic: repeated cancellations
  if (by) {
    const recent = db.deals.filter((x) => x.cancelBy === by && now() - x.closedAt < 7 * DAY).length;
    if (recent >= 3) flag(by, 'cancellations', `${recent} cancellations in the last 7 days`);
  }
}
