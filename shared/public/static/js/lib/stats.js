// Load-test statistics. Pure functions; no DOM.

const sum = (nums) => nums.reduce((a, b) => a + b, 0);
const ascending = (a, b) => a - b;

export function percentile95(sortedMs) {
  if (sortedMs.length === 0) return 0;
  // Integer arithmetic: ceil(0.95 * N) without floating-point error.
  return sortedMs[Math.ceil((95 * sortedMs.length) / 100) - 1];
}

export function median(nums) {
  if (nums.length === 0) return 0;
  const s = [...nums].sort(ascending);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

// samples: [{ms, status, serverMs|null}], status 0 = network error.
export function summarize(samples, wallMs) {
  const n = samples.length;
  const ms = samples.map((s) => s.ms).sort(ascending);
  const errorsByStatus = {};
  let ok = 0;
  for (const { status } of samples) {
    if (status >= 200 && status < 300) ok++;
    else errorsByStatus[String(status)] = (errorsByStatus[String(status)] ?? 0) + 1;
  }
  const server = samples.filter((s) => s.serverMs != null).map((s) => s.serverMs);
  return {
    ok,
    errorsByStatus,
    errRate: n ? (n - ok) / n : 0,
    avg: n ? sum(ms) / n : 0,
    median: median(ms),
    p95: percentile95(ms),
    min: n ? ms[0] : 0,
    max: n ? ms[n - 1] : 0,
    rps: wallMs > 0 ? n / (wallMs / 1000) : 0,
    serverAvg: server.length ? sum(server) / server.length : null,
  };
}

export function histogram(ms, bins) {
  const sorted = [...ms].sort(ascending);
  const upper = Math.max(100, Math.ceil(percentile95(sorted) / 50) * 50);
  const width = upper / bins;
  const counts = new Array(bins).fill(0);
  for (const v of sorted) counts[Math.max(0, Math.min(bins - 1, Math.floor(v / width)))]++;
  return { counts, upper, labels: ['0', String(upper / 2), `${upper}+`] };
}

const SUMMARY_PREFIX = 'กราฟแท่งการกระจายเวลาตอบสนอง ส่วนใหญ่อยู่ที่';
const edge = (x) => String(Number(x.toFixed(1)));

export function histogramSummary(h) {
  const tallest = h.counts.indexOf(Math.max(...h.counts)); // first of equals
  if (tallest === h.counts.length - 1) return `${SUMMARY_PREFIX} ${h.upper} มิลลิวินาทีขึ้นไป`;
  const width = h.upper / h.counts.length;
  return `${SUMMARY_PREFIX} ${edge(tallest * width)} ถึง ${edge((tallest + 1) * width)} มิลลิวินาที`;
}

export function mbps(bytes, ms) {
  if (!(ms > 0)) return 0;
  return Math.round(((bytes * 8) / (ms / 1000) / 1e6) * 10) / 10;
}
