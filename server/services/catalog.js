// Listing and task views plus the fair-rotation feed ranking.
import { distance, isFreeOnly, suggestPrice } from '../config/rules.js';
import { db, find, sha } from '../core/db.js';
import { DAY, H, S, now } from '../core/util.js';
import { cancelDeal } from './deals.js';
import { notify } from './notifications.js';
import { activeHelperJobs, publicUser } from './users.js';

// Books became free-only (government rule on second-hand book sales): turn older priced book listings into free giveaways
// and refund offers made at the old price. Deals already accepted keep their agreed terms. Runs at boot; idempotent.
export function migrateFreeOnly() {
  for (const l of db.listings.filter((x) => x.status === 'active' && x.price > 0 && isFreeOnly(x.category))) {
    l.price = 0; l.priceHistory.push({ price: 0, at: now() });
    for (const d of db.deals.filter((x) => x.refId === l.id && x.status === 'offered')) {
      cancelDeal(d, null, 'Books can only be given away for free now');
      notify(d.payerId, 'deal', 'Offer refunded', `“${l.title}” is now free — second-hand books can’t be sold. Your money is refunded; you can request it for free.`, `#/listing/${l.id}`);
    }
    notify(l.sellerId, 'listing', 'Your book is now a free giveaway', `As per government rules, second-hand books can’t be sold, so “${l.title}” is now listed for free.`, `#/listing/${l.id}`);
  }
}

export function listingView(l, me, { detail = false } = {}) {
  const seller = find('users', l.sellerId);
  const v = {
    id: l.id, kind: 'listing', title: l.title, desc: detail ? l.desc : l.desc.slice(0, 120), category: l.category, condition: l.condition,
    price: l.price, free: l.price === 0, photos: detail ? l.photos : l.photos.slice(0, 1), meetPoint: l.meetPoint, status: l.status,
    createdAt: l.createdAt, seller: publicUser(seller, me), wish: me?.wishlist.includes(l.id), views: l.views || 0,
    priceReview: !!l.priceReview, mine: me?.id === l.sellerId,
  };
  if (detail) {
    v.priceHistory = l.priceHistory;
    v.fair = l.price > 0 ? suggestPrice(l, db.listings.filter((x) => x.id !== l.id)) : null;
    v.myDeal = me ? db.deals.find((d) => d.refId === l.id && d.payerId === me.id && !['declined', 'cancelled', 'expired'].includes(d.status))?.id : null;
    v.offerCount = db.deals.filter((d) => d.refId === l.id && d.status === 'offered').length;
    if (me?.id === l.sellerId || me?.isAdmin) v.offers = db.deals.filter((d) => d.refId === l.id && d.type === 'buy').sort((a, b) => a.createdAt - b.createdAt).map((d) => ({ id: d.id, status: d.status, amount: d.amount, note: d.note, at: d.createdAt, buyer: publicUser(find('users', d.payerId), me) }));
    v.removedReason = l.removedReason;
  }
  return v;
}
export function taskView(t, me, { detail = false } = {}) {
  const poster = find('users', t.posterId);
  const v = {
    id: t.id, kind: t.kind, title: t.title, desc: detail ? t.desc : t.desc.slice(0, 120), reward: t.reward, fee: t.fee, total: t.total,
    deadline: t.deadline, urgent: t.urgent, location: t.location, pickup: t.pickup, drop: t.drop, size: t.size,
    distance: t.pickup && t.drop ? distance(t.pickup, t.drop) : null, status: t.status, createdAt: t.createdAt,
    poster: publicUser(poster, me), offerCount: t.offers.length, secured: t.escrow > 0 || t.kind === 'group',
    capacity: t.capacity, joined: t.kind === 'group' ? db.deals.filter((d) => d.refId === t.id && !['declined', 'cancelled', 'expired'].includes(d.status)).length : undefined,
    assignMode: t.assignMode, mine: me?.id === t.posterId, photos: t.photos || [],
  };
  if (detail) {
    v.myOffer = me ? t.offers.find((o) => o.helperId === me.id) || null : null;
    v.removedReason = t.removedReason;
    const myDeal = me && db.deals.find((d) => d.refId === t.id && (d.payerId === me.id || d.payeeId === me.id) && !['declined', 'cancelled', 'expired'].includes(d.status));
    v.myDeal = myDeal?.id || null;
    if (me && (me.id === t.posterId || me.isAdmin)) {
      // Equal prioritisation: show every offer in arrival order; suggest the helper with the fewest recent jobs
      const offers = t.offers.map((o, i) => {
        const h = find('users', o.helperId);
        const jobs7 = db.deals.filter((d) => d.payeeId === h.id && d.type !== 'buy' && now() - d.createdAt < 7 * DAY && d.status !== 'cancelled').length;
        return { ...o, order: i + 1, helper: publicUser(h, me), jobs7, active: activeHelperJobs(h.id), atCap: activeHelperJobs(h.id) >= S().helperActiveCap };
      });
      const eligible = offers.filter((o) => !o.atCap && (o.helper.stats.rating ?? 4) >= 3.5);
      if (eligible.length > 1) {
        const pick = [...eligible].sort((a, b) => a.jobs7 - b.jobs7 || a.order - b.order)[0];
        pick.fairPick = true;
      }
      v.offers = offers;
      if (t.kind === 'group') v.joins = db.deals.filter((d) => d.refId === t.id).map((d) => ({ id: d.id, status: d.status, amount: d.amount, note: d.note, user: publicUser(find('users', d.payerId), me) }));
    }
  }
  return v;
}
// Fair feed: interleave fresh/new-user posts with established ones; rotation seed changes hourly per viewer.
export function fairRank(items, me) {
  const seed = Math.floor(now() / H) + (me?.id || '');
  const rnd = (id) => parseInt(sha(id + seed).slice(0, 8), 16) / 0xffffffff;
  const scored = items.map((it) => {
    const owner = it.seller || it.poster;
    const age = (now() - it.createdAt) / H;
    const reasons = [];
    if (owner?.newcomer) reasons.push('new_member');
    if (age < 24) reasons.push('fresh');
    if ((owner?.stats.rating || 0) >= 4.5 && owner.stats.reviews >= 3) reasons.push('well_rated');
    if (!reasons.length) reasons.push('rotation');
    const fresh = owner?.newcomer || age < 24;
    const score = fresh ? Math.exp(-age / 36) * 0.6 + rnd(it.id) * 0.4 : ((owner?.stats.rating || 3.5) / 5) * 0.5 + rnd(it.id) * 0.5;
    return { ...it, why: reasons, _fresh: fresh, _score: score };
  });
  const A = scored.filter((x) => x._fresh).sort((a, b) => b._score - a._score);
  const B = scored.filter((x) => !x._fresh).sort((a, b) => b._score - a._score);
  const out = [];
  while (A.length || B.length) { if (A.length) out.push(A.shift()); if (B.length) out.push(B.shift()); }
  return out.map(({ _fresh, _score, ...x }) => x);
}
export const blockedBetween = (me, otherId) => {
  const o = find('users', otherId);
  return me.blocked.includes(otherId) || (o && o.blocked.includes(me.id));
};
