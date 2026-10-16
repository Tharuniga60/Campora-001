import { html, $, icon, store, api, t, ago, when, clock, until, avatar, trustRing, who, locName, loc, breakdownBox, sheet, formSheet, confirmSheet, toast, toastErr, campusMap, statusPill, banner, on, pickImage, refreshMe, STATUS_LABEL } from '../core.js';

const STEPS = ['Posted', 'Accepted', 'In progress', 'Delivered', 'Confirmed', 'Paid'];
const IDX = { offered: 0, accepted: 1, in_progress: 2, delivered: 3, confirmed: 4, paid: 5 };
const TRACK = [['heading_pickup', '🚶', 'Heading to pick-up'], ['picked_up', '📦', 'Picked up'], ['on_the_way', '🏃', 'On the way'], ['near_drop', '📍', 'Almost there']];
const TRACK_T = { heading_pickup: 0.02, picked_up: 0.08, on_the_way: 0.5, near_drop: 0.88, started: 0.02 };

function runnerPos(d) {
  const from = loc(d.ref?.pickup || d.meetPoint), to = loc(d.ref?.drop || d.meetPoint);
  if (!from || !to || !d.tracking) return null;
  const k = d.status === 'delivered' ? 1 : TRACK_T[d.tracking.stage] ?? 0.05;
  const cx = (from.x + to.x) / 2 + 60, cy = (from.y + to.y) / 2 - 80;
  const x = (1 - k) ** 2 * from.x + 2 * (1 - k) * k * cx + k * k * to.x;
  const y = (1 - k) ** 2 * from.y + 2 * (1 - k) * k * cy + k * k * to.y;
  return { x, y };
}

export async function detail({ root, params, setTop }) {
  let d;
  async function load() { d = await api('/deals/' + params.id); render(); }

  function render() {
    const me = store.me, A = d.actions, payer = d.role === 'payer', payee = d.role === 'payee';
    const other = d.counterpart;
    const kindLabel = { buy: payer ? t('Buying') : t('Selling'), task: payer ? t('Your task') : t('Helping with task'), pickdrop: payer ? t('Your pick & drop') : t('Delivering'), group: payer ? t('Group order') : t('Running group order') }[d.type];
    setTop({ back: true, title: kindLabel });
    const idx = IDX[d.status] ?? (d.status === 'disputed' ? IDX[d.prevStatus] ?? 2 : -1);
    const closed = ['declined', 'cancelled', 'expired', 'refunded'].includes(d.status);
    const lastNote = d.timeline.at(-1)?.note;
    const pending = d.pending;
    const showMap = d.type === 'pickdrop' || (d.type !== 'buy' && d.ref?.pickup);
    const escrowLine = d.status === 'paid' ? [`₹${d.amount} ${t('released to')} ${d.payee.name}`, 'good'] : closed ? [d.status === 'refunded' ? t('Escrow refunded to payer') : t('Escrow refunded — no money moved'), 'info'] : d.escrow > 0 ? [`₹${d.escrow} ${t('held safely in escrow')}`, 'good'] : [t('No payment needed (free item)'), 'info'];

    root.innerHTML = html`
      <div class="card pad mt-6">
        <div class="row between"><span>${statusPill(d.status)}</span><span class="tiny faint">#${d.id.slice(-6).toUpperCase()}</span></div>
        <div class="row mt-10">${d.ref?.photo ? html`<img src="${d.ref.photo}" alt="" style="width:56px;height:56px;border-radius:12px;object-fit:cover">` : html`<span class="ico" style="width:56px;height:56px;border-radius:12px;display:grid;place-items:center;background:var(--paper-2);font-size:1.6rem">${{ task: '🧾', pickdrop: '📦', group: '🍱', buy: '🏷️' }[d.type]}</span>`}
          <div class="grow"><h3 class="clamp2">${d.title}</h3><a class="small link" href="#/${d.type === 'buy' ? 'listing' : 'task'}/${d.refId}">${t('View post')}</a></div><b class="num" style="font-size:1.3rem">₹${d.amount}</b></div>
        ${!closed ? html`<div class="tl mt-16"><span class="bar" style="width:calc(${Math.max(0, idx) / 5} * (100% - 20px))"></span>${STEPS.map((s, i) => html`<span class="st ${i < idx || d.status === 'paid' ? 'done' : i === idx ? 'cur' : ''}"><i>${i < idx || d.status === 'paid' ? icon('check') : ''}</i><span>${t(s)}</span></span>`)}</div>` : ''}
      </div>
      ${closed ? html`<div class="mt-10">${banner('warn', 'info', t(STATUS_LABEL[d.status]), lastNote || '')}</div>` : ''}
      ${d.status === 'disputed' && d.dispute ? html`<div class="banner bad mt-10">${icon('alert')}<div><b>${t('In dispute')}: ${d.dispute.reason}</b><p class="small">${t('Escrow is frozen. Admin decision due in')} <b>${until(d.dispute.dueAt)}</b>. ${t('The decision and its reason will be shown here.')}</p></div></div>` : ''}
      ${d.dispute?.decision ? html`<div class="banner info mt-10">${icon('shield')}<div><b>${t('Admin decision')}: ${d.dispute.decision.action}</b><p class="small">${d.dispute.decision.reason}</p></div></div>` : ''}
      ${pending ? html`<div class="banner warn mt-10">${icon('refresh')}<div class="grow"><b>${pending.kind === 'cancel' ? t('Cancellation requested') : t('Change proposed')}${pending.by === me.id ? ` — ${t('waiting for')} ${other.name.split(' ')[0]}` : ` ${t('by')} ${other.name.split(' ')[0]}`}</b>
        <p class="small">${pending.amount != null ? html`${t('Price')}: <s>₹${d.amount}</s> → <b>₹${pending.amount}</b>. ` : ''}${pending.when ? `${t('Time')}: ${when(pending.when)}. ` : ''}${pending.meetPoint ? `${t('Meet at')}: ${locName(pending.meetPoint)}. ` : ''}${pending.reason || ''}</p>
        ${A.includes('respond_pending') ? html`<div class="row gap-6 mt-10"><button class="btn sm" data-respond="1">${t('Approve')}</button><button class="btn sm ghost" data-respond="0">${t('Reject')}</button></div>` : ''}</div></div>` : ''}

      ${A.includes('show_otp') ? html`<div class="card pad mt-16 center kolam-bg"><h4>${t('Your delivery OTP')}</h4><p class="small muted mt-6">${t('Share this code only after you have checked and received')} ${d.type === 'buy' ? t('the item') : t('the delivery')}. ${t('It releases the payment.')}</p>
        <div class="otp-show">${[...d.myOtp].map((c) => html`<b>${c}</b>`)}</div>
        <button class="btn soft sm" id="received">${icon('check')} ${t('I received it — release payment')}</button></div>` : ''}
      ${A.includes('enter_otp') ? html`<div class="card pad mt-16"><h4>${icon('lock', 'ic-sm')} ${t('Complete handover')}</h4><p class="small muted mt-6">${t('Ask')} ${other.name.split(' ')[0]} ${t('for the 4-digit OTP on their screen after they receive it. Entering it releases your payment.')}</p>
        <form id="otpf" class="row mt-10"><input class="in grow" id="otp" inputmode="numeric" maxlength="4" placeholder="• • • •" style="letter-spacing:.5em;font-size:1.3rem;font-weight:800;text-align:center"><button class="btn">${t('Confirm')}</button></form></div>` : ''}

      ${A.includes('accept') ? html`<div class="card pad mt-16"><h4>${d.offeredBy === d.payerId ? `${other.name.split(' ')[0]} ${d.amount ? `${t('offered')} ₹${d.amount}` : t('requested this item')}` : t('Offer to help')}</h4>${d.note ? html`<p class="mt-6">“${d.note}”</p>` : ''}
        <p class="small muted mt-6">${payee ? `${t('Their payment is already held in escrow')}: ₹${d.total}. ${t('Accepting makes the deal binding for both of you.')}` : ''}</p>
        <div class="btn-row mt-16"><button class="btn ghost" id="decline">${t('Decline')}</button><button class="btn" id="accept">${t('Accept deal')}</button></div></div>` : ''}
      ${A.includes('withdraw') ? html`<div class="banner info mt-16">${icon('clock')}<div class="grow"><b>${t('Waiting for')} ${other.name.split(' ')[0]} ${t('to accept')}</b><p class="small">${t('Offers expire automatically after')} ${store.config.settings.offerExpiryHours}h ${t('with a full refund.')}</p><button class="btn xs ghost mt-6" id="withdraw">${t('Withdraw offer')}</button></div></div>` : ''}

      ${A.includes('start') ? html`<button class="btn block mt-16" id="start">${icon('route')} ${d.type === 'buy' ? t("I'm heading to the meeting point") : t('Start the job')}</button>` : ''}
      ${A.includes('track') && d.type !== 'buy' ? html`<div class="card pad mt-16"><h4>${t('Update live status')}</h4><div class="row wrap gap-6 mt-10">${TRACK.map(([k, e, l]) => html`<button class="chip ${d.tracking?.stage === k ? 'on' : ''}" data-stage="${k}">${e} ${t(l)}</button>`)}</div>
        <button class="link small mt-10" id="gps">${icon('pin', 'ic-sm')} ${t('Share my GPS position once')}</button></div>` : ''}
      ${A.includes('deliver') ? html`<button class="btn mari block mt-10" id="deliver">${icon('camera')} ${t('Mark delivered')}${d.type === 'pickdrop' ? ` (${t('photo proof')})` : ''}</button>` : ''}

      ${showMap || d.meetPoint ? html`<div class="section"><div class="section-h"><h3>${showMap ? t('Live tracking') : t('Meeting point')}</h3>${d.tracking?.at ? html`<span class="tiny faint">${t('updated')} ${ago(d.tracking.at)}</span>` : ''}</div>
        ${showMap ? campusMap({ from: d.ref.pickup, to: d.ref.drop, runner: ['in_progress', 'delivered'].includes(d.status) ? runnerPos(d) : null, height: 280 }) : campusMap({ highlight: [d.meetPoint], height: 220 })}
        ${d.tracking?.stage && !['paid'].includes(d.status) ? html`<p class="small mt-6"><b>${TRACK.find((x) => x[0] === d.tracking.stage)?.[1] || '🏃'} ${t(TRACK.find((x) => x[0] === d.tracking.stage)?.[2] || 'Started')}</b>${d.tracking.lat ? html` · <span class="faint">GPS ${d.tracking.lat.toFixed(4)}, ${d.tracking.lng.toFixed(4)}</span>` : ''}</p>` : ''}
        ${d.meetPoint && !showMap ? html`<p class="small muted mt-6">${icon('pin', 'ic-sm')} ${locName(d.meetPoint)}${d.when ? ` · ${when(d.when)}` : ''}</p>` : ''}</div>` : ''}

      ${d.proof?.photo ? html`<div class="section"><h3>${t('Delivery proof')}</h3><img src="${d.proof.photo}" alt="${t('Delivery proof photo')}" class="mt-10" style="border-radius:14px;max-height:280px;object-fit:cover;width:100%"><p class="tiny faint mt-6">${when(d.proof.at)}</p></div>` : ''}

      <div class="section"><h3>${d.type === 'buy' ? (payer ? t('Seller') : t('Buyer')) : payer ? t('Helper') : t('Poster')}</h3>
        <div class="card pad mt-10"><div class="row">${who(other)}<span class="grow"></span>${trustRing(other.trust, 40)}</div>
        <div class="row gap-6 mt-10"><a class="btn soft sm grow" href="#/chat/${d.threadId}">${icon('chat')} ${t('Chat')}</a><button class="btn ghost sm" id="call" title="${t('Number is masked')}">${icon('phone')} ${other.phoneMasked}</button></div></div></div>

      <div class="section"><h3>${t('Payment')}</h3><div class="mt-10">${breakdownBox(d, d.type === 'buy' ? 'Item price' : 'Reward', payer ? 'You pay (held in escrow)' : 'They pay · you receive the price')}</div>
        <div class="banner ${escrowLine[1]} mt-10">${icon(d.status === 'paid' ? 'check' : 'lock')}<div><b>${escrowLine[0]}</b></div></div>
        ${d.status === 'paid' ? html`<button class="btn ghost block mt-10" id="receipt">${icon('download')} ${t('Download receipt')}</button>` : ''}</div>

      ${A.includes('review') ? html`<button class="btn mari block mt-16" id="review">${icon('star')} ${t('Rate')} ${other.name.split(' ')[0]}</button>` : d.review ? html`<div class="card pad mt-16"><b>${t('Your rating')}: ${'★'.repeat(d.review.stars)}</b><p class="small muted">${d.review.text}</p></div>` : ''}

      <div class="section"><h3>${t('Activity log')}</h3><ul class="log mt-6">${d.timeline.slice().reverse().map((e) => html`<li><time>${when(e.at)}</time><span><b>${t(STATUS_LABEL[e.s] || e.s)}</b>${e.note ? html` — <span class="muted">${e.note}</span>` : ''}</span></li>`)}</ul></div>

      ${A.some((a) => ['propose_change', 'request_cancel', 'dispute'].includes(a)) ? html`<div class="section"><h3>${t('Need to change something?')}</h3><div class="card list mt-10">
        ${A.includes('propose_change') ? html`<div class="li" id="change"><span class="ic-box">${icon('edit')}</span><div class="grow"><b class="small">${t('Propose a change')}</b><div class="tiny faint">${t('Price, time or meeting point — both must approve')}</div></div>${icon('chev', 'chev')}</div>` : ''}
        ${A.includes('request_cancel') ? html`<div class="li" id="cancel"><span class="ic-box">${icon('x')}</span><div class="grow"><b class="small">${t('Request cancellation')}</b><div class="tiny faint">${t('Refund after the other side agrees')}</div></div>${icon('chev', 'chev')}</div>` : ''}
        ${A.includes('dispute') ? html`<div class="li" id="dispute"><span class="ic-box" style="color:var(--kum)">${icon('alert')}</span><div class="grow"><b class="small">${t('Raise a dispute')}</b><div class="tiny faint">${t('Freezes escrow; admin decides within')} ${store.config.settings.disputeSlaHours}h</div></div>${icon('chev', 'chev')}</div>` : ''}
      </div></div>` : ''}
      <p class="tiny faint center mt-24">${t('Every step is recorded and visible to both of you and the admin.')}</p>`;
  }

  const act = async (path, body, msg) => { const r = await api(`/deals/${d.id}/${path}`, { method: 'POST', body }); d = r; render(); if (msg) toast(msg, 'ok'); refreshMe(); };
  root.addEventListener('click', async (e) => {
    try {
      if (e.target.closest('#accept')) { if (await confirmSheet({ title: t('Accept this deal?'), body: t('Both of you are now committed. Changes later need both to approve.'), extra: html`<div class="mt-16">${breakdownBox(d, d.type === 'buy' ? 'Item price' : 'Reward')}</div>`, ok: t('Accept') })) await act('accept', {}, t('Deal accepted')); }
      if (e.target.closest('#decline')) { const v = await formSheet({ title: t('Decline offer'), intro: t('The buyer is refunded immediately. A short reason helps them.'), fields: [{ name: 'reason', label: t('Reason (shown to them)'), placeholder: t('e.g. Already promised to someone') }], ok: t('Decline'), danger: true }); if (v) await act('decline', v, t('Declined — refunded')); }
      if (e.target.closest('#withdraw')) { if (await confirmSheet({ title: t('Withdraw your offer?'), body: t('Your money is refunded to your wallet.'), ok: t('Withdraw'), danger: true })) await act('withdraw', {}, t('Offer withdrawn')); }
      if (e.target.closest('#start')) await act('start', {}, t('Marked in progress'));
      const sg = e.target.closest('[data-stage]'); if (sg) await act('track', { stage: sg.dataset.stage }, t('Status shared live'));
      if (e.target.closest('#gps')) {
        if (!navigator.geolocation) return toast(t('GPS not available'), 'err');
        navigator.geolocation.getCurrentPosition((p) => act('track', { lat: p.coords.latitude, lng: p.coords.longitude }, t('GPS position shared')), () => toast(t('Location permission denied'), 'err'), { timeout: 6000 });
      }
      if (e.target.closest('#deliver')) {
        let photo = null;
        if (d.type === 'pickdrop' || (await confirmSheet({ title: t('Add a photo proof?'), body: t('Recommended — protects you in disputes.'), ok: t('Add photo') }))) { photo = await pickImage({ capture: true, max: 640 }); if (!photo && d.type === 'pickdrop') return toast(t('A photo is required for pick & drop deliveries'), 'err'); }
        await act('deliver', { photo }, t('Marked delivered — ask for the OTP'));
      }
      if (e.target.closest('#received')) { if (await confirmSheet({ title: t('Confirm you received it?'), body: `${t('This releases')} ₹${d.amount} ${t('to')} ${d.counterpart.name}. ${t('Only confirm after checking.')}`, ok: t('Yes, release payment') })) { await act('confirm', {}, t('Payment released — deal complete!')); } }
      const r = e.target.closest('[data-respond]'); if (r) await act('respond', { approve: r.dataset.respond === '1' }, r.dataset.respond === '1' ? t('Approved') : t('Rejected'));
      if (e.target.closest('#change')) {
        const v = await formSheet({ title: t('Propose a change'), intro: t('The other side must approve. Escrow adjusts automatically.'), fields: [{ name: 'amount', label: t('New amount (leave as is to keep)'), type: 'number', prefix: '₹', value: d.amount }, { name: 'when', label: t('New time (optional)'), type: 'datetime-local' }, { name: 'meetPoint', label: t('Meeting point'), type: 'select', value: d.meetPoint, options: store.config.locations.filter((l) => l.safe).map((l) => ({ value: l.id, label: locName(l.id) })) }, { name: 'reason', label: t('Why?'), placeholder: t('e.g. Running 20 min late') }], ok: t('Send for approval') });
        if (v) await act('propose', { amount: +v.amount === d.amount ? undefined : +v.amount, when: v.when ? new Date(v.when).toISOString() : undefined, meetPoint: v.meetPoint !== d.meetPoint ? v.meetPoint : undefined, reason: v.reason }, t('Sent for approval'));
      }
      if (e.target.closest('#cancel')) { const v = await formSheet({ title: t('Request cancellation'), intro: t('If they agree, the escrow is refunded. Frequent cancellations lower your trust score.'), fields: [{ name: 'reason', label: t('Reason'), required: true }], ok: t('Request'), danger: true }); if (v) await act('propose', { kind: 'cancel', reason: v.reason }, t('Cancellation requested')); }
      if (e.target.closest('#dispute')) {
        const v = await formSheet({ title: t('Raise a dispute'), intro: t('Escrow is frozen and an admin decides using the chat, photos and timeline. Decisions always include a written reason.'), fields: [{ name: 'reason', label: t('What went wrong?'), type: 'select', options: ['Item not as described', 'Item not received', 'Helper did not show up', 'Damaged during delivery', 'Asked to pay outside the app', 'Other'].map((x) => ({ value: x, label: t(x) })) }, { name: 'details', label: t('Details'), type: 'textarea', required: true }], ok: t('Raise dispute'), danger: true });
        if (v) { await act('dispute', v, t('Dispute raised — admin notified')); }
      }
      if (e.target.closest('#review')) {
        const v = await formSheet({ title: `${t('Rate')} ${d.counterpart.name.split(' ')[0]}`, fields: [{ name: 'stars', label: t('Overall'), type: 'stars', value: 0 }, { name: 'tags', label: t('What went well?'), type: 'chips', options: ['On time', 'As described', 'Friendly', 'Fair price', 'Quick reply', 'Careful handling'] }, { name: 'text', label: t('Review (visible on their profile)'), type: 'textarea', placeholder: t('Help others know what to expect') }], ok: t('Submit review') });
        if (v) { if (!+v.stars) return toast(t('Tap a star rating'), 'err'); await act('review', { ...v, stars: +v.stars }, t('Thanks for rating!')); }
      }
      if (e.target.closest('#call')) toast(t('For privacy, numbers are masked. Use in-app chat — it keeps a record that protects you.'));
      if (e.target.closest('#receipt')) receipt(d);
    } catch (err) { toastErr(err); }
  });
  root.addEventListener('submit', async (e) => { if (e.target.id === 'otpf') { e.preventDefault(); try { await act('confirm-otp', { otp: $('#otp', root).value }, t('OTP verified — payment released!')); } catch (err) { toastErr(err); } } });
  await load();
  const offs = [on('deal', (x) => x.id === d.id && load()), on('track', (x) => x.id === d.id && load())];
  const tick = setInterval(() => { if (d.status === 'disputed') render(); }, 60000);
  return () => { offs.forEach((f) => f()); clearInterval(tick); };
}

function receipt(d) {
  const rows = [['Receipt no.', d.id.toUpperCase()], ['Deal', d.title], ['Type', d.type], ['Payer', d.payer.name], ['Payee', d.payee.name], ['Amount', '₹' + d.amount], ['Platform fee', '₹' + d.fee], ['Total paid', '₹' + d.total], ['Accepted', when(d.acceptedAt)], ['Completed', when(d.paidAt)], ['Confirmation', d.confirmedHow || 'Delivery OTP']];
  const doc = `<!doctype html><meta charset="utf-8"><title>CampusLoop receipt ${d.id}</title><style>body{font-family:system-ui;max-width:520px;margin:40px auto;color:#1c1b18}h1{font-size:22px}td{padding:6px 0;border-bottom:1px dashed #ddd}td:last-child{text-align:right;font-weight:600}.n{color:#777;font-size:12px;margin-top:20px}</style>
  <h1>CampusLoop — Payment receipt</h1><p>${store.config.campus.name}</p><table style="width:100%;border-collapse:collapse">${rows.map(([k, v]) => `<tr><td>${k}</td><td>${String(v).replace(/</g, '&lt;')}</td></tr>`).join('')}</table>
  <h3>Timeline</h3><ol>${d.timeline.map((e) => `<li>${new Date(e.at).toLocaleString('en-IN')} — ${e.s}${e.note ? ': ' + e.note.replace(/</g, '&lt;') : ''}</li>`).join('')}</ol><p class="n">Funds were held in escrow and released only after both parties confirmed. Generated ${new Date().toLocaleString('en-IN')}.</p>`;
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([doc], { type: 'text/html' }));
  a.download = `campusloop-receipt-${d.id.slice(-6)}.html`;
  a.click();
  toast(t('Receipt downloaded'), 'ok');
}
