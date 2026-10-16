// Shared primitives: errors, time units, string/number coercion and current settings.
import { DEFAULT_SETTINGS } from '../config/rules.js';
import { db } from './db.js';

export const H = 3600e3, DAY = 24 * H;
export class HttpError extends Error { constructor(status, msg, extra) { super(msg); this.status = status; this.extra = extra; } }
export const fail = (status, msg, extra) => { throw new HttpError(status, msg, extra); };
export const S = () => ({ ...DEFAULT_SETTINGS, ...db.settings });
export const now = () => Date.now();
export const clampStr = (v, max) => String(v ?? '').trim().slice(0, max);
export const int = (v) => Math.round(Number(v) || 0);
