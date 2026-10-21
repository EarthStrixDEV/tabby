// List view building blocks: summary, filter, mobile groups, desktop table, pager, states.
// Pure renderers: they read the state they are given and call back; app.js owns state and loading.

import { h, svgEl, svgIcon } from './dom.js';
import { formatBaht } from '../lib/money.js';
import { formatShortDate, groupLabel } from '../lib/dates.js';
import { initialOf, avatarVariant } from '../lib/avatar.js';
import { pageItems, rangeText, mobilePageText, lastPage } from '../lib/pager.js';

export const PER_PAGE = 20;

const FILTERS = [
  ['all', 'ทั้งหมด', 'count_all'],
  ['unpaid', 'ยังไม่จ่าย', 'count_unpaid'],
  ['paid', 'จ่ายแล้ว', 'count_paid'],
];

const DASH = '—';

const avatar = (name) => h('span', { class: `avatar avatar--${avatarVariant(name)}`, 'aria-hidden': 'true' }, initialOf(name));

const toggleLabel = (row) => (row.is_paid ? `ยกเลิกการจ่ายของ ${row.friend_name}` : `ทำเครื่องหมายว่า ${row.friend_name} จ่ายแล้ว`);

// ---------- Summary (DESIGN 4.1) ----------

function summaryValue(state, text) {
  if (state.summary) return text;
  if (state.summaryError) return DASH;
  return h('span', { class: 'skeleton skeleton--value' });
}

/** Fills the mobile dark card: total + sub-line. */
export function fillMobileSummary(section, state) {
  const s = state.summary;
  let sub = null;
  if (s) {
    sub = s.count_unpaid === 0 ? 'ยังไม่มีใครติดเงิน' : `เพื่อน ${s.count_friends_unpaid} คน ยังไม่จ่าย ${s.count_unpaid} รายการ`;
  } else if (!state.summaryError) {
    sub = h('span', { class: 'skeleton skeleton--text' });
  }
  section.replaceChildren(
    h('p', { class: 'summary__label' }, 'ยอดค้างรวม'),
    h('p', { class: 'summary__value', 'data-testid': 'summary-total' }, summaryValue(state, s && formatBaht(s.total_unpaid))),
  );
  if (sub) section.appendChild(h('p', { class: 'summary__sub', 'data-testid': 'summary-sub' }, sub));
}

/** Fills the three desktop cards. */
export function fillDesktopSummary(section, state) {
  const s = state.summary;
  const card = (label, value, extra = {}) =>
    h('div', { class: extra.dark ? 'summary on-dark' : 'summary' },
      h('p', { class: 'summary__label' }, label),
      h('p', { class: 'summary__value', 'data-testid': extra.testid }, summaryValue(state, value)));
  section.replaceChildren(
    card('ยอดค้างรวม', s && formatBaht(s.total_unpaid), { dark: true, testid: 'summary-total' }),
    card('เพื่อนที่ติดเงิน', s && `${s.count_friends_unpaid} คน`),
    card('รายการค้างจ่าย', s && `${s.count_unpaid} รายการ`),
  );
}

// ---------- Segmented filter (DESIGN 4.2) ----------

export function renderFilter(state, { onFilter }) {
  return h('div', { class: 'seg', role: 'group', 'aria-label': 'กรองรายการ' },
    FILTERS.map(([key, label, countKey]) =>
      h('button', {
        type: 'button', class: 'seg__btn', 'aria-pressed': String(state.filter === key),
        'data-filter': key, 'data-testid': `filter-${key}`,
        onClick: () => onFilter(key),
      }, state.summary ? [`${label} `, h('span', { 'data-count': key }, String(state.summary[countKey]))] : label)));
}

// ---------- Mobile grouped list (DESIGN 4.3, 4.4) ----------

function debtRow(row, state, onToggle) {
  const paid = Boolean(row.is_paid);
  const cls = ['debt', paid && 'is-paid', row.id === state.highlightId && 'is-highlight'].filter(Boolean).join(' ');
  return h('li', { class: cls, 'data-testid': 'debt-row', 'data-id': row.id },
    h('a', { class: 'debt__main', href: `#/edit/${row.id}` },
      avatar(row.friend_name),
      h('span', { class: 'debt__text' },
        h('span', { class: 'debt__name', 'data-testid': 'debt-name' }, row.friend_name),
        row.note ? h('span', { class: 'debt__note' }, row.note) : null),
      h('span', { class: 'debt__amount', 'data-testid': 'debt-amount' }, formatBaht(row.amount))),
    h('button', {
      type: 'button', class: 'check-btn', 'data-testid': 'check-btn',
      'aria-pressed': String(paid), 'aria-label': toggleLabel(row),
      onClick: () => onToggle(row),
    }, svgIcon('check')));
}

/** Mobile list: rows grouped under day headings (rows arrive newest first). */
// Takes { onToggle, onDelete } like renderTable; onDelete is unused because mobile rows have
// no delete control, deleting goes through the edit view (DESIGN G3).
export function renderList(state, { onToggle }) {
  const now = new Date();
  const wrap = h('div', {});
  let list = null;
  let current = null;
  for (const row of state.rows) {
    const label = groupLabel(row.created_at, now);
    if (label !== current) {
      current = label;
      list = h('ul', { class: 'debt-list' });
      wrap.appendChild(h('div', { class: 'debt-group' }, h('h2', {}, label), list));
    }
    list.appendChild(debtRow(row, state, onToggle));
  }
  return wrap;
}

export function renderListSkeleton() {
  const item = () =>
    h('li', { class: 'debt' },
      h('span', { class: 'debt__main' },
        h('span', { class: 'skeleton skeleton--avatar' }),
        h('span', { class: 'debt__text' }, h('span', { class: 'skeleton skeleton--text' }), h('span', { class: 'skeleton skeleton--text' })),
        h('span', { class: 'skeleton skeleton--amount' })));
  return h('div', { class: 'debt-group', 'aria-hidden': 'true' },
    h('ul', { class: 'debt-list' }, Array.from({ length: 5 }, item)));
}

// ---------- Desktop table (DESIGN 4.16) ----------

function tableHead() {
  return h('thead', {},
    h('tr', {},
      h('th', { scope: 'col' }, 'เพื่อน'),
      h('th', { scope: 'col' }, 'โน้ต'),
      h('th', { scope: 'col', class: 'debts-table__num' }, 'จำนวน'),
      h('th', { scope: 'col' }, 'วันที่'),
      h('th', { scope: 'col' }, 'สถานะ'),
      h('th', { scope: 'col', class: 'debts-table__actions' }, h('span', { class: 'sr-only' }, 'จัดการ'))));
}

function tableRow(row, state, onToggle, onDelete) {
  const paid = Boolean(row.is_paid);
  const name = row.friend_name;
  return h('tr', { class: row.id === state.highlightId ? 'is-highlight' : null, 'data-testid': 'debt-row', 'data-id': row.id },
    h('td', {}, h('div', { class: 'debts-table__friend' }, avatar(name), h('span', { 'data-testid': 'debt-name' }, name))),
    h('td', { class: 'debts-table__muted' }, row.note ?? ''),
    h('td', { class: 'debts-table__num', 'data-testid': 'debt-amount' }, formatBaht(row.amount)),
    h('td', { class: 'debts-table__date' }, formatShortDate(row.created_at)),
    h('td', {}, h('span', { class: paid ? 'pill pill--paid' : 'pill pill--unpaid' }, paid ? 'จ่ายแล้ว' : 'ยังไม่จ่าย')),
    h('td', { class: 'debts-table__actions' },
      h('button', {
        type: 'button', class: 'btn btn--text btn--text-ok', 'data-testid': 'check-btn',
        'aria-label': toggleLabel(row), onClick: () => onToggle(row),
      }, paid ? 'ยกเลิกจ่าย' : 'จ่ายแล้ว'),
      h('a', { class: 'btn btn--text', href: `#/edit/${row.id}`, 'aria-label': `แก้ไขรายการของ${name}` }, 'แก้ไข'),
      h('button', {
        type: 'button', class: 'btn btn--text btn--text-danger', 'aria-label': `ลบรายการของ${name}`,
        onClick: () => onDelete(row),
      }, 'ลบ')));
}

/** Desktop table, newest first, no column sorting. */
export function renderTable(state, { onToggle, onDelete }) {
  return h('div', { class: 'table-wrap' },
    h('table', { class: 'debts-table' },
      h('caption', { class: 'sr-only' }, 'รายการหนี้'),
      tableHead(),
      h('tbody', {}, state.rows.map((row) => tableRow(row, state, onToggle, onDelete)))));
}

export function renderTableSkeleton() {
  const cell = (cls, inner) => h('td', { class: cls }, inner);
  const bar = () => h('span', { class: 'skeleton skeleton--text' });
  const row = () =>
    h('tr', {},
      cell(null, h('div', { class: 'debts-table__friend' }, h('span', { class: 'skeleton skeleton--avatar' }), bar())),
      cell(null, bar()),
      cell('debts-table__num', h('span', { class: 'skeleton skeleton--amount' })),
      cell(null, bar()),
      cell(null, bar()),
      cell('debts-table__actions', bar()));
  return h('div', { class: 'table-wrap', 'aria-hidden': 'true' },
    h('table', { class: 'debts-table' }, tableHead(), h('tbody', {}, Array.from({ length: 8 }, row))));
}

// ---------- Empty, filter-empty and error states (DESIGN 4.10, 5.1) ----------

function emptyArt() {
  // Colours follow DESIGN 4.10; the spine takes --accent through currentColor (see .empty > svg).
  return svgEl('svg', { viewBox: '0 0 180 150', role: 'img', 'aria-label': 'สมุดจดเปล่าพร้อมดินสอ' },
    svgEl('ellipse', { cx: 90, cy: 134, rx: 62, ry: 8, fill: '#F0E7DA' }),
    svgEl('rect', { x: 40, y: 18, width: 92, height: 112, rx: 12, fill: '#FFFFFF', stroke: '#D9CBB6', 'stroke-width': 3 }),
    svgEl('rect', { x: 40, y: 18, width: 16, height: 112, rx: 8, fill: 'currentColor' }),
    svgEl('rect', { x: 68, y: 42, width: 48, height: 6, rx: 3, fill: '#F0E7DA' }),
    svgEl('rect', { x: 68, y: 60, width: 36, height: 6, rx: 3, fill: '#F0E7DA' }),
    svgEl('rect', { x: 68, y: 78, width: 44, height: 6, rx: 3, fill: '#F0E7DA' }),
    svgEl('g', { transform: 'rotate(35 140 90)' },
      svgEl('rect', { x: 134, y: 48, width: 14, height: 70, rx: 3, fill: '#E0A030' }),
      svgEl('path', { d: 'M134 118h14l-7 14z', fill: '#2B2118' }),
      svgEl('rect', { x: 134, y: 48, width: 14, height: 10, rx: 3, fill: '#D0584E' })));
}

/** Nothing recorded at all (count_all === 0). */
export function renderEmpty() {
  return h('div', { class: 'empty' },
    emptyArt(),
    h('h2', {}, 'สมุดยังว่างอยู่'),
    h('p', {}, 'เริ่มจดว่าใครยืมเงินไปเท่าไหร่ จะได้ไม่ต้องจำเอง'),
    h('a', { class: 'btn btn--primary btn--lg btn--icon-lead', href: '#/new' }, svgIcon('plus'), 'เพิ่มรายการ'));
}

/** The active filter matched nothing, but the book has rows. */
export function renderFilterEmpty(filter, { onShowAll }) {
  return h('div', { class: 'empty' },
    h('p', {}, filter === 'paid' ? 'ไม่มีรายการจ่ายแล้ว' : 'ไม่มีรายการยังไม่จ่าย'),
    h('button', { type: 'button', class: 'btn btn--text', onClick: onShowAll }, 'ดูทั้งหมด'));
}

export function errorMessage(err) {
  if (err && err.kind === 'rate_limited' && Number.isFinite(err.retryAfter)) {
    return `ส่งคำขอถี่เกินไป รอ ${err.retryAfter} วินาที`;
  }
  return 'โหลดรายการไม่สำเร็จ';
}

export function renderError(err, { onRetry }) {
  return h('div', { class: 'empty', role: 'alert' },
    h('h2', {}, errorMessage(err)),
    h('button', { type: 'button', class: 'btn btn--secondary', onClick: onRetry }, 'ลองใหม่'));
}

// ---------- Pager (DESIGN 4.17) ----------

function step(testid, label, page, enabled, onPage) {
  if (!enabled) return h('span', { class: 'pager__step', 'aria-disabled': 'true', 'data-testid': testid }, label);
  return h('button', { type: 'button', class: 'pager__step', 'data-testid': testid, onClick: () => onPage(page) }, label);
}

/**
 * Updates a persistent <nav class="pager">. Its status <p> is kept across updates so
 * aria-live announces the new range instead of a freshly inserted node.
 */
export function fillPager(nav, state, { desktop, onPage }) {
  const last = lastPage(state.total, PER_PAGE);
  let status = nav.querySelector('.pager__status');
  if (!status) {
    status = h('p', { class: 'pager__status', 'aria-live': 'polite' });
    nav.prepend(status);
  }
  status.textContent = desktop ? rangeText(state.page, PER_PAGE, state.total) : mobilePageText(state.page, last);

  const items = [step('pager-prev', 'ก่อนหน้า', state.page - 1, state.page > 1, onPage)];
  if (desktop) {
    for (const item of pageItems(state.page, last)) {
      if (item === '…') {
        items.push(h('span', { class: 'pager__gap', 'aria-hidden': 'true' }, '…'));
      } else if (item === state.page) {
        items.push(h('span', { class: 'pager__page', 'aria-current': 'page', 'data-page': item }, String(item)));
      } else {
        items.push(h('button', {
          type: 'button', class: 'pager__page', 'data-page': item, 'aria-label': `หน้า ${item}`,
          onClick: () => onPage(item),
        }, String(item)));
      }
    }
  }
  items.push(step('pager-next', 'ถัดไป', state.page + 1, state.page < last, onPage));

  let navList = nav.querySelector('.pager__nav');
  if (!navList) {
    navList = h('div', { class: 'pager__nav' });
    nav.appendChild(navList);
  }
  navList.replaceChildren(...items);
}
