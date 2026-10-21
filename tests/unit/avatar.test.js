import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initialOf, avatarVariant } from '../../shared/public/static/js/lib/avatar.js';

test('initialOf skips leading Thai vowels เ แ โ ใ ไ', () => {
  assert.equal(initialOf('แพรว'), 'พ');
  assert.equal(initialOf('โอ๊ต'), 'อ');
  assert.equal(initialOf('เอิร์ธ'), 'อ');
  assert.equal(initialOf('ใจ'), 'จ');
  assert.equal(initialOf('ไก่'), 'ก');
  assert.equal(initialOf('ต้น'), 'ต');
});

test('initialOf is code-point aware and trims', () => {
  assert.equal(initialOf('🐱cat'), '🐱');
  assert.equal(initialOf('  Mint'), 'M');
});

test('initialOf edge cases', () => {
  assert.equal(initialOf(''), '');
  assert.equal(initialOf('เ'), 'เ'); // nothing left after skipping: fall back to the first character
});

test('avatarVariant is djb2 over UTF-16 units, mod 4, mapped to a-d', () => {
  assert.equal(avatarVariant(''), 'b'); // 5381 % 4 = 1
  assert.equal(avatarVariant('a'), 'c'); // (5381*33+97) % 4 = 2
  assert.equal(avatarVariant('ab'), 'a'); // 5863208 % 4 = 0
});

test('avatarVariant is deterministic and always a-d', () => {
  for (const n of ['แพรว', 'โอ๊ต', '🐱cat', 'x'.repeat(500)]) {
    const v = avatarVariant(n);
    assert.match(v, /^[abcd]$/);
    assert.equal(avatarVariant(n), v);
  }
});
