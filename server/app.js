// CampusLoop API server — zero dependencies (Node 18+).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { db, save, uid, find, encrypt, decrypt, hmac, sha } from './db.js';
import {
  CAMPUS, DEFAULT_SETTINGS, CATEGORIES, CONDITIONS, LOCATIONS, locById, distance, fairFare,
  breakdown, prohibitedCheck, PROHIBITED_SUMMARY, scanMessage, similarity, median, suggestPrice,
  withinHours, istDayKey, RULES_TEXT,
} from './rules.js';

const PUBLIC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');
export const DEMO = process.env.DEMO !== '0';
const H = 3600e3, DAY = 24 * H;

export const DEPARTMENTS = ['CSE', 'IT', 'AI & DS', 'ECE', 'EEE', 'MECH', 'CIVIL', 'MBA', 'Science & Humanities', 'Administration'];

class HttpError extends Error { constructor(status, msg, extra) { super(msg); this.status = status; this.extra = extra; } }
const fail = (status, msg, extra) => { throw new HttpError(status, msg, extra); };
const S = () => ({ ...DEFAULT_SETTINGS, ...db.settings });
const now = () => Date.now();
const clampStr = (v, max) => String(v ?? '').trim().slice(0, max);
const int = (v) => Math.round(Number(v) || 0);

// ------------------------------------------------------------------ realtime (SSE)
const streams = new Map(); // userId -> Set<res>
function push(userId, event, data) {
  const set = streams.get(userId);
  if (!set) return;
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of set) res.write(payload);
}
const pushAll = (event, data) => { for (const id of streams.keys()) push(id, event, data); };

function notify(userId, type, title, body, link = '') {
  const n = { id: uid('n'), userId, type, title, body, link, at: now(), read: false };
  db.notifications.push(n);
  if (db.notifications.length > 5000) db.notifications.splice(0, 1000);
  push(userId, 'notification', n);
  return n;
}
function audit(by, action, target, reason = '', extra = {}) {
  db.audit.push({ id: uid('a'), by, action, target, reason, at: now(), ...extra });
}
function flag(userId, kind, detail, ref = {}) {
  const recent = db.flags.find((f) => f.userId === userId && f.kind === kind && f.status === 'open' && now() - f.at < DAY);
  if (recent) { recent.count = (recent.count || 1) + 1; recent.detail = detail; return recent; }
  const f = { id: uid('f'), userId, kind, detail, at: now(), status: 'open', count: 1, ...ref };
  db.flags.push(f);
  for (const a of db.users.filter((u) => u.isAdmin)) push(a.id, 'admin', { kind: 'flag' });
  return f;
}

// ------------------------------------------------------------------ wallet & escrow
function ledger(userId, type, amount, note, dealId = null) {
  db.ledger.push({ id: uid('l'), userId, type, amount, note, dealId, at: now() });
}
function hold(u, total, note, ref) {
  if (total <= 0) return;
  if (u.wallet.balance < total) fail(402, `Insufficient wallet balance. You need ₹${total - u.wallet.balance} more — top up via UPI first.`, { need: total - u.wallet.balance });
  u.wallet.balance -= total; u.wallet.escrow += total;
  ledger(u.id, 'hold', -total, note, ref);
}
function refundHold(u, total, note, ref) {
  if (total <= 0) return;
  u.wallet.escrow -= total; u.wallet.balance += total;
  ledger(u.id, 'refund', total, note, ref);
}
function releaseDeal(d, note = 'Released after both sides confirmed') {
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

// ------------------------------------------------------------------ helpers: users
function normPhone(p) { const d = String(p || '').replace(/\D/g, '').slice(-10); return /^[6-9]\d{9}$/.test(d) ? d : null; }
function isActive(u) {
  if (u.status === 'banned') return false;
  if (u.status === 'suspended' && u.suspendedUntil > now()) return false;
  return true;
}
function requireActive(u) {
  if (u.status === 'banned') fail(403, `Your account is permanently banned. Reason: ${u.statusReason || 'repeated violations'}.`);
  if (u.status === 'suspended' && u.suspendedUntil > now())
    fail(403, `Your account is suspended until ${new Date(u.suspendedUntil).toLocaleString('en-IN')}. Reason: ${u.statusReason}. You can still view and chat about active deals.`);
}

function applyStrike(u, reason, by) {
  u.strikes.push({ reason, by, at: now() });
  const n = u.strikes.length, s = S();
  let level;
  if (n === 1) { level = 'warning'; }
  else if (n === 2) { level = 'suspension'; u.status = 'suspended'; u.suspendedUntil = now() + s.strikeSuspendDays * DAY; u.statusReason = reason; }
  else { level = 'ban'; u.status = 'banned'; u.statusReason = reason; }
  const msg = { warning: 'Official warning (strike 1 of 3)', suspension: `Suspended for ${s.strikeSuspendDays} days (strike 2 of 3)`, ban: 'Permanently banned (strike 3)' }[level];
  notify(u.id, 'strike', msg, `Reason: ${reason}`, '#/settings/account');
  audit(by, `strike:${level}`, u.id, reason);
  return level;
}

function userStats(u) {
  const mine = db.deals.filter((d) => d.payerId === u.id || d.payeeId === u.id);
  const paid = mine.filter((d) => d.status === 'paid');
  const reviews = db.reviews.filter((r) => r.to === u.id);
  const rating = reviews.length ? +(reviews.reduce((a, r) => a + r.stars, 0) / reviews.length).toFixed(2) : null;
  const engaged = mine.filter((d) => !['offered', 'declined', 'expired'].includes(d.status) || d.cancelBy === u.id);
  const cancelled = mine.filter((d) => d.cancelBy === u.id).length;
  const cancelRate = engaged.length ? Math.round((cancelled / engaged.length) * 100) : 0;
  const responded = mine.filter((d) => d.respondedBy === u.id && d.respondedAt);
  const respMins = responded.length ? Math.round(median(responded.map((d) => (d.respondedAt - d.createdAt) / 60000))) : null;
  const roles = {
    seller: paid.filter((d) => d.type === 'buy' && d.payeeId === u.id).length,
    buyer: paid.filter((d) => d.type === 'buy' && d.payerId === u.id).length,
    poster: paid.filter((d) => d.type !== 'buy' && d.payerId === u.id).length,
    helper: paid.filter((d) => d.type !== 'buy' && d.payeeId === u.id).length,
  };
  const completed = paid.length;
  // Trust score: transparent, explainable 0–100
  let trust = 30; // verified campus member
  trust += rating ? Math.round(((rating - 1) / 4) * 30) : 12;
  trust += Math.min(20, completed * 2);
  trust += Math.max(0, 15 - Math.round(cancelRate / 4));
  trust -= u.strikes.length * 15;
  trust += respMins != null && respMins < 30 ? 5 : 0;
  trust = Math.max(0, Math.min(100, trust));
  return { completed, rating, reviews: reviews.length, cancelRate, respMins, roles, trust };
}

function badgesFor(u, st = userStats(u)) {
  const b = [{ id: 'verified', en: 'Verified', icon: '✔' }];
  if (st.completed >= 1) b.push({ id: 'first', en: 'First deal', icon: '🌱' });
  if (st.completed >= 10 && (st.rating || 0) >= 4.5) b.push({ id: 'trusted', en: 'Trusted trader', icon: '🛡️' });
  const reused = db.deals.filter((d) => d.type === 'buy' && d.payeeId === u.id && d.status === 'paid').length;
  if (reused >= 3) b.push({ id: 'eco', en: 'Eco hero', icon: '♻️' });
  if (db.deals.some((d) => d.type === 'buy' && d.amount === 0 && d.payeeId === u.id && d.status === 'paid')) b.push({ id: 'giver', en: 'Giver', icon: '🎁' });
  if (st.roles.helper >= 5) b.push({ id: 'runner', en: 'Campus runner', icon: '🏃' });
  if (st.respMins != null && st.respMins <= 15 && st.completed >= 3) b.push({ id: 'swift', en: 'Swift replier', icon: '⚡' });
  if (db.users.some((x) => x.referredBy === u.id)) b.push({ id: 'connector', en: 'Connector', icon: '🔗' });
  return b;
}

function hasActiveDealWith(a, b) {
  return db.deals.some((d) => ['accepted', 'in_progress', 'delivered', 'disputed'].includes(d.status) &&
    ((d.payerId === a && d.payeeId === b) || (d.payerId === b && d.payeeId === a)));
}

function publicUser(u, viewer, { full = false } = {}) {
  if (!u) return null;
  if (u.deleted) return { id: u.id, name: 'Deleted user', avatar: null, deleted: true };
  const st = userStats(u);
  const close = viewer && (viewer.id === u.id || viewer.isAdmin || hasActiveDealWith(viewer.id, u.id));
  const p = u.privacy || {};
  const out = {
    id: u.id, name: u.name, avatar: u.avatar, color: u.color, verified: true, isStaff: u.role === 'staff', isAdmin: !!u.isAdmin,
    dept: p.dept || close ? u.dept : null,
    year: p.year || close ? u.year : null,
    residence: p.residence || close ? u.residence : null,
    hostel: p.residence || close ? (locById(u.hostel)?.name || null) : null,
    bio: p.bio || close ? u.bio : null,
    joinedAt: u.createdAt, stats: st, trust: st.trust, newcomer: st.completed < 3,
    status: isActive(u) ? 'active' : u.status, strikes: u.strikes.length,
    phoneMasked: `+91 ••••• •••${u.phoneLast2 || '••'}`,
  };
  if (full) out.badges = badgesFor(u, st);
  return out;
}

function meView(u) {
  return {
    ...publicUser(u, u, { full: true }),
    email: decrypt(u.email), phone: decrypt(u.phone), collegeId: u.collegeId, dept: u.dept, year: u.year,
    residence: u.residence, hostelId: u.hostel, bio: u.bio, privacy: u.privacy, lang: u.lang, theme: u.theme,
    dataSaver: u.dataSaver, emergency: decrypt(u.emergency), wallet: u.wallet, wishlist: u.wishlist,
    blocked: u.blocked, referralCode: u.referralCode, feeWaivers: u.feeWaivers, consent: u.consent,
    status: u.status, statusReason: u.statusReason, suspendedUntil: u.suspendedUntil, strikesList: u.strikes,
    unread: db.notifications.filter((n) => n.userId === u.id && !n.read).length,
    unreadChats: unreadThreads(u.id),
    urgentLeft: Math.max(0, S().urgentPerDay - (u.urgentLog || []).filter((d) => d === istDayKey()).length),
    activeJobs: activeHelperJobs(u.id),
  };
}

function activeHelperJobs(userId) {
  return db.deals.filter((d) => d.payeeId === userId && d.type !== 'buy' && ['accepted', 'in_progress', 'delivered'].includes(d.status)).length;
}
function committedToday(userId) {
  const day = istDayKey();
  const deals = db.deals.filter((d) => d.payerId === userId && istDayKey(d.createdAt) === day && !['declined', 'cancelled', 'expired', 'refunded'].includes(d.status) && !d.fromTask).reduce((a, d) => a + d.total, 0);
  const tasks = db.tasks.filter((t) => t.posterId === userId && istDayKey(t.createdAt) === day && t.kind !== 'group' && !['cancelled', 'expired'].includes(t.status)).reduce((a, t) => a + (t.total || 0), 0);
  return deals + tasks;
}
function checkDaily(u, add) {
  const s = S(), used = committedToday(u.id);
  if (used + add > s.dailyLimit) fail(400, `Daily limit reached: you can commit up to ₹${s.dailyLimit} per day (₹${Math.max(0, s.dailyLimit - used)} left today). This protects everyone from large losses.`);
}

// ------------------------------------------------------------------ deals
const ACTIVE = ['accepted', 'in_progress', 'delivered'];
function step(d, status, by, note = '') {
  d.status = status;
  d.timeline.push({ s: status, at: now(), by, note });
}
function newOtp() { return String(crypto.randomInt(1000, 9999)); }

function createDeal({ type, refId, title, payer, payee, amount, offeredBy, note, meetPoint, when, fromTask = false, status = 'offered', escrowHeld = 0, fee, total }) {
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

function dealView(d, me) {
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

function afterPaid(d) {
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

function dealUpdate(d, by, title, body) {
  const other = by === d.payerId ? d.payeeId : d.payerId;
  if (title) notify(other, 'deal', title, body, `#/deal/${d.id}`);
  push(d.payerId, 'deal', { id: d.id }); push(d.payeeId, 'deal', { id: d.id });
}

function cancelDeal(d, by, reason, { toTask = true } = {}) {
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

// ------------------------------------------------------------------ chat
function ensureThread(members, refType, refId, title) {
  const key = [...members].sort().join(':') + '|' + refType + '|' + refId;
  let t = db.threads.find((x) => x.key === key);
  if (!t) {
    t = { id: uid('t'), key, members: [...members], refType, refId, title, createdAt: now(), lastAt: now(), reads: {} };
    db.threads.push(t);
  }
  return t;
}
function sysMsg(t, text) {
  const m = { id: uid('m'), threadId: t.id, from: null, system: true, text, at: now() };
  db.messages.push(m); t.lastAt = m.at;
  for (const id of t.members) push(id, 'message', { threadId: t.id, message: m });
}
function unreadThreads(userId) {
  return db.threads.filter((t) => t.members.includes(userId) && db.messages.some((m) => m.threadId === t.id && m.from && m.from !== userId && m.at > (t.reads[userId] || 0))).length;
}

// ------------------------------------------------------------------ reports & disputes
function reportView(r) {
  if (!r) return null;
  return { ...r, overdue: r.status === 'open' && now() > r.dueAt, slaLeftMs: r.status === 'open' ? r.dueAt - now() : 0 };
}
function createReport({ reporter, targetType, targetId, reason, details, kind = 'report', dealId = null, targetUserId = null }) {
  const r = {
    id: uid('r'), kind, reporterId: reporter.id, targetType, targetId, targetUserId, reason: clampStr(reason, 80),
    details: clampStr(details, 1000), dealId, status: 'open', createdAt: now(), dueAt: now() + S().disputeSlaHours * H, decision: null,
  };
  db.reports.push(r);
  for (const a of db.users.filter((u) => u.isAdmin)) { notify(a.id, 'admin', kind === 'dispute' ? 'New dispute' : 'New report', `${r.reason} — review within ${S().disputeSlaHours}h`, '#/admin/reports'); push(a.id, 'admin', { kind }); }
  return r;
}

// ------------------------------------------------------------------ views for listings & tasks
function listingView(l, me, { detail = false } = {}) {
  const seller = find('users', l.sellerId);
  const v = {
    id: l.id, kind: 'listing', title: l.title, desc: detail ? l.desc : l.desc.slice(0, 120), category: l.category, condition: l.condition,
    price: l.price, free: l.price === 0, photos: detail ? l.photos : l.photos.slice(0, 1), meetPoint: l.meetPoint, status: l.status,
    createdAt: l.createdAt, seller: publicUser(seller, me), wish: me?.wishlist.includes(l.id), views: l.views || 0,
    priceReview: !!l.priceReview, mine: me?.id === l.sellerId,
  };
  if (detail) {
    v.priceHistory = l.priceHistory;
    v.fair = l.price > 0 ? suggestPrice(l, db.listings.filter((x) => x.id !== l.id)) : null;
    v.myDeal = me ? db.deals.find((d) => d.refId === l.id && d.payerId === me.id && !['declined', 'cancelled', 'expired'].includes(d.status))?.id : null;
    v.offerCount = db.deals.filter((d) => d.refId === l.id && d.status === 'offered').length;
    if (me?.id === l.sellerId || me?.isAdmin) v.offers = db.deals.filter((d) => d.refId === l.id && d.type === 'buy').sort((a, b) => a.createdAt - b.createdAt).map((d) => ({ id: d.id, status: d.status, amount: d.amount, note: d.note, at: d.createdAt, buyer: publicUser(find('users', d.payerId), me) }));
    v.removedReason = l.removedReason;
  }
  return v;
}

function taskView(t, me, { detail = false } = {}) {
  const poster = find('users', t.posterId);
  const v = {
    id: t.id, kind: t.kind, title: t.title, desc: detail ? t.desc : t.desc.slice(0, 120), reward: t.reward, fee: t.fee, total: t.total,
    deadline: t.deadline, urgent: t.urgent, location: t.location, pickup: t.pickup, drop: t.drop, size: t.size,
    distance: t.pickup && t.drop ? distance(t.pickup, t.drop) : null, status: t.status, createdAt: t.createdAt,
    poster: publicUser(poster, me), offerCount: t.offers.length, secured: t.escrow > 0 || t.kind === 'group',
    capacity: t.capacity, joined: t.kind === 'group' ? db.deals.filter((d) => d.refId === t.id && !['declined', 'cancelled', 'expired'].includes(d.status)).length : undefined,
    assignMode: t.assignMode, mine: me?.id === t.posterId, photos: t.photos || [],
  };
  if (detail) {
    v.myOffer = me ? t.offers.find((o) => o.helperId === me.id) || null : null;
    v.removedReason = t.removedReason;
    const myDeal = me && db.deals.find((d) => d.refId === t.id && (d.payerId === me.id || d.payeeId === me.id) && !['declined', 'cancelled', 'expired'].includes(d.status));
    v.myDeal = myDeal?.id || null;
    if (me && (me.id === t.posterId || me.isAdmin)) {
      // Equal prioritisation: show every offer in arrival order; suggest the helper with the fewest recent jobs
      const offers = t.offers.map((o, i) => {
        const h = find('users', o.helperId);
        const jobs7 = db.deals.filter((d) => d.payeeId === h.id && d.type !== 'buy' && now() - d.createdAt < 7 * DAY && d.status !== 'cancelled').length;
        return { ...o, order: i + 1, helper: publicUser(h, me), jobs7, active: activeHelperJobs(h.id), atCap: activeHelperJobs(h.id) >= S().helperActiveCap };
      });
      const eligible = offers.filter((o) => !o.atCap && (o.helper.stats.rating ?? 4) >= 3.5);
      if (eligible.length > 1) {
        const pick = [...eligible].sort((a, b) => a.jobs7 - b.jobs7 || a.order - b.order)[0];
        pick.fairPick = true;
      }
      v.offers = offers;
      if (t.kind === 'group') v.joins = db.deals.filter((d) => d.refId === t.id).map((d) => ({ id: d.id, status: d.status, amount: d.amount, note: d.note, user: publicUser(find('users', d.payerId), me) }));
    }
  }
  return v;
}

// Fair feed: interleave fresh/new-user posts with established ones; rotation seed changes hourly per viewer.
function fairRank(items, me) {
  const seed = Math.floor(now() / H) + (me?.id || '');
  const rnd = (id) => parseInt(sha(id + seed).slice(0, 8), 16) / 0xffffffff;
  const scored = items.map((it) => {
    const owner = it.seller || it.poster;
    const age = (now() - it.createdAt) / H;
    const reasons = [];
    if (owner?.newcomer) reasons.push('new_member');
    if (age < 24) reasons.push('fresh');
    if ((owner?.stats.rating || 0) >= 4.5 && owner.stats.reviews >= 3) reasons.push('well_rated');
    if (!reasons.length) reasons.push('rotation');
    const fresh = owner?.newcomer || age < 24;
    const score = fresh ? Math.exp(-age / 36) * 0.6 + rnd(it.id) * 0.4 : ((owner?.stats.rating || 3.5) / 5) * 0.5 + rnd(it.id) * 0.5;
    return { ...it, why: reasons, _fresh: fresh, _score: score };
  });
  const A = scored.filter((x) => x._fresh).sort((a, b) => b._score - a._score);
  const B = scored.filter((x) => !x._fresh).sort((a, b) => b._score - a._score);
  const out = [];
  while (A.length || B.length) { if (A.length) out.push(A.shift()); if (B.length) out.push(B.shift()); }
  return out.map(({ _fresh, _score, ...x }) => x);
}

const blockedBetween = (me, otherId) => {
  const o = find('users', otherId);
  return me.blocked.includes(otherId) || (o && o.blocked.includes(me.id));
};

// ------------------------------------------------------------------ validation helpers
function validPhotos(photos, { required = false, max = 4 } = {}) {
  const arr = Array.isArray(photos) ? photos.slice(0, max) : [];
  for (const p of arr) {
    if (typeof p !== 'string' || !/^data:image\/(png|jpeg|webp);base64,/.test(p)) fail(400, 'Photos must be PNG, JPEG or WebP images.');
    if (p.length > 600_000) fail(400, 'Each photo must be under ~450 KB. The app compresses photos automatically — please retry.');
  }
  if (required && !arr.length) fail(400, 'Please add at least one real photo — photo proof is required for every listing.');
  return arr;
}
function validDeadline(deadline) {
  const s = S(), t = new Date(deadline).getTime();
  if (!t || t < now() + 10 * 60000) fail(400, 'Deadline must be at least 10 minutes from now.');
  if (t > now() + s.maxTaskDays * DAY) fail(400, `Deadline can be at most ${s.maxTaskDays} days away.`);
  if (!withinHours(t, s)) fail(400, `Tasks and deliveries are allowed only within campus hours (${s.campusOpen}–${s.campusClose} IST).`);
  return t;
}

// ------------------------------------------------------------------ router
const routes = [];
function route(method, pattern, handler, opts = {}) {
  const keys = [];
  const re = new RegExp('^' + pattern.replace(/:(\w+)/g, (_, k) => { keys.push(k); return '([^/]+)'; }) + '$');
  routes.push({ method, re, keys, handler, opts });
}
const GET = (p, h, o) => route('GET', p, h, o), POST = (p, h, o) => route('POST', p, h, o);
const PATCH = (p, h, o) => route('PATCH', p, h, o), DEL = (p, h, o) => route('DELETE', p, h, o);

// simple rate limiter
const buckets = new Map();
function rateLimit(key, max, windowMs) {
  const b = buckets.get(key) || { n: 0, reset: now() + windowMs };
  if (now() > b.reset) { b.n = 0; b.reset = now() + windowMs; }
  b.n++; buckets.set(key, b);
  if (b.n > max) fail(429, 'Too many attempts. Please wait a few minutes and try again.');
}

// ================================================================== ROUTES
// ---------- config (public)
GET('/api/config', () => ({
  campus: { name: CAMPUS.name, short: CAMPUS.short, emailDomains: CAMPUS.emailDomains, collegeIdPattern: CAMPUS.collegeIdPattern, securityPhone: CAMPUS.securityPhone, securityName: CAMPUS.securityName },
  categories: CATEGORIES, conditions: CONDITIONS, locations: LOCATIONS, departments: DEPARTMENTS,
  settings: S(), prohibited: PROHIBITED_SUMMARY, rules: RULES_TEXT, demo: DEMO,
  supportUserId: db.users.find((u) => u.isAdmin && !u.deleted)?.id || null,
  demoUsers: DEMO ? db.users.filter((u) => u.demo).map((u) => ({ id: u.id, name: u.name, avatar: u.avatar, color: u.color, persona: u.demo, isAdmin: !!u.isAdmin })) : [],
}), { auth: false });

// ---------- auth
POST('/api/auth/otp', ({ body, ip }) => {
  const phone = normPhone(body.phone);
  if (!phone) fail(400, 'Enter a valid 10-digit Indian mobile number.');
  rateLimit('otp:' + phone, 5, 10 * 60000); rateLimit('otpip:' + ip, 20, 10 * 60000);
  const exists = db.users.some((u) => u.phoneHash === hmac(phone) && !u.deleted);
  if (body.purpose === 'login' && !exists) fail(404, 'No account with this number. Please sign up with your college details.');
  if (body.purpose === 'signup' && exists) fail(409, 'This phone number is already registered — one account per phone. Please log in.');
  const code = String(crypto.randomInt(100000, 999999));
  db.otps = db.otps.filter((o) => o.phoneHash !== hmac(phone) && o.exp > now());
  db.otps.push({ phoneHash: hmac(phone), codeHash: sha(code + phone), exp: now() + 5 * 60000, tries: 0 });
  console.log(`[otp] ${phone.slice(0, 2)}••••••${phone.slice(-2)} → ${code}`);
  return { sent: true, expiresIn: 300, demoOtp: DEMO ? code : undefined };
}, { auth: false });

function checkOtp(phone, code) {
  const o = db.otps.find((x) => x.phoneHash === hmac(phone) && x.exp > now());
  if (!o) fail(400, 'OTP expired. Please request a new one.');
  if (++o.tries > 5) fail(429, 'Too many wrong attempts. Request a new OTP.');
  if (o.codeHash !== sha(String(code).trim() + phone)) fail(400, 'Incorrect OTP.');
  db.otps = db.otps.filter((x) => x !== o);
}
function newSession(u) {
  const token = crypto.randomBytes(32).toString('hex');
  db.sessions.push({ id: uid('s'), tokenHash: sha(token), userId: u.id, createdAt: now(), lastSeen: now() });
  u.lastActive = now();
  return { token, me: meView(u) };
}

POST('/api/auth/signup', ({ body }) => {
  const phone = normPhone(body.phone);
  if (!phone) fail(400, 'Enter a valid 10-digit mobile number.');
  const name = clampStr(body.name, 40);
  if (name.length < 2) fail(400, 'Please enter your full name as on your college ID.');
  const email = clampStr(body.email, 80).toLowerCase();
  const domain = email.split('@')[1];
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || !CAMPUS.emailDomains.includes(domain)) fail(400, `Use your official college email (@${CAMPUS.emailDomains[0]}). Only verified campus members can join.`);
  const collegeId = clampStr(body.collegeId, 16).toUpperCase();
  if (!new RegExp(CAMPUS.collegeIdPattern).test(collegeId)) fail(400, 'College ID format looks wrong (e.g. CS21045).');
  if (!DEPARTMENTS.includes(body.dept)) fail(400, 'Choose your department.');
  if (!body.consent?.terms || !body.consent?.privacy) fail(400, 'Please accept the Terms and Privacy Policy to continue.');
  if (db.users.some((u) => !u.deleted && u.collegeId === collegeId)) fail(409, 'An account already exists for this college ID — one account per ID.');
  if (db.users.some((u) => !u.deleted && u.emailHash === hmac(email))) fail(409, 'This college email is already registered.');
  if (db.users.some((u) => !u.deleted && u.phoneHash === hmac(phone))) fail(409, 'This phone number is already registered.');
  checkOtp(phone, body.otp);
  const isStaff = body.dept === 'Administration' || domain.startsWith('staff.');
  const ref = body.referral ? db.users.find((u) => u.referralCode === String(body.referral).trim().toUpperCase()) : null;
  const u = makeUser({
    name, email, phone, collegeId, dept: body.dept, year: isStaff ? 'Staff' : String(Math.min(5, Math.max(1, int(body.year) || 1))),
    role: isStaff ? 'staff' : 'student', residence: body.residence === 'hostel' ? 'hostel' : 'day',
    hostel: body.residence === 'hostel' && locById(body.hostel) ? body.hostel : null,
    bio: clampStr(body.bio, 160), avatar: typeof body.avatar === 'string' && body.avatar.length < 200_000 && body.avatar.startsWith('data:image/') ? body.avatar : null,
    referredBy: ref?.id || null, consent: { terms: true, privacy: true, location: !!body.consent.location, camera: !!body.consent.camera, notifications: !!body.consent.notifications, at: now(), version: '1.0' },
  });
  if (['en', 'ta'].includes(body.lang)) u.lang = body.lang;
  u.wallet.balance = DEMO ? 300 : 0; // demo wallet credit
  if (DEMO) ledger(u.id, 'topup', 300, 'Welcome credit (demo mode)');
  db.users.push(u);
  notify(u.id, 'welcome', `Welcome to CampusLoop, ${name.split(' ')[0]}!`, 'Your campus identity is verified. Buy, sell, get help and deliver — every deal is protected by escrow.', '#/home');
  if (ref) notify(ref.id, 'referral', 'Your referral joined', `${name} joined using your code. You both earn a fee-free deal after their first completed deal.`);
  audit(u.id, 'signup', u.id);
  return newSession(u);
}, { auth: false });

export function makeUser(p) {
  const color = ['#1F5E4E', '#B5462E', '#7A4FB3', '#2F6FB0', '#A66A00', '#2E7D5B', '#B23A6E'][crypto.randomInt(7)];
  return {
    id: uid('u'), name: p.name, email: encrypt(p.email), emailHash: hmac(p.email), collegeId: p.collegeId,
    phone: encrypt(p.phone), phoneHash: hmac(p.phone), phoneLast2: p.phone.slice(-2), dept: p.dept, year: p.year,
    role: p.role || 'student', isAdmin: !!p.isAdmin, residence: p.residence || 'day', hostel: p.hostel || null,
    bio: p.bio || '', avatar: p.avatar || null, color: p.color || color, verified: { email: true, phone: true, collegeId: true, at: now() },
    createdAt: p.createdAt || now(), lastActive: now(), lang: 'en', theme: 'auto', dataSaver: false,
    privacy: { dept: true, year: true, residence: true, bio: true, leaderboard: true },
    emergency: encrypt(p.emergency || ''), strikes: [], status: 'active', suspendedUntil: null, statusReason: null,
    wallet: { balance: 0, escrow: 0, earned: 0, spent: 0 }, wishlist: [], blocked: [],
    referralCode: (p.name.split(' ')[0].slice(0, 5) + crypto.randomInt(100, 999)).toUpperCase(), referredBy: p.referredBy || null,
    feeWaivers: 0, urgentLog: [], consent: p.consent || { terms: true, privacy: true, at: now(), version: '1.0' }, deleted: false, demo: p.demo || null,
  };
}

POST('/api/auth/login', ({ body, ip }) => {
  const phone = normPhone(body.phone);
  if (!phone) fail(400, 'Enter a valid mobile number.');
  rateLimit('login:' + ip, 30, 10 * 60000);
  const u = db.users.find((x) => x.phoneHash === hmac(phone) && !x.deleted);
  if (!u) fail(404, 'No account found.');
  checkOtp(phone, body.otp);
  return newSession(u);
}, { auth: false });

POST('/api/auth/demo', ({ body }) => {
  if (!DEMO) fail(403, 'Demo login disabled.');
  const u = db.users.find((x) => x.id === body.userId && x.demo);
  if (!u) fail(404, 'Demo user not found.');
  return newSession(u);
}, { auth: false });

POST('/api/auth/logout', ({ token }) => { db.sessions = db.sessions.filter((s) => s.tokenHash !== sha(token)); return { ok: true }; });

// ---------- me & profiles
GET('/api/me', ({ user }) => meView(user));
PATCH('/api/me', ({ user, body }) => {
  // Verified fields (name, college ID, email, phone, department, year) cannot be edited.
  if ('bio' in body) user.bio = clampStr(body.bio, 160);
  if ('avatar' in body) user.avatar = typeof body.avatar === 'string' && body.avatar.startsWith('data:image/') && body.avatar.length < 200_000 ? body.avatar : null;
  if ('residence' in body) user.residence = body.residence === 'hostel' ? 'hostel' : 'day';
  if ('hostel' in body) user.hostel = locById(body.hostel) ? body.hostel : null;
  if (body.privacy) for (const k of ['dept', 'year', 'residence', 'bio', 'leaderboard']) if (k in body.privacy) user.privacy[k] = !!body.privacy[k];
  if (['en', 'ta'].includes(body.lang)) user.lang = body.lang;
  if (['auto', 'light', 'dark'].includes(body.theme)) user.theme = body.theme;
  if ('dataSaver' in body) user.dataSaver = !!body.dataSaver;
  if ('emergency' in body) user.emergency = encrypt(clampStr(body.emergency, 40));
  if (body.consent) for (const k of ['location', 'camera', 'notifications']) if (k in body.consent) user.consent[k] = !!body.consent[k];
  for (const k of ['name', 'collegeId', 'email', 'phone', 'dept', 'year']) if (k in body) fail(400, `“${k}” is verified and cannot be edited. Contact the admin if it is wrong.`);
  return meView(user);
});
GET('/api/me/export', ({ user }) => ({
  exportedAt: new Date().toISOString(), note: 'Your personal data held by CampusLoop (Digital Personal Data Protection Act, 2023).',
  profile: meView(user),
  listings: db.listings.filter((l) => l.sellerId === user.id), tasks: db.tasks.filter((t) => t.posterId === user.id),
  deals: db.deals.filter((d) => d.payerId === user.id || d.payeeId === user.id).map((d) => ({ ...d, otp: undefined })),
  reviewsGiven: db.reviews.filter((r) => r.from === user.id), reviewsReceived: db.reviews.filter((r) => r.to === user.id),
  messages: db.messages.filter((m) => m.from === user.id), ledger: db.ledger.filter((l) => l.userId === user.id),
  reports: db.reports.filter((r) => r.reporterId === user.id),
}));
DEL('/api/me', ({ user }) => {
  if (db.deals.some((d) => (d.payerId === user.id || d.payeeId === user.id) && (ACTIVE.includes(d.status) || d.status === 'disputed'))) fail(400, 'Finish or cancel your active deals before deleting your account.');
  if (user.wallet.balance > 0) fail(400, `Withdraw your wallet balance (₹${user.wallet.balance}) before deleting your account.`);
  Object.assign(user, { deleted: true, name: 'Deleted user', email: '', phone: '', emergency: '', bio: '', avatar: null, phoneHash: 'deleted:' + user.id, emailHash: 'deleted:' + user.id, collegeId: 'DELETED-' + user.id });
  for (const l of db.listings.filter((l) => l.sellerId === user.id && l.status === 'active')) l.status = 'removed';
  for (const t of db.tasks.filter((t) => t.posterId === user.id && t.status === 'open')) { t.status = 'cancelled'; }
  db.sessions = db.sessions.filter((s) => s.userId !== user.id);
  audit(user.id, 'account_deleted', user.id);
  return { ok: true };
});

GET('/api/users/:id', ({ user, params }) => {
  const u = find('users', params.id);
  if (!u) fail(404, 'User not found');
  const p = publicUser(u, user, { full: true });
  p.reviews = db.reviews.filter((r) => r.to === u.id).sort((a, b) => b.at - a.at).slice(0, 30).map((r) => ({ ...r, fromUser: publicUser(find('users', r.from), user) }));
  p.listings = db.listings.filter((l) => l.sellerId === u.id && l.status === 'active').map((l) => listingView(l, user));
  p.history = ['seller', 'buyer', 'poster', 'helper'].map((role) => ({ role, count: p.stats.roles[role] }));
  p.blockedByMe = user.blocked.includes(u.id);
  return p;
});
POST('/api/users/:id/block', ({ user, params }) => {
  if (params.id === user.id) fail(400, 'You cannot block yourself.');
  if (!user.blocked.includes(params.id)) user.blocked.push(params.id);
  return { blocked: true };
});
DEL('/api/users/:id/block', ({ user, params }) => { user.blocked = user.blocked.filter((x) => x !== params.id); return { blocked: false }; });

// ---------- feed & search
GET('/api/feed', ({ user, query }) => {
  const filter = query.filter || 'all';
  let items = [];
  if (filter === 'all' || filter === 'market' || filter === 'free')
    items.push(...db.listings.filter((l) => l.status === 'active' && l.sellerId !== user.id && !blockedBetween(user, l.sellerId) && (filter !== 'free' || l.price === 0)).map((l) => listingView(l, user)));
  if (filter === 'all' || filter === 'tasks')
    items.push(...db.tasks.filter((t) => t.status === 'open' && t.posterId !== user.id && !blockedBetween(user, t.posterId) && !t.urgent).map((t) => taskView(t, user)));
  const urgent = db.tasks.filter((t) => t.status === 'open' && t.urgent && t.posterId !== user.id && !blockedBetween(user, t.posterId))
    .sort((a, b) => a.deadline - b.deadline).map((t) => taskView(t, user)); // public rule: earliest deadline first
  const ann = db.announcements.filter((a) => !a.expiresAt || a.expiresAt > now()).sort((a, b) => (b.pinned - a.pinned) || b.at - a.at).slice(0, 3);
  const pulse = {
    dealsToday: db.deals.filter((d) => d.status === 'paid' && istDayKey(d.paidAt) === istDayKey()).length,
    openTasks: db.tasks.filter((t) => t.status === 'open').length,
    activeListings: db.listings.filter((l) => l.status === 'active').length,
    kgSaved: impact().kgSaved,
  };
  return { items: fairRank(items, user), urgent, announcements: ann, pulse };
});

GET('/api/search', ({ user, query }) => {
  const q = clampStr(query.q, 60).toLowerCase();
  if (!q) return { listings: [], tasks: [] };
  const m = (s) => s.toLowerCase().includes(q);
  return {
    listings: db.listings.filter((l) => l.status === 'active' && (m(l.title) || m(l.desc)) && !blockedBetween(user, l.sellerId)).slice(0, 30).map((l) => listingView(l, user)),
    tasks: db.tasks.filter((t) => t.status === 'open' && (m(t.title) || m(t.desc)) && !blockedBetween(user, t.posterId)).slice(0, 30).map((t) => taskView(t, user)),
  };
});

// ---------- marketplace
GET('/api/listings', ({ user, query }) => {
  let l = db.listings.filter((x) => x.status === 'active' && !blockedBetween(user, x.sellerId));
  if (query.cat) l = l.filter((x) => x.category === query.cat);
  if (query.free === '1') l = l.filter((x) => x.price === 0);
  if (query.mine === '1') l = db.listings.filter((x) => x.sellerId === user.id && x.status !== 'removed');
  if (query.wish === '1') l = db.listings.filter((x) => user.wishlist.includes(x.id));
  const sort = query.sort || 'fair';
  const views = l.map((x) => listingView(x, user));
  if (sort === 'price') return views.sort((a, b) => a.price - b.price);
  if (sort === 'new') return views.sort((a, b) => b.createdAt - a.createdAt);
  return query.mine === '1' || query.wish === '1' ? views.sort((a, b) => b.createdAt - a.createdAt) : fairRank(views, user);
});

GET('/api/price-suggest', ({ query }) => suggestPrice({ title: query.title || '', category: query.category, condition: query.condition }, db.listings));

POST('/api/listings', ({ user, body }) => {
  requireActive(user);
  rateLimit('post:' + user.id, 10, H);
  const s = S();
  const title = clampStr(body.title, 70), desc = clampStr(body.desc, 600);
  if (title.length < 4) fail(400, 'Give your item a clear title (at least 4 characters).');
  if (!CATEGORIES.some((c) => c.id === body.category)) fail(400, 'Choose a category.');
  if (!CONDITIONS.some((c) => c.id === body.condition)) fail(400, 'Choose the item condition.');
  const price = body.free ? 0 : int(body.price);
  if (price < 0) fail(400, 'Price cannot be negative.');
  if (price > s.maxItemPrice) fail(400, `Only small-value deals are allowed — the maximum per item is ₹${s.maxItemPrice}.`);
  if (!body.free && price < 1) fail(400, 'Enter a price, or mark the item as free to donate it.');
  const bad = prohibitedCheck(title, desc);
  if (bad) { flag(user.id, 'prohibited', `Tried to list: “${title}” — ${bad}`); fail(422, `This item can't be listed. ${bad}`, { rule: 'prohibited' }); }
  const dup = db.listings.find((l) => l.sellerId === user.id && ['active', 'reserved'].includes(l.status) && similarity(l.title, title) >= 0.75);
  if (dup) { flag(user.id, 'duplicate', `Duplicate of “${dup.title}”`, { refId: dup.id }); fail(409, `Looks like a duplicate of your listing “${dup.title}”. Edit that one instead.`, { rule: 'duplicate', id: dup.id }); }
  const photos = validPhotos(body.photos, { required: true });
  const meet = locById(body.meetPoint)?.safe ? body.meetPoint : 'library';
  const l = { id: uid('l'), sellerId: user.id, title, desc, category: body.category, condition: body.condition, price, photos, meetPoint: meet, status: 'active', createdAt: now(), views: 0, priceHistory: [{ price, at: now() }] };
  if (price > 0) {
    const sug = suggestPrice(l, db.listings);
    if (sug.samples >= 2 && price > sug.high * 2.5) { l.priceReview = true; flag(user.id, 'price', `“${title}” at ₹${price} vs fair ~₹${sug.suggested}`, { refId: l.id }); }
  }
  db.listings.push(l);
  pushAll('feed', { kind: 'listing' });
  return listingView(l, user, { detail: true });
});

GET('/api/listings/:id', ({ user, params }) => {
  const l = find('listings', params.id);
  if (!l || (l.status === 'removed' && l.sellerId !== user.id && !user.isAdmin)) fail(404, 'This listing is no longer available.');
  if (l.sellerId !== user.id) l.views = (l.views || 0) + 1;
  return listingView(l, user, { detail: true });
});
PATCH('/api/listings/:id', ({ user, params, body }) => {
  requireActive(user);
  const l = find('listings', params.id);
  if (!l || l.sellerId !== user.id) fail(404, 'Not found');
  if (l.status !== 'active') fail(400, 'Only active listings can be edited.');
  if (body.title || body.desc) {
    const title = clampStr(body.title ?? l.title, 70), desc = clampStr(body.desc ?? l.desc, 600);
    const bad = prohibitedCheck(title, desc); if (bad) fail(422, bad);
    l.title = title; l.desc = desc;
  }
  if (body.photos) l.photos = validPhotos(body.photos, { required: true });
  if ('price' in body && int(body.price) !== l.price) {
    const price = int(body.price);
    if (price < 0 || price > S().maxItemPrice) fail(400, `Price must be between ₹0 and ₹${S().maxItemPrice}.`);
    l.price = price; l.priceHistory.push({ price, at: now() });
    const changes = l.priceHistory.filter((p) => now() - p.at < DAY).length;
    if (changes > 3) flag(user.id, 'price', `Price of “${l.title}” changed ${changes} times in 24h`, { refId: l.id });
    for (const uId of db.users.filter((u) => u.wishlist.includes(l.id)).map((u) => u.id)) notify(uId, 'wishlist', 'Price update on your wishlist', `“${l.title}” is now ₹${price}.`, `#/listing/${l.id}`);
  }
  if (body.meetPoint && locById(body.meetPoint)?.safe) l.meetPoint = body.meetPoint;
  return listingView(l, user, { detail: true });
});
DEL('/api/listings/:id', ({ user, params }) => {
  const l = find('listings', params.id);
  if (!l || l.sellerId !== user.id) fail(404, 'Not found');
  if (l.status === 'reserved') fail(400, 'This item is reserved in an active deal. Cancel the deal first.');
  l.status = 'removed'; l.removedReason = 'Removed by you';
  for (const d of db.deals.filter((d) => d.refId === l.id && d.status === 'offered')) { cancelDeal(d, null, 'Listing removed by seller'); dealUpdate(d, user.id, 'Offer closed', `“${l.title}” was removed by the seller. Your money is refunded.`); }
  return { ok: true };
});
POST('/api/listings/:id/wishlist', ({ user, params }) => {
  const i = user.wishlist.indexOf(params.id);
  if (i >= 0) user.wishlist.splice(i, 1); else user.wishlist.push(params.id);
  return { wish: i < 0 };
});

// buy offer (make an offer / buy now / request a free item)
POST('/api/listings/:id/offer', ({ user, params, body }) => {
  requireActive(user);
  const l = find('listings', params.id);
  if (!l || l.status !== 'active') fail(400, 'This item is no longer available.');
  if (l.sellerId === user.id) fail(400, 'You cannot buy your own item.');
  if (blockedBetween(user, l.sellerId)) fail(403, 'You cannot deal with this user.');
  if (db.deals.some((d) => d.refId === l.id && d.payerId === user.id && ['offered', ...ACTIVE].includes(d.status))) fail(409, 'You already have an open offer on this item.');
  const amount = l.price === 0 ? 0 : int(body.amount ?? l.price);
  if (l.price > 0 && (amount < Math.ceil(l.price * 0.5) || amount > l.price)) fail(400, `Offers must be between ₹${Math.ceil(l.price * 0.5)} and ₹${l.price}.`);
  checkDaily(user, amount);
  const d = createDeal({ type: 'buy', refId: l.id, title: l.title, payer: user, payee: find('users', l.sellerId), amount, offeredBy: user.id, note: body.note, meetPoint: l.meetPoint, when: body.when ? new Date(body.when).getTime() : null });
  notify(l.sellerId, 'offer', amount === l.price ? (amount ? 'Someone wants to buy' : 'Request for your free item') : 'New offer received', `${user.name} ${amount ? `offered ₹${amount}` : 'requested'} for “${l.title}”. Accept to confirm the deal.`, `#/deal/${d.id}`);
  push(l.sellerId, 'deal', { id: d.id });
  return dealView(d, user);
});

// ---------- tasks, pick & drop, group runs
GET('/api/tasks', ({ user, query }) => {
  let t = db.tasks;
  if (query.mine === '1') t = t.filter((x) => x.posterId === user.id);
  else if (query.helping === '1') t = t.filter((x) => x.offers.some((o) => o.helperId === user.id) && x.status !== 'removed');
  else t = t.filter((x) => x.status === 'open' && !blockedBetween(user, x.posterId));
  if (query.kind) t = t.filter((x) => x.kind === query.kind);
  const views = t.map((x) => taskView(x, user));
  if (query.mine === '1' || query.helping === '1') return views.sort((a, b) => b.createdAt - a.createdAt);
  const urgent = views.filter((v) => v.urgent).sort((a, b) => a.deadline - b.deadline);
  return [...urgent, ...fairRank(views.filter((v) => !v.urgent), user)];
});

GET('/api/fare', ({ query }) => ({ distance: distance(query.from, query.to), fare: fairFare(query.from, query.to, query.size), formula: '₹10 base + ₹3 per 100 m + size surcharge, rounded to ₹5' }));

POST('/api/tasks', ({ user, body }) => {
  requireActive(user);
  rateLimit('post:' + user.id, 10, H);
  const s = S();
  const kind = ['task', 'pickdrop', 'group'].includes(body.kind) ? body.kind : 'task';
  const title = clampStr(body.title, 70), desc = clampStr(body.desc, 600);
  if (title.length < 4) fail(400, 'Describe the task in a short title.');
  const reward = int(body.reward);
  if (reward < 5) fail(400, 'Minimum reward is ₹5.');
  if (reward > s.maxTaskReward) fail(400, `Maximum reward per task is ₹${s.maxTaskReward}.`);
  const bad = prohibitedCheck(title, desc);
  if (bad) { flag(user.id, 'prohibited', `Task: “${title}” — ${bad}`); fail(422, `This task isn't allowed. ${bad}`, { rule: 'prohibited' }); }
  const deadline = validDeadline(body.deadline);
  const urgent = !!body.urgent;
  if (urgent) {
    const used = (user.urgentLog || []).filter((d) => d === istDayKey()).length;
    if (used >= s.urgentPerDay) fail(400, `Urgent posts are limited to ${s.urgentPerDay} per person per day so everyone gets a fair chance.`);
  }
  const t = {
    id: uid('k'), kind, posterId: user.id, title, desc, reward, deadline, urgent, createdAt: now(), status: 'open', offers: [],
    assignMode: body.assignMode === 'first' ? 'first' : 'choose', photos: validPhotos(body.photos, { max: 2 }),
    location: locById(body.location) ? body.location : null, escrow: 0,
  };
  if (kind === 'pickdrop') {
    if (!locById(body.pickup) || !locById(body.drop) || body.pickup === body.drop) fail(400, 'Choose different pick-up and drop points on campus.');
    t.pickup = body.pickup; t.drop = body.drop; t.size = ['small', 'medium', 'large'].includes(body.size) ? body.size : 'small';
  }
  if (kind === 'group') {
    t.capacity = Math.min(10, Math.max(2, int(body.capacity) || 4));
    t.location = locById(body.location) ? body.location : 'canteen';
    t.drop = locById(body.drop) ? body.drop : 'hosgate';
    // group runs: the runner is the poster; joiners pay per order when they join
    t.fee = 0; t.total = 0;
  } else {
    const br = breakdown(reward, s);
    checkDaily(user, br.total);
    hold(user, br.total, `Reward locked for task “${title}”`, t.id);
    t.fee = br.fee; t.total = br.total; t.escrow = br.total;
  }
  if (urgent) user.urgentLog = [...(user.urgentLog || []).filter((d) => d === istDayKey()), istDayKey()];
  db.tasks.push(t);
  pushAll('feed', { kind: 'task' });
  return taskView(t, user, { detail: true });
});

GET('/api/tasks/:id', ({ user, params }) => {
  const t = find('tasks', params.id);
  if (!t || (t.status === 'removed' && t.posterId !== user.id && !user.isAdmin)) fail(404, 'This task is no longer available.');
  return taskView(t, user, { detail: true });
});

DEL('/api/tasks/:id', ({ user, params }) => {
  const t = find('tasks', params.id);
  if (!t || t.posterId !== user.id) fail(404, 'Not found');
  if (t.status !== 'open') fail(400, 'Only open tasks can be cancelled. For an assigned task, cancel the deal with the helper.');
  t.status = 'cancelled';
  if (t.escrow) { refundHold(user, t.escrow, `Refund: task “${t.title}” cancelled`, t.id); t.escrow = 0; }
  for (const o of t.offers) notify(o.helperId, 'task', 'Task cancelled', `“${t.title}” was cancelled by the poster.`);
  if (t.kind === 'group') for (const d of db.deals.filter((d) => d.refId === t.id && ['offered', ...ACTIVE].includes(d.status))) { cancelDeal(d, user.id, 'Group run cancelled by runner', { toTask: false }); dealUpdate(d, user.id, 'Group run cancelled', `“${t.title}” was cancelled. Your money is refunded.`); }
  return { ok: true };
});

function assign(t, helperId, by) {
  const poster = find('users', t.posterId), helper = find('users', helperId);
  if (activeHelperJobs(helperId) >= S().helperActiveCap) fail(400, `${helper.name} already has ${S().helperActiveCap} active jobs (fair-share cap). Choose another helper.`);
  const offer = t.offers.find((o) => o.helperId === helperId);
  const d = createDeal({
    type: t.kind, refId: t.id, title: t.title, payer: poster, payee: helper, amount: t.reward, fee: t.fee, total: t.total,
    offeredBy: helperId, note: offer?.note, meetPoint: t.pickup || t.location, when: t.deadline, fromTask: true, escrowHeld: t.escrow, status: 'accepted',
  });
  d.respondedBy = poster.id; d.respondedAt = now();
  t.escrow = 0; t.status = 'assigned'; t.dealId = d.id; t.assignedAt = now();
  for (const o of t.offers.filter((o) => o.helperId !== helperId)) notify(o.helperId, 'task', 'Task assigned to someone else', `“${t.title}” was given to another helper. Thanks for offering — keep an eye on the board!`);
  notify(helperId, 'deal', 'You got the task! 🎉', `${poster.name} accepted your offer for “${t.title}”. ₹${t.reward} is secured in escrow.`, `#/deal/${d.id}`);
  push(helperId, 'deal', { id: d.id }); push(poster.id, 'deal', { id: d.id });
  return d;
}

POST('/api/tasks/:id/offers', ({ user, params, body }) => {
  requireActive(user);
  const t = find('tasks', params.id);
  if (!t || t.status !== 'open') fail(400, 'This task is no longer open.');
  if (t.posterId === user.id) fail(400, 'You cannot take your own task.');
  if (t.kind === 'group') fail(400, 'Use “Join run” for group orders.');
  if (blockedBetween(user, t.posterId)) fail(403, 'You cannot deal with this user.');
  if (t.offers.some((o) => o.helperId === user.id)) fail(409, 'You already offered to help.');
  if (activeHelperJobs(user.id) >= S().helperActiveCap) fail(400, `You already have ${S().helperActiveCap} active jobs. Finish one first — this cap keeps work fairly shared.`);
  t.offers.push({ helperId: user.id, note: clampStr(body.note, 200), eta: clampStr(body.eta, 30), at: now() });
  if (t.assignMode === 'first') {
    const d = assign(t, user.id, 'auto');
    return { assigned: true, dealId: d.id };
  }
  notify(t.posterId, 'offer', 'New helper offer', `${user.name} offered to help with “${t.title}”.`, `#/task/${t.id}`);
  push(t.posterId, 'task', { id: t.id });
  return { assigned: false, offers: t.offers.length };
});
DEL('/api/tasks/:id/offers', ({ user, params }) => {
  const t = find('tasks', params.id);
  if (!t) fail(404, 'Not found');
  t.offers = t.offers.filter((o) => o.helperId !== user.id);
  return { ok: true };
});
POST('/api/tasks/:id/assign', ({ user, params, body }) => {
  requireActive(user);
  const t = find('tasks', params.id);
  if (!t || t.posterId !== user.id) fail(404, 'Not found');
  if (t.status !== 'open') fail(400, 'Task is not open.');
  if (!t.offers.some((o) => o.helperId === body.helperId)) fail(400, 'This helper has not offered.');
  const d = assign(t, body.helperId, user.id);
  return dealView(d, user);
});
POST('/api/tasks/:id/join', ({ user, params, body }) => {
  requireActive(user);
  const t = find('tasks', params.id);
  if (!t || t.kind !== 'group' || t.status !== 'open') fail(400, 'This group run is not open.');
  if (t.posterId === user.id) fail(400, 'You are the runner.');
  if (blockedBetween(user, t.posterId)) fail(403, 'You cannot deal with this user.');
  const live = db.deals.filter((d) => d.refId === t.id && !['declined', 'cancelled', 'expired'].includes(d.status));
  if (live.length >= t.capacity) fail(400, 'This run is full.');
  if (live.some((d) => d.payerId === user.id)) fail(409, 'You already joined this run.');
  const item = clampStr(body.item, 120); if (item.length < 2) fail(400, 'Tell the runner what to bring.');
  const bad = prohibitedCheck(item); if (bad) fail(422, bad);
  const itemCost = Math.max(0, int(body.itemCost));
  if (itemCost > 300) fail(400, 'Group-run orders are limited to ₹300 of items.');
  const amount = t.reward + itemCost;
  checkDaily(user, amount);
  const d = createDeal({ type: 'group', refId: t.id, title: `${t.title}: ${item}`, payer: user, payee: find('users', t.posterId), amount, offeredBy: user.id, note: `${item} (items ₹${itemCost} + carry ₹${t.reward})`, meetPoint: t.drop, when: t.deadline });
  d.itemCost = itemCost;
  notify(t.posterId, 'offer', 'New order for your run', `${user.name} wants: ${item}`, `#/deal/${d.id}`);
  push(t.posterId, 'deal', { id: d.id });
  return dealView(d, user);
});

// ---------- deals
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

// ---------- chat
GET('/api/threads', ({ user }) => db.threads.filter((t) => t.members.includes(user.id)).sort((a, b) => b.lastAt - a.lastAt).slice(0, 100).map((t) => {
  const msgs = db.messages.filter((m) => m.threadId === t.id);
  const last = msgs.at(-1);
  const other = find('users', t.members.find((m) => m !== user.id));
  const d = t.refType === 'deal' ? find('deals', t.refId) : null;
  return { id: t.id, title: t.title, refType: t.refType, refId: t.refId, lastAt: t.lastAt, last: last ? { text: last.text, system: last.system, from: last.from } : null, other: publicUser(other, user), unread: msgs.filter((m) => m.from && m.from !== user.id && m.at > (t.reads[user.id] || 0)).length, dealStatus: d?.status };
}));
POST('/api/threads', ({ user, body }) => {
  requireActive(user);
  const other = find('users', body.userId);
  if (!other || other.id === user.id) fail(400, 'Invalid user.');
  if (blockedBetween(user, other.id)) fail(403, 'You cannot message this user.');
  let title = 'Chat';
  if (body.refType === 'listing') title = find('listings', body.refId)?.title || title;
  if (body.refType === 'task') title = find('tasks', body.refId)?.title || title;
  if (body.refType === 'lostfound') title = find('lostfound', body.refId)?.title || title;
  const t = ensureThread([user.id, other.id], body.refType || 'direct', body.refId || '-', title);
  return { id: t.id };
});
GET('/api/threads/:id', ({ user, params }) => {
  const t = find('threads', params.id);
  if (!t || (!t.members.includes(user.id) && !user.isAdmin)) fail(404, 'Chat not found');
  if (t.members.includes(user.id)) t.reads[user.id] = now();
  const other = find('users', t.members.find((m) => m !== user.id));
  return { ...t, key: undefined, other: publicUser(other, user), messages: db.messages.filter((m) => m.threadId === t.id).slice(-200), deal: t.refType === 'deal' ? (({ id, status, total, amount }) => ({ id, status, total, amount }))(find('deals', t.refId)) : null, blocked: blockedBetween(user, other?.id) };
});
POST('/api/threads/:id/messages', ({ user, params, body }) => {
  const t = find('threads', params.id);
  if (!t || !t.members.includes(user.id)) fail(404, 'Chat not found');
  const otherId = t.members.find((m) => m !== user.id);
  if (blockedBetween(user, otherId)) fail(403, 'You cannot message this user.');
  const inDeal = t.refType === 'deal' && ['offered', ...ACTIVE, 'disputed'].includes(find('deals', t.refId)?.status);
  if (!isActive(user) && !inDeal) requireActive(user);
  rateLimit('msg:' + user.id, 40, 60000);
  const raw = clampStr(body.text, 600);
  if (!raw) fail(400, 'Empty message.');
  const scan = scanMessage(raw);
  const m = { id: uid('m'), threadId: t.id, from: user.id, text: scan.text, at: now(), masked: scan.offPlatform };
  db.messages.push(m); t.lastAt = m.at; t.reads[user.id] = now();
  for (const id of t.members) push(id, 'message', { threadId: t.id, message: m });
  const warnings = [];
  if (scan.offPlatform) {
    flag(user.id, 'offplatform', `Shared payment/contact details in chat: “${raw.slice(0, 80)}”`, { refId: t.id });
    warnings.push('Phone numbers and UPI details are hidden. Pay only inside CampusLoop — escrow protects both of you. Off-platform payment requests can be reported.');
  }
  if (scan.roomNumber) warnings.push('For your safety, avoid sharing your exact room number. Meet at an approved public meeting point instead.');
  if (otherId) notify(otherId, 'message', user.name, scan.text.slice(0, 80), `#/chat/${t.id}`);
  return { message: m, warnings };
});

// ---------- notifications & stream
GET('/api/notifications', ({ user }) => db.notifications.filter((n) => n.userId === user.id).sort((a, b) => b.at - a.at).slice(0, 80));
POST('/api/notifications/read', ({ user }) => { for (const n of db.notifications) if (n.userId === user.id) n.read = true; return { ok: true }; });

// ---------- reports, safety
POST('/api/reports', ({ user, body }) => {
  const types = { user: 'users', listing: 'listings', task: 'tasks', message: 'messages', lostfound: 'lostfound' };
  if (!types[body.targetType]) fail(400, 'Invalid report.');
  const target = find(types[body.targetType], body.targetId);
  if (!target) fail(404, 'Not found');
  if (!clampStr(body.reason, 80)) fail(400, 'Select a reason.');
  rateLimit('report:' + user.id, 10, H);
  const targetUserId = body.targetType === 'user' ? target.id : target.sellerId || target.posterId || target.from || target.userId;
  const r = createReport({ reporter: user, targetType: body.targetType, targetId: body.targetId, reason: body.reason, details: body.details, targetUserId });
  if (body.block && targetUserId && !user.blocked.includes(targetUserId)) user.blocked.push(targetUserId);
  return reportView(r);
});
GET('/api/reports/mine', ({ user }) => db.reports.filter((r) => r.reporterId === user.id || (r.kind === 'dispute' && r.targetUserId === user.id)).sort((a, b) => b.createdAt - a.createdAt).map(reportView));

POST('/api/sos', ({ user, body }) => {
  const s = { id: uid('o'), userId: user.id, location: locById(body.location) ? body.location : null, note: clampStr(body.note, 200), lat: Number(body.lat) || null, lng: Number(body.lng) || null, at: now(), status: 'open' };
  db.sos.push(s);
  for (const a of db.users.filter((u) => u.isAdmin)) { notify(a.id, 'sos', '🚨 SOS alert', `${user.name} needs help${s.location ? ' near ' + locById(s.location).name : ''}.`, '#/admin/sos'); push(a.id, 'sos', s); }
  audit(user.id, 'sos', s.id);
  return { ok: true, security: CAMPUS.securityPhone, name: CAMPUS.securityName, emergencyContact: decrypt(user.emergency) || null };
});

// ---------- wallet
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

// ---------- lost & found
GET('/api/lostfound', ({ user }) => db.lostfound.filter((x) => x.status === 'open' || x.userId === user.id).sort((a, b) => b.at - a.at).map((x) => ({ ...x, user: publicUser(find('users', x.userId), user), mine: x.userId === user.id })));
POST('/api/lostfound', ({ user, body }) => {
  requireActive(user);
  const title = clampStr(body.title, 70);
  if (title.length < 3) fail(400, 'Add a short title.');
  const bad = prohibitedCheck(title, body.desc); if (bad) fail(422, bad);
  const x = { id: uid('x'), userId: user.id, kind: body.kind === 'found' ? 'found' : 'lost', title, desc: clampStr(body.desc, 400), location: locById(body.location) ? body.location : null, photo: validPhotos(body.photo ? [body.photo] : [], { max: 1 })[0] || null, at: now(), status: 'open', when: clampStr(body.when, 40) };
  db.lostfound.push(x);
  return x;
});
POST('/api/lostfound/:id/resolve', ({ user, params }) => {
  const x = find('lostfound', params.id);
  if (!x || x.userId !== user.id) fail(404, 'Not found');
  x.status = 'resolved'; x.resolvedAt = now();
  return x;
});

// ---------- community: leaderboard, impact, announcements
function impact() {
  const paid = db.deals.filter((d) => d.status === 'paid');
  const reused = paid.filter((d) => d.type === 'buy');
  let kg = 0;
  for (const d of reused) { const l = find('listings', d.refId); kg += CATEGORIES.find((c) => c.id === l?.category)?.kgSaved || 0.5; }
  return {
    itemsReused: reused.length, kgSaved: Math.round(kg), donations: reused.filter((d) => d.amount === 0).length,
    tasksDone: paid.filter((d) => d.type !== 'buy').length, keptOnCampus: paid.reduce((a, d) => a + d.amount, 0),
    helpersEarning: new Set(paid.filter((d) => d.type !== 'buy').map((d) => d.payeeId)).size,
  };
}
GET('/api/community', ({ user }) => {
  const since = now() - 7 * DAY;
  const tally = new Map();
  for (const d of db.deals.filter((d) => d.status === 'paid' && d.paidAt > since)) {
    for (const id of [d.payeeId]) tally.set(id, (tally.get(id) || 0) + 1);
  }
  const board = [...tally.entries()].map(([id, n]) => ({ u: find('users', id), n })).filter((x) => x.u && !x.u.deleted && x.u.privacy.leaderboard !== false)
    .sort((a, b) => b.n - a.n).slice(0, 10).map((x) => ({ user: publicUser(x.u, user), deals: x.n }));
  return { impact: impact(), leaderboard: board, myBadges: badgesFor(user), announcements: db.announcements.sort((a, b) => b.at - a.at).slice(0, 10) };
});

// ================================================================== ADMIN
const adminOnly = { admin: true };
GET('/api/admin/overview', () => {
  const deals = db.deals;
  const paid = deals.filter((d) => d.status === 'paid');
  const usersWithDeals = new Map();
  for (const d of paid) for (const id of [d.payerId, d.payeeId]) usersWithDeals.set(id, (usersWithDeals.get(id) || 0) + 1);
  const repeat = [...usersWithDeals.values()].filter((n) => n >= 2).length;
  const reviews = db.reviews;
  const avgRating = reviews.length ? +(reviews.reduce((a, r) => a + r.stars, 0) / reviews.length).toFixed(2) : 0;
  const disputes = db.reports.filter((r) => r.kind === 'dispute').length;
  const engaged = deals.filter((d) => d.acceptedAt).length || 1;
  const fraudFlags = db.flags.length;
  const tasksAssigned = db.tasks.filter((t) => t.assignedAt);
  const avgAcceptMins = tasksAssigned.length ? Math.round(median(tasksAssigned.map((t) => (t.assignedAt - t.createdAt) / 60000))) : 0;
  const weeks = [];
  for (let i = 7; i >= 0; i--) {
    const end = now() - i * 7 * DAY, start = end - 7 * DAY;
    const w = paid.filter((d) => d.paidAt > start && d.paidAt <= end);
    weeks.push({ label: new Date(end).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }), buy: w.filter((d) => d.type === 'buy').length, task: w.filter((d) => d.type === 'task').length, pickdrop: w.filter((d) => ['pickdrop', 'group'].includes(d.type)).length });
  }
  const cats = CATEGORIES.map((c) => ({ id: c.id, label: c.en, icon: c.icon, n: paid.filter((d) => d.type === 'buy' && find('listings', d.refId)?.category === c.id).length })).filter((c) => c.n);
  const sla = db.reports.filter((r) => r.decision);
  const slaMet = sla.length ? Math.round((sla.filter((r) => r.decision.at <= r.dueAt).length / sla.length) * 100) : 100;
  return {
    kpis: {
      users: db.users.filter((u) => !u.deleted).length,
      active7d: db.users.filter((u) => u.lastActive > now() - 7 * DAY).length,
      completed: paid.length, repeatUsers: usersWithDeals.size ? Math.round((repeat / usersWithDeals.size) * 100) : 0,
      avgRating, satisfaction: reviews.length ? Math.round((reviews.filter((r) => r.stars >= 4).length / reviews.length) * 100) : 0,
      disputeRate: +((disputes / engaged) * 100).toFixed(1), fraudRate: +((fraudFlags / Math.max(1, deals.length)) * 100).toFixed(1),
      avgAcceptMins, gmv: paid.reduce((a, d) => a + d.amount, 0), revenue: db.meta.platformRevenue,
      escrowHeld: db.users.reduce((a, u) => a + u.wallet.escrow, 0), slaMet,
      openReports: db.reports.filter((r) => r.status === 'open').length, openFlags: db.flags.filter((f) => f.status === 'open').length,
      openSos: db.sos.filter((s) => s.status === 'open').length,
    },
    weeks, cats, impact: impact(),
  };
}, adminOnly);

GET('/api/admin/reports', ({ user, query }) => db.reports.filter((r) => (query.status || 'open') === 'all' || r.status === (query.status || 'open'))
  .sort((a, b) => a.dueAt - b.dueAt).map((r) => {
    const map = { user: 'users', listing: 'listings', task: 'tasks', message: 'messages', deal: 'deals', lostfound: 'lostfound' };
    const target = find(map[r.targetType], r.targetId);
    let preview = null;
    if (r.targetType === 'listing' && target) preview = { title: target.title, price: target.price, photo: target.photos[0], status: target.status };
    if (r.targetType === 'task' && target) preview = { title: target.title, reward: target.reward, status: target.status };
    if (r.targetType === 'message' && target) preview = { text: target.text };
    if (r.targetType === 'deal' && target) preview = { ...dealView(target, user), chat: db.messages.filter((m) => m.threadId === target.threadId).slice(-30) };
    return { ...reportView(r), reporter: publicUser(find('users', r.reporterId), user), targetUser: publicUser(find('users', r.targetUserId), user), preview };
  }), adminOnly);

POST('/api/admin/reports/:id/resolve', ({ user, params, body }) => {
  const r = find('reports', params.id);
  if (!r || r.status !== 'open') fail(400, 'Report already resolved.');
  const reason = clampStr(body.reason, 400);
  if (reason.length < 5) fail(400, 'Every admin decision must include a clear written reason.');
  const action = body.action;
  const target = r.targetUserId && find('users', r.targetUserId);
  if (r.kind === 'dispute') {
    const d = find('deals', r.dealId);
    if (!['refund', 'release', 'split'].includes(action)) fail(400, 'Choose refund, release or split.');
    const payer = find('users', d.payerId), payee = find('users', d.payeeId);
    if (action === 'refund') { refundHold(payer, d.escrow, `Dispute refund: “${d.title}”`, d.id); d.escrow = 0; step(d, 'refunded', user.id, `Admin refunded the payer. ${reason}`); d.closedAt = now(); if (d.type === 'buy') { const l = find('listings', d.refId); if (l) l.status = 'active'; } }
    if (action === 'release') { d.deliveredAt ||= now(); releaseDeal(d, `Admin released payment. ${reason}`); }
    if (action === 'split') {
      const half = Math.floor(d.amount / 2);
      payer.wallet.escrow -= d.escrow; payer.wallet.balance += d.escrow - half;
      payee.wallet.balance += half; payee.wallet.earned += half;
      ledger(payer.id, 'refund', d.escrow - half, `Dispute split refund: “${d.title}”`, d.id); ledger(payee.id, 'earning', half, `Dispute split: “${d.title}”`, d.id);
      d.escrow = 0; step(d, 'refunded', user.id, `Admin split the amount 50/50. ${reason}`); d.closedAt = now();
    }
    for (const id of [d.payerId, d.payeeId]) { notify(id, 'dispute', 'Dispute decided', `Decision: ${action}. Reason: ${reason}`, `#/deal/${d.id}`); push(id, 'deal', { id: d.id }); }
    sysMsg(find('threads', d.threadId), `Admin decision: ${action.toUpperCase()}. Reason: ${reason}`);
    if (body.strikeUserId) { const su = find('users', body.strikeUserId); if (su) applyStrike(su, reason, user.id); }
  } else {
    if (!['dismiss', 'remove', 'strike', 'suspend', 'ban'].includes(action)) fail(400, 'Unknown action.');
    if (action === 'remove' || (body.removePost && ['listing', 'task', 'lostfound'].includes(r.targetType))) {
      const col = { listing: 'listings', task: 'tasks', lostfound: 'lostfound' }[r.targetType];
      const t = col && find(col, r.targetId);
      if (t) {
        t.status = t.status === 'reserved' ? t.status : 'removed'; t.removedReason = reason;
        if (r.targetType === 'task' && t.escrow) { refundHold(find('users', t.posterId), t.escrow, `Refund: task removed by admin`, t.id); t.escrow = 0; }
        notify(t.sellerId || t.posterId || t.userId, 'moderation', 'Your post was removed', `“${t.title}” was removed. Reason: ${reason}`);
      }
    }
    if (action === 'strike' && target) applyStrike(target, reason, user.id);
    if (action === 'suspend' && target) { target.status = 'suspended'; target.suspendedUntil = now() + (int(body.days) || 3) * DAY; target.statusReason = reason; notify(target.id, 'moderation', 'Account suspended', `Until ${new Date(target.suspendedUntil).toLocaleDateString('en-IN')}. Reason: ${reason}`); }
    if (action === 'ban' && target) { target.status = 'banned'; target.statusReason = reason; notify(target.id, 'moderation', 'Account banned', `Reason: ${reason}`); }
  }
  r.status = 'resolved'; r.decision = { action, reason, by: user.id, at: now(), withinSla: now() <= r.dueAt };
  notify(r.reporterId, 'report', r.kind === 'dispute' ? 'Your dispute was decided' : 'Your report was reviewed', `Action: ${action}. Reason: ${reason}`, '#/settings/reports');
  audit(user.id, `${r.kind}:${action}`, r.id, reason, { targetUserId: r.targetUserId });
  return reportView(r);
}, adminOnly);

GET('/api/admin/flags', ({ user }) => db.flags.sort((a, b) => b.at - a.at).slice(0, 100).map((f) => ({ ...f, user: publicUser(find('users', f.userId), user) })), adminOnly);
POST('/api/admin/flags/:id', ({ user, params, body }) => {
  const f = find('flags', params.id);
  if (!f) fail(404, 'Not found');
  const reason = clampStr(body.reason, 300);
  if (body.action === 'strike') { if (reason.length < 5) fail(400, 'Reason required.'); applyStrike(find('users', f.userId), reason, user.id); }
  f.status = 'reviewed'; f.decision = { action: body.action || 'dismiss', reason, by: user.id, at: now() };
  audit(user.id, `flag:${f.decision.action}`, f.id, reason);
  return f;
}, adminOnly);

GET('/api/admin/users', ({ user, query }) => {
  const q = clampStr(query.q, 40).toLowerCase();
  return db.users.filter((u) => !u.deleted && (!q || u.name.toLowerCase().includes(q) || u.collegeId.toLowerCase().includes(q)))
    .slice(0, 100).map((u) => ({ ...publicUser(u, user), collegeId: u.collegeId, dept: u.dept, year: u.year, strikesList: u.strikes, statusReason: u.statusReason, suspendedUntil: u.suspendedUntil, wallet: u.wallet }));
}, adminOnly);
POST('/api/admin/users/:id', ({ user, params, body }) => {
  const u = find('users', params.id);
  if (!u) fail(404, 'Not found');
  const reason = clampStr(body.reason, 300);
  if (reason.length < 5) fail(400, 'A written reason is required for every admin action.');
  if (body.action === 'strike') applyStrike(u, reason, user.id);
  else if (body.action === 'reinstate') { u.status = 'active'; u.suspendedUntil = null; u.statusReason = null; notify(u.id, 'moderation', 'Account reinstated', reason); audit(user.id, 'reinstate', u.id, reason); }
  else if (body.action === 'suspend') { u.status = 'suspended'; u.suspendedUntil = now() + (int(body.days) || 3) * DAY; u.statusReason = reason; notify(u.id, 'moderation', 'Account suspended', `Reason: ${reason}`); audit(user.id, 'suspend', u.id, reason); }
  else if (body.action === 'ban') { u.status = 'banned'; u.statusReason = reason; notify(u.id, 'moderation', 'Account banned', `Reason: ${reason}`); audit(user.id, 'ban', u.id, reason); }
  else fail(400, 'Unknown action');
  return publicUser(u, user);
}, adminOnly);

GET('/api/admin/settings', () => S(), adminOnly);
PATCH('/api/admin/settings', ({ user, body }) => {
  const changed = [];
  for (const [k, def] of Object.entries(DEFAULT_SETTINGS)) {
    if (!(k in body)) continue;
    let v = body[k];
    if (typeof def === 'number') { v = Number(v); if (!isFinite(v) || v < 0) fail(400, `Invalid value for ${k}`); }
    if (typeof def === 'boolean') v = !!v;
    if (typeof def === 'string' && !/^\d{2}:\d{2}$/.test(v)) fail(400, `Invalid time for ${k}`);
    if (db.settings[k] !== v) { db.settings[k] = v; changed.push(`${k}=${v}`); }
  }
  if (changed.length) { audit(user.id, 'settings', 'settings', changed.join(', ')); pushAll('config', {}); }
  return S();
}, adminOnly);

POST('/api/admin/announcements', ({ user, body }) => {
  const a = { id: uid('n'), title: clampStr(body.title, 80), body: clampStr(body.body, 400), kind: body.kind === 'alert' ? 'alert' : 'info', pinned: !!body.pinned, at: now(), by: user.id };
  if (!a.title) fail(400, 'Title required.');
  db.announcements.push(a);
  audit(user.id, 'announce', a.id, a.title);
  for (const u of db.users.filter((u) => !u.deleted)) notify(u.id, 'announcement', `📢 ${a.title}`, a.body.slice(0, 100), '#/community');
  return a;
}, adminOnly);
DEL('/api/admin/announcements/:id', ({ params }) => { db.announcements = db.announcements.filter((a) => a.id !== params.id); return { ok: true }; }, adminOnly);
GET('/api/admin/audit', ({ user }) => db.audit.sort((a, b) => b.at - a.at).slice(0, 150).map((a) => ({ ...a, byUser: a.by && find('users', a.by)?.name })), adminOnly);
GET('/api/admin/sos', ({ user }) => db.sos.sort((a, b) => b.at - a.at).map((s) => ({ ...s, user: { ...publicUser(find('users', s.userId), user), phone: decrypt(find('users', s.userId)?.phone), emergency: decrypt(find('users', s.userId)?.emergency) } })), adminOnly);
POST('/api/admin/sos/:id', ({ user, params, body }) => {
  const s = find('sos', params.id); if (!s) fail(404, 'Not found');
  s.status = 'resolved'; s.resolution = clampStr(body.note, 300) || 'Resolved'; s.resolvedBy = user.id; s.resolvedAt = now();
  notify(s.userId, 'sos', 'Security responded', s.resolution);
  audit(user.id, 'sos_resolve', s.id, s.resolution);
  return s;
}, adminOnly);

// ================================================================== background jobs
export function runJobs() {
  const s = S(), t0 = now();
  let changed = false;
  for (const t of db.tasks) {
    if (t.status === 'open' && t.deadline < t0) {
      t.status = 'expired'; changed = true;
      if (t.escrow) { refundHold(find('users', t.posterId), t.escrow, `Refund: task “${t.title}” expired unaccepted`, t.id); t.escrow = 0; }
      notify(t.posterId, 'task', 'Task expired', `No one accepted “${t.title}” before the deadline. Your money was refunded.`, `#/task/${t.id}`);
      if (t.kind === 'group') for (const d of db.deals.filter((d) => d.refId === t.id && d.status === 'offered')) cancelDeal(d, null, 'Group run expired', { toTask: false });
    }
  }
  for (const d of db.deals) {
    if (d.status === 'offered' && t0 - d.createdAt > s.offerExpiryHours * H) {
      cancelDeal(d, null, `Offer expired after ${s.offerExpiryHours}h without response`, { toTask: false });
      d.status = 'expired'; d.timeline.at(-1).s = 'expired'; changed = true;
      notify(d.payerId, 'deal', 'Offer expired', `No response on “${d.title}”. ₹${d.total} refunded.`, `#/deal/${d.id}`);
    }
    if (d.status === 'delivered' && !d.pending && t0 - d.deliveredAt > s.autoReleaseHours * H) {
      d.confirmedAt = t0; d.confirmedHow = 'auto'; releaseDeal(d, `Auto-released ${s.autoReleaseHours}h after delivery — no dispute was raised`); changed = true;
    }
  }
  for (const u of db.users) if (u.status === 'suspended' && u.suspendedUntil && u.suspendedUntil < t0) { u.status = 'active'; u.statusReason = null; notify(u.id, 'moderation', 'Suspension ended', 'Welcome back. Please follow the community rules.'); changed = true; }
  db.sessions = db.sessions.filter((x) => t0 - x.lastSeen < 30 * DAY);
  if (changed) save();
}

// ================================================================== HTTP plumbing
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.ico': 'image/x-icon', '.txt': 'text/plain' };
const fileCache = new Map();
function serveStatic(req, res, urlPath) {
  let p = decodeURIComponent(urlPath.split('?')[0]);
  if (p === '/' || !path.extname(p)) p = '/index.html';
  const full = path.join(PUBLIC, path.normalize(p).replace(/^(\.\.[/\\])+/, ''));
  if (!full.startsWith(PUBLIC)) { res.writeHead(403).end(); return; }
  let entry = fileCache.get(full);
  try {
    const st = fs.statSync(full);
    if (!entry || entry.mtime !== st.mtimeMs) {
      const buf = fs.readFileSync(full);
      const ext = path.extname(full);
      const compressible = /\.(html|js|css|json|svg|webmanifest|txt)$/.test(ext);
      entry = { buf, gz: compressible ? zlib.brotliCompressSync(buf) : null, type: MIME[ext] || 'application/octet-stream', etag: '"' + sha(buf).slice(0, 16) + '"', mtime: st.mtimeMs, ext };
      fileCache.set(full, entry);
    }
  } catch { res.writeHead(404, { 'content-type': 'text/plain' }).end('Not found'); return; }
  const headers = { 'content-type': entry.type, etag: entry.etag, 'cache-control': /\.(woff2|png)$/.test(entry.ext) ? 'public, max-age=31536000, immutable' : 'no-cache', ...SEC_HEADERS };
  if (req.headers['if-none-match'] === entry.etag) { res.writeHead(304, headers).end(); return; }
  if (entry.gz && /\bbr\b/.test(req.headers['accept-encoding'] || '')) { headers['content-encoding'] = 'br'; headers.vary = 'accept-encoding'; res.writeHead(200, headers).end(entry.gz); return; }
  res.writeHead(200, headers).end(entry.buf);
}
const SEC_HEADERS = {
  'x-content-type-options': 'nosniff', 'referrer-policy': 'same-origin', 'x-frame-options': 'DENY',
  'permissions-policy': 'geolocation=(self), camera=(self), microphone=()',
  'content-security-policy': "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; font-src 'self'; frame-ancestors 'none'",
};

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', (c) => { size += c.length; if (size > 4_000_000) { reject(new HttpError(413, 'Request too large.')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => { if (!chunks.length) return resolve({}); try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); } catch { reject(new HttpError(400, 'Invalid JSON')); } });
    req.on('error', reject);
  });
}

function authUser(token) {
  if (!token) return null;
  const s = db.sessions.find((x) => x.tokenHash === sha(token));
  if (!s) return null;
  const u = find('users', s.userId);
  if (!u || u.deleted) return null;
  s.lastSeen = now(); u.lastActive = now();
  return u;
}

async function handleApi(req, res, url) {
  const send = (status, data) => { res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...SEC_HEADERS }); res.end(JSON.stringify(data)); };
  try {
    const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '') || url.searchParams.get('token') || '';
    if (url.pathname === '/api/stream') {
      const u = authUser(token);
      if (!u) return send(401, { error: 'Unauthorised' });
      res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive', 'x-accel-buffering': 'no' });
      res.write(`event: hello\ndata: {"ok":true}\n\n`);
      if (!streams.has(u.id)) streams.set(u.id, new Set());
      streams.get(u.id).add(res);
      const ping = setInterval(() => res.write(': ping\n\n'), 25000);
      req.on('close', () => { clearInterval(ping); streams.get(u.id)?.delete(res); });
      return;
    }
    const r = routes.find((x) => x.method === req.method && x.re.test(url.pathname));
    if (!r) return send(404, { error: 'Not found' });
    const m = url.pathname.match(r.re);
    const params = Object.fromEntries(r.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])]));
    const ctx = { req, res, params, query: Object.fromEntries(url.searchParams), token, ip: req.socket.remoteAddress, body: ['POST', 'PATCH', 'PUT', 'DELETE'].includes(req.method) ? await readBody(req) : {} };
    if (r.opts.auth !== false) {
      ctx.user = authUser(token);
      if (!ctx.user) return send(401, { error: 'Please log in again.' });
      if (r.opts.admin && !ctx.user.isAdmin) return send(403, { error: 'Admins only.' });
    }
    const out = await r.handler(ctx);
    if (req.method !== 'GET' || url.pathname.startsWith('/api/listings/') || url.pathname === '/api/threads' || url.pathname.startsWith('/api/threads/')) save();
    send(200, out ?? { ok: true });
  } catch (e) {
    if (e instanceof HttpError) return send(e.status, { error: e.message, ...(e.extra || {}) });
    console.error(e);
    send(500, { error: 'Something went wrong. Please try again.' });
  }
}

export function createServer() {
  return http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    if (url.pathname.startsWith('/api/')) return handleApi(req, res, url);
    if (req.method !== 'GET' && req.method !== 'HEAD') return res.writeHead(405).end();
    serveStatic(req, res, url.pathname);
  });
}
