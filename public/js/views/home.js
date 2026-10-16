import { html, $, icon, store, api, t, listingTile, taskCard, empty, skeleton, on, toast } from '../core.js';

export function mixedFeed(items) {
  const out = []; let buf = [];
  const flush = () => { if (buf.length) out.push(html`<div class="grid2">${buf.map(listingTile)}</div>`); buf = []; };
  for (const it of items) { if (it.kind === 'listing') { buf.push(it); if (buf.length === 4) flush(); } else { flush(); out.push(taskCard(it)); } }
  flush();
  return html`<div class="col" style="gap:12px">${out}</div>`;
}

export async function feed({ root, query }) {
  const me = store.me;
  let filter = query.f || 'all';
  const hour = new Date().getHours();
  const greet = hour < 12 ? t('Good morning') : hour < 17 ? t('Good afternoon') : t('Good evening');
  root.innerHTML = html`
    <section class="card hello"><p class="small" style="opacity:.85">${greet} · வணக்கம்</p><h2 style="color:inherit">${me.name.split(' ')[0]} 👋</h2>
      <div class="stats" id="pulse"><div><b>–</b><span>${t('deals today')}</span></div><div><b>–</b><span>${t('open tasks')}</span></div><div><b>–</b><span>${t('kg waste saved')}</span></div></div></section>
    <form class="search mt-16" id="sf">${icon('search')}<input name="q" placeholder="${t('Search books, cycles, tasks…')}" enterkeyhint="search" aria-label="${t('Search')}"></form>
    <div id="ann"></div><div id="urg"></div>
    <div class="chips mt-16" id="filters">${[['all', 'For you'], ['market', 'Marketplace'], ['tasks', 'Tasks & Pick-Drop'], ['free', '🎁 Free']].map(([k, l]) => html`<button class="chip ${filter === k ? 'on' : ''}" data-f="${k}">${t(l)}</button>`)}
      <a class="chip" href="#/lostfound">🔎 ${t('Lost & Found')}</a><a class="chip" href="#/community">🌱 ${t('Community')}</a><a class="chip" href="#/map">🗺️ ${t('Campus map')}</a></div>
    <div id="fresh"></div>
    <div id="feed" class="mt-10">${skeleton(4)}</div>
    <p class="tiny faint center mt-24" style="padding:0 20px">${icon('shield', 'ic-sm')} ${t('Fair feed: new members and fresh posts are mixed with well-rated ones and rotated hourly. Nobody can pay to be on top.')} <a class="link" href="#/settings/rules">${t('How it works')}</a></p>`;

  async function load() {
    const d = await api('/feed?filter=' + filter);
    const p = d.pulse;
    $('#pulse', root).innerHTML = html`<div><b>${p.dealsToday}</b><span>${t('deals today')}</span></div><div><b>${p.openTasks}</b><span>${t('open tasks')}</span></div><div><b>${p.kgSaved}</b><span>${t('kg waste saved')}</span></div>`;
    $('#ann', root).innerHTML = html`${d.announcements.map((a) => html`<div class="ann ${a.kind} mt-10">${icon(a.kind === 'alert' ? 'alert' : 'info')}<div><b>${a.title}</b><p>${a.body}</p></div></div>`)}`;
    $('#urg', root).innerHTML = d.urgent.length && filter !== 'market' && filter !== 'free' ? html`<div class="section"><h3>⚡ ${t("Urgent near you")}</h3><p class="tiny faint mb">${t('Earliest deadline first · max')} ${store.config.settings.urgentPerDay}/${t("person/day")}</p><div class="urgent-lane mt-6">${d.urgent.map(taskCard)}</div></div>` : '';
    $('#feed', root).innerHTML = d.items.length ? mixedFeed(d.items) : empty('🌾', t('Nothing here yet'), t('Be the first to post something for your campus.'), html`<a class="btn" href="#/sell">${t('Sell an item')}</a>`);
    $('#fresh', root).innerHTML = '';
  }
  root.addEventListener('click', (e) => {
    const f = e.target.closest('[data-f]');
    if (f) { filter = f.dataset.f; root.querySelectorAll('[data-f]').forEach((c) => c.classList.toggle('on', c === f)); $('#feed', root).innerHTML = skeleton(3); load(); }
    if (e.target.closest('#reload')) load();
  });
  $('#sf', root).addEventListener('submit', (e) => { e.preventDefault(); const q = e.target.q.value.trim(); if (q) location.hash = '#/search?q=' + encodeURIComponent(q); });
  await load();
  return on('feed', () => { $('#fresh', root).innerHTML = html`<button class="btn soft sm block mt-10" id="reload">${icon('refresh')} ${t('New posts — tap to refresh')}</button>`; });
}

export async function search({ root, query, setTop }) {
  setTop({ back: true, title: t('Search') });
  const q = query.q || '';
  root.innerHTML = html`<form class="search" id="sf">${icon('search')}<input name="q" value="${q}" placeholder="${t('Search books, cycles, tasks…')}" autofocus></form><div id="res" class="mt-16">${q ? skeleton(3) : ''}</div>`;
  $('#sf', root).addEventListener('submit', (e) => { e.preventDefault(); location.hash = '#/search?q=' + encodeURIComponent(e.target.q.value.trim()); });
  if (!q) return;
  const r = await api('/search?q=' + encodeURIComponent(q));
  $('#res', root).innerHTML = !r.listings.length && !r.tasks.length
    ? empty('🔍', `${t('No results for')} “${q}”`, t('Try another word — or post a request so helpers can find you.'), html`<a class="btn soft" href="#/post/task">${t('Post a task')}</a>`)
    : html`${r.listings.length ? html`<h3>${t('Items')} <span class="faint">${r.listings.length}</span></h3><div class="grid2 mt-10">${r.listings.map(listingTile)}</div>` : ''}
      ${r.tasks.length ? html`<h3 class="mt-24">${t('Tasks')} <span class="faint">${r.tasks.length}</span></h3><div class="col mt-10">${r.tasks.map(taskCard)}</div>` : ''}`;
}
