import { test } from 'node:test';
import assert from 'node:assert/strict';
import { groupLabel, formatShortDate } from '../../shared/public/static/js/lib/dates.js';

test('formatShortDate renders Buddhist-era short date in Bangkok', () => {
  assert.equal(formatShortDate('2026-10-20T03:00:00Z'), '20 ต.ค. 2569');
  assert.equal(formatShortDate('2026-10-20T18:30:00Z'), '21 ต.ค. 2569');
});

const now = new Date('2026-10-21T03:00:00Z'); // Wednesday 21 Oct 2026, 10:00 Bangkok

test('groupLabel: same day, same week, same month, last month, older', () => {
  assert.equal(groupLabel('2026-10-21T01:00:00Z', now), 'วันนี้');
  assert.equal(groupLabel('2026-10-19T05:00:00Z', now), 'สัปดาห์นี้'); // Monday
  assert.equal(groupLabel('2026-10-14T05:00:00Z', now), 'เดือนนี้');
  assert.equal(groupLabel('2026-09-10T05:00:00Z', now), 'เดือนที่แล้ว');
  assert.equal(groupLabel('2026-08-10T05:00:00Z', now), 'สิงหาคม 2569');
  assert.equal(groupLabel('2025-12-31T05:00:00Z', now), 'ธันวาคม 2568');
});

test('groupLabel: week is Monday-start, Sunday belongs to the previous week', () => {
  assert.equal(groupLabel('2026-10-18T05:00:00Z', now), 'เดือนนี้'); // Sunday 18th
});

test('groupLabel: a week straddling a month boundary is still this week', () => {
  const n = new Date('2026-10-01T02:00:00Z'); // Thursday in Bangkok
  assert.equal(groupLabel('2026-09-28T05:00:00Z', n), 'สัปดาห์นี้'); // Monday 28 Sep
  assert.equal(groupLabel('2026-09-27T05:00:00Z', n), 'เดือนที่แล้ว'); // Sunday 27 Sep
});

test('groupLabel: uses the Bangkok day, not the UTC day', () => {
  assert.equal(groupLabel('2026-10-20T18:30:00Z', now), 'วันนี้'); // already 21st in Bangkok
  const late = new Date('2026-10-21T17:30:00Z'); // 22nd in Bangkok
  assert.equal(groupLabel('2026-10-21T10:00:00Z', late), 'สัปดาห์นี้');
});

test('groupLabel: previous month across a year boundary', () => {
  const jan = new Date('2027-01-06T05:00:00Z');
  assert.equal(groupLabel('2026-12-10T05:00:00Z', jan), 'เดือนที่แล้ว');
  assert.equal(groupLabel('2026-11-10T05:00:00Z', jan), 'พฤศจิกายน 2569');
});
