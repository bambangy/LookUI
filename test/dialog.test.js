// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Bambang Yudhotomo — LookUI
import { describe, it, expect, vi, afterEach } from 'vitest';
import { lkDialog } from '../src/js/composables/dialog.js';

describe('lkDialog — Promise-based open() (Feature.md F-02)', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('open() still returns the chainable api synchronously', () => {
    const dialog = lkDialog({ open: false });
    const returned = dialog.open();
    expect(returned).toBe(dialog);
    dialog.destroy();
  });

  it('await dialog.open() resolves once the dialog is closed, with the close reason', async () => {
    const dialog = lkDialog({ open: false });
    const pending = dialog.open();
    expect(dialog.isOpen).toBe(true);
    dialog.close('close-button', 'user');
    const result = await pending;
    expect(result.reason).toBe('close-button');
    expect(result.confirmed).toBe(false);
    dialog.destroy();
  });

  it('resolves with confirmed: true and the onConfirm return value when confirmed', async () => {
    const dialog = lkDialog({ open: false, onConfirm: () => ({ id: 42 }) });
    const pending = dialog.open();
    dialog.dialogEl.querySelector('.lk-btn--primary, .lk-btn--negative').click();
    const result = await pending;
    expect(result.reason).toBe('confirm');
    expect(result.confirmed).toBe(true);
    expect(result.value).toEqual({ id: 42 });
    dialog.destroy();
  });

  it('resolves with cancelled: true on cancel', async () => {
    const dialog = lkDialog({ open: false, showCancel: true });
    const pending = dialog.open();
    dialog.dialogEl.querySelector('.lk-btn--secondary').click();
    const result = await pending;
    expect(result.reason).toBe('cancel');
    expect(result.cancelled).toBe(true);
    dialog.destroy();
  });

  it('close(reason, source, value) carries an arbitrary resolved value', async () => {
    const dialog = lkDialog({ open: false });
    const pending = dialog.open();
    dialog.close('custom', 'api', 'picked-value');
    const result = await pending;
    expect(result.reason).toBe('custom');
    expect(result.value).toBe('picked-value');
    dialog.destroy();
  });

  it('reopening produces a fresh promise each time', async () => {
    const dialog = lkDialog({ open: false });
    const first = dialog.open();
    dialog.close('close', 'api', 'first');
    expect((await first).value).toBe('first');

    const second = dialog.open();
    dialog.close('close', 'api', 'second');
    expect((await second).value).toBe('second');
    dialog.destroy();
  });

  it('destroying an open dialog resolves the pending promise with reason "destroy" instead of hanging', async () => {
    const dialog = lkDialog({ open: false });
    const pending = dialog.open();
    dialog.destroy();
    const result = await pending;
    expect(result.reason).toBe('destroy');
  });

  it('a veto via beforeClose leaves the promise pending', async () => {
    let settled = false;
    const dialog = lkDialog({ open: false, beforeClose: () => false });
    const pending = dialog.open();
    pending.then(() => { settled = true; });
    dialog.close('close', 'user');
    await Promise.resolve();
    await Promise.resolve();
    expect(settled).toBe(false);
    dialog.destroy();
  });
});

describe('lkDialog — channel (Feature.md F-02)', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('exposes a send/on/off pub-sub scoped to the instance', () => {
    const dialog = lkDialog({ open: false });
    const handler = vi.fn();
    dialog.channel.on('filter', handler);
    dialog.channel.send('filter', { role: 'admin' });
    expect(handler).toHaveBeenCalledWith({ role: 'admin' });
    dialog.destroy();
  });

  it('on() returns an unsubscribe function', () => {
    const dialog = lkDialog({ open: false });
    const handler = vi.fn();
    const off = dialog.channel.on('select', handler);
    off();
    dialog.channel.send('select', 1);
    expect(handler).not.toHaveBeenCalled();
    dialog.destroy();
  });

  it('off(name, handler) removes a specific handler', () => {
    const dialog = lkDialog({ open: false });
    const handler = vi.fn();
    dialog.channel.on('select', handler);
    dialog.channel.off('select', handler);
    dialog.channel.send('select', 1);
    expect(handler).not.toHaveBeenCalled();
    dialog.destroy();
  });

  it('content functions receive the dialog api so they can read api.channel', () => {
    let received = null;
    const dialog = lkDialog({ open: false, content: (api) => { received = api; return document.createElement('div'); } });
    expect(received).toBe(dialog);
    expect(received.channel).toBeDefined();
    dialog.destroy();
  });

  it('destroy() clears channel subscriptions', () => {
    const dialog = lkDialog({ open: false });
    const handler = vi.fn();
    dialog.channel.on('x', handler);
    dialog.destroy();
    dialog.channel.send('x', 1);
    expect(handler).not.toHaveBeenCalled();
  });
});
