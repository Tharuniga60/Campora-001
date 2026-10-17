// API routes — Admin: overview metrics, auto-flags, users, rules & limits, announcements, audit log, SOS.
import { CATEGORIES, DEFAULT_SETTINGS, median } from '../config/rules.js';
import { db, decrypt, find, uid } from '../core/db.js';
import { DEL, GET, PATCH, POST, adminOnly } from '../core/http.js';
import { push, pushAll } from '../core/realtime.js';
import { DAY, S, clampStr, fail, now } from '../core/util.js';
import { impact } from '../services/community.js';
import { ACCOUNT_ACTIONS, applyModeration, isOpenReport, listingRestriction } from '../services/moderation.js';
import { audit, notify } from '../services/notifications.js';
import { applyStrike, publicUser } from '../services/users.js';
import { ledger, payoutView } from '../services/wallet.js';

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
      openReports: db.reports.filter(isOpenReport).length,
      vendorsFlagged: db.flags.filter((f) => f.kind === 'reports_threshold' && f.status === 'open').length,
      openAppeals: db.appeals.filter((x) => x.status === 'pending').length, openFlags: db.flags.filter((f) => f.status === 'open').length,
      openSos: db.sos.filter((s) => s.status === 'open').length,
      payoutsPending: db.payouts.filter((p) => p.status === 'requested').length,
      lostFoundPending: db.lostfound.filter((x) => x.status === 'pending' || x.status === 'ready' || (x.status === 'held' && x.claims?.some((c) => c.status === 'pending'))).length,
    },
    weeks, cats, impact: impact(),
  };
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
  if (!ACCOUNT_ACTIONS.includes(body.action)) fail(400, 'Unknown action');
  applyModeration(u, user, body.action, reason, { days: body.days, correction: body.correction });
  return { ...publicUser(u, user), restriction: listingRestriction(u) };
}, adminOnly);
GET('/api/admin/settings', () => S(), adminOnly);
PATCH('/api/admin/settings', ({ user, body }) => {
  const changed = [];
  for (const [k, def] of Object.entries(DEFAULT_SETTINGS)) {
    if (!(k in body)) continue;
    let v = body[k];
    if (typeof def === 'number') { v = Number(v); if (!isFinite(v) || v < 0) fail(400, `Invalid value for ${k}`); }
    if (k === 'reportThreshold' && v < 2) fail(400, 'The report threshold must be at least 2 independent reporters.');
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

// ---------- payouts: pay each withdrawal by UPI from the campus account, then record the bank reference (UTR)
GET('/api/admin/payouts', ({ user, query }) => {
  const st = ['requested', 'paid', 'rejected', 'all'].includes(query.status) ? query.status : 'requested';
  return db.payouts.filter((p) => st === 'all' || p.status === st).sort((a, b) => a.createdAt - b.createdAt)
    .map((p) => ({ ...payoutView(p), upiFull: decrypt(p.upi), user: publicUser(find('users', p.userId), user), collegeId: find('users', p.userId)?.collegeId }));
}, adminOnly);
POST('/api/admin/payouts/:id', ({ user, params, body }) => {
  const p = find('payouts', params.id);
  if (!p) fail(404, 'Payout not found.');
  if (p.status !== 'requested') fail(400, `This payout is already ${p.status}.`);
  const u = find('users', p.userId);
  if (body.action === 'paid') {
    const ref = clampStr(body.ref, 40);
    if (ref.length < 6) fail(400, 'Enter the UPI transaction reference (UTR) from your bank app.');
    Object.assign(p, { status: 'paid', ref, paidAt: now(), by: user.id });
    if (u) notify(u.id, 'wallet', 'Withdrawal paid ✓', `₹${p.amount} was sent to ${p.upiMasked}. UPI ref: ${ref}.`, '#/wallet');
  } else if (body.action === 'reject') {
    const reason = clampStr(body.reason, 200);
    if (reason.length < 5) fail(400, 'Give the member a reason.');
    Object.assign(p, { status: 'rejected', reason, decidedAt: now(), by: user.id });
    if (u) { u.wallet.balance += p.amount; ledger(u.id, 'refund', p.amount, `Withdrawal returned: ${reason}`); notify(u.id, 'wallet', 'Withdrawal returned', `₹${p.amount} is back in your wallet. ${reason}`, '#/wallet'); push(u.id, 'wallet', {}); }
  } else fail(400, 'Choose paid or reject.');
  audit(user.id, `payout:${p.status}`, p.id, body.ref || body.reason || '', { targetUserId: p.userId });
  return payoutView(p);
}, adminOnly);
