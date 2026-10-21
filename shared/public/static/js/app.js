// Tabby list page: state store, data loading, rendering, the add/edit form routes and the toast.

import { createApi } from './lib/api.js';
import { lastPage } from './lib/pager.js';
import { h, svgIcon } from './ui/dom.js';
import { openDialog } from './ui/dialog.js';
import { renderForm, hasFieldErrors } from './ui/form.js';
import { confirmDelete, closeConfirm } from './ui/confirm.js';
import { formatBaht } from './lib/money.js';
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
  busyIds: new Set(), // rows whose paid toggle is in flight
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

/**
 * Loads the current page. { silent: true } keeps the rows on screen instead of the skeleton
 * (refreshes after a toggle or delete).
 */
export async function loadList({ silent = false } = {}) {
  const seq = ++listSeq;
  if (!silent) {
    state.loading = true;
    state.error = null;
    render();
  }
  const q = new URLSearchParams({ page: String(state.page), per_page: String(PER_PAGE) });
  if (PAID_PARAM[state.filter]) q.set('paid', PAID_PARAM[state.filter]);
  try {
    const { data } = await api.request('GET', `/api/debts?${q}`);
    if (seq !== listSeq) return; // a newer request superseded this one
    if (data.data.length === 0 && state.page > 1) {
      if (data.total > 0) {
        // The page no longer exists (deep link or rows removed): step back to the last one.
        state.page = lastPage(data.total, PER_PAGE);
        writeQuery();
        return loadList({ silent });
      }
      state.page = 1; // nothing at all: page 1 is the only page
      writeQuery();
    }
    state.rows = data.data;
    state.total = data.total;
    state.error = null;
    // The book emptied behind a stale summary: refresh it so the counts and cards agree.
    if (state.filter === 'all' && data.total === 0 && state.summary?.count_all > 0) loadSummary();
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

const noop = () => {};

/** After a toggle, undo or delete: the server owns the totals, and a filtered page may change. */
function refreshAfterChange() {
  loadSummary();
  if (state.filter !== 'all') loadList({ silent: true });
}

function replaceRow(row) {
  const i = state.rows.findIndex((r) => r.id === row.id);
  if (i !== -1) state.rows[i] = row;
}

/**
 * PUT `row` with is_paid = isPaid (Update replaces the whole row). The row on screen flips at once
 * and its button is busy; on failure it is put back as it was. Resolves to the saved row.
 */
async function putPaid(row, isPaid) {
  const before = state.rows.find((r) => r.id === row.id);
  state.busyIds.add(row.id);
  if (before) replaceRow({ ...before, is_paid: isPaid });
  render();
  try {
    const { data } = await api.request('PUT', `/api/debts/${row.id}`, {
      json: { friend_name: row.friend_name, amount: row.amount, note: row.note, is_paid: isPaid },
    });
    replaceRow(data);
    return data;
  } catch (err) {
    if (before) replaceRow(before);
    throw err;
  } finally {
    state.busyIds.delete(row.id);
    render();
  }
}

/** A failed toggle or undo: 404 means the row is gone (refresh quietly), anything else offers a retry. */
function paidFailed(err, retry) {
  if (err.kind === 'not_found') {
    loadList({ silent: true });
    loadSummary();
    return;
  }
  showToast({ text: saveErrorText(err), actionLabel: 'ลองใหม่', onAction: retry });
}

/** Undo of one toast: restores is_paid of the row captured in that toast only (Review Focus 4b). */
async function undoToggle(row, wasPaid) {
  if (state.busyIds.has(row.id)) return;
  try {
    await putPaid(row, wasPaid);
  } catch (err) {
    paidFailed(err, () => undoToggle(row, wasPaid));
    return;
  }
  refreshAfterChange();
}

/** Mark paid / un-pay (DESIGN 4.4, F2). Only paid gets the undo toast; un-pay just updates. */
export async function toggleDebt(debt) {
  if (state.busyIds.has(debt.id)) return;
  const original = state.rows.find((r) => r.id === debt.id) ?? debt;
  const wasPaid = original.is_paid ? 1 : 0;
  let saved;
  try {
    saved = await putPaid(original, wasPaid ? 0 : 1);
  } catch (err) {
    paidFailed(err, () => toggleDebt(original));
    return;
  }
  if (!wasPaid) {
    showToast({
      text: `${saved.friend_name} จ่ายแล้ว ${formatBaht(saved.amount)}`,
      actionLabel: 'เลิกทำ',
      onAction: () => undoToggle(saved, wasPaid),
    });
  }
  refreshAfterChange();
}

/**
 * DELETE the row (DESIGN 4.7, F3); runs inside the confirm, which shows "กำลังลบ…" meanwhile.
 * 204 and 404 close every dialog, leave the edit view for '#/', move focus to the list heading
 * (the row and its buttons are about to go) and reload. Other failures toast and rethrow, so
 * the confirm stays open.
 */
export async function deleteDebt(debt) {
  const fromEdit = formSession !== null;
  let gone = false;
  try {
    await api.request('DELETE', `/api/debts/${debt.id}`);
  } catch (err) {
    if (err.kind !== 'not_found') {
      showToast({ text: saveErrorText(err) });
      throw err;
    }
    gone = true; // already deleted elsewhere: just refresh
  }
  closeConfirm();
  if (fromEdit) {
    closeForm();
    location.replace('#/');
    showView('list');
  }
  viewHeading('list')?.focus();
  if (state.highlightId === debt.id) state.highlightId = null;
  loadList({ silent: true }); // steps back a page if this one is now empty
  loadSummary();
  if (!gone) showToast({ text: `ลบรายการของ${debt.friend_name}แล้ว` });
}

/** Opens the delete confirm: from the edit form ("ลบรายการนี้") or the desktop row's "ลบ". */
export async function requestDelete(debt) {
  clearTimeout(highlightTimer);
  state.highlightId = debt.id; // the target row behind the dialog (DESIGN 4.7)
  render();
  await confirmDelete(debt, { desktop: isDesktop(), onConfirm: () => deleteDebt(debt) });
  if (state.highlightId === debt.id) {
    state.highlightId = null;
    render();
  }
}

const rowHandlers = { onToggle: toggleDebt, onDelete: requestDelete };

// ---------- Rendering ----------

/** True only when the book holds no rows at all; then the filter and FAB are hidden. */
function isEmptyBook() {
  if (state.summary?.count_all === 0) return true;
  // An unfiltered list that came back empty is an empty book too, even while a stale summary
  // (count_all > 0) is being reloaded: "ทั้งหมด" never shows the filter-empty text.
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

// A busy (disabled) toggle cannot hold focus; its selector waits here until the button is enabled.
let pendingFocus = null;

export function render() {
  const desktop = isDesktop();
  const focused = document.activeElement;
  const lostFocus = !focused || focused === document.body;
  const selector = focusSelector(focused) ?? (lostFocus ? pendingFocus : null);
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
  const target = selector && viewList.querySelector(selector);
  pendingFocus = target && target.disabled && document.activeElement !== target ? selector : null;
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
  closeConfirm(); // e.g. Back with the delete sheet open over the mobile form view
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
