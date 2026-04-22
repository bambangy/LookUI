function isObject(value) {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

function cloneRecord(record) {
  return isObject(record) ? { ...record } : record;
}

function toArray(value) {
  return Array.isArray(value) ? value : [];
}

function toNumber(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function defaultCompare(a, b) {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  if (typeof a === 'string' && typeof b === 'string') {
    return a.localeCompare(b);
  }
  if (a > b) return 1;
  if (a < b) return -1;
  return 0;
}

function getFieldValue(item, field) {
  if (!field) return item;
  if (!String(field).includes('.')) return item?.[field];

  return String(field)
    .split('.')
    .reduce((acc, key) => (acc == null ? undefined : acc[key]), item);
}

function matchesByRule(value, rule, item) {
  if (typeof rule === 'function') return !!rule(value, item);
  if (rule instanceof RegExp) return rule.test(String(value ?? ''));

  if (isObject(rule)) {
    if (Object.prototype.hasOwnProperty.call(rule, 'eq') && value !== rule.eq) return false;
    if (Object.prototype.hasOwnProperty.call(rule, 'ne') && value === rule.ne) return false;
    if (Object.prototype.hasOwnProperty.call(rule, 'gt') && !(value > rule.gt)) return false;
    if (Object.prototype.hasOwnProperty.call(rule, 'gte') && !(value >= rule.gte)) return false;
    if (Object.prototype.hasOwnProperty.call(rule, 'lt') && !(value < rule.lt)) return false;
    if (Object.prototype.hasOwnProperty.call(rule, 'lte') && !(value <= rule.lte)) return false;

    if (Array.isArray(rule.in) && !rule.in.includes(value)) return false;

    if (Object.prototype.hasOwnProperty.call(rule, 'contains')) {
      const source = String(value ?? '').toLowerCase();
      const target = String(rule.contains).toLowerCase();
      if (!source.includes(target)) return false;
    }

    if (Object.prototype.hasOwnProperty.call(rule, 'startsWith')) {
      const source = String(value ?? '').toLowerCase();
      const target = String(rule.startsWith).toLowerCase();
      if (!source.startsWith(target)) return false;
    }

    if (Object.prototype.hasOwnProperty.call(rule, 'endsWith')) {
      const source = String(value ?? '').toLowerCase();
      const target = String(rule.endsWith).toLowerCase();
      if (!source.endsWith(target)) return false;
    }

    return true;
  }

  if (Array.isArray(rule)) return rule.includes(value);

  return value === rule;
}

function applyFilter(items, filter) {
  if (!filter) return items.slice();

  if (typeof filter === 'function') {
    return items.filter((item, idx) => !!filter(item, idx));
  }

  if (!isObject(filter)) return items.slice();

  const keys = Object.keys(filter);
  if (!keys.length) return items.slice();

  return items.filter((item) => {
    for (const key of keys) {
      const value = getFieldValue(item, key);
      const rule = filter[key];
      if (!matchesByRule(value, rule, item)) return false;
    }
    return true;
  });
}

function normalizeSort(sort) {
  if (!sort) return [];
  if (typeof sort === 'function') return [{ comparer: sort, dir: 'asc' }];
  if (Array.isArray(sort)) return sort.filter(Boolean);
  if (isObject(sort)) return [sort];
  return [];
}

function applySort(items, sort) {
  const descriptors = normalizeSort(sort);
  if (!descriptors.length) return items.slice();

  const mapped = items.map((item, idx) => ({ item, idx }));

  mapped.sort((a, b) => {
    for (const desc of descriptors) {
      const direction = String(desc.dir || 'asc').toLowerCase() === 'desc' ? -1 : 1;
      const compare = typeof desc.comparer === 'function'
        ? desc.comparer
        : (left, right) => defaultCompare(getFieldValue(left, desc.field), getFieldValue(right, desc.field));

      const result = compare(a.item, b.item);
      if (result !== 0) return result * direction;
    }

    return a.idx - b.idx;
  });

  return mapped.map((entry) => entry.item);
}

function applyPaging(items, page, pageSize) {
  const safeSize = Math.max(1, toNumber(pageSize, 10));
  const safePage = Math.max(1, toNumber(page, 1));
  const start = (safePage - 1) * safeSize;
  return items.slice(start, start + safeSize);
}

function normalizeReadResponse(raw) {
  if (Array.isArray(raw)) {
    return { items: raw, total: raw.length };
  }

  if (!isObject(raw)) {
    return { items: [], total: 0 };
  }

  const items =
    toArray(raw.items).length ? toArray(raw.items)
      : toArray(raw.data).length ? toArray(raw.data)
        : toArray(raw.results).length ? toArray(raw.results)
          : toArray(raw.rows);

  const totalCandidates = [raw.total, raw.totalCount, raw.count, raw.meta?.total];
  const total = totalCandidates.find((v) => Number.isFinite(Number(v)));

  return {
    items,
    total: total == null ? items.length : Number(total),
  };
}

function extractRecord(raw) {
  if (isObject(raw?.item)) return raw.item;
  if (isObject(raw?.data)) return raw.data;
  if (isObject(raw?.result)) return raw.result;
  if (isObject(raw)) return raw;
  return null;
}

function buildUrl(url, payload) {
  if (!payload || !isObject(payload)) return url;

  let next = url;
  Object.keys(payload).forEach((key) => {
    next = next.replace(new RegExp(`\\{${key}\\}`, 'g'), encodeURIComponent(String(payload[key])));
  });

  return next;
}

function appendQuery(url, query) {
  if (!query || !isObject(query)) return url;

  const params = new URLSearchParams();
  Object.entries(query).forEach(([key, value]) => {
    if (value == null) return;
    if (Array.isArray(value)) {
      value.forEach((entry) => params.append(key, String(entry)));
      return;
    }
    if (isObject(value)) {
      params.append(key, JSON.stringify(value));
      return;
    }
    params.append(key, String(value));
  });

  const qs = params.toString();
  if (!qs) return url;
  return `${url}${url.includes('?') ? '&' : '?'}${qs}`;
}

async function parseResponseBody(response) {
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    return response.json();
  }

  const text = await response.text();
  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch (err) {
    return text;
  }
}

function createEventHub() {
  const listeners = new Map();

  function on(event, handler) {
    if (typeof handler !== 'function') return () => {};
    const bucket = listeners.get(event) || new Set();
    bucket.add(handler);
    listeners.set(event, bucket);
    return () => off(event, handler);
  }

  function off(event, handler) {
    const bucket = listeners.get(event);
    if (!bucket) return;
    bucket.delete(handler);
    if (!bucket.size) listeners.delete(event);
  }

  function once(event, handler) {
    if (typeof handler !== 'function') return () => {};
    const stop = on(event, (...args) => {
      stop();
      handler(...args);
    });
    return stop;
  }

  function emit(event, payload) {
    const bucket = listeners.get(event);
    if (!bucket) return;
    bucket.forEach((handler) => {
      handler(payload);
    });
  }

  return { on, off, once, emit };
}

/**
 * Reactive data source helper with local transforms and optional remote sync.
 * @param {Object} [opts={}]
 * @returns {Object}
 */
export function lkDataSource(opts = {}) {
  const options = {
    keyField: 'id',
    data: [],
    filter: null,
    sort: null,
    page: 1,
    pageSize: 10,
    autoLoad: false,
    optimistic: true,
    parseItem: null,
    transport: {
      read: null,
      create: null,
      update: null,
      delete: null,
    },
    request: {
      headers: {},
      credentials: 'same-origin',
    },
    server: {
      filter: false,
      sort: false,
      paging: false,
    },
    hooks: {
      beforeRequest: null,
      afterRequest: null,
      onError: null,
    },
    ...opts,
  };

  options.transport = { ...options.transport, ...(opts.transport || {}) };
  options.request = { ...options.request, ...(opts.request || {}) };
  options.server = { ...options.server, ...(opts.server || {}) };
  options.hooks = { ...options.hooks, ...(opts.hooks || {}) };

  const events = createEventHub();

  let items = toArray(options.data).map((item) => (typeof options.parseItem === 'function' ? options.parseItem(item) : cloneRecord(item)));
  let view = [];
  let filter = options.filter;
  let sort = options.sort;
  let page = Math.max(1, toNumber(options.page, 1));
  let pageSize = Math.max(1, toNumber(options.pageSize, 10));
  let loading = false;
  let error = null;
  let serverTotal = null;
  let filteredTotal = items.length;
  let batching = 0;
  let dirty = false;

  function getTotal() {
    if (options.server.paging && Number.isFinite(serverTotal)) return serverTotal;
    return filteredTotal;
  }

  function getTotalPages() {
    return Math.max(1, Math.ceil(getTotal() / pageSize));
  }

  function snapshot() {
    return {
      items: items.slice(),
      view: view.slice(),
      filter,
      sort,
      page,
      pageSize,
      total: getTotal(),
      totalPages: getTotalPages(),
      loading,
      error,
    };
  }

  function emitChange(reason, detail = {}) {
    if (batching > 0) {
      dirty = true;
      return;
    }

    events.emit('change', {
      reason,
      detail,
      state: snapshot(),
    });
  }

  function refresh(reason = 'refresh', detail = {}) {
    let processed = items.slice();

    if (!options.server.filter) {
      processed = applyFilter(processed, filter);
    }

    filteredTotal = processed.length;

    if (!options.server.sort) {
      processed = applySort(processed, sort);
    }

    if (!options.server.paging) {
      const totalPages = Math.max(1, Math.ceil(filteredTotal / pageSize));
      page = Math.min(Math.max(1, page), totalPages);
      processed = applyPaging(processed, page, pageSize);
    }

    view = processed;
    emitChange(reason, detail);
    return api;
  }

  function batch(fn, reason = 'batch') {
    batching += 1;

    try {
      if (typeof fn === 'function') {
        fn(api);
      }
    } finally {
      batching -= 1;
      if (batching === 0 && dirty) {
        dirty = false;
        refresh(reason);
      }
    }

    return api;
  }

  function applyParseItem(record) {
    if (typeof options.parseItem === 'function') {
      return options.parseItem(record);
    }
    return cloneRecord(record);
  }

  function resolveMatcher(target) {
    if (typeof target === 'function') return target;

    if (isObject(target) && Object.prototype.hasOwnProperty.call(target, options.keyField)) {
      const id = target[options.keyField];
      return (item) => item?.[options.keyField] === id;
    }

    return (item) => item?.[options.keyField] === target;
  }

  function findIndex(target) {
    const matcher = resolveMatcher(target);
    return items.findIndex((item, idx) => matcher(item, idx));
  }

  function normalizeEndpoint(endpoint) {
    if (!endpoint) return null;
    if (typeof endpoint === 'string') return { url: endpoint };
    if (typeof endpoint === 'function') return endpoint;
    if (isObject(endpoint)) return endpoint;
    return null;
  }

  async function requestByEndpoint(action, endpoint, payload = null) {
    const methodDefaults = {
      read: 'GET',
      create: 'POST',
      update: 'PUT',
      delete: 'DELETE',
    };

    if (typeof endpoint === 'function') {
      return endpoint(payload, api);
    }

    const config = endpoint || {};
    const method = String(config.method || methodDefaults[action] || 'GET').toUpperCase();
    const headers = {
      'Content-Type': 'application/json',
      ...options.request.headers,
      ...(config.headers || {}),
    };

    let url = buildUrl(config.url || '', payload || {});
    const init = {
      method,
      headers,
      credentials: config.credentials || options.request.credentials,
    };

    if (method === 'GET') {
      url = appendQuery(url, payload || {});
    } else if (payload != null) {
      init.body = JSON.stringify(payload);
    }

    const response = await fetch(url, init);
    const body = await parseResponseBody(response);

    if (!response.ok) {
      const message = isObject(body) && body.message
        ? body.message
        : `Request failed with status ${response.status}`;
      throw new Error(message);
    }

    return body;
  }

  async function runTransport(action, payload = null) {
    const endpoint = normalizeEndpoint(options.transport[action]);
    if (!endpoint) return null;

    loading = true;
    error = null;
    refresh('loading', { action, payload });
    events.emit('request:start', { action, payload, state: snapshot() });

    try {
      if (typeof options.hooks.beforeRequest === 'function') {
        await options.hooks.beforeRequest({ action, payload, options, source: api });
      }

      const result = await requestByEndpoint(action, endpoint, payload);

      if (typeof options.hooks.afterRequest === 'function') {
        await options.hooks.afterRequest({ action, payload, result, options, source: api });
      }

      events.emit('request:success', { action, payload, result, state: snapshot() });
      return result;
    } catch (err) {
      error = err;
      events.emit('error', { action, payload, error: err, state: snapshot() });

      if (typeof options.hooks.onError === 'function') {
        options.hooks.onError({ action, payload, error: err, source: api });
      }

      throw err;
    } finally {
      loading = false;
      refresh('idle', { action, payload });
      events.emit('request:end', { action, payload, state: snapshot() });
    }
  }

  function setItems(nextItems, reason = 'set') {
    serverTotal = null;
    items = toArray(nextItems).map(applyParseItem);
    refresh(reason, { count: items.length });
    return api;
  }

  async function load(params = {}) {
    const payload = {
      ...params,
      ...(options.server.filter ? { filter } : {}),
      ...(options.server.sort ? { sort } : {}),
      ...(options.server.paging ? { page, pageSize } : {}),
    };

    const result = await runTransport('read', payload);
    const normalized = normalizeReadResponse(result);
    items = normalized.items.map(applyParseItem);
    serverTotal = normalized.total;

    refresh('load', { params: payload, result });
    events.emit('load', { params: payload, result, state: snapshot() });
    return view.slice();
  }

  async function add(record, op = {}) {
    const opOptions = {
      sync: true,
      optimistic: options.optimistic,
      ...op,
    };

    const next = applyParseItem(record);

    if (opOptions.optimistic || !opOptions.sync || !options.transport.create) {
      items.push(next);
      refresh('add', { record: next });
      events.emit('add', { record: next, state: snapshot() });
    }

    if (!opOptions.sync || !options.transport.create) {
      return next;
    }

    try {
      const result = await runTransport('create', next);
      const remote = extractRecord(result);
      if (remote && opOptions.optimistic) {
        const idx = items.findIndex((item) => item === next);
        if (idx > -1) {
          items[idx] = { ...items[idx], ...applyParseItem(remote) };
          refresh('add:sync', { record: items[idx], result });
        }
      }
      return remote || next;
    } catch (err) {
      if (opOptions.optimistic) {
        items = items.filter((item) => item !== next);
        refresh('add:rollback', { record: next, error: err });
      }
      throw err;
    }
  }

  async function update(target, patch, op = {}) {
    const idx = findIndex(target);
    if (idx < 0) return null;

    const opOptions = {
      sync: true,
      optimistic: options.optimistic,
      ...op,
    };

    const current = items[idx];
    const currentId = current?.[options.keyField];
    const patchValue = typeof patch === 'function' ? patch(cloneRecord(current), idx) : patch;
    const next = isObject(patchValue)
      ? { ...cloneRecord(current), ...patchValue }
      : cloneRecord(current);

    if (opOptions.optimistic || !opOptions.sync || !options.transport.update) {
      items[idx] = applyParseItem(next);
      refresh('update', { target, record: items[idx] });
      events.emit('update', { target, record: items[idx], state: snapshot() });
    }

    if (!opOptions.sync || !options.transport.update) {
      return items[idx];
    }

    const payload = {
      id: currentId,
      item: items[idx],
      changes: patchValue,
    };

    try {
      const result = await runTransport('update', payload);
      const remote = extractRecord(result);
      if (remote && opOptions.optimistic) {
        items[idx] = { ...items[idx], ...applyParseItem(remote) };
        refresh('update:sync', { target, record: items[idx], result });
      }
      return remote || items[idx];
    } catch (err) {
      if (opOptions.optimistic) {
        items[idx] = current;
        refresh('update:rollback', { target, record: current, error: err });
      }
      throw err;
    }
  }

  async function remove(target, op = {}) {
    const idx = findIndex(target);
    if (idx < 0) return null;

    const opOptions = {
      sync: true,
      optimistic: options.optimistic,
      ...op,
    };

    const removed = items[idx];

    if (opOptions.optimistic || !opOptions.sync || !options.transport.delete) {
      items.splice(idx, 1);
      refresh('remove', { target, record: removed });
      events.emit('remove', { target, record: removed, state: snapshot() });
    }

    if (!opOptions.sync || !options.transport.delete) {
      return removed;
    }

    try {
      await runTransport('delete', {
        id: removed?.[options.keyField],
        item: removed,
      });
      return removed;
    } catch (err) {
      if (opOptions.optimistic) {
        items.splice(idx, 0, removed);
        refresh('remove:rollback', { target, record: removed, error: err });
      }
      throw err;
    }
  }

  function clear(reason = 'clear') {
    serverTotal = null;
    items = [];
    refresh(reason);
    events.emit('clear', { state: snapshot() });
    return api;
  }

  function setFilter(nextFilter) {
    filter = nextFilter;
    page = 1;
    refresh('filter', { filter });
    events.emit('filter', { filter, state: snapshot() });
    return api;
  }

  function clearFilter() {
    return setFilter(null);
  }

  function setSort(nextSort) {
    sort = nextSort;
    refresh('sort', { sort });
    events.emit('sort', { sort, state: snapshot() });
    return api;
  }

  function clearSort() {
    return setSort(null);
  }

  function setPage(nextPage) {
    page = Math.max(1, toNumber(nextPage, 1));
    refresh('page', { page });
    events.emit('page', { page, state: snapshot() });
    return api;
  }

  function setPageSize(nextPageSize) {
    pageSize = Math.max(1, toNumber(nextPageSize, 10));
    page = 1;
    refresh('pageSize', { pageSize });
    events.emit('pageSize', { pageSize, state: snapshot() });
    return api;
  }

  function setQuery(query = {}) {
    batch(() => {
      if (Object.prototype.hasOwnProperty.call(query, 'filter')) filter = query.filter;
      if (Object.prototype.hasOwnProperty.call(query, 'sort')) sort = query.sort;
      if (Object.prototype.hasOwnProperty.call(query, 'page')) page = Math.max(1, toNumber(query.page, 1));
      if (Object.prototype.hasOwnProperty.call(query, 'pageSize')) pageSize = Math.max(1, toNumber(query.pageSize, 10));
    }, 'query');

    events.emit('query', { query, state: snapshot() });
    return api;
  }

  function find(predicate) {
    return items.find(predicate) ?? null;
  }

  function getById(id) {
    return items.find((item) => item?.[options.keyField] === id) ?? null;
  }

  function toJSON() {
    return snapshot();
  }

  function subscribe(handler, cfg = {}) {
    if (typeof handler !== 'function') return () => {};

    const event = cfg.event || 'change';
    const immediate = cfg.immediate !== false;
    const wrapped = (payload) => handler(payload?.state ?? snapshot(), payload);
    const stop = events.on(event, wrapped);

    if (immediate) {
      wrapped({ reason: 'init', state: snapshot() });
    }

    return stop;
  }

  const api = {
    on: events.on,
    off: events.off,
    once: events.once,
    emit: events.emit,

    subscribe,
    refresh,
    batch,

    set: setItems,
    load,
    add,
    update,
    remove,
    clear,

    setFilter,
    clearFilter,
    setSort,
    clearSort,
    setPage,
    setPageSize,
    setQuery,

    find,
    getById,
    toJSON,
  };

  Object.defineProperties(api, {
    value: {
      get() {
        return items;
      },
      set(next) {
        setItems(next, 'value:set');
      },
      enumerable: true,
    },
    items: {
      get() {
        return items;
      },
      set(next) {
        setItems(next, 'items:set');
      },
      enumerable: true,
    },
    view: {
      get() {
        return view;
      },
      enumerable: true,
    },
    filter: {
      get() {
        return filter;
      },
      set(next) {
        setFilter(next);
      },
      enumerable: true,
    },
    sort: {
      get() {
        return sort;
      },
      set(next) {
        setSort(next);
      },
      enumerable: true,
    },
    page: {
      get() {
        return page;
      },
      set(next) {
        setPage(next);
      },
      enumerable: true,
    },
    pageSize: {
      get() {
        return pageSize;
      },
      set(next) {
        setPageSize(next);
      },
      enumerable: true,
    },
    loading: {
      get() {
        return loading;
      },
      enumerable: true,
    },
    error: {
      get() {
        return error;
      },
      enumerable: true,
    },
    total: {
      get() {
        return getTotal();
      },
      enumerable: true,
    },
    totalPages: {
      get() {
        return getTotalPages();
      },
      enumerable: true,
    },
  });

  refresh('init');

  if (options.autoLoad && options.transport.read) {
    load().catch(() => {
      // Error is already emitted through the event system.
    });
  }

  return api;
}

export const createDataSource = lkDataSource;
