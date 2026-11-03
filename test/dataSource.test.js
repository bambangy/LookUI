// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Bambang Yudhotomo — LookUI
import { describe, it, expect, vi } from 'vitest';
import { lkDataSource, createDataSource } from '../src/js/helpers/dataSource.js';

const rows = () => [
  { id: 1, name: 'Charlie', age: 40 },
  { id: 2, name: 'Alice', age: 30 },
  { id: 3, name: 'Bob', age: 20 },
];

describe('lkDataSource — local data', () => {
  it('createDataSource is an alias of lkDataSource', () => {
    expect(createDataSource).toBe(lkDataSource);
  });

  it('wraps the initial data and exposes it via value/items/view', () => {
    const ds = lkDataSource({ data: rows() });
    expect(ds.items).toHaveLength(3);
    expect(ds.view).toHaveLength(3);
    expect(ds.total).toBe(3);
  });

  it('clones records so mutating the source array does not affect the data source', () => {
    const source = rows();
    const ds = lkDataSource({ data: source });
    source[0].name = 'Mutated';
    expect(ds.items[0].name).toBe('Charlie');
  });

  it('sorts locally via the sort setter', () => {
    const ds = lkDataSource({ data: rows() });
    ds.sort = { field: 'name', dir: 'asc' };
    expect(ds.view.map((r) => r.name)).toEqual(['Alice', 'Bob', 'Charlie']);
  });

  it('filters locally via an object filter', () => {
    const ds = lkDataSource({ data: rows() });
    ds.filter = { age: { gte: 30 } };
    expect(ds.view.map((r) => r.id).sort()).toEqual([1, 2]);
  });

  it('filters locally via a predicate function', () => {
    const ds = lkDataSource({ data: rows() });
    ds.filter = (item) => item.name.startsWith('B');
    expect(ds.view.map((r) => r.name)).toEqual(['Bob']);
  });

  it('paginates locally', () => {
    const ds = lkDataSource({ data: rows(), pageSize: 2 });
    expect(ds.view).toHaveLength(2);
    expect(ds.totalPages).toBe(2);
    ds.page = 2;
    expect(ds.view).toHaveLength(1);
  });

  it('emits a change event with the new state on filter/sort/page changes', () => {
    const ds = lkDataSource({ data: rows() });
    const handler = vi.fn();
    ds.on('change', handler);
    ds.setFilter({ age: { gte: 30 } });
    expect(handler).toHaveBeenCalled();
    const payload = handler.mock.calls.at(-1)[0];
    expect(payload.reason).toBe('filter');
    expect(payload.state.total).toBe(2);
  });

  it('subscribe fires immediately by default and on every change', () => {
    const ds = lkDataSource({ data: rows() });
    const states = [];
    const stop = ds.subscribe((state) => states.push(state.total));
    ds.setPageSize(1);
    expect(states[0]).toBe(3);
    expect(states.at(-1)).toBe(3); // pageSize doesn't change total
    stop();
  });

  it('batch() coalesces multiple mutations into a single change event', () => {
    const ds = lkDataSource({ data: rows() });
    const handler = vi.fn();
    ds.on('change', handler);
    ds.batch(() => {
      ds.setFilter({ age: { gte: 20 } });
      ds.setSort({ field: 'age', dir: 'desc' });
    });
    expect(handler).toHaveBeenCalledTimes(1);
    expect(ds.view.map((r) => r.age)).toEqual([40, 30, 20]);
  });

  it('add() inserts a record locally and emits add', async () => {
    const ds = lkDataSource({ data: rows() });
    const handler = vi.fn();
    ds.on('add', handler);
    const added = await ds.add({ id: 4, name: 'Dana', age: 25 });
    expect(added.id).toBe(4);
    expect(ds.items).toHaveLength(4);
    expect(handler).toHaveBeenCalled();
  });

  it('update() patches a record by key', async () => {
    const ds = lkDataSource({ data: rows() });
    const updated = await ds.update(1, { name: 'Charles' });
    expect(updated.name).toBe('Charles');
    expect(ds.getById(1).name).toBe('Charles');
  });

  it('update() accepts a patch function', async () => {
    const ds = lkDataSource({ data: rows() });
    await ds.update(1, (current) => ({ age: current.age + 1 }));
    expect(ds.getById(1).age).toBe(41);
  });

  it('remove() deletes a record by key', async () => {
    const ds = lkDataSource({ data: rows() });
    const removed = await ds.remove(2);
    expect(removed.id).toBe(2);
    expect(ds.getById(2)).toBeNull();
    expect(ds.items).toHaveLength(2);
  });

  it('move() reorders the underlying items', () => {
    const ds = lkDataSource({ data: rows() });
    ds.move(0, 2);
    expect(ds.items.map((r) => r.id)).toEqual([2, 3, 1]);
  });

  it('clear() empties the data source', () => {
    const ds = lkDataSource({ data: rows() });
    ds.clear();
    expect(ds.items).toHaveLength(0);
    expect(ds.total).toBe(0);
  });

  it('find() and getById() read the raw items', () => {
    const ds = lkDataSource({ data: rows() });
    expect(ds.find((r) => r.name === 'Bob').id).toBe(3);
    expect(ds.getById(99)).toBeNull();
  });

  it('beforeAdd can veto an add()', async () => {
    const ds = lkDataSource({ data: rows(), beforeAdd: () => false });
    const result = await ds.add({ id: 4, name: 'Dana' });
    expect(result).toBeNull();
    expect(ds.items).toHaveLength(3);
  });

  it('beforeRemove can veto a remove()', async () => {
    const ds = lkDataSource({ data: rows(), beforeRemove: () => false });
    const result = await ds.remove(1);
    expect(result).toBeNull();
    expect(ds.items).toHaveLength(3);
  });

  it('canRead reflects whether a read transport is configured', () => {
    const withTransport = lkDataSource({ data: rows(), transport: { read: '/api/items' } });
    const withoutTransport = lkDataSource({ data: rows() });
    expect(withTransport.canRead).toBe(true);
    expect(withoutTransport.canRead).toBe(false);
  });
});
