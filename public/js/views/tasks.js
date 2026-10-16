import { html, $, icon, store, api, t, ago, when, until, taskCard, empty, skeleton, avatar, trustRing, stars, who, locName, loc, breakdownBox, calcFee, sheet, formSheet, confirmSheet, toast, toastErr, campusMap, refreshMe, banner, on, pickImage } from '../core.js';
import { reportSheet } from './settings.js';

const KIND = { task: ['🧾', 'Task'], pickdrop: ['📦', 'Pick & Drop'], group: ['🍱', 'Group run'] };

export async function list({ root, query }) {
  const s = store.config.settings;
  const st = { tab: query.tab || 'open', kind: query.kind || '' };
  root.innerHTML = html`<div class="row between mt-6"><h1>${t('Tasks & Pick-Drop')}</h1><a class="btn sm" href="#/post/task">${icon('plus')} ${t('Post')}</a></div>
    <p class="muted small mt-6">${t('Small jobs for small, clearly stated rewards. Rewards are locked in escrow before helpers start.')}</p>
    <div class="tabs mt-10">${[['open', 'Open board'], ['mine', 'My posts'], ['helping', "I'm helping"]].map(([k, l]) => html`<button data-tab="${k}" class="${st.tab === k ? 'on' : ''}">${t(l)}</button>`)}</div>
    <div class="chips">${[['', '✨', 'All'], ['task', '🧾', 'Tasks'], ['pickdrop', '📦', 'Pick & Drop'], ['group', '🍱', 'Group runs']].map(([k, e, l]) => html`<button class="chip ${st.kind === k ? 'on' : ''}" data-kind="${k}">${e} ${t(l)}</button>`)}</div>
    <div class="banner info mt-6">${icon('users')}<div><b>${t('Fair share for helpers')}</b><p class="small">${t('Each helper can hold at most')} ${s.helperActiveCap} ${t('active jobs, and urgent posts are capped at')} ${s.urgentPerDay}/${t('person/day')}.</p></div></div>
    <div id="list" class="mt-16">${skeleton(4)}</div>`;
  async function load() {
    const qs = (st.tab === 'mine' ? 'mine=1' : st.tab === 'helping' ? 'helping=1' : '') + (st.kind ? '&kind=' + st.kind : '');
    const items = await api('/tasks?' + qs);
    $('#list', root).innerHTML = items.length ? html`<div class="col">${items.map((x) => st.tab === 'open' ? taskCard(x) : html`<div style="position:relative">${taskCard(x)}<span class="pill ${x.status === 'open' ? 'brand' : x.status === 'done' ? 'ok' : ''}" style="position:absolute;right:12px;bottom:10px">${t(x.status)}</span></div>`)}</div>`
      : st.tab === 'open' ? empty('🙌', t('No open tasks right now'), t('Need something done? Post it — helpers nearby get notified.'), html`<a class="btn" href="#/post/task">${t('Post a task')}</a>`)
        : empty('🗒️', t('Nothing here yet'), st.tab === 'mine' ? t('Tasks you post will appear here.') : t('Tasks you offer to help with will appear here.'));
  }
  root.addEventListener('click', (e) => {
    const tb = e.target.closest('[data-tab]'); if (tb) { st.tab = tb.dataset.tab; root.querySelectorAll('[data-tab]').forEach((b) => b.classList.toggle('on', b === tb)); load(); }
    const k = e.target.closest('[data-kind]'); if (k) { st.kind = k.dataset.kind; root.querySelectorAll('[data-kind]').forEach((b) => b.classList.toggle('on', b === k)); load(); }
  });
  await load();
  return on('feed', load);
}

export async function detail({ root, params, setTop }) {
  let tk;
  async function load() {
    tk = await api('/tasks/' + params.id);
    render();
  }
  function render() {
    const me = store.me, [emoji, kname] = KIND[tk.kind], mine = tk.mine;
    setTop({ back: true, title: t(kname), actions: !mine ? html`<button class="iconbtn" id="report" aria-label="${t('Report')}">${icon('flag')}</button>` : '' });
    const statusBanner = {
      assigned: ['info', 'check', t('Assigned to a helper'), t('This task is in progress.')],
      expired: ['warn', 'clock', t('Expired'), t('No helper accepted before the deadline. Reward refunded.')],
      cancelled: ['warn', 'x', t('Cancelled'), t('The reward was refunded to the poster.')],
      done: ['good', 'check', t('Completed'), t('Helper was paid after confirmation.')],
      removed: ['bad', 'ban', t('Removed by moderator'), tk.removedReason || ''],
    }[tk.status];
    root.innerHTML = html`
      <div class="row gap-6 wrap mt-6"><span class="pill ${tk.kind === 'pickdrop' ? 'mari' : tk.kind === 'group' ? 'ok' : 'indigo'}">${emoji} ${t(kname)}</span>${tk.urgent ? html`<span class="pill kum">${icon('bolt')} ${t('Urgent')}</span>` : ''}${tk.secured ? html`<span class="pill brand">${icon('lock')} ${t('Reward secured in escrow')}</span>` : ''}</div>
      <h1 class="mt-10" style="font-size:1.5rem">${tk.title}</h1>
      ${statusBanner ? html`<div class="mt-10">${banner(...statusBanner)}</div>` : ''}
      <div class="stat-grid mt-16">
        <div class="card stat hi"><b class="num">₹${tk.reward}</b><span>${tk.kind === 'group' ? t('carry charge per order') : t('reward for helper')}</span></div>
        <div class="card stat"><b style="font-size:1.1rem">${tk.status === 'open' ? until(tk.deadline) : t({ assigned: 'In progress', done: 'Completed', expired: 'Expired', cancelled: 'Cancelled', removed: 'Removed' }[tk.status] || tk.status)}</b><span>${t('Deadline')} ${when(tk.deadline)}</span></div></div>
      ${tk.pickup ? html`<div class="section"><div class="section-h"><h3>${t('Route')}</h3><span class="pill">${tk.distance} m${tk.size ? ' · ' + t(tk.size) : ''}</span></div>
        <div class="route" style="font-size:.95rem"><i></i>${locName(tk.pickup)}<span class="dash"></span><i class="to"></i>${locName(tk.drop)}</div>
        <div class="mt-10">${campusMap({ from: tk.pickup, to: tk.drop, height: 260 })}</div></div>`
        : tk.location ? html`<div class="section"><h3>${t('Where')}</h3><p class="muted mt-6">${icon('pin', 'ic-sm')} ${locName(tk.location)}${tk.drop ? html` → ${locName(tk.drop)}` : ''}</p></div>` : ''}
      ${tk.desc ? html`<div class="section"><h3>${t('Details')}</h3><p class="mt-6" style="white-space:pre-wrap">${tk.desc}</p></div>` : ''}
      ${tk.kind === 'group' ? html`<div class="section"><div class="section-h"><h3>${t('Orders')}</h3><b>${tk.joined}/${tk.capacity}</b></div><div style="height:10px;border-radius:5px;background:var(--paper-2);overflow:hidden"><div style="height:100%;width:${(tk.joined / tk.capacity) * 100}%;background:var(--ok)"></div></div>
        ${tk.joins ? html`<div class="card list mt-10">${tk.joins.map((j) => html`<a class="li" href="#/deal/${j.id}">${avatar(j.user, 32)}<div class="grow"><b class="small">${j.user.name}</b><div class="tiny faint">${j.note}</div></div><span class="pill">${t(j.status)}</span></a>`)}</div>` : ''}</div>` : ''}
      <div class="section"><h3>${t('Posted by')}</h3><div class="card pad mt-10 row">${who(tk.poster)}<span class="grow"></span>${trustRing(tk.poster.trust, 40)}</div></div>
      ${mine && tk.offers ? html`<div class="section"><div class="section-h"><h3>${t('Helper offers')} <span class="faint">${tk.offers.length}</span></h3><span class="tiny faint">${tk.assignMode === 'first' ? t('First come, first served') : t('You choose')}</span></div>
        <p class="tiny faint">${t('All offers are shown in the order received — never hidden. “Fair pick” suggests the helper with the fewest recent jobs among good ratings.')}</p>
        ${tk.offers.length ? html`<div class="col mt-10">${tk.offers.map((o) => html`<div class="card pad-sm ${o.fairPick ? '' : ''}" style="${o.fairPick ? 'border-color:var(--brand)' : ''}">
          <div class="row"><span class="tiny faint">#${o.order}</span>${who(o.helper)}<span class="grow"></span>${trustRing(o.helper.trust, 36)}</div>
          ${o.note ? html`<p class="small mt-6">“${o.note}”${o.eta ? html` <span class="faint">· ETA ${o.eta}</span>` : ''}</p>` : ''}
          <div class="row between mt-10"><div class="row gap-6 wrap">${o.fairPick ? html`<span class="pill brand">${icon('sparkle')} ${t('Fair pick')}</span>` : ''}<span class="pill">${o.jobs7} ${t('jobs this week')}</span>${o.helper.newcomer ? html`<span class="pill mari">🌱 ${t('New helper')}</span>` : ''}${o.atCap ? html`<span class="pill kum">${t('At job cap')}</span>` : ''}</div>
            ${tk.status === 'open' ? html`<button class="btn sm" data-assign="${o.helper.id}" data-name="${o.helper.name}" ${o.atCap ? 'disabled' : ''}>${t('Choose')}</button>` : ''}</div></div>`)}</div>` : html`<p class="muted small mt-10">${t('No offers yet. Helpers nearby can see your task now.')}</p>`}</div>` : ''}
      <p class="tiny faint center mt-24">${t('Posted')} ${ago(tk.createdAt)} · ${t('Auto-expires at the deadline if not accepted, with a full refund.')}</p>`;
    // CTA
    document.querySelector('.sticky-cta')?.remove();
    const cta = document.createElement('div'); cta.className = 'sticky-cta';
    if (tk.myDeal) cta.innerHTML = html`<a class="btn block" href="#/deal/${tk.myDeal}">${t('Open deal')} ${icon('chev')}</a>`;
    else if (mine && tk.status === 'open') cta.innerHTML = html`<button class="btn danger-ghost block" id="cancelTask">${t('Cancel task & refund')}</button>`;
    else if (!mine && tk.status === 'open' && tk.kind === 'group') cta.innerHTML = html`<button class="btn ghost" id="chat">${icon('chat')}</button><button class="btn block grow" id="join">${t('Join run')} · ₹${tk.reward} + ${t('items')}</button>`;
    else if (!mine && tk.status === 'open') cta.innerHTML = tk.myOffer ? html`<span class="small grow">${icon('check', 'ic-sm')} ${t('You offered')} ${ago(tk.myOffer.at)}</span><button class="btn ghost sm" id="withdraw">${t('Withdraw')}</button>` : html`<button class="btn ghost" id="chat">${icon('chat')}</button><button class="btn block grow" id="help">${icon('hand')} ${t('Offer to help')} · ₹${tk.reward}</button>`;
    if (cta.innerHTML) { root.append(cta); document.body.classList.add('has-cta'); } else document.body.classList.remove('has-cta');
  }
  root.addEventListener('click', async (e) => {
    try {
      if (e.target.closest('#help')) {
        const cap = store.config.settings.helperActiveCap;
        const v = await formSheet({ title: t('Offer to help'), intro: `${t('You will earn')} ₹${tk.reward} ${t('after the poster confirms with the delivery OTP. You can hold up to')} ${cap} ${t('active jobs.')}`, fields: [{ name: 'note', label: t('Note to poster'), placeholder: t('e.g. I\'m near the gate, can do it in 20 min') }, { name: 'eta', label: t('When can you do it?'), placeholder: t('e.g. 20 min / 3 PM') }], ok: t('Send offer') });
        if (!v) return;
        const r = await api(`/tasks/${tk.id}/offers`, { method: 'POST', body: v });
        if (r.assigned) { toast(t('Task assigned to you (first come, first served)!'), 'ok'); location.hash = '#/deal/' + r.dealId; } else { toast(t('Offer sent — the poster will choose'), 'ok'); load(); }
      }
      if (e.target.closest('#withdraw')) { await api(`/tasks/${tk.id}/offers`, { method: 'DELETE' }); toast(t('Offer withdrawn')); load(); }
      const a = e.target.closest('[data-assign]');
      if (a) {
        const ok = await confirmSheet({ title: `${t('Choose')} ${a.dataset.name}?`, body: t('This is your acceptance. The reward already locked in escrow is assigned to this helper; other offers are notified.'), extra: html`<div class="mt-16">${breakdownBox({ amount: tk.reward, fee: tk.fee, total: tk.total }, 'Reward')}</div>`, ok: t('Accept helper') });
        if (ok) { const d = await api(`/tasks/${tk.id}/assign`, { method: 'POST', body: { helperId: a.dataset.assign } }); toast(t('Helper assigned — deal started'), 'ok'); location.hash = '#/deal/' + d.id; }
      }
      if (e.target.closest('#cancelTask')) { if (await confirmSheet({ title: t('Cancel this task?'), body: t('The reward will be refunded to your wallet and helpers notified.'), ok: t('Cancel task'), danger: true })) { await api('/tasks/' + tk.id, { method: 'DELETE' }); toast(t('Task cancelled — refunded')); load(); } }
      if (e.target.closest('#join')) {
        const v = await formSheet({ title: t('Join this run'), intro: `${t('Carry charge')} ₹${tk.reward} + ${t('your item cost (max ₹300). Held in escrow until you receive it.')}`, fields: [{ name: 'item', label: t('What should they bring?'), placeholder: t('e.g. 1 veg meals + 1 lime juice'), required: true }, { name: 'itemCost', label: t('Estimated item cost'), type: 'number', prefix: '₹', value: 60, inputmode: 'numeric' }], ok: t('Continue') });
        if (!v) return;
        const amount = tk.reward + (+v.itemCost || 0), fee = calcFee(amount);
        if (await confirmSheet({ title: t('Confirm order'), extra: html`<div class="mt-16">${breakdownBox({ amount, fee, total: amount + fee }, 'Items + carry charge')}</div><p class="tiny faint mt-10">${t('The runner must accept your order. If not, you are refunded automatically.')}</p>`, ok: `${t('Hold')} ₹${amount + fee}` })) {
          const d = await api(`/tasks/${tk.id}/join`, { method: 'POST', body: v }); toast(t('Order placed'), 'ok'); location.hash = '#/deal/' + d.id;
        }
      }
      if (e.target.closest('#chat')) { const th = await api('/threads', { method: 'POST', body: { userId: tk.poster.id, refType: 'task', refId: tk.id } }); location.hash = '#/chat/' + th.id; }
      if (e.target.closest('#report')) reportSheet('task', tk.id, tk.title);
    } catch (err) {
      if (err.status === 402) { const { topupSheet } = await import('./wallet.js'); topupSheet(Math.max(50, err.data.need)); }
      toastErr(err);
    }
  });
  await load();
  return on('task', (d) => d.id === params.id && load());
}

function defaultDeadline(hours = 2) {
  const s = store.config.settings;
  let d = new Date(Date.now() + hours * 3600e3);
  const [ch, cm] = s.campusClose.split(':').map(Number), [oh, om] = s.campusOpen.split(':').map(Number);
  const mins = d.getHours() * 60 + d.getMinutes();
  if (mins > ch * 60 + cm - 5 || mins < oh * 60 + om) { d = new Date(d.getTime() + (mins < oh * 60 ? 0 : 86400e3)); d.setHours(oh + 3, 0, 0, 0); }
  d.setMinutes(Math.ceil(d.getMinutes() / 15) * 15, 0, 0);
  const off = d.getTimezoneOffset() * 60000;
  return new Date(d - off).toISOString().slice(0, 16);
}

export async function post({ root, params, setTop }) {
  const kind = KIND[params.kind] ? params.kind : 'task';
  const C = store.config, s = C.settings;
  await refreshMe();
  setTop({ back: true, title: { task: t('Post a task'), pickdrop: t('Request pick & drop'), group: t('Start a group run') }[kind] });
  const st = { kind, title: '', desc: '', reward: kind === 'group' ? 10 : 20, deadline: defaultDeadline(kind === 'group' ? 3 : 2), urgent: false, assignMode: 'choose', pickup: 'gate', drop: 'library', size: 'small', location: kind === 'group' ? 'canteen' : 'xerox', capacity: 4, photos: [] };
  if (kind === 'group') st.drop = 'hosgate';
  let fare = null;
  async function getFare() { if (kind === 'pickdrop') fare = await api(`/fare?from=${st.pickup}&to=${st.drop}&size=${st.size}`); }
  function render() {
    const fee = calcFee(+st.reward || 0), total = (+st.reward || 0) + fee, me = store.me;
    const locOpts = (sel) => C.locations.map((l) => html`<option value="${l.id}" ${sel === l.id ? 'selected' : ''}>${locName(l.id)}${l.safe ? ' ✓' : ''}</option>`);
    root.innerHTML = html`<form id="f">
      <div class="seg mb">${Object.entries(KIND).map(([k, [e, l]]) => html`<button type="button" class="${k === kind ? 'on' : ''}" data-k="${k}">${e} ${t(l)}</button>`)}</div>
      <label class="f mt-16"><span>${t('What do you need?')}</span><input class="in" name="title" required maxlength="70" value="${st.title}" placeholder="${{ task: t('e.g. Print 40 pages & spiral bind'), pickdrop: t('e.g. Collect my parcel from Main Gate'), group: t('e.g. Canteen run at 1 PM') }[kind]}"></label>
      <label class="f"><span>${t('Details')}</span><textarea class="in" name="desc" maxlength="600" placeholder="${t('Exact instructions, what to bring, who to ask for…')}">${st.desc}</textarea></label>
      ${kind === 'pickdrop' ? html`<div class="row gap-16"><label class="f grow"><span>${t('Pick up from')}</span><select class="in" name="pickup">${locOpts(st.pickup)}</select></label><label class="f grow"><span>${t('Drop at')}</span><select class="in" name="drop">${locOpts(st.drop)}</select></label></div>
        <div class="seg mb">${['small', 'medium', 'large'].map((z) => html`<button type="button" class="${st.size === z ? 'on' : ''}" data-size="${z}">${t(z)}</button>`)}</div>
        <div class="mt-10">${campusMap({ from: st.pickup, to: st.drop, height: 220 })}</div>
        ${fare ? html`<div class="banner info mt-10">${icon('route')}<div><b>${t('Fair fare')}: ₹${fare.fare}</b> · ${fare.distance} m<p class="small">${t(fare.formula)}</p><button type="button" class="btn xs mt-6" data-fare="${fare.fare}">${t('Use')} ₹${fare.fare}</button></div></div>` : ''}` : ''}
      ${kind === 'task' ? html`<label class="f"><span>${t('Where')}</span><select class="in" name="location">${locOpts(st.location)}</select></label>` : ''}
      ${kind === 'group' ? html`<div class="row gap-16"><label class="f grow"><span>${t('Buying from')}</span><select class="in" name="location">${locOpts(st.location)}</select></label><label class="f grow"><span>${t('Delivering to')}</span><select class="in" name="drop">${C.locations.filter((l) => l.safe).map((l) => html`<option value="${l.id}" ${st.drop === l.id ? 'selected' : ''}>${locName(l.id)}</option>`)}</select></label></div>
        <label class="f"><span>${t('How many orders can you carry?')}</span><input class="in" name="capacity" type="number" min="2" max="10" value="${st.capacity}"></label>` : ''}
      <div class="row gap-16"><label class="f grow"><span>${kind === 'group' ? t('Carry charge / order') : t('Reward')} <span class="faint">(${t('max')} ₹${s.maxTaskReward})</span></span><div class="prefix"><b>₹</b><input class="in" name="reward" type="number" min="5" max="${s.maxTaskReward}" required value="${st.reward}" inputmode="numeric"></div></label>
        <label class="f grow"><span>${t('Deadline')}</span><input class="in" name="deadline" type="datetime-local" required value="${st.deadline}"></label></div>
      <p class="hint" style="margin-top:-8px">${t('Campus hours')}: ${s.campusOpen}–${s.campusClose}. ${t('Auto-expires with a full refund if nobody accepts.')}</p>
      ${kind !== 'group' ? html`<div class="card pad-sm mt-16">
        <label class="row between" style="cursor:pointer"><span><b>⚡ ${t('Mark as urgent')}</b><br><span class="tiny faint">${me.urgentLeft} ${t('of')} ${s.urgentPerDay} ${t('left today · shown in the urgent lane by deadline')}</span></span><span class="switch"><input type="checkbox" name="urgent" ${st.urgent ? 'checked' : ''} ${me.urgentLeft ? '' : 'disabled'}><span></span></span></label><hr>
        <div class="small muted" style="font-weight:700">${t('How to pick a helper')}</div>
        <div class="seg mt-6">${[['choose', 'I\'ll choose'], ['first', 'First come, first served']].map(([k, l]) => html`<button type="button" class="${st.assignMode === k ? 'on' : ''}" data-mode="${k}">${t(l)}</button>`)}</div></div>
        <div class="mt-16">${breakdownBox({ amount: +st.reward || 0, fee, total }, 'Reward')}</div>
        <div class="secure mt-10">${icon('lock')}<span>${t('The reward is locked in escrow now so helpers know it is real. Paid only after you confirm with the delivery OTP.')}</span></div>
        <div class="row between small mt-10"><span class="muted">${t('Wallet balance')}</span><b>₹${me.wallet.balance}</b></div>` : html`<div class="banner info mt-10">${icon('info')}<div><b>${t('How group runs work')}</b><p class="small">${t('Others join with their order and item cost — each is held in their own escrow. You accept each order, deliver, and get paid per OTP.')}</p></div></div>`}
      <div id="err"></div>
      <button class="btn block mt-16" id="submit">${kind === 'group' ? t('Start group run') : `${t('Post & lock')} ₹${total}`}</button></form>`;
  }
  const sync = () => { const f = $('#f', root); if (f) { const v = Object.fromEntries(new FormData(f)); v.urgent = !!f.urgent?.checked; Object.assign(st, v); } };
  root.addEventListener('click', async (e) => {
    const k = e.target.closest('[data-k]'); if (k) { location.hash = '#/post/' + k.dataset.k; return; }
    const z = e.target.closest('[data-size]'); if (z) { sync(); st.size = z.dataset.size; await getFare(); render(); }
    const m = e.target.closest('[data-mode]'); if (m) { sync(); st.assignMode = m.dataset.mode; render(); }
    const f = e.target.closest('[data-fare]'); if (f) { sync(); st.reward = f.dataset.fare; render(); }
  });
  root.addEventListener('change', async (e) => { if (['pickup', 'drop', 'reward'].includes(e.target.name)) { sync(); await getFare(); render(); } });
  root.addEventListener('submit', async (e) => {
    e.preventDefault(); sync();
    const btn = $('#submit', root); btn.disabled = true; $('#err', root).innerHTML = '';
    try {
      const body = { ...st, reward: +st.reward, capacity: +st.capacity, deadline: new Date(st.deadline).toISOString() };
      const tk = await api('/tasks', { method: 'POST', body });
      toast(kind === 'group' ? t('Group run is live!') : t('Posted — reward locked in escrow'), 'ok');
      location.hash = '#/task/' + tk.id;
    } catch (err) {
      btn.disabled = false;
      if (err.status === 402) { const { topupSheet } = await import('./wallet.js'); topupSheet(Math.max(50, err.data.need), () => { refreshMe().then(render); }); }
      $('#err', root).innerHTML = banner(err.data?.rule === 'prohibited' ? 'bad' : 'warn', err.data?.rule === 'prohibited' ? 'ban' : 'alert', err.message).s;
    }
  });
  await getFare();
  render();
}
