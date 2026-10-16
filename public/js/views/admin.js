import { html, $, icon, store, api, t, ago, when, until, avatar, who, empty, skeleton, formSheet, confirmSheet, toast, toastErr, statusPill, locName, on, breakdownBox } from '../core.js';

const TABS = [['overview', 'Overview'], ['reports', 'Complaints'], ['vendors', 'Reported vendors'], ['appeals', 'Appeals'], ['lostfound', 'Lost & found'], ['flags', 'Auto-flags'], ['users', 'Users'], ['sos', 'SOS'], ['settings', 'Rules & limits'], ['announce', 'Announce'], ['audit', 'Audit log']];
const FLAG = { offplatform: ['💸', 'Off-platform payment'], cancellations: ['↩️', 'Repeated cancellations'], price: ['📈', 'Price manipulation'], duplicate: ['🪞', 'Duplicate listing'], prohibited: ['🚫', 'Prohibited attempt'], otp: ['🔢', 'OTP guessing'], reports_threshold: ['📣', 'Report threshold reached'], report_abuse: ['🎭', 'Unreliable reporting'] };

export async function main({ root, params, query, setTop }) {
  if (!store.me.isAdmin) { root.innerHTML = empty('🔒', t('Admins only')).s; return; }
  const tab = params.tab || 'overview';
  setTop({ back: true, title: t('Admin panel') });
  root.innerHTML = html`<div class="tabs">${TABS.map(([k, l]) => html`<button class="${k === tab ? 'on' : ''}" data-go="#/admin/${k}">${t(l)}</button>`)}</div><div id="body">${skeleton(4)}</div>`;
  const body = $('#body', root);
  const R = { overview, reports, vendors, appeals, lostfound: lostfoundDesk, flags, users, sos, settings, announce, audit }[tab];
  if (!R) { location.hash = '#/admin'; return; }
  await R(body, query);
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
    ${k.openReports || k.openSos || k.openAppeals || k.lostFoundPending ? html`<div class="banner bad">${icon('alert')}<div><b>${k.openReports} ${t('open complaints')} · ${k.vendorsFlagged} ${t('vendors to review')} · ${k.openAppeals} ${t('appeals')} · ${k.openFlags} ${t('auto-flags')} · ${k.openSos} SOS</b><p class="small"><a class="link" href="#/admin/reports">${t('Complaints queue')} →</a> · <a class="link" href="#/admin/vendors">${t('Vendors')} →</a>${k.openAppeals ? html` · <a class="link" href="#/admin/appeals">${t('Appeals')} →</a>` : ''}${k.lostFoundPending ? html` · <a class="link" href="#/admin/lostfound">📦 ${k.lostFoundPending} ${t('lost & found to handle')} →</a>` : ''}</p></div></div>` : ''}
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

// ---------- complaints: reports + disputes queue with search, filters, sorting and pagination
const RSTATUS = { open: ['mari', 'Pending'], under_review: ['indigo', 'Under review'], resolved: ['ok', 'Resolved'], dismissed: ['', 'Dismissed'] };
export const reportStatusPill = (s) => html`<span class="pill ${RSTATUS[s]?.[0] || ''}">${t(RSTATUS[s]?.[1] || s)}</span>`;
const RISK = { high: ['kum', 'High risk'], medium: ['mari', 'Medium risk'], low: ['ok', 'Low risk'] };
const riskPill = (st) => (st ? html`<span class="pill ${RISK[st.risk.level][0]}" title="${t('Based on independent reports, upheld complaints and strikes')}">${t(RISK[st.risk.level][1])}</span>` : '');
const riskLine = (st) => (st ? html`<div class="tiny faint mt-6">${st.independent} ${t('independent reporters')} · ${st.open} ${t('open')} · ${st.upheld} ${t('upheld')} · ${st.strikes}/3 ${t('strikes')}${st.needsReview ? html` · <b style="color:var(--kum)">${t('review threshold reached')}</b>` : ''}</div>` : '');
const SIGNAL = [['interacted', 'ok', '✓ Dealt with this vendor'], ['newAccount', 'mari', '⚠ New account'], ['massReporting', 'kum', '⚠ Reported many members today'], ['lowAccuracy', 'kum', '⚠ Most past reports dismissed'], ['coordinated', 'kum', '⚠ Part of a report burst']];
const signalPills = (s) => (s ? SIGNAL.filter(([k]) => s[k]).map(([, c, l]) => html`<span class="pill ${c}">${t(l)}</span>`) : '');
const ACTIONS = { dismiss: 'Dismiss', warn: 'Warn', correct: 'Request correction', restrict: 'Restrict listings', remove: 'Remove post', strike: 'Strike', suspend: 'Suspend', ban: 'Ban', lift_restriction: 'Lift restriction', reinstate: 'Reinstate' };

// Collects the reason (and extra fields) for a moderation action; suspensions and bans need a second, explicit confirmation.
async function decide(action, { name = t('this member'), post = false } = {}) {
  const fields = [{ name: 'reason', label: action === 'dismiss' ? t('Reason (shown to the reporter)') : t('Reason (shown to the member and recorded in the audit log)'), type: 'textarea', required: true }];
  if (action === 'correct') fields.unshift({ name: 'correction', label: t('What must they correct?'), type: 'textarea', required: true, placeholder: t('e.g. Replace the stock photos with your own pictures of the item') }, { name: 'days', label: t('Days to correct'), type: 'number', value: 3 });
  if (action === 'restrict') fields.push({ name: 'days', label: t('Days (0 = until a moderator lifts it)'), type: 'number', value: 7 });
  if (action === 'suspend') fields.push({ name: 'days', label: t('Suspension days'), type: 'number', value: 3 });
  if (action === 'strike' && post) fields.push({ name: 'removePost', label: t('Also remove the post'), type: 'check', value: true });
  const intro = action === 'dismiss' ? t('Use this when the report is false or not supported by evidence.') : t('Reports are not proof on their own — act on evidence. A high price alone is not a violation. The member is notified and can appeal.');
  const v = await formSheet({ title: `${t(ACTIONS[action] || action)} · ${name}`, intro, fields, ok: t('Confirm decision'), danger: ['ban', 'suspend', 'strike', 'restrict'].includes(action) });
  if (!v) return null;
  if (action === 'suspend' || action === 'ban') {
    const sure = await confirmSheet({
      title: action === 'ban' ? `${t('Permanently ban')} ${name}?` : `${t('Suspend')} ${name} ${t('for')} ${v.days || 3} ${t('days')}?`,
      body: t('They will not be able to post, make or accept offers until this is lifted. Their records, reports and transactions are kept. They are notified with your reason and can appeal.'),
      ok: action === 'ban' ? t('Ban account') : t('Suspend account'), danger: true,
    });
    if (!sure) return null;
  }
  return v;
}
const pager = (d) => (d.pages > 1 ? html`<div class="row between mt-16"><button class="btn sm ghost" data-pg="-1" ${d.page <= 1 ? 'disabled' : ''}>← ${t('Prev')}</button><span class="small faint">${t('Page')} ${d.page} / ${d.pages} · ${d.total}</span><button class="btn sm ghost" data-pg="1" ${d.page >= d.pages ? 'disabled' : ''}>${t('Next')} →</button></div>` : html`<p class="tiny faint center mt-16">${d.total} ${t('total')}</p>`);

function complaintCard(r) {
  const open = r.status === 'open' || r.status === 'under_review';
  const post = ['listing', 'task', 'lostfound'].includes(r.targetType);
  return html`<div class="card pad" style="${r.overdue ? 'border-color:var(--kum)' : ''}">
    <div class="row between wrap gap-6"><span class="row gap-4 wrap"><span class="pill ${r.kind === 'dispute' ? 'kum' : 'indigo'}">${r.kind === 'dispute' ? '⚖️ ' + t('Dispute') : '🛡️ ' + t('Report')} · ${r.targetType}</span>${reportStatusPill(r.status)}</span>${open ? html`<span class="sla small ${r.overdue ? 'late' : ''}">${icon('clock', 'ic-sm')} ${r.overdue ? t('OVERDUE') : until(r.dueAt)}</span>` : ''}</div>
    <h3 class="mt-10">${t(r.categoryLabel || r.reason)}</h3>${r.details ? html`<p class="small muted mt-6">“${r.details}”</p>` : ''}
    <p class="tiny faint mt-6">${t('Filed')} ${when(r.createdAt)}${r.dealRef || r.dealId ? html` · <a class="link" href="#/deal/${r.dealRef || r.dealId}">${t('Related deal')}</a>` : ''}</p>
    <div class="row gap-16 mt-10 wrap" style="align-items:flex-start">
      <div><div class="tiny faint">${t('Reported by')}</div>${who(r.reporter, { sub: false })}<div class="row gap-4 wrap mt-6">${signalPills(r.signals)}</div></div>
      ${r.targetUser ? html`<div><div class="tiny faint">${t('Against')}</div>${who(r.targetUser, { sub: false })}<div class="row gap-4 wrap mt-6">${riskPill(r.vendorStats)}${r.targetUser.status !== 'active' ? html`<span class="pill kum">${r.targetUser.status}</span>` : ''}${r.vendorRestricted ? html`<span class="pill mari">${t('Listings restricted')}</span>` : ''}</div>${riskLine(r.vendorStats)}${r.kind === 'report' ? html`<a class="link tiny" href="#/admin/vendor/${r.targetUser.id}">${t('Open vendor case')} →</a>` : ''}</div>` : ''}</div>
    ${preview(r)}
    ${r.preview?.fair && r.category === 'pricing' ? html`<p class="tiny faint mt-6">${icon('sparkle', 'ic-sm')} ${t('Similar items on campus')}: ₹${r.preview.fair.low}–₹${r.preview.fair.high}. ${t('A high price alone is not a violation — look for misleading or changed terms.')}</p>` : ''}
    ${r.evidence ? html`<a href="${r.evidence}" target="_blank" rel="noopener"><img src="${r.evidence}" alt="${t('Evidence')}" class="mt-10" style="border-radius:12px;max-height:180px"></a>` : ''}
    <details class="mt-10"><summary class="small link">${t('Internal notes')} (${r.notes?.length || 0})</summary>
      <ul class="log mt-6">${(r.notes || []).map((n) => html`<li><time>${when(n.at)}</time><span><b>${n.byName || ''}</b> ${n.text}</span></li>`)}</ul>
      <form class="row gap-6 mt-6" data-note="${r.id}"><input class="in" name="text" placeholder="${t('Visible to moderators only')}" maxlength="1000" required><button class="btn sm">${t('Add')}</button></form></details>
    ${open ? (r.kind === 'dispute'
      ? html`<div class="btn-row mt-16"><button class="btn sm soft" data-res="refund" data-id="${r.id}">↩️ ${t('Refund payer')}</button><button class="btn sm" data-res="release" data-id="${r.id}">✅ ${t('Release to payee')}</button></div><button class="btn sm ghost block mt-6" data-res="split" data-id="${r.id}">½ ${t('Split 50/50')}</button>`
      : html`<div class="row gap-6 wrap mt-16">${r.status === 'open' ? html`<button class="btn sm soft" data-review="${r.id}">${icon('eye')} ${t('Start review')}</button>` : ''}<button class="btn sm ghost" data-res="dismiss" data-id="${r.id}">${t('Dismiss')}</button>
        ${r.targetUser ? html`<button class="btn sm ghost" data-res="warn" data-id="${r.id}">${t('Warn')}</button><button class="btn sm ghost" data-res="correct" data-id="${r.id}">${t('Request correction')}</button><button class="btn sm ghost" data-res="restrict" data-id="${r.id}">${t('Restrict listings')}</button>` : ''}
        ${post ? html`<button class="btn sm soft" data-res="remove" data-id="${r.id}">${t('Remove post')}</button>` : ''}
        ${r.targetUser ? html`<button class="btn sm mari" data-res="strike" data-id="${r.id}">⚠️ ${t('Strike')}</button><button class="btn sm danger-ghost" data-res="suspend" data-id="${r.id}">${t('Suspend')}</button><button class="btn sm danger" data-res="ban" data-id="${r.id}">${t('Ban')}</button>` : ''}</div>`)
      : html`<div class="banner info mt-10">${icon('shield')}<div><b>${t(ACTIONS[r.decision.action] || r.decision.action)}</b> · <span class="tiny">${when(r.decision.at)} ${r.decision.withinSla ? '✓ ' + t('within SLA') : ''}</span><p class="small">${r.decision.reason}</p>${r.decision.overturned ? html`<p class="small" style="color:var(--kum)">${t('Overturned on appeal')}: ${r.decision.overturned.reason}</p>` : ''}</div></div>`}</div>`;
}

async function reports(body, query = {}) {
  const st = body._st ||= { q: '', status: 'active', category: '', kind: 'all', sort: 'priority', page: 1, vendor: query.vendor || '' };
  const qs = new URLSearchParams({ page: st.page, status: st.status, sort: st.sort, kind: st.kind, ...(st.q ? { q: st.q } : {}), ...(st.category ? { category: st.category } : {}), ...(st.vendor ? { vendor: st.vendor } : {}) });
  if (!body.querySelector('#clist')) body.innerHTML = skeleton(4).s;
  let d;
  try { d = await api('/admin/reports?' + qs); } catch (e) { body.innerHTML = html`<div class="banner bad">${icon('alert')}<div><b>${t('Could not load complaints')}</b><p class="small">${e.message}</p><button class="btn sm ghost mt-6" data-retry>${t('Try again')}</button></div></div>`.s; body.onclick = (ev) => ev.target.closest('[data-retry]') && reports(body, query); return; }
  const cats = store.config.reportCategories || [];
  body.innerHTML = html`<form class="search" id="cq">${icon('search')}<input name="q" value="${st.q}" placeholder="${t('Search reason, member or item…')}" aria-label="${t('Search complaints')}"></form>
    <div class="chips mt-10">${[['active', 'Open'], ['open', 'Pending'], ['under_review', 'Under review'], ['resolved', 'Resolved'], ['dismissed', 'Dismissed'], ['all', 'All']].map(([k, l]) => html`<button class="chip ${st.status === k ? 'on' : ''}" data-st="${k}">${t(l)} <span class="faint">${d.counts[k === 'open' ? 'pending' : k] ?? ''}</span></button>`)}</div>
    <div class="row gap-6 mt-10 wrap">
      <select class="in" id="ccat" style="flex:2;min-width:150px" aria-label="${t('Reason')}"><option value="">${t('All reasons')}</option>${cats.map((c) => html`<option value="${c.id}" ${st.category === c.id ? 'selected' : ''}>${t(c.en)}</option>`)}</select>
      <select class="in" id="ckind" style="flex:1;min-width:110px" aria-label="${t('Type')}">${[['all', 'All types'], ['report', 'Reports'], ['dispute', 'Disputes']].map(([k, l]) => html`<option value="${k}" ${st.kind === k ? 'selected' : ''}>${t(l)}</option>`)}</select>
      <select class="in" id="csort" style="flex:1;min-width:110px" aria-label="${t('Sort')}">${[['priority', 'Priority'], ['due', 'Deadline'], ['newest', 'Newest'], ['oldest', 'Oldest']].map(([k, l]) => html`<option value="${k}" ${st.sort === k ? 'selected' : ''}>${t(l)}</option>`)}</select></div>
    ${st.vendor ? html`<div class="row between mt-10"><span class="pill indigo">${t('Filtered to one vendor')}</span><button class="link small" data-clearv>${t('Show all')}</button></div>` : ''}
    <p class="tiny faint mt-10">${t('Priority puts vendors with several independent complaints first. A report starts an investigation — it is not proof.')}</p>
    <div class="col mt-10" id="clist">${d.items.length ? d.items.map(complaintCard) : empty('✅', t('Nothing here'), st.q || st.category ? t('No complaints match these filters.') : t('No complaints in this view.'))}</div>
    ${pager(d)}`;
  const reload = (patch = {}) => { Object.assign(st, { page: 1 }, patch); reports(body, query); };
  $('#cq', body).onsubmit = (e) => { e.preventDefault(); reload({ q: e.target.q.value.trim() }); };
  $('#ccat', body).onchange = (e) => reload({ category: e.target.value });
  $('#ckind', body).onchange = (e) => reload({ kind: e.target.value });
  $('#csort', body).onchange = (e) => reload({ sort: e.target.value });
  body.onsubmit = async (e) => {
    const f = e.target.closest('[data-note]'); if (!f) return;
    e.preventDefault();
    try { await api(`/admin/reports/${f.dataset.note}/notes`, { method: 'POST', body: { text: f.text.value } }); toast(t('Note added'), 'ok'); reports(body, query); } catch (err) { toastErr(err); }
  };
  body.onclick = async (e) => {
    const s = e.target.closest('[data-st]'); if (s) return reload({ status: s.dataset.st });
    const pg = e.target.closest('[data-pg]'); if (pg) { st.page += +pg.dataset.pg; return reports(body, query); }
    if (e.target.closest('[data-clearv]')) return reload({ vendor: '' });
    const rv = e.target.closest('[data-review]');
    if (rv) { rv.disabled = true; try { await api(`/admin/reports/${rv.dataset.review}/review`, { method: 'POST' }); toast(t('Marked under review — reporter notified'), 'ok'); reports(body, query); } catch (err) { rv.disabled = false; toastErr(err); } return; }
    const b = e.target.closest('[data-res]'); if (!b) return;
    const r = d.items.find((x) => x.id === b.dataset.id), action = b.dataset.res;
    let v;
    if (r.kind === 'dispute') {
      v = await formSheet({ title: `${t('Decision')}: ${action}`, fields: [{ name: 'reason', label: t('Reason (shown to both parties)'), type: 'textarea', required: true, placeholder: t('e.g. Chat shows the seller confirmed it was working; buyer\'s photo shows missing segments.') }, { name: 'strikeUserId', label: t('Also give a strike to'), type: 'select', options: [{ value: '', label: t('No one') }, { value: r.preview?.payerId, label: r.preview?.payer?.name }, { value: r.preview?.payeeId, label: r.preview?.payee?.name }] }], ok: t('Confirm decision') });
    } else v = await decide(action, { name: r.targetUser?.name, post: ['listing', 'task'].includes(r.targetType) });
    if (!v) return;
    b.disabled = true;
    try { await api(`/admin/reports/${r.id}/resolve`, { method: 'POST', body: { action, ...v } }); toast(t('Decision recorded & both parties notified'), 'ok'); reports(body, query); } catch (err) { b.disabled = false; toastErr(err); }
  };
}

// ---------- reported vendors: who customers complain about, ranked by risk
async function vendors(body) {
  const st = body._vs ||= { q: '', risk: 'reported', sort: 'risk', page: 1 };
  const qs = new URLSearchParams({ page: st.page, sort: st.sort, ...(st.q ? { q: st.q } : {}), ...(st.risk === 'review' ? { review: '1' } : st.risk === 'reported' ? { reported: '1' } : st.risk ? { risk: st.risk } : {}) });
  let d;
  try { d = await api('/admin/vendors?' + qs); } catch (e) { body.innerHTML = html`<div class="banner bad">${icon('alert')}<div><b>${t('Could not load vendors')}</b><p class="small">${e.message}</p></div></div>`.s; return; }
  const sm = d.summary || {};
  body.innerHTML = html`<div class="stat-grid"><div class="card stat hi"><b class="num">${sm.reported ?? 0}</b><span>${t('Reported vendors')}</span></div><div class="card stat"><b class="num">${sm.openReports ?? 0}</b><span>${t('Open complaints')}</span></div><div class="card stat"><b class="num">${sm.needsReview ?? 0}</b><span>${t('Needs review')}</span></div></div>
    <form class="search mt-16" id="vq">${icon('search')}<input name="q" value="${st.q}" placeholder="${t('Name or college ID')}"></form>
    <div class="chips mt-10">${[['reported', 'Reported'], ['review', 'Needs review'], ['high', 'High risk'], ['medium', 'Medium'], ['low', 'Low'], ['', 'All moderated']].map(([k, l]) => html`<button class="chip ${st.risk === k ? 'on' : ''}" data-risk="${k}">${t(l)}</button>`)}</div>
    <div class="row gap-6 mt-10"><select class="in" id="vsort" aria-label="${t('Sort')}">${[['risk', 'Highest risk'], ['reports', 'Most reports'], ['open', 'Most open'], ['recent', 'Latest report'], ['name', 'Name']].map(([k, l]) => html`<option value="${k}" ${st.sort === k ? 'selected' : ''}>${t(l)}</option>`)}</select></div>
    <p class="tiny faint mt-10">${t('Vendors customers have reported. Risk ranks investigations — it never triggers a penalty by itself.')}</p>
    <div class="card list mt-10">${d.items.length ? d.items.map((v) => html`<a class="li" href="#/admin/vendor/${v.id}" style="align-items:flex-start">${avatar(v, 38)}<div class="grow" style="min-width:0"><b class="small">${v.name}</b> <span class="tiny faint">${v.collegeId} · ${v.dept}</span>
      <div class="row gap-4 wrap mt-6">${riskPill(v.report)}${v.report.needsReview ? html`<span class="pill kum">${t('Needs review')}</span>` : ''}${v.status !== 'active' ? html`<span class="pill kum">${v.status}</span>` : ''}${v.restriction ? html`<span class="pill mari">${t('Listings restricted')}</span>` : ''}</div>
      ${v.digest?.top.length ? html`<div class="row gap-4 wrap mt-6">${v.digest.top.map((c) => html`<span class="pill">${t(c.label)} × ${c.n}</span>`)}</div>` : ''}
      <div class="tiny faint mt-6">${v.report.total} ${t('reports')} · ${v.digest?.reporters ?? 0} ${t('customers')} · ${v.report.open} ${t('open')} · ${v.report.upheld} ${t('upheld')} · ${v.report.strikes}/3 ${t('strikes')}${v.digest?.disputes ? html` · ${v.digest.disputes} ${t('disputes')}${v.digest.openDisputes ? ` (${v.digest.openDisputes} ${t('open')})` : ''}` : ''}</div>
      ${v.digest?.lastAt ? html`<div class="tiny faint mt-6">${t('Last reported')} ${ago(v.digest.lastAt)}</div>` : ''}</div>${icon('chev', 'chev')}</a>`) : html`<div class="pad">${empty('🟢', t('No vendors in this view'))}</div>`}</div>${pager(d)}`;
  $('#vq', body).onsubmit = (e) => { e.preventDefault(); Object.assign(st, { q: e.target.q.value.trim(), page: 1 }); vendors(body); };
  $('#vsort', body).onchange = (e) => { Object.assign(st, { sort: e.target.value, page: 1 }); vendors(body); };
  body.onclick = (e) => {
    const r = e.target.closest('[data-risk]'); if (r) { Object.assign(st, { risk: r.dataset.risk, page: 1 }); vendors(body); }
    const pg = e.target.closest('[data-pg]'); if (pg) { st.page += +pg.dataset.pg; vendors(body); }
  };
}

// ---------- one vendor's case file
export async function vendor({ root, params, setTop }) {
  if (!store.me.isAdmin) { root.innerHTML = empty('🔒', t('Admins only')).s; return; }
  setTop({ back: true, title: t('Vendor case') });
  root.innerHTML = skeleton(4).s;
  const v = await api('/admin/vendors/' + params.id);
  const s = v.report;
  const K = (n, l) => html`<div class="card stat"><b class="num">${n}</b><span>${l}</span></div>`;
  root.innerHTML = html`
    <div class="card pad mt-6"><div class="row">${avatar(v, 56)}<div class="grow"><a href="#/user/${v.id}"><b>${v.name}</b></a><div class="small muted">${v.collegeId} · ${v.dept} · ${t('trust')} ${v.trust}</div>
      <div class="row gap-4 wrap mt-6"><span class="pill ${v.status === 'active' ? 'ok' : 'kum'}">${v.status === 'active' ? t('Active') : v.status}</span>${riskPill(s)}${v.restriction ? html`<span class="pill mari">${t('Listings restricted')}${v.restriction.until ? ' · ' + t('until') + ' ' + when(v.restriction.until) : ''}</span>` : ''}<span class="pill">${s.strikes}/3 ${t('strikes')}</span></div></div></div>
      ${v.status !== 'active' ? html`<p class="small mt-10">${t('Reason')}: ${v.statusReason}${v.suspendedUntil && v.status === 'suspended' ? ` · ${t('until')} ${when(v.suspendedUntil)}` : ''}</p>` : ''}</div>
    ${s.needsReview ? html`<div class="banner bad mt-10">${icon('alert')}<div><b>${t('Review threshold reached')}</b><p class="small">${s.independent} ${t('independent credible reporters in')} ${s.windowDays} ${t('days (threshold')} ${s.threshold}). ${t('Investigate the evidence before acting — reports alone do not prove a violation.')}</p></div></div>` : ''}
    <div class="stat-grid mt-10">${K(s.total, t('Reports'))}${K(s.open, t('Open'))}${K(s.independent, t('Independent reporters'))}${K(s.withDeal, t('Reporters with a deal'))}${K(s.upheld, t('Upheld'))}${K(s.dismissed, t('Dismissed'))}</div>
    <div class="section"><h3>${t('Actions')}</h3><div class="row gap-6 wrap mt-10">
      <button class="btn sm ghost" data-act="warn">${t('Warn')}</button><button class="btn sm ghost" data-act="correct">${t('Request correction')}</button>
      ${v.restriction ? html`<button class="btn sm soft" data-act="lift_restriction">${t('Lift restriction')}</button>` : html`<button class="btn sm ghost" data-act="restrict">${t('Restrict listings')}</button>`}
      <button class="btn sm mari" data-act="strike">⚠️ ${t('Strike')}</button>
      ${v.status === 'active' ? html`<button class="btn sm danger-ghost" data-act="suspend">${t('Suspend')}</button><button class="btn sm danger" data-act="ban">${t('Ban')}</button>` : html`<button class="btn sm" data-act="reinstate">${t('Reinstate')}</button>`}</div></div>
    <div class="section"><div class="section-h"><h3>${t('Reports & disputes')} <span class="faint">${v.reports.length}</span></h3><a class="link small" href="#/admin/reports?vendor=${v.id}">${t('Review in queue')} →</a></div>
      <div class="card list mt-10">${v.reports.length ? v.reports.map((r) => html`<div class="li" style="align-items:flex-start"><div class="grow" style="min-width:0"><div class="row gap-4 wrap">${reportStatusPill(r.status)}<b class="small">${t(r.categoryLabel)}</b></div>
        <div class="tiny faint mt-6">${r.reporter?.name} · ${when(r.createdAt)} ${r.preview?.title ? '· ' + r.preview.title : ''}</div>${r.details ? html`<p class="small muted mt-6 clamp2">${r.details}</p>` : ''}<div class="row gap-4 wrap mt-6">${signalPills(r.signals)}</div>
        ${r.decision ? html`<p class="tiny mt-6">→ ${t(ACTIONS[r.decision.action] || r.decision.action)}: ${r.decision.reason}</p>` : ''}</div>${r.evidence ? html`<img src="${r.evidence}" alt="" style="width:48px;height:48px;border-radius:10px;object-fit:cover">` : ''}</div>`) : html`<div class="pad small muted">${t('No complaints.')}</div>`}</div></div>
    <div class="section"><h3>${t('Moderation history')}</h3>${v.history.length ? html`<ul class="log card pad mt-10">${v.history.map((m) => html`<li><time>${when(m.at)}</time><span><b>${t(m.title)}</b> · ${m.byName || t('system')}<br><span class="muted">${m.reason}</span>
      ${m.correction ? html`<br><span class="tiny">${t('Correction')}: ${m.correction.text} — ${m.correction.doneAt ? '✓ ' + t('done') + ' ' + when(m.correction.doneAt) + (m.correction.note ? ` (“${m.correction.note}”)` : '') : t('due') + ' ' + when(m.correction.dueAt)}</span>` : ''}
      ${m.appeal ? html`<br><span class="tiny">${t('Appeal')}: ${m.appeal.status}${m.appeal.decision ? ' — ' + m.appeal.decision.reason : ''}</span>` : ''}${m.rescinded ? html`<br><span class="tiny" style="color:var(--ok)">${t('Reversed')} ${when(m.rescinded.at)}</span>` : ''}</span></li>`)}</ul>` : html`<p class="small muted mt-6">${t('No previous actions — clean record.')}</p>`}</div>
    <div class="section"><h3>${t('Listings')} <span class="faint">${v.listings.length}</span></h3><div class="card list mt-10">${v.listings.length ? v.listings.map((l) => html`<a class="li" href="#/listing/${l.id}">${l.photo ? html`<img src="${l.photo}" alt="" style="width:40px;height:40px;border-radius:10px;object-fit:cover">` : ''}<span class="grow small">${l.title}<div class="tiny faint">₹${l.price} · ${l.status}${l.removedReason ? ' · ' + l.removedReason : ''}</div></span></a>`) : html`<div class="pad small muted">${t('No listings.')}</div>`}</div></div>`;
  root.onclick = async (e) => {
    const b = e.target.closest('[data-act]'); if (!b) return;
    const v2 = await decide(b.dataset.act, { name: v.name });
    if (!v2) return;
    b.disabled = true;
    try { await api('/admin/users/' + v.id, { method: 'POST', body: { action: b.dataset.act, ...v2 } }); toast(t('Applied, member notified & audit-logged'), 'ok'); vendor({ root, params, setTop }); } catch (err) { b.disabled = false; toastErr(err); }
  };
}

// ---------- lost & found desk: receive handed-in items, publish them, verify claims, hand over against college ID
const LF = { pending: ['mari', 'Waiting for item'], held: ['indigo', 'At desk · posted'], ready: ['ok', 'Ready for pickup'], returned: ['ok', 'Returned'], rejected: ['', 'Rejected'], withdrawn: ['', 'Withdrawn'] };
const LFC = { pending: ['mari', 'Pending'], approved: ['ok', 'Approved'], rejected: ['kum', 'Rejected'] };
async function lostfoundDesk(body) {
  const st = body._lf ||= { status: 'action' };
  const d = await api('/admin/lostfound?status=' + st.status);
  const pill = (m, s) => html`<span class="pill ${m[s]?.[0] || ''}">${t(m[s]?.[1] || s)}</span>`;
  body.innerHTML = html`<div class="chips">${[['action', 'Needs action'], ['pending', 'Waiting for item'], ['held', 'Posted'], ['ready', 'Ready for pickup'], ['returned', 'Returned'], ['rejected', 'Rejected'], ['all', 'All']].map(([k, l]) => html`<button class="chip ${st.status === k ? 'on' : ''}" data-lfs="${k}">${t(l)} <span class="faint">${d.counts[k] ?? ''}</span></button>`)}</div>
    <p class="tiny faint mt-10">${t('Post an item only after it physically reaches the desk. Verify claims against the finder’s private detail, and check the owner’s college ID at pickup.')}</p>
    <div class="col mt-10">${d.items.length ? d.items.map((x) => html`<div class="card pad">
      <div class="row between wrap gap-6"><span class="row gap-4 wrap">${pill(LF, x.status)}${x.showPhoto === false ? html`<span class="pill">${t('Photo hidden')}</span>` : ''}</span><span class="tiny faint">${when(x.at)}</span></div>
      <div class="row gap-10 mt-10" style="align-items:flex-start">${x.photo ? html`<img src="${x.photo}" alt="" style="width:80px;height:80px;border-radius:12px;object-fit:cover">` : ''}
        <div class="grow" style="min-width:0"><h3>${x.title}</h3>${x.desc ? html`<p class="small muted mt-6">${x.desc}</p>` : ''}
          <p class="tiny faint mt-6">${icon('pin', 'ic-sm')} ${locName(x.location)}${x.when ? ` · ${x.when}` : ''}</p></div></div>
      ${x.secret ? html`<div class="banner warn mt-10">${icon('eye')}<div><b>${t('Private detail from finder')}</b><p class="small">${x.secret}</p></div></div>` : ''}
      <div class="mt-10"><div class="tiny faint">${t('Handed in by')}</div>${who(x.finder, { sub: false })}</div>
      ${x.receivedByName ? html`<p class="tiny faint mt-6">${t('Received by')} ${x.receivedByName} · ${when(x.receivedAt)}</p>` : ''}
      ${x.rejectReason ? html`<p class="small mt-6">${t('Reason')}: ${x.rejectReason}</p>` : ''}
      ${x.claims.length ? html`<div class="section"><h4>${t('Claims')} <span class="faint">${x.claims.length}</span></h4><div class="col mt-6">${x.claims.map((c) => html`<div class="card pad-sm">
        <div class="row between wrap gap-6">${who(c.user, { sub: false })}${pill(LFC, c.status)}</div>
        <p class="tiny faint mt-6">${c.collegeId || ''} · ${when(c.at)}</p><p class="small mt-6">“${c.proof}”</p>${c.reason ? html`<p class="tiny faint mt-6">→ ${c.reason}</p>` : ''}
        ${c.status === 'pending' && x.status === 'held' ? html`<div class="row gap-6 mt-10"><button class="btn sm" data-lfapprove="${x.id}" data-cid="${c.id}">✅ ${t('Approve claim')}</button><button class="btn sm ghost" data-lfdeny="${x.id}" data-cid="${c.id}">${t('Reject')}</button></div>` : ''}</div>`)}</div></div>` : ''}
      ${x.status === 'pending' ? html`<div class="row gap-6 mt-16 wrap"><button class="btn sm" data-lfreceive="${x.id}">📥 ${t('Item received — post it')}</button><button class="btn sm ghost" data-lfreject="${x.id}">${t('Reject')}</button></div>` : ''}
      ${x.status === 'ready' ? html`<div class="banner info mt-10">${icon('shieldok')}<div><b>${t('Hand over at the desk')}</b><p class="small">${t('Check the college ID of')} ${x.claims.find((c) => c.status === 'approved')?.user?.name} (${x.claims.find((c) => c.status === 'approved')?.collegeId}) ${t('before giving the item.')}</p><button class="btn sm mt-6" data-lfreturned="${x.id}">${t('Mark collected')}</button></div></div>` : ''}
      ${x.status === 'returned' ? html`<p class="tiny mt-10" style="color:var(--ok)">✓ ${t('Returned to')} ${x.returnedToName} · ${when(x.returnedAt)}</p>` : ''}
    </div>`) : html`<div class="pad">${empty('📦', t('Nothing here'), t('No lost & found items in this view.'))}</div>`}</div>`;
  const items = Object.fromEntries(d.items.map((x) => [x.id, x]));
  body.onclick = async (e) => {
    const s = e.target.closest('[data-lfs]'); if (s) { st.status = s.dataset.lfs; return lostfoundDesk(body); }
    const act = async (path, payload, msg) => { try { await api(path, { method: 'POST', body: payload }); toast(msg, 'ok'); lostfoundDesk(body); } catch (err) { toastErr(err); } };
    const rc = e.target.closest('[data-lfreceive]');
    if (rc) {
      const x = items[rc.dataset.lfreceive];
      const v = await formSheet({ title: t('Post found item'), intro: t('Only post once the item is physically at the desk. Keep identifying details out of the public text so claimants have to prove ownership.'), fields: [
        { name: 'title', label: t('Public title'), value: x.title, required: true }, { name: 'desc', label: t('Public description'), type: 'textarea', value: x.desc },
        { name: 'showPhoto', label: t('Show the photo publicly'), type: 'check', value: !!x.photo }], ok: t('Post at desk') });
      if (v) act(`/admin/lostfound/${x.id}/receive`, { ...v, showPhoto: !!v.showPhoto }, t('Posted — finder thanked'));
      return;
    }
    const rj = e.target.closest('[data-lfreject]');
    if (rj) { const v = await formSheet({ title: t('Reject report'), fields: [{ name: 'reason', label: t('Reason (shown to the finder)'), type: 'textarea', required: true, placeholder: t('e.g. Item was never handed in at the desk') }], ok: t('Reject'), danger: true }); if (v) act(`/admin/lostfound/${rj.dataset.lfreject}/reject`, v, t('Report closed')); return; }
    const ap = e.target.closest('[data-lfapprove]');
    if (ap) { const v = await formSheet({ title: t('Approve claim'), intro: t('Other pending claims on this item will be rejected automatically.'), fields: [{ name: 'reason', label: t('How did you verify it? (internal)'), type: 'textarea', placeholder: t('e.g. Described the KR sticker under the cap') }], ok: t('Approve') }); if (v) act(`/admin/lostfound/${ap.dataset.lfapprove}/claims/${ap.dataset.cid}`, { decision: 'approve', ...v }, t('Approved — owner told to collect')); return; }
    const dn = e.target.closest('[data-lfdeny]');
    if (dn) { const v = await formSheet({ title: t('Reject claim'), fields: [{ name: 'reason', label: t('Reason (shown to the claimant)'), type: 'textarea', required: true, placeholder: t('e.g. Description does not match the item') }], ok: t('Reject'), danger: true }); if (v) act(`/admin/lostfound/${dn.dataset.lfdeny}/claims/${dn.dataset.cid}`, { decision: 'reject', ...v }, t('Claim rejected')); return; }
    const rt = e.target.closest('[data-lfreturned]');
    if (rt && await confirmSheet({ title: t('Owner collected the item?'), body: t('Confirm you checked their college ID at the desk.'), ok: t('Mark collected') })) act(`/admin/lostfound/${rt.dataset.lfreturned}/returned`, {}, t('Returned — finder thanked'));
  };
}

// ---------- appeals
async function appeals(body) {
  const f = body.dataset.af || 'pending';
  const as = await api('/admin/appeals?status=' + f);
  body.innerHTML = html`<div class="seg mb">${[['pending', 'Pending'], ['decided', 'Decided']].map(([k, l]) => html`<button class="${f === k ? 'on' : ''}" data-af="${k}">${t(l)}</button>`)}</div>
    <p class="tiny faint mt-10">${t('Oldest first. Overturning reverses the original action (lifts a suspension, removes a strike, restores a post) and keeps both records.')}</p>
    <div class="col mt-10">${as.length ? as.map((a) => html`<div class="card pad"><div class="row between"><span class="pill indigo">${t('Appeal')} · ${t(a.original?.title || a.action)}</span><span class="tiny faint">${ago(a.createdAt)}</span></div>
      <div class="mt-10">${who(a.user, { sub: false })}<div class="row gap-4 wrap mt-6">${riskPill(a.user.report)}<span class="pill ${a.user.status === 'active' ? 'ok' : 'kum'}">${a.user.status}</span></div></div>
      <div class="card pad-sm mt-10"><div class="tiny faint">${t('Original decision')} · ${a.original?.byName || ''} · ${when(a.original?.at)}</div><p class="small mt-6">${a.original?.reason}</p>${a.report ? html`<p class="tiny faint mt-6">${t('From complaint')}: ${t(a.report.categoryLabel)} — “${a.report.details}”</p>` : ''}</div>
      <p class="mt-10">“${a.text}”</p>${a.evidence ? html`<img src="${a.evidence}" alt="" class="mt-10" style="border-radius:12px;max-height:160px">` : ''}
      ${a.status === 'pending' ? html`<div class="btn-row mt-16"><button class="btn sm ghost" data-ap="${a.id}" data-d="uphold">${t('Uphold decision')}</button><button class="btn sm" data-ap="${a.id}" data-d="overturn">${t('Overturn')}</button></div>`
        : html`<div class="banner info mt-10">${icon('shield')}<div><b>${a.status}</b> · <span class="tiny">${when(a.decision.at)}</span><p class="small">${a.decision.reason}</p></div></div>`}</div>`) : empty('🕊️', f === 'pending' ? t('No pending appeals') : t('No decided appeals yet'))}</div>`;
  body.onclick = async (e) => {
    const s = e.target.closest('[data-af]'); if (s) { body.dataset.af = s.dataset.af; appeals(body); return; }
    const b = e.target.closest('[data-ap]'); if (!b) return;
    const overturn = b.dataset.d === 'overturn';
    const v = await formSheet({ title: overturn ? t('Overturn the decision') : t('Uphold the decision'), intro: overturn ? t('The original action is reversed and the member is notified.') : t('The action stays in place. The member sees your reason.'), fields: [{ name: 'reason', label: t('Reason (shown to the member)'), type: 'textarea', required: true }], ok: overturn ? t('Overturn') : t('Uphold'), danger: !overturn });
    if (!v) return;
    try { await api('/admin/appeals/' + b.dataset.ap, { method: 'POST', body: { decision: b.dataset.d, reason: v.reason } }); toast(t('Appeal decided & member notified'), 'ok'); appeals(body); } catch (err) { toastErr(err); }
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
      ${f.status === 'open' ? html`<div class="row gap-6 mt-10"><a class="btn xs ghost" href="#/admin/vendor/${f.userId}">${t('Case file')}</a><button class="btn xs ghost" data-flag="${f.id}" data-a="dismiss">${t('Dismiss')}</button><button class="btn xs mari" data-flag="${f.id}" data-a="strike">⚠️ ${t('Strike')}</button></div>` : ''}</div>`) : empty('🟢', t('No flags'))}</div>`;
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
    const v = await formSheet({ title: t('Moderate user'), fields: [{ name: 'action', label: t('Action'), type: 'select', options: [['warn', 'Official warning'], ['strike', 'Strike (ladder: warn → suspend → ban)'], ['restrict', 'Restrict listings'], ['lift_restriction', 'Lift listing restriction'], ['suspend', 'Suspend'], ['ban', 'Ban permanently'], ['reinstate', 'Reinstate']].map(([value, label]) => ({ value, label: t(label) })) }, { name: 'days', label: t('Days (suspension / restriction; 0 = until lifted)'), type: 'number', value: 3 }, { name: 'reason', label: t('Reason (shown to the user)'), type: 'textarea', required: true }], ok: t('Apply'), danger: true });
    if (!v) return;
    if ((v.action === 'ban' || v.action === 'suspend') && !(await confirmSheet({ title: v.action === 'ban' ? t('Permanently ban this account?') : t('Suspend this account?'), body: t('They are notified with your reason and can appeal. Their records are kept.'), ok: t('Confirm'), danger: true }))) return;
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
  const F = [['feePercent', 'Platform fee %'], ['feeMin', 'Minimum fee ₹'], ['feeMax', 'Maximum fee ₹'], ['maxItemPrice', 'Max price per item ₹'], ['maxTaskReward', 'Max reward per task ₹'], ['dailyLimit', 'Daily limit per user ₹'], ['helperActiveCap', 'Active jobs per helper'], ['urgentPerDay', 'Urgent posts per user per day'], ['offerExpiryHours', 'Offer expiry (hours)'], ['autoReleaseHours', 'Auto-release after delivery (hours)'], ['disputeSlaHours', 'Report review SLA (hours)'], ['strikeSuspendDays', 'Suspension length on 2nd strike (days)'], ['maxTaskDays', 'Max task deadline (days)'], ['reportThreshold', 'Independent reporters that flag a vendor for review (min 2)'], ['reportWindowDays', 'Window for counting reports (days)'], ['appealWindowDays', 'Days allowed to appeal a decision']];
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
