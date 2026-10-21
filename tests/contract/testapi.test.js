import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { api, TOKEN } from '../helpers/http.js';

const auth = { 'X-Test-Token': TOKEN };
const dbReset = fileURLToPath(new URL('../../scripts/db-reset.mjs', import.meta.url));
const sleep = (ms) => new Promise((res) => setTimeout(res, ms));

function truncate(table) {
  const r = spawnSync(process.execPath, [dbReset, '--truncate', table], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
}

test('GET /api/slow without a token -> 403', async () => {
  const r = await api('GET', '/api/slow?ms=10');
  assert.equal(r.status, 403);
  assert.deepEqual(r.json, { error: 'forbidden' });
});

test('GET /api/slow?ms=50 -> 200 {slept_ms:50} after at least 50 ms', async () => {
  const t = performance.now();
  const r = await api('GET', '/api/slow?ms=50', { headers: auth });
  const elapsed = performance.now() - t;
  assert.equal(r.status, 200);
  assert.deepEqual(r.json, { slept_ms: 50 });
  assert.ok(elapsed >= 50, `elapsed ${elapsed}`);
});

test('GET /api/slow rejects out-of-range or malformed ms -> 400 bad_params', async () => {
  for (const ms of ['10001', '-1', 'abc', '']) {
    const r = await api('GET', `/api/slow?ms=${ms}`, { headers: auth });
    assert.equal(r.status, 400, `ms=${ms}`);
    assert.deepEqual(r.json, { error: 'bad_params' });
  }
  const missing = await api('GET', '/api/slow', { headers: auth });
  assert.equal(missing.status, 400);
});

test('PUT /api/echo echoes method, size and never Authorization or Cookie', async () => {
  const payload = { hello: 'world' };
  const r = await api('PUT', '/api/echo?a=1&b=2', {
    json: payload,
    headers: { Authorization: 'Bearer secret', Cookie: 'sid=secret', 'X-Forwarded-For': '203.0.113.9' },
  });
  assert.equal(r.status, 200);
  assert.equal(r.json.method, 'PUT');
  assert.equal(r.json.path, '/api/echo');
  assert.equal(r.json.query, 'a=1&b=2');
  assert.equal(r.json.protocol, 'http');
  assert.equal(r.json.client_ip, '127.0.0.1');
  assert.equal(r.json.body_size, JSON.stringify(payload).length);
  assert.equal(r.json.body_preview, JSON.stringify(payload));
  const names = Object.keys(r.json.headers).map((k) => k.toLowerCase());
  assert.ok(!names.includes('authorization'));
  assert.ok(!names.includes('cookie'));
  assert.equal(r.json.headers['X-Forwarded-For'], '203.0.113.9');
  assert.equal(r.json.headers['Content-Type'], 'application/json');
  assert.ok(r.json.headers.Host);
  assert.ok(!('X-Real-IP' in r.json.headers));
  assert.ok(!r.text.includes('secret'));
});

test('GET and DELETE /api/echo pass through with an empty body', async () => {
  for (const method of ['GET', 'DELETE']) {
    const r = await api(method, '/api/echo');
    assert.equal(r.status, 200, method);
    assert.equal(r.json.method, method);
    assert.equal(r.json.body_size, 0);
    assert.equal(r.json.body_preview, '');
  }
});

test('POST /api/echo previews only the first 1024 bytes', async () => {
  const r = await api('POST', '/api/echo', { body: 'x'.repeat(5000) });
  assert.equal(r.status, 200);
  assert.equal(r.json.body_size, 5000);
  assert.equal(r.json.body_preview.length, 1024);
});

test('POST /api/echo with 1,048,577 bytes -> 413 payload_too_large; 1,048,576 is accepted', async () => {
  const over = await api('POST', '/api/echo', { body: 'a'.repeat(1048577) });
  assert.equal(over.status, 413);
  assert.deepEqual(over.json, { error: 'payload_too_large' });
  const exact = await api('POST', '/api/echo', { body: 'a'.repeat(1048576) });
  assert.equal(exact.status, 200);
  assert.equal(exact.json.body_size, 1048576);
});

test('POST /api/seed without a token -> 403, DELETE /api/seed without a token -> 403', async () => {
  assert.equal((await api('POST', '/api/seed?n=5')).status, 403);
  assert.equal((await api('DELETE', '/api/seed')).status, 403);
});

test('POST /api/seed rejects n outside 1..10000 -> 400', async () => {
  for (const n of ['0', '10001', '-5', 'abc', '']) {
    const r = await api('POST', `/api/seed?n=${n}`, { headers: auth });
    assert.equal(r.status, 400, `n=${n}`);
    assert.deepEqual(r.json, { error: 'bad_params' });
  }
  assert.equal((await api('POST', '/api/seed', { headers: auth })).status, 400);
});

test('seed 50 rows raises count_all by 50, DELETE removes exactly them', async () => {
  await api('DELETE', '/api/seed', { headers: auth });
  const before = (await api('GET', '/api/summary')).json.count_all;

  const seeded = await api('POST', '/api/seed?n=50&reset=1', { headers: auth });
  assert.equal(seeded.status, 200);
  assert.equal(seeded.json.inserted, 50);
  assert.equal(typeof seeded.json.duration_ms, 'number');

  const after = (await api('GET', '/api/summary')).json.count_all;
  assert.equal(after, before + 50);

  const rows = (await api('GET', '/api/debts?per_page=50')).json.data;
  assert.ok(rows.every((d) => d.note === '[seed]'));
  assert.ok(rows.every((d) => Number(d.amount) % 10 === 0 && Number(d.amount) >= 10 && Number(d.amount) <= 5000));

  const del = await api('DELETE', '/api/seed', { headers: auth });
  assert.equal(del.status, 200);
  assert.deepEqual(del.json, { deleted: 50 });
  assert.equal((await api('GET', '/api/summary')).json.count_all, before);
});

test('POST /api/seed?reset=1 replaces earlier seed rows', async () => {
  await api('POST', '/api/seed?n=30', { headers: auth });
  const again = await api('POST', '/api/seed?n=20&reset=1', { headers: auth });
  assert.equal(again.json.inserted, 20);
  const del = await api('DELETE', '/api/seed', { headers: auth });
  assert.deepEqual(del.json, { deleted: 20 });
});

test('db-reset --truncate rejects tables outside the allow-list', () => {
  const r = spawnSync(process.execPath, [dbReset, '--truncate', 'users'], { encoding: 'utf8' });
  assert.notEqual(r.status, 0);
  const none = spawnSync(process.execPath, [dbReset, '--truncate'], { encoding: 'utf8' });
  assert.notEqual(none.status, 0);
});

test('GET /api/limited: 10 pass with Remaining 9..0, the 11th is 429 with matching Retry-After', async () => {
  truncate('rate_limits');
  // Stay clear of a minute boundary so all 11 calls land in one fixed window.
  const sec = new Date().getUTCSeconds();
  if (sec > 45) await sleep((60 - sec) * 1000 + 200);
  for (let i = 0; i < 10; i++) {
    const r = await api('GET', '/api/limited');
    assert.equal(r.status, 200, `call ${i + 1}`);
    assert.deepEqual(r.json, { ok: true });
    assert.equal(r.headers.get('x-ratelimit-limit'), '10');
    assert.equal(r.headers.get('x-ratelimit-remaining'), String(9 - i));
  }
  const blocked = await api('GET', '/api/limited');
  assert.equal(blocked.status, 429);
  assert.equal(blocked.json.error, 'rate_limited');
  assert.equal(blocked.headers.get('retry-after'), String(blocked.json.retry_after));
  assert.ok(blocked.json.retry_after >= 1 && blocked.json.retry_after <= 60);
  assert.equal(blocked.headers.get('x-ratelimit-limit'), '10');
  assert.equal(blocked.headers.get('x-ratelimit-remaining'), '0');
  truncate('rate_limits');
});
