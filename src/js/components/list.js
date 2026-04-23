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
  };
}

/**
 * Enhance a list with nested submenu accordion behavior.
 * @param {Element|string} el - .lk-list element
 * @param {Object} [opts]
 * @param {boolean} [opts.accordion=true] - only one submenu open per nesting level
 * @param {boolean} [opts.collapseSiblings=true] - alias for accordion behavior
 * @param {Function} [opts.onToggle] - callback({ item, open, depth, origin })
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

  const branches = [];
  const branchByItem = new Map();
  const listeners = [];
  let heightSyncFrame = null;

  function queueHeightSync() {
    if (heightSyncFrame != null) {
      cancelAnimationFrame(heightSyncFrame);
    }

    heightSyncFrame = requestAnimationFrame(() => {
      heightSyncFrame = null;
      branches.forEach((branch) => {
        if (!branch.open) return;
        branch.submenu.style.setProperty('--lk-submenu-h', `${branch.submenu.scrollHeight}px`);
      });
    });
  }

  function openBranchVisual(branch) {
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
    queueHeightSync();
  }

  function closeBranchVisual(branch) {
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
      options.onToggle({ item: branch.item, open: branch.open, depth: branch.depth, origin });
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
    if (!trigger) {
      trigger = document.createElement('button');
      trigger.type = 'button';
      trigger.className = 'lk-list-item__trigger';

      const movableChildren = Array.from(item.children).filter((child) => child !== submenu);
      movableChildren.forEach((child) => trigger.appendChild(child));
      item.insertBefore(trigger, submenu);
    }

    if (!trigger.classList.contains('lk-list-item__trigger')) {
      trigger.classList.add('lk-list-item__trigger');
    }

    if (!submenu.id) {
      submenu.id = `lk-list-submenu-${Math.random().toString(36).slice(2, 9)}`;
    }

    trigger.setAttribute('aria-controls', submenu.id);

    if (trigger.tagName !== 'BUTTON') {
      trigger.setAttribute('role', 'button');
      if (!trigger.hasAttribute('tabindex')) trigger.setAttribute('tabindex', '0');
    }

    let caret = trigger.querySelector(':scope > .lk-list-item__caret');
    if (!caret) {
      caret = document.createElement('span');
      caret.className = 'lk-list-item__caret';
      caret.setAttribute('aria-hidden', 'true');
      trigger.appendChild(caret);
    }

    let depth = 1;
    let parentSubmenu = item.parentElement.closest('.lk-list-submenu');
    while (parentSubmenu) {
      depth += 1;
      parentSubmenu = parentSubmenu.parentElement.closest('.lk-list-submenu');
    }

    const branch = createBranch(item, submenu, trigger, depth);
    branches.push(branch);
    branchByItem.set(item, branch);

    const defaultOpen = item.classList.contains('lk-list-item--open') || trigger.getAttribute('aria-expanded') === 'true';
    submenu.style.setProperty('--lk-submenu-h', defaultOpen ? `${submenu.scrollHeight}px` : '0px');
    setBranchOpen(branch, defaultOpen, 'init');

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
      trigger.removeEventListener('click', onClick);
      trigger.removeEventListener('keydown', onKeydown);
    });
  });

  const comp = {};
  applyBase(comp, node);

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

    if (heightSyncFrame != null) {
      cancelAnimationFrame(heightSyncFrame);
      heightSyncFrame = null;
    }

    branches.forEach((branch) => {
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
    });
  };

  return comp;
}
