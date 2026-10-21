// Bandwidth tests (Spec §6). Times are measured on the client: request start → first chunk (TTFB) → last byte.

import { ApiError, needsToken } from '../lib/api.js';
import { mbps, median } from '../lib/stats.js';

export const ROUNDS = 3;
const MB = 1048576;
const RANDOM_CHUNK = 65536; // crypto.getRandomValues rejects larger arrays

function httpError(status) {
  const kind = status === 403 ? 'forbidden' : status === 413 ? 'too_large' : status >= 500 ? 'server' : 'bad_request';
  return new ApiError(kind, status, `HTTP ${status}`);
}

async function send(url, init) {
  try {
    return await fetch(url, { cache: 'no-store', credentials: 'same-origin', ...init });
  } catch (cause) {
    throw new ApiError('network', 0, 'network_error', { cause });
  }
}

const tokenHeaders = (token, method, url) => (token && needsToken(method, url) ? { 'X-Test-Token': token } : {});

// One streamed download; onFraction(0..1) follows the bytes received.
async function downloadOnce(url, token, onFraction) {
  const t0 = performance.now();
  const res = await send(url, { headers: tokenHeaders(token, 'GET', url) });
  if (!res.ok) throw httpError(res.status);
  const expected = Number(res.headers.get('content-length')) || 0;
  const reader = res.body.getReader();
  let bytes = 0;
  let ttfbMs = null;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (ttfbMs === null) ttfbMs = performance.now() - t0;
      bytes += value.byteLength;
      if (expected) onFraction(Math.min(1, bytes / expected));
    }
  } catch (cause) {
    reader.cancel().catch(() => {});
    throw new ApiError('network', 0, 'network_error', { cause });
  }
  const totalMs = performance.now() - t0;
  return { bytes, mbps: mbps(bytes, totalMs), ttfbMs: ttfbMs ?? totalMs, totalMs };
}

const medianOf = (rounds) => ({
  mbps: median(rounds.map((r) => r.mbps)),
  ttfbMs: median(rounds.map((r) => r.ttfbMs)),
  totalMs: median(rounds.map((r) => r.totalMs)),
});

/**
 * Runs ROUNDS rounds of `once(onFraction)`. onProgress({round, fraction, result}) reports the
 * current round (1-based), overall fraction 0..1 and the median so far (null before round 1 ends).
 */
async function rounds(once, onProgress) {
  const done = [];
  for (let i = 0; i < ROUNDS; i++) {
    onProgress({ round: i + 1, fraction: i / ROUNDS, result: done.length ? medianOf(done) : null });
    done.push(await once((f) => onProgress({ round: i + 1, fraction: (i + f) / ROUNDS, result: done.length ? medianOf(done) : null })));
    onProgress({ round: i + 1, fraction: (i + 1) / ROUNDS, result: medianOf(done) });
  }
  return medianOf(done);
}

export function runDownload(mb, { token, onProgress = () => {} } = {}) {
  return rounds((onFraction) => downloadOnce(`/download/${mb}`, token, onFraction), onProgress);
}

function randomBlob(bytes) {
  const parts = [];
  for (let offset = 0; offset < bytes; offset += RANDOM_CHUNK) {
    const chunk = new Uint8Array(Math.min(RANDOM_CHUNK, bytes - offset));
    crypto.getRandomValues(chunk);
    parts.push(chunk);
  }
  return new Blob(parts, { type: 'application/octet-stream' });
}

/** Uploads `mb` MB of random bytes ROUNDS times; progress moves per finished round. 413 → ApiError kind 'too_large'. */
export function runUpload(mb, { token, onProgress = () => {} } = {}) {
  const blob = randomBlob(mb * MB); // built once per run, reused by every round
  return rounds(async () => {
    const body = new FormData();
    body.append('file', blob, 'random.bin');
    const t0 = performance.now();
    const res = await send('/upload', { method: 'POST', headers: tokenHeaders(token, 'POST', '/upload'), body });
    const ttfbMs = performance.now() - t0;
    if (!res.ok) throw httpError(res.status);
    await res.arrayBuffer();
    const totalMs = performance.now() - t0;
    return { bytes: blob.size, mbps: mbps(blob.size, totalMs), ttfbMs, totalMs };
  }, onProgress);
}

/** 5 × /download/10 at once. Mbps = all bytes ÷ wall time from first start to last finish. */
export async function runParallel5({ token, onProgress = () => {} } = {}) {
  const fractions = new Array(5).fill(0);
  const report = () => onProgress({ fraction: fractions.reduce((a, b) => a + b, 0) / 5 });
  const t0 = performance.now();
  const results = await Promise.all(
    fractions.map((_, i) => downloadOnce('/download/10', token, (f) => {
      fractions[i] = f;
      report();
    })),
  );
  const wallMs = performance.now() - t0;
  return { mbps: mbps(results.reduce((a, r) => a + r.bytes, 0), wallMs) };
}
