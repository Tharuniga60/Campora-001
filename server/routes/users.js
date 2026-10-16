// API routes — My profile, data export, account deletion, public profiles and blocking.
import { locById } from '../config/rules.js';
import { db, encrypt, find } from '../core/db.js';
import { DEL, GET, PATCH, POST } from '../core/http.js';
import { clampStr, fail } from '../core/util.js';
import { listingView } from '../services/catalog.js';
import { ACTIVE } from '../services/deals.js';
import { reportView, sellerVisible } from '../services/moderation.js';
import { audit } from '../services/notifications.js';
import { meView, publicUser } from '../services/users.js';

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
  reports: db.reports.filter((r) => r.reporterId === user.id).map((r) => reportView(r)),
  moderation: db.modlog.filter((m) => m.userId === user.id), appeals: db.appeals.filter((a) => a.userId === user.id),
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
  p.listings = sellerVisible(u.id) || user.isAdmin ? db.listings.filter((l) => l.sellerId === u.id && l.status === 'active').map((l) => listingView(l, user)) : [];
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
