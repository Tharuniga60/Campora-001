// API routes — Task board, pick & drop and group runs: posting, offers, assignment.
import { breakdown, distance, fairFare, istDayKey, locById, prohibitedCheck } from '../config/rules.js';
import { db, find, uid } from '../core/db.js';
import { DEL, GET, POST, rateLimit } from '../core/http.js';
import { push, pushAll } from '../core/realtime.js';
import { H, S, clampStr, fail, int, now } from '../core/util.js';
import { validDeadline, validPhotos } from '../core/validate.js';
import { blockedBetween, fairRank, taskView } from '../services/catalog.js';
import { ACTIVE, cancelDeal, createDeal, dealUpdate, dealView } from '../services/deals.js';
import { requireCanSell, sellerVisible } from '../services/moderation.js';
import { flag, notify } from '../services/notifications.js';
import { activeHelperJobs, checkDaily, requireActive } from '../services/users.js';
import { hold, refundHold } from '../services/wallet.js';

GET('/api/tasks', ({ user, query }) => {
  let t = db.tasks;
  if (query.mine === '1') t = t.filter((x) => x.posterId === user.id);
  else if (query.helping === '1') t = t.filter((x) => x.offers.some((o) => o.helperId === user.id) && x.status !== 'removed');
  else t = t.filter((x) => x.status === 'open' && !blockedBetween(user, x.posterId) && sellerVisible(x.posterId));
  if (query.kind) t = t.filter((x) => x.kind === query.kind);
  const views = t.map((x) => taskView(x, user));
  if (query.mine === '1' || query.helping === '1') return views.sort((a, b) => b.createdAt - a.createdAt);
  const urgent = views.filter((v) => v.urgent).sort((a, b) => a.deadline - b.deadline);
  return [...urgent, ...fairRank(views.filter((v) => !v.urgent), user)];
});
GET('/api/fare', ({ query }) => ({ distance: distance(query.from, query.to), fare: fairFare(query.from, query.to, query.size), formula: '₹10 base + ₹3 per 100 m + size surcharge, rounded to ₹5' }));
POST('/api/tasks', ({ user, body }) => {
  requireCanSell(user);
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
  if (!sellerVisible(t.posterId)) fail(400, 'This task is paused while the poster\'s account is under restriction.');
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
  if (!sellerVisible(t.posterId)) fail(400, 'This run is paused while the runner\'s account is under restriction.');
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
