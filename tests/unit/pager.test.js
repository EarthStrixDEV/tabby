import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lastPage, pageItems, rangeText, mobilePageText } from '../../shared/public/static/js/lib/pager.js';

test('lastPage has a minimum of 1', () => {
  assert.equal(lastPage(0, 20), 1);
  assert.equal(lastPage(10, 20), 1);
  assert.equal(lastPage(20, 20), 1);
  assert.equal(lastPage(21, 20), 2);
  assert.equal(lastPage(101, 10), 11);
});

test('pageItems shows 1, current +/- 1 and last with ellipses for gaps', () => {
  assert.deepEqual(pageItems(5, 10), [1, '…', 4, 5, 6, '…', 10]);
  assert.deepEqual(pageItems(1, 3), [1, 2, 3]);
  assert.deepEqual(pageItems(1, 1), [1]);
  assert.deepEqual(pageItems(1, 10), [1, 2, '…', 10]);
  assert.deepEqual(pageItems(10, 10), [1, '…', 9, 10]);
  assert.deepEqual(pageItems(2, 5), [1, 2, 3, '…', 5]);
  assert.deepEqual(pageItems(3, 5), [1, 2, 3, 4, 5]);
});

test('rangeText', () => {
  assert.equal(rangeText(1, 20, 10), 'แสดง 1–10 จาก 10 รายการ (หน้าละ 20)');
  assert.equal(rangeText(2, 20, 45), 'แสดง 21–40 จาก 45 รายการ (หน้าละ 20)');
  assert.equal(rangeText(3, 20, 45), 'แสดง 41–45 จาก 45 รายการ (หน้าละ 20)');
  assert.equal(rangeText(1, 20, 0), 'แสดง 0–0 จาก 0 รายการ (หน้าละ 20)');
});

test('mobilePageText', () => {
  assert.equal(mobilePageText(1, 3), 'หน้า 1 จาก 3');
});
