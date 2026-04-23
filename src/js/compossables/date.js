import { lkPopupProxy } from './popupProxy.js';
import { lkIcon } from '../components/icon.js';

const WEEKDAY_START = 0;

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

function formatPreview(parts, format) {
  const minute = String(parts.minute).padStart(2, '0');
  const second = String(parts.second).padStart(2, '0');

  if (format === '12') {
    const meridiem = parts.hour24 >= 12 ? 'PM' : 'AM';
    const raw = parts.hour24 % 12;
    const hour = raw === 0 ? 12 : raw;
    return `${hour}:${minute}:${second} ${meridiem}`;
  }

  const hour = String(parts.hour24).padStart(2, '0');
  return `${hour}:${minute}:${second}`;
}

function adjustTime(parts, part, delta) {
  if (part === 'hour') {
    parts.hour24 = (parts.hour24 + delta + 24) % 24;
    return;
  }

  if (part === 'minute') {
    parts.minute = (parts.minute + delta + 60) % 60;
    return;
  }

  if (part === 'second') {
    parts.second = (parts.second + delta + 60) % 60;
  }
}

function composeDateTime(date, parts) {
  const out = new Date(date);
  out.setHours(parts.hour24, parts.minute, parts.second, 0);
  return out;
}

/**
 * Compact popup date picker attached to a trigger element.
 * Supports single date, range selection, and optional datetime flow.
 * @param {Element|string|Object} targetOrOpts
 * @param {Object} [maybeOpts]
 * @returns {{ el: Element, panelEl: Element, open: Function, close: Function, toggle: Function, setValue: Function, setMonth: Function, nextMonth: Function, prevMonth: Function, destroy: Function, isOpen: boolean, value: Date|Array<Date|null>|null }}
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
    cancelText: 'Cancel',
    okText: 'OK',
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
  };

  const minDate = parseDate(options.min);
  const maxDate = parseDate(options.max);

  let singleValue = null;
  let rangeStart = null;
  let rangeEnd = null;

  if (options.range) {
    [rangeStart, rangeEnd] = parseInitialRange(options.value, minDate, maxDate);
  } else {
    const parsed = parseDate(options.value);
    if (parsed) {
      singleValue = options.time
        ? composeDateTime(parsed, createTimeState(parsed))
        : clampDate(parsed, minDate, maxDate);
    }
  }

  const initialViewSeed = options.range ? (rangeStart || new Date()) : (singleValue || new Date());
  let viewDate = new Date(initialViewSeed.getFullYear(), initialViewSeed.getMonth(), 1);

  let viewMode = 'date'; // date | time
  let pendingTimeDate = null;
  let hoverDate = null;
  let timeDraft = createTimeState(singleValue);

  const markup = '' +
    '<div class="lk-date lk-date--compact">' +
    '  <div class="lk-date__viewport">' +
    '    <div class="lk-date__track">' +
    '      <div class="lk-date__date-view">' +
    '        <div class="lk-date__header">' +
    '          <button type="button" class="lk-date__nav lk-date__nav--prev" aria-label="Previous month"></button>' +
    '          <div class="lk-date__controls">' +
    '            <select class="lk-date__select lk-date__select--month" aria-label="Month"></select>' +
    '            <select class="lk-date__select lk-date__select--year" aria-label="Year"></select>' +
    '          </div>' +
    '          <button type="button" class="lk-date__nav lk-date__nav--next" aria-label="Next month"></button>' +
    '        </div>' +
    '        <div class="lk-date__weekdays"></div>' +
    '        <div class="lk-date__grid"></div>' +
    '      </div>' +
    '      <div class="lk-date__time-view" aria-hidden="true">' +
    '        <div class="lk-date__separator"></div>' +
    '        <div class="lk-date__time-grid">' +
    '          <div class="lk-date__time-col">' +
    '            <button type="button" class="lk-date__time-btn" data-part="hour" data-dir="up" aria-label="Increase hour"></button>' +
    '            <div class="lk-date__time-value" data-time-value="hour"></div>' +
    '            <div class="lk-date__time-label">hour</div>' +
    '            <button type="button" class="lk-date__time-btn" data-part="hour" data-dir="down" aria-label="Decrease hour"></button>' +
    '          </div>' +
    '          <div class="lk-date__time-col">' +
    '            <button type="button" class="lk-date__time-btn" data-part="minute" data-dir="up" aria-label="Increase minute"></button>' +
    '            <div class="lk-date__time-value" data-time-value="minute"></div>' +
    '            <div class="lk-date__time-label">min</div>' +
    '            <button type="button" class="lk-date__time-btn" data-part="minute" data-dir="down" aria-label="Decrease minute"></button>' +
    '          </div>' +
    '          <div class="lk-date__time-col">' +
    '            <button type="button" class="lk-date__time-btn" data-part="second" data-dir="up" aria-label="Increase second"></button>' +
    '            <div class="lk-date__time-value" data-time-value="second"></div>' +
    '            <div class="lk-date__time-label">sec</div>' +
    '            <button type="button" class="lk-date__time-btn" data-part="second" data-dir="down" aria-label="Decrease second"></button>' +
    '          </div>' +
    '        </div>' +
    '        <div class="lk-date__ampm" hidden>' +
    '          <button type="button" class="lk-date__ampm-btn" data-meridiem="AM">AM</button>' +
    '          <button type="button" class="lk-date__ampm-btn" data-meridiem="PM">PM</button>' +
    '        </div>' +
    '        <div class="lk-date__time-preview"></div>' +
    '        <div class="lk-date__separator"></div>' +
    '        <div class="lk-date__time-actions">' +
    '          <button type="button" class="lk-btn lk-btn--secondary lk-date__time-cancel"></button>' +
    '          <button type="button" class="lk-btn lk-btn--primary lk-date__time-ok"></button>' +
    '        </div>' +
    '      </div>' +
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
      if (typeof options.onOpen === 'function') {
        options.onOpen(api);
      }
    },
    onHide(reason) {
      viewMode = 'date';
      pendingTimeDate = null;
      hoverDate = null;
      syncViewMode();

      if (typeof options.onClose === 'function') {
        options.onClose(reason, api);
      }
    },
  });

  const panel = proxy.panelEl;
  const root = panel.querySelector('.lk-date');

  const dateViewEl = root.querySelector('.lk-date__date-view');
  const timeViewEl = root.querySelector('.lk-date__time-view');

  const prevBtn = root.querySelector('.lk-date__nav--prev');
  const nextBtn = root.querySelector('.lk-date__nav--next');
  const monthSelect = root.querySelector('.lk-date__select--month');
  const yearSelect = root.querySelector('.lk-date__select--year');
  const weekdaysRow = root.querySelector('.lk-date__weekdays');
  const grid = root.querySelector('.lk-date__grid');

  const timeContainer = root.querySelector('.lk-date__time-grid');
  const hourValueEl = root.querySelector('[data-time-value="hour"]');
  const minuteValueEl = root.querySelector('[data-time-value="minute"]');
  const secondValueEl = root.querySelector('[data-time-value="second"]');
  const ampmRow = root.querySelector('.lk-date__ampm');
  const ampmButtons = Array.from(root.querySelectorAll('.lk-date__ampm-btn'));
  const previewEl = root.querySelector('.lk-date__time-preview');
  const okBtn = root.querySelector('.lk-date__time-ok');
  const cancelBtn = root.querySelector('.lk-date__time-cancel');

  const timeButtons = Array.from(root.querySelectorAll('.lk-date__time-btn'));

  prevBtn.appendChild(lkIcon('chevron-left', { size: 'sm' }));
  nextBtn.appendChild(lkIcon('chevron-right', { size: 'sm' }));

  timeButtons.forEach((btn) => {
    const iconName = btn.dataset.dir === 'up' ? 'chevron-up' : 'chevron-down';
    btn.appendChild(lkIcon(iconName, { size: 'sm' }));
  });

  okBtn.textContent = options.okText;
  cancelBtn.textContent = options.cancelText;

  createWeekdayLabels(options.locale).forEach((label) => {
    const cell = document.createElement('div');
    cell.className = 'lk-date__weekday';
    cell.textContent = label;
    weekdaysRow.appendChild(cell);
  });

  function emitChange(value, source) {
    if (typeof options.onChange === 'function') {
      options.onChange(value, { source });
    }
  }

  function emitConfirm(value) {
    if (typeof options.onConfirm === 'function') {
      options.onConfirm(value, api);
    }
  }

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

  function inHoverRange(date) {
    if (!options.range || !rangeStart || rangeEnd || !hoverDate) return false;

    const d = toStartOfDay(date).getTime();
    const a = toStartOfDay(rangeStart).getTime();
    const b = toStartOfDay(hoverDate).getTime();
    const from = Math.min(a, b);
    const to = Math.max(a, b);

    return d >= from && d <= to;
  }

  function syncGrid() {
    grid.textContent = '';

    const today = toStartOfDay(new Date());
    const days = createCalendarDays(viewDate);

    days.forEach((date) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'lk-date__day';
      btn.textContent = String(date.getDate());

      const inCurrentMonth = date.getMonth() === viewDate.getMonth();
      const isToday = sameDay(date, today);
      const isEnabled = withinBounds(date, minDate, maxDate);

      const isSingleSelected = !options.range && !options.time && singleValue && sameDay(date, singleValue);
      const isRangeStart = options.range && rangeStart && sameDay(date, rangeStart);
      const isRangeEnd = options.range && rangeEnd && sameDay(date, rangeEnd);
      const isRangeMid = options.range && inCurrentRange(date);
      const isRangeHover = options.range && inHoverRange(date);
      const isPending = options.time && pendingTimeDate && sameDay(date, pendingTimeDate);
      const isDateTimeCommitted = options.time && singleValue && sameDay(date, singleValue);

      if (!inCurrentMonth) btn.classList.add('lk-date__day--muted');
      if (isToday) btn.classList.add('lk-date__day--today');
      if (!isEnabled) {
        btn.classList.add('lk-date__day--disabled');
        btn.disabled = true;
      }

      if (isSingleSelected || isRangeStart || isRangeEnd || isPending || isDateTimeCommitted) {
        btn.classList.add('lk-date__day--selected');
      }

      if (isRangeStart) btn.classList.add('lk-date__day--range-start');
      if (isRangeEnd) btn.classList.add('lk-date__day--range-end');
      if (isRangeMid) btn.classList.add('lk-date__day--in-range');
      if (isRangeHover && !isRangeStart && !isRangeEnd && !isRangeMid) {
        btn.classList.add('lk-date__day--range-hover');
      }

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

  function syncTimeView() {
    const hour24 = timeDraft.hour24;
    const minute = String(timeDraft.minute).padStart(2, '0');
    const second = String(timeDraft.second).padStart(2, '0');

    if (options.timeFormat === '12') {
      const meridiem = hour24 >= 12 ? 'PM' : 'AM';
      const h = hour24 % 12 || 12;
      hourValueEl.textContent = String(h);
      ampmRow.hidden = false;
      ampmButtons.forEach((btn) => {
        btn.classList.toggle('lk-date__ampm-btn--active', btn.dataset.meridiem === meridiem);
      });
    } else {
      hourValueEl.textContent = String(hour24).padStart(2, '0');
      ampmRow.hidden = true;
    }

    minuteValueEl.textContent = minute;
    secondValueEl.textContent = second;
    previewEl.textContent = formatPreview(timeDraft, options.timeFormat);
  }

  function syncViewMode() {
    if (!options.time) {
      viewMode = 'date';
    }

    const isTime = viewMode === 'time' && options.time;

    root.classList.toggle('lk-date--time-enabled', options.time);
    root.classList.toggle('lk-date--view-time', isTime);
    dateViewEl.setAttribute('aria-hidden', String(isTime));
    timeViewEl.setAttribute('aria-hidden', String(!isTime));

    if (isTime) {
      syncTimeView();
    }

    if (proxy.isOpen) {
      proxy.updatePosition(trigger);
    }
  }

  function refreshDateView() {
    syncSelectors();
    syncGrid();
    syncNavDisabled();

    if (proxy.isOpen && viewMode === 'date') {
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
      hoverDate = null;
      refreshDateView();
      emitChange(null, source);
      return;
    }

    if (options.time) {
      singleValue = new Date(parsed);
      hoverDate = null;
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

  function commitRange(day) {
    if (!rangeStart || (rangeStart && rangeEnd)) {
      rangeStart = new Date(day);
      rangeEnd = null;
      hoverDate = new Date(day);
      refreshDateView();
      emitChange([new Date(rangeStart), null], 'range-start');
      return;
    }

    const picked = new Date(day);
    if (picked < rangeStart) {
      rangeStart = picked;
      rangeEnd = null;
      hoverDate = new Date(picked);
      refreshDateView();
      emitChange([new Date(rangeStart), null], 'range-start');
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

  function moveToTime(day) {
    pendingTimeDate = new Date(day);

    if (singleValue) {
      timeDraft = createTimeState(singleValue);
    } else {
      timeDraft = createTimeState();
    }

    viewMode = 'time';
    syncViewMode();
  }

  function onGridClick(e) {
    const dayEl = e.target.closest('.lk-date__day');
    if (!dayEl || dayEl.disabled) return;

    const parsed = parseDate(dayEl.dataset.date);
    if (!parsed || !withinBounds(parsed, minDate, maxDate)) return;

    const day = toStartOfDay(parsed);

    if (options.time) {
      moveToTime(day);
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
    syncGrid();
  }

  function onGridPointerLeave() {
    if (!options.range || !rangeStart || rangeEnd) return;
    if (!hoverDate) return;

    hoverDate = null;
    syncGrid();
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

  function onYearChange() {
    onMonthChange();
  }

  function onTimeAdjust(e) {
    const btn = e.target.closest('.lk-date__time-btn');
    if (!btn) return;

    const part = btn.dataset.part;
    const dir = btn.dataset.dir === 'up' ? 1 : -1;
    adjustTime(timeDraft, part, dir);
    syncTimeView();
  }

  function onMeridiemClick(e) {
    const btn = e.target.closest('.lk-date__ampm-btn');
    if (!btn) return;

    const next = btn.dataset.meridiem;
    const isPM = timeDraft.hour24 >= 12;

    if (next === 'AM' && isPM) {
      timeDraft.hour24 -= 12;
    }

    if (next === 'PM' && !isPM) {
      timeDraft.hour24 += 12;
    }

    syncTimeView();
  }

  function onTimeCancel() {
    viewMode = 'date';
    pendingTimeDate = null;
    hoverDate = null;
    syncViewMode();
  }

  function onTimeOk() {
    if (!pendingTimeDate) {
      viewMode = 'date';
      syncViewMode();
      return;
    }

    singleValue = composeDateTime(pendingTimeDate, timeDraft);
    viewDate = new Date(singleValue.getFullYear(), singleValue.getMonth(), 1);
    pendingTimeDate = null;
    viewMode = 'date';

    refreshDateView();
    syncViewMode();

    emitChange(new Date(singleValue), 'confirm');
    emitConfirm(new Date(singleValue));
    proxy.hide('select');
  }

  prevBtn.addEventListener('click', prevMonth);
  nextBtn.addEventListener('click', nextMonth);
  monthSelect.addEventListener('change', onMonthChange);
  yearSelect.addEventListener('change', onYearChange);
  grid.addEventListener('click', onGridClick);
  grid.addEventListener('pointermove', onGridPointerMove);
  grid.addEventListener('pointerleave', onGridPointerLeave);
  timeContainer.addEventListener('click', onTimeAdjust);
  ampmRow.addEventListener('click', onMeridiemClick);
  cancelBtn.addEventListener('click', onTimeCancel);
  okBtn.addEventListener('click', onTimeOk);

  refreshDateView();
  syncViewMode();

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
    yearSelect.removeEventListener('change', onYearChange);
    grid.removeEventListener('click', onGridClick);
    grid.removeEventListener('pointermove', onGridPointerMove);
    grid.removeEventListener('pointerleave', onGridPointerLeave);
    timeContainer.removeEventListener('click', onTimeAdjust);
    ampmRow.removeEventListener('click', onMeridiemClick);
    cancelBtn.removeEventListener('click', onTimeCancel);
    okBtn.removeEventListener('click', onTimeOk);
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

  if (options.open) {
    open();
  }

  return api;
}





















