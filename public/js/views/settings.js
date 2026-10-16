import { html, $, icon, store, api, t, ago, when, until, avatar, empty, sheet, formSheet, confirmSheet, toast, toastErr, refreshMe, applyPrefs, emit } from '../core.js';
import { setLang } from '../i18n.js';

const REASONS = ['Fake or counterfeit item', 'Prohibited item or task', 'Scam or fraud', 'Asked to pay outside the app', 'Harassment or abuse', 'No-show', 'Wrong category / spam', 'Other'];

export async function reportSheet(targetType, targetId, label = '') {
  const v = await formSheet({
    title: t('Report'), intro: `${label ? `“${label}” — ` : ''}${t('An admin reviews every report within')} ${store.config.settings.disputeSlaHours}h. ${t('You will see the decision and its reason.')}`,
    fields: [{ name: 'reason', label: t('Reason'), type: 'select', options: REASONS.map((r) => ({ value: r, label: t(r) })) }, { name: 'details', label: t('What happened?'), type: 'textarea', placeholder: t('Facts help the admin decide fairly') }, ...(targetType !== 'message' ? [{ name: 'block', label: t('Also block this user'), type: 'check' }] : [{ name: 'block', label: t('Also block the sender'), type: 'check' }])],
    ok: t('Submit report'), danger: true,
  });
  if (!v) return;
  try { await api('/reports', { method: 'POST', body: { targetType, targetId, ...v } }); toast(t('Report submitted'), 'ok', t('Track it in Settings → My reports')); } catch (e) { toastErr(e); }
}

export function rulesSheet() {
  sheet(html`<h2>${t('Community rules')}</h2>${rulesHtml()}<button class="btn block mt-16" data-close>${t('Got it')}</button>`.s);
}
function rulesHtml() {
  const C = store.config, s = C.settings;
  return html`<div class="col mt-16">${C.rules.map((r) => html`<div><h4>${t(r.h)}</h4><p class="small muted mt-6">${t(r.b)}</p></div>`)}</div>
    <h4 class="mt-24">${t('Fees & limits')}</h4>
    <div class="card list mt-10">${[
      ['Platform fee', `${s.feePercent}% (₹${s.feeMin}–₹${s.feeMax}), ${t('added on top, shown before you confirm')}`],
      ['Max price per item', `₹${s.maxItemPrice}`], ['Max reward per task', `₹${s.maxTaskReward}`], ['Daily limit per user', `₹${s.dailyLimit}`],
      ['Campus hours for tasks', `${s.campusOpen}–${s.campusClose} IST`], ['Urgent posts', `${s.urgentPerDay} ${t('per person per day')}`],
      ['Active jobs per helper', `${s.helperActiveCap}`], ['Unanswered offers expire after', `${s.offerExpiryHours}h`],
      ['Auto-release after delivery (no dispute)', `${s.autoReleaseHours}h`], ['Report / dispute review time', `${s.disputeSlaHours}h`]].map(([k, v]) => html`<div class="li"><span class="grow small">${t(k)}</span><b class="small" style="text-align:right">${v}</b></div>`)}</div>
    <h4 class="mt-24">${t('Not allowed')}</h4><ul class="small muted" style="padding-left:18px">${C.prohibited.map((p) => html`<li>${t(p)}</li>`)}</ul>
    <h4 class="mt-16">${t('How the feed stays fair')}</h4><p class="small muted mt-6">${t('Posts are split into “fresh or new member” and “established” pools and interleaved one-by-one. Order within each pool rotates every hour, differently for each viewer. There is no paid boosting or role-based priority — staff and students follow identical rules.')}</p>`;
}

export async function main({ root, setTop }) {
  setTop({ back: true, title: t('Settings') });
  await refreshMe();
  const m = store.me;
  const sw = (id, on, label, sub = '') => html`<label class="li" style="cursor:pointer"><span class="grow"><span class="small" style="font-weight:600">${label}</span>${sub ? html`<div class="tiny faint">${sub}</div>` : ''}</span><span class="switch"><input type="checkbox" data-sw="${id}" ${on ? 'checked' : ''}><span></span></span></label>`;
  root.innerHTML = html`
    <h4 class="mt-6">${t('Appearance & language')}</h4>
    <div class="card pad-sm mt-10"><div class="small muted" style="font-weight:700">${t('Language')}</div><div class="seg mt-6">${[['en', 'English'], ['ta', 'தமிழ்']].map(([k, l]) => html`<button class="${m.lang === k ? 'on' : ''}" data-lang="${k}">${l}</button>`)}</div>
      <div class="small muted mt-16" style="font-weight:700">${t('Theme')}</div><div class="seg mt-6">${[['auto', 'Auto'], ['light', 'Light'], ['dark', 'Dark']].map(([k, l]) => html`<button class="${m.theme === k ? 'on' : ''}" data-theme="${k}">${t(l)}</button>`)}</div></div>
    <div class="card list mt-10">${sw('dataSaver', m.dataSaver, t('Data saver'), t('Hide photos in lists to save mobile data'))}</div>
    <h4 class="mt-24">${t('Privacy — what others see')}</h4>
    <div class="card list mt-10">${sw('privacy.dept', m.privacy.dept, t('Show my department'))}${sw('privacy.year', m.privacy.year, t('Show my year'))}${sw('privacy.residence', m.privacy.residence, t('Show hostel / day-scholar status'), t('Always shared with the other person during an active deal'))}${sw('privacy.bio', m.privacy.bio, t('Show my bio'))}${sw('privacy.leaderboard', m.privacy.leaderboard, t('Appear on the weekly leaderboard'))}</div>
    <p class="tiny faint mt-6">${t('Your phone number and email are never shown publicly. Room numbers are never collected.')}</p>
    <h4 class="mt-24">${t('Permissions')}</h4>
    <div class="card list mt-10">${sw('consent.location', m.consent.location, '📍 ' + t('Location'), t('Live tracking & SOS only'))}${sw('consent.camera', m.consent.camera, '📷 ' + t('Camera'), t('Listing photos & delivery proof'))}${sw('consent.notifications', m.consent.notifications, '🔔 ' + t('Notifications'), t('Offers, deal updates, messages'))}</div>
    <h4 class="mt-24">${t('Safety & support')}</h4>
    <div class="card list mt-10">
      <a class="li" href="#/settings/rules"><span class="ic-box">${icon('doc')}</span><span class="grow">${t('Rules, fees & limits')}</span>${icon('chev', 'chev')}</a>
      <a class="li" href="#/settings/reports"><span class="ic-box">${icon('flag')}</span><span class="grow">${t('My reports & disputes')}</span>${icon('chev', 'chev')}</a>
      <a class="li" href="#/settings/blocked"><span class="ic-box">${icon('ban')}</span><span class="grow">${t('Blocked users')}</span><span class="tiny faint">${m.blocked.length}</span>${icon('chev', 'chev')}</a>
      <a class="li" href="#/settings/support"><span class="ic-box">${icon('info')}</span><span class="grow">${t('Help & support')}</span>${icon('chev', 'chev')}</a>
      <a class="li" href="#/map"><span class="ic-box">${icon('map')}</span><span class="grow">${t('Safe meeting points')}</span>${icon('chev', 'chev')}</a></div>
    <h4 class="mt-24">${t('Your data')}</h4>
    <div class="card list mt-10">
      <div class="li" id="export"><span class="ic-box">${icon('download')}</span><span class="grow">${t('Download my data')}<div class="tiny faint">${t('Everything we hold about you, as JSON (DPDP Act 2023)')}</div></span></div>
      <div class="li" id="delete"><span class="ic-box" style="color:var(--kum)">${icon('trash')}</span><span class="grow" style="color:var(--kum)">${t('Delete my account')}</span></div></div>
    <p class="tiny faint center mt-24">CampusLoop v1.0 · ${store.config.campus.name}<br>${t('Consent recorded')} ${when(m.consent.at)}</p>`;
  root.addEventListener('click', async (e) => {
    const l = e.target.closest('[data-lang]'), th = e.target.closest('[data-theme]');
    try {
      if (l) { await api('/me', { method: 'PATCH', body: { lang: l.dataset.lang } }); setLang(l.dataset.lang); await refreshMe(); location.reload(); }
      if (th) { await api('/me', { method: 'PATCH', body: { theme: th.dataset.theme } }); localStorage.setItem('cl.theme', th.dataset.theme); await refreshMe(); root.querySelectorAll('[data-theme]').forEach((b) => b.classList.toggle('on', b === th)); }
      if (e.target.closest('#export')) {
        const d = await api('/me/export');
        const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(d, null, 2)], { type: 'application/json' })); a.download = 'campusloop-my-data.json'; a.click();
        toast(t('Your data was downloaded'), 'ok');
      }
      if (e.target.closest('#delete')) {
        if (await confirmSheet({ title: t('Delete your account?'), body: t('Your profile and contact details are erased. Completed deal records are kept anonymised for dispute history. This cannot be undone.'), ok: t('Delete forever'), danger: true })) { await api('/me', { method: 'DELETE' }); toast(t('Account deleted')); emit('logout'); }
      }
    } catch (err) { toastErr(err); }
  });
  root.addEventListener('change', async (e) => {
    const k = e.target.dataset.sw; if (!k) return;
    const v = e.target.checked;
    if (k === 'consent.notifications' && v && 'Notification' in window) await Notification.requestPermission();
    if (k === 'consent.location' && v && navigator.geolocation) navigator.geolocation.getCurrentPosition(() => {}, () => toast(t('Location permission was denied by the browser'), 'err'));
    const [a, b] = k.split('.');
    try { await api('/me', { method: 'PATCH', body: b ? { [a]: { [b]: v } } : { [a]: v } }); await refreshMe(); toast(t('Saved')); } catch (err) { toastErr(err); }
  });
}

export async function section({ root, params, setTop }) {
  const sec = params.section;
  if (sec === 'rules') { setTop({ back: true, title: t('Rules, fees & limits') }); root.innerHTML = rulesHtml().s; return; }
  if (sec === 'account') { location.hash = '#/me'; return; }
  if (sec === 'reports') {
    setTop({ back: true, title: t('My reports & disputes') });
    const rs = await api('/reports/mine');
    root.innerHTML = rs.length ? html`<div class="col mt-6">${rs.map((r) => html`<div class="card pad">
      <div class="row between"><span class="pill ${r.kind === 'dispute' ? 'kum' : 'indigo'}">${r.kind === 'dispute' ? t('Dispute') : t('Report')}</span>${r.status === 'open' ? html`<span class="sla ${r.overdue ? 'late' : ''} small">${r.overdue ? t('Overdue') : until(r.dueAt)}</span>` : html`<span class="pill ok">${t('Resolved')}</span>`}</div>
      <h4 class="mt-10">${t(r.reason)}</h4>${r.details ? html`<p class="small muted mt-6">${r.details}</p>` : ''}
      <p class="tiny faint mt-6">${t('Filed')} ${when(r.createdAt)}${r.dealId ? html` · <a class="link" href="#/deal/${r.dealId}">${t('View deal')}</a>` : ''}</p>
      ${r.decision ? html`<div class="banner info mt-10">${icon('shield')}<div><b>${t('Decision')}: ${r.decision.action}</b><p class="small">${r.decision.reason}</p><p class="tiny">${when(r.decision.at)}</p></div></div>` : ''}</div>`)}</div>`
      : empty('🛡️', t('No reports yet'), t('Reports and disputes you raise — and their outcomes — appear here.'));
    return;
  }
  if (sec === 'blocked') {
    setTop({ back: true, title: t('Blocked users') });
    const ids = store.me.blocked;
    const users = await Promise.all(ids.map((id) => api('/users/' + id).catch(() => null)));
    root.innerHTML = users.filter(Boolean).length ? html`<div class="card list mt-6">${users.filter(Boolean).map((u) => html`<div class="li">${avatar(u, 36)}<span class="grow">${u.name}</span><button class="btn xs ghost" data-unblock="${u.id}">${t('Unblock')}</button></div>`)}</div>` : empty('🕊️', t('No one blocked'));
    root.addEventListener('click', async (e) => { const b = e.target.closest('[data-unblock]'); if (b) { await api(`/users/${b.dataset.unblock}/block`, { method: 'DELETE' }); await refreshMe(); b.closest('.li').remove(); toast(t('Unblocked')); } });
    return;
  }
  if (sec === 'support') {
    setTop({ back: true, title: t('Help & support') });
    const FAQ = [
      ['How does escrow protect me?', 'When you buy or post a task, the money moves from your wallet into escrow. The seller or helper is paid only after you confirm receipt with your 4-digit delivery OTP. If the deal is declined, cancelled or expires, you are refunded automatically.'],
      ['What if the item is not as described?', 'Do not share your OTP. Open the deal and tap “Raise a dispute”. Money stays frozen until an admin decides — always with a written reason, within the published time.'],
      ['Why can\'t I see the seller\'s phone number?', 'Phone numbers are masked for everyone\'s privacy. Use in-app chat — it keeps a record that protects both of you in disputes.'],
      ['Why was my post rejected?', 'Automatic checks block prohibited items, duplicate listings and academic-dishonesty tasks. The exact reason is always shown to you.'],
      ['How are helpers chosen fairly?', 'Posters see every offer in arrival order. A “Fair pick” suggestion highlights the well-rated helper with the fewest jobs this week, and each helper can hold only a limited number of active jobs.'],
      ['How do strikes work?', 'Strike 1 is a warning, strike 2 is a temporary suspension, strike 3 is a permanent ban. Every strike shows its reason.'],
    ];
    root.innerHTML = html`<div class="col mt-6">${FAQ.map(([q, a]) => html`<details class="card pad-sm"><summary style="cursor:pointer;font-weight:700">${t(q)}</summary><p class="small muted mt-6">${t(a)}</p></details>`)}</div>
      <div class="card pad mt-16"><h4>${t('Still need help?')}</h4><p class="small muted mt-6">${t('Message the campus moderator. Replies are usually within a few hours.')}</p>
        <button class="btn block mt-10" id="contact">${icon('chat')} ${t('Chat with support')}</button>
        <a class="btn ghost block mt-10" href="tel:${store.config.campus.securityPhone.replace(/\s/g, '')}">${icon('phone')} ${t('Campus security')} · ${store.config.campus.securityPhone}</a></div>`;
    $('#contact', root).onclick = async () => { try { const th = await api('/threads', { method: 'POST', body: { userId: store.config.supportUserId, refType: 'direct', refId: 'support' } }); location.hash = '#/chat/' + th.id; } catch (e) { toastErr(e); } };
    return;
  }
  location.hash = '#/settings';
}
