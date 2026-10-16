import { html, $, icon, store, api, t, ago, avatar, empty, sheet, formSheet, toast, toastErr, campusMap, locName, loc, pickImage, banner } from '../core.js';
import { reportSheet } from './settings.js';

export async function main({ root, setTop }) {
  setTop({ back: true, title: t('Community') });
  const c = await api('/community');
  const im = c.impact;
  root.innerHTML = html`
    <div class="card hello mt-6"><p class="small" style="opacity:.85">${t('Campus impact so far')}</p><h2 style="color:inherit">♻️ ${im.kgSaved} kg ${t('kept out of the bin')}</h2>
      <div class="stats"><div><b>${im.itemsReused}</b><span>${t('items reused')}</span></div><div><b>${im.tasksDone}</b><span>${t('tasks done')}</span></div><div><b>₹${im.keptOnCampus.toLocaleString('en-IN')}</b><span>${t('kept on campus')}</span></div></div></div>
    <div class="stat-grid mt-10"><div class="card stat"><b>🎁 ${im.donations}</b><span>${t('items given free')}</span></div><div class="card stat"><b>🏃 ${im.helpersEarning}</b><span>${t('students earning as helpers')}</span></div></div>
    <div class="section"><h3>${t('Your badges')}</h3><div class="badges mt-10" style="justify-content:flex-start">${c.myBadges.map((b) => html`<span class="bdg">${b.icon} ${t(b.en)}</span>`)}</div>
      <p class="tiny faint mt-6">${t('Earn more: complete deals (Trusted trader), give items free (Giver), help 5 times (Campus runner), reply fast (Swift replier), invite friends (Connector).')}</p></div>
    <div class="section"><div class="section-h"><h3>${t('Campus heroes this week')}</h3><span class="tiny faint">${t('resets weekly')}</span></div>
      ${c.leaderboard.length ? html`<div class="card list">${c.leaderboard.map((r, i) => html`<a class="li" href="#/user/${r.user.id}"><b style="width:22px" class="faint">${['🥇', '🥈', '🥉'][i] || i + 1}</b>${avatar(r.user, 36)}<span class="grow"><b class="small">${r.user.name}</b><div class="tiny faint">${r.user.dept || ''}</div></span><b>${r.deals}</b><span class="tiny faint">${t('helped')}</span></a>`)}</div>` : html`<p class="muted small">${t('No completed deals this week yet — be the first!')}</p>`}
      <p class="tiny faint mt-6">${icon('info', 'ic-sm')} ${t('Recognition only: the leaderboard never affects feed ranking or who gets tasks. Opt out in Settings → Privacy.')}</p></div>
    <div class="section"><h3>${t('Announcements')}</h3>${c.announcements.length ? c.announcements.map((a) => html`<div class="ann ${a.kind} mt-10">${icon(a.kind === 'alert' ? 'alert' : 'info')}<div><b>${a.title}</b><p>${a.body}</p><p class="tiny">${ago(a.at)}</p></div></div>`) : html`<p class="muted small">${t('No announcements.')}</p>`}</div>
    <div class="card list mt-24"><a class="li" href="#/lostfound"><span class="ic-box">🔎</span><span class="grow">${t('Lost & Found')}</span>${icon('chev', 'chev')}</a><a class="li" href="#/map"><span class="ic-box">🗺️</span><span class="grow">${t('Campus map & safe meeting points')}</span>${icon('chev', 'chev')}</a><a class="li" href="#/sell?free=1"><span class="ic-box">🎁</span><span class="grow">${t('Donate an item')}</span>${icon('chev', 'chev')}</a></div>`;
}

export async function map({ root, setTop }) {
  setTop({ back: true, title: t('Campus map') });
  const L = store.config.locations;
  root.innerHTML = html`<p class="muted small mt-6">${t('All handovers happen at public points. Dashed rings mark CCTV-covered, well-lit safe meeting points.')}</p>
    <div class="mt-10" id="m">${campusMap({ highlight: L.filter((l) => l.safe).map((l) => l.id), pick: true })}</div>
    <div class="legend mt-10"><span style="--c:var(--brand)">${t('Academic')}</span><span style="--c:var(--indigo)">${t('Hostel')}</span><span style="--c:var(--mari)">${t('Food')}</span><span style="--c:var(--ok)">${t('Sports')}</span><span style="--c:var(--ink-2)">${t('Services')}</span></div>
    <div class="section"><h3>${t('Safe meeting points')}</h3><div class="card list mt-10">${L.filter((l) => l.safe).map((l) => html`<div class="li" data-pin="${l.id}"><span class="ic-box">${icon('pin')}</span><span class="grow">${locName(l.id)}</span><span class="pill ok">${icon('shieldok')} ${t('Safe')}</span></div>`)}</div></div>
    <p class="tiny faint mt-16">${t('Services are limited to the campus boundary. Hostel rooms are never used as handover points — use the Hostel Lobby Desk.')}</p>`;
  root.addEventListener('click', (e) => {
    const p = e.target.closest('[data-pin]'); if (!p) return;
    const l = loc(p.dataset.pin);
    $('#m', root).innerHTML = campusMap({ highlight: [l.id], pick: true }).s;
    toast(`${locName(l.id)} — ${l.safe ? t('approved safe meeting point') : t('not a handover point')}`);
  });
}

export async function lostfound({ root, query, setTop }) {
  setTop({ back: true, title: t('Lost & Found') });
  let tab = 'lost';
  async function load() {
    const items = await api('/lostfound');
    const list = items.filter((x) => x.kind === tab);
    root.innerHTML = html`<p class="muted small mt-6">${t('Report lost items or return what you found. Contact happens through recorded in-app chat.')}</p>
      <div class="seg mt-10">${[['lost', '😟 Lost'], ['found', '🙌 Found']].map(([k, l]) => html`<button class="${tab === k ? 'on' : ''}" data-tab="${k}">${t(l)}</button>`)}</div>
      <button class="btn block mt-10" id="new">${icon('plus')} ${t('Report lost or found item')}</button>
      <div class="col mt-16">${list.length ? list.map((x) => html`<div class="card pad-sm row" style="align-items:flex-start">${x.photo ? html`<img src="${x.photo}" alt="" style="width:72px;height:72px;border-radius:12px;object-fit:cover">` : html`<span class="ic-box" style="width:72px;height:72px;font-size:1.8rem">${x.kind === 'lost' ? '😟' : '🙌'}</span>`}
        <div class="grow"><div class="row between"><b>${x.title}</b>${x.status === 'resolved' ? html`<span class="pill ok">${t('Resolved')}</span>` : ''}</div><p class="small muted">${x.desc}</p>
          <p class="tiny faint mt-6">${icon('pin', 'ic-sm')} ${locName(x.location)} · ${x.when || ago(x.at)} · ${x.user?.name}</p>
          <div class="row gap-6 mt-6">${x.mine ? (x.status === 'open' ? html`<button class="btn xs soft" data-resolve="${x.id}">${t('Mark resolved')}</button>` : '') : html`<button class="btn xs" data-contact="${x.id}" data-user="${x.userId}">${icon('chat')} ${x.kind === 'lost' ? t('I found it') : t('It\'s mine')}</button><button class="btn xs ghost" data-rep="${x.id}">${icon('flag')}</button>`}</div></div></div>`)
        : empty(tab === 'lost' ? '🧸' : '📭', tab === 'lost' ? t('No lost items reported') : t('No found items reported'))}</div>`;
  }
  async function newItem() {
    const v = await formSheet({ title: t('Report an item'), fields: [
      { name: 'kind', label: t('Type'), type: 'select', options: [{ value: 'lost', label: t('I lost something') }, { value: 'found', label: t('I found something') }], value: tab },
      { name: 'title', label: t('What is it?'), required: true, placeholder: t('e.g. Black umbrella') },
      { name: 'desc', label: t('Description'), type: 'textarea', placeholder: t('Colour, marks, where exactly… For found items, keep one detail secret to verify the owner.') },
      { name: 'location', label: t('Where'), type: 'select', options: store.config.locations.map((l) => ({ value: l.id, label: locName(l.id) })) },
      { name: 'when', label: t('When'), placeholder: t('e.g. Today, 2 PM') },
      { name: 'photo', label: t('Add a photo'), type: 'check' }], ok: t('Post') });
    if (!v) return;
    try { if (v.photo) v.photo = await pickImage({ max: 600 }); else delete v.photo; await api('/lostfound', { method: 'POST', body: v }); tab = v.kind; toast(t('Posted'), 'ok'); load(); } catch (err) { toastErr(err); }
  }
  root.addEventListener('click', async (e) => {
    const tb = e.target.closest('[data-tab]'); if (tb) { tab = tb.dataset.tab; load(); }
    if (e.target.closest('#new')) newItem();
    try {
      const r = e.target.closest('[data-resolve]'); if (r) { await api(`/lostfound/${r.dataset.resolve}/resolve`, { method: 'POST' }); toast(t('Marked resolved 🎉'), 'ok'); load(); }
      const c = e.target.closest('[data-contact]'); if (c) { const th = await api('/threads', { method: 'POST', body: { userId: c.dataset.user, refType: 'lostfound', refId: c.dataset.contact } }); location.hash = '#/chat/' + th.id; }
      const rp = e.target.closest('[data-rep]'); if (rp) reportSheet('lostfound', rp.dataset.rep, t('this post'));
    } catch (err) { toastErr(err); }
  });
  await load();
  if (query.new) newItem();
}
