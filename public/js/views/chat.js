import { html, $, icon, store, api, t, ago, clock, avatar, empty, skeleton, toast, toastErr, on, statusPill, sheet } from '../core.js';
import { reportSheet } from './settings.js';

export async function inbox({ root, setTop }) {
  setTop({ back: true, title: t('Chats') });
  root.innerHTML = skeleton(5);
  const load = async () => {
    const th = await api('/threads');
    root.innerHTML = th.length ? html`<div class="banner info mt-6">${icon('shield')}<div><b>${t('Chats are recorded to settle disputes')}</b><p class="small">${t('Phone numbers & UPI IDs are auto-hidden. Never pay outside the app.')}</p></div></div>
      <div class="threads mt-10">${th.map((x) => html`<div class="th" data-go="#/chat/${x.id}">${avatar(x.other, 46)}<div class="grow" style="min-width:0"><div class="row between"><b class="ellip">${x.other?.name}</b><span class="tiny faint">${ago(x.lastAt)}</span></div>
        <div class="tiny faint ellip">${x.refType === 'deal' ? '🤝 ' : x.refType === 'listing' ? '🏷️ ' : x.refType === 'task' ? '🧾 ' : ''}${x.title}</div>
        <div class="row between"><span class="small ellip ${x.unread ? '' : 'muted'}" style="${x.unread ? 'font-weight:700' : ''}">${x.last ? (x.last.system ? 'ℹ️ ' : x.last.from === store.me.id ? t('You') + ': ' : '') + x.last.text : ''}</span>${x.unread ? html`<span class="badge-dot" style="position:static;border:0">${x.unread}</span>` : x.dealStatus ? statusPill(x.dealStatus) : ''}</div></div></div>`)}</div>`
      : empty('💬', t('No conversations yet'), t('Chat with a seller or helper from any post. Every chat is linked to its deal.'));
  };
  await load();
  return on('message', load);
}

export async function thread({ root, params, setTop }) {
  document.body.classList.add('in-chat');
  let th = await api('/threads/' + params.id);
  const other = th.other;
  setTop({ back: true, title: '', actions: html`<button class="iconbtn" id="more" aria-label="${t('More')}">${icon('flag')}</button>` });
  $('#top .title').innerHTML = html`<a class="who" href="#/user/${other.id}">${avatar(other, 32)}<span><span class="n" style="display:block">${other.name}</span><span class="m">${t('Trust')} ${other.trust} · ${other.stats.rating ? '★ ' + other.stats.rating.toFixed(1) : t('New member')}</span></span></a>`.s;
  const me = store.me;
  const QUICK = th.refType === 'deal' ? ['On my way 🏃', 'Reached the meeting point', 'Running 10 min late', 'Please share the OTP'] : ['Is it still available?', 'Can we meet at the Library?', 'Any discount?', 'Can you do it in 30 min?'];
  root.innerHTML = html`
    ${th.deal ? html`<a class="card pad-sm row mt-6" href="#/deal/${th.deal.id}" style="position:sticky;top:64px;z-index:5">${icon('lock')}<span class="grow small"><b>${th.title}</b><br><span class="faint">₹${th.deal.total} ${['paid', 'refunded', 'cancelled', 'declined', 'expired'].includes(th.deal.status) ? '' : t('in escrow')}</span></span>${statusPill(th.deal.status)}</a>`
      : th.refType !== 'direct' ? html`<a class="card pad-sm row mt-6" href="#/${th.refType === 'listing' ? 'listing' : th.refType === 'task' ? 'task' : 'lostfound'}/${th.refId}">${icon('info')}<span class="grow small"><b>${th.title}</b><br><span class="faint">${t('Agree on terms here, then make an offer — the deal is recorded in the app.')}</span></span>${icon('chev')}</a>` : ''}
    <div class="chat mt-10" id="msgs"></div>
    <div class="composer" style="flex-direction:column">
      ${th.blocked ? html`<div class="small muted center">${t('You can\'t message this user (blocked).')}</div>` : html`
      <div class="quick">${QUICK.map((q) => html`<button type="button" data-q="${t(q)}">${t(q)}</button>`)}</div>
      <form class="row" id="cf" style="gap:8px"><input id="txt" placeholder="${t('Message…')}" autocomplete="off" maxlength="600" aria-label="${t('Message')}"><button aria-label="${t('Send')}">${icon('send')}</button></form>`}
    </div>`;
  const box = $('#msgs', root);
  const bubble = (m) => m.system ? html`<div class="msg sys">${m.text}</div>`
    : html`<div class="msg ${m.from === me.id ? 'me' : ''} ${m.masked ? 'masked' : ''}" data-mid="${m.id}" data-from="${m.from}">${m.text}${m.masked ? html`<div class="tiny" style="opacity:.8;margin-top:4px">🔒 ${t('Contact/payment details hidden')}</div>` : ''}<time>${clock(m.at)}</time></div>`;
  let lastDay = '';
  const dayHdr = (m) => { const d = new Date(m.at).toDateString(); if (d === lastDay) return ''; lastDay = d; return html`<div class="tiny faint center mt-10">${new Date(m.at).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}</div>`; };
  box.innerHTML = html`${th.messages.map((m) => html`${dayHdr(m)}${bubble(m)}`)}`;
  const scroll = () => window.scrollTo({ top: document.body.scrollHeight });
  scroll();
  const send = async (text) => {
    if (!text.trim()) return;
    try {
      const r = await api(`/threads/${th.id}/messages`, { method: 'POST', body: { text } });
      if (!box.querySelector(`[data-mid="${r.message.id}"]`)) box.insertAdjacentHTML('beforeend', bubble(r.message).s);
      for (const w of r.warnings) box.insertAdjacentHTML('beforeend', html`<div class="msg sys" style="background:var(--mari-soft);color:var(--mari-ink)">⚠️ ${w}</div>`.s);
      scroll();
    } catch (e) { toastErr(e); }
  };
  root.addEventListener('submit', (e) => { e.preventDefault(); const i = $('#txt', root); send(i.value); i.value = ''; i.focus(); });
  root.addEventListener('click', (e) => {
    const q = e.target.closest('[data-q]'); if (q) send(q.dataset.q);
    const m = e.target.closest('.msg[data-from]');
    if (m && m.dataset.from !== me.id) sheet(html`<h2>${t('Message options')}</h2><p class="muted small mt-6">“${m.firstChild.textContent}”</p><button class="btn danger-ghost block mt-16" id="rep">${icon('flag')} ${t('Report this message')}</button><button class="btn ghost block mt-10" data-close>${t('Close')}</button>`.s, { onMount(el, close) { el.querySelector('#rep').onclick = () => { close(); reportSheet('message', m.dataset.mid, t('this message')); }; } });
  });
  $('#more')?.addEventListener('click', () => reportSheet('user', other.id, other.name));
  return on('message', (x) => {
    if (x.threadId !== th.id || box.querySelector(`[data-mid="${x.message.id}"]`)) return;
    box.insertAdjacentHTML('beforeend', html`${dayHdr(x.message)}${bubble(x.message)}`.s);
    scroll(); api('/threads/' + th.id).catch(() => {});
  });
}
