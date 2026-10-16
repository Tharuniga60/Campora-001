import { html, $, icon, store, api, t, rupee, ago, when, listingTile, empty, skeleton, avatar, trustRing, stars, cat, catName, cond, locName, loc, breakdownBox, calcFee, sheet, formSheet, confirmSheet, toast, toastErr, pickImage, campusMap, statusPill, refreshMe, shareOrCopy, banner } from '../core.js';
import { reportSheet } from './settings.js';

export async function list({ root, query }) {
  const C = store.config;
  let st = { cat: query.cat || '', sort: 'fair', tab: query.tab || 'browse' };
  root.innerHTML = html`<div class="row between mt-6"><h1>${t('Marketplace')}</h1><a class="btn sm" href="#/sell">${icon('plus')} ${t('Sell')}</a></div>
    <p class="muted small mt-6">${t('Reuse what campus already owns. Every item has photo proof; every payment sits in escrow until handover.')}</p>
    <div class="tabs mt-10" id="tabs">${[['browse', 'Browse'], ['mine', 'My listings'], ['wish', 'Wishlist']].map(([k, l]) => html`<button data-tab="${k}" class="${st.tab === k ? 'on' : ''}">${t(l)}</button>`)}</div>
    <div id="filters"></div><div id="grid">${skeleton(3)}</div>`;
  async function load() {
    $('#filters', root).innerHTML = st.tab === 'browse' ? html`<div class="chips">${[{ id: '', icon: '✨', en: 'All', ta: 'அனைத்தும்' }, ...C.categories].map((c) => html`<button class="chip ${st.cat === c.id ? 'on' : ''}" data-cat="${c.id}">${c.icon} ${catName(c)}</button>`)}</div>
      <div class="row between mt-6 mb"><span class="tiny faint">${t('Sorted fairly by default — no paid boosting')}</span><select class="in" id="sort" style="height:36px;width:auto;font-size:.85rem">${[['fair', 'Fair mix'], ['new', 'Newest'], ['price', 'Lowest price']].map(([k, l]) => html`<option value="${k}" ${st.sort === k ? 'selected' : ''}>${t(l)}</option>`)}</select></div>` : '';
    const qs = st.tab === 'mine' ? 'mine=1' : st.tab === 'wish' ? 'wish=1' : `cat=${st.cat}&sort=${st.sort}`;
    const items = await api('/listings?' + qs);
    $('#grid', root).innerHTML = items.length ? html`<div class="grid2 mt-10">${items.map(listingTile)}</div>`
      : st.tab === 'mine' ? empty('🏷️', t('You haven\'t listed anything'), t('Turn unused books, gadgets and gear into money for someone else\'s semester.'), html`<a class="btn" href="#/sell">${t('Sell an item')}</a>`)
        : st.tab === 'wish' ? empty('🤍', t('Wishlist is empty'), t('Tap the heart on any item — we\'ll notify you when its price drops.'))
          : empty('🔎', t('No items in this category yet'), t('Check back soon, or post a task asking for it.'));
  }
  root.addEventListener('click', (e) => {
    const c = e.target.closest('[data-cat]'); if (c) { st.cat = c.dataset.cat; load(); }
    const tb = e.target.closest('[data-tab]'); if (tb) { st.tab = tb.dataset.tab; root.querySelectorAll('#tabs button').forEach((b) => b.classList.toggle('on', b === tb)); load(); }
  });
  root.addEventListener('change', (e) => { if (e.target.id === 'sort') { st.sort = e.target.value; load(); } });
  await load();
}

export async function detail({ root, params, setTop }) {
  const l = await api('/listings/' + params.id);
  const c = cat(l.category), s = l.seller, me = store.me;
  setTop({ back: true, title: '', actions: html`<button class="iconbtn" id="share" aria-label="${t('Share')}">${icon('send')}</button>${!l.mine ? html`<button class="iconbtn" id="report" aria-label="${t('Report')}">${icon('flag')}</button>` : ''}` });
  const fair = l.fair;
  const pos = fair ? Math.max(2, Math.min(98, ((l.price - fair.low * 0.6) / (fair.high * 1.6 - fair.low * 0.6)) * 100)) : 0;
  const verdict = !fair ? null : l.price <= fair.high ? ['good', 'Fair price', `Within the usual range for similar items on campus (₹${fair.low}–₹${fair.high}).`] : l.price <= fair.high * 1.4 ? ['warn', 'A bit above usual', `Similar items usually go for ₹${fair.low}–₹${fair.high}. You can make an offer.`] : ['bad', 'Priced high', `Most similar items sell for ₹${fair.low}–₹${fair.high}. Consider making an offer.`];
  root.innerHTML = html`
    <div class="gallery">${l.photos.map((p) => html`<img src="${p}" alt="${l.title}">`)}</div>
    ${l.photos.length > 1 ? html`<p class="tiny faint center mt-6">${l.photos.length} ${t('photos · swipe')}</p>` : ''}
    ${l.status !== 'active' ? html`<div class="mt-10">${banner(l.status === 'removed' ? 'bad' : 'warn', 'info', l.status === 'removed' ? `${t('Removed')}: ${l.removedReason || ''}` : l.status === 'sold' ? t('This item has been sold') : t('Reserved in an active deal'))}</div>` : ''}
    ${l.priceReview ? html`<div class="mt-10">${banner('warn', 'alert', t('Price under review'), t('Our automatic checks flagged this price as unusual. An admin is reviewing it.'))}</div>` : ''}
    <div class="mt-16"><div class="row between"><span class="price-big num ${l.free ? 'free' : ''}">${rupee(l.price)}</span><button class="iconbtn" data-wish="${l.id}" style="${l.wish ? 'color:var(--kum)' : ''}" aria-label="${t('Wishlist')}">${icon('heart')}</button></div>
      <h2 class="mt-6">${l.title}</h2>
      <div class="row gap-6 wrap mt-10"><span class="pill">${c.icon} ${catName(c)}</span><span class="pill indigo">${cond(l.condition)}</span><span class="pill">${icon('eye')} ${l.views}</span><span class="pill">${icon('clock')} ${ago(l.createdAt)}</span></div>
      ${c.freeOnly ? html`<p class="tiny faint mt-10">📚 ${t('Books & notes on CampusLoop are always free — second-hand books can’t be sold as per government rules.')}</p>` : ''}</div>
    ${fair ? html`<div class="card pad mt-16"><div class="row between"><h4>${icon('sparkle', 'ic-sm')} ${t('AI price check')}</h4><span class="pill ${verdict[0] === 'good' ? 'ok' : verdict[0] === 'warn' ? 'mari' : 'kum'}">${t(verdict[1])}</span></div>
      <div class="fair-meter"><i style="left:${pos}%"></i></div><div class="row between tiny faint"><span>${t('Bargain')}</span><span>${t('Fair')}</span><span>${t('High')}</span></div>
      <p class="small muted mt-6">${verdict[2]} <span class="faint">${t('Based on')} ${fair.basis}.</span></p></div>` : ''}
    <div class="card pad mt-16"><div class="row">${avatar(s, 48)}<div class="grow"><a href="#/user/${s.id}"><b>${s.name}</b></a><div class="small muted">${[s.dept, s.year && (s.year === 'Staff' ? t('Staff') : `${t('Year')} ${s.year}`), s.residence === 'hostel' ? t('Hosteller') : s.residence === 'day' ? t('Day scholar') : null].filter(Boolean).join(' · ')}</div>
      <div class="small mt-6">${s.stats.rating ? html`${stars(s.stats.rating)} <b>${s.stats.rating.toFixed(1)}</b> <span class="faint">(${s.stats.reviews})</span>` : html`<span class="pill mari">🌱 ${t('New member')}</span>`}</div></div>${trustRing(s.trust)}</div>
      <div class="row between small mt-10 faint"><span>${s.stats.completed} ${t('completed')}</span><span>${s.stats.cancelRate}% ${t('cancel rate')}</span><span>${s.stats.respMins != null ? `~${s.stats.respMins} ${t('min reply')}` : t('—')}</span></div>
      ${!l.mine ? html`<button class="btn xs ghost mt-10" id="reportVendor">${icon('flag', 'ic-sm')} ${t('Report vendor')}</button>` : ''}</div>
    <div class="section"><h3>${t('Description')}</h3><p class="mt-6" style="white-space:pre-wrap">${l.desc || t('No description.')}</p></div>
    <div class="section"><div class="section-h"><h3>${t('Safe meeting point')}</h3><span class="pill ok">${icon('shieldok')} ${t('CCTV & well-lit')}</span></div>
      <p class="small muted">${icon('pin', 'ic-sm')} ${locName(l.meetPoint)} — ${t('handover happens here with a delivery OTP. Never share your room number.')}</p>
      <div class="mt-10">${campusMap({ highlight: [l.meetPoint], height: 220 })}</div></div>
    ${l.priceHistory?.length > 1 ? html`<div class="section"><h3>${t('Price history')}</h3><ul class="log mt-6">${l.priceHistory.slice().reverse().map((p) => html`<li><time>${when(p.at)}</time><span>₹${p.price}</span></li>`)}</ul></div>` : ''}
    ${l.mine && l.offers?.length ? html`<div class="section"><h3>${t('Offers')} <span class="faint">${l.offers.length}</span></h3><p class="tiny faint">${t('Shown in the order they arrived. You choose — accepting reserves the item and closes other offers with a refund.')}</p>
      <div class="card list mt-10">${l.offers.map((o, i) => html`<a class="li" href="#/deal/${o.id}"><span class="faint tiny">#${i + 1}</span>${avatar(o.buyer, 36)}<div class="grow"><b class="small">${o.buyer.name}</b><div class="tiny faint">${o.note || ago(o.at)}</div></div><div class="col gap-4" style="align-items:flex-end"><b>₹${o.amount}</b>${statusPill(o.status)}</div></a>`)}</div></div>` : ''}
    <p class="tiny faint center mt-24">${t('Listed')} ${when(l.createdAt)} · ${t('Prohibited items are removed with a reason.')}</p>`;

  // sticky CTA
  const cta = document.createElement('div');
  cta.className = 'sticky-cta';
  if (l.mine) {
    cta.innerHTML = html`<button class="btn ghost" id="remove">${icon('trash')}</button><a class="btn ghost grow" href="#/listing/${l.id}/edit">${icon('edit')} ${t('Edit')}</a>${l.offerCount ? html`<span class="pill mari">${l.offerCount} ${t('pending')}</span>` : ''}`;
  } else if (l.myDeal) {
    cta.innerHTML = html`<a class="btn block" href="#/deal/${l.myDeal}">${t('View your deal')} ${icon('chev')}</a>`;
  } else if (l.status === 'active') {
    cta.innerHTML = html`<button class="btn ghost" id="chat" aria-label="${t('Chat')}">${icon('chat')}</button>${l.free ? '' : html`<button class="btn soft grow" id="offer">${t('Make offer')}</button>`}<button class="btn grow" id="buy">${l.free ? t('Request item') : t('Buy now')}</button>`;
  }
  if (cta.innerHTML) { root.append(cta); document.body.classList.add('has-cta'); }

  async function buyFlow(amount, title) {
    const br = { amount, fee: calcFee(amount), total: amount + calcFee(amount), feeWaived: store.me.feeWaivers > 0 && amount > 0 };
    if (br.feeWaived) br.total = amount;
    await refreshMe();
    const bal = store.me.wallet.balance, short = br.total - bal;
    sheet(html`<h2>${title}</h2><p class="muted small mt-6">${l.title}</p>
      <div class="mt-16">${breakdownBox(br)}</div>
      <div class="secure mt-10">${icon('lock')}<span>${t('Your money is held in escrow. The seller gets paid only after you confirm the handover with your OTP. Declined or expired offers are refunded automatically.')}</span></div>
      <label class="f mt-16"><span>${t('Message to seller (optional)')}</span><input class="in" id="note" placeholder="${t('e.g. Can we meet at 4 PM?')}"></label>
      <div class="row between small"><span class="muted">${t('Wallet balance')}</span><b>₹${bal}</b></div>
      ${short > 0 ? html`<div class="banner warn mt-10">${icon('wallet')}<div><b>${t('Add')} ₹${short} ${t('to continue')}</b><p class="small">${t('Top up instantly via UPI.')}</p></div></div><button class="btn mari block mt-10" id="topup">${t('Top up')} ₹${Math.max(short, 50)} ${t('via UPI')}</button>` : html`<button class="btn block mt-16" id="pay">${amount ? `${t('Confirm & hold')} ₹${br.total}` : t('Send request')}</button>`}
      <p class="tiny faint center mt-10">${t('Nothing is final until the seller accepts.')}</p>`.s, {
      onMount(el, close) {
        el.querySelector('#topup')?.addEventListener('click', async () => { const { topupSheet } = await import('./wallet.js'); close(); topupSheet(Math.max(short, 50), () => buyFlow(amount, title)); });
        el.querySelector('#pay')?.addEventListener('click', async (e) => {
          e.target.disabled = true;
          try { const d = await api(`/listings/${l.id}/offer`, { method: 'POST', body: { amount, note: el.querySelector('#note').value } }); close(); toast(t('Offer sent — money held safely in escrow'), 'ok'); location.hash = '#/deal/' + d.id; } catch (err) { e.target.disabled = false; toastErr(err); }
        });
      },
    });
  }
  root.addEventListener('click', async (e) => {
    if (e.target.closest('#buy')) buyFlow(l.price, l.free ? t('Request this free item') : t('Buy now'));
    if (e.target.closest('#offer')) {
      const min = Math.ceil(l.price * 0.5);
      const v = await formSheet({ title: t('Make an offer'), intro: `${t('Offers between')} ₹${min} ${t('and')} ₹${l.price}. ${fair ? `${t('Fair range')}: ₹${fair.low}–₹${fair.high}.` : ''}`, fields: [{ name: 'amount', label: t('Your offer'), type: 'number', prefix: '₹', value: fair ? Math.min(l.price, Math.max(min, fair.suggested)) : l.price, inputmode: 'numeric', required: true }], ok: t('Continue') });
      if (v) { const a = Math.round(+v.amount); if (a < min || a > l.price) return toast(`${t('Offer must be between')} ₹${min} – ₹${l.price}`, 'err'); buyFlow(a, `${t('Offer')} ₹${a}`); }
    }
    if (e.target.closest('#chat')) { try { const th = await api('/threads', { method: 'POST', body: { userId: s.id, refType: 'listing', refId: l.id } }); location.hash = '#/chat/' + th.id; } catch (err) { toastErr(err); } }
    if (e.target.closest('#remove')) { if (await confirmSheet({ title: t('Remove this listing?'), body: t('Pending offers will be closed and buyers refunded.'), ok: t('Remove'), danger: true })) { try { await api('/listings/' + l.id, { method: 'DELETE' }); toast(t('Listing removed')); location.hash = '#/market?tab=mine'; } catch (err) { toastErr(err); } } }
    if (e.target.closest('#report') || e.target.closest('#reportVendor')) reportSheet('listing', l.id, l.title);
    if (e.target.closest('#share')) shareOrCopy(`${l.title} — ${rupee(l.price)} on CampusLoop: ${location.href}`);
  });
}

export async function sell({ root, params, query, setTop }) {
  const C = store.config, s = store.config.settings;
  const editing = params.id ? await api('/listings/' + params.id) : null;
  setTop({ back: true, title: editing ? t('Edit listing') : query.free ? t('Give away for free') : t('Sell an item') });
  const st = editing ? { photos: [...editing.photos], free: editing.free, title: editing.title, desc: editing.desc, category: editing.category, condition: editing.condition, price: editing.price, meetPoint: editing.meetPoint }
    : { photos: [], free: !!query.free, category: '', condition: 'good', price: '', meetPoint: 'library', title: '', desc: '' };
  function render() {
    const freeOnly = !!cat(st.category).freeOnly;
    if (freeOnly) { st.free = true; st.price = 0; }
    const fee = calcFee(+st.price || 0);
    root.innerHTML = html`<form id="f">
      <div class="f"><span class="small muted" style="font-weight:700">${t('Photos')} <span class="faint">(${t('required · up to 4 · compressed for low data')})</span></span>
        <div class="photos mt-6">${st.photos.map((p, i) => html`<div class="photo-slot"><img src="${p}" alt=""><button type="button" class="x" data-rm="${i}" aria-label="${t('Remove')}">×</button></div>`)}${st.photos.length < 4 ? html`<button type="button" class="photo-slot" id="add">${icon('camera')}</button>` : ''}</div></div>
      <label class="f"><span>${t('Title')}</span><input class="in" name="title" required maxlength="70" value="${st.title}" placeholder="${t('e.g. Casio fx-991ES calculator')}"></label>
      <div class="row gap-16"><label class="f grow"><span>${t('Category')}</span><select class="in" name="category" required><option value="">${t('Choose…')}</option>${C.categories.map((c) => html`<option value="${c.id}" ${st.category === c.id ? 'selected' : ''}>${c.icon} ${catName(c)}</option>`)}</select></label>
      <label class="f grow"><span>${t('Condition')}</span><select class="in" name="condition">${C.conditions.map((c) => html`<option value="${c.id}" ${st.condition === c.id ? 'selected' : ''}>${cond(c.id)}</option>`)}</select></label></div>
      <div class="card pad-sm mb"><label class="row between" style="cursor:pointer"><span><b>🎁 ${t('Give it away for free')}</b><br><span class="tiny faint">${t('No fees. Earns you the Giver badge.')}</span></span><span class="switch"><input type="checkbox" id="free" ${st.free ? 'checked' : ''} ${freeOnly ? 'disabled' : ''}><span></span></span></label>
        ${freeOnly ? html`<p class="tiny mt-6" style="color:var(--brand)">📚 ${t('As per government rules, second-hand books can’t be sold — books & notes can only be given away for free.')}</p>` : ''}</div>
      ${st.free ? '' : html`<label class="f mt-16"><span>${t('Price')} <span class="faint">(${t('max')} ₹${s.maxItemPrice})</span></span><div class="row"><div class="prefix grow"><b>₹</b><input class="in" name="price" inputmode="numeric" type="number" min="1" max="${s.maxItemPrice}" required value="${st.price}"></div><button type="button" class="btn soft" id="suggest">${icon('sparkle')} ${t('Suggest')}</button></div>
        <div id="sug"></div>
        ${+st.price ? html`<div class="hint">${t('Buyer pays')} ₹${+st.price + fee} (${t('incl.')} ₹${fee} ${t('platform fee')}). ${t('You receive')} <b>₹${st.price}</b>.</div>` : ''}</label>`}
      <label class="f mt-16"><span>${t('Description')}</span><textarea class="in" name="desc" maxlength="600" placeholder="${t('Condition details, what\'s included, why you\'re selling…')}">${st.desc}</textarea></label>
      <label class="f"><span>${t('Handover point')} <span class="faint">(${t('approved public spots only')})</span></span><select class="in" name="meetPoint">${C.locations.filter((l) => l.safe).map((l) => html`<option value="${l.id}" ${st.meetPoint === l.id ? 'selected' : ''}>${locName(l.id)}</option>`)}</select></label>
      <div id="err"></div>
      <details class="card pad-sm mt-10"><summary class="small" style="cursor:pointer;font-weight:700">${icon('ban', 'ic-sm')} ${t('Not allowed on CampusLoop')}</summary><ul class="small muted" style="margin:8px 0 0;padding-left:18px">${C.prohibited.map((p) => html`<li>${t(p)}</li>`)}</ul></details>
      <button class="btn block mt-16" id="submit">${editing ? t('Save changes') : st.free ? t('Post free item') : t('Post listing')}</button></form>`;
  }
  const sync = () => { const f = $('#f', root); if (!f) return; const v = Object.fromEntries(new FormData(f)); Object.assign(st, v); };
  root.addEventListener('click', async (e) => {
    if (e.target.closest('#add')) { sync(); const img = await pickImage({ capture: false }); if (img) { st.photos.push(img); render(); } }
    const rm = e.target.closest('[data-rm]'); if (rm) { sync(); st.photos.splice(+rm.dataset.rm, 1); render(); }
    if (e.target.closest('#suggest')) {
      sync();
      if (!st.category) return toast(t('Pick a category first'), 'err');
      const r = await api(`/price-suggest?title=${encodeURIComponent(st.title)}&category=${st.category}&condition=${st.condition}`);
      $('#sug', root).innerHTML = html`<div class="banner info mt-10">${icon('sparkle')}<div><b>${t('Suggested')} ₹${r.suggested}</b> <span class="small">(${t('range')} ₹${r.low}–₹${r.high})</span><p class="small">${t('Sells fast at')} ₹${r.quickSale}. ${t('Based on')} ${r.basis}.</p><div class="row gap-6 mt-6"><button type="button" class="btn xs" data-use="${r.suggested}">${t('Use')} ₹${r.suggested}</button><button type="button" class="btn xs ghost" data-use="${r.quickSale}">${t('Quick sale')} ₹${r.quickSale}</button></div></div></div>`;
    }
    const u = e.target.closest('[data-use]'); if (u) { sync(); st.price = u.dataset.use; render(); }
  });
  root.addEventListener('change', (e) => {
    if (e.target.id === 'free') { sync(); st.free = e.target.checked; render(); }
    if (e.target.name === 'category') { const wasFreeOnly = cat(st.category).freeOnly; sync(); if (wasFreeOnly && !cat(st.category).freeOnly) st.free = false; render(); }
  });
  root.addEventListener('input', (e) => { if (e.target.name === 'price') { const h = e.target.closest('label').querySelector('.hint'); const p = +e.target.value; if (p) { const fee = calcFee(p); const txt = `${t('Buyer pays')} ₹${p + fee} (${t('incl.')} ₹${fee} ${t('platform fee')}). ${t('You receive')} ₹${p}.`; if (h) h.textContent = txt; else e.target.closest('label').insertAdjacentHTML('beforeend', `<div class="hint">${txt}</div>`); } } });
  root.addEventListener('submit', async (e) => {
    e.preventDefault(); sync();
    const btn = $('#submit', root); btn.disabled = true; $('#err', root).innerHTML = '';
    try {
      const body = { title: st.title, desc: st.desc, category: st.category, condition: st.condition, price: st.free ? 0 : +st.price, free: st.free, photos: st.photos, meetPoint: st.meetPoint };
      const l = editing ? await api('/listings/' + editing.id, { method: 'PATCH', body }) : await api('/listings', { method: 'POST', body });
      toast(editing ? t('Saved') : t('Listed! Buyers can now see it.'), 'ok');
      location.hash = '#/listing/' + l.id;
    } catch (err) {
      btn.disabled = false;
      $('#err', root).innerHTML = banner(err.data?.rule === 'prohibited' ? 'bad' : 'warn', err.data?.rule === 'prohibited' ? 'ban' : 'alert', err.message, err.data?.rule === 'duplicate' ? html`<a class="link" href="#/listing/${err.data.id}">${t('Open existing listing')}</a>` : '').s;
      $('#err', root).scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  });
  render();
}
