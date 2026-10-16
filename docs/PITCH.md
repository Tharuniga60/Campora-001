# CampusLoop — 2-minute pitch & judge Q&A

## The problem (20 s)
On every campus, a second-hand calculator sits unused in one hostel while a first-year hunts for one in another. Small jobs — printing, collecting a parcel, submitting a form — go undone while others have free time. WhatsApp groups bury requests, prices are unclear, nothing is recorded, and there is no way to trust a stranger.

## The solution (40 s)
CampusLoop is one verified app for three things: **buy & sell what campus already owns**, **get small tasks done**, and **request pick-ups & drops**.
- Only verified members (college email + college ID + phone OTP, one account each).
- Every deal shows the full price breakdown, and **nothing starts until both sides accept**.
- Money sits in **escrow** and moves only when the receiver confirms with a **4-digit delivery OTP**.
- Everyone is treated equally: **no paid boosting**, a fair-rotation feed, caps on urgent posts and on helper jobs, and a *Fair pick* that spreads earning chances.

## Live demo path (50 s)
1. **Kavya** (buyer) → Activity → calculator deal → OTP on screen; parcel being delivered live on the campus map.
2. **Priya** (seller) → accepts Rahul's offer (competing offers auto-refunded) → enters Kavya's OTP → paid, receipt.
3. **Priya's print task** → three helper offers in arrival order, *Fair pick* highlights the helper with fewest jobs.
4. **Rahul** tries to list "whisky" / post "write my lab record" → blocked with the exact rule. Types a UPI ID in chat → masked + flagged.
5. **Dr. Meena** (admin) → resolves the dispute with a written reason → success metrics from the problem statement, live.

## Why it wins (10 s)
Every bullet of the problem statement is implemented — all 15 mandatory sections and all 15 optional ones — in a ~29 KB, offline-capable, Tamil/English PWA that runs on any phone with `npm start` and zero dependencies.

---

## Likely judge questions
**Is the payment real?** The escrow ledger, holds, releases, refunds and fees are fully implemented; the UPI top-up is simulated. Production plugs a licensed payment aggregator (UPI intent + nodal/escrow account) into the same `/wallet` endpoints.

**How do you verify students?** Official email domain + college-ID format + phone OTP, with uniqueness enforced on hashed ID, email and phone. Production adds college SSO or a roster import from the admin office.

**What stops someone from just paying outside the app?** Phone numbers and UPI IDs are auto-masked in chat, the attempt is flagged to admins, users are warned that escrow only protects in-app payments, and repeat offenders climb the strike ladder.

**How is "equal prioritisation" measurable?** Feed cards show *why* they appear; the ranking formula is public in Rules; helpers have an active-job cap; Fair pick uses jobs-this-week; urgent posts are capped and ordered by deadline only.

**What if the seller never delivers?** The buyer never shares the OTP, raises a dispute (escrow frozen), and the admin must decide within the SLA with a written reason — visible to both sides.

**Data privacy?** Minimal fields, phone/email/emergency contact AES-256-GCM encrypted at rest, masked in UI, export-my-data and delete-account built in, consent logged — aligned with the DPDP Act 2023.

**Can it scale?** Stateless API + SSE; swap the JSON store for PostgreSQL (same document shapes) and run behind a load balancer. The client is static and cacheable on a CDN.
