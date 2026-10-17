// Business rules: one place for fees, limits, campus geography, prohibited content and fraud heuristics.

// Everything here is surfaced to users in plain language (Transparency principle).

export const DEMO = process.env.DEMO !== '0'; // demo mode: one-tap personas, OTPs shown on screen
export const DEPARTMENTS = ['CSE', 'IT', 'AI & DS', 'ECE', 'EEE', 'MECH', 'CIVIL', 'MBA', 'Science & Humanities', 'Administration'];

export const CAMPUS = {
  name: process.env.CAMPUS_NAME || 'Demo Engineering College',
  short: process.env.CAMPUS_SHORT || 'DEC',
  emailDomains: (process.env.CAMPUS_DOMAINS || 'dec.edu.in,staff.dec.edu.in').split(',').map((d) => d.trim().toLowerCase()).filter(Boolean),
  collegeIdPattern: process.env.COLLEGE_ID_PATTERN || '^[A-Za-z]{2,4}[0-9]{4,8}$',
  securityPhone: process.env.SECURITY_PHONE || '+91 94430 00100',
  securityName: process.env.SECURITY_NAME || 'Campus Security Control Room',
};

export const DEFAULT_SETTINGS = {
  feePercent: 2,          // platform fee on top of item price / reward
  feeMin: 1,
  feeMax: 10,
  maxItemPrice: 5000,     // ₹ per item
  maxTaskReward: 500,     // ₹ per task / pick-drop
  dailyLimit: 3000,       // ₹ a user can commit per day
  helperActiveCap: 2,     // fair distribution: max simultaneous jobs per helper
  urgentPerDay: 1,        // urgent posts per user per day
  campusOpen: '06:00',
  campusClose: '23:00',
  enforceHours: true,
  disputeSlaHours: 24,
  offerExpiryHours: 24,
  autoReleaseHours: 48,   // delivered but receiver silent → auto release unless disputed
  maxTaskDays: 7,
  strikeSuspendDays: 7,
  reportThreshold: 3,     // independent credible reporters that flag a vendor for admin review (never an automatic penalty)
  reportWindowDays: 30,   // window for counting those reports
  appealWindowDays: 14,   // days a member has to appeal a moderation action
};

// Complaint categories. vendor=true → offered when reporting a seller / task poster, their listing or task.
export const REPORT_CATEGORIES = [
  { id: 'pricing', en: 'Suspicious or misleading pricing', vendor: true, hint: 'A high price alone is not a violation — describe what is misleading (e.g. bait price, hidden charges, price changed after agreeing).' },
  { id: 'fraud', en: 'Fraud or scam', vendor: true },
  { id: 'fake_details', en: 'Fake or misleading product details', vendor: true },
  { id: 'prohibited', en: 'Prohibited listing', vendor: true },
  { id: 'offplatform', en: 'Asked to pay outside the app', vendor: true },
  { id: 'no_show', en: 'No-show', vendor: true },
  { id: 'harassment', en: 'Harassment or abuse', vendor: true },
  { id: 'spam', en: 'Spam or wrong category', vendor: true },
  { id: 'other', en: 'Other policy violation', vendor: true },
];
// Map free-text reasons from older clients / existing records onto a category.
export function reportCategoryFor(reason = '') {
  const r = String(reason).toLowerCase();
  if (/pric/.test(r)) return 'pricing';
  if (/scam|fraud/.test(r)) return 'fraud';
  if (/fake|counterfeit|not as described|misleading/.test(r)) return 'fake_details';
  if (/prohibit/.test(r)) return 'prohibited';
  if (/outside|upi|off-platform/.test(r)) return 'offplatform';
  if (/no-show|no show/.test(r)) return 'no_show';
  if (/harass|abuse|rude/.test(r)) return 'harassment';
  if (/spam|category/.test(r)) return 'spam';
  return 'other';
}

export const CATEGORIES = [
  // freeOnly: second-hand books can't be sold under government rules — they can only be given away free
  { id: 'books', en: 'Books & Notes', ta: 'புத்தகங்கள்', icon: '📚', kgSaved: 0.6, base: 250, freeOnly: true },
  { id: 'calculators', en: 'Calculators', ta: 'கால்குலேட்டர்', icon: '🧮', kgSaved: 0.2, base: 600 },
  { id: 'labgear', en: 'Lab Coats & Kits', ta: 'ஆய்வக உடை', icon: '🥼', kgSaved: 0.5, base: 200 },
  { id: 'cycles', en: 'Cycles', ta: 'சைக்கிள்', icon: '🚲', kgSaved: 12, base: 2200 },
  { id: 'gadgets', en: 'Gadgets', ta: 'கருவிகள்', icon: '🎧', kgSaved: 0.4, base: 700 },
  { id: 'hostel', en: 'Hostel Essentials', ta: 'விடுதி பொருட்கள்', icon: '🛏️', kgSaved: 1.5, base: 300 },
  { id: 'sports', en: 'Sports', ta: 'விளையாட்டு', icon: '🏸', kgSaved: 0.8, base: 400 },
  { id: 'stationery', en: 'Stationery & Drafters', ta: 'எழுதுபொருள்', icon: '📐', kgSaved: 0.3, base: 150 },
  { id: 'other', en: 'Other', ta: 'மற்றவை', icon: '📦', kgSaved: 0.5, base: 200 },
];
export const LOST_FOUND_DESK = 'admin'; // found items are handed in and collected here (Admin Block)
export const isFreeOnly = (category) => !!CATEGORIES.find((c) => c.id === category)?.freeOnly;
export const FREE_ONLY_MSG = 'Second-hand books can’t be sold as per government rules — books & notes can only be given away for free.';

export const CONDITIONS = [
  { id: 'new', en: 'Like new', ta: 'புதியது போல', factor: 0.75 },
  { id: 'good', en: 'Good', ta: 'நல்லது', factor: 0.6 },
  { id: 'fair', en: 'Fair', ta: 'பரவாயில்லை', factor: 0.45 },
  { id: 'worn', en: 'Well used', ta: 'அதிகம் பயன்பட்டது', factor: 0.3 },
];

// Campus map: x,y on a 1000×700 canvas. safe=true → well-lit, CCTV-covered public meeting point.
export const LOCATIONS = [
  { id: 'gate', name: 'Main Gate', ta: 'முதன்மை வாயில்', x: 500, y: 655, safe: true, kind: 'gate' },
  { id: 'admin', name: 'Admin Block', ta: 'நிர்வாக கட்டடம்', x: 500, y: 520, safe: true, kind: 'academic' },
  { id: 'library', name: 'Central Library', ta: 'மைய நூலகம்', x: 330, y: 400, safe: true, kind: 'academic' },
  { id: 'cse', name: 'CSE Block', ta: 'CSE கட்டடம்', x: 200, y: 260, safe: true, kind: 'academic' },
  { id: 'ece', name: 'ECE Block', ta: 'ECE கட்டடம்', x: 380, y: 210, safe: true, kind: 'academic' },
  { id: 'mech', name: 'Mech Workshop', ta: 'இயந்திரப் பட்டறை', x: 150, y: 470, safe: false, kind: 'academic' },
  { id: 'canteen', name: 'Main Canteen', ta: 'உணவகம்', x: 640, y: 390, safe: true, kind: 'food' },
  { id: 'xerox', name: 'Xerox & Print Shop', ta: 'நகல் கடை', x: 560, y: 300, safe: true, kind: 'service' },
  { id: 'post', name: 'Post & Courier Room', ta: 'தபால் அறை', x: 690, y: 470, safe: true, kind: 'service' },
  { id: 'sports', name: 'Sports Complex', ta: 'விளையாட்டு வளாகம்', x: 820, y: 560, safe: true, kind: 'sports' },
  { id: 'hosA', name: 'Hostel A (Boys)', ta: 'விடுதி A', x: 800, y: 200, safe: false, kind: 'hostel' },
  { id: 'hosB', name: 'Hostel B (Boys)', ta: 'விடுதி B', x: 900, y: 320, safe: false, kind: 'hostel' },
  { id: 'hosG', name: 'Girls Hostel', ta: 'மகளிர் விடுதி', x: 640, y: 120, safe: false, kind: 'hostel' },
  { id: 'hosgate', name: 'Hostel Lobby Desk', ta: 'விடுதி வரவேற்பு', x: 760, y: 280, safe: true, kind: 'hostel' },
  { id: 'medical', name: 'Health Centre', ta: 'சுகாதார மையம்', x: 420, y: 560, safe: true, kind: 'service' },
  { id: 'park', name: 'Cycle Stand', ta: 'சைக்கிள் நிறுத்தம்', x: 290, y: 600, safe: true, kind: 'service' },
];
export const locById = (id) => LOCATIONS.find((l) => l.id === id);

// Distance in metres (map unit ≈ 1.1 m) and a transparent "fair fare" for pick & drop.
export function distance(a, b) {
  const A = locById(a), B = locById(b);
  if (!A || !B) return 0;
  return Math.round(Math.hypot(A.x - B.x, A.y - B.y) * 1.1);
}
export function fairFare(from, to, size = 'small') {
  const m = distance(from, to);
  const sizeAdd = { small: 0, medium: 5, large: 15 }[size] ?? 0;
  return Math.max(10, Math.round((10 + m / 100 * 3 + sizeAdd) / 5) * 5);
}

// ---------- Fees ----------
export function calcFee(amount, s) {
  if (!amount || amount <= 0) return 0;
  const f = Math.round((amount * s.feePercent) / 100);
  return Math.min(s.feeMax, Math.max(s.feeMin, f));
}
export function breakdown(amount, s, waiver = false) {
  const fee = waiver ? 0 : calcFee(amount, s);
  return { amount, fee, total: amount + fee, feeWaived: waiver && amount > 0 };
}

// ---------- Prohibited content ----------
// Each rule carries a human-readable reason that is shown to the user (Transparency).
const PROHIBITED = [
  { re: /\b(alcohol|beer|whisk(e)?y|vodka|rum|wine|liquor|brandy|toddy)\b/i, reason: 'Alcohol is not allowed on campus.' },
  { re: /\b(cigarettes?|cigs?|tobacco|gutkha|hans|beedi|vape|e-?cig|hookah|cool lip)\b/i, reason: 'Tobacco and vaping products are prohibited.' },
  { re: /\b(weed|ganja|marijuana|cannabis|drugs?|mdma|lsd|cocaine|hash(ish)?|charas|pills? for high)\b/i, reason: 'Drugs and narcotics are prohibited.' },
  { re: /\b(knife|knives|gun|pistol|air ?gun|weapon|sword|nunchaku|pepper spray|blade)\b/i, reason: 'Weapons are not allowed.' },
  { re: /\b(antibiotics?|tablets?|medicines?|syrup|painkillers?|sleeping pills?|prescription|injection)\b/i, reason: 'Medicines cannot be traded without a prescription — please visit the Health Centre.' },
  { re: /\b(fake|replica|first ?copy|duplicate (brand|watch|shoes)|counterfeit|stolen|without bill.*cheap)\b/i, reason: 'Counterfeit or stolen goods are prohibited.' },
  { re: /\b(write|do|complete|solve|finish)\s+(my|our|the)?\s*(assignments?|homework|records?|lab records?|observation|exam|test|quiz|project report)\b/i, reason: 'Academic dishonesty: you can get help delivering or printing records, not writing them.' },
  { re: /\b(proxy|attendance for me|sign (in|for) me|impersonat|exam answers?|question paper leak|leaked paper)\b/i, reason: 'Proxy attendance or exam help breaks college rules.' },
];
export function prohibitedCheck(...texts) {
  const t = texts.filter(Boolean).join(' ');
  for (const p of PROHIBITED) if (p.re.test(t)) return p.reason;
  return null;
}
export const PROHIBITED_SUMMARY = [
  'Alcohol, tobacco, vapes and drugs',
  'Weapons of any kind',
  'Medicines without a prescription',
  'Stolen, fake or counterfeit goods',
  'Doing assignments, records, exams or proxy attendance for others',
  'Selling second-hand books or notes (give them away free instead)',
];

// ---------- Chat safety ----------
const OFF_PLATFORM = /(\b[\w.-]{2,}@(ok\w+|ybl|ibl|axl|paytm|upi|apl|icici|sbi|hdfcbank|axisbank|oksbi|okaxis|okhdfcbank|okicici)\b)|(\b(?:\+?91[-\s]?)?[6-9]\d{4}[-\s]?\d{5}\b)|(\b(gpay|g pay|google ?pay|phone ?pe|phonepe|paytm|bhim|pay (me )?(outside|directly|in cash)|cash only|send (to|on) (my )?(upi|number))\b)/gi;
const ROOM_NO = /\b(room|rm\.?|r\.no)\s*(no\.?|number|#)?\s*[a-z]?-?\d{2,4}\b/i;
export function scanMessage(text) {
  let flagged = false;
  const clean = text.replace(OFF_PLATFORM, () => { flagged = true; return '•••••'; });
  return { text: clean, offPlatform: flagged, roomNumber: ROOM_NO.test(text) };
}

// ---------- Similarity / fraud ----------
const tokens = (s) => new Set(String(s).toLowerCase().replace(/[^a-z0-9஀-௿ ]/g, ' ').split(/\s+/).filter((w) => w.length > 2));
export function similarity(a, b) {
  const A = tokens(a), B = tokens(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  return inter / (A.size + B.size - inter);
}
export const median = (arr) => {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b), m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
};

// "AI" price suggestion: nearest-neighbour over past + current listings, condition-adjusted.
export function suggestPrice({ title = '', category = 'other', condition = 'good' }, listings) {
  const cat = CATEGORIES.find((c) => c.id === category) || CATEGORIES.at(-1);
  const cond = CONDITIONS.find((c) => c.id === condition) || CONDITIONS[1];
  const pool = listings
    .filter((l) => l.category === category && l.price > 0 && l.status !== 'removed')
    .map((l) => ({ l, sim: similarity(title, l.title) }));
  const close = pool.filter((p) => p.sim >= 0.2).sort((a, b) => b.sim - a.sim).slice(0, 8);
  const sample = close.length >= 2 ? close : pool.slice(0, 12);
  let basePrice, basis;
  if (sample.length >= 2) {
    // normalise each comparable to "good" condition, then re-apply this item's condition
    const normalised = sample.map(({ l }) => {
      const f = (CONDITIONS.find((c) => c.id === l.condition) || cond).factor;
      return (l.price / f) * cond.factor;
    });
    basePrice = median(normalised);
    basis = `${sample.length} similar ${close.length >= 2 ? 'items' : cat.en.toLowerCase()} on campus`;
  } else {
    basePrice = (cat.base / 0.6) * cond.factor;
    basis = `typical ${cat.en.toLowerCase()} prices, ${cond.en.toLowerCase()} condition`;
  }
  const r5 = (v) => Math.max(0, Math.round(v / 5) * 5);
  return { suggested: r5(basePrice), low: r5(basePrice * 0.8), high: r5(basePrice * 1.15), quickSale: r5(basePrice * 0.85), basis, samples: sample.length };
}

// ---------- Time helpers ----------
export function withinHours(date, s) {
  if (!s.enforceHours) return true;
  const d = new Date(date);
  // campus clock = IST
  const ist = new Date(d.getTime() + (330 + d.getTimezoneOffset()) * 60000);
  const mins = ist.getHours() * 60 + ist.getMinutes();
  const [oh, om] = s.campusOpen.split(':').map(Number);
  const [ch, cm] = s.campusClose.split(':').map(Number);
  return mins >= oh * 60 + om && mins <= ch * 60 + cm;
}
export function istDayKey(t = Date.now()) {
  return new Date(t + 330 * 60000).toISOString().slice(0, 10);
}

export const RULES_TEXT = [
  { h: 'Who can join', b: 'Only verified students and staff of the campus — one account per college ID and per phone number.' },
  { h: 'Books are free', b: 'As per government rules, second-hand books and notes cannot be sold. You can give them away for free — no price, no fees.' },
  { h: 'Lost & found', b: 'Found something? Hand it in at the Admin Block desk and report it in the app. The desk posts it, checks every claim and returns it to the owner, who shows their college ID. Lost items are not posted and finders are never contacted directly — this stops fake claims.' },
  { h: 'Fees', b: 'A small platform fee is added on top of the price or reward and shown before you confirm. There are no hidden charges and no paid boosting.' },
  { h: 'How payment works', b: 'Money is held safely in escrow inside the app. It is released to the seller or helper only after both of you confirm the handover with the delivery OTP.' },
  { h: 'Both must agree', b: 'Nothing starts until both sides accept. Any change to price or time after acceptance needs both to approve again.' },
  { h: 'Meet safely', b: 'Hand over at approved public meeting points. Never share your exact room number. Use the SOS button if you feel unsafe.' },
  { h: 'Fair for everyone', b: 'Everyone gets the same rules and visibility. New users are mixed into the feed, urgent posts are limited per day and helpers have a cap on active jobs.' },
  { h: 'Disputes', b: 'Raise a dispute within the deal. Money is frozen and an admin decides within the published time, always with a written reason.' },
  { h: 'Strikes', b: '1st strike: warning. 2nd: temporary suspension. 3rd: permanent ban. Strikes are for cheating, fake listings, no-shows or off-platform payment requests.' },
];
