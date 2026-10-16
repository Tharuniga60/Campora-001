// Input validation shared by several routes.
import { withinHours } from '../config/rules.js';
import { DAY, S, fail, now } from './util.js';

export function validPhotos(photos, { required = false, max = 4 } = {}) {
  const arr = Array.isArray(photos) ? photos.slice(0, max) : [];
  for (const p of arr) {
    if (typeof p !== 'string' || !/^data:image\/(png|jpeg|webp);base64,/.test(p)) fail(400, 'Photos must be PNG, JPEG or WebP images.');
    if (p.length > 600_000) fail(400, 'Each photo must be under ~450 KB. The app compresses photos automatically — please retry.');
  }
  if (required && !arr.length) fail(400, 'Please add at least one real photo — photo proof is required for every listing.');
  return arr;
}
export function validDeadline(deadline) {
  const s = S(), t = new Date(deadline).getTime();
  if (!t || t < now() + 10 * 60000) fail(400, 'Deadline must be at least 10 minutes from now.');
  if (t > now() + s.maxTaskDays * DAY) fail(400, `Deadline can be at most ${s.maxTaskDays} days away.`);
  if (!withinHours(t, s)) fail(400, `Tasks and deliveries are allowed only within campus hours (${s.campusOpen}–${s.campusClose} IST).`);
  return t;
}
