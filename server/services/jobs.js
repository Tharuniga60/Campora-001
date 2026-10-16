// Background jobs: expiries, auto-release, suspension and restriction end.
import { db, find, save } from '../core/db.js';
import { DAY, H, S, now } from '../core/util.js';
import { cancelDeal } from './deals.js';
import { notify } from './notifications.js';
import { refundHold, releaseDeal } from './wallet.js';

export function runJobs() {
  const s = S(), t0 = now();
  let changed = false;
  for (const t of db.tasks) {
    if (t.status === 'open' && t.deadline < t0) {
      t.status = 'expired'; changed = true;
      if (t.escrow) { refundHold(find('users', t.posterId), t.escrow, `Refund: task “${t.title}” expired unaccepted`, t.id); t.escrow = 0; }
      notify(t.posterId, 'task', 'Task expired', `No one accepted “${t.title}” before the deadline. Your money was refunded.`, `#/task/${t.id}`);
      if (t.kind === 'group') for (const d of db.deals.filter((d) => d.refId === t.id && d.status === 'offered')) cancelDeal(d, null, 'Group run expired', { toTask: false });
    }
  }
  for (const d of db.deals) {
    if (d.status === 'offered' && t0 - d.createdAt > s.offerExpiryHours * H) {
      cancelDeal(d, null, `Offer expired after ${s.offerExpiryHours}h without response`, { toTask: false });
      d.status = 'expired'; d.timeline.at(-1).s = 'expired'; changed = true;
      notify(d.payerId, 'deal', 'Offer expired', `No response on “${d.title}”. ₹${d.total} refunded.`, `#/deal/${d.id}`);
    }
    if (d.status === 'delivered' && !d.pending && t0 - d.deliveredAt > s.autoReleaseHours * H) {
      d.confirmedAt = t0; d.confirmedHow = 'auto'; releaseDeal(d, `Auto-released ${s.autoReleaseHours}h after delivery — no dispute was raised`); changed = true;
    }
  }
  for (const u of db.users) if (u.status === 'suspended' && u.suspendedUntil && u.suspendedUntil < t0) { u.status = 'active'; u.statusReason = null; notify(u.id, 'moderation', 'Suspension ended', 'Welcome back. Please follow the community rules.'); changed = true; }
  for (const u of db.users) {
    const r = u.restrictions?.listings;
    if (r?.until && r.until < t0) { delete u.restrictions.listings; notify(u.id, 'moderation', 'Listing restriction ended', 'You can post listings and tasks again.', '#/settings/moderation'); changed = true; }
  }
  db.sessions = db.sessions.filter((x) => t0 - x.lastSeen < 30 * DAY);
  if (changed) save();
}
