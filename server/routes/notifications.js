// API routes — Notifications list and mark-as-read.
import { db } from '../core/db.js';
import { GET, POST } from '../core/http.js';

GET('/api/notifications', ({ user }) => db.notifications.filter((n) => n.userId === user.id).sort((a, b) => b.at - a.at).slice(0, 80));
POST('/api/notifications/read', ({ user }) => { for (const n of db.notifications) if (n.userId === user.id) n.read = true; return { ok: true }; });
