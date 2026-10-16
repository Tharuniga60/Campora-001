import { html, $, icon, store, api, t, ago, avatar, empty, skeleton, statusPill, on, refreshMe } from '../core.js';

const NEXT = {
  accept: 'Accept or decline', respond_pending: 'Approve change', start: 'Start / head out', deliver: 'Mark delivered',
  enter_otp: 'Enter OTP at handover', show_otp: 'Share OTP after receiving', review: 'Rate this deal',
};
export function dealRow(d) {
  const need = d.actions.find((a) => NEXT[a] && !(a === 'enter_otp' && d.status === 'accepted') && !(a === 'show_otp' && d.status === 'accepted'));
  const emoji = { buy: d.role === 'payer' ? '🛍️' : '🏷️', task: '🧾', pickdrop: '📦', group: '🍱' }[d.type];
  return html`<a class="li" href="#/deal/${d.id}"><span class="ic-box" style="font-size:1.15rem">${emoji}</span>
    <div class="grow" style="min-width:0"><b class="small ellip" style="display:block">${d.title}</b>
      <div class="tiny faint ellip">${d.role === 'payer' ? (d.type === 'buy' ? t('from') : t('helper')) : d.type === 'buy' ? t('to') : t('for')} ${d.counterpart?.name} · ${ago(d.timeline.at(-1).at)}</div>
      ${need ? html`<span class="pill mari mt-6" style="margin-top:4px">${icon('bolt')} ${t(NEXT[need])}</span>` : ''}</div>
    <div class="col gap-4" style="align-items:flex-end"><b class="num">${d.role === 'payer' ? '−' : '+'}₹${d.role === 'payer' ? d.total : d.amount}</b>${statusPill(d.status)}</div></a>`;
}

export async function list({ root }) {
  let tab = 'active';
  await refreshMe();
  const me = store.me;
  root.innerHTML = html`<h1 class="mt-6">${t('My activity')}</h1>
    <div class="stat-grid mt-16">
      <a class="card stat hi" href="#/wallet"><b class="num">₹${me.wallet.balance}</b><span>${t('Wallet balance')} →</span></a>
      <a class="card stat" href="#/wallet"><b class="num">₹${me.wallet.escrow}</b><span>🔒 ${t('In escrow')}</span></a>
      <div class="card stat"><b class="num">₹${me.wallet.earned}</b><span>${t('Earned on campus')}</span></div>
      <div class="card stat"><b>${me.stats.completed}</b><span>${t('Completed deals')}</span></div></div>
    <div class="tabs mt-16">${[['active', 'Active'], ['done', 'History'], ['posts', 'My posts']].map(([k, l]) => html`<button data-tab="${k}" class="${tab === k ? 'on' : ''}">${t(l)}</button>`)}</div>
    <div id="list">${skeleton(4)}</div>
    <div class="card list mt-24">
      <a class="li" href="#/wallet"><span class="ic-box">${icon('wallet')}</span><span class="grow">${t('Wallet & earnings')}</span>${icon('chev', 'chev')}</a>
      <a class="li" href="#/market?tab=wish"><span class="ic-box">${icon('heart')}</span><span class="grow">${t('Wishlist')}</span>${icon('chev', 'chev')}</a>
      <a class="li" href="#/settings/reports"><span class="ic-box">${icon('flag')}</span><span class="grow">${t('My reports & disputes')}</span>${icon('chev', 'chev')}</a>
      <a class="li" href="#/community"><span class="ic-box">${icon('trophy')}</span><span class="grow">${t('Badges & community impact')}</span>${icon('chev', 'chev')}</a></div>`;
  async function load() {
    if (tab === 'posts') {
      const [ls, ts] = await Promise.all([api('/listings?mine=1'), api('/tasks?mine=1')]);
      $('#list', root).innerHTML = ls.length || ts.length ? html`<div class="card list">${[...ls.map((l) => html`<a class="li" href="#/listing/${l.id}"><span class="ic-box">🏷️</span><span class="grow"><b class="small">${l.title}</b><div class="tiny faint">₹${l.price} · ${ago(l.createdAt)}</div></span><span class="pill ${l.status === 'active' ? 'brand' : ''}">${t(l.status)}</span></a>`), ...ts.map((x) => html`<a class="li" href="#/task/${x.id}"><span class="ic-box">${{ task: '🧾', pickdrop: '📦', group: '🍱' }[x.kind]}</span><span class="grow"><b class="small">${x.title}</b><div class="tiny faint">₹${x.reward} · ${x.offerCount} ${t('offers')}</div></span><span class="pill ${x.status === 'open' ? 'brand' : ''}">${t(x.status)}</span></a>`)]}</div>`
        : empty('📝', t('No posts yet'), t('Sell something or post a task to get started.'));
      return;
    }
    const ds = await api('/deals?state=' + tab);
    $('#list', root).innerHTML = ds.length ? html`<div class="card list">${ds.map(dealRow)}</div>` : tab === 'active' ? empty('🤝', t('No active deals'), t('Offers, accepted deals and deliveries in progress show up here.'), html`<a class="btn soft" href="#/home">${t('Explore the feed')}</a>`) : empty('📜', t('No history yet'), t('Completed and cancelled deals — with receipts — appear here.'));
  }
  root.addEventListener('click', (e) => { const b = e.target.closest('[data-tab]'); if (b) { tab = b.dataset.tab; root.querySelectorAll('[data-tab]').forEach((x) => x.classList.toggle('on', x === b)); load(); } });
  await load();
  return on('deal', load);
}
