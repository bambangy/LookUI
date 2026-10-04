// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Bambang Yudhotomo — LookUI
// Chip component factory

import { resolveEl, applyBase } from "../helpers/base.js";
import { qs, createElement } from "../core/index.js";
import { lkIcon } from "./icon.js";
import { readDurationMs } from "../helpers/motion.js";

const COLORS = ["primary", "secondary", "accent", "positive", "warning", "negative", "info"];

/**
 * Enhance a chip element with removable/selectable behavior.
 *
 * Markup can be bare (`<span class="lk-chip">Text</span>`) — text is moved into
 * a `.lk-chip__label` span so long labels ellipsize.
 *
 * @param {Element|string} el — .lk-chip element
 * @param {Object} [opts]
 * @param {string}   [opts.label]     — chip text content
 * @param {string}   [opts.icon]      — leading lkIcon name
 * @param {string|Element} [opts.avatar] — leading avatar: image URL, initials text, or an element
 * @param {string}   [opts.color]     — primary | secondary | accent | positive | warning | negative | info
 * @param {boolean}  [opts.filled]    — solid style
 * @param {boolean}  [opts.outline]   — outlined style
 * @param {boolean}  [opts.square]    — rounded-rectangle shape
 * @param {boolean}  [opts.dense]     — compact size
 * @param {boolean}  [opts.removable] — show close button (default false)
 * @param {string}   [opts.removeLabel] — accessible label for the close button (default "Remove")
 * @param {boolean}  [opts.selected]  — initial selected state
 * @param {boolean}  [opts.disabled]  — initial disabled state
 * @param {Function} [opts.onRemove]  — callback when removed; return `false` to keep the chip
 * @param {Function} [opts.onSelect]  — callback(selected) when toggled (makes the chip a toggle button)
 * @param {Function} [opts.onClick]   — plain click callback (makes the chip clickable)
 * @returns {Object}
 */
export function lkChip(el, opts = {}) {
  const node = resolveEl(el, "lkChip");
  const hadChipClass = node.classList.contains("lk-chip");
  node.classList.add("lk-chip");

  const addedClasses = [];
  function addClass(cls) {
    if (!node.classList.contains(cls)) {
      node.classList.add(cls);
      addedClasses.push(cls);
    }
  }

  if (opts.color && COLORS.includes(opts.color)) addClass(`lk-chip--${opts.color}`);
  if (opts.filled)  addClass("lk-chip--filled");
  if (opts.outline) addClass("lk-chip--outline");
  if (opts.square)  addClass("lk-chip--square");
  if (opts.dense)   addClass("lk-chip--dense");

  let selected = opts.selected ?? node.classList.contains("lk-chip--selected");
  let closeBtn = qs(".lk-chip__close", node);
  let ownsCloseBtn = false;
  let removed = false;
  let leaveTimer = null;
  const ownedParts = [];

  // --- Label span ---------------------------------------------------------------

  let labelEl = qs(".lk-chip__label", node);
  const ownsLabel = !labelEl;
  if (!labelEl) {
    labelEl = createElement("span", { class: "lk-chip__label" });
    // Adopt loose text nodes as the label (keeps icons/close button in place)
    Array.from(node.childNodes).forEach((child) => {
      if (child.nodeType === Node.TEXT_NODE) {
        if (child.textContent.trim()) labelEl.appendChild(document.createTextNode(child.textContent.trim()));
        child.remove();
      }
    });
    node.insertBefore(labelEl, closeBtn || null);
  }
  if (opts.label != null) labelEl.textContent = String(opts.label);

  // --- Leading icon / avatar ----------------------------------------------------------

  if (opts.icon && !qs(".lk-chip__icon", node)) {
    const icon = lkIcon(opts.icon);
    icon.classList.add("lk-chip__icon");
    node.insertBefore(icon, labelEl);
    ownedParts.push(icon);
  }

  if (opts.avatar && !qs(".lk-chip__avatar", node)) {
    let avatar;
    if (opts.avatar instanceof Node) {
      avatar = opts.avatar;
    } else if (/^(https?:|data:|\/|\.)/.test(String(opts.avatar))) {
      avatar = createElement("img", { src: opts.avatar, alt: "" });
    } else {
      avatar = createElement("span", { "aria-hidden": "true" }, String(opts.avatar).slice(0, 2));
    }
    avatar.classList.add("lk-chip__avatar");
    node.insertBefore(avatar, node.firstChild);
    ownedParts.push(avatar);
  }

  // --- Close button -----------------------------------------------------------------

  if (opts.removable && !closeBtn) {
    closeBtn = createElement("button", { class: "lk-chip__close", type: "button" });
    closeBtn.appendChild(lkIcon("close", { size: "xs" }));
    ownsCloseBtn = true;
    node.appendChild(closeBtn);
  }
  if (closeBtn && !closeBtn.hasAttribute("aria-label")) {
    const text = labelEl.textContent.trim();
    closeBtn.setAttribute("aria-label", `${opts.removeLabel || "Remove"}${text ? ` ${text}` : ""}`);
  }

  // --- Interactivity -----------------------------------------------------------------

  const interactive = !!(opts.onSelect || opts.onClick);
  const hadTabindex = node.hasAttribute("tabindex");
  const hadRole = node.getAttribute("role");
  if (interactive && !hadTabindex && node.tagName !== "BUTTON") node.setAttribute("tabindex", "0");
  if (interactive && !hadRole && node.tagName !== "BUTTON") node.setAttribute("role", "button");

  function updateView() {
    node.classList.toggle("lk-chip--clickable", interactive);
    node.classList.toggle("lk-chip--selected", selected);
    if (opts.onSelect) node.setAttribute("aria-pressed", String(selected));
  }

  function isDisabled() {
    return node.classList.contains("lk-disabled") || node.classList.contains("lk-chip--disabled")
      || node.getAttribute("aria-disabled") === "true";
  }

  /** Remove with a short exit animation. Returns false if onRemove vetoed it. */
  function remove() {
    if (removed) return true;
    if (typeof opts.onRemove === "function" && opts.onRemove(comp) === false) return false;
    removed = true;
    node.classList.add("lk-chip--leaving");
    const ms = readDurationMs(node, "transition-duration", 0);
    const finish = () => { leaveTimer = null; node.remove(); };
    if (ms > 0) leaveTimer = setTimeout(finish, ms + 20);
    else finish();
    return true;
  }

  function onClose(e) {
    e.stopPropagation();
    if (isDisabled()) return;
    remove();
  }

  function toggle() {
    if (!opts.onSelect || isDisabled()) return;
    selected = !selected;
    updateView();
    opts.onSelect(selected, comp);
  }

  function onClick(e) {
    if (isDisabled() || e.target.closest(".lk-chip__close")) return;
    if (opts.onSelect) toggle();
    if (typeof opts.onClick === "function") opts.onClick(e, comp);
  }

  function onKeydown(e) {
    if (isDisabled() || e.target !== node) return;
    if (interactive && (e.key === "Enter" || e.key === " ")) {
      e.preventDefault();
      node.click();
    } else if (closeBtn && (e.key === "Backspace" || e.key === "Delete")) {
      e.preventDefault();
      remove();
    }
  }

  if (closeBtn) closeBtn.addEventListener("click", onClose);
  if (interactive) node.addEventListener("click", onClick);
  node.addEventListener("keydown", onKeydown);

  const comp = {};
  applyBase(comp, node);
  if (opts.disabled) comp.enabled = false;
  updateView();

  Object.defineProperties(comp, {
    label: {
      get() { return labelEl.textContent.trim(); },
      set(v) {
        labelEl.textContent = v == null ? "" : String(v);
        if (closeBtn && ownsCloseBtn) {
          closeBtn.setAttribute("aria-label", `${opts.removeLabel || "Remove"} ${labelEl.textContent}`.trim());
        }
      },
      enumerable: true,
    },
    removable: {
      get() { return !!closeBtn; },
      enumerable: true,
    },
    selected: {
      get() { return selected; },
      set(v) {
        selected = !!v;
        updateView();
      },
      enumerable: true,
    },
  });

  comp.remove = remove;
  comp.toggle = toggle;

  comp.destroy = function () {
    clearTimeout(leaveTimer);
    if (closeBtn) closeBtn.removeEventListener("click", onClose);
    if (interactive) node.removeEventListener("click", onClick);
    node.removeEventListener("keydown", onKeydown);
    if (closeBtn && ownsCloseBtn) closeBtn.remove();
    ownedParts.forEach((part) => part.remove());
    if (ownsLabel && labelEl.parentNode) {
      // Put the text back as a plain text node
      node.insertBefore(document.createTextNode(labelEl.textContent), labelEl);
      labelEl.remove();
    }
    if (interactive && !hadTabindex) node.removeAttribute("tabindex");
    if (interactive && !hadRole) node.removeAttribute("role");
    node.classList.remove("lk-chip--clickable", "lk-chip--selected", "lk-chip--leaving", ...addedClasses);
    if (!hadChipClass) node.classList.remove("lk-chip");
    node.removeAttribute("aria-pressed");
  };

  return comp;
}
