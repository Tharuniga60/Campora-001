import { html, $, icon, store, api, t, ago, when, until, avatar, who, empty, skeleton, formSheet, confirmSheet, toast, toastErr, statusPill, locName, on, breakdownBox } from '../core.js';

const TABS = [['overview', 'Overview'], ['reports', 'Reports'], ['flags', 'Auto-flags'], ['users', 'Users'], ['sos', 'SOS'], ['settings', 'Rules & limits'], ['announce', 'Announce'], ['audit', 'Audit log']];
const FLAG = { offplatform: ['💸', 'Off-platform payment'], cancellations: ['↩️', 'Repeated cancellations'], price: ['📈', 'Price manipulation'], duplicate: ['🪞', 'Duplicate listing'], prohibited: ['🚫', 'Prohibited attempt'], otp: ['🔢', 'OTP guessing'] };

export async function main({ root, params, setTop }) {
  if (!store.me.isAdmin) { root.innerHTML = empty('🔒', t('Admins only')).s; return; }
  const tab = params.tab || 'overview';
  setTop({ back: true, title: t('Admin panel') });
  root.innerHTML = html`<div class="tabs">${TABS.map(([k, l]) => html`<button class="${k === tab ? 'on' : ''}" data-go="#/admin/${k}">${t(l)}</button>`)}</div><div id="body">${skeleton(4)}</div>`;
  const body = $('#body', root);
  const R = { overview, reports, flags, users, sos, settings, announce, audit }[tab];
  await R(body);
  const off = on('admin', () => tab !== 'settings' && R(body));
  const off2 = on('sos', () => toast('🚨 ' + t('New SOS alert'), 'err', '', () => (location.hash = '#/admin/sos')));
  return () => { off(); off2(); };
}

async function overview(body) {
  const o = await api('/admin/overview');
  const k = o.kpis;
  const max = Math.max(1, ...o.weeks.map((w) => w.buy + w.task + w.pickdrop));
  const catMax = Math.max(1, ...o.cats.map((c) => c.n));
  const K = (v, l, hi) => html`<div class="card stat ${hi ? 'hi' : ''}"><b class="num">${v}</b><span>${l}</span></div>`;
  body.innerHTML = html`
    ${k.openReports || k.openSos ? html`<div class="banner bad">${icon('alert')}<div><b>${k.openReports} ${t('open reports')} · ${k.openFlags} ${t('auto-flags')} · ${k.openSos} SOS</b><p class="small"><a class="link" href="#/admin/reports">${t('Review queue')} →</a></p></div></div>` : ''}
    <h4 class="mt-16">${t('Success metrics')}</h4><p class="tiny faint">${t('As defined in the problem statement’s expected outcome')}</p>
    <div class="stat-grid mt-10">
      ${K(k.completed, t('Completed deals'), true)}${K(k.repeatUsers + '%', t('Repeat usage (2+ deals)'))}
      ${K(k.avgRating + '★', t('Average rating'))}${K(k.avgAcceptMins + ' min', t('Median time to accept a task'))}
      ${K(k.disputeRate + '%', t('Dispute rate'))}${K(k.fraudRate + '%', t('Fraud-flag rate'))}
      ${K(k.satisfaction + '%', t('Satisfaction (4★+)'))}${K(k.slaMet + '%', t('Reports decided within SLA'))}</div>
    <h4 class="mt-24">${t('Economy')}</h4>
    <div class="stat-grid mt-10">${K('₹' + k.gmv.toLocaleString('en-IN'), t('Value traded (GMV)'))}${K('₹' + k.escrowHeld, t('Currently in escrow'))}${K('₹' + k.revenue, t('Platform fees collected'))}${K(k.active7d + '/' + k.users, t('Active users (7d)'))}</div>
    <div class="section"><div class="section-h"><h3>${t('Completed deals per week')}</h3></div>
      <div class="card pad"><div class="bar-chart" style="height:150px">${o.weeks.map((w) => { const tot = w.buy + w.task + w.pickdrop; return html`<div title="${tot}"><span class="tiny num" style="font-weight:700">${tot || ''}</span><span style="display:flex;flex-direction:column;width:100%;height:${(tot / max) * 85}%" class="stack"><i style="flex:${w.pickdrop};background:var(--mari);border-radius:6px 6px 0 0"></i><i style="flex:${w.task};background:var(--indigo)"></i><i style="flex:${w.buy};background:var(--brand);border-radius:0 0 2px 2px"></i></span><span>${w.label}</span></div>`; })}</div>
      <div class="legend mt-10"><span style="--c:var(--brand)">${t('Marketplace')}</span><span style="--c:var(--indigo)">${t('Tasks')}</span><span style="--c:var(--mari)">${t('Pick & Drop / Group')}</span></div></div></div>
    <div class="section"><h3>${t('What gets reused')}</h3><div class="card pad mt-10 col gap-6">${o.cats.map((c) => html`<div class="row"><span style="width:26px">${c.icon}</span><span class="small" style="width:130px">${c.label}</span><span class="grow" style="height:10px;border-radius:5px;background:var(--paper-2)"><span style="display:block;height:100%;width:${(c.n / catMax) * 100}%;background:var(--brand);border-radius:5px"></span></span><b class="small num" style="width:24px;text-align:right">${c.n}</b></div>`)}</div></div>
    <div class="section"><h3>${t('Sustainability')}</h3><div class="stat-grid mt-10">${K(o.impact.kgSaved + ' kg', t('Waste avoided (est.)'))}${K(o.impact.itemsReused, t('Items reused'))}${K(o.impact.helpersEarning, t('Students earning'))}${K(o.impact.donations, t('Free donations'))}</div></div>`;
}

async function reports(body) {
  let filter = body.dataset.f || 'open';
  const rs = await api('/admin/reports?status=' + filter);
  body.innerHTML = html`<div class="seg mb">${[['open', 'Open queue'], ['resolved', 'Resolved']].map(([k, l]) => html`<button class="${filter === k ? 'on' : ''}" data-f="${k}">${t(l)}</button>`)}</div>
    <p class="tiny faint mt-10">${t('Sorted by deadline. Every decision needs a written reason that both parties see.')}</p>
    <div class="col mt-10">${rs.length ? rs.map((r) => html`<div class="card pad" style="${r.overdue ? 'border-color:var(--kum)' : ''}">
      <div class="row between"><span class="pill ${r.kind === 'dispute' ? 'kum' : 'indigo'}">${r.kind === 'dispute' ? '⚖️ ' + t('Dispute') : '🛡️ ' + t('Report')} · ${r.targetType}</span>${r.status === 'open' ? html`<span class="sla small ${r.overdue ? 'late' : ''}">${icon('clock', 'ic-sm')} ${r.overdue ? t('OVERDUE') : until(r.dueAt)}</span>` : html`<span class="pill ok">${r.decision.action}</span>`}</div>
      <h3 class="mt-10">${r.reason}</h3>${r.details ? html`<p class="small muted mt-6">“${r.details}”</p>` : ''}
      <div class="row gap-16 mt-10 wrap"><div><div class="tiny faint">${t('Reported by')}</div>${who(r.reporter, { sub: false })}</div>${r.targetUser ? html`<div><div class="tiny faint">${t('Against')}</div>${who(r.targetUser, { sub: false })}<div class="tiny faint">${t('strikes')}: ${r.targetUser.strikes}/3 · ${t('trust')} ${r.targetUser.trust}</div></div>` : ''}</div>
      ${preview(r)}
      ${r.evidence ? html`<img src="${r.evidence}" alt="" class="mt-10" style="border-radius:12px;max-height:180px">` : ''}
      ${r.status === 'open' ? (r.kind === 'dispute'
        ? html`<div class="btn-row mt-16"><button class="btn sm soft" data-res="refund" data-id="${r.id}">↩️ ${t('Refund payer')}</button><button class="btn sm" data-res="release" data-id="${r.id}">✅ ${t('Release to payee')}</button></div><button class="btn sm ghost block mt-6" data-res="split" data-id="${r.id}">½ ${t('Split 50/50')}</button>`
        : html`<div class="row gap-6 wrap mt-16"><button class="btn sm ghost" data-res="dismiss" data-id="${r.id}">${t('Dismiss')}</button>${['listing', 'task', 'lostfound'].includes(r.targetType) ? html`<button class="btn sm soft" data-res="remove" data-id="${r.id}">${t('Remove post')}</button>` : ''}<button class="btn sm mari" data-res="strike" data-id="${r.id}">⚠️ ${t('Strike')}</button><button class="btn sm danger-ghost" data-res="suspend" data-id="${r.id}">${t('Suspend')}</button><button class="btn sm danger" data-res="ban" data-id="${r.id}">${t('Ban')}</button></div>`)
        : html`<div class="banner info mt-10">${icon('shield')}<div><b>${r.decision.action}</b> · <span class="tiny">${when(r.decision.at)} ${r.decision.withinSla ? '✓ ' + t('within SLA') : ''}</span><p class="small">${r.decision.reason}</p></div></div>`}</div>`) : empty('✅', t('Queue is clear'), t('No reports waiting. Nice.'))}</div>`;
  body.onclick = async (e) => {
    const f = e.target.closest('[data-f]'); if (f) { body.dataset.f = f.dataset.f; reports(body); return; }
    const b = e.target.closest('[data-res]'); if (!b) return;
    const r = rs.find((x) => x.id === b.dataset.id), action = b.dataset.res;
    const fields = [{ name: 'reason', label: t('Reason (shown to both parties)'), type: 'textarea', required: true, placeholder: t('e.g. Chat shows the seller confirmed it was working; buyer\'s photo shows missing segments.') }];
    if (r.kind === 'dispute') fields.push({ name: 'strikeUserId', label: t('Also give a strike to'), type: 'select', options: [{ value: '', label: t('No one') }, { value: r.preview?.payerId, label: r.preview?.payer?.name }, { value: r.preview?.payeeId, label: r.preview?.payee?.name }] });
    if (action === 'suspend') fields.push({ name: 'days', label: t('Days'), type: 'number', value: 3 });
    if (action === 'strike' && ['listing', 'task'].includes(r.targetType)) fields.push({ name: 'removePost', label: t('Also remove the post'), type: 'check', value: true });
    const v = await formSheet({ title: `${t('Decision')}: ${action}`, fields, ok: t('Confirm decision'), danger: ['ban', 'suspend', 'strike'].includes(action) });
    if (!v) return;
    try { await api(`/admin/reports/${r.id}/resolve`, { method: 'POST', body: { action, ...v } }); toast(t('Decision recorded & both parties notified'), 'ok'); reports(body); } catch (err) { toastErr(err); }
  };
}
function preview(r) {
  const p = r.preview; if (!p) return '';
  if (r.targetType === 'listing') return html`<a class="card pad-sm row mt-10" href="#/listing/${r.targetId}">${p.photo ? html`<img src="${p.photo}" style="width:48px;height:48px;border-radius:10px;object-fit:cover" alt="">` : ''}<span class="grow small"><b>${p.title}</b><br>₹${p.price} · ${p.status}</span></a>`;
  if (r.targetType === 'task') return html`<a class="card pad-sm mt-10" href="#/task/${r.targetId}" style="display:block"><b class="small">${p.title}</b> · ₹${p.reward}</a>`;
  if (r.targetType === 'message') return html`<div class="msg mt-10" style="max-width:100%">${p.text}</div>`;
  if (r.targetType === 'deal') return html`<div class="card pad-sm mt-10"><div class="row between"><b class="small">${p.title}</b>${statusPill(p.status)}</div><div class="tiny faint mt-6">${p.payer.name} → ${p.payee.name} · ₹${p.total} ${t('frozen')}</div>
    <details class="mt-6"><summary class="small link">${t('Chat record')} (${p.chat.length}) & ${t('timeline')}</summary><div class="col gap-4 mt-6">${p.chat.map((m) => html`<div class="tiny"><b>${m.system ? 'ℹ️' : m.from === p.payerId ? p.payer.name.split(' ')[0] : p.payee.name.split(' ')[0]}:</b> ${m.text} <span class="faint">${ago(m.at)}</span></div>`)}</div>
    <ul class="log mt-6">${p.timeline.map((e) => html`<li><time>${when(e.at)}</time><span>${e.s}${e.note ? ' — ' + e.note : ''}</span></li>`)}</ul></details></div>`;
  return '';
}

async function flags(body) {
  const fs = await api('/admin/flags');
  body.innerHTML = html`<div class="banner info">${icon('sparkle')}<div><b>${t('Automatic fraud checks')}</b><p class="small">${t('Off-platform payment attempts in chat, repeated cancellations, abnormal prices or frequent price changes, duplicate listings, prohibited-item attempts and OTP guessing.')}</p></div></div>
    <div class="col mt-10">${fs.length ? fs.map((f) => html`<div class="card pad-sm" style="${f.status === 'open' ? '' : 'opacity:.6'}"><div class="row"><span style="font-size:1.4rem">${FLAG[f.kind]?.[0] || '⚑'}</span><div class="grow"><b class="small">${t(FLAG[f.kind]?.[1] || f.kind)}</b>${f.count > 1 ? html` <span class="pill kum">×${f.count}</span>` : ''}<div class="tiny faint">${ago(f.at)} · ${f.user?.name}</div></div>${f.status === 'open' ? '' : html`<span class="pill">${f.decision?.action}</span>`}</div>
      <p class="small muted mt-6">${f.detail}</p>
      ${f.status === 'open' ? html`<div class="row gap-6 mt-10"><a class="btn xs ghost" href="#/user/${f.userId}">${t('Profile')}</a><button class="btn xs ghost" data-flag="${f.id}" data-a="dismiss">${t('Dismiss')}</button><button class="btn xs mari" data-flag="${f.id}" data-a="strike">⚠️ ${t('Strike')}</button></div>` : ''}</div>`) : empty('🟢', t('No flags'))}</div>`;
  body.onclick = async (e) => {
    const b = e.target.closest('[data-flag]'); if (!b) return;
    let reason = '';
    if (b.dataset.a === 'strike') { const v = await formSheet({ title: t('Issue strike'), fields: [{ name: 'reason', label: t('Reason (shown to the user)'), type: 'textarea', required: true }], ok: t('Issue strike'), danger: true }); if (!v) return; reason = v.reason; }
    try { await api('/admin/flags/' + b.dataset.flag, { method: 'POST', body: { action: b.dataset.a, reason } }); toast(t('Done'), 'ok'); flags(body); } catch (err) { toastErr(err); }
  };
}

async function users(body) {
  const q = body.dataset.q || '';
  const us = await api('/admin/users?q=' + encodeURIComponent(q));
  body.innerHTML = html`<form class="search" id="uq">${icon('search')}<input name="q" value="${q}" placeholder="${t('Name or college ID')}"></form>
    <div class="card list mt-10">${us.map((u) => html`<div class="li"><a href="#/user/${u.id}">${avatar(u, 38)}</a><div class="grow" style="min-width:0"><b class="small">${u.name}</b> <span class="tiny faint">${u.collegeId}</span><div class="tiny faint">${u.dept} · ${t('trust')} ${u.trust} · ${u.strikes}/3 ${t('strikes')} · ₹${u.wallet.balance}</div>${u.status !== 'active' ? html`<span class="pill kum">${u.status}</span>` : ''}</div><button class="btn xs ghost" data-u="${u.id}">${t('Action')}</button></div>`)}</div>`;
  $('#uq', body).onsubmit = (e) => { e.preventDefault(); body.dataset.q = e.target.q.value; users(body); };
  body.onclick = async (e) => {
    const b = e.target.closest('[data-u]'); if (!b) return;
    const v = await formSheet({ title: t('Moderate user'), fields: [{ name: 'action', label: t('Action'), type: 'select', options: [['strike', 'Strike (ladder: warn → suspend → ban)'], ['suspend', 'Suspend'], ['ban', 'Ban permanently'], ['reinstate', 'Reinstate']].map(([value, label]) => ({ value, label: t(label) })) }, { name: 'days', label: t('Suspension days'), type: 'number', value: 3 }, { name: 'reason', label: t('Reason (shown to the user)'), type: 'textarea', required: true }], ok: t('Apply'), danger: true });
    if (!v) return;
    try { await api('/admin/users/' + b.dataset.u, { method: 'POST', body: v }); toast(t('Applied & recorded in audit log'), 'ok'); users(body); } catch (err) { toastErr(err); }
  };
}

async function sos(body) {
  const ss = await api('/admin/sos');
  body.innerHTML = ss.length ? html`<div class="col">${ss.map((s) => html`<div class="card pad" style="${s.status === 'open' ? 'border-color:var(--kum)' : ''}"><div class="row between"><span class="pill ${s.status === 'open' ? 'kum' : 'ok'}">${s.status === 'open' ? '🚨 ' + t('OPEN') : t('Resolved')}</span><span class="tiny faint">${ago(s.at)}</span></div>
    <div class="row mt-10">${avatar(s.user, 40)}<div class="grow"><b>${s.user.name}</b><div class="small">${icon('phone', 'ic-sm')} ${s.user.phone} ${s.user.emergency ? html`· ${t('Emergency')}: ${s.user.emergency}` : ''}</div></div></div>
    <p class="small mt-10">${icon('pin', 'ic-sm')} ${s.location ? locName(s.location) : s.lat ? `GPS ${s.lat.toFixed(5)}, ${s.lng.toFixed(5)}` : t('Location not shared')}${s.note ? html` — “${s.note}”` : ''}</p>
    ${s.status === 'open' ? html`<div class="row gap-6 mt-10"><a class="btn sm danger" href="tel:${s.user.phone}">${icon('phone')} ${t('Call')}</a><button class="btn sm" data-sos="${s.id}">${t('Mark resolved')}</button></div>` : html`<p class="tiny faint mt-6">${s.resolution}</p>`}</div>`)}</div>` : empty('🛟', t('No SOS alerts'), t('Alerts appear here instantly with sound-free banners.'));
  body.onclick = async (e) => { const b = e.target.closest('[data-sos]'); if (!b) return; const v = await formSheet({ title: t('Resolve SOS'), fields: [{ name: 'note', label: t('What was done?'), required: true }], ok: t('Resolve') }); if (v) { await api('/admin/sos/' + b.dataset.sos, { method: 'POST', body: v }); sos(body); } };
}

async function settings(body) {
  const s = await api('/admin/settings');
  const F = [['feePercent', 'Platform fee %'], ['feeMin', 'Minimum fee ₹'], ['feeMax', 'Maximum fee ₹'], ['maxItemPrice', 'Max price per item ₹'], ['maxTaskReward', 'Max reward per task ₹'], ['dailyLimit', 'Daily limit per user ₹'], ['helperActiveCap', 'Active jobs per helper'], ['urgentPerDay', 'Urgent posts per user per day'], ['offerExpiryHours', 'Offer expiry (hours)'], ['autoReleaseHours', 'Auto-release after delivery (hours)'], ['disputeSlaHours', 'Report review SLA (hours)'], ['strikeSuspendDays', 'Suspension length on 2nd strike (days)'], ['maxTaskDays', 'Max task deadline (days)']];
  body.innerHTML = html`<p class="small muted">${t('Changes apply instantly for everyone and are shown in the in-app rules. Each change is audit-logged.')}</p>
    <form id="sf" class="mt-16">${F.map(([k, l]) => html`<label class="f"><span>${t(l)}</span><input class="in" type="number" name="${k}" value="${s[k]}" min="0" step="any"></label>`)}
      <div class="row gap-16"><label class="f grow"><span>${t('Campus opens')}</span><input class="in" type="time" name="campusOpen" value="${s.campusOpen}"></label><label class="f grow"><span>${t('Campus closes')}</span><input class="in" type="time" name="campusClose" value="${s.campusClose}"></label></div>
      <label class="check"><input type="checkbox" name="enforceHours" ${s.enforceHours ? 'checked' : ''}><span>${t('Enforce campus hours for tasks & deliveries')}</span></label>
      <button class="btn block mt-16">${t('Save rules')}</button></form>`;
  $('#sf', body).onsubmit = async (e) => {
    e.preventDefault();
    const v = Object.fromEntries(new FormData(e.target)); v.enforceHours = e.target.enforceHours.checked;
    for (const [k] of F) v[k] = +v[k];
    try { await api('/admin/settings', { method: 'PATCH', body: v }); store.config = await api('/config'); toast(t('Rules updated for everyone'), 'ok'); } catch (err) { toastErr(err); }
  };
}

async function announce(body) {
  const c = await api('/community');
  body.innerHTML = html`<form id="af" class="card pad"><h3>${t('New announcement')}</h3>
    <label class="f mt-10"><span>${t('Title')}</span><input class="in" name="title" required maxlength="80"></label>
    <label class="f"><span>${t('Message')}</span><textarea class="in" name="body" maxlength="400"></textarea></label>
    <div class="row gap-16"><label class="f grow"><span>${t('Type')}</span><select class="in" name="kind"><option value="info">${t('Info')}</option><option value="alert">${t('Safety alert')}</option></select></label><label class="check" style="padding-top:28px"><input type="checkbox" name="pinned"><span>${t('Pin')}</span></label></div>
    <button class="btn block">${icon('send')} ${t('Publish to everyone')}</button></form>
    <div class="col mt-16">${c.announcements.map((a) => html`<div class="ann ${a.kind}">${icon('info')}<div class="grow"><b>${a.title}</b><p>${a.body}</p><p class="tiny">${ago(a.at)}</p></div><button class="iconbtn" data-del="${a.id}" aria-label="${t('Delete')}">${icon('trash')}</button></div>`)}</div>`;
  $('#af', body).onsubmit = async (e) => { e.preventDefault(); const v = Object.fromEntries(new FormData(e.target)); v.pinned = e.target.pinned.checked; try { await api('/admin/announcements', { method: 'POST', body: v }); toast(t('Published'), 'ok'); announce(body); } catch (err) { toastErr(err); } };
  body.onclick = async (e) => { const b = e.target.closest('[data-del]'); if (b && await confirmSheet({ title: t('Delete announcement?'), danger: true, ok: t('Delete') })) { await api('/admin/announcements/' + b.dataset.del, { method: 'DELETE' }); announce(body); } };
}

async function audit(body) {
  const a = await api('/admin/audit');
  body.innerHTML = html`<p class="small muted">${t('Every moderation decision and rule change, with who made it and why.')}</p><ul class="log card pad mt-10">${a.map((x) => html`<li><time>${when(x.at)}</time><span><b>${x.action}</b> · ${x.byUser || t('system')}${x.reason ? html`<br><span class="muted">${x.reason}</span>` : ''}</span></li>`)}</ul>`;
}
