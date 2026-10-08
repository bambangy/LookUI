// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Bambang Yudhotomo — LookUI
import { lkPopupProxy } from './popupProxy.js';
import { lkIcon } from '../components/icon.js';
import { formatDate } from '../helpers/dateFormat.js';

const WEEKDAY_START = 0;
const RANGE_SCAN_DAYS = 3660; // how far a range may look for a blocking (disabled) day

function toStartOfDay(value) {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
}

function parseDate(input, fallback = null) {
  if (input == null || input === '') return fallback;

  if (input instanceof Date) {
    if (Number.isNaN(input.getTime())) return fallback;
    return new Date(input);
  }

  if (typeof input === 'number') {
    const parsed = new Date(input);
    if (Number.isNaN(parsed.getTime())) return fallback;
    return parsed;
  }

  if (typeof input === 'string') {
    const value = input.trim();
    if (!value) return fallback;

    const iso = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (iso) {
      const parsed = new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
      if (!Number.isNaN(parsed.getTime())) return parsed;
    }

    const generic = new Date(value);
    if (!Number.isNaN(generic.getTime())) return generic;
  }

  return fallback;
}

function sameDay(a, b) {
  if (!a || !b) return false;
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function toIsoDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function withinBounds(date, minDate, maxDate) {
  const day = toStartOfDay(date);
  if (minDate && day < toStartOfDay(minDate)) return false;
  if (maxDate && day > toStartOfDay(maxDate)) return false;
  return true;
}

function clampDate(date, minDate, maxDate) {
  if (!date) return date;

  const minDay = minDate ? toStartOfDay(minDate) : null;
  const maxDay = maxDate ? toStartOfDay(maxDate) : null;
  const dateDay = toStartOfDay(date);

  if (minDay && dateDay < minDay) return new Date(minDay);
  if (maxDay && dateDay > maxDay) return new Date(maxDay);
  return new Date(dateDay);
}

// Like clampDate, but keeps the time-of-day (used by time mode).
function clampDateTime(date, minDate, maxDate) {
  if (!date) return date;
  if (withinBounds(date, minDate, maxDate)) return new Date(date);

  const out = clampDate(date, minDate, maxDate);
  out.setHours(date.getHours(), date.getMinutes(), date.getSeconds(), 0);
  return out;
}

function resolveTarget(target) {
  if (!target) throw new Error('Look.lkDate: target is required for popup mode.');
  const node = typeof target === 'string' ? document.querySelector(target) : target;
  if (!node) throw new Error(`Look.lkDate: target not found - "${target}"`);
  return node;
}

function createWeekdayLabels(locale) {
  const formatter = new Intl.DateTimeFormat(locale, { weekday: 'short' });
  const base = new Date(2023, 0, 1); // Sunday
  const labels = [];

  for (let i = 0; i < 7; i += 1) {
    const date = new Date(base);
    date.setDate(base.getDate() + ((i + WEEKDAY_START) % 7));
    labels.push(formatter.format(date));
  }

  return labels;
}

function createCalendarDays(viewDate) {
  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();

  const first = new Date(year, month, 1);
  const shift = (first.getDay() - WEEKDAY_START + 7) % 7;

  const start = new Date(first);
  start.setDate(first.getDate() - shift);

  const days = [];
  for (let i = 0; i < 42; i += 1) {
    const day = new Date(start);
    day.setDate(start.getDate() + i);
    days.push(day);
  }

  return days;
}

function monthIsSelectable(year, month, minDate, maxDate) {
  const start = new Date(year, month, 1);
  const end = new Date(year, month + 1, 0);
  if (maxDate && start > toStartOfDay(maxDate)) return false;
  if (minDate && end < toStartOfDay(minDate)) return false;
  return true;
}

function normalizeTimeFormat(value) {
  const v = String(value ?? '12').toLowerCase();
  if (v === '12' || v === '12h' || v === 'ampm') return '12';
  return '24';
}

function resolveArgs(targetOrOpts, maybeOpts) {
  if (
    targetOrOpts &&
    typeof targetOrOpts === 'object' &&
    !(targetOrOpts instanceof Element) &&
    !Array.isArray(targetOrOpts) &&
    !('nodeType' in targetOrOpts)
  ) {
    return {
      target: targetOrOpts.target,
      opts: targetOrOpts,
    };
  }

  return {
    target: targetOrOpts,
    opts: maybeOpts || {},
  };
}

function parseInitialRange(value, minDate, maxDate) {
  if (!Array.isArray(value)) return [null, null];
  const a = clampDate(parseDate(value[0]), minDate, maxDate);
  const b = clampDate(parseDate(value[1]), minDate, maxDate);

  if (!a && !b) return [null, null];
  if (!a) return [b, null];
  if (!b) return [a, null];
  if (b < a) return [b, a];
  return [a, b];
}

function createTimeState(seedDate) {
  if (!seedDate) {
    return {
      hour24: 0,
      minute: 0,
      second: 0,
    };
  }

  const ref = new Date(seedDate);
  return {
    hour24: ref.getHours(),
    minute: ref.getMinutes(),
    second: ref.getSeconds(),
  };
}

function composeDateTime(date, parts) {
  const out = new Date(date);
  out.setHours(parts.hour24, parts.minute, parts.second, 0);
  return out;
}

/**
 * Compile a date list into a matcher `(date) => false | true | 'label'`.
 * Items: Date | timestamp | 'YYYY-MM-DD' | 'MM-DD' (every year) | { date, label } | { from, to, label }.
 * A function is used as the matcher itself.
 */
function compileDateRules(input) {
  if (typeof input === 'function') return (d) => input(new Date(d));
  const list = Array.isArray(input) ? input : (input == null ? [] : [input]);
  const days = new Map();
  const yearly = new Map();
  const spans = [];

  list.forEach((item) => {
    let label = true;
    let v = item;
    if (item && typeof item === 'object' && !(item instanceof Date)) {
      label = item.label ?? item.name ?? true;
      if (item.from != null || item.to != null) {
        const a = parseDate(item.from);
        const b = parseDate(item.to);
        spans.push({
          a: a ? toStartOfDay(a).getTime() : -Infinity,
          b: b ? toStartOfDay(b).getTime() : Infinity,
          label,
        });
        return;
      }
      v = item.date;
    }
    if (typeof v === 'string' && /^\d{2}-\d{2}$/.test(v.trim())) {
      yearly.set(v.trim(), label);
      return;
    }
    const d = parseDate(v);
    if (d) days.set(toIsoDate(d), label);
  });

  if (!days.size && !yearly.size && !spans.length) return null;
  return (d) => {
    const key = toIsoDate(d);
    if (days.has(key)) return days.get(key);
    const md = key.slice(5);
    if (yearly.has(md)) return yearly.get(md);
    const t = toStartOfDay(d).getTime();
    const span = spans.find((s) => t >= s.a && t <= s.b);
    return span ? span.label : false;
  };
}

function isTextInput(el) {
  if (!el) return false;
  if (el.tagName === 'TEXTAREA') return true;
  return el.tagName === 'INPUT' && !['checkbox', 'radio', 'button', 'submit', 'reset', 'file', 'hidden', 'image', 'range', 'color']
    .includes((el.type || 'text').toLowerCase());
}

/**
 * Compact popup date picker attached to a trigger element.
 * Supports single date, range selection, and date + time.
 * @param {Element|string|Object} targetOrOpts
 * @param {Object} [maybeOpts]
 * @returns {Object}
 */
export function lkDate(targetOrOpts, maybeOpts) {
  const { target, opts } = resolveArgs(targetOrOpts, maybeOpts);
  const trigger = resolveTarget(target);

  const baseOptions = {
    value: null,
    min: null,
    max: null,
    locale: 'en-US',
    placement: 'bottom-left',
    autoPlacement: true,
    closeOnOutside: true,
    closeOnEscape: true,
    toggleOnTrigger: true,
    zIndex: 95,
    open: false,
    range: false,
    time: false,
    timeFormat: '12',
    seconds: false,
    minuteStep: 1,
    displayFormat: null,
    isoFormat: null,
    rangeSeparator: ' – ',
    input: null,
    name: null,
    holidays: null,
    disabledDates: null,
    disabledDays: null,
    disableHolidays: false,
    allowDisabledInRange: false,
    cancelText: 'Cancel',
    okText: 'OK',
    nowText: 'Now',
    onOpen: null,
    onClose: null,
    onChange: null,
    onConfirm: null,
    ...opts,
  };

  const options = {
    ...baseOptions,
    time: !!baseOptions.time,
    range: !!baseOptions.range && !baseOptions.time,
    timeFormat: normalizeTimeFormat(baseOptions.timeFormat),
    seconds: !!baseOptions.seconds,
    minuteStep: Math.min(30, Math.max(1, Math.trunc(Number(baseOptions.minuteStep) || 1))),
  };

  const minDate = parseDate(options.min);
  const maxDate = parseDate(options.max);

  let holidayRule = compileDateRules(options.holidays);
  let disabledRule = compileDateRules(options.disabledDates);
  const disabledWeekdays = new Set((options.disabledDays || []).map(Number));

  let singleValue = null;
  let rangeStart = null;
  let rangeEnd = null;

  if (options.range) {
    [rangeStart, rangeEnd] = parseInitialRange(options.value, minDate, maxDate);
  } else {
    const parsed = parseDate(options.value);
    if (parsed) {
      singleValue = options.time
        ? clampDateTime(composeDateTime(parsed, createTimeState(parsed)), minDate, maxDate)
        : clampDate(parsed, minDate, maxDate);
    }
  }

  const initialViewSeed = options.range ? (rangeStart || new Date()) : (singleValue || new Date());
  let viewDate = new Date(initialViewSeed.getFullYear(), initialViewSeed.getMonth(), 1);

  let hoverDate = null;
  // Time mode works on a draft (day + time) that OK commits
  let draftDay = null;
  let timeDraft = createTimeState(singleValue);

  const markup = '' +
    '<div class="lk-date lk-date--compact">' +
    '  <div class="lk-date__header">' +
    '    <button type="button" class="lk-date__nav lk-date__nav--prev" aria-label="Previous month"></button>' +
    '    <div class="lk-date__controls">' +
    '      <select class="lk-date__select lk-date__select--month" aria-label="Month"></select>' +
    '      <select class="lk-date__select lk-date__select--year" aria-label="Year"></select>' +
    '    </div>' +
    '    <button type="button" class="lk-date__nav lk-date__nav--next" aria-label="Next month"></button>' +
    '  </div>' +
    '  <div class="lk-date__weekdays"></div>' +
    '  <div class="lk-date__grid"></div>' +
    '  <div class="lk-date__time" hidden>' +
    '    <span class="lk-date__time-icon" aria-hidden="true"></span>' +
    '    <select class="lk-date__select lk-date__time-select" data-part="hour" aria-label="Hour"></select>' +
    '    <span class="lk-date__time-sep" aria-hidden="true">:</span>' +
    '    <select class="lk-date__select lk-date__time-select" data-part="minute" aria-label="Minute"></select>' +
    '    <span class="lk-date__time-sep lk-date__time-sep--second" aria-hidden="true">:</span>' +
    '    <select class="lk-date__select lk-date__time-select" data-part="second" aria-label="Second"></select>' +
    '    <div class="lk-date__ampm" role="group" aria-label="AM or PM">' +
    '      <button type="button" class="lk-date__ampm-btn" data-meridiem="AM">AM</button>' +
    '      <button type="button" class="lk-date__ampm-btn" data-meridiem="PM">PM</button>' +
    '    </div>' +
    '  </div>' +
    '  <div class="lk-date__footer" hidden>' +
    '    <div class="lk-date__summary" aria-live="polite"></div>' +
    '    <div class="lk-date__actions">' +
    '      <button type="button" class="lk-btn lk-btn--ghost lk-btn--sm lk-date__now"></button>' +
    '      <button type="button" class="lk-btn lk-btn--secondary lk-btn--sm lk-date__cancel"></button>' +
    '      <button type="button" class="lk-btn lk-btn--primary lk-btn--sm lk-date__ok"></button>' +
    '    </div>' +
    '  </div>' +
    '</div>';

  const proxy = lkPopupProxy(trigger, {
    content: markup,
    placement: options.placement,
    autoPlacement: options.autoPlacement,
    closeOnOutside: options.closeOnOutside,
    closeOnEscape: options.closeOnEscape,
    toggleOnTrigger: options.toggleOnTrigger,
    className: 'lk-date-proxy',
    zIndex: options.zIndex,
    open: false,
    onShow() {
      resetTransientState();

      if (typeof options.onOpen === 'function') {
        options.onOpen(api);
      }
    },
    onHide(reason) {
      if (typeof options.onClose === 'function') {
        options.onClose(reason, api);
      }
    },
  });

  const panel = proxy.panelEl;
  const root = panel.querySelector('.lk-date');

  const prevBtn = root.querySelector('.lk-date__nav--prev');
  const nextBtn = root.querySelector('.lk-date__nav--next');
  const monthSelect = root.querySelector('.lk-date__select--month');
  const yearSelect = root.querySelector('.lk-date__select--year');
  const weekdaysRow = root.querySelector('.lk-date__weekdays');
  const grid = root.querySelector('.lk-date__grid');

  const timeRow = root.querySelector('.lk-date__time');
  const hourSelect = root.querySelector('[data-part="hour"]');
  const minuteSelect = root.querySelector('[data-part="minute"]');
  const secondSelect = root.querySelector('[data-part="second"]');
  const secondSep = root.querySelector('.lk-date__time-sep--second');
  const ampmRow = root.querySelector('.lk-date__ampm');
  const ampmButtons = Array.from(root.querySelectorAll('.lk-date__ampm-btn'));
  const footer = root.querySelector('.lk-date__footer');
  const summaryEl = root.querySelector('.lk-date__summary');
  const nowBtn = root.querySelector('.lk-date__now');
  const okBtn = root.querySelector('.lk-date__ok');
  const cancelBtn = root.querySelector('.lk-date__cancel');

  prevBtn.appendChild(lkIcon('chevron-left', { size: 'sm' }));
  nextBtn.appendChild(lkIcon('chevron-right', { size: 'sm' }));
  root.querySelector('.lk-date__time-icon').appendChild(lkIcon('clock', { size: 'sm' }));

  okBtn.textContent = options.okText;
  cancelBtn.textContent = options.cancelText;
  nowBtn.textContent = options.nowText;

  createWeekdayLabels(options.locale).forEach((label) => {
    const cell = document.createElement('div');
    cell.className = 'lk-date__weekday';
    cell.textContent = label;
    weekdaysRow.appendChild(cell);
  });

  // --- Formatting ------------------------------------------------------------------------

  const defaultDisplay = new Intl.DateTimeFormat(options.locale, options.time
    ? { dateStyle: 'medium', timeStyle: options.seconds ? 'medium' : 'short', hour12: options.timeFormat === '12' }
    : { dateStyle: 'medium' });
  const isoPattern = options.isoFormat || (options.time ? "yyyy-MM-dd'T'HH:mm:ss.SSS" : 'yyyy-MM-dd');

  function displayOf(d) {
    if (!d) return '';
    return options.displayFormat ? formatDate(d, options.displayFormat, options.locale) : defaultDisplay.format(d);
  }

  function isoOf(d) {
    if (!d) return '';
    if (isoPattern === 'utc') return d.toISOString();
    return formatDate(d, isoPattern, options.locale);
  }

  function formatValue(fn) {
    if (options.range) {
      if (!rangeStart) return '';
      return rangeEnd ? `${fn(rangeStart)}${options.rangeSeparator}${fn(rangeEnd)}` : fn(rangeStart);
    }
    return fn(singleValue);
  }

  function display() {
    return formatValue(displayOf);
  }

  function iso() {
    if (options.range) return [rangeStart ? isoOf(rangeStart) : null, rangeEnd ? isoOf(rangeEnd) : null];
    return singleValue ? isoOf(singleValue) : null;
  }

  function format(pattern) {
    return formatValue((d) => formatDate(d, pattern, options.locale));
  }

  // --- Bound input (display text) + hidden ISO input ----------------------------------------

  function resolveBound() {
    const ref = options.input;
    if (ref === false) return null;
    if (ref == null || ref === true) return (options.displayFormat || ref === true) && isTextInput(trigger) ? trigger : null;
    if (typeof ref === 'string') return document.querySelector(ref);
    if (ref instanceof Element) return ref;
    return ref.el instanceof Element ? ref.el : null; // a LookUI component (lkTextbox…)
  }
  const boundInput = resolveBound();

  const hiddenInputs = [];
  if (options.name) {
    const names = Array.isArray(options.name) ? options.name : [options.name];
    const anchor = boundInput || trigger;
    names.forEach((n) => {
      const h = document.createElement('input');
      h.type = 'hidden';
      h.name = n;
      hiddenInputs.push(h);
    });
    anchor.after(...hiddenInputs);
  }

  function syncBound(fire) {
    const iv = iso();
    if (hiddenInputs.length === 2) {
      hiddenInputs[0].value = iv?.[0] || '';
      hiddenInputs[1].value = iv?.[1] || '';
    } else if (hiddenInputs.length) {
      hiddenInputs[0].value = Array.isArray(iv) ? iv.filter(Boolean).join('/') : (iv || '');
    }
    if (!boundInput) return;
    const text = display();
    if (boundInput.value === text) return;
    boundInput.value = text;
    if (fire) {
      // Lets listeners (e.g. lkTextbox validation) react as if the user typed
      boundInput.dispatchEvent(new Event('input', { bubbles: true }));
      boundInput.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }

  function emitChange(value, source) {
    syncBound(source !== 'init');
    if (typeof options.onChange === 'function') {
      options.onChange(value, { source, display: display(), iso: iso() });
    }
  }

  function emitConfirm(value) {
    if (typeof options.onConfirm === 'function') {
      options.onConfirm(value, api);
    }
  }

  // --- Day rules -------------------------------------------------------------------------

  function holidayOf(date) {
    if (!holidayRule) return false;
    const r = holidayRule(date);
    if (!r) return false;
    if (typeof r === 'string') return r;
    if (typeof r === 'object' && r.label != null) return String(r.label);
    return '';
  }

  function isDisabledDay(date) {
    if (disabledWeekdays.has(date.getDay())) return true;
    if (disabledRule && disabledRule(date)) return true;
    return !!options.disableHolidays && holidayOf(date) !== false;
  }

  function isSelectable(date) {
    return withinBounds(date, minDate, maxDate) && !isDisabledDay(date);
  }

  // First unselectable day after `start` (ranges cannot cross it unless allowDisabledInRange)
  function rangeLimit(start) {
    if (!start || options.allowDisabledInRange) return null;
    const d = toStartOfDay(start);
    for (let i = 0; i < RANGE_SCAN_DAYS; i += 1) {
      d.setDate(d.getDate() + 1);
      if (maxDate && d > toStartOfDay(maxDate)) return null;
      if (isDisabledDay(d)) return new Date(d);
    }
    return null;
  }

  // --- Calendar ------------------------------------------------------------------------------

  function getYearBounds() {
    if (minDate || maxDate) {
      return {
        start: minDate ? minDate.getFullYear() : viewDate.getFullYear() - 60,
        end: maxDate ? maxDate.getFullYear() : viewDate.getFullYear() + 40,
      };
    }

    return {
      start: viewDate.getFullYear() - 60,
      end: viewDate.getFullYear() + 40,
    };
  }

  function syncSelectors() {
    const monthFormatter = new Intl.DateTimeFormat(options.locale, { month: 'short' });
    const bounds = getYearBounds();

    monthSelect.textContent = '';
    for (let month = 0; month < 12; month += 1) {
      const option = document.createElement('option');
      option.value = String(month);
      option.textContent = monthFormatter.format(new Date(2025, month, 1));
      option.disabled = !monthIsSelectable(viewDate.getFullYear(), month, minDate, maxDate);
      monthSelect.appendChild(option);
    }

    yearSelect.textContent = '';
    for (let year = bounds.start; year <= bounds.end; year += 1) {
      const option = document.createElement('option');
      option.value = String(year);
      option.textContent = String(year);

      const hasMonth = Array.from({ length: 12 }).some((_, idx) => {
        return monthIsSelectable(year, idx, minDate, maxDate);
      });

      option.disabled = !hasMonth;
      yearSelect.appendChild(option);
    }

    monthSelect.value = String(viewDate.getMonth());
    yearSelect.value = String(viewDate.getFullYear());
  }

  function inCurrentRange(date) {
    if (!rangeStart || !rangeEnd) return false;
    const d = toStartOfDay(date).getTime();
    const a = toStartOfDay(rangeStart).getTime();
    const b = toStartOfDay(rangeEnd).getTime();
    return d > a && d < b;
  }

  let hoverLimit = null;
  function inHoverRange(date) {
    if (!options.range || !rangeStart || rangeEnd || !hoverDate) return false;

    // Preview only forward from the start: clicking an earlier day restarts the range.
    const d = toStartOfDay(date).getTime();
    const a = toStartOfDay(rangeStart).getTime();
    const b = toStartOfDay(hoverDate).getTime();
    if (hoverLimit && b >= hoverLimit.getTime()) return false;

    return b >= a && d >= a && d <= b;
  }

  function syncRangeHover() {
    Array.from(grid.children).forEach((btn) => {
      const date = parseDate(btn.dataset.date);
      const isEdge = btn.classList.contains('lk-date__day--range-start')
        || btn.classList.contains('lk-date__day--range-end')
        || btn.classList.contains('lk-date__day--in-range');
      btn.classList.toggle('lk-date__day--range-hover', !!date && !isEdge && inHoverRange(date));
    });
  }

  function syncGrid() {
    grid.textContent = '';

    const today = toStartOfDay(new Date());
    const days = createCalendarDays(viewDate);
    const dayLabel = new Intl.DateTimeFormat(options.locale, { dateStyle: 'full' });
    hoverLimit = options.range && rangeStart && !rangeEnd ? rangeLimit(rangeStart) : null;

    days.forEach((date) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'lk-date__day';
      btn.textContent = String(date.getDate());

      const inCurrentMonth = date.getMonth() === viewDate.getMonth();
      const isToday = sameDay(date, today);
      const isEnabled = isSelectable(date);
      const holiday = holidayOf(date);

      const selectedDay = options.time ? (draftDay || singleValue) : singleValue;
      const isSingleSelected = !options.range && selectedDay && sameDay(date, selectedDay);
      const isRangeStart = options.range && rangeStart && sameDay(date, rangeStart);
      const isRangeEnd = options.range && rangeEnd && sameDay(date, rangeEnd);
      const isRangeMid = options.range && inCurrentRange(date);
      const isRangeHover = options.range && inHoverRange(date);

      if (!inCurrentMonth) btn.classList.add('lk-date__day--muted');
      if (isToday) btn.classList.add('lk-date__day--today');
      if (holiday !== false) {
        btn.classList.add('lk-date__day--holiday');
        if (holiday) btn.title = holiday;
      }
      if (!isEnabled) {
        btn.classList.add('lk-date__day--disabled');
        btn.disabled = true;
      }

      if (isSingleSelected || isRangeStart || isRangeEnd) {
        btn.classList.add('lk-date__day--selected');
        btn.setAttribute('aria-pressed', 'true');
      }

      if (isRangeStart) btn.classList.add('lk-date__day--range-start');
      if (isRangeEnd) btn.classList.add('lk-date__day--range-end');
      if (isRangeMid) btn.classList.add('lk-date__day--in-range');
      if (isRangeHover && !isRangeStart && !isRangeEnd && !isRangeMid) {
        btn.classList.add('lk-date__day--range-hover');
      }

      btn.setAttribute('aria-label', dayLabel.format(date) + (holiday ? ` — ${holiday}` : ''));
      btn.dataset.date = toIsoDate(date);
      grid.appendChild(btn);
    });
  }

  function syncNavDisabled() {
    const prevDate = new Date(viewDate.getFullYear(), viewDate.getMonth() - 1, 1);
    const nextDate = new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 1);

    prevBtn.disabled = !monthIsSelectable(prevDate.getFullYear(), prevDate.getMonth(), minDate, maxDate);
    nextBtn.disabled = !monthIsSelectable(nextDate.getFullYear(), nextDate.getMonth(), minDate, maxDate);
  }

  // --- Time row --------------------------------------------------------------------------------

  function fillSelect(select, values, label) {
    select.textContent = '';
    values.forEach((v) => {
      const o = document.createElement('option');
      o.value = String(v);
      o.textContent = label(v);
      select.appendChild(o);
    });
  }

  function setSelect(select, value, label) {
    // Keep values that fall between minute steps (e.g. 10:07 with a 15-minute step)
    if (!Array.from(select.options).some((o) => o.value === String(value))) {
      const o = document.createElement('option');
      o.value = String(value);
      o.textContent = label(value);
      const after = Array.from(select.options).find((x) => Number(x.value) > value);
      select.insertBefore(o, after || null);
    }
    select.value = String(value);
  }

  const two = (n) => String(n).padStart(2, '0');
  const hourLabel = (h) => (options.timeFormat === '12' ? String(h) : two(h));

  if (options.time) {
    fillSelect(hourSelect, options.timeFormat === '12' ? [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] : Array.from({ length: 24 }, (_, i) => i), hourLabel);
    fillSelect(minuteSelect, Array.from({ length: Math.ceil(60 / options.minuteStep) }, (_, i) => i * options.minuteStep), two);
    fillSelect(secondSelect, Array.from({ length: 60 }, (_, i) => i), two);
    timeRow.hidden = false;
    footer.hidden = false;
    root.classList.add('lk-date--time-enabled');
    secondSelect.hidden = !options.seconds;
    secondSep.hidden = !options.seconds;
    ampmRow.hidden = options.timeFormat !== '12';
  }

  function draftValue() {
    return draftDay ? composeDateTime(draftDay, timeDraft) : null;
  }

  function syncTime() {
    if (!options.time) return;
    const h = timeDraft.hour24;
    setSelect(hourSelect, options.timeFormat === '12' ? (h % 12 || 12) : h, hourLabel);
    setSelect(minuteSelect, timeDraft.minute, two);
    setSelect(secondSelect, timeDraft.second, two);
    const meridiem = h >= 12 ? 'PM' : 'AM';
    ampmButtons.forEach((btn) => {
      const active = btn.dataset.meridiem === meridiem;
      btn.classList.toggle('lk-date__ampm-btn--active', active);
      btn.setAttribute('aria-pressed', String(active));
    });
    const draft = draftValue();
    summaryEl.textContent = draft ? displayOf(draft) : 'Pick a day';
    summaryEl.classList.toggle('lk-date__summary--empty', !draft);
    okBtn.disabled = !draft;
  }

  function onTimeSelect(e) {
    const part = e.target.dataset?.part;
    if (!part) return;
    const v = Number(e.target.value);
    if (part === 'hour') {
      if (options.timeFormat === '12') {
        const pm = timeDraft.hour24 >= 12;
        timeDraft.hour24 = (v % 12) + (pm ? 12 : 0);
      } else {
        timeDraft.hour24 = v;
      }
    } else if (part === 'minute') timeDraft.minute = v;
    else if (part === 'second') timeDraft.second = v;
    syncTime();
  }

  function onMeridiemClick(e) {
    const btn = e.target.closest('.lk-date__ampm-btn');
    if (!btn) return;
    const pm = timeDraft.hour24 >= 12;
    if (btn.dataset.meridiem === 'AM' && pm) timeDraft.hour24 -= 12;
    if (btn.dataset.meridiem === 'PM' && !pm) timeDraft.hour24 += 12;
    syncTime();
  }

  function onNow() {
    const now = new Date();
    const step = options.minuteStep;
    timeDraft = {
      hour24: now.getHours(),
      minute: Math.floor(now.getMinutes() / step) * step,
      second: options.seconds ? now.getSeconds() : 0,
    };
    if (isSelectable(now)) draftDay = toStartOfDay(now);
    viewDate = new Date(now.getFullYear(), now.getMonth(), 1);
    refreshDateView();
    syncTime();
  }

  function onOk() {
    const draft = draftValue();
    if (!draft) return;
    singleValue = clampDateTime(draft, minDate, maxDate);
    viewDate = new Date(singleValue.getFullYear(), singleValue.getMonth(), 1);
    refreshDateView();
    emitChange(new Date(singleValue), 'confirm');
    emitConfirm(new Date(singleValue));
    proxy.hide('select');
  }

  function onCancel() {
    proxy.hide('cancel');
  }

  function onPanelKeydown(e) {
    if (!options.time || e.key !== 'Enter' || e.defaultPrevented) return;
    if (e.target.closest('button, select')) return; // buttons/selects handle Enter themselves
    e.preventDefault();
    onOk();
  }

  // --- View ----------------------------------------------------------------------------------

  function refreshDateView() {
    syncSelectors();
    syncGrid();
    syncNavDisabled();
    syncTime();

    if (proxy.isOpen) {
      proxy.updatePosition(trigger);
    }
  }

  function setMonth(input) {
    const parsed = parseDate(input);
    if (!parsed) return;
    viewDate = new Date(parsed.getFullYear(), parsed.getMonth(), 1);
    refreshDateView();
  }

  function setValue(input, source = 'api') {
    if (options.range) {
      const [a, b] = parseInitialRange(input, minDate, maxDate);
      rangeStart = a;
      rangeEnd = b;
      hoverDate = null;

      if (rangeStart) {
        viewDate = new Date(rangeStart.getFullYear(), rangeStart.getMonth(), 1);
      }

      refreshDateView();
      emitChange([rangeStart ? new Date(rangeStart) : null, rangeEnd ? new Date(rangeEnd) : null], source);
      return;
    }

    const parsed = parseDate(input);
    if (!parsed) {
      singleValue = null;
      draftDay = null;
      hoverDate = null;
      refreshDateView();
      emitChange(null, source);
      return;
    }

    if (options.time) {
      singleValue = clampDateTime(parsed, minDate, maxDate);
      hoverDate = null;
      draftDay = toStartOfDay(singleValue);
      timeDraft = createTimeState(singleValue);
      viewDate = new Date(singleValue.getFullYear(), singleValue.getMonth(), 1);
      refreshDateView();
      emitChange(new Date(singleValue), source);
      return;
    }

    singleValue = clampDate(parsed, minDate, maxDate);
    if (singleValue) {
      viewDate = new Date(singleValue.getFullYear(), singleValue.getMonth(), 1);
    }

    refreshDateView();
    emitChange(singleValue ? new Date(singleValue) : null, source);
  }

  function prevMonth() {
    const prev = new Date(viewDate.getFullYear(), viewDate.getMonth() - 1, 1);
    if (!monthIsSelectable(prev.getFullYear(), prev.getMonth(), minDate, maxDate)) return;
    viewDate = prev;
    refreshDateView();
  }

  function nextMonth() {
    const next = new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 1);
    if (!monthIsSelectable(next.getFullYear(), next.getMonth(), minDate, maxDate)) return;
    viewDate = next;
    refreshDateView();
  }

  function commitSingleDate(day) {
    singleValue = new Date(day);
    refreshDateView();
    emitChange(new Date(singleValue), 'pick');
    emitConfirm(new Date(singleValue));
    proxy.hide('select');
  }

  function startRange(day) {
    rangeStart = new Date(day);
    rangeEnd = null;
    hoverDate = new Date(day);
    refreshDateView();
    emitChange([new Date(rangeStart), null], 'range-start');
  }

  function commitRange(day) {
    const picked = new Date(day);
    if (!rangeStart || rangeEnd || picked < rangeStart) {
      startRange(picked);
      return;
    }

    // A range may not cross a disabled day: start over from the clicked day
    const limit = rangeLimit(rangeStart);
    if (limit && picked >= limit) {
      startRange(picked);
      return;
    }

    rangeEnd = picked;
    hoverDate = null;
    refreshDateView();

    const result = [new Date(rangeStart), new Date(rangeEnd)];
    emitChange(result, 'range-end');
    emitConfirm(result);
    proxy.hide('select');
  }

  function onGridClick(e) {
    const dayEl = e.target.closest('.lk-date__day');
    if (!dayEl || dayEl.disabled) return;

    const parsed = parseDate(dayEl.dataset.date);
    if (!parsed || !isSelectable(parsed)) return;

    const day = toStartOfDay(parsed);

    if (options.time) {
      draftDay = day;
      syncGrid();
      syncTime();
      return;
    }

    if (options.range) {
      commitRange(day);
      return;
    }

    commitSingleDate(day);
  }

  function onGridPointerMove(e) {
    if (!options.range || !rangeStart || rangeEnd) return;

    const dayEl = e.target.closest('.lk-date__day');
    if (!dayEl || dayEl.disabled) return;

    const parsed = parseDate(dayEl.dataset.date);
    if (!parsed || !withinBounds(parsed, minDate, maxDate)) return;

    const nextHover = toStartOfDay(parsed);
    if (hoverDate && sameDay(hoverDate, nextHover)) return;

    hoverDate = nextHover;
    syncRangeHover();
  }

  function onGridPointerLeave() {
    if (!options.range || !rangeStart || rangeEnd) return;
    if (!hoverDate) return;

    hoverDate = null;
    syncRangeHover();
  }

  function onMonthChange() {
    const year = Number(yearSelect.value);
    const month = Number(monthSelect.value);
    const next = new Date(year, month, 1);

    if (!monthIsSelectable(next.getFullYear(), next.getMonth(), minDate, maxDate)) {
      syncSelectors();
      return;
    }

    viewDate = next;
    refreshDateView();
  }

  // Every open starts from the committed value (an uncommitted time draft is dropped)
  function resetTransientState() {
    hoverDate = null;
    if (options.time) {
      draftDay = singleValue ? toStartOfDay(singleValue) : null;
      timeDraft = createTimeState(singleValue);
      if (singleValue) viewDate = new Date(singleValue.getFullYear(), singleValue.getMonth(), 1);
    }
    refreshDateView();
  }

  prevBtn.addEventListener('click', prevMonth);
  nextBtn.addEventListener('click', nextMonth);
  monthSelect.addEventListener('change', onMonthChange);
  yearSelect.addEventListener('change', onMonthChange);
  grid.addEventListener('click', onGridClick);
  grid.addEventListener('pointermove', onGridPointerMove);
  grid.addEventListener('pointerleave', onGridPointerLeave);
  timeRow.addEventListener('change', onTimeSelect);
  ampmRow.addEventListener('click', onMeridiemClick);
  nowBtn.addEventListener('click', onNow);
  cancelBtn.addEventListener('click', onCancel);
  okBtn.addEventListener('click', onOk);
  root.addEventListener('keydown', onPanelKeydown);

  refreshDateView();

  function open() {
    proxy.show(trigger);
    return api;
  }

  function close(reason = 'close') {
    proxy.hide(reason);
    return api;
  }

  function toggle() {
    proxy.toggle(trigger);
    return api;
  }

  function destroy() {
    prevBtn.removeEventListener('click', prevMonth);
    nextBtn.removeEventListener('click', nextMonth);
    monthSelect.removeEventListener('change', onMonthChange);
    yearSelect.removeEventListener('change', onMonthChange);
    grid.removeEventListener('click', onGridClick);
    grid.removeEventListener('pointermove', onGridPointerMove);
    grid.removeEventListener('pointerleave', onGridPointerLeave);
    timeRow.removeEventListener('change', onTimeSelect);
    ampmRow.removeEventListener('click', onMeridiemClick);
    nowBtn.removeEventListener('click', onNow);
    cancelBtn.removeEventListener('click', onCancel);
    okBtn.removeEventListener('click', onOk);
    root.removeEventListener('keydown', onPanelKeydown);
    hiddenInputs.forEach((h) => h.remove());
    proxy.destroy();
  }

  const api = {
    el: proxy.el,
    panelEl: proxy.panelEl,
    open,
    close,
    toggle,
    setValue,
    setMonth,
    nextMonth,
    prevMonth,
    display,
    iso,
    format,
    /** Is the day pickable (inside min/max, not disabled)? */
    isDisabled(date) {
      const d = parseDate(date);
      return !d || !isSelectable(d);
    },
    /** Holiday label ('' for an unnamed holiday) or false. */
    holiday(date) {
      const d = parseDate(date);
      return d ? holidayOf(d) : false;
    },
    setHolidays(list) {
      holidayRule = compileDateRules(list);
      refreshDateView();
      return api;
    },
    setDisabledDates(list) {
      disabledRule = compileDateRules(list);
      refreshDateView();
      return api;
    },
    destroy,
    get isOpen() {
      return proxy.isOpen;
    },
    get value() {
      if (options.range) {
        return [rangeStart ? new Date(rangeStart) : null, rangeEnd ? new Date(rangeEnd) : null];
      }
      return singleValue ? new Date(singleValue) : null;
    },
  };

  syncBound(false);

  if (options.open) {
    open();
  }

  return api;
}
