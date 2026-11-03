// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Bambang Yudhotomo — LookUI
import { describe, it, expect, beforeEach } from 'vitest';
import { qs, qsa, createElement, on, off, emit } from '../src/js/core/index.js';

describe('core DOM helpers', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="root"><span class="a">1</span><span class="a">2</span></div>';
  });

  it('qs finds the first match within a context', () => {
    const root = qs('#root');
    expect(qs('.a', root).textContent).toBe('1');
  });

  it('qs returns null when nothing matches', () => {
    expect(qs('.missing')).toBeNull();
  });

  it('qsa returns a plain array of every match', () => {
    const list = qsa('.a');
    expect(Array.isArray(list)).toBe(true);
    expect(list.map((el) => el.textContent)).toEqual(['1', '2']);
  });

  it('createElement sets attributes and text, skipping null/undefined', () => {
    const el = createElement('button', { type: 'button', 'data-x': null }, 'Click');
    expect(el.tagName).toBe('BUTTON');
    expect(el.getAttribute('type')).toBe('button');
    expect(el.hasAttribute('data-x')).toBe(false);
    expect(el.textContent).toBe('Click');
  });
});

describe('core event bus', () => {
  it('emits to subscribed handlers with the payload', () => {
    const calls = [];
    const handler = (data) => calls.push(data);
    on('test:event', handler);
    emit('test:event', { a: 1 });
    expect(calls).toEqual([{ a: 1 }]);
    off('test:event', handler);
  });

  it('off removes only the given handler', () => {
    const calls = [];
    const h1 = () => calls.push('h1');
    const h2 = () => calls.push('h2');
    on('test:event2', h1);
    on('test:event2', h2);
    off('test:event2', h1);
    emit('test:event2');
    expect(calls).toEqual(['h2']);
    off('test:event2', h2);
  });

  it('emit on an unknown event is a no-op', () => {
    expect(() => emit('test:unknown')).not.toThrow();
  });
});
