// Tabby list page: state store, data loading, rendering, the add/edit form routes and the toast.

import { createApi } from './lib/api.js';
import { lastPage } from './lib/pager.js';
import { h, svgIcon } from './ui/dom.js';
import { openDialog } from './ui/dialog.js';
import { renderForm, hasFieldErrors } from './ui/form.js';
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
const topbar = document.querySelector('.app > .topbar');
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

// ---------- TASK 12 SEAM: delete from the edit form ----------
// "ลบรายการนี้" in the edit form calls this. Task 12 replaces the body with the delete-confirm
// dialog (openDialog kind 'sheet', stacked over the desktop edit modal). Until then it does nothing.
export function requestDelete(debt) {}
// ---------- END TASK 12 SEAM ----------

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

// ---------- Toast (DESIGN 4.5) ----------

const TOAST_MS = 5000;
// One persistent live region: replacing its content is what gets announced.
const toast = h('div', { class: 'toast', role: 'status', 'data-testid': 'toast' });
document.getElementById('toast-root').appendChild(toast);
let toastTimer = null;
let toastRemaining = 0;
let toastStartedAt = 0;
let toastHovered = false;
let toastFocused = false;

function closeToast() {
  clearTimeout(toastTimer);
  toastTimer = null;
  toast.replaceChildren();
  toastFocused = false;
}

function resumeToast() {
  if (toastTimer || toastHovered || toastFocused || !toast.hasChildNodes()) return;
  toastStartedAt = Date.now();
  toastTimer = setTimeout(closeToast, toastRemaining);
}

function pauseToast() {
  if (!toastTimer) return;
  clearTimeout(toastTimer);
  toastTimer = null;
  toastRemaining = Math.max(0, toastRemaining - (Date.now() - toastStartedAt));
}

toast.addEventListener('mouseenter', () => { toastHovered = true; pauseToast(); });
toast.addEventListener('mouseleave', () => { toastHovered = false; resumeToast(); });
toast.addEventListener('focusin', () => { toastFocused = true; pauseToast(); });
toast.addEventListener('focusout', (event) => {
  if (toast.contains(event.relatedTarget)) return;
  toastFocused = false;
  resumeToast();
});

/** A new toast replaces the old one. It closes after 5 s, paused while hovered or focused. */
export function showToast({ text, actionLabel, onAction }) {
  clearTimeout(toastTimer);
  toastTimer = null;
  const parts = [h('span', {}, text)];
  if (actionLabel) {
    parts.push(h('button', {
      type: 'button', class: 'toast__action', 'data-testid': 'toast-undo',
      onClick: () => { closeToast(); onAction?.(); },
    }, actionLabel));
  }
  toast.replaceChildren(...parts);
  toastFocused = toast.contains(document.activeElement);
  toastRemaining = TOAST_MS;
  resumeToast();
}

// ---------- Add/edit form (mobile view, desktop modal) ----------

const HIGHLIGHT_MS = 1500;
let highlightTimer = null;
let formSession = null; // { hash, desktop, routed, close() } of the open form
let routeSeq = 0;

/** Up to 4 unique friend names from the loaded rows, most recent first (DESIGN 4.9). */
function recentNames() {
  const names = [];
  for (const row of state.rows) {
    if (!names.includes(row.friend_name)) names.push(row.friend_name);
    if (names.length === 4) break;
  }
  return names;
}

function saveErrorText(err) {
  if (err.kind === 'rate_limited' && Number.isFinite(err.retryAfter)) return `ส่งคำขอถี่เกินไป รอ ${err.retryAfter} วินาที`;
  return 'ทำรายการไม่สำเร็จ ลองอีกครั้ง';
}

async function saveForm(opts, payload, session) {
  const editing = opts.mode === 'edit';
  let row;
  try {
    const res = editing
      ? await api.request('PUT', `/api/debts/${opts.debt.id}`, { json: payload })
      : await api.request('POST', '/api/debts', { json: payload });
    row = res.data;
  } catch (err) {
    if (editing && err.kind === 'not_found') {
      // Deleted elsewhere meanwhile: back to the refreshed list, like a stale deep link.
      location.replace('#/');
      loadList();
      loadSummary();
      return;
    }
    // A 422 the form cannot show under a field still needs feedback.
    if (err.kind !== 'validation' || !hasFieldErrors(err.fields)) showToast({ text: saveErrorText(err) });
    throw err; // the form maps a 422 under its fields
  }

  // replace, not push: browser Back must never reopen the form that was just saved.
  if (session.desktop) session.close(); // its onClose replaces the hash with '#/'
  else location.replace('#/');
  if (!editing) {
    state.filter = 'all';
    state.page = 1;
    writeQuery();
    showToast({ text: `เพิ่มรายการของ${row.friend_name}แล้ว` });
  }
  state.highlightId = row.id;
  clearTimeout(highlightTimer);
  await Promise.all([loadList(), loadSummary()]);
  if (!editing) window.scrollTo(0, 0);
  // The table re-rendered, so the edit link that opened the modal is a new node: focus that one.
  if (editing && session.desktop) listBody.querySelector(`[data-id="${row.id}"] a[href="#/edit/${row.id}"]`)?.focus();
  highlightTimer = setTimeout(() => {
    if (state.highlightId !== row.id) return;
    state.highlightId = null;
    render();
  }, HIGHLIGHT_MS);
}

function openForm(opts, hash, desktop) {
  const session = { hash, desktop, routed: false, close: noop };
  const el = renderForm({
    ...opts,
    friendNames: desktop ? [] : recentNames(),
    desktop,
    onSubmit: (payload) => saveForm(opts, payload, session),
    // Desktop: ×/ยกเลิก close the modal. Mobile: the back and ยกเลิก links leave the view.
    onCancel: () => (desktop ? session.close() : location.replace('#/')),
    onDelete: () => requestDelete(opts.debt),
  });
  formSession = session;
  if (desktop) {
    showView('list');
    const dialog = openDialog(el, {
      kind: 'modal',
      initialFocus: el.querySelector('[data-testid="input-friend"]'),
      onClose: () => {
        if (formSession === session) formSession = null;
        // ×, ยกเลิก, Esc, scrim or a successful save. replace: Back must not reopen the modal.
        if (!session.routed) location.replace('#/');
      },
    });
    session.close = dialog.close;
  } else {
    const replacing = currentView === 'form';
    viewForm.replaceChildren(el);
    session.close = () => viewForm.replaceChildren();
    showView('form', replacing);
  }
}

/** Closes the open form because the route changed (no extra hash change). */
function closeForm() {
  const session = formSession;
  formSession = null;
  if (!session) return;
  session.routed = true;
  session.close();
}

// ---------- Router ----------

const FORM_ROUTE = /^#\/(?:new|edit\/(\d+))$/;
let currentView = null;

function viewHeading(view) {
  if (view === 'list') return document.querySelector(isDesktop() ? '.page-head__title' : '.topbar__title');
  return viewForm.querySelector('h1');
}

function showView(view, refocus = false) {
  viewList.hidden = view !== 'list';
  viewForm.hidden = view !== 'form';
  topbar.hidden = view === 'form'; // the mobile form view brings its own back-link header
  if ((currentView !== null && currentView !== view) || refocus) viewHeading(view)?.focus();
  currentView = view;
}

/**
 * '#/', '' and anything unknown show the list. '#/new' and '#/edit/{id}' open the form:
 * a full view on mobile, a modal over the list on desktop.
 */
export function route() {
  const hash = location.hash;
  const match = FORM_ROUTE.exec(hash);
  if (!match) {
    routeSeq++; // drops a pending edit fetch
    closeForm();
    showView('list');
    return;
  }
  const desktop = isDesktop();
  if (formSession && formSession.hash === hash && formSession.desktop === desktop) return;
  const seq = ++routeSeq;
  closeForm();
  if (!match[1]) {
    openForm({ mode: 'new' }, hash, desktop);
    return;
  }
  const id = Number(match[1]);
  const loaded = state.rows.find((row) => row.id === id);
  if (loaded) {
    openForm({ mode: 'edit', debt: loaded }, hash, desktop);
    return;
  }
  // Deep link or refresh: the row is not on the loaded page, so fetch it (Review Focus 3).
  api.request('GET', `/api/debts/${id}`).then(({ data }) => {
    if (seq === routeSeq) openForm({ mode: 'edit', debt: data }, hash, isDesktop());
  }, (err) => {
    if (seq !== routeSeq) return;
    location.replace('#/');
    // 404: the row is gone, so just the refreshed list. Anything else (500, 429, network) also says so.
    if (err.kind !== 'not_found') showToast({ text: saveErrorText(err) });
    // On a cold deep link the boot load is still in flight; only reload an already loaded list.
    if (!state.loading) loadList();
  });
}

// ---------- Boot ----------

readQuery();
desktopQuery.addEventListener('change', () => {
  render();
  if (formSession) route(); // moves the open form between the mobile view and the desktop modal
});
window.addEventListener('hashchange', route);
route();
loadList();
loadSummary();
