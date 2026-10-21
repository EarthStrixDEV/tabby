import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { api } from '../helpers/http.js';

const ISO = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/;
const created = [];

/** Creates a row and remembers its id for cleanup. */
async function make(body = {}) {
  const r = await api('POST', '/api/debts', { json: { friend_name: 'ทดสอบ', amount: '150', ...body } });
  assert.equal(r.status, 201, r.text);
  created.push(r.json.id);
  return r.json;
}

after(async () => {
  for (const id of created) await api('DELETE', `/api/debts/${id}`);
});

test('POST creates a row with the full shape', async () => {
  const row = await make({ note: 'ค่าข้าว' });
  assert.equal(typeof row.id, 'number');
  assert.equal(row.friend_name, 'ทดสอบ');
  assert.equal(row.amount, '150.00');
  assert.equal(row.note, 'ค่าข้าว');
  assert.equal(row.is_paid, 0);
  assert.match(row.created_at, ISO);
  assert.match(row.updated_at, ISO);
  assert.deepEqual(Object.keys(row).sort(), ['amount', 'created_at', 'friend_name', 'id', 'is_paid', 'note', 'updated_at']);
});

test('GET /api/debts/{id} reads it back; missing id -> 404', async () => {
  const row = await make();
  const r = await api('GET', `/api/debts/${row.id}`);
  assert.equal(r.status, 200);
  assert.deepEqual(r.json, row);
  const missing = await api('GET', '/api/debts/2147483647');
  assert.equal(missing.status, 404);
  assert.deepEqual(missing.json, { error: 'not_found' });
});

test('PUT replaces every field (dropped note becomes null)', async () => {
  const row = await make({ note: 'เดิม' });
  const r = await api('PUT', `/api/debts/${row.id}`, { json: { friend_name: 'ใหม่', amount: '20.5', is_paid: 1 } });
  assert.equal(r.status, 200);
  assert.equal(r.json.id, row.id);
  assert.equal(r.json.friend_name, 'ใหม่');
  assert.equal(r.json.amount, '20.50');
  assert.equal(r.json.note, null);
  assert.equal(r.json.is_paid, 1);
  assert.equal(r.json.created_at, row.created_at);
  assert.match(r.json.updated_at, ISO);
});

test('PUT on a missing id -> 404', async () => {
  const r = await api('PUT', '/api/debts/2147483647', { json: { friend_name: 'a', amount: '1' } });
  assert.equal(r.status, 404);
  assert.deepEqual(r.json, { error: 'not_found' });
});

test('DELETE -> 204 empty body, second DELETE -> 404', async () => {
  const row = await make();
  const r = await api('DELETE', `/api/debts/${row.id}`);
  assert.equal(r.status, 204);
  assert.equal(r.text, '');
  const again = await api('DELETE', `/api/debts/${row.id}`);
  assert.equal(again.status, 404);
  assert.deepEqual(again.json, { error: 'not_found' });
});

test('list: envelope, id DESC order, default per_page 20, total counts new rows', async () => {
  const before = await api('GET', '/api/debts');
  assert.equal(before.status, 200);
  assert.deepEqual(Object.keys(before.json).sort(), ['data', 'page', 'per_page', 'total']);
  assert.equal(before.json.page, 1);
  assert.equal(before.json.per_page, 20);
  assert.ok(before.json.data.length <= 20);

  const a = await make({ friend_name: 'A' });
  const b = await make({ friend_name: 'B' });
  const c = await make({ friend_name: 'C' });

  const r = await api('GET', '/api/debts?per_page=100');
  assert.equal(r.status, 200);
  assert.equal(r.json.per_page, 100);
  // Other test files share this DB, so only lower bounds and relative order are stable.
  assert.ok(r.json.total >= before.json.total + 3);
  const ids = r.json.data.map((x) => x.id);
  assert.deepEqual(ids, [...ids].sort((x, y) => y - x));
  const mine = ids.filter((id) => [a.id, b.id, c.id].includes(id));
  assert.deepEqual(mine, [c.id, b.id, a.id]);
});

test('list: paid filter and per_page paging', async () => {
  const open = await make({ friend_name: 'open' });
  const paid = await make({ friend_name: 'paid', is_paid: 1 });

  const p1 = await api('GET', '/api/debts?paid=1&per_page=100');
  assert.equal(p1.status, 200);
  assert.ok(p1.json.data.every((x) => x.is_paid === 1));
  assert.ok(p1.json.data.some((x) => x.id === paid.id));
  assert.ok(!p1.json.data.some((x) => x.id === open.id));

  const p0 = await api('GET', '/api/debts?paid=0&per_page=100');
  assert.ok(p0.json.data.every((x) => x.is_paid === 0));
  assert.ok(p0.json.data.some((x) => x.id === open.id));
  assert.ok(!p0.json.data.some((x) => x.id === paid.id));

  const two = await api('GET', '/api/debts?per_page=1&page=2');
  assert.equal(two.json.data.length, 1);
  assert.equal(two.json.page, 2);
  assert.equal(two.json.per_page, 1);
});

test('list: page past the end -> 200, empty data, real total', async () => {
  await make();
  const first = await api('GET', '/api/debts');
  const r = await api('GET', '/api/debts?page=999999');
  assert.equal(r.status, 200);
  assert.deepEqual(r.json.data, []);
  assert.equal(r.json.page, 999999);
  assert.ok(r.json.total >= 1);
  assert.ok(Math.abs(r.json.total - first.json.total) <= 10);
  const huge = await api('GET', '/api/debts?page=99999999999999999999');
  assert.equal(huge.status, 200);
  assert.deepEqual(huge.json.data, []);
});

for (const q of ['page=0', 'page=abc', 'page=', 'page=-1', 'page=1.5', 'per_page=0', 'per_page=101', 'per_page=x', 'paid=2', 'paid=', 'paid=true']) {
  test(`list: ?${q} -> 400 bad_params`, async () => {
    const r = await api('GET', `/api/debts?${q}`);
    assert.equal(r.status, 400);
    assert.deepEqual(r.json, { error: 'bad_params' });
  });
}

test('Review Focus 1: emoji name round-trips exactly', async () => {
  const row = await make({ friend_name: 'เอิร์ธ 🐱' });
  assert.equal(row.friend_name, 'เอิร์ธ 🐱');
  const r = await api('GET', `/api/debts/${row.id}`);
  assert.equal(r.json.friend_name, 'เอิร์ธ 🐱');
});

test('Review Focus 1: 100 Thai chars accepted, 101 rejected', async () => {
  const ok = await make({ friend_name: 'ก'.repeat(100) });
  assert.equal(ok.friend_name, 'ก'.repeat(100));
  const bad = await api('POST', '/api/debts', { json: { friend_name: 'ก'.repeat(101), amount: '1' } });
  assert.equal(bad.status, 422);
  assert.equal(bad.json.error, 'validation_failed');
  assert.equal(bad.json.fields.friend_name, 'ยาวเกิน 100 ตัวอักษร');
});

test('blank note becomes null; name is trimmed', async () => {
  const row = await make({ friend_name: '  สมชาย  ', note: '   ' });
  assert.equal(row.friend_name, 'สมชาย');
  assert.equal(row.note, null);
});

for (const path of ['/api/debts/0', '/api/debts/abc']) {
  test(`GET ${path} -> 404`, async () => {
    const r = await api('GET', path);
    assert.equal(r.status, 404);
    assert.deepEqual(r.json, { error: 'not_found' });
  });
}

test('PUT validates like POST', async () => {
  const row = await make();
  const r = await api('PUT', `/api/debts/${row.id}`, { json: { friend_name: '', amount: '0' } });
  assert.equal(r.status, 422);
  assert.deepEqual(r.json.fields, { friend_name: 'ห้ามว่าง', amount: 'ต้องมากกว่า 0' });
});
