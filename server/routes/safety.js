// API routes — Reporting vendors/content, SOS, my account status, corrective actions and appeals.
import { CAMPUS, REPORT_CATEGORIES, locById, reportCategoryFor } from '../config/rules.js';
import { db, decrypt, find, uid } from '../core/db.js';
import { GET, POST, rateLimit } from '../core/http.js';
import { push } from '../core/realtime.js';
import { DAY, H, S, clampStr, fail, now } from '../core/util.js';
import { validPhotos } from '../core/validate.js';
import { ACTION_TEXT, APPEALABLE, REPORT_TARGETS, VENDOR_TARGETS, checkReportThreshold, createReport, isOpenReport, listingRestriction, reportSignals, reportView } from '../services/moderation.js';
import { audit, flag, notify } from '../services/notifications.js';
import { requireActive } from '../services/users.js';

// ---------- reports, safety
// Report a vendor (user, their listing or task) or other content. Reports open an investigation; they never penalise anyone automatically.
POST('/api/reports', ({ user, body }) => {
  const targetType = body.targetType;
  if (!REPORT_TARGETS[targetType]) fail(400, 'Invalid report.');
  if (targetType !== 'message') requireActive(user);
  const target = find(REPORT_TARGETS[targetType], body.targetId);
  if (!target || target.deleted) fail(404, 'The reported item no longer exists.');
  const vendorReport = VENDOR_TARGETS.includes(targetType);
  const category = body.category ? REPORT_CATEGORIES.find((c) => c.id === body.category) : null;
  if (body.category && !category) fail(400, 'Choose a valid complaint reason.');
  const reason = category ? category.en : clampStr(body.reason, 80);
  if (!reason) fail(400, 'Select a reason.');
  const details = clampStr(body.details, 1000);
  if (vendorReport && details.length < 10) fail(400, 'Please describe what happened (at least 10 characters) so an admin can investigate fairly.');
  const targetUserId = targetType === 'user' ? target.id : target.sellerId || target.posterId || target.from || target.userId;
  if (targetUserId === user.id) fail(400, 'You cannot report yourself or your own post.');
  // one open report per reporter and target; the same complaint about the same vendor at most once a week
  const dup = db.reports.find((r) => r.reporterId === user.id && r.kind === 'report' && (
    (r.targetType === targetType && r.targetId === target.id && isOpenReport(r)) ||
    (vendorReport && r.vendorId === targetUserId && r.category === (category?.id || reportCategoryFor(reason)) && now() - r.createdAt < 7 * DAY)));
  if (dup) fail(409, `You already reported this (${dup.status === 'open' ? 'pending' : dup.status.replace('_', ' ')}, filed ${new Date(dup.createdAt).toLocaleDateString('en-IN')}). Add more details by messaging support instead of filing again.`, { duplicate: true, id: dup.id });
  rateLimit('report:' + user.id, 10, H);
  const evidence = validPhotos(body.evidence ? [body.evidence] : [], { max: 1 })[0] || null;
  const signals = vendorReport && targetUserId ? reportSignals(user, targetUserId) : null;
  const productId = ['listing', 'task'].includes(targetType) ? target.id : null;
  const dealRef = targetUserId && db.deals.filter((d) => (d.payerId === user.id && d.payeeId === targetUserId) || (d.payeeId === user.id && d.payerId === targetUserId)).sort((a, b) => b.createdAt - a.createdAt)[0];
  const r = createReport({ reporter: user, targetType, targetId: target.id, reason, details, targetUserId, category: category?.id, productId, evidence, signals, dealId: null });
  if (dealRef) r.dealRef = dealRef.id;
  if (signals && !signals.credible) {
    const why = [signals.newAccount && 'new account', signals.massReporting && 'reported 4+ different members in 24h', signals.lowAccuracy && 'most past reports dismissed', signals.coordinated && 'part of a burst of reports from new accounts'].filter(Boolean).join(', ');
    flag(user.id, 'report_abuse', `Report on ${find('users', targetUserId)?.name || 'a member'} looks unreliable: ${why}`, { refId: r.id });
  }
  if (body.block && targetUserId && !user.blocked.includes(targetUserId)) user.blocked.push(targetUserId);
  const vendor = vendorReport && find('users', targetUserId);
  if (vendor) checkReportThreshold(vendor);
  return reportView(r);
});
GET('/api/reports/mine', ({ user }) => db.reports.filter((r) => r.reporterId === user.id || (r.kind === 'dispute' && r.targetUserId === user.id)).sort((a, b) => b.createdAt - a.createdAt).map((r) => reportView(r)));
// ---------- my account status: actions taken on my account, corrective actions, appeals
const actionView = (m) => ({ ...m, title: ACTION_TEXT[m.action] || m.action, appeal: db.appeals.find((a) => a.actionId === m.id) || null,
  canAppeal: APPEALABLE.includes(m.action) && !m.rescinded && !db.appeals.some((a) => a.actionId === m.id) && now() - m.at < S().appealWindowDays * DAY });
GET('/api/moderation/mine', ({ user }) => ({
  status: user.status, statusReason: user.statusReason, suspendedUntil: user.suspendedUntil, strikes: user.strikes.length,
  restrictions: { listings: listingRestriction(user) }, appealWindowDays: S().appealWindowDays,
  actions: db.modlog.filter((m) => m.userId === user.id).sort((a, b) => b.at - a.at).map(actionView),
}));
// Corrective action done → admins are told to verify. Allowed while suspended or restricted.
POST('/api/moderation/:id/corrected', ({ user, params, body }) => {
  const m = find('modlog', params.id);
  if (!m || m.userId !== user.id || !m.correction) fail(404, 'Not found');
  if (m.correction.doneAt) fail(409, 'Already marked as corrected.');
  m.correction.doneAt = now(); m.correction.note = clampStr(body.note, 300);
  audit(user.id, 'correction_done', m.id, m.correction.note);
  for (const a of db.users.filter((x) => x.isAdmin)) notify(a.id, 'admin', 'Corrective action completed', `${user.name}: ${m.correction.note || m.correction.text}`, `#/admin/vendor/${user.id}`);
  return actionView(m);
});
// Appeals are open to suspended and banned members too — that is the point of an appeal.
POST('/api/appeals', ({ user, body }) => {
  const m = find('modlog', body.actionId);
  if (!m || m.userId !== user.id) fail(404, 'That action was not found on your account.');
  if (!APPEALABLE.includes(m.action)) fail(400, 'This action cannot be appealed.');
  if (m.rescinded) fail(400, 'This action was already reversed.');
  if (db.appeals.some((a) => a.actionId === m.id)) fail(409, 'You already appealed this action.');
  if (now() - m.at > S().appealWindowDays * DAY) fail(400, `Appeals must be filed within ${S().appealWindowDays} days of the action.`);
  const text = clampStr(body.text, 1000);
  if (text.length < 20) fail(400, 'Explain why the decision should change (at least 20 characters).');
  rateLimit('appeal:' + user.id, 5, DAY);
  const a = { id: uid('ap'), userId: user.id, actionId: m.id, action: m.action, text, evidence: validPhotos(body.evidence ? [body.evidence] : [], { max: 1 })[0] || null, status: 'pending', createdAt: now(), decision: null };
  db.appeals.push(a);
  audit(user.id, 'appeal', m.id, text.slice(0, 120));
  for (const ad of db.users.filter((x) => x.isAdmin)) { notify(ad.id, 'admin', 'New appeal', `${user.name} appealed: ${ACTION_TEXT[m.action]}`, '#/admin/appeals'); push(ad.id, 'admin', { kind: 'appeal' }); }
  return a;
});
POST('/api/sos', ({ user, body }) => {
  const s = { id: uid('o'), userId: user.id, location: locById(body.location) ? body.location : null, note: clampStr(body.note, 200), lat: Number(body.lat) || null, lng: Number(body.lng) || null, at: now(), status: 'open' };
  db.sos.push(s);
  for (const a of db.users.filter((u) => u.isAdmin)) { notify(a.id, 'sos', '🚨 SOS alert', `${user.name} needs help${s.location ? ' near ' + locById(s.location).name : ''}.`, '#/admin/sos'); push(a.id, 'sos', s); }
  audit(user.id, 'sos', s.id);
  return { ok: true, security: CAMPUS.securityPhone, name: CAMPUS.securityName, emergencyContact: decrypt(user.emergency) || null };
});
