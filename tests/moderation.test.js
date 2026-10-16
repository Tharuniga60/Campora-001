// Customer reporting & admin moderation: report validation, duplicates, credibility, review threshold,
// admin-only access, review workflow, restrictions enforced on the server, appeals and the audit trail.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, PNG } from './helpers/server.js';

let srv, call, ok, post;
const T = {};
let V1, V2, N, L1, L2;
const status = async (p, token, body, method = 'POST') => (await call(p, { method, token, body })).status;
const me = (token) => ok('/me', { token });
const report = (token, body) => call('/reports', { method: 'POST', token, body });
const listing = (token, body = {}) => post('/listings', token, { title: `Item ${Math.random().toString(36).slice(2, 8)}`, desc: 'Test item', category: 'gadgets', condition: 'good', price: 100, photos: [PNG], ...body });
const adminReports = (qs = '') => ok(`/admin/reports?page=1&${qs}`, { token: T.admin });

let seq = 0;
async function signup(name) {
  const n = ++seq, phone = `91100${String(n).padStart(5, '0')}`;
  const otp = await post('/auth/otp', null, { phone, purpose: 'signup' });
  const r = await post('/auth/signup', null, { name, email: `m${n}@dec.edu.in`, collegeId: `MD${10000 + n}`, dept: 'CSE', year: 2, residence: 'day', phone, otp: otp.demoOtp, consent: { terms: true, privacy: true } });
  await post('/wallet/topup', r.token, { amount: 2000 });
  return { token: r.token, id: r.me.id, name };
}
async function login(phone) {
  const otp = await post('/auth/otp', null, { phone, purpose: 'login' });
  return (await post('/auth/login', null, { phone, otp: otp.demoOtp })).token;
}

before(async () => {
  srv = await startServer();
  ({ call, ok, post } = srv);
  Object.assign(T, srv.tokens);
  T.sneha = await login('9876500006'); T.divya = await login('9876500010');
  await ok('/admin/settings', { method: 'PATCH', token: T.admin, body: { enforceHours: false } });
  V1 = await signup('Vendor One'); V2 = await signup('Vendor Two'); N = await signup('Brand New');
  L1 = await listing(V1.token, { title: 'Gaming headset pro max', price: 4900 }); // expensive on purpose
  L2 = await listing(V2.token, { title: 'Steel tiffin box', price: 120 });
});
after(() => srv.stop());

test('report vendor: validation, ownership, duplicates and the reporter’s status view', async () => {
  assert.equal(await status('/reports', null, { targetType: 'listing', targetId: L1.id, category: 'pricing', details: 'xxxxxxxxxxxx' }), 401);
  assert.equal((await report(T.buyer, { targetType: 'listing', targetId: L1.id, category: 'nonsense', details: 'Price changed after we agreed' })).status, 400);
  assert.equal((await report(T.buyer, { targetType: 'listing', targetId: L1.id, category: 'pricing', details: 'bad' })).status, 400, 'description required');
  assert.equal((await report(V1.token, { targetType: 'listing', targetId: L1.id, category: 'pricing', details: 'Reporting my own listing' })).status, 400);
  assert.equal((await report(T.buyer, { targetType: 'listing', targetId: 'l-missing', category: 'pricing', details: 'Does not exist at all' })).status, 404);
  const r = await report(T.buyer, { targetType: 'listing', targetId: L1.id, category: 'pricing', details: 'Seller raised the price after we agreed ₹3000 in chat.', evidence: PNG });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.status, 'open');
  assert.equal(r.data.category, 'pricing');
  assert.equal(r.data.vendorId, V1.id);
  assert.equal(r.data.productId, L1.id);
  assert.ok(r.data.evidence && r.data.createdAt);
  assert.ok(!('notes' in r.data) && !('signals' in r.data), 'internal fields hidden from the reporter');
  const dup = await report(T.buyer, { targetType: 'listing', targetId: L1.id, category: 'pricing', details: 'Filing the same thing again' });
  assert.equal(dup.status, 409); assert.ok(dup.data.duplicate);
  assert.equal((await report(T.buyer, { targetType: 'user', targetId: V1.id, category: 'pricing', details: 'Same complaint via the profile' })).status, 409, 'same complaint about same vendor within a week');
  const mine = await ok('/reports/mine', { token: T.buyer });
  assert.equal(mine.find((x) => x.id === r.data.id).categoryLabel, 'Suspicious or misleading pricing');
});

test('report threshold flags a vendor for review — never an automatic penalty, even for expensive items', async () => {
  for (const tok of [T.helper, T.seller]) {
    const r = await report(tok, { targetType: 'listing', targetId: L1.id, category: 'pricing', details: 'Price seems far above similar headsets on campus.' });
    assert.equal(r.status, 200, JSON.stringify(r.data));
  }
  const flags = await ok('/admin/flags', { token: T.admin });
  assert.ok(flags.some((f) => f.kind === 'reports_threshold' && f.userId === V1.id && f.status === 'open'));
  assert.equal((await me(V1.token)).status, 'active');
  assert.ok((await ok('/search?q=headset', { token: T.divya })).listings.some((l) => l.id === L1.id), 'still listed');
  const v = (await ok('/admin/vendors?review=1', { token: T.admin })).items.find((x) => x.id === V1.id);
  assert.equal(v.report.independent, 3);
  assert.equal(v.report.needsReview, true);
  assert.equal(v.report.open, 3);
  const rep = await ok('/admin/vendors?reported=1&sort=recent', { token: T.admin });
  assert.ok(rep.items.length && rep.items.every((x) => x.report.total > 0), 'reported filter lists only vendors with customer reports');
  assert.ok(rep.items.every((x, i, a) => !i || a[i - 1].digest.lastAt >= x.digest.lastAt), 'latest report first');
  assert.ok(rep.summary.reported >= 2 && rep.summary.openReports >= 3);
  const d = rep.items.find((x) => x.id === V1.id).digest;
  assert.equal(d.reporters, 3);
  assert.deepEqual(d.top[0], { id: 'pricing', label: 'Suspicious or misleading pricing', n: 3 });
});

test('credibility signals: new accounts are marked unreliable and flagged; past dealings are recognised', async () => {
  const r = await report(N.token, { targetType: 'listing', targetId: L2.id, category: 'fake_details', details: 'Looks like a stock photo of a tiffin box.' });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  const item = (await adminReports('vendor=' + V2.id)).items.find((x) => x.id === r.data.id);
  assert.equal(item.signals.newAccount, true);
  assert.equal(item.signals.credible, false);
  assert.ok((await ok('/admin/flags', { token: T.admin })).some((f) => f.kind === 'report_abuse' && f.userId === N.id));
  await post(`/listings/${L2.id}/offer`, T.sneha, { amount: 120 });
  const r2 = await report(T.sneha, { targetType: 'user', targetId: V2.id, category: 'no_show', details: 'Accepted my offer then never came to the library.' });
  const item2 = (await adminReports('vendor=' + V2.id)).items.find((x) => x.id === r2.data.id);
  assert.equal(item2.signals.interacted, true);
  assert.equal(item2.signals.credible, true);
});

test('only admins can reach moderation APIs or change account status', async () => {
  const rid = (await adminReports()).items[0].id;
  for (const tok of [T.buyer, V1.token]) {
    for (const p of ['/admin/reports?page=1', '/admin/vendors', `/admin/vendors/${V1.id}`, '/admin/appeals']) assert.equal((await call(p, { token: tok })).status, 403, p);
    for (const p of [`/admin/reports/${rid}/review`, `/admin/reports/${rid}/notes`, `/admin/reports/${rid}/resolve`, `/admin/users/${V1.id}`, '/admin/appeals/x'])
      assert.equal(await status(p, tok, { action: 'dismiss', reason: 'trying to clear my reports', text: 'x', decision: 'overturn' }), 403, p);
    assert.equal(await status('/admin/settings', tok, { reportThreshold: 100 }, 'PATCH'), 403);
  }
  assert.equal((await call('/admin/vendors')).status, 401);
  assert.equal(await status('/admin/settings', T.admin, { reportThreshold: 1 }, 'PATCH'), 400, 'threshold must stay ≥ 2');
});

test('admin review: filters, search, pagination, internal notes, under review, dismiss', async () => {
  const page = await adminReports('pageSize=5&status=active');
  assert.ok(page.items.length <= 5 && page.total >= 5 && page.pages >= 2 && page.counts.active === page.total);
  assert.ok(page.items.every((x) => x.category));
  assert.equal(page.items[0].vendorStats?.needsReview, true, 'vendors past the threshold come first');
  const search = await adminReports('q=vendor%20one');
  assert.ok(search.items.length >= 3 && search.items.every((x) => x.targetUser.id === V1.id));
  assert.ok((await adminReports('category=pricing')).items.every((x) => x.category === 'pricing'));
  const all = (await adminReports('vendor=' + V1.id)).items;
  const kavyaR = all.find((x) => x.reporter.name.startsWith('Kavya')), priyaR = all.find((x) => x.reporter.name.startsWith('Priya'));
  const rv = await post(`/admin/reports/${kavyaR.id}/review`, T.admin);
  assert.equal(rv.status, 'under_review');
  assert.equal(await status(`/admin/reports/${kavyaR.id}/review`, T.admin), 400);
  assert.equal((await ok('/reports/mine', { token: T.buyer })).find((x) => x.id === kavyaR.id).status, 'under_review');
  await post(`/admin/reports/${kavyaR.id}/notes`, T.admin, { text: 'Chat confirms the ₹3000 agreement.' });
  assert.equal((await adminReports('vendor=' + V1.id)).items.find((x) => x.id === kavyaR.id).notes[0].text, 'Chat confirms the ₹3000 agreement.');
  assert.ok(!('notes' in (await ok('/reports/mine', { token: T.buyer })).find((x) => x.id === kavyaR.id)), 'notes stay internal');
  assert.equal(await status(`/admin/reports/${priyaR.id}/resolve`, T.admin, { action: 'dismiss', reason: '' }), 400, 'reason required');
  const d = await post(`/admin/reports/${priyaR.id}/resolve`, T.admin, { action: 'dismiss', reason: 'A high price alone is not a violation.' });
  assert.equal(d.status, 'dismissed');
  assert.equal(await status(`/admin/reports/${priyaR.id}/resolve`, T.admin, { action: 'dismiss', reason: 'again please' }), 400);
  assert.ok((await ok('/notifications', { token: T.seller })).some((n) => n.type === 'report' && /No violation/.test(n.body)));
  assert.equal((await ok(`/admin/vendors/${V1.id}`, { token: T.admin })).report.independent, 2, 'dismissed reports stop counting');
});

test('listing restriction is enforced on the server, hides posts, keeps records and can be lifted', async () => {
  const r = (await adminReports('vendor=' + V1.id)).items.find((x) => x.reporter.name.startsWith('Kavya'));
  await post(`/admin/reports/${r.id}/resolve`, T.admin, { action: 'restrict', days: 0, reason: 'Bait pricing confirmed in chat.' });
  const blocked = await call('/listings', { method: 'POST', token: V1.token, body: { title: 'Another headset', desc: 'x', category: 'gadgets', condition: 'good', price: 100, photos: [PNG] } });
  assert.equal(blocked.status, 403); assert.equal(blocked.data.restricted, 'listings'); assert.match(blocked.data.error, /restricted/);
  assert.equal(await status(`/listings/${L1.id}`, V1.token, { price: 10 }, 'PATCH'), 403);
  assert.equal(await status('/tasks', V1.token, { kind: 'task', title: 'Print my notes', reward: 20, deadline: new Date(Date.now() + 3 * 3600e3).toISOString() }), 403);
  assert.ok(!(await ok('/search?q=headset', { token: T.divya })).listings.some((l) => l.id === L1.id), 'hidden from browsing');
  assert.equal(await status(`/listings/${L1.id}/offer`, T.divya, { amount: 4900 }), 400);
  const priyaListing = (await ok('/listings?mine=1', { token: T.seller })).find((l) => l.status === 'active' && l.price > 0 && l.price <= 1000);
  assert.ok((await post(`/listings/${priyaListing.id}/offer`, V1.token, { amount: priyaListing.price })).id, 'restricted vendors can still buy');
  assert.ok((await me(V1.token)).restrictions.listings);
  const v = await ok(`/admin/vendors/${V1.id}`, { token: T.admin });
  assert.ok(v.listings.some((l) => l.id === L1.id) && v.history.some((h) => h.action === 'restrict' && h.reason && h.byName));
  await post(`/admin/users/${V1.id}`, T.admin, { action: 'lift_restriction', reason: 'Seller corrected the price.' });
  assert.ok((await listing(V1.token, { title: 'Wired mouse' })).id);
});

test('suspension, appeals and overturning; strikes can be appealed and upheld; audit trail', async () => {
  await post(`/admin/users/${V2.id}`, T.admin, { action: 'suspend', days: 5, reason: 'Repeated no-shows confirmed by chat records.' });
  const res = await call('/listings', { method: 'POST', token: V2.token, body: { title: 'Lamp', desc: 'x', category: 'hostel', condition: 'good', price: 100, photos: [PNG] } });
  assert.equal(res.status, 403); assert.match(res.data.error, /suspended/);
  await ok('/me', { method: 'PATCH', token: V2.token, body: { status: 'active', strikes: [] } });
  assert.equal((await me(V2.token)).status, 'suspended', 'members cannot lift their own suspension');
  assert.equal(await status(`/admin/users/${V2.id}`, T.admin, { action: 'suspend', reason: 'x' }), 400, 'reason required');
  const mod = await ok('/moderation/mine', { token: V2.token });
  const act = mod.actions.find((a) => a.action === 'suspend');
  assert.ok(act.canAppeal);
  assert.equal(await status('/appeals', V2.token, { actionId: act.id, text: 'too short' }), 400);
  const v1Action = (await ok('/moderation/mine', { token: V1.token })).actions[0];
  assert.equal(await status('/appeals', V2.token, { actionId: v1Action.id, text: 'This is not even my action but let me try anyway.' }), 404);
  const ap = await post('/appeals', V2.token, { actionId: act.id, text: 'The buyer cancelled by phone — screenshots attached in support chat.' });
  assert.equal(ap.status, 'pending');
  assert.equal(await status('/appeals', V2.token, { actionId: act.id, text: 'Appealing a second time for the same action.' }), 409);
  assert.ok((await ok('/admin/appeals', { token: T.admin })).some((a) => a.id === ap.id && a.original.action === 'suspend'));
  await post(`/admin/appeals/${ap.id}`, T.admin, { decision: 'overturn', reason: 'Support chat confirms the buyer cancelled.' });
  assert.equal((await me(V2.token)).status, 'active');
  assert.ok((await listing(V2.token, { title: 'Desk fan' })).id, 'can sell again');
  const after = (await ok('/moderation/mine', { token: V2.token })).actions.find((a) => a.id === act.id);
  assert.ok(after.rescinded && after.appeal.status === 'overturned' && !after.canAppeal);
  assert.equal(await status(`/admin/appeals/${ap.id}`, T.admin, { decision: 'uphold', reason: 'changing my mind' }), 400);

  await post(`/admin/users/${V2.id}`, T.admin, { action: 'strike', reason: 'Fake stock photos on a listing.' });
  const sk = (await ok('/moderation/mine', { token: V2.token })).actions.find((a) => a.action === 'strike');
  const ap2 = await post('/appeals', V2.token, { actionId: sk.id, text: 'I took those photos myself in the hostel room.' });
  await post(`/admin/appeals/${ap2.id}`, T.admin, { decision: 'uphold', reason: 'Reverse image search matches a shop catalogue.' });
  assert.equal((await me(V2.token)).strikes, 1);

  const log = await ok('/admin/audit', { token: T.admin });
  for (const a of ['mod:suspend', 'appeal', 'appeal:overturned', 'mod:strike', 'appeal:upheld', 'mod:restrict', 'report:note'])
    assert.ok(log.some((x) => x.action === a && x.at), a);
  assert.ok(log.find((x) => x.action === 'mod:suspend').byUser && log.find((x) => x.action === 'mod:suspend').reason);
});

test('corrective action: vendor marks it done and admins are told', async () => {
  await post(`/admin/users/${V1.id}`, T.admin, { action: 'correct', correction: 'Update the headset photos to your own pictures.', days: 3, reason: 'Listing photos appear copied.' });
  const c = (await ok('/moderation/mine', { token: V1.token })).actions.find((a) => a.action === 'correct');
  assert.ok(c.correction.dueAt > Date.now() && !c.correction.doneAt);
  const done = await post(`/moderation/${c.id}/corrected`, V1.token, { note: 'Replaced with real photos.' });
  assert.ok(done.correction.doneAt);
  assert.equal(await status(`/moderation/${c.id}/corrected`, V1.token, {}), 409);
  assert.equal(await status(`/moderation/${c.id}/corrected`, V2.token, {}), 404, 'only the affected member');
  assert.ok((await ok('/notifications', { token: T.admin })).some((n) => n.title === 'Corrective action completed'));
});
