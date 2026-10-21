// Delete confirmation (DESIGN 4.7, 5.3): a bottom sheet on mobile; at ≥900px the same .sheet is
// centred as a 400px modal by CSS, without the handle.

import { h } from './dom.js';
import { openDialog } from './dialog.js';
import { formatBaht } from '../lib/money.js';

let current = null; // the open confirm's dialog handle

/** Closes the open confirm, if any (a route change, or a finished delete). */
export function closeConfirm() {
  current?.close();
}

/**
 * confirmDelete(debt, { desktop, onConfirm }) -> Promise<boolean>
 * Resolves true once "ลบรายการ" was pressed and onConfirm() settled without throwing; false when
 * cancelled (ยกเลิก, Esc, scrim, route change). While onConfirm runs the button reads "กำลังลบ…".
 * A rejected onConfirm keeps the dialog open so the user can try again or cancel.
 */
export function confirmDelete(debt, { desktop, onConfirm } = {}) {
  closeConfirm();
  const amount = formatBaht(debt.amount);
  const text = debt.note
    ? `${debt.note} ${amount} จะหายไปจากสมุด และกู้คืนไม่ได้`
    : `ยอด ${amount} จะหายไปจากสมุด และกู้คืนไม่ได้`;

  return new Promise((resolve) => {
    let confirmed = false;
    let busy = false;

    const confirmBtn = h('button', {
      type: 'button', class: 'btn btn--danger btn--lg btn--block', 'data-testid': 'dialog-delete-confirm',
      onClick: async () => {
        if (busy) return;
        busy = true;
        confirmed = true;
        cancelBtn.disabled = true; // the DELETE is on its way: no backing out (Esc/scrim too)
        confirmBtn.disabled = true;
        confirmBtn.setAttribute('aria-busy', 'true');
        confirmBtn.textContent = 'กำลังลบ…';
        try {
          await onConfirm?.();
          dialog.close();
        } catch {
          confirmed = false;
          busy = false;
          cancelBtn.disabled = false;
          confirmBtn.disabled = false;
          confirmBtn.removeAttribute('aria-busy');
          confirmBtn.textContent = 'ลบรายการ';
          if (confirmBtn.isConnected) confirmBtn.focus();
        }
      },
    }, 'ลบรายการ');
    const cancelBtn = h('button', {
      type: 'button', class: 'btn btn--secondary btn--lg btn--block', 'data-testid': 'dialog-delete-cancel',
      onClick: () => dialog.close(),
    }, 'ยกเลิก');

    const el = h('div', { 'aria-labelledby': 'delete-title', 'aria-describedby': 'delete-text', 'data-testid': 'dialog-delete' },
      desktop ? null : h('div', { class: 'sheet__handle', 'aria-hidden': 'true' }),
      h('h2', { id: 'delete-title', class: 'sheet__title' }, `ลบรายการของ${debt.friend_name}?`),
      h('p', { id: 'delete-text', class: 'sheet__text' }, text),
      h('div', { class: 'sheet__actions' }, confirmBtn, cancelBtn));

    // "ยกเลิก" is the safe default (DESIGN 4.7).
    const dialog = openDialog(el, {
      kind: 'sheet',
      initialFocus: cancelBtn,
      canDismiss: () => !busy, // a route change still closes it through close()
      onClose: () => {
        if (current === dialog) current = null;
        resolve(confirmed);
      },
    });
    current = dialog;
  });
}
