// API routes — Deals: accept/decline, changes needing both sides, tracking, delivery OTP, disputes, reviews.
import { FREE_ONLY_MSG, breakdown, isFreeOnly, locById, withinHours } from '../config/rules.js';
import { db, decrypt, find, uid } from '../core/db.js';
import { GET, POST } from '../core/http.js';
import { push } from '../core/realtime.js';
import { S, clampStr, fail, int, now } from '../core/util.js';
import { validPhotos } from '../core/validate.js';
import { sysMsg } from '../services/chat.js';
import { ACTIVE, cancelDeal, dealUpdate, dealView, step } from '../services/deals.js';
import { createReport } from '../services/moderation.js';
import { flag, notify } from '../services/notifications.js';
import { requireActive } from '../services/users.js';
import { hold, refundHold, releaseDeal } from '../services/wallet.js';

GET('/api/deals', ({ user, query }) => {
  let ds = db.deals.filter((d) => d.payerId === user.id || d.payeeId === user.id);
  if (query.state === 'active') ds = ds.filter((d) => ['offered', ...ACTIVE, 'disputed'].includes(d.status));
  if (query.state === 'done') ds = ds.filter((d) => !['offered', ...ACTIVE, 'disputed'].includes(d.status));
  return ds.sort((a, b) => (b.timeline.at(-1)?.at || 0) - (a.timeline.at(-1)?.at || 0)).map((d) => dealView(d, user));
});
function getDeal(user, id) {
  const d = find('deals', id);
  if (!d || (d.payerId !== user.id && d.payeeId !== user.id && !user.isAdmin)) fail(404, 'Deal not found');
  return d;
}
GET('/api/deals/:id', ({ user, params }) => dealView(getDeal(user, params.id), user));
POST('/api/deals/:id/accept', ({ user, params }) => {
  const d = getDeal(user, params.id);
  requireActive(user);
  if (d.status !== 'offered' || d.offeredBy === user.id) fail(400, 'Nothing to accept here.');
  if (d.type === 'buy') {
    const l = find('listings', d.refId);
    if (!l || l.status !== 'active') fail(400, 'Item is no longer available.');
    l.status = 'reserved';
    for (const o of db.deals.filter((x) => x.refId === l.id && x.id !== d.id && x.status === 'offered')) {
      cancelDeal(o, null, 'Item reserved for another buyer');
      notify(o.payerId, 'deal', 'Offer closed', `“${l.title}” was reserved for another buyer. ₹${o.total} refunded to your wallet.`, `#/deal/${o.id}`);
    }
  }
  d.acceptedAt = now(); d.respondedBy = user.id; d.respondedAt = now();
  step(d, 'accepted', user.id, 'Both sides accepted the terms');
  sysMsg(find('threads', d.threadId), `${user.name} accepted. Meet at ${locById(d.meetPoint)?.name || 'an approved meeting point'}. The receiver will share a 4-digit OTP at handover.`);
  dealUpdate(d, user.id, 'Deal accepted ✓', `${user.name} accepted “${d.title}”. Money is safe in escrow.`);
  return dealView(d, user);
});
POST('/api/deals/:id/decline', ({ user, params, body }) => {
  const d = getDeal(user, params.id);
  if (d.status !== 'offered' || d.offeredBy === user.id) fail(400, 'Nothing to decline.');
  d.respondedBy = user.id; d.respondedAt = now();
  cancelDeal(d, null, clampStr(body.reason, 140) || 'Declined');
  d.status = 'declined'; d.timeline.at(-1).s = 'declined';
  dealUpdate(d, user.id, 'Offer declined', `${user.name} declined${body.reason ? `: “${clampStr(body.reason, 140)}”` : ''}. ₹${d.total} refunded.`);
  return dealView(d, user);
});
POST('/api/deals/:id/withdraw', ({ user, params }) => {
  const d = getDeal(user, params.id);
  if (d.status !== 'offered' || d.offeredBy !== user.id) fail(400, 'Cannot withdraw.');
  cancelDeal(d, null, 'Offer withdrawn');
  dealUpdate(d, user.id, 'Offer withdrawn', `${user.name} withdrew the offer for “${d.title}”.`);
  return dealView(d, user);
});
// change after acceptance (price/time/cancel) → needs re-approval by the other side
POST('/api/deals/:id/propose', ({ user, params, body }) => {
  const d = getDeal(user, params.id);
  requireActive(user);
  if (!ACTIVE.includes(d.status)) fail(400, 'Changes are only possible on active deals.');
  if (d.pending) fail(409, 'There is already a change waiting for approval.');
  const kind = body.kind === 'cancel' ? 'cancel' : 'change';
  const p = { kind, by: user.id, at: now(), reason: clampStr(body.reason, 200) };
  if (kind === 'change') {
    if (body.amount != null) {
      const amount = int(body.amount);
      const max = d.type === 'buy' ? S().maxItemPrice : S().maxTaskReward + (d.itemCost || 0);
      if (amount < 0 || amount > max) fail(400, `Amount must be between ₹0 and ₹${max}.`);
      if (amount > 0 && d.type === 'buy' && isFreeOnly(find('listings', d.refId)?.category)) fail(400, FREE_ONLY_MSG, { rule: 'free_only' });
      if (amount !== d.amount) p.amount = amount;
    }
    if (body.when) { const w = new Date(body.when).getTime(); if (!withinHours(w, S())) fail(400, 'New time must be within campus hours.'); p.when = w; }
    if (body.meetPoint && locById(body.meetPoint)?.safe) p.meetPoint = body.meetPoint;
    if (p.amount == null && !p.when && !p.meetPoint) fail(400, 'Nothing changed.');
  }
  d.pending = p;
  const txt = kind === 'cancel' ? `requested to cancel${p.reason ? `: “${p.reason}”` : ''}` : `proposed a change${p.amount != null ? ` — price ₹${d.amount} → ₹${p.amount}` : ''}${p.when ? ` — time ${new Date(p.when).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' })}` : ''}${p.meetPoint ? ` — meet at ${locById(p.meetPoint).name}` : ''}`;
  sysMsg(find('threads', d.threadId), `${user.name} ${txt}. Both must approve.`);
  dealUpdate(d, user.id, kind === 'cancel' ? 'Cancellation requested' : 'Change needs your approval', `${user.name} ${txt}.`);
  return dealView(d, user);
});
POST('/api/deals/:id/respond', ({ user, params, body }) => {
  const d = getDeal(user, params.id);
  if (!d.pending || d.pending.by === user.id) fail(400, 'Nothing to respond to.');
  const p = d.pending; d.pending = null;
  const t = find('threads', d.threadId);
  if (!body.approve) {
    sysMsg(t, `${user.name} rejected the ${p.kind === 'cancel' ? 'cancellation request' : 'proposed change'}. Original terms stay.`);
    dealUpdate(d, user.id, 'Request rejected', `${user.name} rejected your ${p.kind === 'cancel' ? 'cancellation' : 'change'} request. You can raise a dispute if needed.`);
    return dealView(d, user);
  }
  if (p.kind === 'cancel') {
    cancelDeal(d, p.by, `Mutually cancelled${p.reason ? ': ' + p.reason : ''}`);
    sysMsg(t, 'Deal cancelled by mutual agreement. Escrow refunded.');
    dealUpdate(d, user.id, 'Deal cancelled', `“${d.title}” was cancelled by mutual agreement. Money refunded.`);
    return dealView(d, user);
  }
  if (p.amount != null) {
    const payer = find('users', d.payerId);
    const newFee = d.feeWaived ? 0 : breakdown(p.amount, S()).fee;
    const newTotal = p.amount + newFee, delta = newTotal - d.total;
    if (delta > 0) hold(payer, delta, `Extra escrow for “${d.title}” (approved change)`, d.id);
    if (delta < 0) refundHold(payer, -delta, `Partial refund for “${d.title}” (approved change)`, d.id);
    d.escrow += delta; d.amount = p.amount; d.fee = newFee; d.total = newTotal;
  }
  if (p.when) d.when = p.when;
  if (p.meetPoint) d.meetPoint = p.meetPoint;
  d.timeline.push({ s: d.status, at: now(), by: user.id, note: 'Change approved by both sides', change: true });
  sysMsg(t, `Change approved by both sides. New total ₹${d.total}.`);
  dealUpdate(d, user.id, 'Change approved', `New terms for “${d.title}” are agreed.`);
  return dealView(d, user);
});
POST('/api/deals/:id/start', ({ user, params }) => {
  const d = getDeal(user, params.id);
  if (d.payeeId !== user.id || d.status !== 'accepted') fail(400, 'Cannot start.');
  d.startedAt = now();
  step(d, 'in_progress', user.id, d.type === 'buy' ? 'Seller is on the way to the meeting point' : 'Helper started the job');
  d.tracking = { stage: d.type === 'pickdrop' ? 'heading_pickup' : 'started', at: now(), history: [{ stage: 'started', at: now() }] };
  dealUpdate(d, user.id, 'In progress', `${user.name} has started “${d.title}”.`);
  return dealView(d, user);
});
POST('/api/deals/:id/track', ({ user, params, body }) => {
  const d = getDeal(user, params.id);
  if (d.payeeId !== user.id || d.status !== 'in_progress') fail(400, 'Tracking is available while the job is in progress.');
  const stages = ['heading_pickup', 'picked_up', 'on_the_way', 'near_drop'];
  const stage = stages.includes(body.stage) ? body.stage : d.tracking?.stage;
  const lat = Number(body.lat), lng = Number(body.lng);
  d.tracking = { ...(d.tracking || { history: [] }), stage, at: now(), lat: isFinite(lat) && lat ? lat : d.tracking?.lat, lng: isFinite(lng) && lng ? lng : d.tracking?.lng, mapX: body.mapX ?? d.tracking?.mapX, mapY: body.mapY ?? d.tracking?.mapY };
  d.tracking.history.push({ stage, at: now() });
  if (body.proof) d.pickupProof = validPhotos([body.proof])[0];
  push(d.payerId, 'track', { id: d.id, tracking: d.tracking });
  if (body.stage) notify(d.payerId, 'track', 'Live update', `${user.name}: ${stage.replace('_', ' ')}`, `#/deal/${d.id}`);
  return dealView(d, user);
});
POST('/api/deals/:id/deliver', ({ user, params, body }) => {
  const d = getDeal(user, params.id);
  if (d.payeeId !== user.id || !['accepted', 'in_progress'].includes(d.status)) fail(400, 'Cannot mark delivered now.');
  const photos = validPhotos(body.photo ? [body.photo] : [], { required: d.type === 'pickdrop', max: 1 });
  d.proof = photos[0] ? { photo: photos[0], at: now() } : null;
  d.deliveredAt = now();
  if (d.status === 'accepted') step(d, 'in_progress', user.id, 'Started');
  step(d, 'delivered', user.id, photos[0] ? 'Handed over with photo proof' : 'Marked as handed over');
  dealUpdate(d, user.id, 'Delivered — please confirm', `${user.name} marked “${d.title}” as delivered. Share your OTP or tap “I received it” to release payment.`);
  return dealView(d, user);
});
function completeDeal(d, by, how) {
  if (!['accepted', 'in_progress', 'delivered'].includes(d.status)) fail(400, 'Deal is not awaiting confirmation.');
  if (!d.deliveredAt) { d.deliveredAt = now(); step(d, 'delivered', d.payeeId, 'Handed over'); }
  d.confirmedAt = now();
  d.confirmedHow = how;
  releaseDeal(d, how);
}
POST('/api/deals/:id/confirm-otp', ({ user, params, body }) => {
  const d = getDeal(user, params.id);
  if (d.payeeId !== user.id) fail(403, 'Only the deliverer enters the OTP shown on the receiver\'s phone.');
  if (++d.otpTries > 6) { flag(user.id, 'otp', `Too many wrong OTP attempts on “${d.title}”`); fail(429, 'Too many wrong attempts. Ask the receiver to tap “I received it” in their app, or raise a dispute.'); }
  if (String(body.otp).trim() !== decrypt(d.otp)) fail(400, 'Wrong OTP. Ask the receiver to read the 4-digit code from their deal screen.');
  completeDeal(d, user.id, 'Receiver confirmed with delivery OTP');
  return dealView(d, user);
});
POST('/api/deals/:id/confirm', ({ user, params }) => {
  const d = getDeal(user, params.id);
  if (d.payerId !== user.id) fail(403, 'Only the receiver can confirm receipt.');
  completeDeal(d, user.id, 'Receiver confirmed receipt in app');
  return dealView(d, user);
});
POST('/api/deals/:id/dispute', ({ user, params, body }) => {
  const d = getDeal(user, params.id);
  if (!ACTIVE.includes(d.status)) fail(400, 'Disputes can be raised on active deals.');
  const reason = clampStr(body.reason, 80);
  if (!reason) fail(400, 'Select a reason.');
  const r = createReport({ reporter: user, targetType: 'deal', targetId: d.id, reason, details: body.details, kind: 'dispute', dealId: d.id, targetUserId: user.id === d.payerId ? d.payeeId : d.payerId });
  if (body.evidence) r.evidence = validPhotos([body.evidence])[0];
  d.prevStatus = d.status; d.disputeId = r.id; d.pending = null;
  step(d, 'disputed', user.id, `Dispute: ${reason}. Money frozen until an admin decides (within ${S().disputeSlaHours}h).`);
  sysMsg(find('threads', d.threadId), `${user.name} raised a dispute: “${reason}”. Escrow is frozen. An admin will decide within ${S().disputeSlaHours} hours based on chat records, photos and timeline.`);
  dealUpdate(d, user.id, 'Dispute raised', `${user.name} raised a dispute on “${d.title}”. An admin will review within ${S().disputeSlaHours}h.`);
  return dealView(d, user);
});
POST('/api/deals/:id/review', ({ user, params, body }) => {
  const d = getDeal(user, params.id);
  if (d.status !== 'paid') fail(400, 'You can rate after the deal is completed.');
  if (d.reviewed[user.id]) fail(409, 'You already rated this deal.');
  const stars = Math.min(5, Math.max(1, int(body.stars)));
  const to = user.id === d.payerId ? d.payeeId : d.payerId;
  const role = d.type === 'buy' ? (to === d.payeeId ? 'seller' : 'buyer') : (to === d.payeeId ? 'helper' : 'poster');
  const r = { id: uid('v'), dealId: d.id, from: user.id, to, stars, text: clampStr(body.text, 300), tags: (body.tags || []).slice(0, 4).map((x) => clampStr(x, 24)), role, at: now() };
  db.reviews.push(r); d.reviewed[user.id] = true;
  notify(to, 'review', `New ${stars}★ review`, `${user.name} rated you as ${role}.`, `#/user/${to}`);
  return dealView(d, user);
});
