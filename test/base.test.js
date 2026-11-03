// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Bambang Yudhotomo — LookUI
import { describe, it, expect, beforeEach } from 'vitest';
import { resolveEl, applyBase, deprecate, renamedOption } from '../src/js/helpers/base.js';

describe('resolveEl', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="target"></div>';
  });

  it('resolves a selector string to an Element', () => {
    expect(resolveEl('#target', 'lkTest')).toBe(document.getElementById('target'));
  });

  it('passes an Element through unchanged', () => {
    const el = document.getElementById('target');
    expect(resolveEl(el, 'lkTest')).toBe(el);
  });

  it('throws a descriptive error when nothing matches', () => {
    expect(() => resolveEl('#missing', 'lkTest')).toThrow(/Look\.lkTest/);
  });
});

describe('applyBase', () => {
  let node;
  let comp;

  beforeEach(() => {
    node = document.createElement('div');
    node.id = 'node-1';
    document.body.appendChild(node);
    comp = {};
    applyBase(comp, node);
  });

  it('exposes the underlying element as el', () => {
    expect(comp.el).toBe(node);
  });

  it('id getter/setter proxies the element id', () => {
    expect(comp.id).toBe('node-1');
    comp.id = 'node-2';
    expect(node.id).toBe('node-2');
  });

  it('hidden toggles the lk-hidden class', () => {
    expect(comp.hidden).toBe(false);
    comp.hidden = true;
    expect(node.classList.contains('lk-hidden')).toBe(true);
    expect(comp.hidden).toBe(true);
    comp.hidden = false;
    expect(node.classList.contains('lk-hidden')).toBe(false);
  });

  it('hidden can target a different element than the component root', () => {
    const wrapper = document.createElement('div');
    const inner = document.createElement('span');
    wrapper.appendChild(inner);
    const c2 = {};
    applyBase(c2, inner, { hiddenTarget: wrapper });
    c2.hidden = true;
    expect(wrapper.classList.contains('lk-hidden')).toBe(true);
    expect(inner.classList.contains('lk-hidden')).toBe(false);
  });

  it('enabled reflects and sets disabled/aria-disabled state', () => {
    expect(comp.enabled).toBe(true);
    comp.enabled = false;
    expect(node.getAttribute('disabled')).toBe('');
    expect(node.classList.contains('lk-disabled')).toBe(true);
    expect(node.getAttribute('aria-disabled')).toBe('true');
    expect(comp.enabled).toBe(false);
    comp.enabled = true;
    expect(node.hasAttribute('disabled')).toBe(false);
    expect(node.classList.contains('lk-disabled')).toBe(false);
    expect(node.hasAttribute('aria-disabled')).toBe(false);
  });
});

describe('renamedOption', () => {
  it('prefers the new option name when both are given', () => {
    expect(renamedOption({ next: 'a', prev: 'b' }, 'next', 'prev', 'lkTest')).toBe('a');
  });

  it('falls back to the old option name with a deprecation warning', () => {
    const value = renamedOption({ prev: 'b' }, 'next', 'prev', 'lkTest2');
    expect(value).toBe('b');
  });

  it('returns undefined when neither option is set', () => {
    expect(renamedOption({}, 'next', 'prev', 'lkTest3')).toBeUndefined();
  });
});

describe('deprecate', () => {
  it('only warns once per key', () => {
    const calls = [];
    const original = console.warn;
    console.warn = (...args) => calls.push(args);
    deprecate('unique-key-1', 'first message');
    deprecate('unique-key-1', 'second message');
    console.warn = original;
    expect(calls.length).toBe(1);
  });
});
