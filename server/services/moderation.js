// Reports, credibility signals, vendor risk, moderation actions, restrictions, appeals and data migration.
import { REPORT_CATEGORIES, reportCategoryFor } from '../config/rules.js';
import { db, find, uid } from '../core/db.js';
import { push } from '../core/realtime.js';
import { DAY, H, S, clampStr, fail, int, now } from '../core/util.js';
import { audit, flag, notify } from './notifications.js';
import { applyStrike, isActive, requireActive } from './users.js';

// Report status: open (shown as “Pending”) → under_review → resolved | dismissed.
const OPEN_REPORT = ['open', 'under_review'];
export const isOpenReport = (r) => OPEN_REPORT.includes(r.status);
export const REPORT_TARGETS = { user: 'users', listing: 'listings', task: 'tasks', message: 'messages', lostfound: 'lostfound' };
export const VENDOR_TARGETS = ['user', 'listing', 'task'];
const catLabel = (id) => REPORT_CATEGORIES.find((c) => c.id === id)?.en || 'Other';
// Internal notes and credibility signals are for moderators only.
export function reportView(r, { admin = false } = {}) {
  if (!r) return null;
  const { notes, signals, ...pub } = r;
  const v = { ...pub, categoryLabel: catLabel(r.category), overdue: isOpenReport(r) && now() > r.dueAt, slaLeftMs: isOpenReport(r) ? r.dueAt - now() : 0 };
  if (admin) Object.assign(v, { notes: notes || [], signals: signals || null });
  return v;
}
export function createReport({ reporter, targetType, targetId, reason, details, kind = 'report', dealId = null, targetUserId = null, category = null, productId = null, evidence = null, signals = null }) {
  const r = {
    id: uid('r'), kind, reporterId: reporter.id, targetType, targetId, targetUserId, vendorId: targetUserId, productId,
    category: category || reportCategoryFor(reason), reason: clampStr(reason, 80), details: clampStr(details, 1000), evidence,
    dealId, status: 'open', createdAt: now(), dueAt: now() + S().disputeSlaHours * H, decision: null, notes: [], signals,
  };
  db.reports.push(r);
  for (const a of db.users.filter((u) => u.isAdmin)) { notify(a.id, 'admin', kind === 'dispute' ? 'New dispute' : 'New report', `${r.reason} — review within ${S().disputeSlaHours}h`, '#/admin/reports'); push(a.id, 'admin', { kind }); }
  return r;
}
// Credibility of a complaint. None of these decide guilt — they help admins weigh reports and spot abuse of reporting.
export function reportSignals(reporter, vendorId) {
  const t0 = now();
  const interacted = db.deals.some((d) => (d.payerId === reporter.id && d.payeeId === vendorId) || (d.payerId === vendorId && d.payeeId === reporter.id))
    || db.threads.some((t) => t.members.includes(reporter.id) && t.members.includes(vendorId) && db.messages.some((m) => m.threadId === t.id && m.from));
  const newAccount = t0 - reporter.createdAt < 2 * DAY;
  const mine = db.reports.filter((r) => r.reporterId === reporter.id && r.kind === 'report');
  const vendors24h = new Set(mine.filter((r) => t0 - r.createdAt < DAY).map((r) => r.vendorId).concat(vendorId)).size;
  const massReporting = vendors24h >= 4;
  const closed = mine.filter((r) => ['resolved', 'dismissed'].includes(r.status));
  const dismissed = closed.filter((r) => r.status === 'dismissed').length;
  const lowAccuracy = closed.length >= 3 && dismissed / closed.length >= 0.6;
  // coordinated wave: several reports on this vendor within an hour, mostly from accounts younger than a week
  const wave = db.reports.filter((r) => r.vendorId === vendorId && r.kind === 'report' && t0 - r.createdAt < H).map((r) => find('users', r.reporterId));
  const young = wave.filter((u) => u && t0 - u.createdAt < 7 * DAY).length + (t0 - reporter.createdAt < 7 * DAY ? 1 : 0);
  const coordinated = wave.length + 1 >= 3 && young >= 3;
  const credible = !newAccount && !massReporting && !lowAccuracy && !coordinated;
  return { interacted, newAccount, massReporting, lowAccuracy, coordinated, credible };
}
// Report counts and an explainable risk level for a vendor. Risk prioritises investigation; it never punishes by itself.
export function vendorStats(u) {
  const s = S(), since = now() - s.reportWindowDays * DAY;
  const rs = db.reports.filter((r) => r.vendorId === u.id && r.kind === 'report');
  const live = rs.filter((r) => r.status !== 'dismissed');
  const independent = new Set(live.filter((r) => r.createdAt > since && r.signals?.credible !== false).map((r) => r.reporterId)).size;
  const withDeal = new Set(live.filter((r) => r.signals?.interacted).map((r) => r.reporterId)).size;
  const upheld = rs.filter((r) => r.status === 'resolved' && r.decision?.action !== 'dismiss').length;
  const violations = db.modlog.filter((m) => m.userId === u.id && !m.rescinded && ['warn', 'remove', 'strike', 'restrict', 'suspend', 'ban'].includes(m.action)).length;
  const score = independent * 2 + withDeal + upheld * 3 + u.strikes.length * 2;
  const level = upheld >= 2 || u.strikes.length >= 2 || independent >= s.reportThreshold + 2 ? 'high'
    : independent >= s.reportThreshold || upheld >= 1 || score >= 4 ? 'medium' : 'low';
  return {
    total: rs.length, open: rs.filter(isOpenReport).length, dismissed: rs.filter((r) => r.status === 'dismissed').length, upheld, independent, withDeal,
    violations, strikes: u.strikes.length, threshold: s.reportThreshold, windowDays: s.reportWindowDays, needsReview: independent >= s.reportThreshold, risk: { level, score },
  };
}
export function checkReportThreshold(vendor) {
  const st = vendorStats(vendor);
  if (!st.needsReview || db.flags.some((f) => f.userId === vendor.id && f.kind === 'reports_threshold' && f.status === 'open')) return;
  flag(vendor.id, 'reports_threshold', `${st.independent} independent credible reports in ${st.windowDays} days (threshold ${st.threshold}). Investigate before acting — reports alone do not prove a violation.`);
  for (const a of db.users.filter((x) => x.isAdmin)) notify(a.id, 'admin', 'Vendor needs review', `${vendor.name} reached the report threshold (${st.independent} independent reporters).`, `#/admin/vendor/${vendor.id}`);
  audit(null, 'review_threshold', vendor.id, `${st.independent} independent reporters`);
}
export const APPEALABLE = ['warn', 'correct', 'restrict', 'remove', 'strike', 'suspend', 'ban'];
export const ACTION_TEXT = {
  warn: 'Official warning', correct: 'Corrective action requested', restrict: 'Listing restriction', lift_restriction: 'Listing restriction lifted',
  remove: 'Post removed', strike: 'Strike issued', suspend: 'Account suspended', ban: 'Account banned', reinstate: 'Account reinstated',
};
// Every action on a member's account is kept here (and in the audit log) with who, what, why and when.
export function recordAction(u, by, action, reason, { notify: tell = true, reportId = null, ...meta } = {}) {
  const m = { id: uid('ma'), userId: u.id, by, action, reason, reportId, at: now(), meta, rescinded: null, correction: null };
  if (action === 'correct') m.correction = { text: meta.correctionText || reason, dueAt: now() + (meta.days || 3) * DAY, doneAt: null, note: '' };
  db.modlog.push(m);
  audit(by, `mod:${action}`, u.id, reason, { reportId });
  if (tell) {
    const appeal = APPEALABLE.includes(action) ? ` You can appeal within ${S().appealWindowDays} days.` : '';
    notify(u.id, 'moderation', ACTION_TEXT[action] || action, `Reason: ${reason}.${appeal}`, '#/settings/moderation');
  }
  return m;
}
export const listingRestriction = (u) => { const r = u?.restrictions?.listings; return r && (!r.until || r.until > now()) ? r : null; };
function restrictListings(u, by, reason, days, reportId) {
  u.restrictions = { ...(u.restrictions || {}), listings: { since: now(), until: days > 0 ? now() + days * DAY : null, reason, by } };
  return recordAction(u, by, 'restrict', reason, { reportId, days });
}
// Selling / posting needs an active, unrestricted account. Checked on the server for every write.
export function requireCanSell(u) {
  requireActive(u);
  const r = listingRestriction(u);
  if (r) fail(403, `Your listings are restricted${r.until ? ` until ${new Date(r.until).toLocaleString('en-IN')}` : ' until a moderator lifts it'}. Reason: ${r.reason}. You can still buy and finish active deals, and you can appeal in Settings → Account status.`, { restricted: 'listings' });
}
// Posts by suspended, banned or listing-restricted members are hidden from browsing (their records are kept).
export const sellerVisible = (id) => { const u = find('users', id); return !!u && !u.deleted && isActive(u) && !listingRestriction(u); };
// Bring older records up to the current shape (run once at boot; idempotent).
export function migrate() {
  for (const r of db.reports) {
    r.category ||= r.kind === 'dispute' ? 'other' : reportCategoryFor(r.reason);
    r.vendorId ||= r.targetUserId || null;
    r.productId ??= ['listing', 'task'].includes(r.targetType) ? r.targetId : null;
    r.notes ||= [];
    if (r.status === 'resolved' && r.decision?.action === 'dismiss') r.status = 'dismissed';
  }
  for (const u of db.users) { u.restrictions ||= {}; for (const k of u.strikes) k.id ||= uid('sk'); }
}
// One place that applies a moderation action to a member, records it and tells them.
export const ACCOUNT_ACTIONS = ['warn', 'correct', 'restrict', 'lift_restriction', 'strike', 'suspend', 'ban', 'reinstate'];
export function applyModeration(u, admin, action, reason, { days, correction, reportId } = {}) {
  if (!u || u.deleted) fail(404, 'Member not found.');
  if (u.id === admin.id) fail(400, 'You cannot take moderation action on your own account.');
  if (action === 'warn') return recordAction(u, admin.id, 'warn', reason, { reportId });
  if (action === 'correct') {
    const text = clampStr(correction, 300);
    if (text.length < 5) fail(400, 'Describe the correction the member must make.');
    return recordAction(u, admin.id, 'correct', reason, { reportId, correctionText: text, days: Math.min(14, Math.max(1, int(days) || 3)) });
  }
  if (action === 'restrict') return restrictListings(u, admin.id, reason, Math.max(0, int(days)), reportId);
  if (action === 'lift_restriction') {
    if (!listingRestriction(u)) fail(400, 'This member has no active listing restriction.');
    delete u.restrictions.listings;
    return recordAction(u, admin.id, 'lift_restriction', reason, { reportId });
  }
  if (action === 'strike') { applyStrike(u, reason, admin.id, { reportId }); return db.modlog.at(-1); }
  if (action === 'suspend') {
    const d = Math.min(90, Math.max(1, int(days) || 3));
    Object.assign(u, { status: 'suspended', suspendedUntil: now() + d * DAY, statusReason: reason });
    return recordAction(u, admin.id, 'suspend', `${reason} (until ${new Date(u.suspendedUntil).toLocaleDateString('en-IN')})`, { reportId, days: d });
  }
  if (action === 'ban') { Object.assign(u, { status: 'banned', statusReason: reason }); return recordAction(u, admin.id, 'ban', reason, { reportId }); }
  if (action === 'reinstate') {
    if (u.status === 'active') fail(400, 'This account is already active.');
    Object.assign(u, { status: 'active', suspendedUntil: null, statusReason: null });
    return recordAction(u, admin.id, 'reinstate', reason, { reportId });
  }
  fail(400, 'Unknown action.');
}
// Overturning reverses the original action's effect; the record of both stays in the history.
export function reverseAction(m, u) {
  if (m.action === 'strike') {
    u.strikes = u.strikes.filter((k) => k.id !== m.meta.strikeId);
    if (u.status !== 'active' && u.statusReason === m.reason) Object.assign(u, { status: 'active', suspendedUntil: null, statusReason: null });
  }
  if (['suspend', 'ban'].includes(m.action) && u.status !== 'active') Object.assign(u, { status: 'active', suspendedUntil: null, statusReason: null });
  if (m.action === 'restrict' && u.restrictions?.listings) delete u.restrictions.listings;
  if (m.action === 'remove' && m.meta.postId) {
    const col = { listing: 'listings', task: 'tasks', lostfound: 'lostfound' }[m.meta.postType];
    const t = col && find(col, m.meta.postId);
    if (t && t.status === 'removed' && m.meta.prevStatus) { t.status = m.meta.prevStatus === 'reserved' ? 'active' : m.meta.prevStatus; t.removedReason = null; }
  }
}
