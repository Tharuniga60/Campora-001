import { html, raw, $, icon, LOGO, store, api, demoLogin, t, toast, toastErr, avatar, pickImage, locName } from '../core.js';
import { getLang, setLang } from '../i18n/index.js';

const HERO = () => {
  const dots = [];
  for (let y = 0; y < 5; y++) for (let x = 0; x < 7; x++) dots.push(`<circle cx="${30 + x * 50}" cy="${30 + y * 50}" r="3.5" fill="var(--ink)" opacity=".22"/>`);
  const em = [['📚', 80, 80], ['🚲', 280, 80], ['📦', 180, 130], ['🧮', 80, 180], ['🍱', 280, 180], ['🎧', 330, 130], ['🖨️', 30, 130]];
  return `<svg class="loop-art" viewBox="0 0 360 230" aria-hidden="true">${dots.join('')}
    <path d="M55 105 C55 40 155 40 155 105 S255 170 255 105 255 40 305 55 340 130 305 155 255 205 205 155 155 105 105 205 55 155 30 130Z" fill="none" stroke="var(--mari)" stroke-width="4" stroke-linecap="round" stroke-dasharray="1 0"><animate attributeName="stroke-dasharray" from="0 1400" to="1400 0" dur="2.4s" fill="freeze"/></path>
    <path d="M30 130 C 90 60, 270 200, 330 130" fill="none" stroke="var(--brand)" stroke-width="3" stroke-dasharray="2 9" stroke-linecap="round"/>
    ${em.map(([e, x, y]) => `<g><circle cx="${x}" cy="${y}" r="21" fill="var(--card)" stroke="var(--line)" stroke-width="2"/><text x="${x}" y="${y + 8}" text-anchor="middle" font-size="22">${e}</text></g>`).join('')}</svg>`;
};

export async function auth({ root, onDone }) {
  const cfg = store.config;
  const state = { step: 'welcome', data: { residence: 'hostel', consent: { terms: false, privacy: false, location: false, camera: false, notifications: false } } };

  function render() {
    const s = state.step;
    if (s === 'welcome') {
      root.innerHTML = html`<div class="auth">
        <div class="row between"><div class="brand">${LOGO}<span>CampusLoop<small>${cfg.campus.name}</small></span></div>
          <button class="chip" id="lang">${icon('globe', 'ic-sm')} ${getLang() === 'ta' ? 'English' : 'தமிழ்'}</button></div>
        <div class="auth-hero"><h1>${t('Your campus,')}<br><em>${t('in one loop.')}</em></h1>
          <p class="muted mt-10">${t('Buy & sell what others already own, get small tasks done, and request pick-ups & drops — with verified people, clear prices and money held safely until both sides confirm.')}</p></div>
        ${raw(HERO())}
        <div class="row gap-6 wrap mt-16" style="justify-content:center">
          <span class="pill brand">${icon('shieldok')} ${t('Verified members only')}</span><span class="pill mari">${icon('lock')} ${t('Escrow payments')}</span><span class="pill indigo">${icon('users')} ${t('Fair for everyone')}</span></div>
        <div class="col mt-24"><button class="btn block" data-s="details">${t('Create account with college ID')}</button><button class="btn ghost block" data-s="login">${t('I already have an account')}</button></div>
        ${cfg.demo ? html`<div class="mt-24"><div class="section-h"><h4>${t('Hackathon demo — tap a persona')}</h4></div>
          <div class="persona-grid">${cfg.demoUsers.map((u) => html`<button class="persona" data-demo="${u.id}">${avatar(u, 34, { badge: false })}<span class="grow" style="min-width:0"><b class="small ellip" style="display:block">${u.name.replace('Dr. ', '')}</b><span class="tiny faint">${u.persona}</span></span></button>`)}</div></div>` : ''}
        <p class="tiny faint center mt-24">${t('Follows the IT Act and the Digital Personal Data Protection Act, 2023. We collect only what we need.')}</p>
      </div>`;
    }
    if (s === 'login') {
      root.innerHTML = html`<div class="auth"><button class="iconbtn" data-s="welcome">${icon('back')}</button>
        <h1 class="mt-16">${t('Welcome back')}</h1><p class="muted mt-6">${t('Log in with the phone number linked to your college ID.')}</p>
        <form id="f" class="mt-24">${phoneOtp()}<button class="btn block" id="go">${state.otpSent ? t('Verify & log in') : t('Send OTP')}</button></form></div>`;
    }
    if (s === 'details') {
      const d = state.data;
      root.innerHTML = html`<div class="auth"><button class="iconbtn" data-s="welcome">${icon('back')}</button>
        <div class="steps mt-10"><i class="on"></i><i></i><i></i></div>
        <h2>${t('Verify you belong to campus')}</h2><p class="muted small mt-6">${t('Name, college ID, department and year are verified and cannot be edited later. One account per college ID.')}</p>
        <form id="f" class="mt-16">
          <label class="f"><span>${t('Full name (as on ID card)')}</span><input class="in" name="name" required value="${d.name || ''}" autocomplete="name"></label>
          <label class="f"><span>${t('College email')}</span><input class="in" name="email" type="email" required value="${d.email || ''}" placeholder="yourname@${cfg.campus.emailDomains[0]}"><div class="hint">${t('Only')} @${cfg.campus.emailDomains.join(', @')}</div></label>
          <div class="row gap-16"><label class="f grow"><span>${t('College ID')}</span><input class="in" name="collegeId" required value="${d.collegeId || ''}" placeholder="CS24001" style="text-transform:uppercase"></label>
          <label class="f" style="width:110px"><span>${t('Year')}</span><select class="in" name="year">${['1', '2', '3', '4', '5'].map((y) => html`<option ${d.year === y ? 'selected' : ''}>${y}</option>`)}</select></label></div>
          <label class="f"><span>${t('Department')}</span><select class="in" name="dept" required><option value="">${t('Choose…')}</option>${cfg.departments.map((x) => html`<option ${d.dept === x ? 'selected' : ''}>${x}</option>`)}</select></label>
          <div class="f"><span class="small muted" style="font-weight:700">${t('I am a')}</span><div class="seg mt-6" id="res"><button type="button" class="${d.residence === 'hostel' ? 'on' : ''}" data-r="hostel">🏠 ${t('Hosteller')}</button><button type="button" class="${d.residence === 'day' ? 'on' : ''}" data-r="day">🚌 ${t('Day scholar')}</button></div></div>
          ${d.residence === 'hostel' ? html`<label class="f"><span>${t('Hostel block')} <span class="faint">(${t('room number is never shared')})</span></span><select class="in" name="hostel">${cfg.locations.filter((l) => l.kind === 'hostel' && l.id !== 'hosgate').map((l) => html`<option value="${l.id}" ${d.hostel === l.id ? 'selected' : ''}>${locName(l.id)}</option>`)}</select></label>` : ''}
          <button class="btn block mt-10">${t('Continue')}</button></form></div>`;
    }
    if (s === 'consent') {
      const d = state.data, c = d.consent;
      root.innerHTML = html`<div class="auth"><button class="iconbtn" data-s="details">${icon('back')}</button>
        <div class="steps mt-10"><i class="on"></i><i class="on"></i><i></i></div>
        <h2>${t('Profile & permissions')}</h2>
        <div class="row gap-16 mt-16"><button type="button" id="ph" style="border:0;background:none;padding:0;cursor:pointer">${avatar({ name: d.name, avatar: d.avatar, color: 'var(--brand)' }, 72, { badge: false })}</button>
          <div class="grow"><b>${d.name}</b><p class="small muted">${d.dept} · ${t('Year')} ${d.year}</p><button class="link small" id="ph2">${icon('camera', 'ic-sm')} ${d.avatar ? t('Change photo') : t('Add profile photo')}</button></div></div>
        <label class="f mt-16"><span>${t('Short bio (optional)')}</span><input class="in" id="bio" maxlength="160" value="${d.bio || ''}" placeholder="${t('e.g. Final year CSE, selling my books')}"></label>
        <div class="card pad-sm">
          <label class="check"><input type="checkbox" data-c="terms" ${c.terms ? 'checked' : ''}><span><b>${t('I accept the Terms & community rules')}</b><br><span class="small muted">${t('No prohibited items, no off-app payments, both sides must accept every deal.')}</span> <button type="button" class="link small" id="rules">${t('Read rules')}</button></span></label>
          <label class="check"><input type="checkbox" data-c="privacy" ${c.privacy ? 'checked' : ''}><span><b>${t('I accept the Privacy Policy')}</b><br><span class="small muted">${t('Phone & email are encrypted and never shown publicly. You can export or delete your data anytime.')}</span></span></label></div>
        <h4 class="mt-16">${t('Optional permissions — asked separately')}</h4>
        <div class="card pad-sm mt-6">
          <label class="check"><input type="checkbox" data-c="location" ${c.location ? 'checked' : ''}><span>📍 <b>${t('Location')}</b> — <span class="small muted">${t('only for live delivery tracking & SOS')}</span></span></label>
          <label class="check"><input type="checkbox" data-c="camera" ${c.camera ? 'checked' : ''}><span>📷 <b>${t('Camera')}</b> — <span class="small muted">${t('for listing photos & delivery proof')}</span></span></label>
          <label class="check"><input type="checkbox" data-c="notifications" ${c.notifications ? 'checked' : ''}><span>🔔 <b>${t('Notifications')}</b> — <span class="small muted">${t('offers, deal updates & messages')}</span></span></label></div>
        <button class="btn block mt-16" id="next" ${c.terms && c.privacy ? '' : 'disabled'}>${t('Continue')}</button></div>`;
    }
    if (s === 'phone') {
      root.innerHTML = html`<div class="auth"><button class="iconbtn" data-s="consent">${icon('back')}</button>
        <div class="steps mt-10"><i class="on"></i><i class="on"></i><i class="on"></i></div>
        <h2>${t('Verify your phone')}</h2><p class="muted small mt-6">${t('One account per phone number. Your number stays hidden — others see a masked version.')}</p>
        <form id="f" class="mt-16">${phoneOtp()}
          <label class="f"><span>${t('Referral code (optional)')}</span><input class="in" name="referral" value="${state.data.referral || ''}" placeholder="PRIYA123" style="text-transform:uppercase"></label>
          <button class="btn block" id="go">${state.otpSent ? t('Verify & create account') : t('Send OTP')}</button></form></div>`;
    }
  }

  function phoneOtp() {
    return html`<label class="f"><span>${t('Mobile number')}</span><div class="prefix"><b>+91</b><input class="in" name="phone" inputmode="numeric" maxlength="10" required value="${state.phone || ''}" ${state.otpSent ? 'readonly' : ''} placeholder="98765 43210"></div></label>
      ${state.otpSent ? html`<div class="f"><span class="small muted" style="font-weight:700">${t('Enter the 6-digit OTP')}</span><div class="otp mt-6">${[0, 1, 2, 3, 4, 5].map((i) => html`<input inputmode="numeric" maxlength="1" data-o="${i}" aria-label="digit ${i + 1}">`)}</div>
        ${state.demoOtp ? html`<div class="banner info mt-10">${icon('info')}<div><b>${t('Demo mode OTP')}: ${state.demoOtp}</b> <button type="button" class="link small" id="fill">${t('Auto-fill')}</button><p class="small">${t('In production this is sent by SMS.')}</p></div></div>` : ''}
        <button type="button" class="link small mt-10" id="change">${t('Change number')}</button></div>` : ''}`;
  }

  async function sendOtp(purpose) {
    const phone = $('[name=phone]', root).value.replace(/\D/g, '');
    state.phone = phone;
    const r = await api('/auth/otp', { method: 'POST', body: { phone, purpose } });
    state.otpSent = true; state.demoOtp = r.demoOtp;
    render(); $('[data-o="0"]', root)?.focus();
  }
  const otpVal = () => [...root.querySelectorAll('[data-o]')].map((i) => i.value).join('');

  root.addEventListener('click', async (e) => {
    const s = e.target.closest('[data-s]');
    if (s) { state.step = s.dataset.s; state.otpSent = false; render(); return; }
    const demo = e.target.closest('[data-demo]');
    if (demo) { try { onDone(await demoLogin(demo.dataset.demo)); } catch (err) { toastErr(err); } return; }
    if (e.target.closest('#lang')) { setLang(getLang() === 'ta' ? 'en' : 'ta'); render(); return; }
    if (e.target.closest('#fill')) { [...state.demoOtp].forEach((d, i) => { root.querySelector(`[data-o="${i}"]`).value = d; }); return; }
    if (e.target.closest('#change')) { state.otpSent = false; render(); return; }
    const r = e.target.closest('[data-r]');
    if (r) { Object.assign(state.data, Object.fromEntries(new FormData($('#f', root)))); state.data.residence = r.dataset.r; render(); return; }
    if (e.target.closest('#ph') || e.target.closest('#ph2')) { const img = await pickImage({ max: 320, quality: 0.75 }); if (img) { state.data.avatar = img; state.data.bio = $('#bio', root).value; render(); } return; }
    if (e.target.closest('#rules')) { const { rulesSheet } = await import('./settings.js'); rulesSheet(); return; }
    if (e.target.closest('#next')) { state.data.bio = $('#bio', root).value; state.step = 'phone'; render(); }
  });
  root.addEventListener('change', (e) => {
    const c = e.target.dataset.c;
    if (c) { state.data.consent[c] = e.target.checked; if (c === 'notifications' && e.target.checked && 'Notification' in window) Notification.requestPermission(); state.data.bio = $('#bio', root)?.value; const btn = $('#next', root); if (btn) btn.disabled = !(state.data.consent.terms && state.data.consent.privacy); }
  });
  root.addEventListener('input', (e) => {
    const o = e.target.dataset.o;
    if (o != null) { e.target.value = e.target.value.replace(/\D/g, '').slice(-1); if (e.target.value) root.querySelector(`[data-o="${+o + 1}"]`)?.focus(); }
  });
  root.addEventListener('paste', (e) => {
    if (e.target.dataset.o == null) return;
    const v = (e.clipboardData.getData('text') || '').replace(/\D/g, '').slice(0, 6);
    if (v.length === 6) { e.preventDefault(); [...v].forEach((d, i) => { root.querySelector(`[data-o="${i}"]`).value = d; }); }
  });
  root.addEventListener('keydown', (e) => { if (e.key === 'Backspace' && e.target.dataset.o && !e.target.value) root.querySelector(`[data-o="${+e.target.dataset.o - 1}"]`)?.focus(); });
  root.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = $('#go', root) || e.target.querySelector('button:not([type=button])');
    try {
      btn && (btn.disabled = true);
      if (state.step === 'details') {
        const v = Object.fromEntries(new FormData(e.target));
        const dom = (v.email.split('@')[1] || '').toLowerCase();
        if (!cfg.campus.emailDomains.includes(dom)) throw new Error(`${t('Use your official college email')} (@${cfg.campus.emailDomains[0]})`);
        if (!new RegExp(cfg.campus.collegeIdPattern).test(v.collegeId.trim())) throw new Error(t('College ID format looks wrong (e.g. CS21045).'));
        Object.assign(state.data, v); state.step = 'consent'; render(); return;
      }
      if (state.step === 'login') {
        if (!state.otpSent) return await sendOtp('login');
        onDone(await api('/auth/login', { method: 'POST', body: { phone: state.phone, otp: otpVal() } }));
      }
      if (state.step === 'phone') {
        state.data.referral = $('[name=referral]', root)?.value;
        if (!state.otpSent) return await sendOtp('signup');
        const res = await api('/auth/signup', { method: 'POST', body: { ...state.data, phone: state.phone, otp: otpVal(), lang: getLang() } });
        toast(t('Account verified — welcome!'), 'ok');
        onDone(res);
      }
    } catch (err) { toastErr(err); if (err.status === 409 || err.status === 404) { state.otpSent = false; } }
    finally { if (btn) btn.disabled = false; }
  });
  render();
}
