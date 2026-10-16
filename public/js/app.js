// App shell: router (lazy-loaded views), top bar, bottom nav, realtime stream, SOS, create menu.
import { html, raw, $, icon, LOGO, store, api, demoLogin, refreshMe, applyPrefs, on, emit, toast, toastErr, sheet, avatar, t, locName, when } from './core.js';
import { getLang } from './i18n/index.js';

const ROUTES = [
  ['home', 'home', 'feed'], ['search', 'home', 'search'],
  ['market', 'market', 'list'], ['listing/:id', 'market', 'detail'], ['sell', 'market', 'sell'], ['listing/:id/edit', 'market', 'sell'],
  ['tasks', 'tasks', 'list'], ['task/:id', 'tasks', 'detail'], ['post/:kind', 'tasks', 'post'],
  ['deal/:id', 'deal', 'detail'], ['activity', 'activity', 'list'],
  ['chats', 'chat', 'inbox'], ['chat/:id', 'chat', 'thread'],
  ['me', 'profile', 'me'], ['user/:id', 'profile', 'user'], ['wallet', 'wallet', 'main'],
  ['community', 'community', 'main'], ['lostfound', 'community', 'lostfound'], ['map', 'community', 'map'],
  ['notifications', 'notifications', 'main'], ['settings', 'settings', 'main'], ['settings/:section', 'settings', 'section'],
  ['admin', 'admin', 'main'], ['admin/vendor/:id', 'admin', 'vendor'], ['admin/:tab', 'admin', 'main'],
];
const TABS = ['home', 'market', 'tasks', 'activity'];
const compiled = ROUTES.map(([p, mod, fn]) => { const keys = []; const re = new RegExp('^' + p.replace(/:(\w+)/g, (_, k) => { keys.push(k); return '([^/]+)'; }) + '$'); return { re, keys, mod, fn, p }; });

let cleanup = null;
let es = null;

function parseHash() {
  const h = location.hash.replace(/^#\/?/, '') || 'home';
  const [path, qs] = h.split('?');
  return { path, query: Object.fromEntries(new URLSearchParams(qs || '')) };
}

function frame() {
  document.body.innerHTML = html`<div class="stage"><aside class="side" id="side"></aside><div class="app" id="app">
    <div id="offline"></div>
    <header class="top" id="top"></header>
    <main id="main"></main>
    <nav class="nav" id="nav" aria-label="Main">
      <a href="#/home" data-tab="home">${icon('home')}<span>${t('Home')}</span></a>
      <a href="#/market" data-tab="market">${icon('bag')}<span>${t('Market')}</span></a>
      <button class="fab" id="fab" aria-label="${t('Create')}">${icon('plus')}</button>
      <a href="#/tasks" data-tab="tasks">${icon('route')}<span>${t('Tasks')}</span></a>
      <a href="#/activity" data-tab="activity">${icon('activity')}<span>${t('Activity')}</span></a>
    </nav>
    <button class="sos" id="sos" aria-label="${t('SOS — get help')}">SOS</button>
  </div></div>`;
  $('#fab').onclick = createMenu;
  $('#sos').onclick = sosSheet;
  window.addEventListener('scroll', () => $('#top')?.classList.toggle('scrolled', scrollY > 4), { passive: true });
  renderSide();
}

export function setTop({ title = '', back = false, actions = '', brand = false } = {}) {
  const me = store.me;
  const right = html`
    ${actions}
    ${brand || !back ? html`
      <a class="iconbtn" href="#/chats" aria-label="${t('Chats')}">${icon('chat')}${me?.unreadChats ? html`<span class="badge-dot">${me.unreadChats}</span>` : ''}</a>
      <a class="iconbtn" href="#/notifications" aria-label="${t('Notifications')}">${icon('bell')}${me?.unread ? html`<span class="badge-dot">${me.unread > 9 ? '9+' : me.unread}</span>` : ''}</a>
      <a href="#/me" aria-label="${t('Profile')}" style="margin-left:2px">${avatar(me, 34, { badge: false })}</a>` : ''}`;
  $('#top').innerHTML = html`
    ${back ? html`<button class="iconbtn" id="back" aria-label="${t('Back')}">${icon('back')}</button>` : ''}
    ${brand ? html`<a class="brand grow" href="#/home">${LOGO}<span>CampusLoop<small>${store.config?.campus.name}</small></span></a>` : html`<span class="title">${title}</span>`}
    ${right}`;
  $('#back')?.addEventListener('click', () => (history.length > 1 ? history.back() : (location.hash = '#/home')));
}

async function route() {
  if (!store.token) return renderAuth();
  if (!$('#main')) frame();
  const { path, query } = parseHash();
  let match = null, params = {};
  for (const r of compiled) { const m = path.match(r.re); if (m) { match = r; r.keys.forEach((k, i) => { params[k] = decodeURIComponent(m[i + 1]); }); break; } }
  if (!match) { location.hash = '#/home'; return; }
  try { cleanup?.(); } catch {}
  cleanup = null;
  document.body.classList.remove('has-cta', 'in-chat');
  const tab = path.split('/')[0];
  document.querySelectorAll('#nav [data-tab]').forEach((a) => a.classList.toggle('on', a.dataset.tab === tab || (tab === 'search' && a.dataset.tab === 'home')));
  const main = $('#main');
  const view = document.createElement('div');
  view.className = 'view';
  main.replaceChildren(view);
  if (TABS.includes(tab)) setTop({ brand: true }); else setTop({ back: true, title: '' });
  statusBanner(view);
  window.scrollTo(0, 0);
  try {
    const mod = await import(`./views/${match.mod}.js`);
    const ret = await mod[match.fn]({ root: view, params, query, setTop });
    if (typeof ret === 'function') cleanup = ret;
  } catch (e) {
    console.error(e);
    view.innerHTML = html`<div class="empty"><div class="e">🧭</div><h3>${e.status === 404 ? t('Not found') : t('Something went wrong')}</h3><p class="small">${e.message}</p><a class="btn soft mt-16" href="#/home">${t('Go home')}</a></div>`;
  }
}

function statusBanner(view) {
  const me = store.me;
  if (location.hash.startsWith('#/settings/moderation')) return; // that page explains the status itself
  if (me && me.status !== 'active') {
    const b = document.createElement('div');
    b.className = 'banner bad mt-6';
    b.innerHTML = html`${icon('ban')}<div><b>${me.status === 'banned' ? t('Account banned') : t('Account suspended')}${me.suspendedUntil && me.status === 'suspended' ? ` · ${t('until')} ${when(me.suspendedUntil)}` : ''}</b><p class="small">${t('Reason')}: ${String(me.statusReason).replace(/\.$/, '')}. ${t('You can still view and complete active deals.')} <a class="link" href="#/settings/moderation">${t('Details & appeal')} →</a></p></div>`;
    view.before(b);
  } else if (me?.restrictions?.listings) {
    const r = me.restrictions.listings, b = document.createElement('div');
    b.className = 'banner warn mt-6';
    b.innerHTML = html`${icon('alert')}<div><b>${t('Listings restricted')}${r.until ? ` · ${t('until')} ${when(r.until)}` : ''}</b><p class="small">${t('Reason')}: ${String(r.reason).replace(/\.$/, '')}. ${t('You can still buy and finish active deals.')} <a class="link" href="#/settings/moderation">${t('Details & appeal')} →</a></p></div>`;
    view.before(b);
  }
}

async function renderAuth() {
  cleanup?.(); cleanup = null;
  document.body.innerHTML = '<div class="stage"><aside class="side" id="side"></aside><div class="app" id="app"><main id="main" style="padding:0"></main></div></div>';
  renderSide();
  const mod = await import('./views/auth.js');
  await mod.auth({ root: $('#main'), onDone: async (data) => { store.token = data.token; localStorage.setItem('cl.token', data.token); store.me = data.me; applyPrefs(); frame(); connect(); location.hash = '#/home'; route(); } });
}

function createMenu() {
  const opts = [
    ['🏷️', 'Sell an item', 'Books, gadgets, cycles…', '#/sell'],
    ['🎁', 'Give away free', 'Donate & reduce waste', '#/sell?free=1'],
    ['🧾', 'Post a task', 'Print, submit, queue…', '#/post/task'],
    ['📦', 'Pick & Drop', 'Parcel, lunch, books', '#/post/pickdrop'],
    ['🍱', 'Group run', 'Carry orders for many', '#/post/group'],
    ['🔎', 'Lost & Found', 'Hand in a found item', '#/lostfound?new=1'],
  ];
  sheet(html`<h2>${t('What do you need?')}</h2><p class="muted small">${t('Every deal is agreed by both sides and paid through escrow.')}</p>
    <div class="create-grid">${opts.map(([e, a, b, h]) => html`<button data-h="${h}"><em>${e}</em><b>${t(a)}</b><span>${t(b)}</span></button>`)}</div>`.s, {
    onMount(el, close) { el.addEventListener('click', (e) => { const b = e.target.closest('[data-h]'); if (b) { close(); location.hash = b.dataset.h; } }); },
  });
}

function sosSheet() {
  const cfg = store.config;
  sheet(html`<div class="center"><div style="font-size:2.6rem">🛟</div><h2>${t('Need help right now?')}</h2><p class="muted small mt-6">${t('Campus security is available 24×7. Your alert shares your name, phone and location with security only.')}</p></div>
    <a class="btn danger block mt-16" href="tel:${cfg.campus.securityPhone.replace(/\s/g, '')}">${icon('phone')} ${t('Call')} ${cfg.campus.securityName}</a>
    <label class="f mt-16"><span>${t('Where are you?')}</span><select class="in" id="sosLoc"><option value="">${t('Not sure / share GPS')}</option>${cfg.locations.map((l) => html`<option value="${l.id}">${locName(l.id)}</option>`)}</select></label>
    <label class="f"><span>${t('What is happening? (optional)')}</span><input class="in" id="sosNote" placeholder="${t('e.g. someone is following me')}"></label>
    <button class="btn mari block" id="sosSend">${icon('alert')} ${t('Send SOS alert to security')}</button>
    <p class="tiny faint center mt-10">${t('Misuse of SOS is a strike-level violation.')}</p>`.s, {
    onMount(el, close) {
      el.querySelector('#sosSend').onclick = async () => {
        const body = { location: el.querySelector('#sosLoc').value, note: el.querySelector('#sosNote').value };
        const send = async () => {
          try {
            const r = await api('/sos', { method: 'POST', body });
            close();
            sheet(html`<div class="center"><div style="font-size:2.6rem">✅</div><h2>${t('Alert sent')}</h2><p class="muted mt-6">${t('Security has been notified and will reach you shortly. Stay in a public, well-lit place.')}</p>${r.emergencyContact ? html`<a class="btn ghost block mt-16" href="tel:${r.emergencyContact.replace(/\s/g, '')}">${icon('phone')} ${t('Call my emergency contact')}</a>` : ''}<button class="btn block mt-10" data-close>${t('OK')}</button></div>`.s);
          } catch (e) { toastErr(e); }
        };
        if (!body.location && navigator.geolocation && store.me?.consent?.location !== false) {
          navigator.geolocation.getCurrentPosition((p) => { body.lat = p.coords.latitude; body.lng = p.coords.longitude; send(); }, send, { timeout: 4000 });
        } else send();
      };
    },
  });
}

function renderSide() {
  const side = $('#side');
  if (!side || !store.config) return;
  const P = [
    ['🔍', 'Transparency', 'Full fee breakdown before confirming, live deal timeline, reasons on every moderation action, receipts.'],
    ['🤝', 'Mutual acceptance', 'Offer → accept. Price/time changes need re-approval. Delivery OTP before money moves.'],
    ['🛡️', 'Anti-fraud', 'Verified college ID + phone, escrow, photo proof, chat payment masking, strikes, auto-flags.'],
    ['🪪', 'Proper profiles', 'Verified fields, trust score, role-wise history, masked phone, privacy controls.'],
    ['⚖️', 'Equal priority', 'No paid boosting, fair-rotation feed, urgent caps, helper job caps, fair-pick suggestion.'],
  ];
  side.innerHTML = html`<div class="brand">${LOGO}<span>CampusLoop</span></div>
    <h2>${t('Buy, sell, help & deliver — inside your campus loop.')}</h2>
    <p class="muted">${t('A trusted, fair marketplace, task board and pick-drop network for verified campus members.')}</p>
    <div class="mt-16">${P.map(([e, h, b]) => html`<div class="principle"><span style="font-size:1.3rem">${e}</span><div><b>${t(h)}</b><span class="muted">${t(b)}</span></div></div>`)}</div>
    ${store.config.demo ? html`<div class="card pad mt-24"><h4>${t('Judge mode · switch persona')}</h4><p class="tiny faint mt-6">${t('One tap to experience each role. OTPs are shown on screen in demo mode.')}</p>
      <div class="col gap-6 mt-10">${store.config.demoUsers.map((u) => html`<button class="persona" data-demo="${u.id}">${avatar(u, 32, { badge: false })}<span class="grow"><b class="small">${u.name}</b><span class="tiny faint" style="display:block">${u.persona}</span></span>${store.me?.id === u.id ? html`<span class="pill brand">${t('You')}</span>` : ''}</button>`)}</div></div>
      <p class="tiny faint mt-10">${t('Open on a phone (same Wi-Fi)')}: <b>${location.host}</b></p>` : ''}`;
  side.onclick = async (e) => {
    const b = e.target.closest('[data-demo]'); if (!b) return;
    try { const d = await demoLogin(b.dataset.demo); store.token = d.token; localStorage.setItem('cl.token', d.token); store.me = d.me; applyPrefs(); frame(); connect(); location.hash = '#/home'; route(); toast(`${t('Now viewing as')} ${d.me.name}`, 'ok'); } catch (err) { toastErr(err); }
  };
}

// ---------- realtime
let meTimer;
const refreshSoon = () => { clearTimeout(meTimer); meTimer = setTimeout(async () => { await refreshMe().catch(() => {}); const { path } = parseHash(); if (TABS.includes(path.split('/')[0])) setTop({ brand: true }); }, 400); };
function connect() {
  es?.close();
  if (!store.token || !window.EventSource) return;
  es = new EventSource('/api/stream?token=' + encodeURIComponent(store.token));
  es.addEventListener('notification', (e) => {
    const n = JSON.parse(e.data);
    emit('notification', n);
    refreshSoon();
    if (n.type === 'message' && location.hash === n.link) return;
    if (location.hash !== n.link) toast(n.title, '', n.body, () => n.link && (location.hash = n.link));
    if (document.hidden && store.me?.consent?.notifications && 'Notification' in window && Notification.permission === 'granted') new Notification(n.title, { body: n.body, icon: '/icons/icon-192.png' });
  });
  for (const ev of ['message', 'deal', 'task', 'track', 'feed', 'admin', 'sos']) es.addEventListener(ev, (e) => emit(ev, JSON.parse(e.data)));
  es.addEventListener('config', async () => { store.config = await api('/config'); });
  es.onerror = () => {};
}

// ---------- global delegation
document.addEventListener('click', async (e) => {
  const wish = e.target.closest('[data-wish]');
  if (wish) {
    e.preventDefault(); e.stopPropagation();
    try { const r = await api(`/listings/${wish.dataset.wish}/wishlist`, { method: 'POST' }); wish.classList.toggle('on', r.wish); toast(r.wish ? t('Saved to wishlist — we\'ll tell you if the price drops') : t('Removed from wishlist')); } catch (err) { toastErr(err); }
    return;
  }
  const go = e.target.closest('[data-go]');
  if (go && !e.target.closest('a,button:not([data-go])')) location.hash = go.dataset.go;
});
on('logout', () => { store.token = ''; store.me = null; localStorage.removeItem('cl.token'); es?.close(); location.hash = ''; renderAuth(); });
on('me', () => renderSide());
window.addEventListener('hashchange', route);
const setOffline = () => { const o = $('#offline'); if (o) o.innerHTML = navigator.onLine ? '' : html`<div class="offline">${t('You are offline — showing saved screens.')}</div>`; };
window.addEventListener('online', setOffline); window.addEventListener('offline', setOffline);

// ---------- boot
(async function boot() {
  applyPrefs();
  try { store.config = await api('/config'); } catch { document.body.innerHTML = '<p style="padding:40px;text-align:center">CampusLoop server is unreachable. Is it running?</p>'; return; }
  if (store.token) {
    try { await refreshMe(); } catch { store.token = ''; localStorage.removeItem('cl.token'); }
  }
  if (store.token) { frame(); connect(); }
  route();
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    // an updated worker took over → reload once so this page runs the new code (not on the very first install)
    const hadWorker = !!navigator.serviceWorker.controller;
    let reloaded = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => { if (hadWorker && !reloaded) { reloaded = true; location.reload(); } });
    navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' }).catch(() => {});
  }
})();
export { route };
