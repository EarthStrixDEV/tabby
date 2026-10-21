import { test } from 'node:test';
import assert from 'node:assert/strict';
import { api, BASE_URL, TOKEN } from '../helpers/http.js';

const auth = { 'X-Test-Token': TOKEN };
const MB = 1048576;

test('GET /download/1 and POST /upload without a token -> 403', async () => {
  const d = await api('GET', '/download/1');
  assert.equal(d.status, 403);
  assert.deepEqual(d.json, { error: 'forbidden' });
  const u = await api('POST', '/upload');
  assert.equal(u.status, 403);
  assert.deepEqual(u.json, { error: 'forbidden' });
});

test('GET /download/2 -> 400 bad_params', async () => {
  const r = await api('GET', '/download/2', { headers: auth });
  assert.equal(r.status, 400);
  assert.deepEqual(r.json, { error: 'bad_params' });
});

test('GET /download/1 -> exactly 1 MiB of incompressible bytes, no content-encoding', async () => {
  // Ask for gzip on purpose: the app must not compress binary data.
  const res = await fetch(`${BASE_URL}/download/1`, { headers: { ...auth, 'Accept-Encoding': 'gzip' } });
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('content-type'), 'application/octet-stream');
  assert.equal(res.headers.get('content-length'), String(MB));
  assert.equal(res.headers.get('cache-control'), 'no-store');
  assert.equal(res.headers.get('content-encoding'), null);
  const body = new Uint8Array(await res.arrayBuffer());
  assert.equal(body.length, MB);
  const distinct = new Set(body.subarray(0, 65536)).size;
  assert.ok(distinct > 200, `distinct byte values in first 64 KB: ${distinct}`);
});

test('POST /upload with a 1 MB file -> received_bytes within 1% of 1048576', async () => {
  const form = new FormData();
  form.append('file', new Blob([new Uint8Array(MB).fill(7)]), 'blob.bin');
  const r = await api('POST', '/upload', { headers: auth, body: form });
  assert.equal(r.status, 200);
  assert.ok(Math.abs(r.json.received_bytes - MB) <= MB * 0.01, `received ${r.json.received_bytes}`);
  assert.equal(typeof r.json.duration_ms, 'number');
});

test('POST /upload with no file field -> 400 bad_params', async () => {
  const form = new FormData();
  form.append('other', 'x');
  const r = await api('POST', '/upload', { headers: auth, body: form });
  assert.equal(r.status, 400);
  assert.deepEqual(r.json, { error: 'bad_params' });
});
