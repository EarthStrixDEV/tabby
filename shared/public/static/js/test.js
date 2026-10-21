// /test page: token, bandwidth, caching checks and the API load test. The static skeleton lives in test.html.

import { createApi } from './lib/api.js';
import { histogram, histogramSummary } from './lib/stats.js';
import { h } from './ui/dom.js';
import { runDownload, runUpload, runParallel5, ROUNDS } from './tools/bandwidth.js';
import { CHECKS, TOKEN_MESSAGE, runChecks } from './tools/caching.js';
import { ENDPOINTS, clampInputs, runLoad } from './tools/loadtest.js';

const NETWORK_MESSAGE = 'ทำรายการไม่สำเร็จ ลองอีกครั้ง';
const RUNNING = 'กำลังทดสอบ…';
const $ = (id) => document.getElementById(id);
const desktopQuery = matchMedia('(min-width: 900px)');

// The token lives only in this variable: never in storage, cookies or logs.
let token = '';
$('token-input').addEventListener('input', (e) => {
  token = e.target.value.trim();
});

const api = createApi({ getToken: () => token });

function showError(el, text) {
  el.textContent = text ?? '';
  el.hidden = !text;
}

function setProgress(el, fraction) {
  const pct = Math.round(Math.max(0, Math.min(1, fraction)) * 100);
  el.style.setProperty('--pct', pct);
  el.setAttribute('aria-valuenow', String(pct));
}

const ms = (v) => `${Math.round(v)} ms`;

// ---------- Bandwidth ----------

const bw = {
  card: $('bw-card'),
  size: $('bw-size'),
  down: $('bw-down'),
  up: $('bw-up'),
  upLast: $('bw-up-last'),
  progress: $('bw-progress'),
  round: $('bw-round'),
  ttfb: $('bw-ttfb'),
  total: $('bw-total'),
  five: $('bw-5x'),
  error: $('bw-error'),
  buttons: [$('bw-start-dl'), $('bw-start-ul'), $('bw-start-5x')],
};
let largestUploadMb = 0; // largest upload size that passed in this page session (Spec §6)

async function runBandwidth(button, job) {
  showError(bw.error, '');
  if (!token) {
    showError(bw.error, TOKEN_MESSAGE);
    return;
  }
  const label = button.textContent;
  bw.buttons.forEach((b) => (b.disabled = true));
  button.textContent = RUNNING;
  bw.card.setAttribute('aria-busy', 'true');
  setProgress(bw.progress, 0);
  try {
    await job();
  } catch (err) {
    showError(bw.error, bandwidthMessage(err));
  } finally {
    button.textContent = label;
    bw.buttons.forEach((b) => (b.disabled = false));
    bw.card.removeAttribute('aria-busy');
  }
}

function bandwidthMessage(err) {
  if (err?.kind === 'forbidden') return TOKEN_MESSAGE;
  if (err?.kind === 'too_large') return `ขนาดใหญ่สุดที่ผ่าน: ${largestUploadMb} MB`;
  return NETWORK_MESSAGE;
}

// Applies a 3-round progress report; `target` gets the median Mbps once round 1 is done.
function roundProgress(target) {
  return ({ round, fraction, result }) => {
    setProgress(bw.progress, fraction);
    bw.round.textContent = `รอบที่ ${round}/${ROUNDS}`;
    target.textContent = result ? result.mbps.toFixed(1) : '—';
    bw.ttfb.textContent = result ? ms(result.ttfbMs) : '—';
    bw.total.textContent = result ? ms(result.totalMs) : '—';
  };
}

$('bw-start-dl').addEventListener('click', (e) =>
  runBandwidth(e.currentTarget, () => runDownload(Number(bw.size.value), { token, onProgress: roundProgress(bw.down) })));

$('bw-start-ul').addEventListener('click', (e) =>
  runBandwidth(e.currentTarget, async () => {
    const mb = Number(bw.size.value);
    const show = roundProgress(bw.up);
    const result = await runUpload(mb, {
      token,
      onProgress: (p) => {
        show(p);
        if (p.result) {
          bw.upLast.textContent = `อัปโหลดล่าสุด ${p.result.mbps.toFixed(1)} Mbps`;
          bw.upLast.hidden = false;
        }
      },
    });
    largestUploadMb = Math.max(largestUploadMb, mb);
    return result;
  }));

$('bw-start-5x').addEventListener('click', (e) =>
  runBandwidth(e.currentTarget, async () => {
    bw.round.textContent = '';
    bw.five.textContent = '—';
    const { mbps } = await runParallel5({ token, onProgress: ({ fraction }) => setProgress(bw.progress, fraction) });
    bw.five.textContent = `${mbps.toFixed(1)} Mbps`;
  }));

// ---------- Caching ----------

const cache = {
  card: $('cache-card'),
  run: $('cache-run'),
  clear: $('cache-clear'),
  list: $('cache-list'),
  stats: $('cache-stats'),
  summary: $('cache-summary'),
  error: $('cache-error'),
};
const BADGE = {
  pass: ['badge--ok', 'ผ่าน'],
  fail: ['badge--fail', 'ไม่ผ่าน'],
  note: ['badge--note', 'บันทึก'],
};

function checkRow({ key, label }) {
  return h('li', { 'data-testid': `cache-row-${key}` },
    h('span', { class: 'badge badge--busy', 'aria-busy': 'true' }, 'กำลังตรวจ…'),
    h('div', { class: 'checks__text' }, h('p', { class: 'checks__name' }, label), h('p', { class: 'checks__detail' })),
  );
}

function fillRow({ key, result, detail }) {
  const li = cache.list.querySelector(`[data-testid="cache-row-${key}"]`);
  const [cls, text] = BADGE[result];
  li.querySelector('.badge').replaceWith(h('span', { class: `badge ${cls}` }, text));
  const textBox = li.querySelector('.checks__text');
  textBox.querySelector('.checks__detail').textContent = detail;
  if (key === 'etag') {
    // Spec §7 check 1 (browser cache) can only be confirmed by hand.
    textBox.append(h('p', { class: 'checks__detail' },
      h('a', { href: '/cache/static', target: '_blank', rel: 'noopener' }, 'เปิด /cache/static ซ้ำใน DevTools')));
  }
}

async function loadCacheStats() {
  try {
    const { data } = await api.request('GET', '/api/cache-stats');
    cache.stats.textContent = `hit ${data.hits} · miss ${data.misses}`;
  } catch {
    cache.stats.textContent = '';
  }
}

function setCacheBusy(busy) {
  cache.run.disabled = busy;
  cache.clear.disabled = busy;
  if (busy) cache.card.setAttribute('aria-busy', 'true');
  else cache.card.removeAttribute('aria-busy');
}

cache.run.addEventListener('click', async () => {
  showError(cache.error, '');
  setCacheBusy(true);
  cache.summary.textContent = '';
  cache.list.replaceChildren(...CHECKS.map(checkRow));
  try {
    const results = await runChecks({ token, onRow: fillRow });
    const passed = results.filter((r) => r.result === 'pass').length;
    cache.summary.textContent = `ผ่าน ${passed} จาก ${CHECKS.length} ข้อ`;
  } finally {
    setCacheBusy(false);
    loadCacheStats();
  }
});

cache.clear.addEventListener('click', async () => {
  showError(cache.error, '');
  if (!token) {
    showError(cache.error, TOKEN_MESSAGE);
    return;
  }
  setCacheBusy(true);
  try {
    await api.request('DELETE', '/api/cache');
  } catch (err) {
    showError(cache.error, err.kind === 'forbidden' ? TOKEN_MESSAGE : NETWORK_MESSAGE);
  } finally {
    setCacheBusy(false);
    loadCacheStats();
  }
});

loadCacheStats();

// ---------- API load test ----------

const load = {
  card: $('api-card'),
  endpoint: $('api-endpoint'),
  reqs: $('api-reqs'),
  conc: $('api-conc'),
  run: $('api-run'),
  progress: $('api-progress'),
  error: $('api-error'),
  errors: $('api-errors'),
  chart: $('api-chart'),
  hist: $('api-histogram'),
  axis: $('api-axis'),
  histRows: $('api-hist-rows'),
};
const stat = (name) => document.querySelector(`[data-testid="api-stat-${name}"]`);
let lastLoad = null;

load.endpoint.append(...ENDPOINTS.map((p) => h('option', { value: p }, p)));

function fieldError(input, text) {
  showError($(`${input.id}-error`), text);
  if (text) input.setAttribute('aria-invalid', 'true');
  else input.removeAttribute('aria-invalid');
}

const edge = (x) => String(Number(x.toFixed(1)));

function renderHistogram() {
  if (!lastLoad) return;
  const bins = desktopQuery.matches ? 10 : 8;
  const hg = histogram(lastLoad.latencies, bins);
  const max = Math.max(...hg.counts, 1);
  const width = hg.upper / bins;
  load.hist.setAttribute('aria-label', histogramSummary(hg));
  load.hist.replaceChildren(...hg.counts.map((count, i) => {
    const bar = h('div', { class: i >= bins - 2 ? 'histogram__bar histogram__bar--slow' : 'histogram__bar' });
    bar.style.setProperty('--pct', Math.round((count / max) * 100));
    return bar;
  }));
  load.axis.replaceChildren(...hg.labels.map((l) => h('span', {}, l)));
  load.histRows.replaceChildren(...hg.counts.map((count, i) => h('tr', {},
    h('td', {}, i === bins - 1 ? `${edge(i * width)}+` : `${edge(i * width)}–${edge((i + 1) * width)}`),
    h('td', {}, String(count)))));
  load.chart.hidden = false;
}

function renderStats(r) {
  stat('avg').textContent = ms(r.avg);
  stat('median').textContent = ms(r.median);
  stat('p95').textContent = ms(r.p95);
  stat('max').textContent = ms(r.max);
  stat('err').textContent = `${(r.errRate * 100).toFixed(1)}%`;
  stat('ok').textContent = String(r.ok);
  stat('rps').textContent = r.rps.toFixed(1);
  // app;dur is often under 1 ms, so it keeps one decimal.
  stat('server').textContent = r.serverAvg == null ? '—' : `${r.serverAvg.toFixed(1)} ms`;
  const errs = Object.entries(r.errorsByStatus).map(([status, n]) => `${status} × ${n}`);
  load.errors.textContent = errs.join(', ');
  load.errors.hidden = errs.length === 0;
}

load.run.addEventListener('click', async () => {
  showError(load.error, '');
  const { reqs, conc, errors } = clampInputs(Number(load.reqs.value.replace(/,/g, '')), Number(load.conc.value.replace(/,/g, '')));
  load.reqs.value = String(reqs);
  load.conc.value = String(conc);
  fieldError(load.reqs, errors.reqs);
  fieldError(load.conc, errors.conc);

  const path = load.endpoint.value;
  if (path.startsWith('/api/slow') && !token) {
    showError(load.error, TOKEN_MESSAGE);
    return;
  }

  load.run.disabled = true;
  load.card.setAttribute('aria-busy', 'true');
  load.progress.hidden = false;
  setProgress(load.progress, 0);
  const onProgress = (n, total) => {
    load.run.textContent = `${RUNNING} (${n}/${total})`;
    setProgress(load.progress, n / total);
  };
  onProgress(0, reqs);
  try {
    lastLoad = await runLoad({ path, reqs, conc, token, onProgress, bins: desktopQuery.matches ? 10 : 8 });
    renderStats(lastLoad);
    renderHistogram();
    if (lastLoad.errorsByStatus['403']) showError(load.error, TOKEN_MESSAGE);
  } finally {
    load.run.textContent = 'เริ่มทดสอบ';
    load.run.disabled = false;
    load.card.removeAttribute('aria-busy');
    load.progress.hidden = true;
  }
});

desktopQuery.addEventListener('change', renderHistogram);
