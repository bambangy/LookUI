// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Bambang Yudhotomo — LookUI
import { resolveEl, applyBase } from '../helpers/base.js';
import { setCollapsibleState } from '../helpers/motion.js';

function resolveBranchTarget(root, target) {
  if (target == null) return null;

  if (typeof target === 'number') {
    return root.querySelectorAll('.lk-list-item--branch')[target] || null;
  }

  if (typeof target === 'string') {
    return root.querySelector(target);
  }

  if (target instanceof Element) {
    if (target.classList.contains('lk-list-item')) return target;
    return target.closest('.lk-list-item');
  }

  return null;
}

function createBranch(item, submenu, trigger, depth) {
  return {
    item,
    submenu,
    trigger,
    depth,
    open: false,
    settleTimer: null,
    createdTrigger: false,
    createdCaret: null,
    createdId: false,
  };
}

/**
 * Enhance a list with nested submenu accordion behavior.
 * @param {Element|string} el - .lk-list element
 * @param {Object} [opts]
 * @param {boolean} [opts.accordion=true] - only one submenu open per nesting level
 * @param {boolean} [opts.collapseSiblings=true] - alias for accordion behavior
 * @param {Function} [opts.onToggle] - callback({ item, open, depth, origin, component })
 * @returns {Object}
 */
export function lkList(el, opts = {}) {
  const node = resolveEl(el, 'lkList');
  node.classList.add('lk-list');

  const options = {
    accordion: opts.accordion !== false,
    collapseSiblings: opts.collapseSiblings !== false,
    onToggle: typeof opts.onToggle === 'function' ? opts.onToggle : null,
  };

  // Created up front: onToggle (origin 'init') can fire while branches are set up
  const comp = {};
  applyBase(comp, node);

  const branches = [];
  const branchByItem = new Map();
  const listeners = [];
  // Once an open submenu has finished sliding, release its max-height cap
  // ('none') so nested submenus opening inside it are never clipped.
  const SETTLE_FALLBACK_MS = 700;

  function clearSettle(branch) {
    if (branch.settleTimer != null) {
      clearTimeout(branch.settleTimer);
      branch.settleTimer = null;
    }
  }

  function settleOpen(branch) {
    clearSettle(branch);
    if (branch.open) branch.submenu.style.setProperty('--lk-submenu-h', 'none');
  }

  function openBranchVisual(branch) {
    clearSettle(branch);
    setCollapsibleState(branch.submenu, {
      open: true,
      openClass: 'lk-list-submenu--open',
      heightVar: '--lk-submenu-h',
    });

    branch.item.classList.add('lk-list-item--open');
    branch.trigger.setAttribute('aria-expanded', 'true');
    branch.submenu.setAttribute('aria-hidden', 'false');
    if ('inert' in branch.submenu) branch.submenu.inert = false;
    branch.open = true;
    branch.settleTimer = setTimeout(() => settleOpen(branch), SETTLE_FALLBACK_MS);
  }

  function closeBranchVisual(branch) {
    clearSettle(branch);
    if (branch.open) {
      // Pin the current height (it may be 'none') and flush styles so the
      // collapse to 0 animates instead of jumping.
      branch.submenu.style.setProperty('--lk-submenu-h', `${branch.submenu.scrollHeight}px`);
      void branch.submenu.offsetHeight;
    }
    setCollapsibleState(branch.submenu, {
      open: false,
      openClass: 'lk-list-submenu--open',
      heightVar: '--lk-submenu-h',
    });

    branch.item.classList.remove('lk-list-item--open');
    branch.trigger.setAttribute('aria-expanded', 'false');
    branch.submenu.setAttribute('aria-hidden', 'true');
    if ('inert' in branch.submenu) branch.submenu.inert = true;
    branch.open = false;
  }

  function setBranchOpen(branch, isOpen, origin = 'api') {
    if (!branch) return;

    if (isOpen) {
      openBranchVisual(branch);

      if (options.accordion && options.collapseSiblings) {
        branches.forEach((sibling) => {
          if (sibling === branch) return;
          if (sibling.item.parentElement !== branch.item.parentElement) return;
          setBranchOpen(sibling, false, 'accordion');
        });
      }
    } else {
      closeBranchVisual(branch);

      // Collapse nested branches when parent closes.
      branches.forEach((child) => {
        if (child === branch) return;
        if (branch.item.contains(child.item)) {
          closeBranchVisual(child);
        }
      });
    }

    if (options.onToggle && origin !== 'accordion') {
      options.onToggle({ item: branch.item, open: branch.open, depth: branch.depth, origin, component: comp });
    }
  }

  function toggleBranch(target, origin = 'api') {
    const branchItem = resolveBranchTarget(node, target);
    if (!branchItem) return false;

    const branch = branchByItem.get(branchItem);
    if (!branch) return false;

    setBranchOpen(branch, !branch.open, origin);
    return true;
  }

  function openBranch(target) {
    const branchItem = resolveBranchTarget(node, target);
    if (!branchItem) return false;

    const branch = branchByItem.get(branchItem);
    if (!branch) return false;

    setBranchOpen(branch, true, 'api');
    return true;
  }

  function closeBranch(target) {
    const branchItem = resolveBranchTarget(node, target);
    if (!branchItem) return false;

    const branch = branchByItem.get(branchItem);
    if (!branch) return false;

    setBranchOpen(branch, false, 'api');
    return true;
  }

  function closeAll() {
    branches.forEach((branch) => setBranchOpen(branch, false, 'api'));
  }

  node.querySelectorAll('.lk-list-submenu').forEach((submenu) => {
    submenu.classList.add('lk-list-submenu');

    const item = submenu.closest('.lk-list-item');
    if (!item || submenu.parentElement !== item) return;

    item.classList.add('lk-list-item--branch');

    let trigger = item.querySelector(':scope > .lk-list-item__trigger, :scope > [data-lk-submenu-trigger]');
    let createdTrigger = false;
    let createdId = false;
    if (!trigger) {
      createdTrigger = true;
      trigger = document.createElement('button');
      trigger.type = 'button';
      trigger.className = 'lk-list-item__trigger';

      const movableChildren = Array.from(item.children).filter((child) => child !== submenu);
      movableChildren.forEach((child) => trigger.appendChild(child));
      item.insertBefore(trigger, submenu);
    }

    const addedTriggerClass = !trigger.classList.contains('lk-list-item__trigger');
    if (addedTriggerClass) {
      trigger.classList.add('lk-list-item__trigger');
    }

    if (!submenu.id) {
      createdId = true;
      submenu.id = `lk-list-submenu-${Math.random().toString(36).slice(2, 9)}`;
    }

    trigger.setAttribute('aria-controls', submenu.id);

    if (trigger.tagName !== 'BUTTON') {
      trigger.setAttribute('role', 'button');
      if (!trigger.hasAttribute('tabindex')) trigger.setAttribute('tabindex', '0');
    }

    let caret = trigger.querySelector(':scope > .lk-list-item__caret');
    let createdCaret = null;
    if (!caret) {
      caret = document.createElement('span');
      caret.className = 'lk-list-item__caret';
      caret.setAttribute('aria-hidden', 'true');
      trigger.appendChild(caret);
      createdCaret = caret;
    }

    let depth = 1;
    let parentSubmenu = item.parentElement.closest('.lk-list-submenu');
    while (parentSubmenu) {
      depth += 1;
      parentSubmenu = parentSubmenu.parentElement.closest('.lk-list-submenu');
    }

    const branch = createBranch(item, submenu, trigger, depth);
    branch.createdTrigger = createdTrigger;
    branch.addedTriggerClass = addedTriggerClass && !createdTrigger;
    branch.createdCaret = createdCaret;
    branch.createdId = createdId;
    branches.push(branch);
    branchByItem.set(item, branch);

    const defaultOpen = item.classList.contains('lk-list-item--open') || trigger.getAttribute('aria-expanded') === 'true';
    submenu.style.setProperty('--lk-submenu-h', defaultOpen ? `${submenu.scrollHeight}px` : '0px');
    setBranchOpen(branch, defaultOpen, 'init');
    if (defaultOpen) settleOpen(branch);

    const onTransitionEnd = (e) => {
      if (e.target !== submenu || e.propertyName !== 'max-height') return;
      settleOpen(branch);
    };
    submenu.addEventListener('transitionend', onTransitionEnd);

    const onClick = (e) => {
      if (trigger.tagName === 'A') e.preventDefault();
      e.stopPropagation();
      toggleBranch(item, 'click');
    };

    const onKeydown = (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      e.preventDefault();
      toggleBranch(item, 'keyboard');
    };

    trigger.addEventListener('click', onClick);
    trigger.addEventListener('keydown', onKeydown);
    listeners.push(() => {
      submenu.removeEventListener('transitionend', onTransitionEnd);
      trigger.removeEventListener('click', onClick);
      trigger.removeEventListener('keydown', onKeydown);
    });
  });

  Object.defineProperties(comp, {
    branches: {
      get() {
        return branches.map((branch) => branch.item);
      },
      enumerable: true,
    },
  });

  comp.open = openBranch;
  comp.close = closeBranch;
  comp.toggle = toggleBranch;
  comp.closeAll = closeAll;

  comp.destroy = function () {
    listeners.forEach((dispose) => dispose());

    branches.forEach((branch) => {
      clearSettle(branch);
      branch.item.classList.remove('lk-list-item--branch', 'lk-list-item--open');
      branch.submenu.classList.remove('lk-list-submenu--open');
      branch.submenu.removeAttribute('aria-hidden');
      branch.submenu.style.removeProperty('--lk-submenu-h');
      if ('inert' in branch.submenu) branch.submenu.inert = false;
      branch.trigger.removeAttribute('aria-controls');
      branch.trigger.removeAttribute('aria-expanded');
      if (branch.trigger.tagName !== 'BUTTON') {
        branch.trigger.removeAttribute('role');
        branch.trigger.removeAttribute('tabindex');
      }
      if (branch.createdId) branch.submenu.removeAttribute('id');
      if (branch.createdCaret) branch.createdCaret.remove();
      if (branch.addedTriggerClass) branch.trigger.classList.remove('lk-list-item__trigger');
      if (branch.createdTrigger) {
        // Unwrap the generated trigger, restoring original children in place.
        while (branch.trigger.firstChild) {
          branch.item.insertBefore(branch.trigger.firstChild, branch.trigger);
        }
        branch.trigger.remove();
      }
    });
    branches.length = 0;
    branchByItem.clear();
    listeners.length = 0;
  };

  return comp;
}
