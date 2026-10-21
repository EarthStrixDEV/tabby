import { test } from 'node:test';
import assert from 'node:assert/strict';
import { api, BASE_URL } from '../helpers/http.js';

test('GET /cache/static: validators and ~2 KB body', async () => {
  const r = await api('GET', '/cache/static');
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('cache-control'), 'public, max-age=60');
  assert.match(r.headers.get('etag'), /^"[0-9a-f]+"$/);
  assert.ok(r.headers.get('last-modified'));
  assert.match(r.headers.get('content-type'), /^text\/plain; charset=utf-8/);
  assert.ok(r.text.length >= 1900 && r.text.length <= 2200, `length ${r.text.length}`);
});

test('GET /cache/static with matching If-None-Match -> 304, empty body', async () => {
  const first = await api('GET', '/cache/static');
  const etag = first.headers.get('etag');
  for (const inm of [etag, `W/${etag}`, `"nope", ${etag}`]) {
    const r = await api('GET', '/cache/static', { headers: { 'If-None-Match': inm } });
    assert.equal(r.status, 304, inm);
    assert.equal(r.text, '');
  }
  const miss = await api('GET', '/cache/static', { headers: { 'If-None-Match': '"other"' } });
  assert.equal(miss.status, 200);
});

test('GET /cache/none: same body, no-store', async () => {
  const [s, n] = await Promise.all([api('GET', '/cache/static'), api('GET', '/cache/none')]);
  assert.equal(n.status, 200);
  assert.equal(n.headers.get('cache-control'), 'no-store');
  assert.equal(n.text, s.text);
});

test('GET /cache/time: recomputed per call, public max-age=10', async () => {
  const a = await api('GET', '/cache/time');
  assert.equal(a.status, 200);
  assert.equal(a.headers.get('cache-control'), 'public, max-age=10');
  assert.match(a.json.server_time, /Z$/);
  assert.equal(typeof a.json.unix_ms, 'number');
  await new Promise((res) => setTimeout(res, 50));
  const b = await api('GET', '/cache/time');
  assert.notEqual(a.json.unix_ms, b.json.unix_ms);
});

test('GET /cache/gzip: 204,800 bytes, not compressed by the app', async () => {
  const res = await fetch(BASE_URL + '/cache/gzip', { headers: { 'Accept-Encoding': 'identity' } });
  const buf = await res.arrayBuffer();
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('content-length'), '204800');
  assert.equal(res.headers.get('content-encoding'), null);
  assert.match(res.headers.get('content-type'), /^text\/plain; charset=utf-8/);
  assert.equal(buf.byteLength, 204800);
});
