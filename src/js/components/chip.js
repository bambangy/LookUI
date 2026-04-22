// Chip component factory

import { resolveEl, applyBase } from "../helpers/base.js";
import { qs, createElement } from "../core/index.js";
import { lkIcon } from "./icon.js";

/**
 * Enhance a chip element with removable/selectable behavior.
 * @param {Element|string} el — .lk-chip element
 * @param {Object} [opts]
 * @param {string}  [opts.label]     — chip text content
 * @param {boolean} [opts.removable] — show close button (default false)
 * @param {boolean} [opts.selected]  — initial selected state
 * @param {Function} [opts.onRemove]  — callback when close is clicked
 * @param {Function} [opts.onSelect]  — callback(selected) when toggled
 * @returns {Object}
 */
export function lkChip(el, opts = {}) {
  const node = resolveEl(el, "lkChip");
  node.classList.add("lk-chip");

  let selected = opts.selected ?? false;
  let closeBtn = qs(".lk-chip__close", node);

  if (opts.label) node.textContent = opts.label;

  // Auto-create close button if removable
  if (opts.removable && !closeBtn) {
    closeBtn = createElement(
      "button",
      {
        class: "lk-chip__close",
        type: "button",
        "aria-label": "Remove",
      },
    );
    closeBtn.appendChild(lkIcon("close", { size: "xs" }));
    node.appendChild(closeBtn);
  }

  function updateView() {
    node.classList.toggle("lk-chip--clickable", !!opts.onSelect);
    node.classList.toggle("lk-chip--selected", selected);
    node.setAttribute("aria-selected", String(selected));
  }

  function onClose(e) {
    e.stopPropagation();
    if (opts.onRemove) opts.onRemove();
    node.remove();
  }

  function onClick() {
    if (!opts.onSelect) return;
    selected = !selected;
    updateView();
    opts.onSelect(selected);
  }

  if (closeBtn) closeBtn.addEventListener("click", onClose);
  if (opts.onSelect) node.addEventListener("click", onClick);

  updateView();

  const comp = {};
  applyBase(comp, node);

  Object.defineProperties(comp, {
    label: {
      get() {
        // Get text content excluding close button text
        const clone = node.cloneNode(true);
        const btn = clone.querySelector(".lk-chip__close");
        if (btn) btn.remove();
        return clone.textContent.trim();
      },
      set(v) {
        // Preserve close button
        if (closeBtn) {
          node.textContent = v;
          node.appendChild(closeBtn);
        } else {
          node.textContent = v;
        }
      },
      enumerable: true,
    },
    removable: {
      get() {
        return !!closeBtn;
      },
      enumerable: true,
    },
    selected: {
      get() {
        return selected;
      },
      set(v) {
        selected = !!v;
        updateView();
      },
      enumerable: true,
    },
  });

  comp.destroy = function () {
    if (closeBtn) closeBtn.removeEventListener("click", onClose);
    if (opts.onSelect) node.removeEventListener("click", onClick);
    node.classList.remove("lk-chip", "lk-chip--clickable", "lk-chip--selected");
    node.removeAttribute("aria-selected");
  };

  return comp;
}
