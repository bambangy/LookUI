// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Bambang Yudhotomo — LookUI
/**
 * Content rendering shared by lkTabs and lkCarousel.
 *
 * A content spec is an object with ONE source:
 *   { url: '/partials/a.html', select?, fetchOptions?, transform?, scripts? }  — fetched HTML (async)
 *   { html: '<b>raw</b>' }                — HTML string (trusted markup only)
 *   { content: 'plain text' }             — text (escaped)
 *   { content: Node }                     — node, moved into the host
 *   { content: (host, ctx) => … }         — returns Node | text | { html } | Promise of those | cleanup fn
 *   { template: '#tpl-id' | <template> }  — clone of a <template>'s content
 *
 * Loaded HTML is inserted as markup: `<script>` tags are dropped unless `scripts: true`.
 * Only load URLs you trust (inline handlers in the response still run).
 */

let uid = 0;
export function contentUid(prefix) {
  uid += 1;
  return `${prefix}-${Date.now().toString(36)}${uid}`;
}

/** True when the spec has something to render. */
export function hasContent(spec) {
  return !!spec && (spec.url != null || spec.html != null || spec.content != null || spec.template != null);
}

function toNodes(host, value) {
  if (value == null || value === false) return;
  if (value instanceof Node) { host.appendChild(value); return; }
  if (typeof value === 'object' && value.html != null) { host.insertAdjacentHTML('beforeend', String(value.html)); return; }
  host.appendChild(document.createTextNode(String(value)));
}

function runScripts(root) {
  root.querySelectorAll('script').forEach((old) => {
    const s = document.createElement('script');
    Array.from(old.attributes).forEach((a) => s.setAttribute(a.name, a.value));
    s.textContent = old.textContent;
    old.replaceWith(s);
  });
}

function fromResponse(host, text, spec) {
  const doc = new DOMParser().parseFromString(text, 'text/html');
  if (!spec.scripts) doc.querySelectorAll('script').forEach((s) => s.remove());
  const nodes = spec.select ? Array.from(doc.querySelectorAll(spec.select)) : Array.from(doc.body.childNodes);
  const frag = document.createDocumentFragment();
  nodes.forEach((n) => frag.appendChild(document.importNode(n, true)));
  host.appendChild(frag);
  if (spec.scripts) runScripts(host);
}

function statusEl(cls, html) {
  const el = document.createElement('div');
  el.className = `lk-async__status ${cls}`;
  el.innerHTML = html;
  return el;
}

/**
 * Render a content spec into `host` (replacing what is there).
 * @param {Element} host
 * @param {Object} spec
 * @param {Object} [o]
 * @param {Object}   [o.ctx]          — passed to function content / transform / hooks
 * @param {string}   [o.loadingText]  — text beside the spinner while a URL loads
 * @param {Function} [o.onLoad]       — (host) after content is in place
 * @param {Function} [o.onError]      — (error, host) when loading fails
 * @returns {{ promise: Promise<boolean>, destroy: Function, retry: Function }}
 *          promise resolves true when rendered, false when it failed or was destroyed
 */
export function renderContent(host, spec, o = {}) {
  let controller = null;
  let cleanup = null;
  let dead = false;
  let token = 0;

  function clear() {
    if (typeof cleanup === 'function') { try { cleanup(); } catch { /* owner cleanup */ } }
    cleanup = null;
    host.replaceChildren();
    host.classList.remove('lk-async--loading', 'lk-async--error');
    host.removeAttribute('aria-busy');
  }

  function fail(err, my) {
    if (dead || my !== token) return false;
    if (err?.name === 'AbortError') return false;
    clear();
    host.classList.add('lk-async--error');
    const box = statusEl('lk-async__status--error', '<span class="lk-icon lk-icon--alert-triangle" aria-hidden="true"></span><span class="lk-async__message"></span><button type="button" class="lk-btn lk-btn--sm lk-btn--outline lk-async__retry">Retry</button>');
    box.setAttribute('role', 'alert');
    box.querySelector('.lk-async__message').textContent = err?.message || 'Could not load the content.';
    box.querySelector('.lk-async__retry').addEventListener('click', run);
    host.appendChild(box);
    o.onError?.(err, host);
    return false;
  }

  function done(my) {
    if (dead || my !== token) return false;
    o.onLoad?.(host);
    return true;
  }

  async function loadUrl(my) {
    clear();
    host.classList.add('lk-async--loading');
    host.setAttribute('aria-busy', 'true');
    const status = statusEl('lk-async__status--loading', '<span class="lk-spinner lk-spinner--sm" aria-hidden="true"></span><span></span>');
    status.lastChild.textContent = o.loadingText ?? 'Loading…';
    host.appendChild(status);
    controller = new AbortController();
    const res = await fetch(spec.url, { ...(spec.fetchOptions || {}), signal: controller.signal });
    if (!res.ok) {
      const err = new Error(`Request failed with status ${res.status}`);
      err.status = res.status;
      throw err;
    }
    let body = await res.text();
    if (dead || my !== token) return false;
    if (typeof spec.transform === 'function') body = await spec.transform(body, res, o.ctx);
    if (dead || my !== token) return false;
    clear();
    if (body instanceof Node || (body && typeof body === 'object')) toNodes(host, body);
    else fromResponse(host, String(body ?? ''), spec);
    return done(my);
  }

  async function loadFn(my) {
    clear();
    let out = spec.content(host, o.ctx);
    if (out && typeof out.then === 'function') {
      host.classList.add('lk-async--loading');
      host.setAttribute('aria-busy', 'true');
      out = await out;
      if (dead || my !== token) {
        if (typeof out === 'function') out();
        return false;
      }
      host.classList.remove('lk-async--loading');
      host.removeAttribute('aria-busy');
    }
    if (typeof out === 'function') cleanup = out;
    else toNodes(host, out);
    return done(my);
  }

  function run() {
    token += 1;
    const my = token;
    controller?.abort();
    controller = null;
    let p;
    try {
      if (spec.url != null) p = loadUrl(my);
      else if (typeof spec.content === 'function') p = loadFn(my);
      else {
        clear();
        if (spec.html != null) host.innerHTML = String(spec.html);
        else if (spec.template != null) {
          const tpl = typeof spec.template === 'string' ? document.querySelector(spec.template) : spec.template;
          if (tpl?.content) host.appendChild(tpl.content.cloneNode(true));
        } else toNodes(host, spec.content);
        p = Promise.resolve(done(my));
      }
    } catch (err) {
      p = Promise.reject(err);
    }
    return p.catch((err) => fail(err, my));
  }

  const handle = {
    promise: run(),
    retry() { handle.promise = run(); return handle.promise; },
    destroy() {
      dead = true;
      controller?.abort();
      clear();
    },
  };
  return handle;
}
