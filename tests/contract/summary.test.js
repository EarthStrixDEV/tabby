import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as sleep } from 'node:timers/promises';
import { api, TOKEN } from '../helpers/http.js';

const created = [];
const auth = { 'X-Test-Token': TOKEN };

async function make(body) {
  const r = await api('POST', '/api/debts', { json: body });
  assert.equal(r.status, 201, r.text);
  created.push(r.json.id);
  return r.json;
}

after(async () => {
  for (const id of created) await api('DELETE', `/api/debts/${id}`);
  await api('DELETE', '/api/cache', { headers: auth });
});

test('summary shape and X-App-Cache MISS -> HIT -> MISS after create', async () => {
  const cleared = await api('DELETE', '/api/cache', { headers: auth });
  assert.equal(cleared.status, 204);
  const a = await api('GET', '/api/summary');
  assert.equal(a.status, 200);
  assert.equal(a.headers.get('x-app-cache'), 'MISS');
  const b = await api('GET', '/api/summary');
  assert.equal(b.headers.get('x-app-cache'), 'HIT');
  assert.deepEqual(b.json, a.json);
  const c = await make({ friend_name: 'z', amount: '10' });
  const d = await api('GET', '/api/summary');
  assert.equal(d.headers.get('x-app-cache'), 'MISS');
  assert.equal(d.json.count_all, a.json.count_all + 1);
  assert.match(d.json.total_unpaid, /^\d+\.\d\d$/);
  for (const k of ['count_unpaid', 'count_paid', 'count_all', 'count_friends_unpaid']) {
    assert.equal(typeof d.json[k], 'number', k);
  }
  assert.match(d.json.generated_at, /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/);
  assert.deepEqual(Object.keys(d.json).sort(), [
    'count_all', 'count_friends_unpaid', 'count_paid', 'count_unpaid', 'generated_at', 'total_unpaid',
  ]);
  const del = await api('DELETE', `/api/debts/${c.id}`);
  assert.equal(del.status, 204);
});

test('update and delete also invalidate the cache', async () => {
  const row = await make({ friend_name: 'inv', amount: '5' });
  await api('GET', '/api/summary');
  assert.equal((await api('GET', '/api/summary')).headers.get('x-app-cache'), 'HIT');
  const put = await api('PUT', `/api/debts/${row.id}`, { json: { friend_name: 'inv', amount: '6' } });
  assert.equal(put.status, 200);
  const afterPut = await api('GET', '/api/summary');
  assert.equal(afterPut.headers.get('x-app-cache'), 'MISS');
  assert.equal((await api('GET', '/api/summary')).headers.get('x-app-cache'), 'HIT');
  await api('DELETE', `/api/debts/${row.id}`);
  assert.equal((await api('GET', '/api/summary')).headers.get('x-app-cache'), 'MISS');
});

test('totals only count unpaid rows', async () => {
  await api('DELETE', '/api/cache', { headers: auth });
  const before = (await api('GET', '/api/summary')).json;
  const unpaid = await make({ friend_name: 'tot', amount: '12.50' });
  const paid = await make({ friend_name: 'tot', amount: '100', is_paid: 1 });
  const s = (await api('GET', '/api/summary')).json;
  const cents = (v) => Math.round(Number(v) * 100);
  assert.equal(cents(s.total_unpaid) - cents(before.total_unpaid), 1250);
  assert.equal(s.count_unpaid, before.count_unpaid + 1);
  assert.equal(s.count_paid, before.count_paid + 1);
  assert.equal(s.count_all, before.count_all + 2);
  await api('DELETE', `/api/debts/${unpaid.id}`);
  await api('DELETE', `/api/debts/${paid.id}`);
});

test('two unpaid rows for the same friend count once in count_friends_unpaid', async () => {
  await api('DELETE', '/api/cache', { headers: auth });
  const before = (await api('GET', '/api/summary')).json;
  await make({ friend_name: 'dup-friend-xyz', amount: '1' });
  await make({ friend_name: 'dup-friend-xyz', amount: '2' });
  await make({ friend_name: 'dup-friend-xyz', amount: '3', is_paid: 1 });
  const s = (await api('GET', '/api/summary')).json;
  assert.equal(s.count_friends_unpaid, before.count_friends_unpaid + 1);
  assert.equal(s.count_unpaid, before.count_unpaid + 2);
});

test('cache-stats returns {hits, misses} numbers; DELETE /api/cache resets them to 0', async () => {
  await api('DELETE', '/api/cache', { headers: auth });
  const zero = await api('GET', '/api/cache-stats');
  assert.equal(zero.status, 200);
  assert.deepEqual(zero.json, { hits: 0, misses: 0 });
  await api('GET', '/api/summary'); // MISS
  await api('GET', '/api/summary'); // HIT
  await api('GET', '/api/summary'); // HIT
  const s = await api('GET', '/api/cache-stats');
  assert.equal(typeof s.json.hits, 'number');
  assert.equal(typeof s.json.misses, 'number');
  assert.deepEqual(s.json, { hits: 2, misses: 1 });
  await api('DELETE', '/api/cache', { headers: auth });
  assert.deepEqual((await api('GET', '/api/cache-stats')).json, { hits: 0, misses: 0 });
});

test('summary expires after 10 s', { timeout: 20000 }, async () => {
  await api('DELETE', '/api/cache', { headers: auth });
  assert.equal((await api('GET', '/api/summary')).headers.get('x-app-cache'), 'MISS');
  assert.equal((await api('GET', '/api/summary')).headers.get('x-app-cache'), 'HIT');
  await sleep(11000);
  assert.equal((await api('GET', '/api/summary')).headers.get('x-app-cache'), 'MISS');
});
