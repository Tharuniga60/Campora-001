// API routes — Marketplace: listings, price suggestions, wishlist and buy offers.
import { CATEGORIES, CONDITIONS, FREE_ONLY_MSG, isFreeOnly, locById, prohibitedCheck, similarity, suggestPrice } from '../config/rules.js';
import { db, find, uid } from '../core/db.js';
import { DEL, GET, PATCH, POST, rateLimit } from '../core/http.js';
import { push, pushAll } from '../core/realtime.js';
import { DAY, H, S, clampStr, fail, int, now } from '../core/util.js';
import { validPhotos } from '../core/validate.js';
import { blockedBetween, fairRank, listingView } from '../services/catalog.js';
import { ACTIVE, cancelDeal, createDeal, dealUpdate, dealView } from '../services/deals.js';
import { requireCanSell, sellerVisible } from '../services/moderation.js';
import { flag, notify } from '../services/notifications.js';
import { checkDaily, requireActive } from '../services/users.js';

GET('/api/listings', ({ user, query }) => {
  let l = db.listings.filter((x) => x.status === 'active' && !blockedBetween(user, x.sellerId) && sellerVisible(x.sellerId));
  if (query.cat) l = l.filter((x) => x.category === query.cat);
  if (query.free === '1') l = l.filter((x) => x.price === 0);
  if (query.mine === '1') l = db.listings.filter((x) => x.sellerId === user.id && x.status !== 'removed');
  if (query.wish === '1') l = db.listings.filter((x) => user.wishlist.includes(x.id));
  const sort = query.sort || 'fair';
  const views = l.map((x) => listingView(x, user));
  if (sort === 'price') return views.sort((a, b) => a.price - b.price);
  if (sort === 'new') return views.sort((a, b) => b.createdAt - a.createdAt);
  return query.mine === '1' || query.wish === '1' ? views.sort((a, b) => b.createdAt - a.createdAt) : fairRank(views, user);
});
GET('/api/price-suggest', ({ query }) => suggestPrice({ title: query.title || '', category: query.category, condition: query.condition }, db.listings));
POST('/api/listings', ({ user, body }) => {
  requireCanSell(user);
  rateLimit('post:' + user.id, 10, H);
  const s = S();
  const title = clampStr(body.title, 70), desc = clampStr(body.desc, 600);
  if (title.length < 4) fail(400, 'Give your item a clear title (at least 4 characters).');
  if (!CATEGORIES.some((c) => c.id === body.category)) fail(400, 'Choose a category.');
  if (!CONDITIONS.some((c) => c.id === body.condition)) fail(400, 'Choose the item condition.');
  const price = body.free ? 0 : int(body.price);
  if (price < 0) fail(400, 'Price cannot be negative.');
  if (price > 0 && isFreeOnly(body.category)) fail(400, FREE_ONLY_MSG, { rule: 'free_only' });
  if (price > s.maxItemPrice) fail(400, `Only small-value deals are allowed — the maximum per item is ₹${s.maxItemPrice}.`);
  if (!body.free && price < 1) fail(400, 'Enter a price, or mark the item as free to donate it.');
  const bad = prohibitedCheck(title, desc);
  if (bad) { flag(user.id, 'prohibited', `Tried to list: “${title}” — ${bad}`); fail(422, `This item can't be listed. ${bad}`, { rule: 'prohibited' }); }
  const dup = db.listings.find((l) => l.sellerId === user.id && ['active', 'reserved'].includes(l.status) && similarity(l.title, title) >= 0.75);
  if (dup) { flag(user.id, 'duplicate', `Duplicate of “${dup.title}”`, { refId: dup.id }); fail(409, `Looks like a duplicate of your listing “${dup.title}”. Edit that one instead.`, { rule: 'duplicate', id: dup.id }); }
  const photos = validPhotos(body.photos, { required: true });
  const meet = locById(body.meetPoint)?.safe ? body.meetPoint : 'library';
  const l = { id: uid('l'), sellerId: user.id, title, desc, category: body.category, condition: body.condition, price, photos, meetPoint: meet, status: 'active', createdAt: now(), views: 0, priceHistory: [{ price, at: now() }] };
  if (price > 0) {
    const sug = suggestPrice(l, db.listings);
    if (sug.samples >= 2 && price > sug.high * 2.5) { l.priceReview = true; flag(user.id, 'price', `“${title}” at ₹${price} vs fair ~₹${sug.suggested}`, { refId: l.id }); }
  }
  db.listings.push(l);
  pushAll('feed', { kind: 'listing' });
  return listingView(l, user, { detail: true });
});
GET('/api/listings/:id', ({ user, params }) => {
  const l = find('listings', params.id);
  if (!l || (l.status === 'removed' && l.sellerId !== user.id && !user.isAdmin)) fail(404, 'This listing is no longer available.');
  if (l.sellerId !== user.id) l.views = (l.views || 0) + 1;
  return listingView(l, user, { detail: true });
});
PATCH('/api/listings/:id', ({ user, params, body }) => {
  requireCanSell(user);
  const l = find('listings', params.id);
  if (!l || l.sellerId !== user.id) fail(404, 'Not found');
  if (l.status !== 'active') fail(400, 'Only active listings can be edited.');
  if (body.title || body.desc) {
    const title = clampStr(body.title ?? l.title, 70), desc = clampStr(body.desc ?? l.desc, 600);
    const bad = prohibitedCheck(title, desc); if (bad) fail(422, bad);
    l.title = title; l.desc = desc;
  }
  if (body.photos) l.photos = validPhotos(body.photos, { required: true });
  if ('price' in body && int(body.price) !== l.price) {
    const price = int(body.price);
    if (price < 0 || price > S().maxItemPrice) fail(400, `Price must be between ₹0 and ₹${S().maxItemPrice}.`);
    if (price > 0 && isFreeOnly(l.category)) fail(400, FREE_ONLY_MSG, { rule: 'free_only' });
    l.price = price; l.priceHistory.push({ price, at: now() });
    const changes = l.priceHistory.filter((p) => now() - p.at < DAY).length;
    if (changes > 3) flag(user.id, 'price', `Price of “${l.title}” changed ${changes} times in 24h`, { refId: l.id });
    for (const uId of db.users.filter((u) => u.wishlist.includes(l.id)).map((u) => u.id)) notify(uId, 'wishlist', 'Price update on your wishlist', `“${l.title}” is now ₹${price}.`, `#/listing/${l.id}`);
  }
  if (body.meetPoint && locById(body.meetPoint)?.safe) l.meetPoint = body.meetPoint;
  return listingView(l, user, { detail: true });
});
DEL('/api/listings/:id', ({ user, params }) => {
  const l = find('listings', params.id);
  if (!l || l.sellerId !== user.id) fail(404, 'Not found');
  if (l.status === 'reserved') fail(400, 'This item is reserved in an active deal. Cancel the deal first.');
  l.status = 'removed'; l.removedReason = 'Removed by you';
  for (const d of db.deals.filter((d) => d.refId === l.id && d.status === 'offered')) { cancelDeal(d, null, 'Listing removed by seller'); dealUpdate(d, user.id, 'Offer closed', `“${l.title}” was removed by the seller. Your money is refunded.`); }
  return { ok: true };
});
POST('/api/listings/:id/wishlist', ({ user, params }) => {
  const i = user.wishlist.indexOf(params.id);
  if (i >= 0) user.wishlist.splice(i, 1); else user.wishlist.push(params.id);
  return { wish: i < 0 };
});
// buy offer (make an offer / buy now / request a free item)
POST('/api/listings/:id/offer', ({ user, params, body }) => {
  requireActive(user);
  const l = find('listings', params.id);
  if (!l || l.status !== 'active') fail(400, 'This item is no longer available.');
  if (l.sellerId === user.id) fail(400, 'You cannot buy your own item.');
  if (blockedBetween(user, l.sellerId)) fail(403, 'You cannot deal with this user.');
  if (!sellerVisible(l.sellerId)) fail(400, 'This seller is not accepting offers right now.');
  if (db.deals.some((d) => d.refId === l.id && d.payerId === user.id && ['offered', ...ACTIVE].includes(d.status))) fail(409, 'You already have an open offer on this item.');
  const amount = l.price === 0 ? 0 : int(body.amount ?? l.price);
  if (l.price > 0 && (amount < Math.ceil(l.price * 0.5) || amount > l.price)) fail(400, `Offers must be between ₹${Math.ceil(l.price * 0.5)} and ₹${l.price}.`);
  checkDaily(user, amount);
  const d = createDeal({ type: 'buy', refId: l.id, title: l.title, payer: user, payee: find('users', l.sellerId), amount, offeredBy: user.id, note: body.note, meetPoint: l.meetPoint, when: body.when ? new Date(body.when).getTime() : null });
  notify(l.sellerId, 'offer', amount === l.price ? (amount ? 'Someone wants to buy' : 'Request for your free item') : 'New offer received', `${user.name} ${amount ? `offered ₹${amount}` : 'requested'} for “${l.title}”. Accept to confirm the deal.`, `#/deal/${d.id}`);
  push(l.sellerId, 'deal', { id: d.id });
  return dealView(d, user);
});
