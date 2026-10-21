// Tiny DOM builder. Text always goes in as text nodes, never as HTML.

const SVG_NS = 'http://www.w3.org/2000/svg';

function append(el, child) {
  if (child == null || child === false) return;
  if (Array.isArray(child)) {
    for (const c of child) append(el, c);
  } else if (child instanceof Node) {
    el.appendChild(child);
  } else {
    el.appendChild(document.createTextNode(String(child)));
  }
}

/**
 * h('a', { class: 'debt__main', href: '#/edit/1', 'data-id': 1, onClick: fn }, 'text', node)
 * null/undefined/false attribute values are skipped; true sets an empty attribute.
 */
export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs ?? {})) {
    if (value == null || value === false) continue;
    if (/^on[A-Z]/.test(key) && typeof value === 'function') {
      el.addEventListener(key.slice(2).toLowerCase(), value);
    } else if (key === 'hidden') {
      el.hidden = Boolean(value);
    } else {
      el.setAttribute(key, value === true ? '' : String(value));
    }
  }
  append(el, children);
  return el;
}

// 24×24 stroke icons from the boards. Each entry: stroke width, then child elements.
const ICONS = {
  check: [2, [['path', { d: 'M5 12.5l4.5 4.5L19 7.5' }]]],
  plus: [2.2, [['path', { d: 'M12 5v14' }], ['path', { d: 'M5 12h14' }]]],
  back: [2, [['path', { d: 'M15 5l-7 7 7 7' }]]],
  close: [2.2, [['path', { d: 'M6 6l12 12' }], ['path', { d: 'M18 6L6 18' }]]],
  gear: [1.8, [
    ['path', { d: 'M10.3 5.2L10.7 2.6H13.3L13.7 5.2A7 7 0 0 1 15.6 6L17.7 4.4L19.6 6.3L18 8.4A7 7 0 0 1 18.8 10.3L21.4 10.7V13.3L18.8 13.7A7 7 0 0 1 18 15.6L19.6 17.7L17.7 19.6L15.6 18A7 7 0 0 1 13.7 18.8L13.3 21.4H10.7L10.3 18.8A7 7 0 0 1 8.4 18L6.3 19.6L4.4 17.7L6 15.6A7 7 0 0 1 5.2 13.7L2.6 13.3V10.7L5.2 10.3A7 7 0 0 1 6 8.4L4.4 6.3L6.3 4.4L8.4 6A7 7 0 0 1 10.3 5.2Z' }],
    ['circle', { cx: 12, cy: 12, r: 3 }],
  ]],
};

/** Decorative inline icon (aria-hidden). Size comes from CSS (.btn svg, .check-btn svg, …). */
export function svgIcon(name) {
  const icon = ICONS[name];
  if (!icon) throw new Error(`unknown icon: ${name}`);
  const [strokeWidth, parts] = icon;
  const svg = svgEl('svg', {
    viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': strokeWidth,
    'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true', focusable: 'false',
  });
  for (const [tag, attrs] of parts) svg.appendChild(svgEl(tag, attrs));
  return svg;
}

/** Namespaced SVG element; used for icons and the empty-state illustration. */
export function svgEl(tag, attrs = {}, ...children) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, String(value));
  for (const c of children) el.appendChild(c);
  return el;
}
