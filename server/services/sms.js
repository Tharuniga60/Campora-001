// OTP delivery by SMS. Providers: MSG91 (OTP API with a DLT-approved template) or Twilio (Messages API).
// "console" prints the code to the server log — for local testing only, never for real users.
import { SMS } from '../config/env.js';
import { CAMPUS } from '../config/rules.js';
import { fail } from '../core/util.js';

const masked = (phone) => `${phone.slice(0, 2)}••••••${phone.slice(-2)}`;

async function post(url, init) {
  const r = await fetch(url, { ...init, signal: AbortSignal.timeout(10_000) });
  const text = await r.text();
  let data; try { data = JSON.parse(text); } catch { data = { raw: text }; }
  return { ok: r.ok, status: r.status, data };
}

async function msg91(phone, code) {
  const { authKey, templateId, base } = SMS.msg91;
  const qs = new URLSearchParams({ template_id: templateId, mobile: '91' + phone, otp: code, otp_expiry: '5' });
  const r = await post(`${base}/api/v5/otp?${qs}`, { method: 'POST', headers: { authkey: authKey, 'content-type': 'application/json' }, body: JSON.stringify({ OTP: code }) });
  if (!r.ok || r.data.type === 'error') throw new Error(`MSG91 ${r.status}: ${r.data.message || r.data.raw || 'error'}`);
}

async function twilio(phone, code) {
  const { sid, token, from, service, base } = SMS.twilio;
  const form = new URLSearchParams({ To: '+91' + phone, Body: `${code} is your ${CAMPUS.short || 'CampusLoop'} login code. It expires in 5 minutes. Never share it with anyone.` });
  if (service) form.set('MessagingServiceSid', service); else form.set('From', from);
  const r = await post(`${base}/2010-04-01/Accounts/${encodeURIComponent(sid)}/Messages.json`, {
    method: 'POST', body: form,
    headers: { authorization: 'Basic ' + Buffer.from(`${sid}:${token}`).toString('base64'), 'content-type': 'application/x-www-form-urlencoded' },
  });
  if (!r.ok) throw new Error(`Twilio ${r.status}: ${r.data.message || r.data.raw || 'error'}`);
}

export async function sendOtpSms(phone, code) {
  if (SMS.provider === 'console') { console.log(`[otp] ${masked(phone)} → ${code}  (SMS_PROVIDER=console — not sent)`); return; }
  try {
    if (SMS.provider === 'msg91') await msg91(phone, code);
    else if (SMS.provider === 'twilio') await twilio(phone, code);
    else throw new Error(`unknown SMS_PROVIDER "${SMS.provider}"`);
  } catch (e) {
    console.error(`[sms] OTP to ${masked(phone)} failed:`, e.message);
    fail(502, 'We couldn’t send the OTP SMS right now. Please try again in a minute.');
  }
}
