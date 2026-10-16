import { html, icon, api, t, ago, empty, refreshMe, on } from '../core.js';

const IC = { offer: '🤝', deal: '✅', message: '💬', track: '📍', task: '🧾', review: '⭐', strike: '⚠️', moderation: '🛡️', dispute: '⚖️', report: '🛡️', referral: '🎁', welcome: '👋', announcement: '📢', wishlist: '🤍', sos: '🚨', admin: '🛡️' };

export async function main({ root, setTop }) {
  setTop({ back: true, title: t('Notifications') });
  async function load() {
    const ns = await api('/notifications');
    root.innerHTML = ns.length ? html`<div class="card list mt-6">${ns.map((n) => html`<${n.link ? 'a' : 'div'} class="li" ${n.link ? `href=${n.link}` : ''} style="${n.read ? '' : 'background:var(--brand-soft)'}">
      <span class="ic-box" style="font-size:1.1rem">${IC[n.type] || '🔔'}</span><div class="grow" style="min-width:0"><b class="small">${n.title}</b><div class="small muted clamp2">${n.body}</div><div class="tiny faint">${ago(n.at)}</div></div></${n.link ? 'a' : 'div'}>`)}</div>`
      : empty('🔔', t('You\'re all caught up'), t('Offers, deal updates and messages will appear here.'));
    await api('/notifications/read', { method: 'POST' });
    refreshMe();
  }
  await load();
  return on('notification', load);
}
