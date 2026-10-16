import { html, $, icon, store, api, t, ago, when, avatar, trustRing, stars, listingTile, empty, sheet, confirmSheet, toast, toastErr, refreshMe, pickImage, locName, emit, shareOrCopy } from '../core.js';
import { reportSheet } from './settings.js';

const ROLE = { seller: ['🏷️', 'As seller'], buyer: ['🛍️', 'As buyer'], poster: ['🧾', 'As task poster'], helper: ['🏃', 'As helper'] };

function hero(u, { me = false } = {}) {
  const st = u.stats;
  return html`<div class="card profile-hero mt-6">
    <div style="display:inline-block">${avatar(u, 84)}</div>
    <h2 class="mt-10">${u.name}</h2>
    <div class="row gap-6 wrap mt-6" style="justify-content:center"><span class="pill brand">${icon('shieldok')} ${t('Verified · college ID & phone')}</span>${u.isStaff ? html`<span class="pill indigo">${t('Staff')}</span>` : ''}${u.isAdmin ? html`<span class="pill">${t('Moderator')}</span>` : ''}${u.newcomer ? html`<span class="pill mari">🌱 ${t('New member')}</span>` : ''}</div>
    <p class="small muted mt-10">${[u.dept, u.year && (u.year === 'Staff' ? null : `${t('Year')} ${u.year}`), u.residence === 'hostel' ? `${t('Hosteller')}${u.hostel ? ' · ' + u.hostel : ''}` : u.residence === 'day' ? t('Day scholar') : null].filter(Boolean).join(' · ') || t('Details kept private')}</p>
    ${u.bio ? html`<p class="mt-6">${u.bio}</p>` : ''}
    <p class="tiny faint mt-6">${t('Joined')} ${new Date(u.joinedAt).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })} · ${icon('phone', 'ic-sm')} ${u.phoneMasked}</p>
    ${u.status !== 'active' ? html`<div class="banner bad mt-10">${icon('ban')}<div><b>${u.status === 'banned' ? t('Banned') : t('Suspended')}</b></div></div>` : ''}
  </div>
  <div class="card pad mt-10"><div class="row">${trustRing(u.trust, 64)}<div class="grow"><b>${t('Trust score')} ${u.trust}/100</b><p class="tiny faint">${t('Verification, ratings, completed deals, cancellations, response time and strikes.')}</p><button class="link small" id="howtrust">${t('How is this calculated?')}</button></div></div>
    <div class="stat-grid mt-10" style="grid-template-columns:repeat(4,1fr);gap:6px;text-align:center">
      <div><b style="font-size:1.1rem">${st.rating ? st.rating.toFixed(1) + '★' : '—'}</b><div class="tiny faint">${st.reviews} ${t('reviews')}</div></div>
      <div><b style="font-size:1.1rem">${st.completed}</b><div class="tiny faint">${t('deals')}</div></div>
      <div><b style="font-size:1.1rem">${st.cancelRate}%</b><div class="tiny faint">${t('cancel rate')}</div></div>
      <div><b style="font-size:1.1rem">${st.respMins != null ? st.respMins + 'm' : '—'}</b><div class="tiny faint">${t('response')}</div></div></div></div>
  ${u.badges?.length ? html`<div class="section"><h3>${t('Badges')}</h3><div class="badges mt-10" style="justify-content:flex-start">${u.badges.map((b) => html`<span class="bdg">${b.icon} ${t(b.en)}</span>`)}</div></div>` : ''}`;
}

function trustExplain() {
  sheet(html`<h2>${t('How trust score works')}</h2><p class="muted small mt-6">${t('Transparent and the same formula for everyone — it cannot be bought.')}</p>
    <ul class="log mt-16">${[['+30', 'Verified campus member (college ID + phone)'], ['up to +30', 'Average rating from verified deals'], ['up to +20', '+2 for every completed deal'], ['up to +15', 'Low cancellation rate'], ['+5', 'Replies within 30 minutes on average'], ['−15', 'Each strike from a moderator']].map(([a, b]) => html`<li><time><b>${a}</b></time><span>${t(b)}</span></li>`)}</ul>
    <button class="btn block mt-16" data-close>${t('Got it')}</button>`.s);
}

export async function user({ root, params, setTop }) {
  if (params.id === store.me.id) { location.hash = '#/me'; return; }
  const u = await api('/users/' + params.id);
  setTop({ back: true, title: u.name, actions: html`<button class="iconbtn" id="report" aria-label="${t('Report')}">${icon('flag')}</button>` });
  let rf = 'all';
  const reviews = () => { const r = u.reviews.filter((x) => rf === 'all' || x.role === rf); return r.length ? r.map((x) => html`<div class="review"><div class="row">${avatar(x.fromUser, 30, { badge: false })}<div class="grow"><b class="small">${x.fromUser?.name}</b> <span class="tiny faint">· ${t(ROLE[x.role]?.[1] || '')} · ${ago(x.at)}</span><div>${stars(x.stars)}</div></div></div>${x.text ? html`<p class="small mt-6">${x.text}</p>` : ''}${x.tags?.length ? html`<div class="row gap-4 wrap mt-6">${x.tags.map((g) => html`<span class="pill">${g}</span>`)}</div>` : ''}</div>`) : html`<p class="muted small mt-10">${t('No reviews in this role yet.')}</p>`; };
  root.innerHTML = html`${hero(u)}
    <div class="btn-row mt-16"><button class="btn" id="msg">${icon('chat')} ${t('Message')}</button><button class="btn ghost" id="block">${u.blockedByMe ? t('Unblock') : t('Block')}</button></div>
    <div class="section"><h3>${t('History by role')}</h3><div class="stat-grid mt-10">${u.history.map((h) => html`<div class="card stat"><b>${ROLE[h.role][0]} ${h.count}</b><span>${t(ROLE[h.role][1])}</span></div>`)}</div></div>
    <div class="section"><h3>${t('Reviews')} <span class="faint">${u.reviews.length}</span></h3>
      <div class="chips mt-10">${[['all', 'All'], ...Object.entries(ROLE).map(([k, v]) => [k, v[1]])].map(([k, l]) => html`<button class="chip ${rf === k ? 'on' : ''}" data-rf="${k}">${t(l)}</button>`)}</div><div id="rv">${reviews()}</div></div>
    ${u.listings.length ? html`<div class="section"><h3>${t('Items for sale')}</h3><div class="grid2 mt-10">${u.listings.map(listingTile)}</div></div>` : ''}`;
  root.addEventListener('click', async (e) => {
    const f = e.target.closest('[data-rf]'); if (f) { rf = f.dataset.rf; root.querySelectorAll('[data-rf]').forEach((c) => c.classList.toggle('on', c === f)); $('#rv', root).innerHTML = html`${reviews()}`.s; }
    if (e.target.closest('#howtrust')) trustExplain();
    try {
      if (e.target.closest('#msg')) { const th = await api('/threads', { method: 'POST', body: { userId: u.id, refType: 'direct', refId: '-' } }); location.hash = '#/chat/' + th.id; }
      if (e.target.closest('#block')) {
        if (u.blockedByMe) { await api(`/users/${u.id}/block`, { method: 'DELETE' }); u.blockedByMe = false; toast(t('Unblocked')); }
        else if (await confirmSheet({ title: `${t('Block')} ${u.name}?`, body: t('You won\'t see each other\'s posts or be able to chat or deal. They are not notified.'), ok: t('Block'), danger: true })) { await api(`/users/${u.id}/block`, { method: 'POST' }); u.blockedByMe = true; toast(t('Blocked')); }
        e.target.closest('#block').textContent = u.blockedByMe ? t('Unblock') : t('Block');
      }
    } catch (err) { toastErr(err); }
  });
  $('#report').onclick = () => reportSheet('user', u.id, u.name);
}

export async function me({ root, setTop }) {
  await refreshMe();
  const m = store.me;
  setTop({ back: true, title: t('My profile') });
  const u = await api('/users/' + m.id);
  root.innerHTML = html`${hero({ ...u, badges: m.badges })}
    <button class="btn soft block mt-10" id="edit">${icon('edit')} ${t('Edit profile')}</button>
    <div class="section"><h3>${t('Verified details')}</h3><p class="tiny faint">${t('Locked after verification. Contact the admin if something is wrong.')}</p>
      <div class="card list mt-10">${[['College ID', m.collegeId], ['College email', m.email], ['Phone', m.phone], ['Department', m.dept], ['Year', m.year]].map(([k, v]) => html`<div class="li"><span class="grow small muted">${t(k)}</span><b class="small">${v}</b>${icon('lock', 'ic-sm')}</div>`)}</div></div>
    <div class="section"><h3>${t('History by role')}</h3><div class="stat-grid mt-10">${u.history.map((h) => html`<div class="card stat"><b>${ROLE[h.role][0]} ${h.count}</b><span>${t(ROLE[h.role][1])}</span></div>`)}</div></div>
    <div class="card list mt-24">
      ${m.isAdmin ? html`<a class="li" href="#/admin"><span class="ic-box" style="background:var(--ink);color:var(--paper)">${icon('shield')}</span><span class="grow"><b>${t('Admin panel')}</b></span>${icon('chev', 'chev')}</a>` : ''}
      <a class="li" href="#/wallet"><span class="ic-box">${icon('wallet')}</span><span class="grow">${t('Wallet & earnings')}</span><b class="small">₹${m.wallet.balance}</b>${icon('chev', 'chev')}</a>
      <a class="li" href="#/activity"><span class="ic-box">${icon('activity')}</span><span class="grow">${t('My activity')}</span>${icon('chev', 'chev')}</a>
      <a class="li" href="#/community"><span class="ic-box">${icon('trophy')}</span><span class="grow">${t('Community & badges')}</span>${icon('chev', 'chev')}</a>
      <a class="li" href="#/lostfound"><span class="ic-box">${icon('search')}</span><span class="grow">${t('Lost & Found')}</span>${icon('chev', 'chev')}</a>
      <div class="li" id="invite"><span class="ic-box">${icon('gift')}</span><span class="grow">${t('Invite friends')} <span class="tiny faint">· ${t('code')} <b>${m.referralCode}</b></span><div class="tiny faint">${t('You both get a fee-free deal after their first completed deal')}</div></span>${icon('chev', 'chev')}</div>
      <a class="li" href="#/settings"><span class="ic-box">${icon('settings')}</span><span class="grow">${t('Settings, privacy & support')}</span>${icon('chev', 'chev')}</a>
      <div class="li" id="logout"><span class="ic-box" style="color:var(--kum)">${icon('logout')}</span><span class="grow" style="color:var(--kum)">${t('Log out')}</span></div></div>
    ${m.strikesList?.length ? html`<div class="section"><h3>${t('Strikes')} <span class="faint">${m.strikesList.length}/3</span></h3>${m.strikesList.map((s) => html`<div class="banner warn mt-6">${icon('alert')}<div><b>${when(s.at)}</b><p class="small">${s.reason}</p></div></div>`)}</div>` : ''}`;
  root.addEventListener('click', async (e) => {
    if (e.target.closest('#howtrust')) trustExplain();
    if (e.target.closest('#edit')) editProfile();
    if (e.target.closest('#invite')) shareOrCopy(`Join me on CampusLoop — our campus marketplace & helper network. Use my code ${m.referralCode} at sign-up: ${location.origin}`);
    if (e.target.closest('#logout')) { if (await confirmSheet({ title: t('Log out?'), ok: t('Log out') })) { await api('/auth/logout', { method: 'POST' }).catch(() => {}); emit('logout'); } }
  });
}

function editProfile() {
  const m = store.me, C = store.config;
  let avatarData = m.avatar;
  sheet(html`<h2>${t('Edit profile')}</h2>
    <div class="row mt-16"><span id="av">${avatar({ ...m, avatar: avatarData }, 64, { badge: false })}</span><button class="btn ghost sm" id="pic">${icon('camera')} ${t('Change photo')}</button>${avatarData ? html`<button class="btn ghost sm" id="nopic">${t('Remove')}</button>` : ''}</div>
    <label class="f mt-16"><span>${t('Bio')}</span><input class="in" id="bio" maxlength="160" value="${m.bio || ''}"></label>
    <label class="f"><span>${t('Residence')}</span><select class="in" id="res"><option value="hostel" ${m.residence === 'hostel' ? 'selected' : ''}>${t('Hosteller')}</option><option value="day" ${m.residence === 'day' ? 'selected' : ''}>${t('Day scholar')}</option></select></label>
    <label class="f"><span>${t('Hostel block')}</span><select class="in" id="hostel"><option value="">—</option>${C.locations.filter((l) => l.kind === 'hostel' && l.id !== 'hosgate').map((l) => html`<option value="${l.id}" ${m.hostelId === l.id ? 'selected' : ''}>${locName(l.id)}</option>`)}</select></label>
    <label class="f"><span>${t('Emergency contact (private — only used for SOS)')}</span><input class="in" id="emg" value="${m.emergency || ''}" placeholder="+91 …"></label>
    <div class="btn-row mt-16"><button class="btn ghost" data-close>${t('Cancel')}</button><button class="btn" id="save">${t('Save')}</button></div>`.s, {
    onMount(el, close) {
      el.addEventListener('click', async (e) => {
        if (e.target.closest('#pic')) { const img = await pickImage({ max: 320, quality: 0.75 }); if (img) { avatarData = img; el.querySelector('#av').innerHTML = avatar({ ...m, avatar: img }, 64, { badge: false }).s; } }
        if (e.target.closest('#nopic')) { avatarData = null; el.querySelector('#av').innerHTML = avatar({ ...m, avatar: null }, 64, { badge: false }).s; }
        if (e.target.closest('#save')) {
          try { await api('/me', { method: 'PATCH', body: { avatar: avatarData, bio: el.querySelector('#bio').value, residence: el.querySelector('#res').value, hostel: el.querySelector('#hostel').value, emergency: el.querySelector('#emg').value } }); close(); await refreshMe(); toast(t('Profile updated'), 'ok'); dispatchEvent(new HashChangeEvent('hashchange')); } catch (err) { toastErr(err); }
        }
      });
    },
  });
}
