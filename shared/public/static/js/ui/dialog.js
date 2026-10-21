// Modal layers (bottom sheet or centred modal) mounted in #dialog-root.
// Layers stack: each one inerts what was interactive when it opened and gives exactly that back on close.

import { h } from './dom.js';

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

const stack = [];

function focusables(el) {
  return [...el.querySelectorAll(FOCUSABLE)].filter((node) => !node.hidden && node.getClientRects().length > 0);
}

function onKeydown(event) {
  const top = stack.at(-1);
  if (!top) return;
  if (event.key === 'Escape') {
    event.preventDefault();
    if (top.canDismiss?.() !== false) top.close();
  } else if (event.key === 'Tab') {
    const items = focusables(top.el);
    if (items.length === 0) {
      event.preventDefault();
      return;
    }
    const first = items[0];
    const last = items.at(-1);
    const inside = top.el.contains(document.activeElement);
    if (event.shiftKey && (document.activeElement === first || !inside)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (document.activeElement === last || !inside)) {
      event.preventDefault();
      first.focus();
    }
  }
}

/**
 * openDialog(el, { kind: 'sheet'|'modal', initialFocus, onClose, canDismiss }) -> { close() }
 * Click on the scrim or Esc closes it (unless canDismiss() returns false, e.g. while busy); focus
 * returns to the element that had it when opened. close() itself always closes.
 */
export function openDialog(el, { kind, initialFocus, onClose, canDismiss } = {}) {
  const root = document.getElementById('dialog-root');
  const opener = document.activeElement;

  el.classList.add(kind);
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');

  const scrim = h('div', { class: 'scrim' });
  const layer = h('div', { class: 'dialog-layer' }, scrim, el);

  // Everything outside this layer: the page and any lower dialog layers. #toast-root stays live so a
  // status message (e.g. a failed save) is still announced; it sits under the scrim, out of reach.
  const outside = [...document.body.children, ...root.children]
    .filter((node) => node !== root && node.id !== 'toast-root' && node.tagName !== 'SCRIPT');
  const inerted = outside.filter((node) => !node.inert);
  for (const node of inerted) node.inert = true;

  let closed = false;
  const entry = {
    el,
    canDismiss,
    close() {
      if (closed) return;
      // Closing a lower layer closes the ones above it first, top-down, so each one gives back
      // its own inert set and focus in order (e.g. browser Back under a stacked delete confirm).
      while (stack.at(-1) !== entry) stack.at(-1).close();
      closed = true;
      stack.splice(stack.indexOf(entry), 1);
      layer.remove();
      for (const node of inerted) node.inert = false;
      if (stack.length === 0) document.removeEventListener('keydown', onKeydown);
      if (opener instanceof HTMLElement && opener.isConnected && opener !== document.body) opener.focus();
      onClose?.();
    },
  };

  scrim.addEventListener('click', () => { if (canDismiss?.() !== false) entry.close(); });
  if (stack.length === 0) document.addEventListener('keydown', onKeydown);
  stack.push(entry);
  root.appendChild(layer);
  (initialFocus ?? focusables(el)[0])?.focus();

  return { close: entry.close };
}
