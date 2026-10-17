import { html, raw, $, icon, store, api, t, when, empty, sheet, formSheet, toast, toastErr, refreshMe } from '../core.js';

const PAYOUT = { requested: ['mari', 'Processing'], paid: ['ok', 'Paid'], rejected: ['kum', 'Returned'] };
const TYPE = { topup: ['⬇️', 'Top-up'], hold: ['🔒', 'Held in escrow'], refund: ['↩️', 'Refund'], earning: ['💰', 'Earning'], paid: ['✅', 'Paid from escrow'], withdraw: ['⬆️', 'Withdrawal'] };

// Razorpay Checkout script, loaded only when someone actually adds money
let rzpLoad;
const loadRazorpay = () => (rzpLoad ||= new Promise((resolve, reject) => {
  const sc = document.createElement('script');
  sc.src = 'https://checkout.razorpay.com/v1/checkout.js';
  sc.onload = () => resolve(window.Razorpay);
  sc.onerror = () => { rzpLoad = null; reject(new Error(t('Could not load the payment page. Check your connection.'))); };
  document.head.appendChild(sc);
}));
const credited = async (amount, after) => { await refreshMe(); toast(`₹${amount} ${t('added to wallet')}`, 'ok'); after?.(); dispatchEvent(new CustomEvent('wallet')); };

// Real deployments: Razorpay order → Checkout (UPI, cards, netbanking) → server verifies the signature and credits.
async function razorpayTopup(amount, after) {
  const [Razorpay, order] = await Promise.all([loadRazorpay(), api('/wallet/topup/order', { method: 'POST', body: { amount } })]);
  await new Promise((resolve) => {
    const rzp = new Razorpay({
      key: order.keyId, order_id: order.orderId, amount: order.amount, currency: order.currency,
      name: store.config.campus.name, description: t('Wallet top-up'), prefill: { name: store.me.name }, theme: { color: '#1F5E4E' },
      handler: async (res) => {
        try { const r = await api('/wallet/topup/verify', { method: 'POST', body: res }); await credited(r.credited, after); } catch (err) { toastErr(err); }
        resolve();
      },
      modal: { ondismiss: resolve },
    });
    rzp.on('payment.failed', (r) => toast(r.error?.description || t('Payment failed. No money was taken.'), 'err'));
    rzp.open();
  });
}

export function topupSheet(suggest = 100, after) {
  const C = store.config;
  if (!C.payments && !C.topupDemo) { sheet(html`<h2>${t('Add money')}</h2><p class="muted small mt-6">${t('Online payments are not set up on this campus yet. Free items, lost & found and chat work without a wallet balance.')}</p><button class="btn block mt-16" data-close>${t('OK')}</button>`.s, { onMount(el, close) { el.querySelector('[data-close]').onclick = close; } }); return; }
  let amt = suggest;
  sheet(html`<h2>${t('Add money')}</h2><p class="muted small mt-6">${t('Money stays in your CampusLoop wallet and is only moved into escrow when you confirm a deal.')}</p>
    <div class="chips mt-16" style="margin:0;padding:0">${[50, 100, 200, 500].map((v) => html`<button class="chip ${v === amt ? 'on' : ''}" data-a="${v}">₹${v}</button>`)}</div>
    <label class="f mt-16"><span>${t('Amount')}</span><div class="prefix"><b>₹</b><input class="in" id="amt" type="number" min="10" max="2000" value="${amt}" inputmode="numeric"></div></label>
    <button class="btn block mt-16" id="pay">${icon('lock')} ${t('Pay securely')}</button>
    <p class="tiny faint center mt-10">${C.payments ? t('Secured by Razorpay · UPI, cards and netbanking. Your wallet is credited only after the payment is verified.') : t('Demo: payment is simulated. Production uses a licensed payment gateway with UPI intent.')}</p>`.s, {
    onMount(el, close) {
      el.addEventListener('click', async (e) => {
        const a = e.target.closest('[data-a]'); if (a) { el.querySelector('#amt').value = a.dataset.a; el.querySelectorAll('[data-a]').forEach((c) => c.classList.toggle('on', c === a)); }
        const b = e.target.closest('#pay'); if (!b) return;
        const amount = Math.round(+el.querySelector('#amt').value);
        if (!(amount >= 10 && amount <= 2000)) return toast(t('Top up between ₹10 and ₹2000.'), 'err');
        b.disabled = true;
        try {
          if (C.payments) { b.textContent = t('Opening secure payment…'); close(); await razorpayTopup(amount, after); return; }
          b.textContent = t('Waiting for UPI approval…');
          await new Promise((r) => setTimeout(r, 1100));
          await api('/wallet/topup', { method: 'POST', body: { amount, upiRef: 'UPI' + Date.now().toString().slice(-8) } }); close(); await credited(amount, after);
        } catch (err) { b.disabled = false; b.textContent = t('Pay securely'); toastErr(err); }
      });
    },
  });
}

export async function main({ root, setTop }) {
  setTop({ back: true, title: t('Wallet & earnings') });
  async function load() {
    const w = await api('/wallet');
    const max = Math.max(1, ...w.weeks.map((x) => x.earned));
    root.innerHTML = html`
      <div class="card hello mt-6"><p class="small" style="opacity:.85">${t('Available balance')}</p><div class="price-big num">₹${w.wallet.balance}</div>
        <div class="stats"><div><b class="num">₹${w.wallet.escrow}</b><span>🔒 ${t('in escrow')}</span></div><div><b class="num">₹${w.wallet.earned}</b><span>${t('earned')}</span></div><div><b class="num">₹${w.wallet.spent}</b><span>${t('spent')}</span></div></div></div>
      <div class="btn-row mt-16"><button class="btn" id="top">${icon('download')} ${t('Add money')}</button><button class="btn ghost" id="wd">${t('Withdraw to UPI')}</button></div>
      ${w.feeWaivers ? html`<div class="banner good mt-10">${icon('gift')}<div><b>${w.feeWaivers} ${t('fee-free deal(s) available')}</b><p class="small">${t('Applied automatically on your next purchase.')}</p></div></div>` : ''}
      <div class="section"><div class="section-h"><h3>${t('Weekly earnings')}</h3><span class="tiny faint">${t('last 8 weeks')}</span></div>
        <div class="card pad"><div class="bar-chart">${w.weeks.map((x) => html`<div title="₹${x.earned}"><span class="tiny num" style="font-weight:700">${x.earned ? '₹' + x.earned : ''}</span><i style="height:${(x.earned / max) * 80}%"></i><span>${x.label}</span></div>`)}</div></div></div>
      ${w.payouts?.length ? html`<div class="section"><h3>${t('Withdrawals')}</h3><div class="card list mt-10">${w.payouts.map((p) => html`<div class="li"><span class="ic-box">⬆️</span><div class="grow" style="min-width:0"><b class="small">₹${p.amount} → ${p.upi}</b><div class="tiny faint">${when(p.createdAt)}${p.ref ? ` · ${t('UPI ref')} ${p.ref}` : ''}${p.reason ? ` · ${p.reason}` : ''}</div></div><span class="pill ${PAYOUT[p.status][0]}">${t(PAYOUT[p.status][1])}</span></div>`)}</div><p class="tiny faint mt-6">${t('Withdrawals are paid to your UPI ID by the campus office, usually within 2 working days.')}</p></div>` : ''}
      <div class="section"><h3>${t('Transactions')}</h3>${w.ledger.length ? html`<div class="card list mt-10">${w.ledger.map((l) => html`<${l.dealId ? 'a' : 'div'} class="li" ${l.dealId ? raw(`href="#/deal/${l.dealId}"`) : ''}><span class="ic-box">${TYPE[l.type]?.[0] || '•'}</span><div class="grow" style="min-width:0"><b class="small">${t(TYPE[l.type]?.[1] || l.type)}</b><div class="tiny faint ellip">${l.note}</div><div class="tiny faint">${when(l.at)}</div></div><b class="num" style="color:${l.amount > 0 ? 'var(--ok)' : l.amount < 0 ? 'var(--ink)' : 'var(--ink-3)'}">${l.amount > 0 ? '+' : l.amount < 0 ? '−' : ''}₹${Math.abs(l.amount)}</b></${l.dealId ? 'a' : 'div'}>`)}</div>` : empty('🧾', t('No transactions yet'))}</div>
      <p class="tiny faint center mt-24">${t('All payments stay inside the app. Escrow is released only after both sides confirm.')}</p>`;
  }
  root.addEventListener('click', async (e) => {
    if (e.target.closest('#top')) topupSheet(100, load);
    if (e.target.closest('#wd')) {
      const v = await formSheet({ title: t('Withdraw to UPI'), fields: [{ name: 'amount', label: t('Amount'), type: 'number', prefix: '₹', value: store.me.wallet.balance }, { name: 'upiId', label: t('Your UPI ID'), placeholder: 'name@okaxis', required: true }], ok: t('Withdraw') });
      if (v) { try { await api('/wallet/withdraw', { method: 'POST', body: { amount: +v.amount, upiId: v.upiId } }); toast(t('Withdrawal requested — paid to your UPI ID within 2 working days'), 'ok'); await refreshMe(); load(); } catch (err) { toastErr(err); } }
    }
  });
  addEventListener('wallet', load);
  await load();
  return () => removeEventListener('wallet', load);
}
