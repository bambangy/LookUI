// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Bambang Yudhotomo — LookUI
/**
 * lkPhone — phone number field: a country dropdown (flag + dial code) joined to
 * a digits-only textbox. The value is an E.164 string (`+6281234567890`).
 *
 * Structure:
 *   .lk-field > .lk-label
 *             + .lk-phone > .lk-dropdown__trigger (country) + input.lk-input.lk-phone__input
 *             + .lk-field-error
 *   input[type=hidden][name]  — carries the E.164 value for form posts
 *
 * @param {Element|string} el — an <input> (becomes the number box)
 * @param {Object} [opts]
 * @param {string}  [opts.label]
 * @param {string}  [opts.name]            — name of the hidden E.164 input (default: the input's name)
 * @param {string}  [opts.countryName]     — name for a hidden input carrying the ISO country code
 * @param {string}  [opts.value]           — '+6281…' (country detected) or national digits
 * @param {string}  [opts.country='ID']    — initial ISO 3166-1 alpha-2 code
 * @param {Array}   [opts.countries]       — [{ code, name, dial, flag? }] (default: lkPhone.countries)
 * @param {string[]} [opts.preferred]      — ISO codes listed first
 * @param {string}  [opts.flag='image']    — 'image' | 'emoji' | 'code' | false
 * @param {string}  [opts.flagUrl]         — image URL template: {code} = lower-case ISO, {CODE} = upper-case
 * @param {string}  [opts.placeholder]
 * @param {string}  [opts.trunkPrefix='0'] — national prefix dropped from the E.164 value ('' keeps it)
 * @param {number}  [opts.minDigits=6]
 * @param {number}  [opts.maxDigits]       — default: 15 minus the dial code length (E.164 limit)
 * @param {boolean} [opts.required] [opts.readonly] [opts.disabled] [opts.dense]
 * @param {Array}   [opts.rules]           — validation rules; a filled but too short/long number always fails
 * @param {boolean} [opts.validate]        — validate when focus leaves the field
 * @param {string}  [opts.invalidMessage='Enter a valid phone number']
 * @param {Function} [opts.onChange]       — (value, { source, component, country, dial, number, valid }) => void
 * @returns {Object}
 */

import { resolveEl, applyBase } from '../helpers/base.js';
import { wrapField } from '../helpers/field.js';
import { lkDropdown } from './dropdown.js';
import { attachValidation } from '../helpers/validation.js';

const COUNTRIES = [
  ['ID', 'Indonesia', '62'], ['MY', 'Malaysia', '60'], ['SG', 'Singapore', '65'], ['TH', 'Thailand', '66'],
  ['PH', 'Philippines', '63'], ['VN', 'Vietnam', '84'], ['BN', 'Brunei', '673'], ['KH', 'Cambodia', '855'],
  ['LA', 'Laos', '856'], ['MM', 'Myanmar', '95'], ['TL', 'Timor-Leste', '670'], ['AU', 'Australia', '61'],
  ['NZ', 'New Zealand', '64'], ['CN', 'China', '86'], ['HK', 'Hong Kong', '852'], ['TW', 'Taiwan', '886'],
  ['JP', 'Japan', '81'], ['KR', 'South Korea', '82'], ['IN', 'India', '91'], ['PK', 'Pakistan', '92'],
  ['BD', 'Bangladesh', '880'], ['LK', 'Sri Lanka', '94'], ['NP', 'Nepal', '977'],
  ['AE', 'United Arab Emirates', '971'], ['SA', 'Saudi Arabia', '966'], ['QA', 'Qatar', '974'],
  ['KW', 'Kuwait', '965'], ['OM', 'Oman', '968'], ['BH', 'Bahrain', '973'], ['TR', 'Türkiye', '90'],
  ['EG', 'Egypt', '20'], ['NG', 'Nigeria', '234'], ['KE', 'Kenya', '254'], ['ZA', 'South Africa', '27'],
  ['GB', 'United Kingdom', '44'], ['IE', 'Ireland', '353'], ['FR', 'France', '33'], ['DE', 'Germany', '49'],
  ['NL', 'Netherlands', '31'], ['BE', 'Belgium', '32'], ['CH', 'Switzerland', '41'], ['AT', 'Austria', '43'],
  ['IT', 'Italy', '39'], ['ES', 'Spain', '34'], ['PT', 'Portugal', '351'], ['SE', 'Sweden', '46'],
  ['NO', 'Norway', '47'], ['DK', 'Denmark', '45'], ['FI', 'Finland', '358'], ['PL', 'Poland', '48'],
  ['UA', 'Ukraine', '380'], ['RU', 'Russia', '7'], ['US', 'United States', '1'], ['CA', 'Canada', '1'],
  ['MX', 'Mexico', '52'], ['BR', 'Brazil', '55'], ['AR', 'Argentina', '54'], ['CL', 'Chile', '56'],
  ['CO', 'Colombia', '57'], ['PE', 'Peru', '51'],
].map(([code, name, dial]) => ({ code, name, dial }));

const DEFAULT_FLAG_URL = 'https://flagcdn.com/{code}.svg';

function digits(str) {
  return String(str ?? '').replace(/\D+/g, '');
}

// Regional-indicator pair, e.g. 'ID' -> 🇮🇩 (Windows shows the letters instead)
function emojiFlag(code) {
  return String(code).toUpperCase().replace(/[A-Z]/g, (c) => String.fromCodePoint(0x1f1e6 + c.charCodeAt(0) - 65));
}

export function lkPhone(el, opts = {}) {
  const input = resolveEl(el, 'lkPhone');
  if (input.tagName !== 'INPUT') throw new Error('Look.lkPhone: element must be an <input>.');

  const options = {
    label: null,
    name: null,
    countryName: null,
    value: null,
    country: 'ID',
    countries: COUNTRIES,
    preferred: null,
    flag: 'image',
    flagUrl: DEFAULT_FLAG_URL,
    placeholder: null,
    trunkPrefix: '0',
    minDigits: 6,
    maxDigits: null,
    required: undefined,
    readonly: false,
    disabled: false,
    dense: false,
    searchPlaceholder: 'Search country or code…',
    onChange: null,
    ...opts,
  };

  // --- Countries ------------------------------------------------------------

  let countries = normalizeCountries(options.countries);

  function normalizeCountries(list) {
    const out = (list || []).map((c) => ({ ...c, code: String(c.code).toUpperCase(), dial: digits(c.dial) }))
      .filter((c) => c.code && c.dial);
    const pref = (options.preferred || []).map((c) => String(c).toUpperCase());
    if (!pref.length) return out;
    const first = pref.map((p) => out.find((c) => c.code === p)).filter(Boolean);
    return [...first, ...out.filter((c) => !pref.includes(c.code))];
  }

  function findCountry(code) {
    return countries.find((c) => c.code === String(code ?? '').toUpperCase()) || null;
  }

  // Longest dial-code prefix wins; on a tie (+1 US/CA) keep the current country.
  function detectCountry(e164digits) {
    let best = null;
    countries.forEach((c) => {
      if (!e164digits.startsWith(c.dial)) return;
      if (!best || c.dial.length > best.dial.length
        || (c.dial.length === best.dial.length && c.code === country?.code)) best = c;
    });
    return best;
  }

  let country = findCountry(options.country) || countries[0] || null;

  // --- DOM ------------------------------------------------------------------

  const originalName = input.getAttribute('name');
  const originalType = input.getAttribute('type');
  const originalInputMode = input.getAttribute('inputmode');
  const originalAutocomplete = input.getAttribute('autocomplete');
  const originalPlaceholder = input.getAttribute('placeholder');
  input.removeAttribute('name');
  input.setAttribute('type', 'tel');
  input.setAttribute('inputmode', 'numeric');
  input.setAttribute('autocomplete', 'tel-national');
  input.classList.add('lk-input', 'lk-phone__input');
  if (options.dense) input.classList.add('lk-input--dense');
  if (options.placeholder != null) input.setAttribute('placeholder', options.placeholder);

  const field = wrapField(input, {
    label: options.label,
    required: options.required ?? opts.mandatory,
    requiredMark: options.requiredMark,
  });

  const group = document.createElement('div');
  group.className = 'lk-phone' + (options.dense ? ' lk-phone--dense' : '');
  input.parentNode.insertBefore(group, input);
  const select = document.createElement('select');
  if (options.dense) select.classList.add('lk-input--dense');
  group.append(select, input);

  const hidden = document.createElement('input');
  hidden.type = 'hidden';
  const hiddenName = options.name ?? originalName;
  if (hiddenName) hidden.name = hiddenName;
  group.after(hidden);

  function flagNode(c) {
    const mode = options.flag;
    if (!mode || !c) return null;
    const wrap = document.createElement('span');
    wrap.className = 'lk-phone__flag';
    wrap.setAttribute('aria-hidden', 'true');
    if (c.flag instanceof Node) {
      wrap.appendChild(c.flag.cloneNode(true));
    } else if (mode === 'emoji') {
      wrap.textContent = emojiFlag(c.code);
      wrap.classList.add('lk-phone__flag--emoji');
    } else if (mode === 'code') {
      wrap.textContent = c.code;
      wrap.classList.add('lk-phone__flag--code');
    } else {
      const img = document.createElement('img');
      img.alt = '';
      img.loading = 'lazy';
      img.decoding = 'async';
      img.src = typeof c.flag === 'string' ? c.flag
        : String(options.flagUrl || DEFAULT_FLAG_URL)
          .replace(/\{code\}/g, c.code.toLowerCase())
          .replace(/\{CODE\}/g, c.code);
      // Offline / blocked CDN: fall back to the ISO code
      img.addEventListener('error', () => {
        wrap.textContent = c.code;
        wrap.classList.add('lk-phone__flag--code');
      }, { once: true });
      wrap.appendChild(img);
    }
    return wrap;
  }

  function optionTemplate(item) {
    const frag = document.createDocumentFragment();
    const f = flagNode(item.country);
    if (f) frag.appendChild(f);
    const name = document.createElement('span');
    name.className = 'lk-phone__option-name';
    name.textContent = item.country.name;
    const dial = document.createElement('span');
    dial.className = 'lk-phone__option-dial';
    dial.textContent = `+${item.country.dial}`;
    frag.append(name, dial);
    return frag;
  }

  function selectedTemplate(item) {
    const frag = document.createDocumentFragment();
    const f = flagNode(item.country);
    if (f) frag.appendChild(f);
    const dial = document.createElement('span');
    dial.className = 'lk-phone__dial';
    dial.textContent = `+${item.country.dial}`;
    frag.appendChild(dial);
    return frag;
  }

  function toItems() {
    return countries.map((c) => ({ value: c.code, label: c.name, dial: c.dial, dialText: `+${c.dial}`, country: c }));
  }

  const dropdown = lkDropdown(select, {
    items: toItems(),
    value: country?.code ?? null,
    name: options.countryName || null,
    useInput: true,
    searchPlaceholder: options.searchPlaceholder,
    searchFields: ['label', 'value', 'dial', 'dialText'],
    template: optionTemplate,
    selectedTemplate,
    panelWidth: 280,
    panelClass: 'lk-phone__panel',
    placeholder: '+',
    onChange(code) {
      const next = findCountry(code);
      if (!next || next === country) return;
      country = next;
      applyLimits();
      sync(true, 'country');
      input.focus();
    },
  });
  dropdown.el.classList.add('lk-phone__country');
  dropdown.el.setAttribute('aria-label', 'Country code');

  // --- Value ----------------------------------------------------------------

  function maxDigits() {
    if (Number.isFinite(options.maxDigits)) return options.maxDigits;
    return Math.max(4, 15 - (country?.dial.length || 0));
  }

  function nationalDigits() {
    let d = digits(input.value);
    const trunk = options.trunkPrefix;
    if (trunk && d.startsWith(trunk)) d = d.slice(trunk.length);
    return d;
  }

  function e164() {
    const d = nationalDigits();
    return d && country ? `+${country.dial}${d}` : '';
  }

  function isValid() {
    const len = nationalDigits().length;
    return !!country && len >= options.minDigits && len <= maxDigits();
  }

  function info() {
    return { country: country?.code ?? null, dial: country?.dial ?? null, number: nationalDigits(), valid: isValid() };
  }

  let lastValue = null;
  let validation = null; // set once the component object exists
  // source: 'input' (typing / paste) | 'country' (picked in the dropdown)
  function sync(emit, source = 'input') {
    const v = e164();
    hidden.value = v;
    group.dataset.country = country?.code ?? '';
    if (emit) validation?.changed();
    if (emit && v !== lastValue && typeof options.onChange === 'function') options.onChange(v, { source, component: comp, ...info() });
    lastValue = v;
  }

  function applyLimits() {
    input.maxLength = maxDigits() + (options.trunkPrefix ? options.trunkPrefix.length : 0);
  }

  // '+62 812-3456' -> country ID + '8123456'; plain digits stay national
  function setValue(v, emit = false) {
    const raw = String(v ?? '').trim();
    if (raw.startsWith('+') || raw.startsWith('00')) {
      const all = digits(raw.startsWith('00') ? raw.slice(2) : raw);
      const found = detectCountry(all);
      if (found) {
        country = found;
        dropdown.value = found.code;
        input.value = all.slice(found.dial.length);
      } else {
        input.value = all;
      }
    } else {
      input.value = digits(raw);
    }
    applyLimits();
    sync(emit);
  }

  function onInput() {
    const raw = input.value;
    if (/^\s*(\+|00)/.test(raw) && digits(raw).length > 2) {
      // Pasted an international number: pick its country
      input.removeAttribute('maxlength');
      setValue(raw, true);
      return;
    }
    const clean = digits(raw).slice(0, input.maxLength > 0 ? input.maxLength : undefined);
    if (clean !== raw) {
      const pos = input.selectionStart ?? clean.length;
      const removed = raw.slice(0, pos).replace(/\d/g, '').length;
      input.value = clean;
      try { input.setSelectionRange(pos - removed, pos - removed); } catch { /* type=tel supports it */ }
    }
    sync(true);
  }

  function onPaste(e) {
    const text = e.clipboardData?.getData('text') ?? '';
    if (!/^\s*(\+|00)/.test(text)) return;
    e.preventDefault();
    setValue(text, true);
  }

  input.addEventListener('input', onInput);
  input.addEventListener('paste', onPaste);

  if (options.value != null && options.value !== '') setValue(options.value, false);
  else {
    applyLimits();
    sync(false);
  }

  // --- Component object -----------------------------------------------------

  const comp = {};
  applyBase(comp, input, { hiddenTarget: field.wrapper || group });

  let readonly = false;
  let disabled = false;

  Object.defineProperties(comp, {
    value: {
      get() { return e164(); },
      set(v) { setValue(v, false); },
      enumerable: true,
    },
    country: {
      get() { return country?.code ?? null; },
      set(code) {
        const next = findCountry(code);
        if (!next) return;
        country = next;
        dropdown.value = next.code;
        applyLimits();
        sync(false);
      },
      enumerable: true,
    },
    dialCode: { get() { return country ? `+${country.dial}` : ''; }, enumerable: true },
    number: {
      get() { return nationalDigits(); },
      set(v) { input.value = digits(v); sync(false); },
      enumerable: true,
    },
    valid: { get() { return isValid(); }, enumerable: true },
    countries: {
      get() { return countries.slice(); },
      set(list) {
        countries = normalizeCountries(list);
        dropdown.items = toItems();
        if (!findCountry(country?.code)) country = countries[0] || null;
        dropdown.value = country?.code ?? null;
        applyLimits();
        sync(false);
      },
      enumerable: true,
    },
    name: {
      get() { return hidden.name; },
      set(v) { hidden.name = v || ''; },
      enumerable: true,
    },
    label: {
      get() { return field.getLabel(); },
      set(v) { field.setLabel(v); },
      enumerable: true,
    },
    required: {
      get() { return input.required; },
      set(v) { field.setRequired(v); },
      enumerable: true,
    },
    readonly: {
      get() { return readonly; },
      set(v) {
        readonly = !!v;
        input.readOnly = readonly;
        dropdown.readonly = readonly;
        group.classList.toggle('lk-phone--readonly', readonly);
      },
      enumerable: true,
    },
    disabled: {
      get() { return disabled; },
      set(v) {
        disabled = !!v;
        input.disabled = disabled;
        hidden.disabled = disabled;
        dropdown.disabled = disabled;
        group.classList.toggle('lk-phone--disabled', disabled);
      },
      enumerable: true,
    },
    dropdown: { get() { return dropdown; }, enumerable: true },
    inputEl: { get() { return input; }, enumerable: true },
  });

  // `enabled` from applyBase only touches the input — keep the dropdown in step
  Object.defineProperty(comp, 'enabled', {
    get() { return !disabled; },
    set(v) { comp.disabled = !v; },
    enumerable: true,
  });

  if (options.readonly) comp.readonly = true;
  if (options.disabled) comp.disabled = true;

  comp.setError = (msg) => {
    field.setError(msg);
    group.classList.add('lk-phone--error');
  };
  comp.clearError = () => {
    field.clearError();
    group.classList.remove('lk-phone--error');
  };
  comp.refreshLabels = field.refreshLabels;
  comp.focus = (o) => input.focus(o);

  validation = attachValidation(comp, {
    opts,
    getValue: () => e164(),
    label: field.getLabel,
    labels: () => field.labels,
    required: () => input.required,
    roots: () => [group, dropdown.panelEl],
    isOpen: () => dropdown.isOpen,
    builtinRules: [() => (!nationalDigits() || isValid() || options.invalidMessage || 'Enter a valid phone number')],
    setError: comp.setError,
    clearError: comp.clearError,
  });

  comp.destroy = function () {
    validation.destroy();
    input.removeEventListener('input', onInput);
    input.removeEventListener('paste', onPaste);
    dropdown.destroy();
    comp.clearError();
    group.parentNode?.insertBefore(input, group);
    group.remove();
    hidden.remove();
    input.classList.remove('lk-input', 'lk-phone__input', 'lk-input--dense');
    input.removeAttribute('maxlength');
    input.disabled = false;
    input.readOnly = false;
    const restore = (attr, val) => (val == null ? input.removeAttribute(attr) : input.setAttribute(attr, val));
    restore('name', originalName);
    restore('type', originalType);
    restore('inputmode', originalInputMode);
    restore('autocomplete', originalAutocomplete);
    restore('placeholder', originalPlaceholder);
    field.destroyField();
  };

  return comp;
}

lkPhone.countries = COUNTRIES;
