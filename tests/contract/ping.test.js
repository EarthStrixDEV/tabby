import { test } from 'node:test';
import assert from 'node:assert/strict';
import { api } from '../helpers/http.js';

test('GET /api/ping', async () => {
  const r = await api('GET', '/api/ping');
  assert.equal(r.status, 200);
  assert.equal(r.json.pong, true);
  assert.equal(r.json.stack, r.headers.get('x-stack'));
  assert.equal(typeof r.json.unix_ms, 'number');
  assert.match(r.headers.get('server-timing'), /^app;dur=\d+(\.\d+)?$/);
  assert.equal(r.headers.get('x-robots-tag'), 'noindex');
  assert.equal(r.headers.get('access-control-allow-origin'), null);
  assert.match(r.headers.get('content-type'), /^application\/json; charset=utf-8/);
});

test('GET /api/ping?db=1 adds db_ms', async () => {
  const r = await api('GET', '/api/ping?db=1');
  assert.equal(r.status, 200);
  assert.equal(typeof r.json.db_ms, 'number');
});

test('unknown /api path -> 404 not_found', async () => {
  const r = await api('GET', '/api/nope');
  assert.equal(r.status, 404);
  assert.deepEqual(r.json, { error: 'not_found' });
});

test('wrong method -> 405', async () => {
  const r = await api('PATCH', '/api/ping');
  assert.equal(r.status, 405);
  assert.deepEqual(r.json, { error: 'method_not_allowed' });
  assert.match(r.headers.get('allow'), /GET/);
});
