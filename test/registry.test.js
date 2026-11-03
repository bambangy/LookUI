// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Bambang Yudhotomo — LookUI
import { describe, it, expect, afterEach } from 'vitest';
import { applyBase } from '../src/js/helpers/base.js';
import { autoDispose, disposeAll, disposeWithin } from '../src/js/helpers/registry.js';

function makeComp(node) {
  const comp = {};
  applyBase(comp, node);
  let destroyed = false;
  comp.destroy = () => { destroyed = true; };
  comp.isDestroyed = () => destroyed;
  return comp;
}

describe('applyBase + registry integration', () => {
  afterEach(() => {
    autoDispose(false);
    document.body.innerHTML = '';
  });

  it('destroy() still runs the factory-provided cleanup', () => {
    const node = document.createElement('div');
    const comp = makeComp(node);
    comp.destroy();
    expect(comp.isDestroyed()).toBe(true);
  });

  it('destroy() is idempotent — calling it twice only runs cleanup once', () => {
    const node = document.createElement('div');
    let calls = 0;
    const comp = {};
    applyBase(comp, node);
    comp.destroy = () => { calls += 1; };
    comp.destroy();
    comp.destroy();
    expect(calls).toBe(1);
  });

  it('autoDispose(true) destroys a component when its root element is removed from the DOM', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const node = document.createElement('div');
    container.appendChild(node);
    const comp = makeComp(node);

    autoDispose(true);
    container.removeChild(node);
    // MutationObserver callbacks run in a microtask
    await Promise.resolve();
    await Promise.resolve();

    expect(comp.isDestroyed()).toBe(true);
  });

  it('autoDispose(true) destroys descendants when an ancestor is removed', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const wrapper = document.createElement('div');
    const node = document.createElement('span');
    wrapper.appendChild(node);
    container.appendChild(wrapper);
    const comp = makeComp(node);

    autoDispose(true);
    container.removeChild(wrapper);
    await Promise.resolve();
    await Promise.resolve();

    expect(comp.isDestroyed()).toBe(true);
  });

  it('does nothing when autoDispose is left off', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const node = document.createElement('div');
    container.appendChild(node);
    const comp = makeComp(node);

    container.removeChild(node);
    await Promise.resolve();
    await Promise.resolve();

    expect(comp.isDestroyed()).toBe(false);
  });

  it('disposeAll() destroys every tracked, not-yet-destroyed instance', () => {
    const n1 = document.createElement('div');
    const n2 = document.createElement('div');
    const c1 = makeComp(n1);
    const c2 = makeComp(n2);
    disposeAll();
    expect(c1.isDestroyed()).toBe(true);
    expect(c2.isDestroyed()).toBe(true);
  });

  it('disposeWithin() only destroys instances under the given root', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const inside = document.createElement('div');
    const outside = document.createElement('div');
    container.appendChild(inside);
    document.body.appendChild(outside);

    const cInside = makeComp(inside);
    const cOutside = makeComp(outside);

    disposeWithin(container);

    expect(cInside.isDestroyed()).toBe(true);
    expect(cOutside.isDestroyed()).toBe(false);
    cOutside.destroy();
  });

  it('disposeWithin() accepts a selector string', () => {
    const container = document.createElement('div');
    container.id = 'scoped-root';
    document.body.appendChild(container);
    const node = document.createElement('div');
    container.appendChild(node);
    const comp = makeComp(node);

    disposeWithin('#scoped-root');
    expect(comp.isDestroyed()).toBe(true);
  });

  it('a manually destroy()ed component is not double-destroyed by disposeAll()', () => {
    const node = document.createElement('div');
    let calls = 0;
    const comp = {};
    applyBase(comp, node);
    comp.destroy = () => { calls += 1; };
    comp.destroy();
    disposeAll();
    expect(calls).toBe(1);
  });
});
