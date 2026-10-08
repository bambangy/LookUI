/*
 * LookDocs — renders Kendo-style API reference sections for the example pages.
 *
 *   LookDocs.render('#api', {
 *     name: 'lkChip',
 *     kind: 'Component' | 'Composable' | 'Helper' | 'CSS',
 *     signature: 'Look.lkChip(element, options)',
 *     description: 'Markdown-lite text: `code`, **bold**, [link](#anchor)',
 *     params:     [{ name, type, optional, description }],
 *     options:    [{ name, type, default, required, description, values: [[value, meaning]], examples: [{ title, code, run }] }],
 *     properties: [{ name, type, readonly, description, examples }],
 *     methods:    [{ name, signature, description, params: [...], returns: { type, description }, examples }],
 *     events:     [{ name, signature, description, args: [...], examples }],
 *     classes:    [{ name, description, examples }],      // CSS classes / modifiers
 *     tokens:     [{ name, default, description }],       // CSS custom properties
 *     notes:      ['extra paragraphs'],
 *   });
 *
 * Examples with `run: true` execute live inside a preview box. The code gets
 * `Look`, `container` (an empty element) and `log(...)` (writes under the preview).
 */
(function () {
  'use strict';

  var SECTIONS = [
    ['options', 'Configuration'],
    ['properties', 'Properties'],
    ['methods', 'Methods'],
    ['events', 'Events'],
    ['classes', 'CSS classes'],
    ['tokens', 'CSS variables'],
  ];

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // `code`, **bold**, [text](href) — on escaped text
  function md(s) {
    return esc(s)
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<a href="$2">$1</a>');
  }

  function paragraphs(s) {
    if (!s) return '';
    var list = Array.isArray(s) ? s : String(s).split(/\n{2,}/);
    return list.map(function (p) { return '<p>' + md(p) + '</p>'; }).join('');
  }

  var KEYWORDS = /^(const|let|var|function|return|new|true|false|null|undefined|if|else|await|async|typeof|this|of|in|for|class|export|import|from)$/;

  function highlight(code) {
    var re = /(\/\/[^\n]*|\/\*[\s\S]*?\*\/|<!--[\s\S]*?-->)|('(?:\\.|[^'\\\n])*'|"(?:\\.|[^"\\\n])*"|`(?:\\.|[^`\\])*`)|\b([A-Za-z_$][\w$]*)\b|\b(\d+(?:\.\d+)?)\b/g;
    var out = '';
    var last = 0;
    var m;
    while ((m = re.exec(code))) {
      out += esc(code.slice(last, m.index));
      if (m[1]) out += '<span class="tok-c">' + esc(m[1]) + '</span>';
      else if (m[2]) out += '<span class="tok-s">' + esc(m[2]) + '</span>';
      else if (m[3]) out += KEYWORDS.test(m[3]) ? '<span class="tok-k">' + m[3] + '</span>'
        : (/^(Look|lk[A-Z]\w*)$/.test(m[3]) ? '<span class="tok-f">' + m[3] + '</span>' : esc(m[3]));
      else if (m[4]) out += '<span class="tok-n">' + m[4] + '</span>';
      last = re.lastIndex;
    }
    return out + esc(code.slice(last));
  }

  function slug(prefix, name) {
    return 'api-' + prefix + '-' + String(name).replace(/[^\w.-]+/g, '-');
  }

  function dedent(code) {
    var lines = String(code).replace(/^\n+|\s+$/g, '').split('\n');
    var min = Infinity;
    lines.forEach(function (l) {
      if (!l.trim()) return;
      var n = l.match(/^ */)[0].length;
      if (n < min) min = n;
    });
    return lines.map(function (l) { return l.slice(min === Infinity ? 0 : min); }).join('\n');
  }

  function codeBlock(code) {
    var src = dedent(code);
    return '<div class="api-code"><button type="button" class="api-code__copy" data-copy>Copy</button>'
      + '<pre><code>' + highlight(src) + '</code></pre></div>';
  }

  function examplesHtml(examples, id) {
    if (!examples || !examples.length) return '';
    return '<div class="api-examples">' + examples.map(function (ex, i) {
      var ex2 = typeof ex === 'string' ? { code: ex } : ex;
      var title = ex2.title ? md(ex2.title) : (examples.length > 1 ? 'Example ' + (i + 1) : 'Example');
      return '<div class="api-example"' + (ex2.run ? ' data-run="' + id + '-' + i + '"' : '') + '>'
        + '<div class="api-example__title">' + title + (ex2.run ? ' <span class="api-badge api-badge--live">live</span>' : '') + '</div>'
        + codeBlock(ex2.code)
        + (ex2.run ? '<div class="api-example__preview" aria-live="polite"></div><div class="api-example__log"></div>' : '')
        + '</div>';
    }).join('') + '</div>';
  }

  function paramsTable(params, caption) {
    if (!params || !params.length) return '';
    return '<table class="api-params"><caption>' + esc(caption || 'Parameters') + '</caption><thead><tr><th>Name</th><th>Type</th><th>Description</th></tr></thead><tbody>'
      + params.map(function (p) {
        return '<tr><td><code>' + esc(p.name) + '</code>' + (p.optional ? ' <span class="api-badge">optional</span>' : '') + '</td>'
          + '<td><span class="api-type">' + esc(p.type || 'any') + '</span></td>'
          + '<td>' + md(p.description || '') + (p.default != null ? ' <span class="api-default">Default: <code>' + esc(p.default) + '</code></span>' : '') + '</td></tr>';
      }).join('') + '</tbody></table>';
  }

  function valuesTable(values) {
    if (!values || !values.length) return '';
    return '<table class="api-params api-values"><caption>Values</caption><thead><tr><th>Value</th><th>Meaning</th></tr></thead><tbody>'
      + values.map(function (v) {
        var pair = Array.isArray(v) ? v : [v, ''];
        return '<tr><td><code>' + esc(pair[0]) + '</code></td><td>' + md(pair[1] || '') + '</td></tr>';
      }).join('') + '</tbody></table>';
  }

  function entry(kind, item) {
    var id = slug(kind, item.name);
    var head = '';
    var meta = '';
    if (kind === 'methods') head = esc(item.signature || item.name + '()');
    else if (kind === 'events') head = esc(item.signature || item.name);
    else head = esc(item.name);

    if (item.type) meta += '<span class="api-type">' + esc(item.type) + '</span>';
    if (item.default != null) meta += '<span class="api-default">Default: <code>' + esc(item.default) + '</code></span>';
    if (item.required) meta += '<span class="api-badge api-badge--req">required</span>';
    if (item.readonly) meta += '<span class="api-badge">read-only</span>';
    if (item.since) meta += '<span class="api-badge">since ' + esc(item.since) + '</span>';

    return '<article class="api-entry" id="' + id + '" data-name="' + esc(item.name).toLowerCase() + '">'
      + '<h4 class="api-entry__name"><a href="#' + id + '" class="api-anchor" aria-label="Link to ' + esc(item.name) + '">#</a><code>' + head + '</code></h4>'
      + (meta ? '<div class="api-entry__meta">' + meta + '</div>' : '')
      + '<div class="api-entry__desc">' + paragraphs(item.description) + '</div>'
      + valuesTable(item.values)
      + paramsTable(item.params, 'Parameters')
      + paramsTable(item.args, 'Callback arguments')
      + (item.returns ? '<div class="api-returns"><strong>Returns</strong> <span class="api-type">' + esc(item.returns.type || 'void') + '</span> ' + md(item.returns.description || '') + '</div>' : '')
      + examplesHtml(item.examples, id)
      + '</article>';
  }

  function tokensTable(tokens) {
    return '<table class="api-params"><thead><tr><th>Variable</th><th>Default</th><th>Description</th></tr></thead><tbody>'
      + tokens.map(function (t) {
        return '<tr id="' + slug('tokens', t.name) + '" data-name="' + esc(t.name).toLowerCase() + '" class="api-entry api-entry--row"><td><code>' + esc(t.name) + '</code></td><td><code>' + esc(t.default || '') + '</code></td><td>' + md(t.description || '') + '</td></tr>';
      }).join('') + '</tbody></table>';
  }

  // Shared by every validateable component (`validateable: true` in a spec appends these)
  var VALIDATION = {
    options: [
      {
        name: 'rules', type: 'Array', default: '[]',
        description: 'Validation rules, checked in order by `validate()` — the first failing rule\'s message is shown. A rule is a function `(value, component) => true | \'message\'` (it may return a **Promise** of the same — an async rule), a shorthand string (`\'required\'`, `\'email\'`) or an object `{ required, email, min, max, minLength, maxLength, pattern, message }`. Only `required` looks at empty values. The `required` option is applied as a rule automatically. See the [validation guide](validation.html).',
        examples: [{ run: true, code: `
          const el = container.appendChild(document.createElement('input'));
          const box = Look.lkTextbox(el, {
            label: 'Username',
            rules: [
              'required',
              { minLength: 3, message: 'At least 3 characters' },
              (v) => /^[a-z0-9_]+$/.test(v) || 'Lowercase letters, digits and _ only',
            ],
            validate: true,
          });
          const btn = container.appendChild(document.createElement('button'));
          btn.className = 'lk-btn lk-btn--secondary lk-btn--sm';
          btn.textContent = 'validate()';
          btn.style.marginTop = '8px';
          btn.onclick = () => log('valid =', box.validate(), '| error =', box.error);` }],
      },
      {
        name: 'validate', type: 'boolean', default: 'false',
        description: 'Run the rules as soon as focus leaves the component (for pickers: once the panel is closed and focus is elsewhere). Alias: `validateOnBlur`. Without it, rules run only when you call `validate()` (or `lkValidation().validate()`). Either way, once validated the field re-checks itself while the user edits it.',
      },
      {
        name: 'validateDebounce', type: 'number', default: '400',
        description: 'Milliseconds to wait before **async** rules re-run while the user is editing a validated field (sync rules always run at once). A result that arrives after the value changed again is ignored.',
        examples: [{ run: true, code: `
          const taken = ['admin', 'root'];
          const el = container.appendChild(document.createElement('input'));
          Look.lkTextbox(el, {
            label: 'Username (try admin)', validate: true, validateDebounce: 300,
            rules: ['required', (v) => new Promise((ok) => setTimeout(() => ok(!taken.includes(v) || 'Taken'), 500))],
          });` }],
      },
    ],
    properties: [
      { name: 'rules', type: 'Array', description: 'Read or replace the rules at runtime (they apply on the next validation).' },
      { name: 'error', type: 'string | null', readonly: true, description: 'Current validation message, `null` when valid.' },
      { name: 'validating', type: 'boolean', readonly: true, description: '`true` while an async rule is running (the field also gets `.lk-field--validating` and `aria-busy`).' },
      { name: 'hasError', type: 'boolean', readonly: true, description: '`true` while a validation message is shown.' },
      { name: 'validateOnBlur', type: 'boolean', description: 'Runtime switch for the `validate` option.' },
    ],
    methods: [
      { name: 'validate', signature: 'validate() → boolean', description: 'Run the validation manually: shows the first failing rule\'s message (or clears it) and returns `true` when valid. Async rules use their cached result for the current value; an uncached one keeps running in the background and shows its message when it settles — use `validateAsync()` to wait for it.' },
      { name: 'validateAsync', signature: 'validateAsync() → Promise<boolean>', description: 'Like `validate()`, but waits for async rules. Resolves with the outcome of the latest validation (an older run superseded by a newer one resolves with the newer result).' },
      { name: 'setValidation', signature: 'setValidation(message) → component', description: 'Set a validation message manually — e.g. an error returned by the server. Cleared (and the local rules re-run) as soon as the user changes the value. A falsy message behaves like `clearValidation()`.' },
      { name: 'clearValidation', signature: 'clearValidation() → component', description: 'Clear the validation manually and return the field to its initial, untouched state (no live re-checking until the next validation).' },
    ],
  };

  function withValidation(spec) {
    if (!spec.validateable) return spec;
    var out = {};
    Object.keys(spec).forEach(function (k) { out[k] = spec[k]; });
    ['options', 'properties', 'methods'].forEach(function (key) {
      var own = spec[key] || [];
      var names = own.map(function (it) { return it.name; });
      out[key] = own.concat(VALIDATION[key].filter(function (it) { return names.indexOf(it.name) < 0; }));
    });
    return out;
  }

  function render(target, spec) {
    var root = typeof target === 'string' ? document.querySelector(target) : target;
    if (!root) return;
    spec = withValidation(spec);
    root.classList.add('api-docs');

    var present = SECTIONS.filter(function (s) { return spec[s[0]] && spec[s[0]].length; });

    var toc = '<nav class="api-toc" aria-label="API index"><input type="search" class="api-toc__filter lk-input lk-input--dense" placeholder="Filter API…" aria-label="Filter API">'
      + present.map(function (s) {
        return '<div class="api-toc__group" data-group="' + s[0] + '"><a class="api-toc__heading" href="#api-section-' + s[0] + '">' + s[1] + ' <span>' + spec[s[0]].length + '</span></a><ul>'
          + spec[s[0]].map(function (it) {
            return '<li data-name="' + esc(it.name).toLowerCase() + '"><a href="#' + slug(s[0], it.name) + '"><code>' + esc(it.name) + '</code></a></li>';
          }).join('') + '</ul></div>';
      }).join('') + '</nav>';

    var overview = '<header class="api-overview">'
      + '<div class="api-overview__kicker">API reference' + (spec.kind ? ' · ' + esc(spec.kind) : '') + '</div>'
      + '<h2 class="api-overview__name">' + esc(spec.name) + '</h2>'
      + (spec.signature ? codeBlock(Array.isArray(spec.signature) ? spec.signature.join('\n') : spec.signature) : '')
      + paragraphs(spec.description)
      + paramsTable(spec.params, 'Arguments')
      + (spec.returns ? '<div class="api-returns"><strong>Returns</strong> <span class="api-type">' + esc(spec.returns.type) + '</span> ' + md(spec.returns.description || '') + '</div>' : '')
      + (spec.notes ? '<div class="api-notes">' + paragraphs(spec.notes) + '</div>' : '')
      + '</header>';

    var body = present.map(function (s) {
      var key = s[0];
      var inner = key === 'tokens' ? tokensTable(spec.tokens) : spec[key].map(function (it) { return entry(key, it); }).join('');
      return '<section class="api-section" id="api-section-' + key + '" data-group="' + key + '"><h3 class="api-section__title">' + s[1] + '</h3>' + inner + '</section>';
    }).join('');

    root.innerHTML = '<div class="api-layout">' + toc + '<div class="api-main">' + overview + body + '<p class="api-empty" hidden>No API entries match the filter.</p></div></div>';

    wire(root, spec);
  }

  function wire(root) {
    // Copy buttons
    root.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-copy]');
      if (!btn) return;
      var text = btn.parentNode.querySelector('code').textContent;
      var done = function () { btn.textContent = 'Copied'; setTimeout(function () { btn.textContent = 'Copy'; }, 1200); };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, done);
      else done();
    });

    // Filter
    var filter = root.querySelector('.api-toc__filter');
    filter.addEventListener('input', function () {
      var q = filter.value.trim().toLowerCase();
      var any = false;
      root.querySelectorAll('.api-toc li').forEach(function (li) { li.hidden = !!q && li.dataset.name.indexOf(q) < 0; });
      root.querySelectorAll('.api-entry').forEach(function (el) {
        var show = !q || el.dataset.name.indexOf(q) >= 0;
        el.hidden = !show;
        if (show) any = true;
      });
      root.querySelectorAll('.api-section, .api-toc__group').forEach(function (sec) {
        sec.hidden = !!q && !sec.querySelector('.api-entry:not([hidden]), li:not([hidden])');
      });
      root.querySelector('.api-empty').hidden = any || !q;
    });

    // Live examples
    root.querySelectorAll('[data-run]').forEach(function (box) {
      var code = box.querySelector('code').textContent;
      var preview = box.querySelector('.api-example__preview');
      var logEl = box.querySelector('.api-example__log');
      var log = function () {
        var line = document.createElement('div');
        line.textContent = Array.prototype.map.call(arguments, function (a) {
          return typeof a === 'string' ? a : JSON.stringify(a);
        }).join(' ');
        logEl.appendChild(line);
        logEl.scrollTop = logEl.scrollHeight;
      };
      try {
        // eslint-disable-next-line no-new-func
        new Function('Look', 'container', 'log', code)(window.Look, preview, log);
      } catch (err) {
        preview.innerHTML = '<div class="api-error">' + esc(err.message) + '</div>';
      }
    });

    // Deep link highlight
    function flash() {
      if (!location.hash) return;
      var el = document.getElementById(location.hash.slice(1));
      if (!el || !root.contains(el)) return;
      el.classList.remove('api-flash');
      void el.offsetWidth;
      el.classList.add('api-flash');
    }
    window.addEventListener('hashchange', flash);
    flash();
  }

  window.LookDocs = { render: render, highlight: highlight };
})();
