#!/usr/bin/env node
// Entry point: `npm start` → seeds a demo campus on first run, serves the PWA + API on one port.
import os from 'node:os';
import { load, flush, DB_FILE } from './db.js';
import { createServer, runJobs, DEMO } from './app.js';
import { seed } from './seed.js';

const PORT = Number(process.env.PORT || 3000);
const reset = process.argv.includes('--reset');

if (reset || !load()) {
  seed();
  flush();
  console.log(`🌱 Seeded demo campus → ${DB_FILE}`);
}
if (process.argv.includes('--seed-only')) process.exit(0);

const server = createServer();
server.listen(PORT, '0.0.0.0', () => {
  const lan = Object.values(os.networkInterfaces()).flat().filter((i) => i && i.family === 'IPv4' && !i.internal).map((i) => i.address);
  console.log(`\n  ◯ CampusLoop is running${DEMO ? ' (demo mode: OTPs shown on screen)' : ''}\n`);
  console.log(`  Local:   http://localhost:${PORT}`);
  for (const ip of lan) console.log(`  Phone:   http://${ip}:${PORT}   ← open on a phone on the same Wi-Fi`);
  console.log('');
});
setInterval(runJobs, 30_000).unref();
runJobs();

const shutdown = () => { flush(); process.exit(0); };
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
