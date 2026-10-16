// API routes — In-app chat threads and messages (with payment-detail masking).
import { scanMessage } from '../config/rules.js';
import { db, find, uid } from '../core/db.js';
import { GET, POST, rateLimit } from '../core/http.js';
import { push } from '../core/realtime.js';
import { clampStr, fail, now } from '../core/util.js';
import { blockedBetween } from '../services/catalog.js';
import { ensureThread } from '../services/chat.js';
import { ACTIVE } from '../services/deals.js';
import { flag, notify } from '../services/notifications.js';
import { isActive, publicUser, requireActive } from '../services/users.js';

GET('/api/threads', ({ user }) => db.threads.filter((t) => t.members.includes(user.id)).sort((a, b) => b.lastAt - a.lastAt).slice(0, 100).map((t) => {
  const msgs = db.messages.filter((m) => m.threadId === t.id);
  const last = msgs.at(-1);
  const other = find('users', t.members.find((m) => m !== user.id));
  const d = t.refType === 'deal' ? find('deals', t.refId) : null;
  return { id: t.id, title: t.title, refType: t.refType, refId: t.refId, lastAt: t.lastAt, last: last ? { text: last.text, system: last.system, from: last.from } : null, other: publicUser(other, user), unread: msgs.filter((m) => m.from && m.from !== user.id && m.at > (t.reads[user.id] || 0)).length, dealStatus: d?.status };
}));
POST('/api/threads', ({ user, body }) => {
  requireActive(user);
  const other = find('users', body.userId);
  if (!other || other.id === user.id) fail(400, 'Invalid user.');
  if (blockedBetween(user, other.id)) fail(403, 'You cannot message this user.');
  let title = 'Chat';
  if (body.refType === 'listing') title = find('listings', body.refId)?.title || title;
  if (body.refType === 'task') title = find('tasks', body.refId)?.title || title;
  if (body.refType === 'lostfound') title = find('lostfound', body.refId)?.title || title;
  const t = ensureThread([user.id, other.id], body.refType || 'direct', body.refId || '-', title);
  return { id: t.id };
});
GET('/api/threads/:id', ({ user, params }) => {
  const t = find('threads', params.id);
  if (!t || (!t.members.includes(user.id) && !user.isAdmin)) fail(404, 'Chat not found');
  if (t.members.includes(user.id)) t.reads[user.id] = now();
  const other = find('users', t.members.find((m) => m !== user.id));
  return { ...t, key: undefined, other: publicUser(other, user), messages: db.messages.filter((m) => m.threadId === t.id).slice(-200), deal: t.refType === 'deal' ? (({ id, status, total, amount }) => ({ id, status, total, amount }))(find('deals', t.refId)) : null, blocked: blockedBetween(user, other?.id) };
});
POST('/api/threads/:id/messages', ({ user, params, body }) => {
  const t = find('threads', params.id);
  if (!t || !t.members.includes(user.id)) fail(404, 'Chat not found');
  const otherId = t.members.find((m) => m !== user.id);
  if (blockedBetween(user, otherId)) fail(403, 'You cannot message this user.');
  const inDeal = t.refType === 'deal' && ['offered', ...ACTIVE, 'disputed'].includes(find('deals', t.refId)?.status);
  if (!isActive(user) && !inDeal) requireActive(user);
  rateLimit('msg:' + user.id, 40, 60000);
  const raw = clampStr(body.text, 600);
  if (!raw) fail(400, 'Empty message.');
  const scan = scanMessage(raw);
  const m = { id: uid('m'), threadId: t.id, from: user.id, text: scan.text, at: now(), masked: scan.offPlatform };
  db.messages.push(m); t.lastAt = m.at; t.reads[user.id] = now();
  for (const id of t.members) push(id, 'message', { threadId: t.id, message: m });
  const warnings = [];
  if (scan.offPlatform) {
    flag(user.id, 'offplatform', `Shared payment/contact details in chat: “${raw.slice(0, 80)}”`, { refId: t.id });
    warnings.push('Phone numbers and UPI details are hidden. Pay only inside CampusLoop — escrow protects both of you. Off-platform payment requests can be reported.');
  }
  if (scan.roomNumber) warnings.push('For your safety, avoid sharing your exact room number. Meet at an approved public meeting point instead.');
  if (otherId) notify(otherId, 'message', user.name, scan.text.slice(0, 80), `#/chat/${t.id}`);
  return { message: m, warnings };
});
