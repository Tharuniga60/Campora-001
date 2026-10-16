// Campus impact numbers (reuse, waste avoided, earnings).
import { CATEGORIES } from '../config/rules.js';
import { db, find } from '../core/db.js';

// ---------- community: leaderboard, impact, announcements
export function impact() {
  const paid = db.deals.filter((d) => d.status === 'paid');
  const reused = paid.filter((d) => d.type === 'buy');
  let kg = 0;
  for (const d of reused) { const l = find('listings', d.refId); kg += CATEGORIES.find((c) => c.id === l?.category)?.kgSaved || 0.5; }
  return {
    itemsReused: reused.length, kgSaved: Math.round(kg), donations: reused.filter((d) => d.amount === 0).length,
    tasksDone: paid.filter((d) => d.type !== 'buy').length, keptOnCampus: paid.reduce((a, d) => a + d.amount, 0),
    helpersEarning: new Set(paid.filter((d) => d.type !== 'buy').map((d) => d.payeeId)).size,
  };
}

// Lost & found moved to an admin-held desk: older self-posted "lost" items are closed, and older "found" posts
// wait for the desk to receive the item before anyone can claim it. Runs at boot; idempotent.
export function migrateLostFound() {
  for (const x of db.lostfound) {
    x.claims ||= [];
    if (x.status === 'open') x.status = x.kind === 'lost' ? 'withdrawn' : 'pending';
    if (x.status === 'resolved') x.status = x.kind === 'lost' ? 'withdrawn' : 'returned';
    if (x.kind === 'lost' && x.status !== 'withdrawn') x.status = 'withdrawn';
  }
}
