import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CHECKS, runChecks } from '../../shared/public/static/js/tools/caching.js';
import { clampInputs, runLoad } from '../../shared/public/static/js/tools/loadtest.js';

const TOKEN = 'tok';
const ETAG = '"a1b2c3"';

const res = (status, headers = {}, body = null) => new Response(body, { status, headers });
const json = (status, obj, headers = {}) =>
  res(status, { 'Content-Type': 'application/json', ...headers }, JSON.stringify(obj));

/**
 * Stub server. `cfg` picks the behaviour of each endpoint; every call is recorded.
 * Paths are matched without the query string (the gzip check adds ?t=<now>).
 */
function stubServer(cfg) {
  const calls = [];
  let summaryCalls = 0;
  let timeCalls = 0;
  const fetchImpl = async (url, init = {}) => {
    const method = (init.method ?? 'GET').toUpperCase();
    const headers = new Headers(init.headers);
    const path = String(url).split('?')[0];
    calls.push({ method, url: String(url), path, headers });
    const key = `${method} ${path}`;
    switch (key) {
      case 'GET /cache/static':
        if (headers.get('If-None-Match')) return res(cfg.conditionalStatus);
        return res(200, cfg.staticHeaders, 'x'.repeat(2048));
      case 'GET /cache/none':
        return res(200, cfg.noneHeaders, 'x');
      case 'GET /cache/time': {
        timeCalls++;
        const unix = cfg.timeEqual ? 1792404000000 : 1792404000000 + timeCalls;
        return json(200, { server_time: '2026-10-19T10:00:00Z', unix_ms: unix });
      }
      case 'GET /cache/gzip':
        return res(200, { 'Content-Type': 'text/plain; charset=utf-8', ...cfg.gzipHeaders }, 'a');
      case 'DELETE /api/cache':
        return headers.get('X-Test-Token') === TOKEN ? res(204) : json(403, { error: 'forbidden' });
      case 'GET /api/summary':
        return json(200, {}, { 'X-App-Cache': cfg.summarySeq[summaryCalls++] ?? 'MISS' });
      case 'POST /api/debts':
        return cfg.createdBody === undefined ? json(201, { id: 77 }) : res(201, { 'Content-Type': 'application/json' }, cfg.createdBody);
      case 'GET /api/debts':
        return json(200, { data: [{ id: 77, friend_name: 'ตรวจแคช' }], page: 1, per_page: 1, total: 1 });
      case 'DELETE /api/debts/77':
        return res(204);
      case 'GET /static/js/app.js':
      case 'GET /static/css/style.css':
        return res(200, cfg.assetHeaders, 'x');
      default:
        throw new Error(`unexpected request ${key}`);
    }
  };
  return { fetchImpl, calls };
}

const PASSING = {
  staticHeaders: { ETag: ETAG, 'Cache-Control': 'public, max-age=60', 'Last-Modified': 'Wed, 21 Oct 2026 00:00:00 GMT' },
  conditionalStatus: 304,
  noneHeaders: { 'Cache-Control': 'no-store' },
  timeEqual: true,
  gzipHeaders: { 'Content-Encoding': 'gzip' },
  summarySeq: ['MISS', 'HIT', 'MISS'],
  assetHeaders: { ETag: '"f1"', 'Cache-Control': 'max-age=3600' },
};

const FAILING = {
  staticHeaders: {},
  conditionalStatus: 200,
  noneHeaders: { 'Cache-Control': 'public, max-age=60' },
  timeEqual: false,
  gzipHeaders: {},
  summarySeq: ['MISS', 'MISS', 'MISS'],
  assetHeaders: {},
};

const byKey = (results) => Object.fromEntries(results.map((r) => [r.key, r]));

test('CHECKS lists the 8 rows in Spec §7 order with the DESIGN names', () => {
  assert.deepEqual(CHECKS, [
    { key: 'etag', label: 'ETag' },
    { key: 'cache-control', label: 'Cache-Control' },
    { key: 'conditional', label: 'ส่งซ้ำด้วย If-None-Match' },
    { key: 'no-store', label: 'no-store (/cache/none)' },
    { key: 'server-cache', label: 'แคชฝั่ง server (/cache/time)' },
    { key: 'gzip', label: 'บีบอัด (/cache/gzip)' },
    { key: 'app-cache', label: 'App cache (/api/summary)' },
    { key: 'static', label: 'ไฟล์ static (CSS/JS)' },
  ]);
});

test('a well-behaved server passes every check (server-cache is a note)', async () => {
  const { fetchImpl, calls } = stubServer(PASSING);
  const rows = [];
  const results = await runChecks({ fetchImpl, token: TOKEN, onRow: (r) => rows.push(r.key), getEncodedSize: () => 900 });
  assert.deepEqual(results.map((r) => r.key), CHECKS.map((c) => c.key));
  assert.deepEqual(rows, CHECKS.map((c) => c.key), 'onRow fires once per row, in order');
  const r = byKey(results);
  assert.deepEqual(r.etag, { key: 'etag', result: 'pass', detail: `พบ ${ETAG} ในคำตอบ` });
  assert.deepEqual(r['cache-control'], { key: 'cache-control', result: 'pass', detail: 'public, max-age=60' });
  assert.deepEqual(r.conditional, { key: 'conditional', result: 'pass', detail: 'ได้ 304 Not Modified' });
  assert.equal(r['no-store'].result, 'pass');
  assert.equal(r['no-store'].detail, 'no-store');
  assert.deepEqual(r['server-cache'], { key: 'server-cache', result: 'note', detail: 'มี cache' });
  assert.equal(r.gzip.result, 'pass');
  assert.match(r.gzip.detail, /gzip/);
  assert.match(r.gzip.detail, /ประมาณ 1 KB จาก 200 KB/);
  assert.equal(r['app-cache'].result, 'pass');
  assert.equal(r['app-cache'].detail, 'MISS → HIT → MISS');
  assert.deepEqual(r.static, { key: 'static', result: 'pass', detail: 'max-age=3600' });

  // The conditional request echoes the ETag from the first response.
  const cond = calls.find((c) => c.path === '/cache/static' && c.headers.get('If-None-Match'));
  assert.equal(cond.headers.get('If-None-Match'), ETAG);
  // gzip dodges the browser cache.
  assert.match(calls.find((c) => c.path === '/cache/gzip').url, /^\/cache\/gzip\?t=\d+$/);
  // App cache: DELETE /api/cache with the token, then MISS, HIT, POST, MISS, DELETE temp row.
  const seq = calls.filter((c) => c.path.startsWith('/api/')).map((c) => `${c.method} ${c.path}`);
  assert.deepEqual(seq, [
    'DELETE /api/cache', 'GET /api/summary', 'GET /api/summary', 'POST /api/debts', 'GET /api/summary', 'DELETE /api/debts/77',
  ]);
  assert.equal(calls.find((c) => c.path === '/api/cache').headers.get('X-Test-Token'), TOKEN);
});

test('a server without caching fails every check (server-cache stays a note)', async () => {
  const { fetchImpl, calls } = stubServer(FAILING);
  const r = byKey(await runChecks({ fetchImpl, token: TOKEN, onRow() {}, getEncodedSize: () => 204800 }));
  assert.deepEqual(r.etag, { key: 'etag', result: 'fail', detail: 'ไม่พบ ETag' });
  assert.equal(r['cache-control'].result, 'fail');
  assert.deepEqual(r.conditional, { key: 'conditional', result: 'fail', detail: 'ได้ 200' });
  assert.equal(r['no-store'].result, 'fail');
  assert.equal(r['no-store'].detail, 'public, max-age=60');
  assert.deepEqual(r['server-cache'], { key: 'server-cache', result: 'note', detail: 'ไม่มี cache' });
  assert.equal(r.gzip.result, 'fail');
  assert.match(r.gzip.detail, /ประมาณ 200 KB จาก 200 KB/);
  assert.equal(r['app-cache'].result, 'fail');
  assert.equal(r['app-cache'].detail, 'MISS → MISS → MISS');
  assert.deepEqual(r.static, { key: 'static', result: 'fail', detail: 'ไม่มี Expires หรือ max-age' });
  assert.ok(calls.some((c) => c.method === 'DELETE' && c.path === '/api/debts/77'), 'temp row is deleted');
});

test('gzip passes on the size estimate alone when Content-Encoding is not readable', async () => {
  const { fetchImpl } = stubServer({ ...PASSING, gzipHeaders: {} });
  const r = byKey(await runChecks({ fetchImpl, token: TOKEN, onRow() {}, getEncodedSize: () => 40000 }));
  assert.equal(r.gzip.result, 'pass');
  assert.match(r.gzip.detail, /ประมาณ 39 KB จาก 200 KB/);
});

test('app-cache without a token fails with the token message and writes nothing', async () => {
  const { fetchImpl, calls } = stubServer(PASSING);
  const r = byKey(await runChecks({ fetchImpl, token: '', onRow() {} }));
  assert.deepEqual(r['app-cache'], { key: 'app-cache', result: 'fail', detail: 'ใส่รหัสทดสอบก่อน' });
  assert.equal(calls.filter((c) => c.path.startsWith('/api/')).length, 0);
});

test('app-cache with a wrong token (403) fails with the token message', async () => {
  const { fetchImpl, calls } = stubServer(PASSING);
  const r = byKey(await runChecks({ fetchImpl, token: 'wrong', onRow() {} }));
  assert.deepEqual(r['app-cache'], { key: 'app-cache', result: 'fail', detail: 'ใส่รหัสทดสอบก่อน' });
  assert.ok(!calls.some((c) => c.method === 'POST'), 'no temp row is written after a 403');
});

test('clampInputs caps at 1,000 requests and 50 concurrent', () => {
  assert.deepEqual(clampInputs(5000, 80), {
    reqs: 1000, conc: 50, errors: { reqs: 'สูงสุด 1,000', conc: 'สูงสุด 50' },
  });
  assert.deepEqual(clampInputs(100, 10), { reqs: 100, conc: 10, errors: {} });
  assert.deepEqual(clampInputs(1000, 50), { reqs: 1000, conc: 50, errors: {} }, 'the caps themselves are allowed');
});

test('app-cache still deletes the temp row when the 201 body cannot be parsed', async () => {
  const { fetchImpl, calls } = stubServer({ ...PASSING, createdBody: 'not json' });
  const r = byKey(await runChecks({ fetchImpl, token: TOKEN, onRow() {} }));
  assert.equal(r['app-cache'].result, 'pass');
  assert.ok(calls.some((c) => c.method === 'DELETE' && c.path === '/api/debts/77'), 'temp row is deleted');
});

test('runLoad sends X-Test-Token only to guarded endpoints', async () => {
  const seen = [];
  const fetchImpl = async (url, init = {}) => {
    seen.push({ url, token: new Headers(init.headers).get('X-Test-Token') });
    return res(200, { 'Server-Timing': 'app;dur=1.5' }, '{}');
  };
  const ping = await runLoad({ path: '/api/ping', reqs: 3, conc: 2, token: TOKEN, fetchImpl });
  const slow = await runLoad({ path: '/api/slow?ms=200', reqs: 2, conc: 2, token: TOKEN, fetchImpl });
  assert.equal(ping.ok, 3);
  assert.equal(slow.serverAvg, 1.5);
  assert.deepEqual(seen.filter((c) => c.url === '/api/ping').map((c) => c.token), [null, null, null]);
  assert.deepEqual(seen.filter((c) => c.url === '/api/slow?ms=200').map((c) => c.token), [TOKEN, TOKEN]);
});
