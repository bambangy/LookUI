// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Bambang Yudhotomo — LookUI
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { guard, guardSync } from '../src/js/helpers/guard.js';

describe('guard (async)', () => {
  let el;
  beforeEach(() => {
    el = document.createElement('div');
    document.body.appendChild(el);
  });

  it('proceeds with the original payload when there is no hook', () => {
    const proceed = vi.fn();
    const result = guard(el, {}, 'change', 'next', { source: 'api' }, proceed);
    expect(result).toBe(true);
    expect(proceed).toHaveBeenCalledWith('next');
  });

  it('cancels when beforeChange returns false', () => {
    const proceed = vi.fn();
    const result = guard(el, { beforeChange: () => false }, 'change', 'next', {}, proceed);
    expect(result).toBe(false);
    expect(proceed).not.toHaveBeenCalled();
  });

  it('replaces the payload when beforeChange returns a value', () => {
    const proceed = vi.fn();
    guard(el, { beforeChange: () => 'replaced' }, 'change', 'next', {}, proceed);
    expect(proceed).toHaveBeenCalledWith('replaced');
  });

  it('waits for a Promise hook and cancels on resolved false', async () => {
    const proceed = vi.fn();
    const result = guard(el, { beforeChange: () => Promise.resolve(false) }, 'change', 'next', {}, proceed);
    expect(result).toBeInstanceOf(Promise);
    await expect(result).resolves.toBe(false);
    expect(proceed).not.toHaveBeenCalled();
  });

  it('waits for a Promise hook and proceeds on resolved true', async () => {
    const proceed = vi.fn();
    const result = guard(el, { beforeChange: () => Promise.resolve(true) }, 'change', 'next', {}, proceed);
    await expect(result).resolves.toBe(true);
    expect(proceed).toHaveBeenCalledWith('next');
  });

  it('treats a throwing hook as a veto', () => {
    const proceed = vi.fn();
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const result = guard(el, { beforeChange: () => { throw new Error('boom'); } }, 'change', 'next', {}, proceed);
    expect(result).toBe(false);
    expect(proceed).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('dispatches a cancelable lk:before-change DOM event that can veto', () => {
    const proceed = vi.fn();
    el.addEventListener('lk:before-change', (e) => e.preventDefault());
    const result = guard(el, {}, 'change', 'next', {}, proceed);
    expect(result).toBe(false);
    expect(proceed).not.toHaveBeenCalled();
  });

  it('a payload-less action calls the hook with just the context', () => {
    const hook = vi.fn();
    guard(el, { beforeClose: hook }, 'close', undefined, { source: 'api' }, () => {});
    expect(hook).toHaveBeenCalledWith({ source: 'api' });
  });
});

describe('guardSync', () => {
  let el;
  beforeEach(() => {
    el = document.createElement('div');
    document.body.appendChild(el);
  });

  it('allows immediately when there is no hook', () => {
    const { allowed, payload } = guardSync(el, {}, 'change', 'v', {});
    expect(allowed).toBe(true);
    expect(payload).toBe('v');
  });

  it('disallows when the hook returns false', () => {
    const { allowed } = guardSync(el, { beforeChange: () => false }, 'change', 'v', {});
    expect(allowed).toBe(false);
  });

  it('treats a Promise result as allowed (async guards unsupported here)', () => {
    const { allowed, payload } = guardSync(el, { beforeChange: () => Promise.resolve(false) }, 'change', 'v', {});
    expect(allowed).toBe(true);
    expect(payload).toBe('v');
  });

  it('a DOM-level preventDefault still disallows', () => {
    el.addEventListener('lk:before-change', (e) => e.preventDefault());
    const { allowed } = guardSync(el, {}, 'change', 'v', {});
    expect(allowed).toBe(false);
  });
});
