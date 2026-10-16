# ◯ Campora (CampusLoop)

> **A verified, trust-based campus marketplace, task board, and pick-and-drop network.**  
> Everything is clearly priced, mutually agreed upon, paid safely through escrow, and fairly rated.

---

## 🚀 Overview

**Campora** connects college students and faculty inside a trusted campus loop:
- **🛒 Campus Marketplace:** Buy & sell pre-owned items (books, calculators, cycles, electronics) directly within your campus.
- **🤝 Task Board:** Post quick tasks (notes formatting, printouts, lab prep) and let willing students help.
- **📦 Pick & Drop:** Request campus runners to deliver canteen orders, parcels, or forgotten items across campus buildings.
- **🔒 Secure Escrow & 4-Digit Delivery OTP:** Payments are locked when an order starts and only released after the receiver enters the 4-digit confirmation OTP.
- **⚖️ Fair-by-Design Feeds:** No paid boosting or artificial algorithms — equal visibility and opportunity for every campus member.
- **🛡️ Built-in Safety & Verification:** Verified campus email/ID, encrypted contact details, chat fraud detection, and an emergency SOS button.

---

## ⚡ Quick Start (Run in 30 Seconds)

**Prerequisites:** [Node.js](https://nodejs.org/) (version 18+).  
*Zero external runtime dependencies, no database configuration needed.*

1. **Clone the repository:**
   ```bash
   git clone https://github.com/Tharuniga60/Campora-001.git
   cd Campora-001
   ```

2. **Start the application:**
   ```bash
   npm start
   ```

3. **Open in your browser:**
   - **Desktop / Web:** [http://localhost:3000](http://localhost:3000)
   - **Mobile (same Wi-Fi):** The terminal will print a phone-accessible IP address (e.g., `http://192.168.x.x:3000`).

---

## 👥 Instant Demo Personas

When running in demo mode, you can log in with one click as any of the sample campus members to test different perspectives:

| Persona | Role | Key Features to Try |
|---|---|---|
| **Kavya** | Buyer (Day scholar) | Check active deals in *Activity*, see the **4-digit delivery OTP**, track runners live on the map. |
| **Priya** | Seller (Hosteller) | Accept buyer offers, enter the delivery OTP to get paid, pick task helpers via **Fair Pick**. |
| **Arjun** | Helper / Campus Runner | Browse open tasks, accept delivery jobs, update live status with photo proof. |
| **Rahul** | New Member | Experience the new-member feed boost; try searching or posting items. |
| **Dr. Meena** | Admin & Moderator | Resolve user disputes with recorded reasons, inspect flags, and view real-time safety metrics. |

---

## 🧪 Available Scripts

| Command | Action |
|---|---|
| `npm start` | Launches the server (auto-seeds demo campus data on initial run) |
| `npm run dev` | Runs the server in watch mode with automatic restart on file changes |
| `npm test` | Runs the end-to-end API, per-section and moderation test suites (48 tests) |
| `npm run reset` | Resets and re-seeds the sample campus database |

---

## 🏗️ Architecture & Tech Stack

- **Backend:** Node.js (Vanilla ES Modules, zero external packages, native HTTP & crypto)
- **Frontend:** Vanilla HTML5, modern CSS, and ES Modules PWA (lightweight, ~29 KB initial bundle, offline-ready)
- **Database:** Atomic JSON document store with **AES-256-GCM** encryption at rest for sensitive personal data
- **Realtime:** Server-Sent Events (SSE) for instant deal updates, live chat, and notifications
- **Mobile Support:** Progressive Web App (PWA) with Add to Home Screen support, plus Capacitor Android wrapper in `/mobile`

---

## 📁 Project Structure

```
campora/
├── server/                     # Node.js API + static file server (no dependencies)
│   ├── index.js                # Entry point: load/seed DB, migrate, listen, background jobs
│   ├── app.js                  # Builds the HTTP server and loads every route module
│   ├── config/
│   │   └── rules.js            # Business rules: fees, limits, campus map, categories, prohibited items
│   ├── core/                   # Infrastructure — knows nothing about campus features
│   │   ├── db.js               # JSON document store, atomic writes, encryption at rest
│   │   ├── http.js             # Router, rate limiting, body parsing, static files, security headers
│   │   ├── realtime.js         # Server-Sent Events streams
│   │   ├── util.js             # Errors, time units, coercion helpers, current settings
│   │   └── validate.js         # Shared input validation (photos, deadlines)
│   ├── services/               # Business logic shared by routes (no HTTP here)
│   │   ├── users.js            # Sessions, profiles, trust score, badges, strikes, limits
│   │   ├── wallet.js           # Ledger and escrow (hold / refund / release)
│   │   ├── deals.js            # Deal lifecycle, actions and views
│   │   ├── catalog.js          # Listing & task views, fair-rotation feed ranking
│   │   ├── chat.js             # Threads and system messages
│   │   ├── moderation.js       # Reports, credibility, vendor risk, actions, restrictions, appeals, migration
│   │   ├── notifications.js    # Notifications, audit log, auto-flags
│   │   ├── community.js        # Campus impact numbers
│   │   └── jobs.js             # Expiries, auto-release, suspension/restriction end
│   ├── routes/                 # One file per feature; each registers its /api/* endpoints
│   │   ├── auth.js  users.js  feed.js  listings.js  tasks.js  deals.js
│   │   ├── chat.js  notifications.js  safety.js  wallet.js  community.js
│   │   └── admin.js  admin-moderation.js
│   └── demo/
│       └── seed.js             # Demo campus: personas, listings, deals, reports
├── public/                     # PWA served as-is (no build step)
│   ├── index.html  manifest.webmanifest  sw.js
│   ├── css/app.css             # Design system
│   ├── js/
│   │   ├── app.js              # Shell: router, top bar, nav, realtime, SOS
│   │   ├── core.js             # Templating, API client, state, shared components
│   │   ├── i18n/               # index.js (t, setLang) + ta.js (Tamil strings)
│   │   └── views/              # One module per screen, lazy-loaded by the router
│   ├── fonts/  icons/
│   └── img/items/              # Demo listing photos + CREDITS.md
├── tests/
│   ├── helpers/server.js       # Boots a seeded server on a free port + API client
│   ├── api.test.js             # Escrow, mutual acceptance, OTP, fairness, fraud checks
│   ├── sections.test.js        # One test per application section
│   └── moderation.test.js      # Reporting, review, restrictions, appeals
├── mobile/                     # Capacitor Android wrapper (points at the running server)
├── docs/                       # Pitch and product notes
└── data/                       # Runtime database (git-ignored, created on first start)
```

**Where new code goes:** a new API endpoint → the matching file in `server/routes/`; logic used by more than one route → `server/services/`; a new limit or fee → `server/config/rules.js`; a new screen → `public/js/views/` plus a line in the `ROUTES` table in `public/js/app.js`. Dependencies point one way: `routes → services → core/config`.
