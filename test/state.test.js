// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Bambang Yudhotomo — LookUI
import { describe, it, expect, vi } from 'vitest';
import { createState, state } from '../src/js/helpers/state.js';
import { lkDataSource } from '../src/js/helpers/dataSource.js';

describe('createState — basic get/set', () => {
  it('starts with the given initial values', () => {
    const s = createState({ count: 1 });
    expect(s.get('count')).toBe(1);
  });

  it('get() with no key returns a plain-object snapshot of everything', () => {
    const s = createState({ a: 1, b: 2 });
    expect(s.get()).toEqual({ a: 1, b: 2 });
  });

  it('set() stores a value retrievable via get()', () => {
    const s = createState();
    s.set('cart', [1, 2, 3]);
    expect(s.get('cart')).toEqual([1, 2, 3]);
  });

  it('set() is chainable', () => {
    const s = createState();
    expect(s.set('a', 1)).toBe(s);
  });
});

describe('createState — Proxy data access', () => {
  it('writing through state.data triggers the same notification path as set()', () => {
    const s = createState();
    const handler = vi.fn();
    s.subscribe('cart', handler);
    s.data.cart = ['item'];
    expect(s.get('cart')).toEqual(['item']);
    expect(handler).toHaveBeenCalledWith(['item'], undefined, 'cart');
  });

  it('deleting a property through state.data notifies with undefined', () => {
    const s = createState({ x: 1 });
    const handler = vi.fn();
    s.subscribe('x', handler);
    delete s.data.x;
    expect(s.get('x')).toBeUndefined();
    expect(handler).toHaveBeenCalledWith(undefined, 1, 'x');
  });
});

describe('createState — patch', () => {
  it('shallow-merges an object patch into an existing object value', () => {
    const s = createState({ user: { name: 'Budi', age: 30 } });
    s.patch('user', { name: 'Yudho' });
    expect(s.get('user')).toEqual({ name: 'Yudho', age: 30 });
  });

  it('accepts a function for a functional update', () => {
    const s = createState({ count: 1 });
    s.patch('count', (current) => current + 1);
    expect(s.get('count')).toBe(2);
  });

  it('replaces a non-object value outright', () => {
    const s = createState({ count: 1 });
    s.patch('count', 5);
    expect(s.get('count')).toBe(5);
  });
});

describe('createState — subscribe', () => {
  it('subscribe(key, handler) fires with (next, prev) only for that key', () => {
    const s = createState({ a: 1, b: 1 });
    const handler = vi.fn();
    s.subscribe('a', handler);
    s.set('a', 2);
    s.set('b', 2);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(2, 1, 'a');
  });

  it('does not notify when the value is unchanged (===)', () => {
    const s = createState({ a: 1 });
    const handler = vi.fn();
    s.subscribe('a', handler);
    s.set('a', 1);
    expect(handler).not.toHaveBeenCalled();
  });

  it('subscribe(handler) with no key listens to every key', () => {
    const s = createState();
    const handler = vi.fn();
    s.subscribe(handler);
    s.set('a', 1);
    s.set('b', 2);
    expect(handler).toHaveBeenCalledWith('a', 1, undefined);
    expect(handler).toHaveBeenCalledWith('b', 2, undefined);
  });

  it('returns an unsubscribe function', () => {
    const s = createState();
    const handler = vi.fn();
    const off = s.subscribe('a', handler);
    off();
    s.set('a', 1);
    expect(handler).not.toHaveBeenCalled();
  });
});

describe('createState — snapshot / restore / reset', () => {
  it('snapshot() deep-clones the current state', () => {
    const s = createState({ user: { name: 'Budi' } });
    const snap = s.snapshot();
    s.data.user.name = 'mutated-directly'; // bypasses the proxy (nested object), snapshot must be unaffected
    expect(snap.user.name).toBe('Budi');
  });

  it('restore() brings the state back to a prior snapshot, notifying changed keys', () => {
    const s = createState({ step: 1 });
    const snap = s.snapshot();
    s.set('step', 2);
    s.set('extra', true);
    const handler = vi.fn();
    s.subscribe('step', handler);
    s.restore(snap);
    expect(s.get('step')).toBe(1);
    expect(s.get('extra')).toBeUndefined();
    expect(handler).toHaveBeenCalledWith(1, 2, 'step');
  });

  it('reset() with no key restores the container to its construction-time values', () => {
    const s = createState({ step: 1 });
    s.set('step', 5);
    s.set('extra', 'x');
    s.reset();
    expect(s.get('step')).toBe(1);
    expect(s.get('extra')).toBeUndefined();
  });

  it('reset(key) restores a single key, deleting it if it had no initial value', () => {
    const s = createState({ step: 1 });
    s.set('step', 5);
    s.set('extra', 'x');
    s.reset('step');
    s.reset('extra');
    expect(s.get('step')).toBe(1);
    expect(s.get('extra')).toBeUndefined();
  });
});

describe('createState — namespace', () => {
  it('namespace(name) returns an isolated child container', () => {
    const s = createState();
    const ns = s.namespace('page-a');
    ns.set('a', 1);
    expect(s.get('a')).toBeUndefined();
    expect(ns.get('a')).toBe(1);
  });

  it('namespace(name) returns the same instance on repeated calls', () => {
    const s = createState();
    expect(s.namespace('x')).toBe(s.namespace('x'));
  });
});

describe('createState — lkDataSource integration', () => {
  it('bindDataSource mirrors the data source snapshot into a state key and keeps it live', () => {
    const ds = lkDataSource({ data: [{ id: 1, name: 'A' }] });
    const s = createState();
    s.bindDataSource('list', ds);
    expect(s.get('list').total).toBe(1);
    ds.add({ id: 2, name: 'B' });
    expect(s.get('list').total).toBe(2);
  });

  it('bindDataSource returns an unsubscribe function', () => {
    const ds = lkDataSource({ data: [{ id: 1 }] });
    const s = createState();
    const stop = s.bindDataSource('list', ds);
    stop();
    ds.add({ id: 2 });
    expect(s.get('list').total).toBe(1);
  });
});

describe('state — default shared singleton', () => {
  it('is importable and behaves like any other container', () => {
    state.set('__test_key__', 1);
    expect(state.get('__test_key__')).toBe(1);
    state.reset('__test_key__');
  });
});
