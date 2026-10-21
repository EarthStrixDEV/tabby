// Tabby list page: state store, data loading, rendering and the hash router.

import { createApi } from './lib/api.js';
import { lastPage } from './lib/pager.js';
import { h, svgIcon } from './ui/dom.js';
import {
  PER_PAGE, fillMobileSummary, fillDesktopSummary, renderFilter, renderList, renderListSkeleton,
  renderTable, renderTableSkeleton, renderEmpty, renderFilterEmpty, renderError, fillPager,
} from './ui/list.js';

const api = createApi();
const desktopQuery = matchMedia('(min-width: 900px)');

export const state = {
  filter: 'all', // 'all' | 'unpaid' | 'paid'
  page: 1,
  total: 0,
  rows: [],
  summary: null, // /api/summary body once loaded
  summaryError: false, // true when the last summary load failed (shows "—")
  loading: true, // list request in flight
  error: null, // ApiError of the last failed list load
  highlightId: null,
};

export function isDesktop() {
  return desktopQuery.matches;
}

// ---------- Mount points ----------

const main = document.getElementById('main');
const viewList = document.getElementById('view-list');
const viewForm = document.getElementById('view-form');
const mobileSummary = viewList.querySelector('section.summary');
const desktopSummary = viewList.querySelector('section.summary-cards');
const listBody = h('div', {});
const pager = h('nav', { class: 'pager', 'aria-label': 'เลือกหน้า', hidden: true });
viewList.append(listBody, pager);

// ---------- Query string (?paid=0|1&page=N) ----------

const PAID_PARAM = { unpaid: '0', paid: '1' };

function readQuery() {
  const q = new URLSearchParams(location.search);
  const paid = q.get('paid');
  state.filter = paid === '0' ? 'unpaid' : paid === '1' ? 'paid' : 'all';
  const page = q.get('page');
  state.page = page && /^[1-9]\d{0,5}$/.test(page) ? Number(page) : 1;
}

function writeQuery() {
  const q = new URLSearchParams(location.search);
  q.delete('paid');
  q.delete('page');
  if (PAID_PARAM[state.filter]) q.set('paid', PAID_PARAM[state.filter]);
  if (state.page > 1) q.set('page', String(state.page));
  const qs = q.toString();
  history.replaceState(history.state, '', `${location.pathname}${qs ? `?${qs}` : ''}${location.hash}`);
}

// ---------- Loading ----------

let listSeq = 0;
let summarySeq = 0;

export async function loadList() {
  const seq = ++listSeq;
  state.loading = true;
  state.error = null;
  render();
  const q = new URLSearchParams({ page: String(state.page), per_page: String(PER_PAGE) });
  if (PAID_PARAM[state.filter]) q.set('paid', PAID_PARAM[state.filter]);
  try {
    const { data } = await api.request('GET', `/api/debts?${q}`);
    if (seq !== listSeq) return; // a newer request superseded this one
    const last = lastPage(data.total, PER_PAGE);
    if (data.data.length === 0 && data.total > 0 && state.page > last) {
      // The page no longer exists (deep link or rows removed): step back to the last one.
      state.page = last;
      writeQuery();
      return loadList();
    }
    state.rows = data.data;
    state.total = data.total;
  } catch (err) {
    if (seq !== listSeq) return;
    state.error = err;
    state.rows = [];
  }
  state.loading = false;
  render();
}

export async function loadSummary() {
  const seq = ++summarySeq;
  try {
    const { data } = await api.request('GET', '/api/summary');
    if (seq !== summarySeq) return;
    state.summary = data;
    state.summaryError = false;
  } catch {
    if (seq !== summarySeq) return;
    state.summary = null;
    state.summaryError = true;
  }
  render();
}

// ---------- Actions ----------

function setFilter(filter) {
  state.filter = filter;
  state.page = 1;
  writeQuery();
  loadList();
}

function setPage(page) {
  state.page = page;
  writeQuery();
  loadList();
  if (listBody.getBoundingClientRect().top < 0) listBody.scrollIntoView({ block: 'start' });
}

function retry() {
  loadList();
  if (state.summaryError) loadSummary();
}

// Task 12 supplies the real toggle (optimistic PUT + toast) and delete (confirm dialog).
const noop = () => {};
const rowHandlers = { onToggle: noop, onDelete: noop };

// ---------- Rendering ----------

/** True only when the book holds no rows at all; then the filter and FAB are hidden. */
function isEmptyBook() {
  if (state.summary) return state.summary.count_all === 0;
  // Without a summary, fall back to an unfiltered list that came back empty.
  return !state.loading && !state.error && state.filter === 'all' && state.total === 0;
}

function content(desktop, emptyBook) {
  if (state.error) return renderError(state.error, { onRetry: retry });
  if (emptyBook) {
    const empty = renderEmpty();
    return desktop ? h('div', { class: 'table-wrap' }, empty) : empty;
  }
  if (state.loading) return desktop ? renderTableSkeleton() : renderListSkeleton();
  if (state.rows.length === 0) {
    const none = renderFilterEmpty(state.filter, {
      onShowAll: () => {
        setFilter('all');
        listBody.querySelector('[data-testid="filter-all"]')?.focus();
      },
    });
    return desktop ? h('div', { class: 'table-wrap' }, none) : none;
  }
  return desktop ? renderTable(state, rowHandlers) : renderList(state, rowHandlers);
}

// Re-rendering replaces nodes; remember which control had focus so it can be restored.
function focusSelector(el) {
  if (!el || !(listBody.contains(el) || pager.contains(el))) return null;
  const page = el.getAttribute('data-page');
  if (page) return `[data-page="${page}"]`;
  const testid = el.getAttribute('data-testid');
  if (!testid) return null;
  const rowId = el.closest('[data-id]')?.getAttribute('data-id');
  return rowId ? `[data-id="${rowId}"] [data-testid="${testid}"]` : `[data-testid="${testid}"]`;
}

function restoreFocus(selector, wasInPager) {
  if (!selector || viewList.contains(document.activeElement)) return;
  const target = viewList.querySelector(selector);
  if (target && target.tagName !== 'SPAN') {
    target.focus();
  } else if (wasInPager) {
    pager.querySelector('button')?.focus();
  }
}

export function render() {
  const desktop = isDesktop();
  const focused = document.activeElement;
  const selector = focusSelector(focused);
  const wasInPager = pager.contains(focused);

  if (state.loading) main.setAttribute('aria-busy', 'true');
  else main.removeAttribute('aria-busy');

  // Only the visible summary is filled so data-testids are never duplicated.
  if (desktop) {
    mobileSummary.replaceChildren();
    fillDesktopSummary(desktopSummary, state);
  } else {
    desktopSummary.replaceChildren();
    fillMobileSummary(mobileSummary, state);
  }

  const emptyBook = isEmptyBook();
  const parts = [content(desktop, emptyBook)];
  if (!emptyBook) {
    parts.unshift(renderFilter(state, { onFilter: setFilter }));
    if (!desktop) parts.push(h('a', { class: 'fab', href: '#/new', 'data-testid': 'fab-add' }, svgIcon('plus'), 'เพิ่มรายการ'));
  }
  listBody.replaceChildren(...parts);

  // The pager keeps its last content while loading so its live region is not reset.
  if (!state.loading) {
    const showPager = !state.error && !emptyBook && state.total > 0
      && (desktop || lastPage(state.total, PER_PAGE) > 1);
    pager.hidden = !showPager;
    if (showPager) fillPager(pager, state, { desktop, onPage: setPage });
  }

  restoreFocus(selector, wasInPager);
}

// ---------- Router ----------

let currentView = null;

function viewHeading(view) {
  if (view === 'list') return document.querySelector(isDesktop() ? '.page-head__title' : '.topbar__title');
  return viewForm.querySelector('h1');
}

function showView(view) {
  viewList.hidden = view !== 'list';
  viewForm.hidden = view !== 'form';
  if (currentView !== null && currentView !== view) viewHeading(view)?.focus();
  currentView = view;
}

/** '#/', '' and anything unknown show the list; '#/new' and '#/edit/{id}' are the form (Task 11). */
export function route() {
  const hash = location.hash;
  if (hash === '#/new' || /^#\/edit\/\d+$/.test(hash)) {
    // Task 11 opens the add/edit form here. Until then the list stays visible.
    showView('list');
    return;
  }
  showView('list');
}

// ---------- Boot ----------

readQuery();
desktopQuery.addEventListener('change', render);
window.addEventListener('hashchange', route);
route();
loadList();
loadSummary();
