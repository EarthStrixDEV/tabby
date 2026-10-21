// Add/edit debt form (DESIGN 4.8, 4.9, 4.18, 5.2, 5.7).
// Mobile: a full view with chips and a sticky action bar. Desktop: the body of a modal, no chips.

import { h, svgIcon } from './dom.js';
import { addBaht, parseAmountInput } from '../lib/money.js';

const AMOUNT_CHIPS = [50, 100, 500, 1000];
const FIELD_ORDER = ['friend_name', 'amount', 'note'];

const MSG_NAME = 'กรอกชื่อเพื่อน';
const MSG_AMOUNT = 'กรอกจำนวนเงินเป็นตัวเลข เช่น 150';

// "180.00" -> "180", "150.50" stays.
const amountForInput = (amount) => String(amount).replace(/\.00$/, '');

function field({ id, key, testid, label, optional, input, after }) {
  const error = h('p', { id: `${id}-err`, class: 'field__error', 'data-testid': `error-${testid}`, hidden: true });
  const wrap = h('div', { class: 'field' },
    h('label', { class: 'field__label', for: id }, label, optional ? [' ', h('span', { class: 'field__optional' }, optional)] : null),
    input,
    error,
    after);
  return { key, wrap, input, error };
}

/**
 * renderForm({ mode, debt, friendNames, desktop, onSubmit, onCancel, onDelete }) -> HTMLElement
 * onSubmit(payload) returns a promise; a rejection with kind 'validation' maps err.fields under the inputs.
 */
export function renderForm({ mode, debt, friendNames = [], desktop, onSubmit, onCancel, onDelete }) {
  const editing = mode === 'edit';
  const title = editing ? 'แก้ไขรายการ' : 'เพิ่มรายการ';

  const friendInput = h('input', {
    id: 'debt-friend', class: 'field__input', name: 'friend_name', type: 'text', maxlength: 100,
    autocomplete: 'off', 'data-testid': 'input-friend',
  });
  const amountInput = h('input', {
    id: 'debt-amount', class: 'field__input field__input--amount', name: 'amount', type: 'text',
    inputmode: 'decimal', placeholder: '0', autocomplete: 'off', 'data-testid': 'input-amount',
  });
  const noteInput = h('input', {
    id: 'debt-note', class: 'field__input', name: 'note', type: 'text', maxlength: 255,
    placeholder: 'เช่น ค่าข้าวเที่ยง', autocomplete: 'off', 'data-testid': 'input-note',
  });
  if (editing) {
    friendInput.value = debt.friend_name;
    amountInput.value = amountForInput(debt.amount);
    noteInput.value = debt.note ?? '';
  }

  const nameChips = !desktop && friendNames.length > 0
    ? h('div', { class: 'chips' }, friendNames.map((name) =>
      h('button', {
        type: 'button', class: 'chip',
        onClick: () => {
          friendInput.value = name;
          clearError(fields.friend_name);
          amountInput.focus();
        },
      }, name)))
    : null;
  const amountChips = desktop ? null : h('div', { class: 'chips chips--fill' }, AMOUNT_CHIPS.map((baht) =>
    h('button', {
      type: 'button', class: 'chip',
      onClick: () => {
        amountInput.value = addBaht(amountInput.value, baht);
        clearError(fields.amount);
      },
    }, `+${baht}`)));

  const fields = {};
  for (const f of [
    field({ id: 'debt-friend', key: 'friend_name', testid: 'friend', label: 'ใครยืม', input: friendInput, after: nameChips }),
    field({ id: 'debt-amount', key: 'amount', testid: 'amount', label: 'จำนวนเงิน (บาท)', input: amountInput, after: amountChips }),
    field({ id: 'debt-note', key: 'note', testid: 'note', label: 'โน้ต', optional: '(ไม่ใส่ก็ได้)', input: noteInput }),
  ]) {
    fields[f.key] = f;
    f.input.addEventListener('input', () => clearError(f));
  }

  function setError(f, message) {
    f.error.textContent = message;
    f.error.hidden = false;
    f.wrap.classList.add('is-invalid');
    f.input.setAttribute('aria-invalid', 'true');
    f.input.setAttribute('aria-describedby', f.error.id);
  }

  function clearError(f) {
    if (f.error.hidden) return;
    f.error.hidden = true;
    f.error.textContent = '';
    f.wrap.classList.remove('is-invalid');
    f.input.removeAttribute('aria-invalid');
    f.input.removeAttribute('aria-describedby');
  }

  /** errors: { friend_name?, amount?, note? } -> shows them and focuses the first invalid field. */
  function showErrors(errors) {
    let first = null;
    for (const key of FIELD_ORDER) {
      if (typeof errors[key] === 'string' && errors[key] !== '') {
        setError(fields[key], errors[key]);
        first ??= fields[key].input;
      } else {
        clearError(fields[key]);
      }
    }
    first?.focus();
    return first !== null;
  }

  const saveBtn = h('button', {
    type: 'submit', class: desktop ? 'btn btn--primary btn--md' : 'btn btn--primary btn--lg btn--block', 'data-testid': 'btn-save',
  }, 'บันทึก');
  const deleteBtn = editing
    ? h('button', { type: 'button', class: 'btn btn--text btn--text-danger btn--block', onClick: () => onDelete() }, 'ลบรายการนี้')
    : null;

  let busy = false;
  function setBusy(on) {
    busy = on;
    saveBtn.disabled = on;
    saveBtn.textContent = on ? 'กำลังบันทึก…' : 'บันทึก';
  }

  async function submit(event) {
    event.preventDefault();
    if (busy) return;
    const name = friendInput.value.trim();
    const amount = parseAmountInput(amountInput.value);
    const clientErrors = {};
    if (name === '') clientErrors.friend_name = MSG_NAME;
    if (!amount.ok) clientErrors.amount = MSG_AMOUNT;
    if (showErrors(clientErrors)) return;

    setBusy(true);
    try {
      await onSubmit({
        friend_name: name,
        amount: amount.value,
        note: noteInput.value.trim() || null,
        is_paid: editing ? debt.is_paid : 0,
      });
    } catch (err) {
      if (err && err.kind === 'validation') showErrors(err.fields ?? {});
    } finally {
      if (form.isConnected) setBusy(false);
    }
  }

  const body = [fields.friend_name.wrap, fields.amount.wrap, fields.note.wrap];
  let form;

  if (desktop) {
    form = h('form', { 'aria-labelledby': 'debt-form-title', novalidate: true, onSubmit: submit },
      h('div', { class: 'modal__head' },
        h('h2', { id: 'debt-form-title', class: 'modal__title' }, title),
        h('button', { type: 'button', class: 'icon-btn modal__close', 'aria-label': 'ปิด', onClick: () => onCancel() }, svgIcon('close'))),
      body,
      h('div', { class: 'modal__actions' },
        saveBtn,
        h('button', { type: 'button', class: 'btn btn--secondary btn--md', 'data-testid': 'btn-cancel', onClick: () => onCancel() }, 'ยกเลิก')),
      deleteBtn);
    return form;
  }

  form = h('form', { class: 'form-view', novalidate: true, onSubmit: submit },
    body,
    h('div', { class: 'form-actions' },
      deleteBtn,
      saveBtn,
      h('a', { class: 'btn btn--text btn--text-muted', href: '#/', 'data-testid': 'btn-cancel' }, 'ยกเลิก')));
  return h('div', {},
    h('header', { class: 'topbar topbar--sub' },
      h('a', { class: 'icon-btn', href: '#/', 'aria-label': 'กลับไปรายการหนี้' }, svgIcon('back')),
      h('h1', { class: 'topbar__title', tabindex: -1 }, title)),
    form);
}
