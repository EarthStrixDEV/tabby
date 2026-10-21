import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatBaht, parseAmountInput, addBaht } from '../../shared/public/static/js/lib/money.js';

test('formatBaht groups the integer part and drops .00', () => {
  assert.equal(formatBaht('12345.00'), '฿12,345');
  assert.equal(formatBaht('150.50'), '฿150.50');
  assert.equal(formatBaht('150.00'), '฿150');
  assert.equal(formatBaht('0.05'), '฿0.05');
  assert.equal(formatBaht('99999999.99'), '฿99,999,999.99');
});

const ok = (raw, value) => assert.deepEqual(parseAmountInput(raw), { ok: true, value }, JSON.stringify(raw));
const bad = (raw) => assert.deepEqual(parseAmountInput(raw), { ok: false }, JSON.stringify(raw));

test('parseAmountInput accepts and normalizes to 2 decimals', () => {
  ok(' 150 ', '150.00');
  ok('1,000', '1000.00');
  ok('150.', '150.00');
  ok('.5', '0.50');
  ok('150.5', '150.50');
  ok('0.01', '0.01');
  ok('007.5', '7.50');
  ok('99999999.99', '99999999.99');
});

test('parseAmountInput rejects what the server would reject', () => {
  bad('0');
  bad('0.00');
  bad('.');
  bad(',');
  bad('');
  bad('   ');
  bad('-5');
  bad('0.001');
  bad('1.500');
  bad('1e3');
  bad('abc');
  bad('100000000');
  bad('99999999.995');
  bad('100000000.00');
  bad('1'.repeat(30));
});

test('addBaht works in satang and keeps whole numbers bare', () => {
  assert.equal(addBaht('150', 100), '250');
  assert.equal(addBaht('150.5', 50), '200.50');
  assert.equal(addBaht('', 100), '100');
  assert.equal(addBaht('abc', 20), '20');
  assert.equal(addBaht('0.1', 0), '0.10');
  assert.equal(addBaht('1,000', 500), '1500');
});
