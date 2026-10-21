// API load test (Spec §8): N requests with at most C in flight, timed on the client.

import { needsToken } from '../lib/api.js';
import { summarize, histogram } from '../lib/stats.js';

export const ENDPOINTS = ['/api/ping', '/api/ping?db=1', '/api/debts?page=1', '/api/summary', '/api/slow?ms=200', '/api/limited'];
export const MAX_REQS = 1000;
export const MAX_CONC = 50;

const whole = (n) => (Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1);

/** Caps the inputs at the Spec §12 limits; errors carry the inline field messages. */
export function clampInputs(reqs, conc) {
  const errors = {};
  let r = whole(reqs);
  let c = whole(conc);
  if (r > MAX_REQS) {
    r = MAX_REQS;
    errors.reqs = 'สูงสุด 1,000';
  }
  if (c > MAX_CONC) {
    c = MAX_CONC;
    errors.conc = 'สูงสุด 50';
  }
  return { reqs: r, conc: c, errors };
}

/** `app;dur=12.3` from a Server-Timing header, or null. */
export function serverTimingMs(header) {
  const m = /(?:^|,)\s*app\s*;[^,]*?\bdur=([\d.]+)/.exec(header ?? '');
  return m ? Number(m[1]) : null;
}

/**
 * Resolves with summarize() stats plus `histogram` (for `bins` bars) and the raw `latencies`,
 * so the caller can re-bucket when the bar count changes. Status 0 = network error.
 */
export async function runLoad({ path, reqs, conc, token = '', onProgress = () => {}, bins = 10, fetchImpl = (...a) => globalThis.fetch(...a) }) {
  // The token goes only to guarded endpoints (Spec §12), e.g. /api/slow, never to /api/ping.
  const headers = token && needsToken('GET', path) ? { 'X-Test-Token': token } : {};
  const samples = [];
  let started = 0;

  async function one() {
    const t0 = performance.now();
    try {
      const res = await fetchImpl(path, { headers, cache: 'no-store', credentials: 'same-origin' });
      await res.arrayBuffer();
      return { ms: performance.now() - t0, status: res.status, serverMs: serverTimingMs(res.headers.get('server-timing')) };
    } catch {
      return { ms: performance.now() - t0, status: 0, serverMs: null };
    }
  }

  async function worker() {
    while (started < reqs) {
      started++;
      samples.push(await one());
      onProgress(samples.length, reqs);
    }
  }

  const t0 = performance.now();
  await Promise.all(Array.from({ length: Math.min(conc, reqs) }, worker));
  const wallMs = performance.now() - t0;
  const latencies = samples.map((s) => s.ms);
  return { ...summarize(samples, wallMs), histogram: histogram(latencies, bins), latencies };
}
