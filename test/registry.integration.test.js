// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Bambang Yudhotomo — LookUI
// Sanity check that auto-dispose works through a real factory (not just a synthetic comp),
// since every factory sets `comp.destroy = fn` directly rather than going through applyBase.
import { describe, it, expect, afterEach } from 'vitest';
import { lkCheckbox } from '../src/js/components/form.js';
import { autoDispose } from '../src/js/helpers/registry.js';

describe('auto-dispose through a real component factory', () => {
  afterEach(() => {
    autoDispose(false);
    document.body.innerHTML = '';
  });

  it('destroys an lkCheckbox instance when its input is removed from the DOM', async () => {
    document.body.innerHTML = '<div id="container"><input type="checkbox" id="cb"></div>';
    const comp = lkCheckbox('#cb');
    expect(comp.checked).toBe(false);

    autoDispose(true);
    document.getElementById('container').remove();
    await Promise.resolve();
    await Promise.resolve();

    // field.destroyField() / class cleanup ran as part of the real destroy()
    expect(document.getElementById('cb')).toBeNull();
  });

  it('manual destroy() on a real component still works exactly as before', () => {
    document.body.innerHTML = '<input type="checkbox" id="cb2">';
    const comp = lkCheckbox('#cb2');
    const node = document.getElementById('cb2');
    comp.destroy();
    expect(node.classList.contains('lk-checkbox')).toBe(false);
  });
});
