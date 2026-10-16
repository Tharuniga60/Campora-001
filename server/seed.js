// Demo seed: a living campus with history, so trust scores, analytics and feeds are meaningful from minute one.
import crypto from 'node:crypto';
import { emptyDb, replace, db, uid, encrypt } from './db.js';
import { makeUser } from './app.js';
import { CATEGORIES } from './rules.js';

const H = 3600e3, DAY = 24 * H;
const rnd = (a, b) => a + crypto.randomInt(b - a + 1);
const pick = (arr) => arr[crypto.randomInt(arr.length)];

const PALETTE = {
  books: ['#F3D9A4', '#C9823A'], calculators: ['#CFE3DC', '#2F7A64'], labgear: ['#E6EEF7', '#5A7FA8'], cycles: ['#F6D3C4', '#C0583A'],
  gadgets: ['#DCD4F0', '#6B4FB0'], hostel: ['#F2E2C6', '#A87A3C'], sports: ['#D7EBC9', '#4E8A34'], stationery: ['#F5E6B8', '#B08A12'], other: ['#E4E1DA', '#77705F'],
};
export function itemArt(category, emoji, label, variant = 0) {
  const [bg, fg] = PALETTE[category] || PALETTE.other;
  const dots = [];
  for (let y = 40; y < 600; y += 56) for (let x = 40; x < 600; x += 56) dots.push(`<circle cx="${x + (variant % 2) * 28}" cy="${y}" r="3" fill="${fg}" opacity=".18"/>`);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 600"><defs><radialGradient id="g" cx=".3" cy=".25" r=".9"><stop offset="0" stop-color="#fff" stop-opacity=".7"/><stop offset="1" stop-color="${bg}"/></radialGradient></defs><rect width="600" height="600" fill="${bg}"/><rect width="600" height="600" fill="url(#g)"/>${dots.join('')}<circle cx="300" cy="285" r="170" fill="#fff" opacity=".45"/><text x="300" y="350" font-size="190" text-anchor="middle" font-family="Apple Color Emoji,Segoe UI Emoji,Noto Color Emoji,sans-serif">${emoji}</text><text x="300" y="540" font-size="34" font-weight="700" text-anchor="middle" fill="${fg}" font-family="Arial,sans-serif" letter-spacing="2">${label.toUpperCase()}</text></svg>`;
  return 'data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64');
}

export function seed() {
  const d = emptyDb();
  replace(d);
  const now = Date.now();

  const people = [
    { key: 'admin', name: 'Dr. Meena Raghavan', dept: 'Administration', year: 'Staff', role: 'staff', isAdmin: true, residence: 'day', phone: '9876500001', email: 'meena.r@staff.dec.edu.in', collegeId: 'ST1001', bio: 'Student welfare officer & CampusLoop moderator.', demo: 'Admin / Moderator', color: '#3B3A36' },
    { key: 'priya', name: 'Priya Sundaram', dept: 'CSE', year: '3', residence: 'hostel', hostel: 'hosG', phone: '9876500002', email: 'priya.s@dec.edu.in', collegeId: 'CS22041', bio: 'Selling what I outgrew. Quick replies, fair prices 🙂', demo: 'Seller · hosteller', color: '#B5462E' },
    { key: 'arjun', name: 'Arjun Kumar', dept: 'MECH', year: '2', residence: 'hostel', hostel: 'hosA', phone: '9876500003', email: 'arjun.k@dec.edu.in', collegeId: 'ME23017', bio: 'Free between classes — happy to run errands across campus 🏃', demo: 'Helper / runner', color: '#1F5E4E' },
    { key: 'kavya', name: 'Kavya Ramesh', dept: 'ECE', year: '1', residence: 'day', phone: '9876500004', email: 'kavya.r@dec.edu.in', collegeId: 'EC24088', bio: 'Day scholar. Looking for second-hand books & a calculator.', demo: 'Buyer · day scholar', color: '#7A4FB3' },
    { key: 'rahul', name: 'Rahul Dev', dept: 'IT', year: '1', residence: 'hostel', hostel: 'hosB', phone: '9876500005', email: 'rahul.d@dec.edu.in', collegeId: 'IT24102', bio: 'Just joined!', demo: 'New member', color: '#2F6FB0' },
    { key: 'sneha', name: 'Sneha Iyer', dept: 'AI & DS', year: '4', residence: 'hostel', hostel: 'hosG', phone: '9876500006', email: 'sneha.i@dec.edu.in', collegeId: 'AD21009', bio: 'Final year — clearing my shelf before placements.' },
    { key: 'vignesh', name: 'Vignesh Murugan', dept: 'EEE', year: '3', residence: 'day', phone: '9876500007', email: 'vignesh.m@dec.edu.in', collegeId: 'EE22033', bio: 'Electronics tinkerer.' },
    { key: 'fathima', name: 'Fathima Nasreen', dept: 'CIVIL', year: '2', residence: 'hostel', hostel: 'hosG', phone: '9876500008', email: 'fathima.n@dec.edu.in', collegeId: 'CE23055', bio: 'Drafting tools & notes available.' },
    { key: 'karthik', name: 'Karthik Selvam', dept: 'MECH', year: '4', residence: 'hostel', hostel: 'hosB', phone: '9876500009', email: 'karthik.s@dec.edu.in', collegeId: 'ME21071', bio: '' },
    { key: 'divya', name: 'Divya Prakash', dept: 'IT', year: '2', residence: 'day', phone: '9876500010', email: 'divya.p@dec.edu.in', collegeId: 'IT23019', bio: 'Print-shop runs every afternoon.' },
    { key: 'irfan', name: 'Mohammed Irfan', dept: 'CSE', year: '2', residence: 'hostel', hostel: 'hosA', phone: '9876500011', email: 'irfan.m@dec.edu.in', collegeId: 'CS23066', bio: 'Cycle around campus all day — ping me for deliveries.' },
    { key: 'lakshmi', name: 'Lakshmi Narayanan', dept: 'Science & Humanities', year: 'Staff', role: 'staff', residence: 'day', phone: '9876500012', email: 'lakshmi.n@staff.dec.edu.in', collegeId: 'ST1022', bio: 'Physics lab in-charge.' },
    { key: 'harish', name: 'Harish Babu', dept: 'ECE', year: '3', residence: 'hostel', hostel: 'hosA', phone: '9876500013', email: 'harish.b@dec.edu.in', collegeId: 'EC22090', bio: '' },
    { key: 'nandhini', name: 'Nandhini Ravi', dept: 'MBA', year: '1', residence: 'day', phone: '9876500014', email: 'nandhini.r@dec.edu.in', collegeId: 'MB24004', bio: 'Organising group canteen runs 🍱' },
  ];
  const U = {};
  for (const p of people) {
    const u = makeUser({ ...p, createdAt: now - rnd(20, 70) * DAY, emergency: '+91 90000 ' + p.phone.slice(-5) });
    u.wallet.balance = rnd(250, 900);
    db.users.push(u);
    U[p.key] = u;
  }
  U.rahul.createdAt = now - 2 * H;
  U.kavya.wallet.balance = 900; U.priya.wallet.balance = 520; U.arjun.wallet.balance = 340; U.rahul.wallet.balance = 300;
  U.rahul.referredBy = U.priya.id;
  for (const u of Object.values(U)) db.ledger.push({ id: uid('l'), userId: u.id, type: 'topup', amount: u.wallet.balance, note: 'UPI top-up', at: u.createdAt + H });

  // ---------------------------------------------------------------- historical marketplace + tasks (paid)
  const histItems = [
    ['books', '📘', 'Engineering Physics textbook', 180, 'good'], ['books', '📗', 'Discrete Maths (Rosen) 7th ed', 320, 'good'],
    ['calculators', '🧮', 'Casio fx-82MS calculator', 350, 'fair'], ['labgear', '🥼', 'Lab coat — size L', 150, 'good'],
    ['stationery', '📐', 'Mini drafter + set squares', 260, 'good'], ['gadgets', '🎧', 'Wired earphones (boAt)', 220, 'good'],
    ['hostel', '🪣', 'Bucket & mug set', 90, 'fair'], ['sports', '🏸', 'Badminton racket (Yonex)', 450, 'good'],
    ['books', '📕', 'Signals & Systems textbook', 240, 'fair'], ['hostel', '💡', 'Study table lamp', 260, 'good'],
    ['cycles', '🚲', 'Hero Sprint cycle', 2100, 'fair'], ['gadgets', '🔌', 'Extension board 4-socket', 180, 'good'],
    ['books', '📒', 'GATE CSE previous papers', 200, 'good'], ['labgear', '🥽', 'Safety goggles + gloves', 80, 'new'],
    ['stationery', '🖊️', 'Engineering drawing kit', 220, 'good'], ['calculators', '🧮', 'Casio fx-991MS', 520, 'good'],
    ['hostel', '🛏️', 'Pillow + bedsheet set', 0, 'good'], ['books', '📚', 'First-year notes bundle', 0, 'fair'],
  ];
  const taskHist = [
    ['task', 'Print 40 pages at Xerox shop', 25], ['pickdrop', 'Bring parcel from Post Room', 30], ['task', 'Submit signed form at Admin Block', 20],
    ['pickdrop', 'Lunch from canteen to Library', 25], ['task', 'Collect hall ticket printout', 15], ['pickdrop', 'Deliver charger to CSE Block', 20],
    ['pickdrop', 'Courier pickup from Main Gate', 35], ['task', 'Stand in fee-counter queue', 40],
  ];
  const sellers = ['priya', 'sneha', 'fathima', 'vignesh', 'karthik', 'lakshmi', 'harish', 'priya', 'sneha', 'divya'];
  const buyers = ['kavya', 'irfan', 'divya', 'arjun', 'nandhini', 'harish', 'vignesh', 'karthik', 'kavya', 'fathima'];
  const helpers = ['arjun', 'irfan', 'divya', 'arjun', 'nandhini', 'irfan', 'harish', 'arjun'];
  const posters = ['priya', 'kavya', 'sneha', 'lakshmi', 'fathima', 'vignesh', 'kavya', 'karthik'];
  const reviewTexts = {
    5: ['Smooth handover, exactly as described.', 'Super quick and polite!', 'On time, great communication.', 'Item in great condition, thanks!', 'Very reliable 👍'],
    4: ['Good deal, slight delay but fine.', 'As described. Would deal again.', 'Helpful and friendly.'],
    3: ['Okay, took a while to respond.', 'Item a bit more worn than photos.'],
  };
  const tagsPool = ['On time', 'As described', 'Friendly', 'Fair price', 'Quick reply', 'Careful handling'];

  function histDeal({ type, ref, title, payer, payee, amount, at, meet }) {
    const fee = amount > 0 ? Math.min(10, Math.max(1, Math.round(amount * 0.02))) : 0;
    const acc = at + rnd(3, 90) * 60000;
    const deal = {
      id: uid('d'), type, refId: ref, title, payerId: payer.id, payeeId: payee.id, amount, fee, total: amount + fee, feeWaived: false,
      status: 'paid', offeredBy: type === 'buy' ? payer.id : payee.id, note: '', meetPoint: meet, when: null, createdAt: at,
      acceptedAt: acc, respondedBy: type === 'buy' ? payee.id : payer.id, respondedAt: acc, startedAt: acc + 20 * 60000,
      deliveredAt: acc + 60 * 60000, confirmedAt: acc + 62 * 60000, paidAt: acc + 62 * 60000, confirmedHow: 'Receiver confirmed with delivery OTP',
      timeline: [
        { s: 'offered', at, by: payer.id }, { s: 'accepted', at: acc, by: payee.id }, { s: 'in_progress', at: acc + 20 * 60000, by: payee.id },
        { s: 'delivered', at: acc + 60 * 60000, by: payee.id }, { s: 'confirmed', at: acc + 62 * 60000, note: 'Receiver confirmed with delivery OTP' },
        { s: 'paid', at: acc + 62 * 60000, note: `₹${amount} released` },
      ],
      otp: encrypt('0000'), otpTries: 0, pending: null, proof: null, tracking: null, escrow: 0, reviewed: {}, fromTask: type !== 'buy', threadId: null,
    };
    db.deals.push(deal);
    db.meta.platformRevenue += fee;
    payee.wallet.earned += amount; payer.wallet.spent += amount + fee;
    db.ledger.push({ id: uid('l'), userId: payee.id, type: 'earning', amount, note: `Earned from “${title}”`, dealId: deal.id, at: deal.paidAt });
    db.ledger.push({ id: uid('l'), userId: payer.id, type: 'hold', amount: -(amount + fee), note: `Escrow for “${title}”`, dealId: deal.id, at });
    for (const [from, to] of [[payer, payee], [payee, payer]]) {
      if (crypto.randomInt(10) < 8) {
        const stars = pick([5, 5, 5, 4, 4, 5, 3]);
        const role = type === 'buy' ? (to === payee ? 'seller' : 'buyer') : (to === payee ? 'helper' : 'poster');
        db.reviews.push({ id: uid('v'), dealId: deal.id, from: from.id, to: to.id, stars, text: pick(reviewTexts[stars]), tags: [pick(tagsPool)], role, at: deal.paidAt + rnd(1, 20) * H });
        deal.reviewed[from.id] = true;
      }
    }
    return deal;
  }

  histItems.forEach(([cat, em, title, price, cond], i) => {
    const seller = U[sellers[i % sellers.length]], buyer = U[buyers[i % buyers.length]];
    const at = now - rnd(3, 55) * DAY;
    const l = { id: uid('l'), sellerId: seller.id, title, desc: 'Sold via CampusLoop.', category: cat, condition: cond, price, photos: [itemArt(cat, em, title.split(' ')[0], i)], meetPoint: pick(['library', 'canteen', 'admin', 'hosgate']), status: 'sold', createdAt: at - 2 * DAY, views: rnd(5, 40), priceHistory: [{ price, at: at - 2 * DAY }] };
    db.listings.push(l);
    histDeal({ type: 'buy', ref: l.id, title, payer: buyer, payee: seller, amount: price, at, meet: l.meetPoint });
  });
  for (let r = 0; r < 3; r++) taskHist.forEach(([kind, title, reward], i) => {
    const poster = U[posters[(i + r) % posters.length]], helper = U[helpers[(i + r * 3) % helpers.length]];
    if (poster === helper) return;
    const at = now - rnd(1, 52) * DAY;
    const t = { id: uid('k'), kind, posterId: poster.id, title, desc: '', reward, fee: 1, total: reward + 1, deadline: at + 4 * H, urgent: false, createdAt: at, status: 'done', offers: [{ helperId: helper.id, note: 'On it', at: at + 5 * 60000 }], assignMode: 'choose', photos: [], location: 'xerox', pickup: kind === 'pickdrop' ? 'post' : undefined, drop: kind === 'pickdrop' ? 'hosA' : undefined, escrow: 0, assignedAt: at + rnd(4, 40) * 60000 };
    db.tasks.push(t);
    histDeal({ type: kind, ref: t.id, title, payer: poster, payee: helper, amount: reward, at, meet: 'xerox' });
  });

  // ---------------------------------------------------------------- live marketplace
  const live = [
    ['priya', 'calculators', '🧮', 'Casio fx-991ES Plus calculator', 'Used for 2 semesters, all functions work. Cover included. Perfect for M1/M2 exams.', 650, 'good', 'library', 30 * H],
    ['priya', 'books', '📘', 'Data Structures textbook + solved notes', 'Clean copy, a few pencil marks. Comes with my handwritten solved problems for Unit 3–5.', 280, 'good', 'library', 5 * H],
    ['sneha', 'gadgets', '⌨️', 'Mechanical keyboard (blue switches)', 'Clicky and great for coding. Moving out after placements.', 1200, 'good', 'canteen', 2 * DAY],
    ['sneha', 'hostel', '🛏️', 'Foldable mattress + pillow', 'Thick foam mattress, washed cover. Pick up from Girls Hostel lobby.', 600, 'fair', 'hosgate', 3 * DAY],
    ['fathima', 'stationery', '📐', 'Omega mini drafter', 'Smooth scale, no wobble. First-years need this for Engineering Graphics!', 350, 'new', 'admin', 9 * H],
    ['vignesh', 'gadgets', '🔋', 'Arduino Uno + sensor kit', 'Uno board, breadboard, 15 sensors, jumper wires. Great for mini projects.', 900, 'good', 'ece', 4 * DAY],
    ['karthik', 'cycles', '🚲', 'Btwin MTB cycle — 21 gears', 'Serviced last month, new tyres. Lock included.', 3800, 'good', 'park', 6 * DAY],
    ['lakshmi', 'labgear', '🥼', 'Lab coats (M & L) — set of 2', 'Barely used, washed and ironed.', 220, 'new', 'admin', 20 * H],
    ['harish', 'gadgets', '🎧', 'JBL Tune 510BT headphones', 'Bluetooth, 30 hr battery. Original box and bill.', 1350, 'good', 'canteen', 2 * H],
    ['divya', 'books', '📗', 'Python programming + C notes (printed)', 'Spiral-bound printed notes, 180 pages.', 120, 'good', 'xerox', 12 * H],
    ['rahul', 'sports', '⚽', 'Football (size 5) — Nivia', 'Good grip, slightly scuffed.', 300, 'fair', 'sports', 1 * H],
    ['irfan', 'hostel', '🧺', 'Electric kettle 1L', 'Works perfectly. Hostel-approved model.', 450, 'good', 'hosgate', 26 * H],
    ['fathima', 'books', '📚', 'FREE: Semester 1 & 2 question banks', 'Giving away for free — someone please use them!', 0, 'fair', 'library', 4 * H],
    ['sneha', 'hostel', '🪴', 'FREE: Desk plant + pot', 'Money plant in a ceramic pot. Needs a new home.', 0, 'good', 'hosgate', 7 * H],
    ['nandhini', 'stationery', '🖍️', 'Whiteboard + markers', 'A3 size whiteboard, 4 markers & duster.', 250, 'good', 'admin', 36 * H],
    ['arjun', 'sports', '🏏', 'Cricket bat (Kashmir willow)', 'Knocked in, good for tennis-ball cricket.', 700, 'fair', 'sports', 3 * DAY],
  ];
  const L = {};
  live.forEach(([who, cat, em, title, desc, price, cond, meet, age], i) => {
    const l = { id: uid('l'), sellerId: U[who].id, title, desc, category: cat, condition: cond, price, photos: [itemArt(cat, em, title.split(' ')[0].replace(':', ''), i), itemArt(cat, em, CATEGORIES.find((c) => c.id === cat).en.split(' ')[0], i + 1)], meetPoint: meet, status: 'active', createdAt: now - age, views: rnd(3, 60), priceHistory: [{ price, at: now - age }] };
    db.listings.push(l); L[i] = l;
  });
  L[8].priceReview = true; // headphones — reported as possibly fake

  // ---------------------------------------------------------------- live tasks
  const nextHours = (h) => now + h * H;
  const tasks = [
    { who: 'kavya', kind: 'pickdrop', title: 'Collect my Amazon parcel from Main Gate', desc: 'Small box under my name at the security desk. Bring to Library entrance.', reward: 25, pickup: 'gate', drop: 'library', size: 'small', deadline: nextHours(4) },
    { who: 'priya', kind: 'task', title: 'Print & spiral-bind project report (60 pages)', desc: 'PDF will be shared in chat. Get 2 copies spiral bound at the Xerox shop and drop at Hostel lobby desk.', reward: 40, location: 'xerox', deadline: nextHours(6) },
    { who: 'lakshmi', kind: 'task', title: 'Carry lab manuals from Library to Physics lab', desc: '12 lab manuals (light). Need a helper between classes.', reward: 30, location: 'library', deadline: nextHours(26) },
    { who: 'karthik', kind: 'pickdrop', title: 'Bring lunch parcel from canteen to Mech workshop', desc: 'Pre-paid order under “Karthik”. Workshop shift till 2 PM.', reward: 20, pickup: 'canteen', drop: 'admin', size: 'small', deadline: nextHours(3), urgent: true },
    { who: 'vignesh', kind: 'task', title: 'Submit signed bonafide form at Admin Block', desc: 'Signed form is with me at ECE block. Collect and submit at counter 3.', reward: 20, location: 'admin', deadline: nextHours(28) },
    { who: 'fathima', kind: 'pickdrop', title: 'Return library books (3) for me', desc: 'Books at Girls Hostel lobby desk, return at Central Library counter before 5 PM.', reward: 25, pickup: 'hosgate', drop: 'library', size: 'medium', deadline: nextHours(30) },
    { who: 'nandhini', kind: 'group', title: 'Canteen run at 1 PM — bringing to Hostel lobby', desc: 'Going to Main Canteen at 1 PM. I can carry up to 5 orders. ₹10 carry charge per order + item cost.', reward: 10, capacity: 5, location: 'canteen', drop: 'hosgate', deadline: nextHours(5) },
  ];
  const T = {};
  tasks.forEach((t, i) => {
    const fee = t.kind === 'group' ? 0 : Math.min(10, Math.max(1, Math.round(t.reward * 0.02)));
    const total = t.kind === 'group' ? 0 : t.reward + fee;
    const poster = U[t.who];
    const rec = { id: uid('k'), posterId: poster.id, offers: [], status: 'open', assignMode: 'choose', photos: [], createdAt: now - rnd(1, 20) * H, urgent: !!t.urgent, fee, total, escrow: total, ...t };
    delete rec.who;
    if (total) { poster.wallet.balance -= total; poster.wallet.escrow += total; db.ledger.push({ id: uid('l'), userId: poster.id, type: 'hold', amount: -total, note: `Reward locked for task “${t.title}”`, at: rec.createdAt }); }
    db.tasks.push(rec); T[i] = rec;
  });
  T[1].offers.push({ helperId: U.arjun.id, note: 'I pass by the Xerox shop at 3, can do it.', eta: '3 PM', at: now - 2 * H }, { helperId: U.divya.id, note: 'Doing my own print run anyway 🙂', eta: '1 hr', at: now - 1.5 * H }, { helperId: U.rahul.id, note: 'Happy to help, new here!', eta: '45 min', at: now - H });
  T[2].offers.push({ helperId: U.irfan.id, note: 'Free after 11 AM.', at: now - 3 * H });

  // ---------------------------------------------------------------- live deals for the demo
  function liveDeal({ type, ref, title, payer, payee, amount, status, meet, offeredBy, note, fromTask, minsAgo = 60 }) {
    const fee = amount > 0 ? Math.min(10, Math.max(1, Math.round(amount * 0.02))) : 0;
    const at = now - minsAgo * 60000;
    const t = { id: uid('t'), key: '', members: [payer.id, payee.id], refType: 'deal', refId: null, title, createdAt: at, lastAt: at, reads: {} };
    const deal = { id: uid('d'), type, refId: ref, title, payerId: payer.id, payeeId: payee.id, amount, fee, total: amount + fee, feeWaived: false, status: 'offered', offeredBy, note: note || '', meetPoint: meet, when: null, createdAt: at, timeline: [{ s: 'offered', at, by: offeredBy, note }], otp: encrypt(String(rnd(1000, 9999))), otpTries: 0, pending: null, proof: null, tracking: null, escrow: amount + fee, reviewed: {}, fromTask: !!fromTask, threadId: t.id };
    t.refId = deal.id; t.key = [payer.id, payee.id].sort().join(':') + '|deal|' + deal.id;
    if (!fromTask) { payer.wallet.balance -= deal.total; payer.wallet.escrow += deal.total; db.ledger.push({ id: uid('l'), userId: payer.id, type: 'hold', amount: -deal.total, note: `Escrow for “${title}”`, dealId: deal.id, at }); }
    else { payer.wallet.escrow += 0; }
    const add = (s, by, mins, n) => deal.timeline.push({ s, at: at + mins * 60000, by, note: n });
    if (['accepted', 'in_progress', 'delivered', 'disputed'].includes(status)) { add('accepted', offeredBy === payer.id ? payee.id : payer.id, 6, 'Both sides accepted the terms'); deal.acceptedAt = at + 6 * 60000; deal.respondedBy = offeredBy === payer.id ? payee.id : payer.id; deal.respondedAt = deal.acceptedAt; }
    if (['in_progress', 'delivered'].includes(status)) { add('in_progress', payee.id, 20, 'Started'); deal.startedAt = at + 20 * 60000; }
    if (status === 'disputed') { add('delivered', payee.id, 40, 'Marked as handed over'); deal.deliveredAt = at + 40 * 60000; }
    deal.status = status;
    db.threads.push(t); db.deals.push(deal);
    return deal;
  }
  // 1) Kavya ↔ Priya: calculator, accepted — ready for OTP handover demo
  const d1 = liveDeal({ type: 'buy', ref: L[0].id, title: L[0].title, payer: U.kavya, payee: U.priya, amount: 600, status: 'accepted', meet: 'library', offeredBy: U.kavya.id, note: 'Can we meet at the Library at 4?', minsAgo: 90 });
  L[0].status = 'reserved';
  // 2) Rahul → Priya: offer on DS book (Priya can accept/decline)
  liveDeal({ type: 'buy', ref: L[1].id, title: L[1].title, payer: U.rahul, payee: U.priya, amount: 250, status: 'offered', meet: 'library', offeredBy: U.rahul.id, note: 'Would you take ₹250? First-year here 🙏', minsAgo: 25 });
  // 3) Arjun helping Kavya: parcel pick-drop in progress with live tracking
  const t0 = T[0]; t0.offers.push({ helperId: U.arjun.id, note: 'Heading to the gate now.', at: now - 40 * 60000 }); t0.status = 'assigned'; t0.assignedAt = now - 35 * 60000;
  const d3 = liveDeal({ type: 'pickdrop', ref: t0.id, title: t0.title, payer: U.kavya, payee: U.arjun, amount: t0.reward, status: 'in_progress', meet: 'gate', offeredBy: U.arjun.id, fromTask: true, minsAgo: 40 });
  d3.fee = t0.fee; d3.total = t0.total; d3.escrow = t0.escrow; t0.escrow = 0; t0.dealId = d3.id;
  d3.tracking = { stage: 'picked_up', at: now - 8 * 60000, mapX: 500, mapY: 600, history: [{ stage: 'started', at: now - 20 * 60000 }, { stage: 'picked_up', at: now - 8 * 60000 }] };
  // 4) Dispute: Vignesh bought Fathima's ... (seller says delivered, buyer says not)
  const dl = { id: uid('l'), sellerId: U.fathima.id, title: 'Scientific calculator (Casio fx-100MS)', desc: 'Works fine.', category: 'calculators', condition: 'fair', price: 400, photos: [itemArt('calculators', '🧮', 'Casio', 3)], meetPoint: 'admin', status: 'reserved', createdAt: now - 3 * DAY, views: 12, priceHistory: [{ price: 400, at: now - 3 * DAY }] };
  db.listings.push(dl);
  const d4 = liveDeal({ type: 'buy', ref: dl.id, title: dl.title, payer: U.vignesh, payee: U.fathima, amount: 400, status: 'disputed', meet: 'admin', offeredBy: U.vignesh.id, minsAgo: 26 * 60 });
  const rep = { id: uid('r'), kind: 'dispute', reporterId: U.vignesh.id, targetType: 'deal', targetId: d4.id, targetUserId: U.fathima.id, reason: 'Item not as described', details: 'The display has missing segments — the listing said it works fine. Seller marked delivered but I want a refund.', dealId: d4.id, status: 'open', createdAt: now - 20 * H, dueAt: now + 4 * H, decision: null };
  db.reports.push(rep); d4.disputeId = rep.id; d4.prevStatus = 'delivered';
  d4.timeline.push({ s: 'disputed', at: now - 20 * H, by: U.vignesh.id, note: 'Dispute: Item not as described. Money frozen until an admin decides (within 24h).' });

  // messages
  const msg = (t, from, text, minsAgo, extra = {}) => { db.messages.push({ id: uid('m'), threadId: t, from: from?.id || null, system: !from, text, at: now - minsAgo * 60000, ...extra }); };
  msg(d1.threadId, null, 'Offer of ₹600 sent. Money is held in escrow until the deal completes or is declined.', 90);
  msg(d1.threadId, U.kavya, 'Hi Priya! Is the calculator still in good shape? Need it for M2 😅', 89);
  msg(d1.threadId, U.priya, 'Yes! All functions work, battery replaced last month. ₹600 is fine.', 86);
  msg(d1.threadId, null, 'Priya Sundaram accepted. Meet at Central Library. The receiver will share a 4-digit OTP at handover.', 84);
  msg(d1.threadId, U.kavya, 'Great, Library entrance at 4 PM?', 80);
  msg(d1.threadId, U.priya, 'Done 👍 See you there.', 78);
  msg(d3.threadId, null, 'Deal accepted by both sides. ₹26 is safe in escrow.', 35);
  msg(d3.threadId, U.arjun, 'Picked up your parcel from the gate, heading to Library now 🏃', 8);
  const rahulDeal = db.deals.find((x) => x.payerId === U.rahul.id);
  msg(rahulDeal.threadId, U.rahul, 'Would you take ₹250? First-year here 🙏', 25);
  msg(d4.threadId, U.vignesh, 'The display is missing segments, this is not what was listed.', 21 * 60);
  msg(d4.threadId, U.fathima, 'It was working when I handed it over!', 20.5 * 60);
  msg(d4.threadId, null, 'Vignesh Murugan raised a dispute: “Item not as described”. Escrow is frozen.', 20 * 60);
  for (const t of db.threads) t.lastAt = Math.max(...db.messages.filter((m) => m.threadId === t.id).map((m) => m.at), t.createdAt);
  db.threads.forEach((t) => { t.reads[t.members[0]] = now - 30 * 60000; });

  // ---------------------------------------------------------------- moderation queue
  const msgId = uid('m');
  const enquiry = { id: uid('t'), key: [U.karthik.id, U.kavya.id].sort().join(':') + '|listing|' + L[6].id, members: [U.kavya.id, U.karthik.id], refType: 'listing', refId: L[6].id, title: L[6].title, createdAt: now - 5 * H, lastAt: now - 4 * H, reads: {} };
  db.threads.push(enquiry);
  db.messages.push({ id: uid('m'), threadId: enquiry.id, from: U.kavya.id, text: 'Is the cycle still available?', at: now - 5 * H });
  db.messages.push({ id: msgId, threadId: enquiry.id, from: U.karthik.id, text: 'Yes. Pay ••••• directly and skip the app fee, I\'ll give ₹200 off', at: now - 4 * H, masked: true });
  db.reports.push({ id: uid('r'), kind: 'report', reporterId: U.kavya.id, targetType: 'message', targetId: msgId, targetUserId: U.karthik.id, reason: 'Asked to pay outside the app', details: 'Seller asked me to pay on UPI directly to avoid the app.', status: 'open', createdAt: now - 3.5 * H, dueAt: now + 20.5 * H, decision: null });
  db.reports.push({ id: uid('r'), kind: 'report', reporterId: U.irfan.id, targetType: 'listing', targetId: L[8].id, targetUserId: U.harish.id, reason: 'Possibly fake / counterfeit', details: 'Same photos appear on a reseller page; price too low for originals.', status: 'open', createdAt: now - 1 * H, dueAt: now + 23 * H, decision: null });
  db.flags.push({ id: uid('f'), userId: U.karthik.id, kind: 'offplatform', detail: 'Shared payment/contact details in chat: “pay on my UPI directly and skip the app fee”', at: now - 4 * H, status: 'open', count: 2 });
  db.flags.push({ id: uid('f'), userId: U.harish.id, kind: 'price', detail: 'Price of “JBL Tune 510BT headphones” changed 4 times in 24h', at: now - 6 * H, status: 'open', count: 1 });
  db.flags.push({ id: uid('f'), userId: U.harish.id, kind: 'cancellations', detail: '3 cancellations in the last 7 days', at: now - 30 * H, status: 'open', count: 1 });
  U.karthik.strikes.push({ reason: 'No-show at agreed meeting point (Sept)', by: U.admin.id, at: now - 25 * DAY });
  // resolved report history (for SLA metric)
  for (let i = 0; i < 6; i++) {
    const at = now - rnd(3, 40) * DAY;
    db.reports.push({ id: uid('r'), kind: i % 3 ? 'report' : 'dispute', reporterId: U.kavya.id, targetType: 'user', targetId: U.harish.id, targetUserId: U.harish.id, reason: pick(['No-show', 'Rude behaviour', 'Item not as described']), details: '', status: 'resolved', createdAt: at, dueAt: at + DAY, decision: { action: pick(['dismiss', 'strike', 'refund']), reason: 'Reviewed chat records and timeline; decision explained to both parties.', by: U.admin.id, at: at + rnd(2, 20) * H } });
  }
  db.audit.push({ id: uid('a'), by: U.admin.id, action: 'strike:warning', target: U.karthik.id, reason: 'No-show at agreed meeting point (Sept)', at: now - 25 * DAY });

  // ---------------------------------------------------------------- community
  db.announcements.push({ id: uid('n'), title: 'Exam week: Library meeting point open till 10 PM', body: 'Handover desks at the Central Library entrance are staffed and CCTV-covered till 10 PM during exam week.', kind: 'info', pinned: true, at: now - 10 * H, by: U.admin.id });
  db.announcements.push({ id: uid('n'), title: 'Never pay outside the app', body: 'Escrow only protects you when you pay inside CampusLoop. Report anyone who asks for direct UPI.', kind: 'alert', pinned: false, at: now - 3 * DAY, by: U.admin.id });
  db.lostfound.push({ id: uid('x'), userId: U.kavya.id, kind: 'lost', title: 'Blue steel water bottle (Milton)', desc: 'Name sticker “KR” on the cap. Lost near Library reading hall.', location: 'library', photo: itemArt('other', '🧴', 'Bottle', 1), at: now - 6 * H, status: 'open', when: 'Today morning' });
  db.lostfound.push({ id: uid('x'), userId: U.irfan.id, kind: 'found', title: 'ID card holder with lanyard', desc: 'Red lanyard, found on a canteen table. Handed to canteen counter — describe it to claim.', location: 'canteen', photo: itemArt('other', '🪪', 'ID card', 2), at: now - 3 * H, status: 'open', when: 'Lunch time' });
  db.lostfound.push({ id: uid('x'), userId: U.sneha.id, kind: 'found', title: 'Black umbrella', desc: 'Left at CSE block seminar hall.', location: 'cse', photo: null, at: now - 30 * H, status: 'open', when: 'Yesterday' });

  // notifications
  const n = (u, type, title, body, link, minsAgo, read = false) => db.notifications.push({ id: uid('n'), userId: u.id, type, title, body, link, at: now - minsAgo * 60000, read });
  n(U.priya, 'offer', 'New offer received', 'Rahul Dev offered ₹250 for “Data Structures textbook + solved notes”.', `#/deal/${rahulDeal.id}`, 25);
  n(U.priya, 'deal', 'Deal accepted ✓', 'Meet Kavya at Central Library for the calculator handover.', `#/deal/${d1.id}`, 84, true);
  n(U.kavya, 'track', 'Live update', 'Arjun Kumar: picked up', `#/deal/${d3.id}`, 8);
  n(U.sneha, 'offer', 'New helper offer', '3 helpers offered for “Print & spiral-bind project report”.', `#/task/${T[1].id}`, 60);
  n(U.admin, 'admin', 'New dispute', 'Item not as described — review within 24h', '#/admin/reports', 20 * 60);

  return db;
}
