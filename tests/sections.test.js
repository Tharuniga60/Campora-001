// Coverage of every application section (mandatory + optional), one test per section.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, PNG } from './helpers/server.js';

let srv, cfg, call, ok, post, me;
const T = {};
const P = []; // shared signed-up users
const inHours = () => new Date(Date.now() + 3 * 3600e3).toISOString();

let seq = 0;
async function signup(name, extra = {}) {
  const n = ++seq, phone = `90000${String(n).padStart(5, '0')}`;
  const otp = await post('/auth/otp', null, { phone, purpose: 'signup' });
  const r = await post('/auth/signup', null, { name, email: `t${n}@dec.edu.in`, collegeId: `TS${10000 + n}`, dept: 'CSE', year: 2, residence: 'day', phone, otp: otp.demoOtp, consent: { terms: true, privacy: true }, ...extra });
  await post('/wallet/topup', r.token, { amount: 2000 });
  return { token: r.token, id: r.me.id, phone, me: r.me };
}
async function listing(token, body = {}) {
  return post('/listings', token, { title: `Item ${++seq} unique${seq}`, desc: 'Test item', category: 'stationery', condition: 'good', price: 100, photos: [PNG], meetPoint: 'library', ...body });
}
// buy deal from offer to paid; returns the paid deal
async function buyFlow(buyer, seller, l, amount = l.price) {
  const d = await post(`/listings/${l.id}/offer`, buyer.token, { amount });
  await post(`/deals/${d.id}/accept`, seller.token);
  return post(`/deals/${d.id}/confirm`, buyer.token);
}
// assigned task deal between poster and helper
async function taskDeal(poster, helper, body = {}) {
  const tk = await post('/tasks', poster.token, { kind: 'task', title: `Print notes ${++seq}`, reward: 40, deadline: inHours(), location: 'xerox', ...body });
  await post(`/tasks/${tk.id}/offers`, helper.token, { note: 'on it' });
  return post(`/tasks/${tk.id}/assign`, poster.token, { helperId: helper.id });
}

before(async () => {
  srv = await startServer();
  ({ cfg, call, ok, post, me } = srv);
  Object.assign(T, srv.tokens);
  // tasks must be postable at any hour while testing
  await ok('/admin/settings', { method: 'PATCH', token: T.admin, body: { enforceHours: false } });
  for (let i = 0; i < 12; i++) P.push(await signup(`Pool User${String.fromCharCode(65 + i)}`));
});
after(() => srv.stop());

// ------------------------------------------------------------------ mandatory
test('sign-up and verification: wrong OTP rejected, OTP login works', async () => {
  const otp = await post('/auth/otp', null, { phone: '9111111111', purpose: 'signup' });
  const bad = await call('/auth/signup', { method: 'POST', body: { name: 'Wrong Otp', email: 'w@dec.edu.in', collegeId: 'CS99911', dept: 'CSE', phone: '9111111111', otp: otp.demoOtp === '123456' ? '654321' : '123456', consent: { terms: true, privacy: true } } });
  assert.equal(bad.status, 400);
  const u = await signup('Login Tester');
  assert.equal((await call('/auth/otp', { method: 'POST', body: { phone: '9222222222', purpose: 'login' } })).status, 404);
  const lo = await post('/auth/otp', null, { phone: u.phone, purpose: 'login' });
  const s = await post('/auth/login', null, { phone: u.phone, otp: lo.demoOtp });
  assert.equal(s.me.id, u.id);
  assert.deepEqual(s.me.badges.map((b) => b.id), ['verified']);
});

test('user profile: editable bio/privacy, public view respects privacy', async () => {
  const [a, b] = [P[0], P[1]];
  await ok('/me', { method: 'PATCH', token: a.token, body: { bio: 'Hello campus', privacy: { dept: false } } });
  const v = await ok(`/users/${a.id}`, { token: b.token });
  assert.equal(v.bio, 'Hello campus');
  assert.equal(v.dept, null, 'hidden department');
  assert.ok(Array.isArray(v.reviews) && Array.isArray(v.history) && typeof v.trust === 'number');
});

test('home feed: items with reasons, urgent strip, announcements, pulse', async () => {
  const f = await ok('/feed', { token: T.buyer });
  assert.ok(f.items.length > 0 && f.items.every((i) => i.why.length));
  assert.ok(Array.isArray(f.urgent) && Array.isArray(f.announcements));
  for (const k of ['dealsToday', 'openTasks', 'activeListings', 'kgSaved']) assert.equal(typeof f.pulse[k], 'number');
  assert.ok((await ok('/feed?filter=tasks', { token: T.buyer })).items.every((i) => i.kind !== 'listing'));
});

test('marketplace: post with photo, search, edit, remove', async () => {
  const s = P[2];
  assert.equal((await call('/listings', { method: 'POST', token: s.token, body: { title: 'No photo item', category: 'books', condition: 'good', price: 50 } })).status, 400, 'photo required');
  const l = await listing(s.token, { title: 'Zebra drafter set', category: 'stationery' });
  assert.ok((await ok('/search?q=zebra', { token: T.buyer })).listings.some((x) => x.id === l.id));
  assert.equal((await ok(`/listings/${l.id}`, { method: 'PATCH', token: s.token, body: { price: 80 } })).price, 80);
  await ok(`/listings/${l.id}`, { method: 'DELETE', token: s.token });
  assert.equal((await call(`/listings/${l.id}`, { token: T.buyer })).status, 404);
});

test('task board: posted task locks reward, appears on board, can be cancelled with refund', async () => {
  const p = P[3];
  const tk = await post('/tasks', p.token, { kind: 'task', title: 'Collect my lab record', reward: 50, deadline: inHours() });
  assert.ok(tk.secured);
  assert.ok((await ok('/tasks', { token: T.buyer })).some((x) => x.id === tk.id));
  const held = (await me(p.token)).wallet;
  await ok(`/tasks/${tk.id}`, { method: 'DELETE', token: p.token });
  const w = (await me(p.token)).wallet;
  assert.equal(w.balance, held.balance + tk.total);
  assert.equal(w.escrow, held.escrow - tk.total);
});

test('pick and drop: fair fare, distinct points required, route on task', async () => {
  const fare = await ok('/fare?from=gate&to=hosA&size=medium', { token: T.buyer });
  assert.ok(fare.distance > 0 && fare.fare >= 10 && fare.fare % 5 === 0);
  const p = P[3];
  assert.equal((await call('/tasks', { method: 'POST', token: p.token, body: { kind: 'pickdrop', title: 'Parcel run', reward: 30, pickup: 'gate', drop: 'gate', deadline: inHours() } })).status, 400);
  const tk = await post('/tasks', p.token, { kind: 'pickdrop', title: 'Parcel run', reward: fare.fare, pickup: 'gate', drop: 'hosA', size: 'medium', deadline: inHours() });
  assert.equal(tk.distance, fare.distance);
});

test('in-app chat: thread, messages, unread count, masking', async () => {
  const [a, b] = [P[4], P[5]];
  const unread0 = (await me(b.token)).unreadChats;
  const th = await post('/threads', a.token, { userId: b.id });
  await post(`/threads/${th.id}/messages`, a.token, { text: 'Is the book still available?' });
  assert.equal((await me(b.token)).unreadChats, unread0 + 1);
  const r = await post(`/threads/${th.id}/messages`, b.token, { text: 'Yes, pay me on 9876543210' });
  assert.ok(r.message.masked && r.warnings.length);
  const full = await ok(`/threads/${th.id}`, { token: b.token });
  assert.equal(full.messages.length, 2);
  assert.equal((await me(b.token)).unreadChats, unread0);
});

test('payments and escrow: hold on offer, release on confirm, ledger + fee', async () => {
  const [s, b] = [P[6], P[7]];
  const l = await listing(s.token, { price: 500 });
  const before = (await me(b.token)).wallet, sBefore = (await me(s.token)).wallet;
  const d = await buyFlow(b, s, l);
  assert.equal(d.status, 'paid');
  assert.equal(d.fee, 10);
  const bw = (await me(b.token)).wallet, sw = (await me(s.token)).wallet;
  assert.equal(bw.balance, before.balance - 510);
  assert.equal(bw.escrow, before.escrow);
  assert.equal(sw.earned, sBefore.earned + 500);
  const led = await ok('/wallet', { token: s.token });
  assert.ok(led.ledger.some((x) => x.type === 'earning' && x.amount === 500));
});

test('my activity / orders: active and completed deal lists', async () => {
  const [s, b] = [P[6], P[7]];
  const l = await listing(s.token);
  const d = await post(`/listings/${l.id}/offer`, b.token, { amount: l.price });
  assert.ok((await ok('/deals?state=active', { token: b.token })).some((x) => x.id === d.id));
  await post(`/deals/${d.id}/accept`, s.token);
  await post(`/deals/${d.id}/confirm`, b.token);
  assert.ok((await ok('/deals?state=done', { token: b.token })).some((x) => x.id === d.id));
  assert.ok(!(await ok('/deals?state=active', { token: b.token })).some((x) => x.id === d.id));
});

test('notifications: created on events, mark all read', async () => {
  const [s, b] = [P[2], P[7]];
  const l = await listing(s.token);
  await post(`/listings/${l.id}/offer`, b.token, { amount: l.price });
  const ns = await ok('/notifications', { token: s.token });
  assert.ok(ns.some((n) => n.type === 'offer' && !n.read));
  await post('/notifications/read', s.token);
  assert.equal((await me(s.token)).unread, 0);
});

test('ratings and reviews: only after completion, once, shown on profile', async () => {
  const [s, b] = [P[8], P[7]];
  const l = await listing(s.token);
  const d0 = await post(`/listings/${l.id}/offer`, b.token, { amount: l.price });
  assert.equal((await call(`/deals/${d0.id}/review`, { method: 'POST', token: b.token, body: { stars: 5 } })).status, 400);
  await post(`/deals/${d0.id}/accept`, s.token);
  await post(`/deals/${d0.id}/confirm`, b.token);
  await post(`/deals/${d0.id}/review`, b.token, { stars: 4, text: 'Smooth handover', tags: ['On time'] });
  assert.equal((await call(`/deals/${d0.id}/review`, { method: 'POST', token: b.token, body: { stars: 1 } })).status, 409);
  const p = await ok(`/users/${s.id}`, { token: b.token });
  assert.equal(p.stats.rating, 4);
  assert.equal(p.reviews[0].role, 'seller');
});

test('safety, report and dispute: report + block hides content, dispute freezes money', async () => {
  const [s, b] = [P[11], P[10]];
  const l = await listing(s.token);
  const rep = await post('/reports', b.token, { targetType: 'listing', targetId: l.id, category: 'fake_details', details: 'Photos are copied from a shopping site.', block: true });
  assert.equal(rep.status, 'open');
  assert.ok(!(await ok('/feed', { token: b.token })).items.some((x) => x.id === l.id), 'blocked seller hidden');
  assert.ok((await ok('/reports/mine', { token: b.token })).some((x) => x.id === rep.id));
  assert.ok((await ok('/admin/reports', { token: T.admin })).some((x) => x.id === rep.id));
});

test('campus locations: map with safe meeting points; unsafe meet point is replaced', async () => {
  assert.ok(cfg.locations.length >= 10 && cfg.locations.some((l) => l.safe) && cfg.locations.some((l) => !l.safe));
  const s = P[2];
  const l = await listing(s.token, { meetPoint: 'hosA' });
  assert.equal(l.meetPoint, 'library');
});

test('admin panel: overview, users, flags, settings, audit; admin-only', async () => {
  const o = await ok('/admin/overview', { token: T.admin });
  assert.ok(o.kpis.users > 0 && Array.isArray(o.weeks));
  assert.ok((await ok('/admin/users', { token: T.admin })).length > 0);
  assert.ok(Array.isArray(await ok('/admin/flags', { token: T.admin })));
  assert.ok((await ok('/admin/audit', { token: T.admin })).some((a) => a.action === 'settings'));
  assert.equal((await call('/admin/settings', { method: 'PATCH', token: T.buyer, body: { feePercent: 0 } })).status, 403);
});

test('settings, rules and support: rules text, support contact, data export, account deletion', async () => {
  assert.ok(cfg.rules.length >= 5 && cfg.prohibited.length && cfg.supportUserId && cfg.campus.securityPhone);
  const u = await signup('Settings User');
  const support = await post('/threads', u.token, { userId: cfg.supportUserId, refType: 'support' });
  assert.ok(support.id);
  const exp = await ok('/me/export', { token: u.token });
  assert.equal(exp.profile.id, u.id);
  await post('/wallet/withdraw', u.token, { amount: (await me(u.token)).wallet.balance, upiId: 'settings@okaxis' });
  await ok('/me', { method: 'DELETE', token: u.token });
  assert.equal((await call('/me', { token: u.token })).status, 401);
});

// ------------------------------------------------------------------ optional
test('wallet and earnings: top-up limits, UPI withdraw, weekly earnings', async () => {
  const u = P[5];
  const bal = (await me(u.token)).wallet.balance;
  assert.equal((await call('/wallet/topup', { method: 'POST', token: u.token, body: { amount: 5 } })).status, 400);
  assert.equal((await call('/wallet/withdraw', { method: 'POST', token: u.token, body: { amount: 10, upiId: 'nope' } })).status, 400);
  const w = await post('/wallet/withdraw', u.token, { amount: 100, upiId: 'wallet.user@okaxis' });
  assert.equal(w.wallet.balance, bal - 100);
  assert.equal((await ok('/wallet', { token: u.token })).weeks.length, 8);
});

test('live tracking: helper stages are visible to the receiver', async () => {
  const [p, h] = [P[0], P[1]];
  const d = await taskDeal(p, h);
  assert.equal((await call(`/deals/${d.id}/track`, { method: 'POST', token: h.token, body: { stage: 'picked_up' } })).status, 400, 'only while in progress');
  await post(`/deals/${d.id}/start`, h.token);
  await post(`/deals/${d.id}/track`, h.token, { stage: 'on_the_way', lat: 11.0, lng: 77.0 });
  const v = await ok(`/deals/${d.id}`, { token: p.token });
  assert.equal(v.tracking.stage, 'on_the_way');
  assert.equal(v.tracking.lat, 11);
});

test('wishlist: toggle, list, price-drop notification', async () => {
  const [s, b] = [P[2], P[4]];
  const l = await listing(s.token, { price: 300 });
  assert.equal((await post(`/listings/${l.id}/wishlist`, b.token)).wish, true);
  assert.ok((await ok('/listings?wish=1', { token: b.token })).some((x) => x.id === l.id));
  await ok(`/listings/${l.id}`, { method: 'PATCH', token: s.token, body: { price: 250 } });
  assert.ok((await ok('/notifications', { token: b.token })).some((n) => n.type === 'wishlist'));
  assert.equal((await post(`/listings/${l.id}/wishlist`, b.token)).wish, false);
});

test('make an offer: bounded counter-offers, one open offer per buyer', async () => {
  const [s, b] = [P[3], P[4]];
  const l = await listing(s.token, { price: 400 });
  assert.equal((await call(`/listings/${l.id}/offer`, { method: 'POST', token: b.token, body: { amount: 150 } })).status, 400);
  const d = await post(`/listings/${l.id}/offer`, b.token, { amount: 300, note: 'Can you do 300?' });
  assert.equal(d.amount, 300);
  assert.equal((await call(`/listings/${l.id}/offer`, { method: 'POST', token: b.token, body: { amount: 320 } })).status, 409);
});

test('urgent tasks: rule-based daily cap and earliest-deadline-first strip', async () => {
  const u = P[5];
  const tk = await post('/tasks', u.token, { kind: 'task', title: 'Urgent: submit form', reward: 20, deadline: inHours(), urgent: true });
  assert.ok(tk.urgent);
  assert.equal((await call('/tasks', { method: 'POST', token: u.token, body: { kind: 'task', title: 'Another urgent', reward: 20, deadline: inHours(), urgent: true } })).status, 400);
  const urgent = (await ok('/feed', { token: T.buyer })).urgent;
  assert.ok(urgent.some((x) => x.id === tk.id));
  assert.deepEqual(urgent.map((x) => x.deadline), [...urgent.map((x) => x.deadline)].sort((a, b) => a - b));
});

test('group orders: runner posts, members join with item cost, capacity enforced', async () => {
  const [r, a, b, c] = [P[6], P[0], P[1], P[3]];
  const run = await post('/tasks', r.token, { kind: 'group', title: 'Canteen run 1pm', reward: 10, capacity: 2, location: 'canteen', drop: 'hosgate', deadline: inHours() });
  const j = await post(`/tasks/${run.id}/join`, a.token, { item: 'Veg puff', itemCost: 25 });
  assert.equal(j.amount, 35);
  await post(`/tasks/${run.id}/join`, b.token, { item: 'Tea', itemCost: 15 });
  assert.equal((await call(`/tasks/${run.id}/join`, { method: 'POST', token: c.token, body: { item: 'Coffee', itemCost: 20 } })).status, 400, 'run full');
  await post(`/deals/${j.id}/accept`, r.token);
  assert.equal((await post(`/deals/${j.id}/confirm`, a.token)).status, 'paid');
});

test('badges and leaderboard: earned from completed deals', async () => {
  const [s, b] = [P[9], P[7]];
  await buyFlow(b, s, await listing(s.token));
  const c = await ok('/community', { token: s.token });
  assert.ok(c.myBadges.some((x) => x.id === 'first'));
  assert.ok(c.leaderboard.some((x) => x.user.id === s.id));
  await ok('/me', { method: 'PATCH', token: s.token, body: { privacy: { leaderboard: false } } });
  assert.ok(!(await ok('/community', { token: s.token })).leaderboard.some((x) => x.user.id === s.id), 'opt-out respected');
});

test('lost and found via the admin desk: hand in → admin posts → verified claim → collected', async () => {
  const [finder, owner, faker] = [P[4], P[3], P[2]];
  const lost = await call('/lostfound', { method: 'POST', token: owner.token, body: { kind: 'lost', title: 'Blue water bottle', location: 'library' } });
  assert.equal(lost.status, 400, 'lost items cannot be posted'); assert.equal(lost.data.rule, 'no_lost_posts');
  const x = await post('/lostfound', finder.token, { title: 'Grey hoodie (size M)', desc: 'Found on a bench', secret: 'Name tag “AR” inside the hood', location: 'canteen', photo: PNG });
  assert.equal(x.status, 'pending');
  assert.ok(!(await ok('/lostfound', { token: owner.token })).items.some((y) => y.id === x.id), 'not public until the desk receives it');
  assert.ok((await ok('/lostfound', { token: finder.token })).mine.some((y) => y.id === x.id && y.status === 'pending'));
  assert.equal((await call('/admin/lostfound', { token: finder.token })).status, 403, 'members cannot open the desk');
  assert.equal((await call(`/admin/lostfound/${x.id}/receive`, { method: 'POST', token: finder.token, body: {} })).status, 403, 'members cannot publish');
  const adm = (await ok('/admin/lostfound', { token: T.admin })).items.find((y) => y.id === x.id);
  assert.equal(adm.secret, 'Name tag “AR” inside the hood'); assert.equal(adm.finder.id, finder.id);
  assert.equal((await call(`/lostfound/${x.id}/claim`, { method: 'POST', token: owner.token, body: { proof: 'It is my grey hoodie' } })).status, 404, 'cannot claim before it is posted');
  await post(`/admin/lostfound/${x.id}/receive`, T.admin, { title: 'Grey hoodie', desc: 'Found near the canteen', showPhoto: false });
  const pub = (await ok('/lostfound', { token: owner.token })).items.find((y) => y.id === x.id);
  assert.ok(pub && pub.status === 'held' && pub.pickup === 'admin');
  assert.ok(!('secret' in pub) && !('userId' in pub) && !('claims' in pub) && pub.photo === null, 'finder, secret, claims and hidden photo stay private');
  assert.ok((await ok('/notifications', { token: finder.token })).some((n) => /item received/i.test(n.title)));
  assert.equal((await call(`/lostfound/${x.id}/claim`, { method: 'POST', token: finder.token, body: { proof: 'Trying to claim what I handed in' } })).status, 400);
  assert.equal((await call(`/lostfound/${x.id}/claim`, { method: 'POST', token: owner.token, body: { proof: 'mine' } })).status, 400, 'proof required');
  await post(`/lostfound/${x.id}/claim`, owner.token, { proof: 'Grey hoodie, my name tag AR is sewn inside the hood. Lost it at lunch.' });
  assert.equal((await call(`/lostfound/${x.id}/claim`, { method: 'POST', token: owner.token, body: { proof: 'Claiming the same thing twice' } })).status, 409);
  await post(`/lostfound/${x.id}/claim`, faker.token, { proof: 'That grey hoodie is mine, I lost it somewhere.' });
  const claims = (await ok('/admin/lostfound', { token: T.admin })).items.find((y) => y.id === x.id).claims;
  const real = claims.find((c) => c.userId === owner.id), fake = claims.find((c) => c.userId === faker.id);
  assert.equal(await call(`/admin/lostfound/${x.id}/returned`, { method: 'POST', token: T.admin }).then((r) => r.status), 400, 'cannot hand over before a claim is approved');
  await post(`/admin/lostfound/${x.id}/claims/${real.id}`, T.admin, { decision: 'approve', reason: 'Described the AR name tag' });
  const after = await ok('/lostfound', { token: faker.token });
  assert.equal(after.claims.find((y) => y.id === x.id).myClaim.status, 'rejected', 'other claims closed automatically');
  assert.equal((await ok('/lostfound', { token: owner.token })).claims.find((y) => y.id === x.id).myClaim.status, 'approved');
  assert.ok((await ok('/notifications', { token: owner.token })).some((n) => /collect your item/i.test(n.title)));
  await post(`/admin/lostfound/${x.id}/returned`, T.admin);
  assert.ok(!(await ok('/lostfound', { token: owner.token })).items.some((y) => y.id === x.id), 'off the desk once collected');
  assert.ok((await ok('/notifications', { token: finder.token })).some((n) => /reached its owner/i.test(n.title)));
  assert.ok(fake);
});

test('campus announcements: admin publishes, everyone notified, shown in feed', async () => {
  const a = await post('/admin/announcements', T.admin, { title: 'Library closed Sunday', body: 'Maintenance work', pinned: true });
  assert.ok((await ok('/feed', { token: T.buyer })).announcements.some((x) => x.id === a.id));
  assert.ok((await ok('/notifications', { token: T.buyer })).some((n) => n.type === 'announcement'));
  await ok(`/admin/announcements/${a.id}`, { method: 'DELETE', token: T.admin });
  assert.equal((await call('/admin/announcements', { method: 'POST', token: T.buyer, body: { title: 'x' } })).status, 403);
});

test('donate / free section: free listing, free filter, no escrow, Giver badge', async () => {
  const [s, b] = [P[5], P[0]];
  const l = await listing(s.token, { free: true, price: 0, title: 'Old drawing board free' });
  assert.ok(l.free);
  assert.ok((await ok('/feed?filter=free', { token: b.token })).items.every((i) => i.free));
  const d = await post(`/listings/${l.id}/offer`, b.token, {});
  assert.equal(d.total, 0);
  await post(`/deals/${d.id}/accept`, s.token);
  await post(`/deals/${d.id}/confirm`, b.token);
  assert.ok((await me(s.token)).badges.some((x) => x.id === 'giver'));
});

test('books are free-only: second-hand books cannot be sold, only given away', async () => {
  const [s, b] = [P[5], P[0]];
  assert.equal(cfg.categories.find((c) => c.id === 'books').freeOnly, true);
  const sale = await call('/listings', { method: 'POST', token: s.token, body: { title: 'Thermodynamics textbook', category: 'books', condition: 'good', price: 150, photos: [PNG] } });
  assert.equal(sale.status, 400); assert.equal(sale.data.rule, 'free_only');
  const l = await listing(s.token, { category: 'books', free: true, price: 0, title: 'Thermodynamics textbook free' });
  assert.ok(l.free);
  assert.equal((await call(`/listings/${l.id}`, { method: 'PATCH', token: s.token, body: { price: 50 } })).status, 400, 'cannot put a price on a book later');
  assert.ok((await ok('/listings?cat=books', { token: b.token })).every((x) => x.price === 0), 'every book on the market is free');
  const d = await post(`/listings/${l.id}/offer`, b.token, { amount: 100 });
  assert.equal(d.total, 0, 'requests for a book never move money');
  await post(`/deals/${d.id}/accept`, s.token);
  const p = await call(`/deals/${d.id}/propose`, { method: 'POST', token: s.token, body: { amount: 60, reason: 'want some money' } });
  assert.equal(p.status, 400, 'a free book deal cannot be renegotiated into a sale');
});

test('AI price suggestion: condition-aware range', async () => {
  const good = await ok('/price-suggest?title=scientific%20calculator&category=calculators&condition=good', { token: T.buyer });
  const worn = await ok('/price-suggest?title=scientific%20calculator&category=calculators&condition=worn', { token: T.buyer });
  assert.ok(good.low <= good.suggested && good.suggested <= good.high && good.basis);
  assert.ok(worn.suggested < good.suggested);
});

test('SOS button: alert reaches admins, security responds', async () => {
  const u = P[1];
  await ok('/me', { method: 'PATCH', token: u.token, body: { emergency: '9888877777' } });
  const r = await post('/sos', u.token, { location: 'park', note: 'Being followed' });
  assert.equal(r.emergencyContact, '9888877777');
  const s = (await ok('/admin/sos', { token: T.admin })).find((x) => x.userId === u.id);
  assert.equal(s.status, 'open');
  await post(`/admin/sos/${s.id}`, T.admin, { note: 'Guard reached the cycle stand' });
  assert.ok((await ok('/notifications', { token: u.token })).some((n) => n.type === 'sos'));
});

test('language and dark mode: preferences saved on the account', async () => {
  const u = P[2];
  const m = await ok('/me', { method: 'PATCH', token: u.token, body: { lang: 'ta', theme: 'dark', dataSaver: true } });
  assert.deepEqual([m.lang, m.theme, m.dataSaver], ['ta', 'dark', true]);
  assert.equal((await ok('/me', { method: 'PATCH', token: u.token, body: { theme: 'neon' } })).theme, 'dark', 'invalid theme ignored');
});

test('referrals: code at signup, both rewarded with a fee-free deal after first completion', async () => {
  const ref = P[8];
  const nu = await signup('Referred', { referral: ref.me.referralCode });
  assert.ok((await ok('/notifications', { token: ref.token })).some((n) => n.type === 'referral'));
  const s = P[3];
  await buyFlow(nu, s, await listing(s.token));
  assert.equal((await me(ref.token)).feeWaivers, 1);
  assert.equal((await me(nu.token)).feeWaivers, 1);
  const d = await post(`/listings/${(await listing(s.token)).id}/offer`, nu.token, {});
  assert.equal(d.fee, 0, 'fee waived');
});

test('admin analytics: KPIs, weekly trend, categories, impact', async () => {
  const o = await ok('/admin/overview', { token: T.admin });
  for (const k of ['completed', 'gmv', 'revenue', 'disputeRate', 'fraudRate', 'avgRating', 'slaMet', 'escrowHeld']) assert.equal(typeof o.kpis[k], 'number', k);
  assert.equal(o.weeks.length, 8);
  assert.ok(o.cats.length > 0);
  assert.ok(o.impact.itemsReused > 0);
});

// ------------------------------------------------------------------ dispute outcomes free up the listing / task
test('dispute split closes the listing; task dispute refund closes the task', async () => {
  const [s, b] = [P[4], P[0]];
  const l = await listing(s.token, { price: 200 });
  const d = await post(`/listings/${l.id}/offer`, b.token, { amount: 200 });
  await post(`/deals/${d.id}/accept`, s.token);
  await post(`/deals/${d.id}/dispute`, b.token, { reason: 'Item damaged' });
  let rep = (await ok('/admin/reports', { token: T.admin })).find((x) => x.dealId === d.id);
  await post(`/admin/reports/${rep.id}/resolve`, T.admin, { action: 'split', reason: 'Both partly at fault' });
  assert.equal((await ok(`/listings/${l.id}`, { token: s.token })).status, 'sold');
  const bw = (await me(b.token)).wallet;
  assert.ok(bw.escrow >= 0);

  const [p, h] = [P[2], P[5]];
  const td = await taskDeal(p, h);
  await post(`/deals/${td.id}/dispute`, p.token, { reason: 'Helper no-show' });
  rep = (await ok('/admin/reports', { token: T.admin })).find((x) => x.dealId === td.id);
  await post(`/admin/reports/${rep.id}/resolve`, T.admin, { action: 'refund', reason: 'Helper did not turn up' });
  assert.equal((await ok(`/tasks/${td.refId}`, { token: p.token })).status, 'cancelled');
});
