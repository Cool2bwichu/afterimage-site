// A few lines of DOM plumbing, so the interface can be written as plain
// functions that return elements.

/**
 * h('button.primary', { onclick, title }, 'Text', child)
 * Props beginning with "on" are listeners; `class`, `style` (object or text),
 * `dataset` and `html` are understood; everything else is an attribute.
 */
export function h(spec, props, ...children) {
  if (props !== undefined && (props === null || typeof props !== 'object' || props instanceof Node || Array.isArray(props))) {
    children.unshift(props);
    props = null;
  }
  const [tag, ...classes] = spec.split('.');
  const element = document.createElement(tag || 'div');
  if (classes.length) element.className = classes.join(' ');
  for (const [key, value] of Object.entries(props || {})) {
    if (value === undefined || value === null || value === false) continue;
    if (key.startsWith('on') && typeof value === 'function') element.addEventListener(key.slice(2), value);
    else if (key === 'class') element.className = `${element.className} ${value}`.trim();
    else if (key === 'style' && typeof value === 'object') { for (const [name, v] of Object.entries(value)) { if (name.startsWith('--')) element.style.setProperty(name, v); else element.style[name] = v; } }
    else if (key === 'dataset') Object.assign(element.dataset, value);
    else if (key === 'html') element.innerHTML = value;
    else if (value === true) element.setAttribute(key, '');
    else element.setAttribute(key, value);
  }
  append(element, children);
  return element;
}

export function append(parent, children) {
  for (const child of children.flat(Infinity)) {
    if (child === null || child === undefined || child === false) continue;
    parent.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return parent;
}

export function replace(parent, ...children) {
  parent.replaceChildren();
  return append(parent, children);
}

const ICONS = {
  search: '<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/>',
  heart: '<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10Z"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  compass: '<circle cx="12" cy="12" r="8.5"/><path d="m15.5 8.5-2 5-5 2 2-5 5-2Z"/>',
  constellation: '<path d="M4 17.5 9 8l6 5 5-8"/><circle cx="4" cy="17.5" r="1.4"/><circle cx="9" cy="8" r="1.4"/><circle cx="15" cy="13" r="1.4"/><circle cx="20" cy="5" r="1.4"/>',
  deeper: '<circle cx="12" cy="12" r="2.2"/><circle cx="12" cy="12" r="6" opacity=".7"/><circle cx="12" cy="12" r="9.5" opacity=".4"/>',
  collide: '<circle cx="8" cy="12" r="4.5"/><circle cx="16" cy="12" r="4.5"/>',
  passage: '<circle cx="5" cy="18" r="1.8"/><circle cx="19" cy="6" r="1.8"/><path d="M6.5 16.5C10 13 9 9.5 12 8s4-.5 5.5-1"/>',
  home: '<circle cx="12" cy="12" r="2"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  arrow: '<path d="M5 12h13M13 6l6 6-6 6"/>',
  back: '<path d="M19 12H6M11 6l-6 6 6 6"/>',
  drift: '<path d="M3 15c3-4 6-4 9 0s6 4 9 0"/><path d="M3 9c3-4 6-4 9 0s6 4 9 0" opacity=".55"/>',
  spark: '<path d="M12 3l1.8 6.2L20 11l-6.2 1.8L12 19l-1.8-6.2L4 11l6.2-1.8L12 3Z"/>',
  nebula: '<path d="M5 14c0-5 4-9 8-8 3 .8 2 4 5 5 2 .7 2 4-1 5-4 1.4-5-2-8-1-2 .7-4 1.5-4-1Z"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.700l-1 1"/><path d="M14 10a4 4 0 0 0-5.700 0l-3 3a4 4 0 0 0 5.700 5.700l1-1"/>',
  stop: '<rect x="7" y="7" width="10" height="10" rx="1.5"/>',
  eye: '<path d="M2.500 12s3.500-6.500 9.500-6.500 9.500 6.500 9.500 6.500-3.500 6.500-9.500 6.500S2.500 12 2.500 12Z"/><circle cx="12" cy="12" r="2.600"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
};

export function icon(name, size = 18) {
  const span = document.createElement('span');
  span.className = 'icon';
  span.setAttribute('aria-hidden', 'true');
  span.innerHTML = `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${ICONS[name] || ''}</svg>`;
  return span;
}

/** Runs `fn` at most once per `wait` ms, with the latest arguments. */
export function throttle(fn, wait) {
  let last = 0;
  let timer = 0;
  let pending = null;
  return (...args) => {
    const now = performance.now();
    pending = args;
    if (now - last >= wait) { last = now; fn(...pending); pending = null; return; }
    if (!timer) timer = setTimeout(() => { timer = 0; last = performance.now(); if (pending) fn(...pending); pending = null; }, wait - (now - last));
  };
}

export const plural = (n, one, many = `${one}s`) => `${n.toLocaleString('en')} ${n === 1 ? one : many}`;
