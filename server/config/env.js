// Environment: loads .env (no dependencies) and validates what a real deployment needs.
// Imported first by server/index.js so every other module sees the final process.env.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

// KEY=value lines; # comments; optional quotes. Variables already set in the environment win (tests, Docker, hosts).
export function loadEnvFile(file = process.env.ENV_FILE || path.join(ROOT, '.env')) {
  let text;
  try { text = fs.readFileSync(file, 'utf8'); } catch { return false; }
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!m || line.trim().startsWith('#')) continue;
    let v = m[2];
    if (/^(['"]).*\1$/.test(v)) v = v.slice(1, -1);
    else v = v.replace(/\s+#.*$/, '');
    if (!(m[1] in process.env)) process.env[m[1]] = v;
  }
  return true;
}
loadEnvFile();

const env = process.env;
const list = (v) => (v || '').split(',').map((s) => s.trim()).filter(Boolean);
export const PRODUCTION = env.DEMO === '0';

export const SMS = {
  provider: (env.SMS_PROVIDER || (PRODUCTION ? '' : 'console')).toLowerCase(),
  msg91: { authKey: env.MSG91_AUTH_KEY || '', templateId: env.MSG91_TEMPLATE_ID || '', base: env.MSG91_API_BASE || 'https://control.msg91.com' },
  twilio: { sid: env.TWILIO_ACCOUNT_SID || '', token: env.TWILIO_AUTH_TOKEN || '', from: env.TWILIO_FROM || '', service: env.TWILIO_MESSAGING_SERVICE_SID || '', base: env.TWILIO_API_BASE || 'https://api.twilio.com' },
};
export const RAZORPAY = {
  keyId: env.RAZORPAY_KEY_ID || '', keySecret: env.RAZORPAY_KEY_SECRET || '', webhookSecret: env.RAZORPAY_WEBHOOK_SECRET || '',
  base: env.RAZORPAY_API_BASE || 'https://api.razorpay.com',
};
export const paymentsEnabled = () => !!(RAZORPAY.keyId && RAZORPAY.keySecret);
export const ADMIN_PHONES = list(env.ADMIN_PHONES).map((p) => p.replace(/\D/g, '').slice(-10)).filter((p) => p.length === 10);
export const TRUST_PROXY = env.TRUST_PROXY === '1';

// Everything a real campus deployment cannot run without. Returns human-readable problems (empty = OK).
export function configProblems() {
  if (!PRODUCTION) return [];
  const p = [];
  if (!env.DATA_KEY || env.DATA_KEY.length < 32) p.push('DATA_KEY must be a random secret of at least 32 characters (encrypts phone numbers and emails). Generate one: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"');
  if (!env.CAMPUS_NAME) p.push('CAMPUS_NAME is required (your college name).');
  if (!env.CAMPUS_DOMAINS) p.push('CAMPUS_DOMAINS is required (official email domains, e.g. yourcollege.edu.in,staff.yourcollege.edu.in).');
  if (!ADMIN_PHONES.length) p.push('ADMIN_PHONES is required (10-digit mobile numbers that get admin access when they sign up).');
  if (SMS.provider === 'msg91') { if (!SMS.msg91.authKey || !SMS.msg91.templateId) p.push('MSG91_AUTH_KEY and MSG91_TEMPLATE_ID are required for SMS_PROVIDER=msg91.'); }
  else if (SMS.provider === 'twilio') { if (!SMS.twilio.sid || !SMS.twilio.token || !(SMS.twilio.from || SMS.twilio.service)) p.push('TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and TWILIO_FROM (or TWILIO_MESSAGING_SERVICE_SID) are required for SMS_PROVIDER=twilio.'); }
  else if (SMS.provider !== 'console') p.push('SMS_PROVIDER must be msg91 or twilio (or console for local testing only).');
  if (!!RAZORPAY.keyId !== !!RAZORPAY.keySecret) p.push('Set both RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET, or neither (wallet top-ups stay off).');
  return p;
}
export function configWarnings() {
  if (!PRODUCTION) return [];
  const w = [];
  if (SMS.provider === 'console') w.push('SMS_PROVIDER=console: OTPs are printed in this server log, not sent by SMS. Use only for local testing.');
  if (!paymentsEnabled()) w.push('Razorpay keys not set: wallet top-ups are switched off (free items, lost & found and chat still work).');
  else if (!RAZORPAY.webhookSecret) w.push('RAZORPAY_WEBHOOK_SECRET not set: top-ups are only credited when the browser returns from checkout. Add the webhook for reliability.');
  if (RAZORPAY.keyId.startsWith('rzp_test_')) w.push('Razorpay TEST keys in use: no real money moves.');
  return w;
}
