// Core: rendering helpers, API client, state, shared UI components. No framework — tiny & fast.
import { t, setLang, getLang } from './i18n.js';
export { t };

// ---------- safe templating
class Raw { constructor(s) { this.s = s; } toString() { return this.s; } }
export const raw = (s) => new Raw(String(s));
export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtv = (v) => (v == null || v === false ? '' : v instanceof Raw ? v.s : Array.isArray(v) ? v.map(fmtv).join('') : esc(v));
export function html(strings, ...vals) { let o = strings[0]; vals.forEach((v, i) => { o += fmtv(v) + strings[i + 1]; }); return new Raw(o); }
export const $ = (sel, el = document) => el.querySelector(sel);
export const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];

// ---------- icons (stroke, 24px)
const P = {
  home: 'M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
  bag: 'M5 8h14l-1 12H6zM9 8V6a3 3 0 0 1 6 0v2',
  tasks: 'M9 6h11M9 12h11M9 18h11M4 6l1 1 2-2M4 12l1 1 2-2M4 18l1 1 2-2',
  activity: 'M3 12h4l3-8 4 16 3-8h4',
  plus: 'M12 5v14M5 12h14',
  chat: 'M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z',
  bell: 'M6 8a6 6 0 1 1 12 0c0 7 3 8 3 8H3s3-1 3-8M10 20a2 2 0 0 0 4 0',
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM21 21l-5-5',
  back: 'M15 18l-6-6 6-6',
  chev: 'M9 6l6 6-6 6',
  x: 'M6 6l12 12M18 6 6 18',
  check: 'M5 12.5l4.5 4.5L19 7',
  shield: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z',
  shieldok: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6zM8.5 12l2.5 2.5 4.5-4.5',
  lock: 'M6 11h12v10H6zM8 11V8a4 4 0 0 1 8 0v3',
  wallet: 'M3 7h16a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM3 7l12-4 2 4M16 13.5h2',
  pin: 'M12 21s7-6 7-12a7 7 0 1 0-14 0c0 6 7 12 7 12zM12 11a2 2 0 1 0 0-4 2 2 0 0 0 0 4z',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2',
  star: 'M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z',
  heart: 'M12 20s-7-4.4-9-9a5 5 0 0 1 9-3 5 5 0 0 1 9 3c-2 4.6-9 9-9 9z',
  flag: 'M5 21V4M5 4h11l-2 4 2 4H5',
  alert: 'M12 3 2 20h20zM12 10v4M12 17v.5',
  info: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 11v6M12 7.5v.5',
  settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 0 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 0 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 0 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 0 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0',
  users: 'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM2 21a7 7 0 0 1 14 0M16 3.5a4 4 0 0 1 0 7.5M22 21a7 7 0 0 0-4-6.3',
  camera: 'M4 7h3l2-3h6l2 3h3a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1zM12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  send: 'M21 3 10 14M21 3l-7 18-4-7-7-4z',
  gift: 'M4 11h16v10H4zM3 7h18v4H3zM12 7v14M12 7S10 3 7.5 4 9 7 12 7zm0 0s2-4 4.5-3S15 7 12 7z',
  leaf: 'M5 19C5 9 11 4 20 4c0 9-5 15-15 15zM5 19l8-8',
  trophy: 'M8 4h8v5a4 4 0 0 1-8 0zM8 6H4v2a4 4 0 0 0 4 4M16 6h4v2a4 4 0 0 1-4 4M12 13v4M8 21h8M9 17h6v4H9z',
  route: 'M6 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM18 9a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM8 17h7a3 3 0 0 0 0-6H9a3 3 0 0 1 0-6h7',
  logout: 'M15 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4M10 16l-4-4 4-4M6 12h10',
  sun: 'M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4',
  globe: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM3 12h18M12 3c2.5 2.7 3.8 5.7 3.8 9s-1.3 6.3-3.8 9c-2.5-2.7-3.8-5.7-3.8-9S9.5 5.7 12 3z',
  map: 'M9 4 3 6v14l6-2 6 2 6-2V4l-6 2zM9 4v14M15 6v14',
  doc: 'M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8zM14 3v5h5M9 13h6M9 17h6',
  download: 'M12 4v12M7 11l5 5 5-5M5 20h14',
  trash: 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3',
  eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  ban: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM5.6 5.6l12.8 12.8',
  sparkle: 'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z',
  bolt: 'M13 2 4 14h7l-1 8 9-12h-7z',
  edit: 'M4 20h4L19 9l-4-4L4 16zM14 6l4 4',
  phone: 'M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z',
  hand: 'M8 13V5a1.5 1.5 0 0 1 3 0v6M11 10V3.5a1.5 1.5 0 0 1 3 0V10M14 10V5a1.5 1.5 0 0 1 3 0v8a7 7 0 0 1-7 7h-.5a6 6 0 0 1-5-2.7L3 14.5a1.6 1.6 0 0 1 2.6-1.9L8 15',
  refresh: 'M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7',
  box: 'M3 7l9-4 9 4v10l-9 4-9-4zM3 7l9 4 9-4M12 11v10',
};
export const icon = (name, cls = 'ic') => raw(`<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${P[name] || P.info}"/></svg>`);
export const LOGO = raw(`<svg viewBox="0 0 40 40" aria-hidden="true"><rect width="40" height="40" rx="12" fill="var(--brand)"/><g fill="var(--brand-ink)"><circle cx="14" cy="14" r="2.2"/><circle cx="26" cy="14" r="2.2"/><circle cx="14" cy="26" r="2.2"/><circle cx="26" cy="26" r="2.2"/><circle cx="20" cy="20" r="2.2"/></g><path d="M20 6c4 4 4 4 8 4s6 2 6 6-2 4 0 8-2 6-6 6-4 0-8 4c-4-4-4-4-8-4s-6-2-6-6 2-4 0-8 2-6 6-6 4 0 8-4z" fill="none" stroke="var(--mari)" stroke-width="2.2" stroke-linejoin="round"/></svg>`);

// ---------- state, events, api
export const store = { token: localStorage.getItem('cl.token') || '', me: null, config: null, online: navigator.onLine };
export const bus = new EventTarget();
export const emit = (type, detail) => bus.dispatchEvent(new CustomEvent(type, { detail }));
export const on = (type, fn) => { const h = (e) => fn(e.detail); bus.addEventListener(type, h); return () => bus.removeEventListener(type, h); };

export async function api(path, { method = 'GET', body } = {}) {
  let res;
  try {
    res = await fetch('/api' + path, { method, headers: { 'content-type': 'application/json', ...(store.token ? { authorization: 'Bearer ' + store.token } : {}) }, body: body ? JSON.stringify(body) : undefined });
  } catch {
    const e = new Error(t('You are offline. Check your connection.')); e.offline = true; throw e;
  }
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && store.token && !path.startsWith('/auth')) { emit('logout'); }
  if (!res.ok) { const e = new Error(data.error || 'Request failed'); e.status = res.status; e.data = data; throw e; }
  return data;
}
export async function refreshMe() {
  if (!store.token) return null;
  store.me = await api('/me');
  applyPrefs();
  emit('me', store.me);
  return store.me;
}
export function applyPrefs() {
  const me = store.me;
  const theme = me?.theme || localStorage.getItem('cl.theme') || 'auto';
  if (theme === 'auto') document.documentElement.removeAttribute('data-theme'); else document.documentElement.setAttribute('data-theme', theme);
  const lang = me?.lang || localStorage.getItem('cl.lang') || 'en';
  if (lang !== getLang()) setLang(lang);
  document.documentElement.lang = lang;
  document.body.classList.toggle('datasaver', !!me?.dataSaver);
}

// ---------- formatting
export const rupee = (n) => (n === 0 ? t('FREE') : '₹' + Number(n).toLocaleString('en-IN'));
export function ago(ts) {
  const s = (Date.now() - ts) / 1000;
  if (s < 60) return t('just now');
  if (s < 3600) return `${Math.floor(s / 60)}${t('m ago')}`;
  if (s < 86400) return `${Math.floor(s / 3600)}${t('h ago')}`;
  if (s < 86400 * 7) return `${Math.floor(s / 86400)}${t('d ago')}`;
  return new Date(ts).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}
export function until(ts) {
  const s = (ts - Date.now()) / 1000;
  if (s <= 0) return t('expired');
  if (s < 3600) return `${Math.ceil(s / 60)} ${t('min left')}`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m ${t('left')}`;
  return `${Math.floor(s / 86400)}d ${Math.floor((s % 86400) / 3600)}h ${t('left')}`;
}
export const when = (ts) => new Date(ts).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
export const clock = (ts) => new Date(ts).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
export const loc = (id) => store.config?.locations.find((l) => l.id === id);
export const locName = (id) => { const l = loc(id); return l ? (getLang() === 'ta' ? l.ta : l.name) : '—'; };
export const cat = (id) => store.config?.categories.find((c) => c.id === id) || { icon: '📦', en: 'Other', ta: 'மற்றவை' };
export const catName = (c) => (getLang() === 'ta' ? c.ta : c.en);
export const cond = (id) => { const c = store.config?.conditions.find((x) => x.id === id); return c ? (getLang() === 'ta' ? c.ta : c.en) : id; };
export const S = () => store.config?.settings || {};

// ---------- components
export function avatar(u, size = 40, { badge = true } = {}) {
  if (!u) return '';
  const initials = (u.name || '?').split(' ').filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
  const inner = u.avatar ? html`<img src="${u.avatar}" alt="" loading="lazy">` : initials;
  return html`<span class="av-wrap"><span class="av" style="--s:${size}px;background:${u.color || 'var(--brand)'}">${inner}</span>${badge && u.verified ? html`<span class="vb" title="${t('Verified campus member')}">${icon('check')}</span>` : ''}</span>`;
}
export function trustRing(score, size = 44) {
  const r = size / 2 - 4, c = 2 * Math.PI * r, col = score >= 75 ? 'var(--ok)' : score >= 50 ? 'var(--mari)' : 'var(--kum)';
  return html`<span class="trust" title="${t('Trust score')}: ${score}/100"><svg width="${size}" height="${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="var(--line)" stroke-width="4"/><circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${col}" stroke-width="4" stroke-linecap="round" stroke-dasharray="${(score / 100) * c} ${c}"/></svg><b>${score}</b></span>`;
}
export const stars = (n) => html`<span class="stars" aria-label="${n} stars">${'★'.repeat(Math.round(n))}<span style="opacity:.25">${'★'.repeat(5 - Math.round(n))}</span></span>`;
export function who(u, { sub = true } = {}) {
  if (!u) return '';
  const st = u.stats || {};
  const meta = [st.rating ? `★ ${st.rating.toFixed(1)}` : t('New'), `${st.completed || 0} ${t('deals')}`, u.dept].filter(Boolean).join(' · ');
  return html`<a class="who" href="#/user/${u.id}">${avatar(u, 34)}<span class="grow"><span class="n ellip" style="display:block">${u.name}${u.isStaff ? html` <span class="pill indigo">${t('Staff')}</span>` : ''}</span>${sub ? html`<span class="m">${meta}</span>` : ''}</span></a>`;
}
const WHY = { new_member: ['🌱', 'New member'], fresh: ['✨', 'Just posted'], well_rated: ['★', 'Well rated'], rotation: ['↻', 'Fair rotation'] };
export const whyTag = (why) => (why?.length ? html`<span class="why" title="${t('Why am I seeing this? Feed is ranked fairly — no paid boosting.')}">${WHY[why[0]]?.[0]} ${t(WHY[why[0]]?.[1] || '')}</span>` : '');

export function listingTile(l) {
  const c = cat(l.category);
  return html`<article class="card tile" data-go="#/listing/${l.id}">
    <div class="ph"><span class="ds">${c.icon}</span>${l.photos?.[0] ? html`<img src="${l.photos[0]}" alt="${l.title}" loading="lazy" decoding="async">` : ''}
      <div class="tl">${l.free ? html`<span class="pill ok">${icon('gift')} ${t('Free')}</span>` : ''}${l.status === 'reserved' ? html`<span class="pill mari">${t('Reserved')}</span>` : ''}${l.status === 'sold' ? html`<span class="pill">${t('Sold')}</span>` : ''}</div>
      <button class="heart ${l.wish ? 'on' : ''}" data-wish="${l.id}" aria-label="${t('Wishlist')}">${icon('heart')}</button></div>
    <div class="bd"><span class="pr ${l.free ? 'free' : ''}">${rupee(l.price)}</span><span class="tt clamp2">${l.title}</span>
      <span class="row between"><span class="tiny faint ellip">${l.seller?.name?.split(' ')[0]} · ${ago(l.createdAt)}</span></span>${whyTag(l.why)}</div>
  </article>`;
}
export function taskCard(tk) {
  const emoji = { task: '🧾', pickdrop: '📦', group: '🍱' }[tk.kind];
  const kindName = { task: t('Task'), pickdrop: t('Pick & Drop'), group: t('Group run') }[tk.kind];
  return html`<article class="card task ${tk.kind} ${tk.urgent ? 'urgent' : ''}" data-go="#/task/${tk.id}">
    <span class="ico">${emoji}</span>
    <div class="grow col gap-4">
      <div class="row gap-6 wrap"><span class="pill ${tk.kind === 'pickdrop' ? 'mari' : tk.kind === 'group' ? 'ok' : 'indigo'}">${kindName}</span>${tk.urgent ? html`<span class="pill kum">${icon('bolt')} ${t('Urgent')}</span>` : ''}${tk.secured ? html`<span class="pill brand" title="${t('Reward is already locked in escrow')}">${icon('lock')} ${t('Secured')}</span>` : ''}</div>
      <h4 class="clamp2">${tk.title}</h4>
      ${tk.pickup ? html`<div class="route"><i></i>${locName(tk.pickup)}<span class="dash"></span><i class="to"></i>${locName(tk.drop)}</div>` : tk.location ? html`<div class="route">${icon('pin', 'ic-sm')} ${locName(tk.location)}</div>` : ''}
      <div class="tiny faint">${tk.poster?.name?.split(' ')[0]} · ${icon('clock', 'ic-sm')} ${until(tk.deadline)}${tk.kind === 'group' ? ` · ${tk.joined}/${tk.capacity} ${t('joined')}` : tk.offerCount ? ` · ${tk.offerCount} ${t('offers')}` : ''}</div>
      ${whyTag(tk.why)}
    </div>
    <div class="rw"><b class="num">₹${tk.reward}</b><span class="tiny faint">${tk.kind === 'group' ? t('per order') : t('reward')}</span></div>
  </article>`;
}
export const STATUS_LABEL = { offered: 'Awaiting acceptance', accepted: 'Accepted', in_progress: 'In progress', delivered: 'Delivered', confirmed: 'Confirmed', paid: 'Completed & paid', declined: 'Declined', cancelled: 'Cancelled', expired: 'Expired', disputed: 'In dispute', refunded: 'Refunded' };
export const statusPill = (s) => html`<span class="status s-${s}">${t(STATUS_LABEL[s] || s)}</span>`;
export function breakdownBox({ amount, fee, total, feeWaived }, label = 'Item price', totLabel = 'You pay (held in escrow)') {
  return html`<div class="breakdown num">
    <div class="l"><span>${t(label)}</span><b>₹${amount}</b></div>
    <div class="l"><span>${t('Platform fee')} <span class="faint tiny">(${S().feePercent}%, ${t('min')} ₹${S().feeMin}, ${t('max')} ₹${S().feeMax})</span></span><b>${feeWaived ? html`<s class="faint">₹${fee}</s> ₹0` : `₹${fee}`}</b></div>
    <div class="l tot"><span>${t(totLabel)}</span><span>₹${total}</span></div></div>`;
}
export function calcFee(amount) { const s = S(); if (!amount) return 0; return Math.min(s.feeMax, Math.max(s.feeMin, Math.round((amount * s.feePercent) / 100))); }
export const empty = (e, title, text = '', action = '') => html`<div class="empty"><div class="e">${e}</div><h3>${title}</h3><p class="small">${text}</p>${action ? html`<div class="mt-16">${action}</div>` : ''}</div>`;
export const skeleton = (n = 4) => html`<div class="col">${Array.from({ length: n }, () => html`<div class="skel" style="height:96px"></div>`)}</div>`;
export const banner = (kind, ic, title, text = '') => html`<div class="banner ${kind}">${icon(ic)}<div><b>${title}</b>${text ? html`<p class="small">${text}</p>` : ''}</div></div>`;

// ---------- toasts
export function toast(msg, kind = '', sub = '', onClick) {
  let host = $('.toasts');
  if (!host) { host = document.createElement('div'); host.className = 'toasts'; host.setAttribute('role', 'status'); document.body.append(host); }
  const el = document.createElement('div');
  el.className = 'toast ' + kind;
  el.innerHTML = html`<span>${kind === 'err' ? '⚠️' : kind === 'ok' ? '✓' : '◉'}</span><span>${msg}${sub ? html`<small>${sub}</small>` : ''}</span>`;
  el.onclick = () => { onClick?.(); el.remove(); };
  host.append(el);
  setTimeout(() => el.remove(), kind === 'err' ? 5200 : 3600);
}
export const toastErr = (e) => toast(e.message || String(e), 'err');

// ---------- bottom sheets
export function sheet(content, { onMount, dismissable = true } = {}) {
  const scrim = document.createElement('div');
  scrim.className = 'scrim';
  scrim.innerHTML = `<div class="sheet" role="dialog" aria-modal="true"><div class="grab"></div>${content}</div>`;
  document.body.append(scrim);
  const close = () => { scrim.remove(); document.removeEventListener('keydown', k); };
  const k = (e) => { if (e.key === 'Escape' && dismissable) close(); };
  document.addEventListener('keydown', k);
  scrim.addEventListener('click', (e) => { if (e.target === scrim && dismissable) close(); if (e.target.closest('[data-close]')) close(); });
  const el = scrim.firstElementChild;
  onMount?.(el, close);
  setTimeout(() => el.querySelector('input:not([type=hidden]),textarea,select,button.btn')?.focus?.(), 60);
  return { el, close };
}
export function confirmSheet({ title, body = '', ok = t('Confirm'), danger = false, extra = '' }) {
  return new Promise((resolve) => {
    sheet(html`<h2>${title}</h2>${body ? html`<p class="muted mt-6">${body}</p>` : ''}${extra}<div class="btn-row mt-24"><button class="btn ghost" data-r="0">${t('Cancel')}</button><button class="btn ${danger ? 'danger' : ''}" data-r="1">${ok}</button></div>`.s, {
      onMount(el, close) { el.addEventListener('click', (e) => { const b = e.target.closest('[data-r]'); if (b) { close(); resolve(b.dataset.r === '1'); } }); },
    });
  });
}
// form sheet: fields → values (null if cancelled)
export function formSheet({ title, intro = '', fields, ok = t('Submit'), danger = false }) {
  return new Promise((resolve) => {
    const f = fields.map((x) => {
      if (x.type === 'select') return html`<label class="f"><span>${x.label}</span><select class="in" name="${x.name}">${x.options.map((o) => html`<option value="${o.value ?? o}" ${o.value === x.value ? 'selected' : ''}>${o.label ?? o}</option>`)}</select></label>`;
      if (x.type === 'textarea') return html`<label class="f"><span>${x.label}</span><textarea class="in" name="${x.name}" placeholder="${x.placeholder || ''}" ${x.required ? 'required' : ''}>${x.value || ''}</textarea></label>`;
      if (x.type === 'stars') return html`<div class="f"><span class="small muted">${x.label}</span><div class="row mt-6" data-stars="${x.name}" style="font-size:2rem;gap:6px;color:var(--mari);cursor:pointer">${[1, 2, 3, 4, 5].map((i) => html`<span data-s="${i}">☆</span>`)}</div><input type="hidden" name="${x.name}" value="${x.value || 0}"></div>`;
      if (x.type === 'chips') return html`<div class="f"><span class="small muted">${x.label}</span><div class="row wrap mt-6" data-chips="${x.name}">${x.options.map((o) => html`<button type="button" class="chip" data-v="${o}">${o}</button>`)}</div></div>`;
      if (x.type === 'check') return html`<label class="check"><input type="checkbox" name="${x.name}" ${x.value ? 'checked' : ''}><span>${x.label}</span></label>`;
      if (x.type === 'note') return html`<div class="mt-6 mb">${x.html}</div>`;
      return html`<label class="f"><span>${x.label}</span>${x.prefix ? html`<div class="prefix"><b>${x.prefix}</b><input class="in" name="${x.name}" type="${x.type || 'text'}" value="${x.value ?? ''}" placeholder="${x.placeholder || ''}" ${x.required ? 'required' : ''} inputmode="${x.inputmode || ''}"></div>` : html`<input class="in" name="${x.name}" type="${x.type || 'text'}" value="${x.value ?? ''}" placeholder="${x.placeholder || ''}" ${x.required ? 'required' : ''} inputmode="${x.inputmode || ''}" ${x.min != null ? `min="${x.min}"` : ''}>`}${x.hint ? html`<div class="hint">${x.hint}</div>` : ''}</label>`;
    });
    sheet(html`<form><h2>${title}</h2>${intro ? html`<p class="muted small mt-6">${intro}</p>` : ''}<div class="mt-16">${f}</div><div class="btn-row mt-16"><button type="button" class="btn ghost" data-close>${t('Cancel')}</button><button class="btn ${danger ? 'danger' : ''}">${ok}</button></div></form>`.s, {
      onMount(el, close) {
        const form = el.querySelector('form');
        el.querySelectorAll('[data-stars]').forEach((box) => box.addEventListener('click', (e) => {
          const s = e.target.closest('[data-s]'); if (!s) return;
          const n = +s.dataset.s; box.nextElementSibling.value = n;
          box.querySelectorAll('[data-s]').forEach((x) => { x.textContent = +x.dataset.s <= n ? '★' : '☆'; });
        }));
        el.querySelectorAll('[data-chips]').forEach((box) => box.addEventListener('click', (e) => { const c = e.target.closest('.chip'); if (c) c.classList.toggle('on'); }));
        el.querySelector('[data-close]').addEventListener('click', () => resolve(null));
        form.addEventListener('submit', (e) => {
          e.preventDefault();
          const v = Object.fromEntries(new FormData(form));
          form.querySelectorAll('input[type=checkbox]').forEach((c) => { v[c.name] = c.checked; });
          el.querySelectorAll('[data-chips]').forEach((box) => { v[box.dataset.chips] = [...box.querySelectorAll('.chip.on')].map((c) => c.dataset.v); });
          close(); resolve(v);
        });
      },
    });
  });
}

// ---------- images: compress on device → low data usage
export function pickImage({ capture = false, max = 760, quality = 0.72 } = {}) {
  return new Promise((resolve) => {
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = 'image/*'; if (capture) inp.capture = 'environment';
    inp.onchange = async () => { const f = inp.files?.[0]; if (!f) return resolve(null); resolve(await compress(f, max, quality)); };
    inp.click();
  });
}
export function compress(file, max = 760, quality = 0.72) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const s = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas'); c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      let out = c.toDataURL('image/webp', quality);
      if (!out.startsWith('data:image/webp')) out = c.toDataURL('image/jpeg', quality);
      URL.revokeObjectURL(img.src); resolve(out);
    };
    img.onerror = () => resolve(null);
    img.src = URL.createObjectURL(file);
  });
}

// ---------- campus map (SVG, no tiles → zero map data cost)
export function campusMap({ highlight = [], from, to, runner, pick, height } = {}) {
  const L = store.config.locations;
  const A = from && loc(from), B = to && loc(to);
  const kindCol = { hostel: 'var(--indigo)', academic: 'var(--brand)', food: 'var(--mari)', service: 'var(--ink-2)', sports: 'var(--ok)', gate: 'var(--kum)' };
  const roads = 'M500 660 L500 520 L330 400 L200 260 M330 400 L380 210 M500 520 L640 390 L560 300 L380 210 M640 390 L760 280 L800 200 M760 280 L900 320 M640 390 L690 470 L820 560 M500 520 L420 560 L290 600 M330 400 L150 470 M760 280 L640 120';
  return html`<div class="map"><svg viewBox="0 0 1000 700" ${height ? `style="max-height:${height}px"` : ''} role="img" aria-label="${t('Campus map')}">
    <defs><pattern id="dots" width="28" height="28" patternUnits="userSpaceOnUse"><circle cx="14" cy="14" r="1.6" fill="var(--line)"/></pattern></defs>
    <rect width="1000" height="700" fill="var(--paper-2)"/><rect width="1000" height="700" fill="url(#dots)"/>
    <rect x="30" y="30" width="940" height="650" rx="40" fill="none" stroke="var(--line)" stroke-width="6" stroke-dasharray="2 14" stroke-linecap="round"/>
    <path d="${roads}" fill="none" stroke="var(--card)" stroke-width="22" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="${roads}" fill="none" stroke="var(--line)" stroke-width="2" stroke-dasharray="8 10"/>
    ${A && B ? html`<path d="M${A.x} ${A.y} Q ${(A.x + B.x) / 2 + 60} ${(A.y + B.y) / 2 - 80} ${B.x} ${B.y}" fill="none" stroke="var(--mari)" stroke-width="7" stroke-dasharray="2 14" stroke-linecap="round"/>` : ''}
    ${L.map((l) => {
      const hi = highlight.includes(l.id) || l.id === from || l.id === to;
      const col = l.id === to ? 'var(--mari)' : l.id === from ? 'var(--brand)' : kindCol[l.kind];
      return html`<g class="pin" data-pin="${l.id}" ${pick ? '' : 'style="cursor:default"'}>
        <circle cx="${l.x}" cy="${l.y}" r="${hi ? 20 : 12}" fill="${col}" opacity="${hi || !highlight.length ? 1 : .45}" stroke="var(--card)" stroke-width="4"/>
        ${l.safe ? html`<circle cx="${l.x}" cy="${l.y}" r="${hi ? 28 : 18}" fill="none" stroke="${col}" stroke-width="2" opacity=".5" stroke-dasharray="3 5"/>` : ''}
        <text x="${l.x}" y="${l.y + (hi ? 50 : 38)}" text-anchor="middle" ${hi ? 'style="fill:var(--ink);font-size:26px"' : ''}>${locName(l.id)}</text></g>`;
    })}
    ${runner ? html`<g><circle cx="${runner.x}" cy="${runner.y}" r="18" fill="var(--mari)" class="runner"/><circle cx="${runner.x}" cy="${runner.y}" r="16" fill="var(--mari)" stroke="var(--card)" stroke-width="5"/><text x="${runner.x}" y="${runner.y + 7}" text-anchor="middle" font-size="20">🏃</text></g>` : ''}
  </svg></div>`;
}

export function shareOrCopy(text) {
  if (navigator.share) navigator.share({ text }).catch(() => {});
  else navigator.clipboard?.writeText(text).then(() => toast(t('Copied to clipboard'), 'ok'));
}
