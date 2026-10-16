// API routes — Lost & found (admin-held desk), leaderboard, badges and announcements.
import { LOST_FOUND_DESK, locById, prohibitedCheck } from '../config/rules.js';
import { db, find, uid } from '../core/db.js';
import { GET, POST, adminOnly, rateLimit } from '../core/http.js';
import { push } from '../core/realtime.js';
import { DAY, H, clampStr, fail, now } from '../core/util.js';
import { validPhotos } from '../core/validate.js';
import { impact } from '../services/community.js';
import { audit, notify } from '../services/notifications.js';
import { badgesFor, publicUser, requireActive } from '../services/users.js';

// ---------- lost & found: the admin desk holds every item, so owners and finders never deal directly.
// Finder hands the item in and reports it (pending) → admin confirms receipt and publishes it (held) →
// owner claims with proof → admin approves one claim (ready) → owner collects at the desk with their ID (returned).
// Nobody can post a "lost" item: fake lost posts and direct finder contact were how claim scams happened.
const LF_PUBLIC = ['held', 'ready'];
const adminsNotify = (title, body, link) => { for (const a of db.users.filter((u) => u.isAdmin && !u.deleted)) { notify(a.id, 'admin', title, body, link); push(a.id, 'admin', { kind: 'lostfound' }); } };
const myClaim = (x, user) => x.claims.filter((c) => c.userId === user.id).sort((a, b) => b.at - a.at)[0] || null;
// what members see: no finder identity, no private verification detail, no other people's claims
const lfPublic = (x, user) => {
  const c = myClaim(x, user);
  return { id: x.id, title: x.title, desc: x.desc, location: x.location, when: x.when, photo: x.showPhoto === false ? null : x.photo, at: x.publishedAt || x.at, status: x.status, pickup: LOST_FOUND_DESK, myClaim: c && { status: c.status, at: c.at, reason: c.reason || null } };
};
const lfMine = (x) => ({ id: x.id, title: x.title, desc: x.desc, location: x.location, when: x.when, photo: x.photo, at: x.at, status: x.status, rejectReason: x.rejectReason || null, pickup: LOST_FOUND_DESK });

GET('/api/lostfound', ({ user }) => ({
  items: db.lostfound.filter((x) => LF_PUBLIC.includes(x.status)).sort((a, b) => (b.publishedAt || b.at) - (a.publishedAt || a.at)).map((x) => lfPublic(x, user)),
  mine: db.lostfound.filter((x) => x.userId === user.id && x.kind === 'found').sort((a, b) => b.at - a.at).map(lfMine),
  claims: db.lostfound.filter((x) => x.userId !== user.id && myClaim(x, user)).map((x) => lfPublic(x, user)),
}));
POST('/api/lostfound', ({ user, body }) => {
  requireActive(user);
  if (body.kind === 'lost') fail(400, 'Lost items can’t be posted. Check the items held at the admin desk — finders hand everything in there — and claim yours with proof.', { rule: 'no_lost_posts' });
  rateLimit('lf:' + user.id, 5, H);
  const title = clampStr(body.title, 70);
  if (title.length < 3) fail(400, 'Add a short title.');
  const bad = prohibitedCheck(title, body.desc); if (bad) fail(422, bad);
  const x = {
    id: uid('x'), userId: user.id, kind: 'found', title, desc: clampStr(body.desc, 400), secret: clampStr(body.secret, 200),
    location: locById(body.location) ? body.location : null, photo: validPhotos(body.photo ? [body.photo] : [], { max: 1 })[0] || null,
    at: now(), status: 'pending', when: clampStr(body.when, 40), claims: [],
  };
  db.lostfound.push(x);
  adminsNotify('Found item reported', `${user.name} is handing in “${title}”. Confirm once it reaches the desk.`, '#/admin/lostfound');
  audit(user.id, 'lostfound:report', x.id);
  return lfMine(x);
});
// finder can withdraw a report the desk hasn't received yet (e.g. they returned it some other way)
POST('/api/lostfound/:id/withdraw', ({ user, params }) => {
  const x = find('lostfound', params.id);
  if (!x || x.userId !== user.id) fail(404, 'Not found');
  if (x.status !== 'pending') fail(400, 'The admin desk already has this item — ask the desk if something changed.');
  x.status = 'withdrawn';
  return lfMine(x);
});
POST('/api/lostfound/:id/claim', ({ user, params, body }) => {
  requireActive(user);
  const x = find('lostfound', params.id);
  if (!x || !LF_PUBLIC.includes(x.status)) fail(404, 'This item is not at the desk any more.');
  if (x.status !== 'held') fail(400, 'This item has already been matched to its owner.');
  if (x.userId === user.id) fail(400, 'You handed this item in — you can’t claim it.');
  if (x.claims.some((c) => c.userId === user.id)) fail(409, 'You already claimed this item. The admin desk will contact you.');
  rateLimit('lfclaim:' + user.id, 5, DAY);
  const proof = clampStr(body.proof, 400);
  if (proof.length < 10) fail(400, 'Describe the item so the desk can verify it is yours — marks, contents, where and when you lost it.');
  const c = { id: uid('lc'), userId: user.id, proof, at: now(), status: 'pending' };
  x.claims.push(c);
  adminsNotify('New claim on a found item', `${user.name} says “${x.title}” is theirs. Check their proof before releasing it.`, '#/admin/lostfound');
  audit(user.id, 'lostfound:claim', x.id);
  return lfPublic(x, user);
});

// ---------- admin desk
GET('/api/admin/lostfound', ({ user, query }) => {
  const st = query.status || 'action';
  const needsAction = (x) => x.status === 'pending' || x.status === 'ready' || (x.status === 'held' && x.claims.some((c) => c.status === 'pending'));
  const found = db.lostfound.filter((x) => x.kind === 'found'); // closed legacy "lost" posts are not desk items
  const items = found.filter((x) => (st === 'action' ? needsAction(x) : st === 'all' ? true : x.status === st));
  const counts = { action: found.filter(needsAction).length, ...Object.fromEntries(['pending', 'held', 'ready', 'returned', 'rejected'].map((k) => [k, found.filter((x) => x.status === k).length])), all: found.length };
  return {
    counts,
    items: items.sort((a, b) => b.at - a.at).map((x) => ({
      ...x, finder: publicUser(find('users', x.userId), user), receivedByName: x.receivedBy && find('users', x.receivedBy)?.name,
      claims: x.claims.map((c) => ({ ...c, user: publicUser(find('users', c.userId), user), collegeId: find('users', c.userId)?.collegeId })),
      returnedToName: x.returnedTo && find('users', x.returnedTo)?.name,
    })),
  };
}, adminOnly);
const lfAdminItem = (params, status) => {
  const x = find('lostfound', params.id);
  if (!x) fail(404, 'Item not found.');
  if (status && x.status !== status) fail(400, `This item is ${x.status}, not ${status}.`);
  return x;
};
// item physically reached the desk → publish it (admin may reword it and hide the photo so details stay secret)
POST('/api/admin/lostfound/:id/receive', ({ user, params, body }) => {
  const x = lfAdminItem(params, 'pending');
  const title = clampStr(body.title ?? x.title, 70), desc = clampStr(body.desc ?? x.desc, 400);
  if (title.length < 3) fail(400, 'Add a short title.');
  Object.assign(x, { title, desc, showPhoto: body.showPhoto !== false, status: 'held', receivedBy: user.id, receivedAt: now(), publishedAt: now() });
  notify(x.userId, 'lostfound', 'Thanks — item received 🙌', `The admin desk received “${x.title}” and posted it so the owner can claim it.`, '#/lostfound');
  audit(user.id, 'lostfound:receive', x.id);
  return x;
}, adminOnly);
POST('/api/admin/lostfound/:id/reject', ({ user, params, body }) => {
  const x = lfAdminItem(params, 'pending');
  const reason = clampStr(body.reason, 300);
  if (reason.length < 5) fail(400, 'Give the finder a reason.');
  Object.assign(x, { status: 'rejected', rejectReason: reason });
  notify(x.userId, 'lostfound', 'Found-item report closed', `“${x.title}”: ${reason}`, '#/lostfound');
  audit(user.id, 'lostfound:reject', x.id, reason);
  return x;
}, adminOnly);
POST('/api/admin/lostfound/:id/claims/:cid', ({ user, params, body }) => {
  const x = lfAdminItem(params, 'held');
  const c = x.claims.find((k) => k.id === params.cid);
  if (!c || c.status !== 'pending') fail(404, 'No pending claim with that id.');
  const reason = clampStr(body.reason, 300);
  if (body.decision === 'approve') {
    Object.assign(c, { status: 'approved', decidedAt: now(), decidedBy: user.id, reason });
    x.status = 'ready';
    notify(c.userId, 'lostfound', 'Claim approved — collect your item', `Collect “${x.title}” at the ${locById(LOST_FOUND_DESK).name} desk. Bring your college ID.`, '#/lostfound');
    for (const o of x.claims.filter((k) => k.status === 'pending')) {
      Object.assign(o, { status: 'rejected', decidedAt: now(), decidedBy: user.id, reason: 'The item was matched to another claimant.' });
      notify(o.userId, 'lostfound', 'Claim not approved', `“${x.title}” was matched to another claimant after verification.`, '#/lostfound');
    }
  } else if (body.decision === 'reject') {
    if (reason.length < 5) fail(400, 'Give the claimant a reason.');
    Object.assign(c, { status: 'rejected', decidedAt: now(), decidedBy: user.id, reason });
    notify(c.userId, 'lostfound', 'Claim not approved', `“${x.title}”: ${reason}`, '#/lostfound');
  } else fail(400, 'Choose approve or reject.');
  audit(user.id, `lostfound:claim_${body.decision}`, x.id, reason, { targetUserId: c.userId });
  return x;
}, adminOnly);
// owner showed their college ID at the desk and took the item
POST('/api/admin/lostfound/:id/returned', ({ user, params }) => {
  const x = lfAdminItem(params, 'ready');
  const c = x.claims.find((k) => k.status === 'approved');
  Object.assign(x, { status: 'returned', returnedTo: c.userId, returnedAt: now(), returnedBy: user.id });
  notify(c.userId, 'lostfound', 'Item collected ✓', `You collected “${x.title}” from the admin desk.`, '#/lostfound');
  notify(x.userId, 'lostfound', 'Your found item reached its owner 🎉', `“${x.title}” was returned to its owner. Thank you for handing it in!`, '#/lostfound');
  audit(user.id, 'lostfound:returned', x.id, '', { targetUserId: c.userId });
  return x;
}, adminOnly);
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
