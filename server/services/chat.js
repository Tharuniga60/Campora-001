// Chat threads and system messages.
import { db, uid } from '../core/db.js';
import { push } from '../core/realtime.js';
import { now } from '../core/util.js';

export function ensureThread(members, refType, refId, title) {
  const key = [...members].sort().join(':') + '|' + refType + '|' + refId;
  let t = db.threads.find((x) => x.key === key);
  if (!t) {
    t = { id: uid('t'), key, members: [...members], refType, refId, title, createdAt: now(), lastAt: now(), reads: {} };
    db.threads.push(t);
  }
  return t;
}
export function sysMsg(t, text) {
  const m = { id: uid('m'), threadId: t.id, from: null, system: true, text, at: now() };
  db.messages.push(m); t.lastAt = m.at;
  for (const id of t.members) push(id, 'message', { threadId: t.id, message: m });
}
export function unreadThreads(userId) {
  return db.threads.filter((t) => t.members.includes(userId) && db.messages.some((m) => m.threadId === t.id && m.from && m.from !== userId && m.at > (t.reads[userId] || 0))).length;
}
