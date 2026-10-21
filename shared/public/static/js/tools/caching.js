// Caching checks (Spec §7, DESIGN §5.5). Each check reads real response headers; fetch is injected for tests.

export const CHECKS = [
  { key: 'etag', label: 'ETag' },
  { key: 'cache-control', label: 'Cache-Control' },
  { key: 'conditional', label: 'ส่งซ้ำด้วย If-None-Match' },
  { key: 'no-store', label: 'no-store (/cache/none)' },
  { key: 'server-cache', label: 'แคชฝั่ง server (/cache/time)' },
  { key: 'gzip', label: 'บีบอัด (/cache/gzip)' },
  { key: 'app-cache', label: 'App cache (/api/summary)' },
  { key: 'static', label: 'ไฟล์ static (CSS/JS)' },
];

export const TOKEN_MESSAGE = 'ใส่รหัสทดสอบก่อน';
const NETWORK_MESSAGE = 'ทำรายการไม่สำเร็จ ลองอีกครั้ง';
const GZIP_BYTES = 204800;
const GZIP_PASS_BELOW = GZIP_BYTES / 4; // Spec §7 check 5: under 25% of 204,800 bytes

const row = (key, result, detail) => ({ key, result, detail });

// Bytes on the wire for a finished fetch, from Resource Timing (an estimate; null when unavailable).
async function encodedSizeFromTiming(url) {
  try {
    await new Promise((resolve) => setTimeout(resolve, 0)); // the entry is queued after the body completes
    const entries = performance.getEntriesByName(new URL(url, location.href).href, 'resource');
    const last = entries[entries.length - 1];
    return last ? last.encodedBodySize : null;
  } catch {
    return null;
  }
}

/**
 * Runs the 8 checks in order. onRow(result) fires as each row finishes.
 * getEncodedSize(url) is injectable for tests; the browser default reads PerformanceResourceTiming.
 */
export async function runChecks({ fetchImpl = (...a) => globalThis.fetch(...a), token = '', onRow = () => {}, getEncodedSize = encodedSizeFromTiming } = {}) {
  // no-store: every check must reach the server, not the browser cache.
  const get = async (url, headers = {}) => {
    const res = await fetchImpl(url, { method: 'GET', headers, cache: 'no-store', credentials: 'same-origin' });
    await res.arrayBuffer();
    return res;
  };
  const results = [];
  const emit = (r) => {
    results.push(r);
    onRow(r);
  };
  const failAll = (keys) => keys.forEach((k) => emit(row(k, 'fail', NETWORK_MESSAGE)));

  // 1 + 2: ETag and Cache-Control come from one /cache/static response.
  let etag = null;
  try {
    const res = await get('/cache/static');
    etag = res.headers.get('etag');
    const cc = res.headers.get('cache-control');
    emit(etag ? row('etag', 'pass', `พบ ${etag} ในคำตอบ`) : row('etag', 'fail', 'ไม่พบ ETag'));
    emit(row('cache-control', /max-age/i.test(cc ?? '') ? 'pass' : 'fail', cc || 'ไม่พบ Cache-Control'));
  } catch {
    failAll(['etag', 'cache-control']);
  }

  await step(emit, 'conditional', async () => {
    const res = await get('/cache/static', etag ? { 'If-None-Match': etag } : {});
    return res.status === 304 ? row('conditional', 'pass', 'ได้ 304 Not Modified') : row('conditional', 'fail', `ได้ ${res.status}`);
  });

  await step(emit, 'no-store', async () => {
    const cc = (await get('/cache/none')).headers.get('cache-control');
    return row('no-store', /no-store/i.test(cc ?? '') ? 'pass' : 'fail', cc || 'ไม่พบ Cache-Control');
  });

  await step(emit, 'server-cache', async () => {
    const read = async () => {
      const res = await fetchImpl('/cache/time', { method: 'GET', cache: 'no-store', credentials: 'same-origin' });
      return (await res.json()).unix_ms;
    };
    const first = await read();
    const second = await read();
    // Spec §7 check 4: recorded, never a failure.
    return row('server-cache', 'note', first === second ? 'มี cache' : 'ไม่มี cache');
  });

  await step(emit, 'gzip', async () => {
    const url = `/cache/gzip?t=${Date.now()}`;
    if (typeof performance !== 'undefined' && performance.clearResourceTimings) performance.clearResourceTimings();
    const res = await get(url);
    const encoding = (res.headers.get('content-encoding') ?? '').toLowerCase();
    const size = await getEncodedSize(url);
    const byHeader = /\b(gzip|br)\b/.test(encoding);
    const bySize = size > 0 && size < GZIP_PASS_BELOW;
    const parts = [encoding ? `Content-Encoding: ${encoding}` : 'ไม่พบ Content-Encoding'];
    if (size > 0) parts.push(`ประมาณ ${Math.round(size / 1024)} KB จาก 200 KB`);
    return row('gzip', byHeader || bySize ? 'pass' : 'fail', parts.join(', '));
  });

  await step(emit, 'app-cache', () => appCache(fetchImpl, token));

  await step(emit, 'static', async () => {
    const assets = [await get('/static/js/app.js'), await get('/static/css/style.css')];
    const validated = assets.every((r) => r.headers.get('etag') || r.headers.get('last-modified'));
    const cc = [...new Set(assets.map((r) => r.headers.get('cache-control')).filter(Boolean))];
    return row('static', validated ? 'pass' : 'fail', cc.length ? cc.join(' / ') : 'ไม่มี Expires หรือ max-age');
  });

  return results;
}

async function step(emit, key, fn) {
  try {
    emit(await fn());
  } catch {
    emit(row(key, 'fail', NETWORK_MESSAGE));
  }
}

// Spec §7 check 6: MISS → HIT → (write a row) → MISS. The temporary row is always deleted again.
async function appCache(fetchImpl, token) {
  if (!token) return row('app-cache', 'fail', TOKEN_MESSAGE);
  const call = (url, init) => fetchImpl(url, { cache: 'no-store', credentials: 'same-origin', ...init });

  const cleared = await call('/api/cache', { method: 'DELETE', headers: { 'X-Test-Token': token } });
  if (cleared.status === 403) return row('app-cache', 'fail', TOKEN_MESSAGE);
  if (!cleared.ok) return row('app-cache', 'fail', `ได้ ${cleared.status}`);

  const seen = [];
  const summary = async () => {
    const res = await call('/api/summary', { method: 'GET' });
    await res.arrayBuffer();
    seen.push(res.headers.get('x-app-cache') ?? '—');
  };
  await summary();
  await summary();

  const created = await call('/api/debts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ friend_name: 'ตรวจแคช', amount: '1.00' }),
  });
  if (created.status !== 201) return row('app-cache', 'fail', `ได้ ${created.status}`);
  const { id } = await created.json();
  try {
    await summary();
  } finally {
    await call(`/api/debts/${id}`, { method: 'DELETE' }).catch(() => {});
  }
  const ok = seen.join(' ') === 'MISS HIT MISS';
  return row('app-cache', ok ? 'pass' : 'fail', seen.join(' → '));
}
