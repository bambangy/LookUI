// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Bambang Yudhotomo — LookUI
// Chip component factory

import { resolveEl, applyBase } from "../helpers/base.js";
import { qs, createElement } from "../core/index.js";
import { lkIcon } from "./icon.js";
import { readDurationMs } from "../helpers/motion.js";
import { guard } from "../helpers/guard.js";
import { bindText } from "../helpers/i18n.js";

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
 * @param {string}   [opts.removeLabel] — accessible label for the close button (default: the shared common.remove text)
 * @param {Object}   [opts.text]      — text overrides (common.remove)
 * @param {boolean}  [opts.selected]  — initial selected state
 * @param {boolean}  [opts.disabled]  — initial disabled state
 * @param {Function} [opts.beforeRemove] — (component, { source, component }) => false | Promise; veto removal (DOM event 'lk:before-remove')
 * @param {Function} [opts.beforeChange] — (selected, { source, component, prev }) => false | boolean | Promise; veto / replace a toggle (DOM event 'lk:before-change')
 * @param {Function} [opts.onRemove]  — (component) when removed; return `false` to keep the chip (legacy veto, still honoured after beforeRemove)
 * @param {Function} [opts.onChange]  — (selected, { source, component }) when toggled (makes the chip a toggle button)
 * @param {Function} [opts.onClick]   — (event, { component }) plain click (makes the chip clickable)
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
  const tx = bindText("chip", opts.text, () => { applyCloseLabel(); });
  let ownsCloseLabel = false;

  function applyCloseLabel() {
    if (!closeBtn || !ownsCloseLabel) return;
    const text = labelEl.textContent.trim();
    const base = opts.removeLabel || tx.tf("common.remove");
    closeBtn.setAttribute("aria-label", `${base}${text ? ` ${text}` : ""}`);
  }
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
    ownsCloseLabel = true;
    applyCloseLabel();
  }

  // --- Interactivity -----------------------------------------------------------------

  const onChange = opts.onChange;
  const togglable = !!(onChange || typeof opts.beforeChange === "function");
  const interactive = !!(togglable || opts.onClick);
  const hadTabindex = node.hasAttribute("tabindex");
  const hadRole = node.getAttribute("role");
  if (interactive && !hadTabindex && node.tagName !== "BUTTON") node.setAttribute("tabindex", "0");
  if (interactive && !hadRole && node.tagName !== "BUTTON") node.setAttribute("role", "button");

  function updateView() {
    node.classList.toggle("lk-chip--clickable", interactive);
    node.classList.toggle("lk-chip--selected", selected);
    if (togglable) node.setAttribute("aria-pressed", String(selected));
  }

  function isDisabled() {
    return node.classList.contains("lk-disabled") || node.classList.contains("lk-chip--disabled")
      || node.getAttribute("aria-disabled") === "true";
  }

  /**
   * Remove with a short exit animation. Returns false if a guard (beforeRemove / legacy onRemove)
   * vetoed it, true when removed, or a Promise when an async guard decides later.
   */
  function remove(source = "api") {
    if (removed) return true;
    if (typeof source !== "string") source = "api";
    let vetoed = false;
    const r = guard(node, opts, "remove", comp, { source, component: comp }, () => {
      if (typeof opts.onRemove === "function" && opts.onRemove(comp) === false) { vetoed = true; return; }
      removed = true;
      node.classList.add("lk-chip--leaving");
      const ms = readDurationMs(node, "transition-duration", 0);
      const finish = () => { leaveTimer = null; node.remove(); };
      if (ms > 0) leaveTimer = setTimeout(finish, ms + 20);
      else finish();
    });
    return vetoed ? false : r;
  }

  function onClose(e) {
    e.stopPropagation();
    if (isDisabled()) return;
    remove("click");
  }

  // source: "click" (user) | "api" (toggle())
  function toggle(source = "api") {
    if (!togglable || isDisabled()) return;
    if (typeof source !== "string") source = "api";
    const prev = selected;
    guard(node, opts, "change", !prev, { source, component: comp, prev }, (next) => {
      selected = !!next;
      updateView();
      if (onChange) onChange(selected, { source, component: comp });
    });
  }

  function onClick(e) {
    if (isDisabled() || e.target.closest(".lk-chip__close")) return;
    if (togglable) toggle("click");
    if (typeof opts.onClick === "function") opts.onClick(e, { component: comp });
  }

  function onKeydown(e) {
    if (isDisabled() || e.target !== node) return;
    if (interactive && (e.key === "Enter" || e.key === " ")) {
      e.preventDefault();
      node.click();
    } else if (closeBtn && (e.key === "Backspace" || e.key === "Delete")) {
      e.preventDefault();
      remove("key");
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
    text: { get() { return tx.get(); }, set(v) { tx.set(v); }, enumerable: true },
    label: {
      get() { return labelEl.textContent.trim(); },
      set(v) {
        labelEl.textContent = v == null ? "" : String(v);
        applyCloseLabel();
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
    tx.destroy();
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
