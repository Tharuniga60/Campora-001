// Users: creation, sessions, public/private views, stats, trust score, badges, strikes and limits.
import crypto from 'node:crypto';
import { istDayKey, locById, median } from '../config/rules.js';
import { db, decrypt, encrypt, find, hmac, sha, uid } from '../core/db.js';
import { DAY, S, fail, now } from '../core/util.js';
import { unreadThreads } from './chat.js';
import { listingRestriction, recordAction } from './moderation.js';
import { notify } from './notifications.js';

export function normPhone(p) { const d = String(p || '').replace(/\D/g, '').slice(-10); return /^[6-9]\d{9}$/.test(d) ? d : null; }
export function isActive(u) {
  if (u.status === 'banned') return false;
  if (u.status === 'suspended' && u.suspendedUntil > now()) return false;
  return true;
}
export function requireActive(u) {
  if (u.status === 'banned') fail(403, `Your account is permanently banned. Reason: ${u.statusReason || 'repeated violations'}.`);
  if (u.status === 'suspended' && u.suspendedUntil > now())
    fail(403, `Your account is suspended until ${new Date(u.suspendedUntil).toLocaleString('en-IN')}. Reason: ${u.statusReason}. You can still view and chat about active deals.`);
}
export function applyStrike(u, reason, by, extra = {}) {
  const strike = { id: uid('sk'), reason, by, at: now() };
  u.strikes.push(strike);
  const n = u.strikes.length, s = S();
  let level;
  if (n === 1) { level = 'warning'; }
  else if (n === 2) { level = 'suspension'; u.status = 'suspended'; u.suspendedUntil = now() + s.strikeSuspendDays * DAY; u.statusReason = reason; }
  else { level = 'ban'; u.status = 'banned'; u.statusReason = reason; }
  const msg = { warning: 'Official warning (strike 1 of 3)', suspension: `Suspended for ${s.strikeSuspendDays} days (strike 2 of 3)`, ban: 'Permanently banned (strike 3)' }[level];
  notify(u.id, 'strike', msg, `Reason: ${reason}. You can appeal within ${s.appealWindowDays} days.`, '#/settings/moderation');
  recordAction(u, by, 'strike', reason, { ...extra, strikeId: strike.id, level, notify: false });
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
export function badgesFor(u, st = userStats(u)) {
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
export function publicUser(u, viewer, { full = false } = {}) {
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
export function meView(u) {
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
    restrictions: { listings: listingRestriction(u) },
    openAppeals: db.appeals.filter((a) => a.userId === u.id && a.status === 'pending').length,
  };
}
export function activeHelperJobs(userId) {
  return db.deals.filter((d) => d.payeeId === userId && d.type !== 'buy' && ['accepted', 'in_progress', 'delivered'].includes(d.status)).length;
}
function committedToday(userId) {
  const day = istDayKey();
  const deals = db.deals.filter((d) => d.payerId === userId && istDayKey(d.createdAt) === day && !['declined', 'cancelled', 'expired', 'refunded'].includes(d.status) && !d.fromTask).reduce((a, d) => a + d.total, 0);
  const tasks = db.tasks.filter((t) => t.posterId === userId && istDayKey(t.createdAt) === day && t.kind !== 'group' && !['cancelled', 'expired'].includes(t.status)).reduce((a, t) => a + (t.total || 0), 0);
  return deals + tasks;
}
export function checkDaily(u, add) {
  const s = S(), used = committedToday(u.id);
  if (used + add > s.dailyLimit) fail(400, `Daily limit reached: you can commit up to ₹${s.dailyLimit} per day (₹${Math.max(0, s.dailyLimit - used)} left today). This protects everyone from large losses.`);
}
export function checkOtp(phone, code) {
  const o = db.otps.find((x) => x.phoneHash === hmac(phone) && x.exp > now());
  if (!o) fail(400, 'OTP expired. Please request a new one.');
  if (++o.tries > 5) fail(429, 'Too many wrong attempts. Request a new OTP.');
  if (o.codeHash !== sha(String(code).trim() + phone)) fail(400, 'Incorrect OTP.');
  db.otps = db.otps.filter((x) => x !== o);
}
export function newSession(u) {
  const token = crypto.randomBytes(32).toString('hex');
  db.sessions.push({ id: uid('s'), tokenHash: sha(token), userId: u.id, createdAt: now(), lastSeen: now() });
  u.lastActive = now();
  return { token, me: meView(u) };
}
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
export function authUser(token) {
  if (!token) return null;
  const s = db.sessions.find((x) => x.tokenHash === sha(token));
  if (!s) return null;
  const u = find('users', s.userId);
  if (!u || u.deleted) return null;
  s.lastSeen = now(); u.lastActive = now();
  return u;
}
