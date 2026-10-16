// API routes — Public config, phone OTP, sign-up, login and demo personas.
import crypto from 'node:crypto';
import { CAMPUS, CATEGORIES, CONDITIONS, DEMO, DEPARTMENTS, LOCATIONS, PROHIBITED_SUMMARY, REPORT_CATEGORIES, RULES_TEXT, locById } from '../config/rules.js';
import { db, hmac, sha } from '../core/db.js';
import { GET, POST, rateLimit } from '../core/http.js';
import { S, clampStr, fail, int, now } from '../core/util.js';
import { audit, notify } from '../services/notifications.js';
import { checkOtp, makeUser, newSession, normPhone } from '../services/users.js';
import { ledger } from '../services/wallet.js';

GET('/api/config', () => ({
  campus: { name: CAMPUS.name, short: CAMPUS.short, emailDomains: CAMPUS.emailDomains, collegeIdPattern: CAMPUS.collegeIdPattern, securityPhone: CAMPUS.securityPhone, securityName: CAMPUS.securityName },
  categories: CATEGORIES, conditions: CONDITIONS, locations: LOCATIONS, departments: DEPARTMENTS,
  settings: S(), prohibited: PROHIBITED_SUMMARY, rules: RULES_TEXT, demo: DEMO, reportCategories: REPORT_CATEGORIES,
  supportUserId: db.users.find((u) => u.isAdmin && !u.deleted)?.id || null,
  demoUsers: DEMO ? db.users.filter((u) => u.demo).map((u) => ({ id: u.id, name: u.name, avatar: u.avatar, color: u.color, persona: u.demo, isAdmin: !!u.isAdmin })) : [],
}), { auth: false });
// ---------- auth
POST('/api/auth/otp', ({ body, ip }) => {
  const phone = normPhone(body.phone);
  if (!phone) fail(400, 'Enter a valid 10-digit Indian mobile number.');
  rateLimit('otp:' + phone, 5, 10 * 60000); rateLimit('otpip:' + ip, 20, 10 * 60000);
  const exists = db.users.some((u) => u.phoneHash === hmac(phone) && !u.deleted);
  if (body.purpose === 'login' && !exists) fail(404, 'No account with this number. Please sign up with your college details.');
  if (body.purpose === 'signup' && exists) fail(409, 'This phone number is already registered — one account per phone. Please log in.');
  const code = String(crypto.randomInt(100000, 999999));
  db.otps = db.otps.filter((o) => o.phoneHash !== hmac(phone) && o.exp > now());
  db.otps.push({ phoneHash: hmac(phone), codeHash: sha(code + phone), exp: now() + 5 * 60000, tries: 0 });
  console.log(`[otp] ${phone.slice(0, 2)}••••••${phone.slice(-2)} → ${code}`);
  return { sent: true, expiresIn: 300, demoOtp: DEMO ? code : undefined };
}, { auth: false });
POST('/api/auth/signup', ({ body }) => {
  const phone = normPhone(body.phone);
  if (!phone) fail(400, 'Enter a valid 10-digit mobile number.');
  const name = clampStr(body.name, 40);
  if (name.length < 2) fail(400, 'Please enter your full name as on your college ID.');
  const email = clampStr(body.email, 80).toLowerCase();
  const domain = email.split('@')[1];
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || !CAMPUS.emailDomains.includes(domain)) fail(400, `Use your official college email (@${CAMPUS.emailDomains[0]}). Only verified campus members can join.`);
  const collegeId = clampStr(body.collegeId, 16).toUpperCase();
  if (!new RegExp(CAMPUS.collegeIdPattern).test(collegeId)) fail(400, 'College ID format looks wrong (e.g. CS21045).');
  if (!DEPARTMENTS.includes(body.dept)) fail(400, 'Choose your department.');
  if (!body.consent?.terms || !body.consent?.privacy) fail(400, 'Please accept the Terms and Privacy Policy to continue.');
  if (db.users.some((u) => !u.deleted && u.collegeId === collegeId)) fail(409, 'An account already exists for this college ID — one account per ID.');
  if (db.users.some((u) => !u.deleted && u.emailHash === hmac(email))) fail(409, 'This college email is already registered.');
  if (db.users.some((u) => !u.deleted && u.phoneHash === hmac(phone))) fail(409, 'This phone number is already registered.');
  checkOtp(phone, body.otp);
  const isStaff = body.dept === 'Administration' || domain.startsWith('staff.');
  const ref = body.referral ? db.users.find((u) => u.referralCode === String(body.referral).trim().toUpperCase()) : null;
  const u = makeUser({
    name, email, phone, collegeId, dept: body.dept, year: isStaff ? 'Staff' : String(Math.min(5, Math.max(1, int(body.year) || 1))),
    role: isStaff ? 'staff' : 'student', residence: body.residence === 'hostel' ? 'hostel' : 'day',
    hostel: body.residence === 'hostel' && locById(body.hostel) ? body.hostel : null,
    bio: clampStr(body.bio, 160), avatar: typeof body.avatar === 'string' && body.avatar.length < 200_000 && body.avatar.startsWith('data:image/') ? body.avatar : null,
    referredBy: ref?.id || null, consent: { terms: true, privacy: true, location: !!body.consent.location, camera: !!body.consent.camera, notifications: !!body.consent.notifications, at: now(), version: '1.0' },
  });
  if (['en', 'ta'].includes(body.lang)) u.lang = body.lang;
  u.wallet.balance = DEMO ? 300 : 0; // demo wallet credit
  if (DEMO) ledger(u.id, 'topup', 300, 'Welcome credit (demo mode)');
  db.users.push(u);
  notify(u.id, 'welcome', `Welcome to CampusLoop, ${name.split(' ')[0]}!`, 'Your campus identity is verified. Buy, sell, get help and deliver — every deal is protected by escrow.', '#/home');
  if (ref) notify(ref.id, 'referral', 'Your referral joined', `${name} joined using your code. You both earn a fee-free deal after their first completed deal.`);
  audit(u.id, 'signup', u.id);
  return newSession(u);
}, { auth: false });
POST('/api/auth/login', ({ body, ip }) => {
  const phone = normPhone(body.phone);
  if (!phone) fail(400, 'Enter a valid mobile number.');
  rateLimit('login:' + ip, 30, 10 * 60000);
  const u = db.users.find((x) => x.phoneHash === hmac(phone) && !x.deleted);
  if (!u) fail(404, 'No account found.');
  checkOtp(phone, body.otp);
  return newSession(u);
}, { auth: false });
POST('/api/auth/demo', ({ body }) => {
  if (!DEMO) fail(403, 'Demo login disabled.');
  const u = db.users.find((x) => x.id === body.userId && x.demo);
  if (!u) fail(404, 'Demo user not found.');
  return newSession(u);
}, { auth: false });
POST('/api/auth/logout', ({ token }) => { db.sessions = db.sessions.filter((s) => s.tokenHash !== sha(token)); return { ok: true }; });
