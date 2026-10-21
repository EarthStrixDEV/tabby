import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { api } from '../helpers/http.js';

const cases = [
  [{ friend_name: '  ', amount: '10' }, 'friend_name', 'ห้ามว่าง'],
  [{ amount: '10' }, 'friend_name', 'ห้ามว่าง'],
  [{ friend_name: 5, amount: '10' }, 'friend_name', 'ห้ามว่าง'],
  [{ friend_name: 'a' }, 'amount', 'ต้องเป็นตัวเลข'],
  [{ friend_name: 'a', amount: true }, 'amount', 'ต้องเป็นตัวเลข'],
  [{ friend_name: 'a', amount: '0' }, 'amount', 'ต้องมากกว่า 0'],
  [{ friend_name: 'a', amount: '-5' }, 'amount', 'ต้องมากกว่า 0'],
  [{ friend_name: 'a', amount: '0.00' }, 'amount', 'ต้องมากกว่า 0'],
  [{ friend_name: 'a', amount: '1.005' }, 'amount', 'ทศนิยมไม่เกิน 2 ตำแหน่ง'],
  [{ friend_name: 'a', amount: '0.001' }, 'amount', 'ทศนิยมไม่เกิน 2 ตำแหน่ง'],
  [{ friend_name: 'a', amount: '100000000' }, 'amount', 'ต้องไม่เกิน 99,999,999.99'],
  [{ friend_name: 'a', amount: '99999999.991' }, 'amount', 'ทศนิยมไม่เกิน 2 ตำแหน่ง'],
  [{ friend_name: 'a', amount: '1e3' }, 'amount', 'ต้องเป็นตัวเลข'],
  [{ friend_name: 'a', amount: '1,000' }, 'amount', 'ต้องเป็นตัวเลข'],
  [{ friend_name: 'a', amount: '.5' }, 'amount', 'ต้องเป็นตัวเลข'],
  [{ friend_name: 'a', amount: '150.' }, 'amount', 'ต้องเป็นตัวเลข'],
  [{ friend_name: 'a', amount: 1e25 }, 'amount', 'ต้องเป็นตัวเลข'],
  [{ friend_name: 'a', amount: '10', note: 'x'.repeat(256) }, 'note', 'ยาวเกิน 255 ตัวอักษร'],
  [{ friend_name: 'a', amount: '10', note: 5 }, 'note', 'ต้องเป็นข้อความ'],
  [{ friend_name: 'a', amount: '10', is_paid: 2 }, 'is_paid', 'ต้องเป็น 0 หรือ 1'],
  [{ friend_name: 'a', amount: '10', is_paid: '1' }, 'is_paid', 'ต้องเป็น 0 หรือ 1'],
  [{ friend_name: 'a', amount: '10', is_paid: null }, 'is_paid', 'ต้องเป็น 0 หรือ 1'],
];

for (const [body, field, msg] of cases) {
  test(`422 ${field}: ${msg} <- ${JSON.stringify(body).slice(0, 60)}`, async () => {
    const r = await api('POST', '/api/debts', { json: body });
    assert.equal(r.status, 422, r.text);
    assert.equal(r.json.error, 'validation_failed');
    assert.equal(r.json.fields[field], msg);
  });
}

const created = [];
after(async () => {
  for (const id of created) await api('DELETE', `/api/debts/${id}`);
});

const accepted = [
  [' 150 ', '150.00'],
  [150.5, '150.50'],
  ['99999999.99', '99999999.99'],
  ['0.5', '0.50'],
  ['007', '7.00'],
  [12, '12.00'],
];
for (const [input, expected] of accepted) {
  test(`201 amount ${JSON.stringify(input)} -> ${expected}`, async () => {
    const r = await api('POST', '/api/debts', { json: { friend_name: 'v', amount: input } });
    assert.equal(r.status, 201, r.text);
    created.push(r.json.id);
    assert.equal(r.json.amount, expected);
  });
}

test('is_paid accepts true/false/0/1', async () => {
  for (const [input, expected] of [[true, 1], [false, 0], [1, 1], [0, 0]]) {
    const r = await api('POST', '/api/debts', { json: { friend_name: 'v', amount: '1', is_paid: input } });
    assert.equal(r.status, 201, r.text);
    created.push(r.json.id);
    assert.equal(r.json.is_paid, expected);
  }
});

test('all failing fields are reported together', async () => {
  const r = await api('POST', '/api/debts', { json: { friend_name: '', amount: 'x', note: 1, is_paid: 9 } });
  assert.equal(r.status, 422);
  assert.deepEqual(Object.keys(r.json.fields).sort(), ['amount', 'friend_name', 'is_paid', 'note']);
});

for (const [label, body] of [['truncated JSON', '{"a":'], ['JSON array [1]', '[1]'], ['empty JSON array []', '[]'], ['JSON scalar', '"x"'], ['empty body', '']]) {
  test(`400 invalid_json: ${label}`, async () => {
    const r = await api('POST', '/api/debts', { body, headers: { 'Content-Type': 'application/json' } });
    assert.equal(r.status, 400);
    assert.deepEqual(r.json, { error: 'invalid_json' });
  });
}

test('{} is a valid object but fails validation -> 422', async () => {
  const r = await api('POST', '/api/debts', { json: {} });
  assert.equal(r.status, 422);
  assert.equal(r.json.error, 'validation_failed');
  assert.deepEqual(Object.keys(r.json.fields).sort(), ['amount', 'friend_name']);
});
