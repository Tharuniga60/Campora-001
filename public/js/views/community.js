import { html, $, icon, store, api, t, ago, avatar, empty, sheet, formSheet, toast, toastErr, campusMap, locName, loc, pickImage, banner } from '../core.js';

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

// Lost & found runs through the admin desk: finders hand items in, the desk posts them, owners claim with proof
// and collect in person with their college ID. Members never contact each other and nobody posts "lost" items.
const LF_STATUS = { pending: ['mari', 'Waiting for the desk'], held: ['indigo', 'At the admin desk'], ready: ['ok', 'Ready to collect'], returned: ['ok', 'Returned to owner'], rejected: ['', 'Closed'], withdrawn: ['', 'Withdrawn'] };
const CLAIM_STATUS = { pending: ['mari', 'Claim being verified'], approved: ['ok', 'Claim approved'], rejected: ['kum', 'Claim not approved'] };
const lfPill = (map, s) => html`<span class="pill ${map[s]?.[0] || ''}">${t(map[s]?.[1] || s)}</span>`;
const lfThumb = (x) => (x.photo ? html`<img src="${x.photo}" alt="" style="width:72px;height:72px;border-radius:12px;object-fit:cover">` : html`<span class="ic-box" style="width:72px;height:72px;font-size:1.8rem">📦</span>`);

export async function lostfound({ root, query, setTop }) {
  setTop({ back: true, title: t('Lost & Found') });
  let tab = 'desk';
  async function load() {
    const d = await api('/lostfound');
    const desk = locName(d.items[0]?.pickup || 'admin');
    const card = (x, extra) => html`<div class="card pad-sm row" style="align-items:flex-start">${lfThumb(x)}
      <div class="grow" style="min-width:0"><b>${x.title}</b>${x.desc ? html`<p class="small muted">${x.desc}</p>` : ''}
        <p class="tiny faint mt-6">${icon('pin', 'ic-sm')} ${t('Found at')} ${locName(x.location)}${x.when ? ` · ${x.when}` : ''} · ${ago(x.at)}</p>${extra}</div></div>`;
    const deskList = d.items.map((x) => card(x, html`<div class="row gap-6 wrap mt-6">${x.myClaim ? lfPill(CLAIM_STATUS, x.myClaim.status) : x.status === 'held' ? html`<button class="btn xs" data-claim="${x.id}">${icon('hand')} ${t('This is mine')}</button>` : lfPill(LF_STATUS, x.status)}</div>
      ${x.myClaim?.status === 'approved' && x.status === 'ready' ? html`<p class="tiny mt-6" style="color:var(--ok)">${t('Collect it at the')} ${locName(x.pickup)} ${t('desk with your college ID.')}</p>` : ''}`));
    const mineList = [
      ...d.claims.map((x) => card(x, html`<div class="row gap-6 wrap mt-6"><span class="pill">${t('Your claim')}</span>${lfPill(CLAIM_STATUS, x.myClaim.status)}</div>
        ${x.myClaim.status === 'approved' && x.status === 'ready' ? html`<p class="tiny mt-6" style="color:var(--ok)">${t('Collect it at the')} ${locName(x.pickup)} ${t('desk with your college ID.')}</p>` : ''}${x.myClaim.reason && x.myClaim.status === 'rejected' ? html`<p class="tiny faint mt-6">${x.myClaim.reason}</p>` : ''}`)),
      ...d.mine.map((x) => card(x, html`<div class="row gap-6 wrap mt-6"><span class="pill">${t('You handed in')}</span>${lfPill(LF_STATUS, x.status)}${x.status === 'pending' ? html`<button class="btn xs ghost" data-withdraw="${x.id}">${t('Withdraw')}</button>` : ''}</div>
        ${x.status === 'pending' ? html`<p class="tiny faint mt-6">${t('Please hand the item in at the')} ${locName(x.pickup)} ${t('desk. It is posted once the desk receives it.')}</p>` : ''}${x.rejectReason ? html`<p class="tiny faint mt-6">${x.rejectReason}</p>` : ''}`)),
    ];
    root.innerHTML = html`<div class="banner info mt-6">${icon('shield')}<div><b>${t('Every found item goes through the admin desk')}</b>
        <p class="small">${t('Finders hand items in at the')} ${desk}. ${t('The desk posts them here, checks each claim and hands the item to its owner, who shows their college ID. You never deal with strangers directly — this stops fake claims.')}</p></div></div>
      <button class="btn block mt-10" id="new">🙌 ${t('I found something')}</button>
      <div class="seg mt-16">${[['desk', `📦 ${t('At the desk')}`], ['mine', `🗂️ ${t('My reports & claims')}`]].map(([k, l]) => html`<button class="${tab === k ? 'on' : ''}" data-tab="${k}">${l}</button>`)}</div>
      <div class="col mt-16">${tab === 'desk'
        ? (deskList.length ? deskList : empty('📭', t('Nothing at the desk right now'), t('Lost something? Check back here — when someone hands it in, you can claim it.')))
        : (mineList.length ? mineList : empty('🗂️', t('Nothing yet'), t('Items you hand in and claims you make show up here.')))}</div>
      ${tab === 'desk' ? html`<p class="tiny faint mt-16">${icon('info', 'ic-sm')} ${t('Lost items aren’t posted. The desk only shows items that were actually handed in, so nobody can bait you with a fake post.')}</p>` : ''}`;
  }
  async function newItem() {
    const v = await formSheet({ title: t('I found something'), intro: `${t('Thank you! Hand the item in at the')} ${locName('admin')} ${t('desk. The desk posts it once it arrives — your name is never shown.')}`, fields: [
      { name: 'title', label: t('What is it?'), required: true, placeholder: t('e.g. Black umbrella') },
      { name: 'desc', label: t('Description (shown to everyone)'), type: 'textarea', placeholder: t('Colour, brand, where exactly you found it') },
      { name: 'secret', label: t('A detail only the owner would know (private)'), type: 'textarea', placeholder: t('e.g. name written inside, a sticker, what was in it — only the admin sees this') },
      { name: 'location', label: t('Where did you find it?'), type: 'select', options: store.config.locations.map((l) => ({ value: l.id, label: locName(l.id) })) },
      { name: 'when', label: t('When'), placeholder: t('e.g. Today, 2 PM') },
      { name: 'photo', label: t('Add a photo'), type: 'check' }], ok: t('Report to admin desk') });
    if (!v) return;
    try { if (v.photo) v.photo = await pickImage({ max: 600 }); else delete v.photo; await api('/lostfound', { method: 'POST', body: v }); tab = 'mine'; toast(t('Reported — please hand it in at the admin desk'), 'ok'); load(); } catch (err) { toastErr(err); }
  }
  async function claim(id) {
    const v = await formSheet({ title: t('Claim this item'), intro: t('The admin desk checks your answer against details only the finder and owner know. False claims lead to a strike.'), fields: [
      { name: 'proof', label: t('Prove it is yours'), type: 'textarea', required: true, placeholder: t('Marks, stickers, contents, where and when you lost it…') }], ok: t('Send claim') });
    if (!v) return;
    await api(`/lostfound/${id}/claim`, { method: 'POST', body: v });
    toast(t('Claim sent — the desk will verify it'), 'ok'); load();
  }
  root.addEventListener('click', async (e) => {
    const tb = e.target.closest('[data-tab]'); if (tb) { tab = tb.dataset.tab; load(); }
    if (e.target.closest('#new')) newItem();
    try {
      const c = e.target.closest('[data-claim]'); if (c) await claim(c.dataset.claim);
      const w = e.target.closest('[data-withdraw]'); if (w) { await api(`/lostfound/${w.dataset.withdraw}/withdraw`, { method: 'POST' }); toast(t('Report withdrawn'), 'ok'); load(); }
    } catch (err) { toastErr(err); }
  });
  await load();
  if (query.new) newItem();
}
