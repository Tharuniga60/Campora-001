// Demo seed: a living campus with history, so trust scores, analytics and feeds are meaningful from minute one.
import crypto from 'node:crypto';
import { emptyDb, replace, db, uid, encrypt } from '../core/db.js';
import { makeUser } from '../services/users.js';

const H = 3600e3, DAY = 24 * H;
const rnd = (a, b) => a + crypto.randomInt(b - a + 1);
const pick = (arr) => arr[crypto.randomInt(arr.length)];

// Demo listing photos: real, freely licensed images bundled in public/img/items (see CREDITS.md there).
const img = (...names) => names.map((n) => `/img/items/${n}.jpg`);

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
    ['books', ['physics-textbook'], 'Engineering Physics textbook', 0, 'good'], ['books', ['maths-textbook'], 'Discrete Maths (Rosen) 7th ed', 0, 'good'],
    ['calculators', ['casio-fx82ms'], 'Casio fx-82MS calculator', 350, 'fair'], ['labgear', ['lab-coat'], 'Lab coat — size L', 150, 'good'],
    ['stationery', ['set-squares'], 'Mini drafter + set squares', 260, 'good'], ['gadgets', ['earphones'], 'Wired earphones (boAt)', 220, 'good'],
    ['hostel', ['bucket'], 'Bucket & mug set', 90, 'fair'], ['sports', ['badminton-racket'], 'Badminton racket (Yonex)', 450, 'good'],
    ['books', ['textbooks-stack'], 'Signals & Systems textbook', 0, 'fair'], ['hostel', ['desk-lamp'], 'Study table lamp', 260, 'good'],
    ['cycles', ['roadster-cycle'], 'Hero Sprint cycle', 2100, 'fair'], ['gadgets', ['extension-board'], 'Extension board 4-socket', 180, 'good'],
    ['books', ['exam-papers'], 'GATE CSE previous papers', 0, 'good'], ['labgear', ['safety-goggles'], 'Safety goggles + gloves', 80, 'new'],
    ['stationery', ['drawing-kit'], 'Engineering drawing kit', 220, 'good'], ['calculators', ['casio-fx991ms'], 'Casio fx-991MS', 520, 'good'],
    ['hostel', ['pillow-bedsheet'], 'Pillow + bedsheet set', 0, 'good'], ['books', ['notebooks'], 'First-year notes bundle', 0, 'fair'],
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

  histItems.forEach(([cat, photos, title, price, cond], i) => {
    const seller = U[sellers[i % sellers.length]], buyer = U[buyers[i % buyers.length]];
    const at = now - rnd(3, 55) * DAY;
    const l = { id: uid('l'), sellerId: seller.id, title, desc: 'Sold via CampusLoop.', category: cat, condition: cond, price, photos: img(...photos), meetPoint: pick(['library', 'canteen', 'admin', 'hosgate']), status: 'sold', createdAt: at - 2 * DAY, views: rnd(5, 40), priceHistory: [{ price, at: at - 2 * DAY }] };
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
    ['priya', 'calculators', ['casio-fx991es', 'casio-fx991es-2'], 'Casio fx-991ES Plus calculator', 'Used for 2 semesters, all functions work. Cover included. Perfect for M1/M2 exams.', 650, 'good', 'library', 30 * H],
    ['priya', 'books', ['c-textbook', 'cs-books'], 'FREE: Data Structures textbook + solved notes', 'Clean copy, a few pencil marks. Comes with my handwritten solved problems for Unit 3–5. Free to a junior who needs it.', 0, 'good', 'library', 5 * H],
    ['sneha', 'gadgets', ['mech-keyboard'], 'Mechanical keyboard (blue switches)', 'Clicky and great for coding. Moving out after placements.', 1200, 'good', 'canteen', 2 * DAY],
    ['sneha', 'hostel', ['mattress', 'mattress-2'], 'Foldable mattress + pillow', 'Thick foam mattress, washed cover. Pick up from Girls Hostel lobby.', 600, 'fair', 'hosgate', 3 * DAY],
    ['fathima', 'stationery', ['drafting-board', 'drawing-kit-2'], 'Omega mini drafter', 'Smooth scale, no wobble. First-years need this for Engineering Graphics!', 350, 'new', 'admin', 9 * H],
    ['vignesh', 'gadgets', ['arduino-uno', 'arduino-kit'], 'Arduino Uno + sensor kit', 'Uno board, breadboard, 15 sensors, jumper wires. Great for mini projects.', 900, 'good', 'ece', 4 * DAY],
    ['karthik', 'cycles', ['mtb-cycle'], 'Btwin MTB cycle — 21 gears', 'Serviced last month, new tyres. Lock included.', 3800, 'good', 'park', 6 * DAY],
    ['lakshmi', 'labgear', ['lab-coats', 'lab-coat'], 'Lab coats (M & L) — set of 2', 'Barely used, washed and ironed.', 220, 'new', 'admin', 20 * H],
    ['harish', 'gadgets', ['jbl-headphones'], 'JBL Tune 510BT headphones', 'Bluetooth, 30 hr battery. Original box and bill.', 1350, 'good', 'canteen', 2 * H],
    ['divya', 'books', ['spiral-notes'], 'FREE: Python programming + C notes (printed)', 'Spiral-bound printed notes, 180 pages. Passing them on for free.', 0, 'good', 'xerox', 12 * H],
    ['rahul', 'sports', ['football'], 'Football (size 5) — Nivia', 'Good grip, slightly scuffed.', 300, 'fair', 'sports', 1 * H],
    ['irfan', 'hostel', ['kettle'], 'Electric kettle 1L', 'Works perfectly. Hostel-approved model.', 450, 'good', 'hosgate', 26 * H],
    ['fathima', 'books', ['question-banks'], 'FREE: Semester 1 & 2 question banks', 'Giving away for free — someone please use them!', 0, 'fair', 'library', 4 * H],
    ['sneha', 'hostel', ['money-plant', 'money-plant-2'], 'FREE: Desk plant + pot', 'Money plant in a ceramic pot. Needs a new home.', 0, 'good', 'hosgate', 7 * H],
    ['nandhini', 'stationery', ['whiteboard-markers', 'markers'], 'Whiteboard + markers', 'A3 size whiteboard, 4 markers & duster.', 250, 'good', 'admin', 36 * H],
    ['arjun', 'sports', ['cricket-bat'], 'Cricket bat (Kashmir willow)', 'Knocked in, good for tennis-ball cricket.', 700, 'fair', 'sports', 3 * DAY],
    ['priya', 'stationery', ['drawing-kit'], 'Engineering drawing kit (compass + set squares)', 'Complete kit for Engineering Graphics, nothing missing.', 240, 'good', 'library', 8 * H],
  ];
  const L = {};
  live.forEach(([who, cat, photos, title, desc, price, cond, meet, age], i) => {
    const l = { id: uid('l'), sellerId: U[who].id, title, desc, category: cat, condition: cond, price, photos: img(...photos), meetPoint: meet, status: 'active', createdAt: now - age, views: rnd(3, 60), priceHistory: [{ price, at: now - age }] };
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
  // 2) Rahul → Priya: request for the free DS book (Priya can accept/decline)
  liveDeal({ type: 'buy', ref: L[1].id, title: L[1].title, payer: U.rahul, payee: U.priya, amount: 0, status: 'offered', meet: 'library', offeredBy: U.rahul.id, note: 'Could I have this? First-year here 🙏', minsAgo: 25 });
  // 3) Arjun helping Kavya: parcel pick-drop in progress with live tracking
  const t0 = T[0]; t0.offers.push({ helperId: U.arjun.id, note: 'Heading to the gate now.', at: now - 40 * 60000 }); t0.status = 'assigned'; t0.assignedAt = now - 35 * 60000;
  const d3 = liveDeal({ type: 'pickdrop', ref: t0.id, title: t0.title, payer: U.kavya, payee: U.arjun, amount: t0.reward, status: 'in_progress', meet: 'gate', offeredBy: U.arjun.id, fromTask: true, minsAgo: 40 });
  d3.fee = t0.fee; d3.total = t0.total; d3.escrow = t0.escrow; t0.escrow = 0; t0.dealId = d3.id;
  d3.tracking = { stage: 'picked_up', at: now - 8 * 60000, mapX: 500, mapY: 600, history: [{ stage: 'started', at: now - 20 * 60000 }, { stage: 'picked_up', at: now - 8 * 60000 }] };
  // 4) Dispute: Vignesh bought Fathima's ... (seller says delivered, buyer says not)
  const dl = { id: uid('l'), sellerId: U.fathima.id, title: 'Scientific calculator (Casio fx-100MS)', desc: 'Works fine.', category: 'calculators', condition: 'fair', price: 400, photos: img('casio-fx100ms'), meetPoint: 'admin', status: 'reserved', createdAt: now - 3 * DAY, views: 12, priceHistory: [{ price: 400, at: now - 3 * DAY }] };
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
  msg(rahulDeal.threadId, U.rahul, 'Could I have this? First-year here 🙏', 25);
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
  // two more independent complaints about the same headphones → vendor crosses the review threshold (investigation, not a penalty)
  const sig = { interacted: false, newAccount: false, massReporting: false, lowAccuracy: false, coordinated: false, credible: true };
  db.reports.push({ id: uid('r'), kind: 'report', reporterId: U.sneha.id, targetType: 'listing', targetId: L[8].id, targetUserId: U.harish.id, vendorId: U.harish.id, productId: L[8].id, category: 'fake_details', reason: 'Fake or misleading product details', details: 'Box in the photo is a different model from the one described; serial sticker missing.', status: 'open', createdAt: now - 50 * 60000, dueAt: now + 23 * H, decision: null, notes: [], signals: sig });
  db.reports.push({ id: uid('r'), kind: 'report', reporterId: U.divya.id, targetType: 'user', targetId: U.harish.id, targetUserId: U.harish.id, vendorId: U.harish.id, productId: null, category: 'pricing', reason: 'Suspicious or misleading pricing', details: 'Listed at ₹1350 but asked me for ₹1600 in chat after I offered.', status: 'open', createdAt: now - 20 * 60000, dueAt: now + 23.5 * H, decision: null, notes: [], signals: { ...sig, interacted: true } });
  db.flags.push({ id: uid('f'), userId: U.harish.id, kind: 'reports_threshold', detail: '3 independent credible reports in 30 days (threshold 3). Investigate before acting — reports alone do not prove a violation.', at: now - 20 * 60000, status: 'open', count: 1 });
  db.flags.push({ id: uid('f'), userId: U.karthik.id, kind: 'offplatform', detail: 'Shared payment/contact details in chat: “pay on my UPI directly and skip the app fee”', at: now - 4 * H, status: 'open', count: 2 });
  db.flags.push({ id: uid('f'), userId: U.harish.id, kind: 'price', detail: 'Price of “JBL Tune 510BT headphones” changed 4 times in 24h', at: now - 6 * H, status: 'open', count: 1 });
  db.flags.push({ id: uid('f'), userId: U.harish.id, kind: 'cancellations', detail: '3 cancellations in the last 7 days', at: now - 30 * H, status: 'open', count: 1 });
  const kStrike = { id: uid('sk'), reason: 'No-show at agreed meeting point (Sept)', by: U.admin.id, at: now - 25 * DAY };
  U.karthik.strikes.push(kStrike);
  db.modlog.push({ id: uid('ma'), userId: U.karthik.id, by: U.admin.id, action: 'strike', reason: kStrike.reason, reportId: null, at: kStrike.at, meta: { strikeId: kStrike.id, level: 'warning' }, rescinded: null, correction: null });
  // resolved report history (for SLA metric)
  // fixed outcomes (not random) so Kavya stays a credible reporter — a mostly-dismissed history would mark her reports unreliable
  for (const [kind, action] of [['dispute', 'refund'], ['report', 'strike'], ['report', 'warn'], ['dispute', 'release'], ['report', 'dismiss'], ['report', 'strike']]) {
    const at = now - rnd(3, 40) * DAY;
    db.reports.push({ id: uid('r'), kind, reporterId: U.kavya.id, targetType: 'user', targetId: U.harish.id, targetUserId: U.harish.id, reason: pick(['No-show', 'Rude behaviour', 'Item not as described']), details: '', status: action === 'dismiss' ? 'dismissed' : 'resolved', createdAt: at, dueAt: at + DAY, decision: { action, reason: 'Reviewed chat records and timeline; decision explained to both parties.', by: U.admin.id, at: at + rnd(2, 20) * H } });
  }
  db.audit.push({ id: uid('a'), by: U.admin.id, action: 'strike:warning', target: U.karthik.id, reason: 'No-show at agreed meeting point (Sept)', at: now - 25 * DAY });

  // ---------------------------------------------------------------- community
  db.announcements.push({ id: uid('n'), title: 'Exam week: Library meeting point open till 10 PM', body: 'Handover desks at the Central Library entrance are staffed and CCTV-covered till 10 PM during exam week.', kind: 'info', pinned: true, at: now - 10 * H, by: U.admin.id });
  db.announcements.push({ id: uid('n'), title: 'Never pay outside the app', body: 'Escrow only protects you when you pay inside CampusLoop. Report anyone who asks for direct UPI.', kind: 'alert', pinned: false, at: now - 3 * DAY, by: U.admin.id });
  // lost & found desk: finders hand items in, the admin publishes them and checks every claim
  db.lostfound.push({ id: uid('x'), userId: U.irfan.id, kind: 'found', title: 'Blue steel water bottle (Milton)', desc: 'Found in the Library reading hall.', secret: 'Name sticker “KR” under the cap', location: 'library', photo: img('water-bottle')[0], showPhoto: true, at: now - 6 * H, when: 'Today morning', status: 'held', receivedBy: U.admin.id, receivedAt: now - 5.5 * H, publishedAt: now - 5.5 * H,
    claims: [{ id: uid('lc'), userId: U.kavya.id, proof: 'It is mine — lost it in the Library reading hall this morning. It has a small name sticker with my initials KR on the cap.', at: now - 2 * H, status: 'pending' }] });
  db.lostfound.push({ id: uid('x'), userId: U.sneha.id, kind: 'found', title: 'ID card holder with lanyard', desc: 'Red lanyard, found on a canteen table.', secret: 'Library card inside; lanyard has a college fest logo', location: 'canteen', photo: img('id-lanyard')[0], showPhoto: false, at: now - 26 * H, when: 'Lunch time', status: 'held', receivedBy: U.admin.id, receivedAt: now - 25 * H, publishedAt: now - 25 * H, claims: [] });
  db.lostfound.push({ id: uid('x'), userId: U.sneha.id, kind: 'found', title: 'Black umbrella', desc: 'Left at CSE block seminar hall.', secret: 'Wooden handle with a small crack', location: 'cse', photo: null, at: now - 40 * 60000, when: 'Today, after class', status: 'pending', claims: [] });

  // notifications
  const n = (u, type, title, body, link, minsAgo, read = false) => db.notifications.push({ id: uid('n'), userId: u.id, type, title, body, link, at: now - minsAgo * 60000, read });
  n(U.priya, 'offer', 'Request for your free item', 'Rahul Dev requested “FREE: Data Structures textbook + solved notes”.', `#/deal/${rahulDeal.id}`, 25);
  n(U.priya, 'deal', 'Deal accepted ✓', 'Meet Kavya at Central Library for the calculator handover.', `#/deal/${d1.id}`, 84, true);
  n(U.kavya, 'track', 'Live update', 'Arjun Kumar: picked up', `#/deal/${d3.id}`, 8);
  n(U.sneha, 'offer', 'New helper offer', '3 helpers offered for “Print & spiral-bind project report”.', `#/task/${T[1].id}`, 60);
  n(U.admin, 'admin', 'New dispute', 'Item not as described — review within 24h', '#/admin/reports', 20 * 60);
  n(U.admin, 'admin', 'Found item reported', 'Sneha Iyer is handing in “Black umbrella”. Confirm once it reaches the desk.', '#/admin/lostfound', 40);
  n(U.admin, 'admin', 'New claim on a found item', 'Kavya Ramesh says “Blue steel water bottle (Milton)” is theirs. Check their proof before releasing it.', '#/admin/lostfound', 120);

  return db;
}
