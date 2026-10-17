#!/usr/bin/env node
// Entry point. Demo mode (default): seeds a sample campus on first run. Real deployment (DEMO=0 in .env):
// validates configuration, starts from an empty database and never seeds or resets real data.
import { ADMIN_PHONES, PRODUCTION, configProblems, configWarnings } from './config/env.js'; // first: loads .env
import fs from 'node:fs';
import os from 'node:os';
import { load, flush, db, hmac, DB_FILE } from './core/db.js';
import { DEMO } from './config/rules.js';
import { createServer } from './app.js';
import { runJobs } from './services/jobs.js';
import { migrate } from './services/moderation.js';
import { migrateFreeOnly } from './services/catalog.js';
import { migrateLostFound } from './services/community.js';
import { seed } from './demo/seed.js';

const PORT = Number(process.env.PORT || 3000);
const reset = process.argv.includes('--reset');
const stop = (lines) => { console.error(`\n  ✖ CampusLoop cannot start:\n${lines.map((l) => `    • ${l}`).join('\n')}\n\n  See .env.example and the "Real deployment" section of the README.\n`); process.exit(1); };

const problems = configProblems();
if (problems.length) stop(problems);

if (PRODUCTION) {
  if (reset) stop(['--reset (npm run reset) wipes the database and is only allowed in demo mode (DEMO=1).']);
  const existed = fs.existsSync(DB_FILE);
  if (!load()) {
    if (existed) stop([`${DB_FILE} exists but could not be read. Restore it from a backup — it was left untouched.`]);
    flush();
    console.log(`  ✓ New campus database → ${DB_FILE}`);
  }
  if (db.users.some((u) => u.demo)) stop([`${DB_FILE} contains demo data. Point DB_FILE to a new file for the real deployment.`]);
  // admins are exactly the phones in ADMIN_PHONES (add or remove a number and restart)
  const adminHashes = new Set(ADMIN_PHONES.map((p) => hmac(p)));
  for (const u of db.users) {
    const should = adminHashes.has(u.phoneHash);
    if (!!u.isAdmin !== should) { u.isAdmin = should; if (should) u.role = 'staff'; console.log(`  ${should ? '+' : '−'} admin: ${u.name}`); }
  }
} else if (reset || !load()) {
  seed();
  flush();
  console.log(`🌱 Seeded demo campus → ${DB_FILE}`);
}
migrate();
migrateFreeOnly();
migrateLostFound();
if (process.argv.includes('--seed-only')) { flush(); process.exit(0); }

const server = createServer();
server.listen(PORT, '0.0.0.0', () => {
  const port = server.address().port; // PORT=0 picks a free port (used by the test suite)
  const lan = Object.values(os.networkInterfaces()).flat().filter((i) => i && i.family === 'IPv4' && !i.internal).map((i) => i.address);
  console.log(`\n  ◯ CampusLoop is running${DEMO ? ' (demo mode: OTPs shown on screen)' : ` for ${process.env.CAMPUS_NAME}`}\n`);
  for (const w of configWarnings()) console.log(`  ⚠ ${w}`);
  if (PRODUCTION && !db.users.some((u) => u.isAdmin)) console.log(`  ⓘ No admin yet: sign up with one of the ADMIN_PHONES numbers to get the admin panel.`);
  console.log(`  Local:   http://localhost:${port}`);
  for (const ip of lan) console.log(`  Phone:   http://${ip}:${port}   ← open on a phone on the same Wi-Fi`);
  console.log('');
});
setInterval(runJobs, 30_000).unref();
runJobs();

const shutdown = () => { flush(); process.exit(0); };
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
