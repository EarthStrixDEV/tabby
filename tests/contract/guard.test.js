import { test } from 'node:test';
import assert from 'node:assert/strict';
import { api, TOKEN } from '../helpers/http.js';

test('DELETE /api/cache without a token -> 403 forbidden', async () => {
  const r = await api('DELETE', '/api/cache');
  assert.equal(r.status, 403);
  assert.deepEqual(r.json, { error: 'forbidden' });
});

test('DELETE /api/cache with a wrong token -> 403 forbidden', async () => {
  for (const bad of ['wrong', TOKEN + 'x', TOKEN.slice(0, -1), '']) {
    const r = await api('DELETE', '/api/cache', { headers: { 'X-Test-Token': bad } });
    assert.equal(r.status, 403, `token ${JSON.stringify(bad)}`);
    assert.deepEqual(r.json, { error: 'forbidden' });
  }
});

test('DELETE /api/cache with the correct token -> 204', async () => {
  const r = await api('DELETE', '/api/cache', { headers: { 'X-Test-Token': TOKEN } });
  assert.equal(r.status, 204);
  assert.equal(r.text, '');
});

test('a rejected request does not clear the stats', async () => {
  await api('DELETE', '/api/cache', { headers: { 'X-Test-Token': TOKEN } });
  await api('GET', '/api/summary');
  await api('DELETE', '/api/cache');
  const s = await api('GET', '/api/cache-stats');
  assert.deepEqual(s.json, { hits: 0, misses: 1 });
  await api('DELETE', '/api/cache', { headers: { 'X-Test-Token': TOKEN } });
});
