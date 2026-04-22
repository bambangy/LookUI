// Icon factory — creates an icon <span> element programmatically

/**
 * Create an icon element.
 * @param {string} name — icon name (e.g. 'close', 'chevron-left', 'star')
 * @param {Object} [opts]
 * @param {string} [opts.size]      — 'xs' | 'sm' | 'lg' | 'xl' | '2xl'
 * @param {string} [opts.color]     — 'primary' | 'secondary' | 'positive' | 'negative' | 'warning' | 'info' | 'muted'
 * @param {string} [opts.className] — additional CSS class(es)
 * @param {string} [opts.label]     — accessible label (sets aria-label + role="img")
 * @returns {HTMLSpanElement}
 */
export function lkIcon(name, opts = {}) {
  const el = document.createElement('span');
  el.className = 'lk-icon lk-icon--' + name;

  if (opts.size) el.classList.add('lk-icon--' + opts.size);
  if (opts.color) el.classList.add('lk-icon--' + opts.color);
  if (opts.className) el.classList.add(...opts.className.split(' ').filter(Boolean));

  if (opts.label) {
    el.setAttribute('role', 'img');
    el.setAttribute('aria-label', opts.label);
  } else {
    el.setAttribute('aria-hidden', 'true');
  }

  return el;
}
