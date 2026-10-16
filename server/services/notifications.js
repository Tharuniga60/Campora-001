// Notifications, audit log entries and automatic fraud flags.
import { db, uid } from '../core/db.js';
import { push } from '../core/realtime.js';
import { DAY, now } from '../core/util.js';

export function notify(userId, type, title, body, link = '') {
  const n = { id: uid('n'), userId, type, title, body, link, at: now(), read: false };
  db.notifications.push(n);
  if (db.notifications.length > 5000) db.notifications.splice(0, 1000);
  push(userId, 'notification', n);
  return n;
}
export function audit(by, action, target, reason = '', extra = {}) {
  db.audit.push({ id: uid('a'), by, action, target, reason, at: now(), ...extra });
}
export function flag(userId, kind, detail, ref = {}) {
  const recent = db.flags.find((f) => f.userId === userId && f.kind === kind && f.status === 'open' && now() - f.at < DAY);
  if (recent) { recent.count = (recent.count || 1) + 1; recent.detail = detail; return recent; }
  const f = { id: uid('f'), userId, kind, detail, at: now(), status: 'open', count: 1, ...ref };
  db.flags.push(f);
  for (const a of db.users.filter((u) => u.isAdmin)) push(a.id, 'admin', { kind: 'flag' });
  return f;
}
