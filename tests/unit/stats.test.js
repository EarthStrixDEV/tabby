import { test } from 'node:test';
import assert from 'node:assert/strict';
import { percentile95, median, summarize, histogram, histogramSummary, mbps } from '../../shared/public/static/js/lib/stats.js';

const range = (n) => Array.from({ length: n }, (_, i) => i + 1);

test('percentile95 is sorted[ceil(0.95*N)-1]', () => {
  assert.equal(percentile95(range(20)), 19); // index 18
  assert.equal(percentile95([42]), 42);
  assert.equal(percentile95(range(100)), 95);
  assert.equal(percentile95(range(10)), 10);
});

test('median averages the two middle values when N is even', () => {
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([4, 1, 3, 2]), 2.5);
  assert.equal(median([7]), 7);
});

test('summarize', () => {
  const samples = [
    { ms: 100, status: 200, serverMs: 10 },
    { ms: 200, status: 201, serverMs: 20 },
    { ms: 300, status: 500, serverMs: null },
    { ms: 50, status: 0, serverMs: null },
  ];
  const s = summarize(samples, 2000);
  assert.equal(s.ok, 2);
  assert.deepEqual(s.errorsByStatus, { 500: 1, 0: 1 });
  assert.equal(s.errRate, 0.5);
  assert.equal(s.avg, 162.5);
  assert.equal(s.median, 150);
  assert.equal(s.p95, 300);
  assert.equal(s.min, 50);
  assert.equal(s.max, 300);
  assert.equal(s.rps, 2);
  assert.equal(s.serverAvg, 15);
});

test('summarize: serverAvg is null when no sample has serverMs', () => {
  const s = summarize([{ ms: 10, status: 200, serverMs: null }], 1000);
  assert.equal(s.serverAvg, null);
  assert.equal(s.errRate, 0);
  assert.deepEqual(s.errorsByStatus, {});
});

test('histogram: upper = max(100, ceil(p95/50)*50), last bin takes the overflow', () => {
  const h = histogram([10, 20, 30, 40, 50, 60, 70, 80, 90, 100], 4);
  assert.equal(h.upper, 100);
  assert.deepEqual(h.labels, ['0', '50', '100+']);
  assert.deepEqual(h.counts, [2, 2, 3, 3]); // bins [0,25) [25,50) [50,75) [75,100+); 100 lands in the last bin
  const big = histogram([10, 20, 500, 520], 5);
  assert.equal(big.upper, 550);
  assert.deepEqual(big.labels, ['0', '275', '550+']);
  assert.equal(big.counts.reduce((a, b) => a + b, 0), 4);
  assert.equal(big.counts.length, 5);
});

test('histogram: empty input gives zero counts', () => {
  const h = histogram([], 4);
  assert.deepEqual(h.counts, [0, 0, 0, 0]);
  assert.equal(h.upper, 100);
});

test('histogramSummary', () => {
  const prefix = 'กราฟแท่งการกระจายเวลาตอบสนอง ส่วนใหญ่อยู่ที่';
  assert.equal(histogramSummary({ counts: [1, 5, 2, 1], upper: 100, labels: ['0', '50', '100+'] }), `${prefix} 25 ถึง 50 มิลลิวินาที`);
  assert.equal(histogramSummary({ counts: [1, 1, 2, 9], upper: 100, labels: ['0', '50', '100+'] }), `${prefix} 100 มิลลิวินาทีขึ้นไป`);
});

test('mbps rounds to 1 decimal', () => {
  assert.equal(mbps(1_000_000, 1000), 8);
  assert.equal(mbps(10 * 1024 * 1024, 2000), 41.9);
  assert.equal(mbps(1_234_567, 1000), 9.9);
});
