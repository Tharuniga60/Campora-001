// API routes — Home feed (fair rotation, urgent strip, announcements) and search.
import { istDayKey } from '../config/rules.js';
import { db } from '../core/db.js';
import { GET } from '../core/http.js';
import { clampStr, now } from '../core/util.js';
import { blockedBetween, fairRank, listingView, taskView } from '../services/catalog.js';
import { impact } from '../services/community.js';
import { sellerVisible } from '../services/moderation.js';

GET('/api/feed', ({ user, query }) => {
  const filter = query.filter || 'all';
  let items = [];
  if (filter === 'all' || filter === 'market' || filter === 'free')
    items.push(...db.listings.filter((l) => l.status === 'active' && l.sellerId !== user.id && !blockedBetween(user, l.sellerId) && sellerVisible(l.sellerId) && (filter !== 'free' || l.price === 0)).map((l) => listingView(l, user)));
  if (filter === 'all' || filter === 'tasks')
    items.push(...db.tasks.filter((t) => t.status === 'open' && t.posterId !== user.id && !blockedBetween(user, t.posterId) && sellerVisible(t.posterId) && !t.urgent).map((t) => taskView(t, user)));
  const urgent = db.tasks.filter((t) => t.status === 'open' && t.urgent && t.posterId !== user.id && !blockedBetween(user, t.posterId) && sellerVisible(t.posterId))
    .sort((a, b) => a.deadline - b.deadline).map((t) => taskView(t, user)); // public rule: earliest deadline first
  const ann = db.announcements.filter((a) => !a.expiresAt || a.expiresAt > now()).sort((a, b) => (b.pinned - a.pinned) || b.at - a.at).slice(0, 3);
  const pulse = {
    dealsToday: db.deals.filter((d) => d.status === 'paid' && istDayKey(d.paidAt) === istDayKey()).length,
    openTasks: db.tasks.filter((t) => t.status === 'open').length,
    activeListings: db.listings.filter((l) => l.status === 'active').length,
    kgSaved: impact().kgSaved,
  };
  return { items: fairRank(items, user), urgent, announcements: ann, pulse };
});
GET('/api/search', ({ user, query }) => {
  const q = clampStr(query.q, 60).toLowerCase();
  if (!q) return { listings: [], tasks: [] };
  const m = (s) => s.toLowerCase().includes(q);
  return {
    listings: db.listings.filter((l) => l.status === 'active' && (m(l.title) || m(l.desc)) && !blockedBetween(user, l.sellerId) && sellerVisible(l.sellerId)).slice(0, 30).map((l) => listingView(l, user)),
    tasks: db.tasks.filter((t) => t.status === 'open' && (m(t.title) || m(t.desc)) && !blockedBetween(user, t.posterId) && sellerVisible(t.posterId)).slice(0, 30).map((t) => taskView(t, user)),
  };
});
