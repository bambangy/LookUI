// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Bambang Yudhotomo — LookUI
/**
 * Pattern-based date formatting (local time).
 *
 *   yyyy / yyy  2026        yy   26
 *   MMMM        October     MMM  Oct      MM  10     M  10
 *   dddd        Thursday    ddd  Thu      dd  08     d  8
 *   HH / H      14          hh / h  02 / 2 (12-hour clock)
 *   mm / m      05 / 5      ss / s  09 / 9
 *   SSS SS S    milliseconds, hundredths, tenths (aliases: fff ff f)
 *   tt / A      AM / PM
 *   XXX / XX    time-zone offset: +07:00 / +0700
 *   'text' or [text]  literal text ('' = a single quote)
 *
 * Any other character is copied as-is, so `yyyy-MM-ddTHH:mm:ss.SSS` works without quoting.
 * Names (MMMM, MMM, dddd, ddd) use `Intl.DateTimeFormat` with the given locale.
 */

const TOKEN = /'([^']*)'|\[([^\]]*)\]|yyyy|yyy|yy|MMMM|MMM|MM|M|dddd|ddd|dd|d|HH|H|hh|h|mm|m|ss|s|SSS|SS|S|fff|ff|f|tt|A|XXX|XX/g;

const pad = (n, len = 2) => String(n).padStart(len, '0');

function offset(date, colon) {
  const total = -date.getTimezoneOffset();
  const sign = total >= 0 ? '+' : '-';
  const abs = Math.abs(total);
  return `${sign}${pad(Math.floor(abs / 60))}${colon ? ':' : ''}${pad(abs % 60)}`;
}

/**
 * @param {Date|number|string} date
 * @param {string} pattern
 * @param {string} [locale='en-US']
 * @returns {string} '' for invalid dates
 */
export function formatDate(date, pattern, locale = 'en-US') {
  const d = date instanceof Date ? date : new Date(date);
  if (date == null || Number.isNaN(d.getTime())) return '';
  const name = (opts) => new Intl.DateTimeFormat(locale, opts).format(d);
  const h = d.getHours();
  const ms = d.getMilliseconds();

  return String(pattern).replace(TOKEN, (m, quoted, bracketed) => {
    if (quoted !== undefined) return quoted === '' ? "'" : quoted;
    if (bracketed !== undefined) return bracketed;
    switch (m) {
      case 'yyyy': case 'yyy': return String(d.getFullYear());
      case 'yy': return pad(d.getFullYear() % 100);
      case 'MMMM': return name({ month: 'long' });
      case 'MMM': return name({ month: 'short' });
      case 'MM': return pad(d.getMonth() + 1);
      case 'M': return String(d.getMonth() + 1);
      case 'dddd': return name({ weekday: 'long' });
      case 'ddd': return name({ weekday: 'short' });
      case 'dd': return pad(d.getDate());
      case 'd': return String(d.getDate());
      case 'HH': return pad(h);
      case 'H': return String(h);
      case 'hh': return pad(h % 12 || 12);
      case 'h': return String(h % 12 || 12);
      case 'mm': return pad(d.getMinutes());
      case 'm': return String(d.getMinutes());
      case 'ss': return pad(d.getSeconds());
      case 's': return String(d.getSeconds());
      case 'SSS': case 'fff': return pad(ms, 3);
      case 'SS': case 'ff': return pad(Math.floor(ms / 10));
      case 'S': case 'f': return String(Math.floor(ms / 100));
      case 'tt': case 'A': return h >= 12 ? 'PM' : 'AM';
      case 'XXX': return offset(d, true);
      case 'XX': return offset(d, false);
      default: return m;
    }
  });
}
