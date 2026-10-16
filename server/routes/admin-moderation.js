// API routes — Admin moderation: complaints queue, report review and decisions, vendor case files, appeals.
import { REPORT_CATEGORIES, suggestPrice } from '../config/rules.js';
import { db, find, uid } from '../core/db.js';
import { GET, POST, adminOnly } from '../core/http.js';
import { push } from '../core/realtime.js';
import { clampStr, fail, int, now } from '../core/util.js';
import { sysMsg } from '../services/chat.js';
import { dealView, step } from '../services/deals.js';
import { ACCOUNT_ACTIONS, ACTION_TEXT, applyModeration, isOpenReport, listingRestriction, recordAction, reportView, reverseAction, vendorStats } from '../services/moderation.js';
import { audit, notify } from '../services/notifications.js';
import { applyStrike, badgesFor, publicUser } from '../services/users.js';
import { ledger, refundHold, releaseDeal } from '../services/wallet.js';

// ---------- complaints queue
const REPORT_PREVIEW_COLS = { user: 'users', listing: 'listings', task: 'tasks', message: 'messages', deal: 'deals', lostfound: 'lostfound' };
function adminReportItem(r, user, statsOf) {
  const target = find(REPORT_PREVIEW_COLS[r.targetType], r.targetId);
  let preview = null;
  if (r.targetType === 'listing' && target) preview = { title: target.title, price: target.price, photo: target.photos[0], status: target.status, fair: target.price > 0 ? suggestPrice(target, db.listings.filter((x) => x.id !== target.id)) : null };
  if (r.targetType === 'task' && target) preview = { title: target.title, reward: target.reward, status: target.status };
  if (r.targetType === 'message' && target) preview = { text: target.text };
  if (r.targetType === 'lostfound' && target) preview = { title: target.title, status: target.status };
  if (r.targetType === 'deal' && target) preview = { ...dealView(target, user), chat: db.messages.filter((m) => m.threadId === target.threadId).slice(-30) };
  const vendor = r.vendorId && find('users', r.vendorId);
  return {
    ...reportView(r, { admin: true }), reporter: publicUser(find('users', r.reporterId), user), targetUser: publicUser(vendor, user), preview,
    vendorStats: vendor && r.kind === 'report' ? statsOf(vendor) : null, vendorRestricted: !!listingRestriction(vendor),
    notes: (r.notes || []).map((n) => ({ ...n, byName: find('users', n.by)?.name })),
  };
}
function reportPriority(item) {
  const st = item.vendorStats;
  return (st?.needsReview ? 50 : 0) + (st?.risk.score || 0) * 2 + (item.overdue ? 20 : 0) + (item.kind === 'dispute' ? 10 : 0)
    + (item.signals?.interacted ? 5 : 0) - (item.signals && !item.signals.credible ? 15 : 0) + (item.status === 'open' ? 3 : 0);
}
const STATUS_FILTER = { active: isOpenReport, pending: (r) => r.status === 'open', open: isOpenReport, under_review: (r) => r.status === 'under_review', resolved: (r) => r.status === 'resolved', dismissed: (r) => r.status === 'dismissed', closed: (r) => !isOpenReport(r), all: () => true };
// Without ?page the endpoint returns a plain array (original contract); with ?page it returns a paginated result for the dashboard.
GET('/api/admin/reports', ({ user, query }) => {
  const cache = new Map(), statsOf = (u) => cache.get(u.id) || cache.set(u.id, vendorStats(u)).get(u.id);
  const statusF = STATUS_FILTER[query.status || (query.page ? 'active' : 'open')];
  if (!statusF) fail(400, 'Unknown status filter.');
  let rs = db.reports.filter(statusF);
  if (query.kind && query.kind !== 'all') rs = rs.filter((r) => r.kind === query.kind);
  if (query.category) rs = rs.filter((r) => r.category === query.category);
  if (query.vendor) rs = rs.filter((r) => r.vendorId === query.vendor);
  let items = rs.map((r) => adminReportItem(r, user, statsOf));
  const q = clampStr(query.q, 60).toLowerCase();
  if (q) items = items.filter((x) => [x.reason, x.details, x.reporter?.name, x.targetUser?.name, x.preview?.title, x.categoryLabel].some((v) => v && String(v).toLowerCase().includes(q)));
  const sorts = { priority: (a, b) => reportPriority(b) - reportPriority(a) || a.dueAt - b.dueAt, due: (a, b) => a.dueAt - b.dueAt, newest: (a, b) => b.createdAt - a.createdAt, oldest: (a, b) => a.createdAt - b.createdAt };
  items.sort(sorts[query.sort] || (query.page ? sorts.priority : sorts.due));
  if (!query.page) return items;
  const pageSize = Math.min(50, Math.max(5, int(query.pageSize) || 20)), total = items.length, pages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(pages, Math.max(1, int(query.page)));
  const counts = Object.fromEntries(['active', 'pending', 'under_review', 'resolved', 'dismissed', 'all'].map((k) => [k, db.reports.filter(STATUS_FILTER[k]).length]));
  return { items: items.slice((page - 1) * pageSize, page * pageSize), total, page, pages, pageSize, counts };
}, adminOnly);
POST('/api/admin/reports/:id/review', ({ user, params }) => {
  const r = find('reports', params.id);
  if (!r) fail(404, 'Report not found.');
  if (r.status !== 'open') fail(400, r.status === 'under_review' ? 'Already under review.' : 'This report is already closed.');
  r.status = 'under_review'; r.reviewer = user.id; r.reviewStartedAt = now();
  notify(r.reporterId, 'report', 'Your report is under review', `A moderator is now investigating: ${r.reason}.`, '#/settings/reports');
  audit(user.id, 'report:under_review', r.id);
  return reportView(r, { admin: true });
}, adminOnly);
POST('/api/admin/reports/:id/notes', ({ user, params, body }) => {
  const r = find('reports', params.id);
  if (!r) fail(404, 'Report not found.');
  const text = clampStr(body.text, 1000);
  if (text.length < 2) fail(400, 'Write a note first.');
  const n = { id: uid('rn'), by: user.id, text, at: now() };
  (r.notes ||= []).push(n);
  audit(user.id, 'report:note', r.id, text.slice(0, 120));
  return { ...n, byName: user.name };
}, adminOnly);
POST('/api/admin/reports/:id/resolve', ({ user, params, body }) => {
  const r = find('reports', params.id);
  if (!r) fail(404, 'Report not found.');
  if (!isOpenReport(r)) fail(400, 'Report already resolved.');
  const reason = clampStr(body.reason, 400);
  if (reason.length < 5) fail(400, 'Every admin decision must include a clear written reason.');
  const action = body.action;
  const target = r.targetUserId && find('users', r.targetUserId);
  if (r.kind === 'dispute') {
    const d = find('deals', r.dealId);
    if (!['refund', 'release', 'split'].includes(action)) fail(400, 'Choose refund, release or split.');
    const payer = find('users', d.payerId), payee = find('users', d.payeeId);
    // free the listing / task the deal was locking: refund → back on sale or task cancelled; split → treated as completed
    const closeRef = (listingStatus, taskStatus) => {
      if (d.type === 'buy') { const l = find('listings', d.refId); if (l && l.status === 'reserved') l.status = listingStatus; }
      else { const t = find('tasks', d.refId); if (t && t.kind !== 'group' && t.status === 'assigned') t.status = taskStatus; }
    };
    if (action === 'refund') { refundHold(payer, d.escrow, `Dispute refund: “${d.title}”`, d.id); d.escrow = 0; step(d, 'refunded', user.id, `Admin refunded the payer. ${reason}`); d.closedAt = now(); closeRef('active', 'cancelled'); }
    if (action === 'release') { d.deliveredAt ||= now(); releaseDeal(d, `Admin released payment. ${reason}`); }
    if (action === 'split') {
      const half = Math.floor(d.amount / 2);
      payer.wallet.escrow -= d.escrow; payer.wallet.balance += d.escrow - half;
      payee.wallet.balance += half; payee.wallet.earned += half;
      ledger(payer.id, 'refund', d.escrow - half, `Dispute split refund: “${d.title}”`, d.id); ledger(payee.id, 'earning', half, `Dispute split: “${d.title}”`, d.id);
      d.escrow = 0; step(d, 'refunded', user.id, `Admin split the amount 50/50. ${reason}`); d.closedAt = now(); closeRef('sold', 'done');
    }
    for (const id of [d.payerId, d.payeeId]) { notify(id, 'dispute', 'Dispute decided', `Decision: ${action}. Reason: ${reason}`, `#/deal/${d.id}`); push(id, 'deal', { id: d.id }); }
    sysMsg(find('threads', d.threadId), `Admin decision: ${action.toUpperCase()}. Reason: ${reason}`);
    if (body.strikeUserId) { const su = find('users', body.strikeUserId); if (su) applyStrike(su, reason, user.id, { reportId: r.id }); }
    r.status = 'resolved';
  } else {
    if (!['dismiss', 'remove', ...ACCOUNT_ACTIONS.filter((a) => !['lift_restriction', 'reinstate'].includes(a))].includes(action)) fail(400, 'Unknown action.');
    if (action !== 'dismiss' && action !== 'remove' && !target) fail(400, 'This report has no member to act on.');
    if (action === 'remove' || (body.removePost && ['listing', 'task', 'lostfound'].includes(r.targetType))) {
      const col = { listing: 'listings', task: 'tasks', lostfound: 'lostfound' }[r.targetType];
      const t = col && find(col, r.targetId);
      if (!t) { if (action === 'remove') fail(400, 'Only listings, tasks and lost & found posts can be removed.'); }
      else if (t.status !== 'removed') {
        const prev = t.status;
        t.status = t.status === 'reserved' ? t.status : 'removed'; t.removedReason = reason;
        if (r.targetType === 'task' && t.escrow) { refundHold(find('users', t.posterId), t.escrow, `Refund: task removed by admin`, t.id); t.escrow = 0; }
        const owner = find('users', t.sellerId || t.posterId || t.userId);
        if (owner) recordAction(owner, user.id, 'remove', `“${t.title}” removed. ${reason}`, { reportId: r.id, postType: r.targetType, postId: t.id, prevStatus: prev });
      }
    }
    if (action !== 'dismiss' && action !== 'remove') applyModeration(target, user, action, reason, { days: body.days, correction: body.correction, reportId: r.id });
    r.status = action === 'dismiss' ? 'dismissed' : 'resolved';
  }
  r.decision = { action, reason, by: user.id, at: now(), withinSla: now() <= r.dueAt };
  const msg = r.status === 'dismissed' ? `No violation was confirmed. Reason: ${reason}` : `Action: ${action}. Reason: ${reason}`;
  notify(r.reporterId, 'report', r.kind === 'dispute' ? 'Your dispute was decided' : 'Your report was reviewed', msg, '#/settings/reports');
  audit(user.id, `${r.kind}:${action}`, r.id, reason, { targetUserId: r.targetUserId });
  return reportView(r, { admin: true });
}, adminOnly);
// ---------- vendors: report counts, risk and full moderation history
function vendorSummary(u, viewer) {
  return { ...publicUser(u, viewer), collegeId: u.collegeId, dept: u.dept, status: u.status, statusReason: u.statusReason, suspendedUntil: u.suspendedUntil, restriction: listingRestriction(u), report: vendorStats(u) };
}
// What customers report a vendor for: distinct reporters, latest complaint, most common reasons and deal disputes.
function reportDigest(u) {
  const rs = db.reports.filter((r) => r.vendorId === u.id), reps = rs.filter((r) => r.kind === 'report');
  const byCat = {};
  for (const r of reps) byCat[r.category] = (byCat[r.category] || 0) + 1;
  return {
    reporters: new Set(reps.map((r) => r.reporterId)).size, lastAt: Math.max(0, ...rs.map((r) => r.createdAt)) || null,
    disputes: rs.length - reps.length, openDisputes: rs.filter((r) => r.kind === 'dispute' && isOpenReport(r)).length,
    top: Object.entries(byCat).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([id, n]) => ({ id, label: REPORT_CATEGORIES.find((c) => c.id === id)?.en || 'Other', n })),
  };
}
GET('/api/admin/vendors', ({ user, query }) => {
  const ids = new Set([...db.reports.filter((r) => r.kind === 'report' && r.vendorId).map((r) => r.vendorId), ...db.modlog.map((m) => m.userId)]);
  for (const u of db.users) if (u.status !== 'active' || listingRestriction(u)) ids.add(u.id);
  let vs = [...ids].map((id) => find('users', id)).filter((u) => u && !u.deleted).map((u) => ({ ...vendorSummary(u, user), digest: reportDigest(u) }));
  const reported = vs.filter((v) => v.report.total);
  const summary = { reported: reported.length, needsReview: vs.filter((v) => v.report.needsReview).length, openReports: reported.reduce((n, v) => n + v.report.open, 0) };
  const q = clampStr(query.q, 40).toLowerCase();
  if (q) vs = vs.filter((v) => v.name.toLowerCase().includes(q) || v.collegeId.toLowerCase().includes(q));
  if (query.reported === '1') vs = vs.filter((v) => v.report.total);
  if (['high', 'medium', 'low'].includes(query.risk)) vs = vs.filter((v) => v.report.risk.level === query.risk);
  if (query.review === '1') vs = vs.filter((v) => v.report.needsReview);
  const sorts = { risk: (a, b) => b.report.risk.score - a.report.risk.score || b.report.open - a.report.open, reports: (a, b) => b.report.total - a.report.total, open: (a, b) => b.report.open - a.report.open, recent: (a, b) => b.digest.lastAt - a.digest.lastAt, name: (a, b) => a.name.localeCompare(b.name) };
  vs.sort(sorts[query.sort] || sorts.risk);
  const pageSize = 20, total = vs.length, pages = Math.max(1, Math.ceil(total / pageSize)), page = Math.min(pages, Math.max(1, int(query.page) || 1));
  return { items: vs.slice((page - 1) * pageSize, page * pageSize), total, page, pages, summary };
}, adminOnly);
GET('/api/admin/vendors/:id', ({ user, params }) => {
  const u = find('users', params.id);
  if (!u || u.deleted) fail(404, 'Member not found.');
  const cache = new Map(), statsOf = (x) => cache.get(x.id) || cache.set(x.id, vendorStats(x)).get(x.id);
  return {
    ...vendorSummary(u, user), strikesList: u.strikes, badges: badgesFor(u),
    listings: db.listings.filter((l) => l.sellerId === u.id).sort((a, b) => b.createdAt - a.createdAt).slice(0, 30).map((l) => ({ id: l.id, title: l.title, price: l.price, status: l.status, photo: l.photos[0], removedReason: l.removedReason })),
    reports: db.reports.filter((r) => r.vendorId === u.id).sort((a, b) => b.createdAt - a.createdAt).map((r) => adminReportItem(r, user, statsOf)),
    history: db.modlog.filter((m) => m.userId === u.id).sort((a, b) => b.at - a.at).map((m) => ({ ...m, title: ACTION_TEXT[m.action] || m.action, byName: find('users', m.by)?.name, appeal: db.appeals.find((a) => a.actionId === m.id) || null })),
    flags: db.flags.filter((f) => f.userId === u.id).sort((a, b) => b.at - a.at).slice(0, 20),
  };
}, adminOnly);
// ---------- appeals
GET('/api/admin/appeals', ({ user, query }) => db.appeals.filter((a) => query.status === 'all' || (query.status === 'decided' ? a.status !== 'pending' : a.status === 'pending'))
  .sort((a, b) => a.createdAt - b.createdAt).map((a) => {
    const m = find('modlog', a.actionId);
    return { ...a, user: vendorSummary(find('users', a.userId), user), original: m && { ...m, title: ACTION_TEXT[m.action], byName: find('users', m.by)?.name }, report: m?.reportId ? reportView(find('reports', m.reportId), { admin: true }) : null };
  }), adminOnly);
POST('/api/admin/appeals/:id', ({ user, params, body }) => {
  const a = find('appeals', params.id);
  if (!a) fail(404, 'Appeal not found.');
  if (a.status !== 'pending') fail(400, 'This appeal was already decided.');
  if (!['uphold', 'overturn'].includes(body.decision)) fail(400, 'Choose uphold or overturn.');
  const reason = clampStr(body.reason, 400);
  if (reason.length < 5) fail(400, 'Every appeal decision needs a written reason.');
  const m = find('modlog', a.actionId), u = find('users', a.userId);
  if (m.by === user.id && body.decision === 'uphold' && db.users.filter((x) => x.isAdmin && !x.deleted).length > 1) fail(403, 'Another moderator should review appeals against your own decision.');
  a.status = body.decision === 'overturn' ? 'overturned' : 'upheld';
  a.decision = { by: user.id, reason, at: now() };
  if (a.status === 'overturned') {
    reverseAction(m, u);
    m.rescinded = { by: user.id, at: now(), reason, appealId: a.id };
    const r = m.reportId && find('reports', m.reportId);
    if (r?.decision) r.decision.overturned = { at: now(), reason };
  }
  notify(u.id, 'moderation', a.status === 'overturned' ? 'Appeal accepted ✓' : 'Appeal not accepted', `${ACTION_TEXT[m.action]}: ${reason}`, '#/settings/moderation');
  audit(user.id, `appeal:${a.status}`, a.id, reason, { targetUserId: u.id });
  return a;
}, adminOnly);
