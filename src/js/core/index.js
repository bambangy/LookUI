// Core utilities — DOM helpers and a minimal event bus

// --- DOM helpers ---

/**
 * Select a single element.
 * @param {string} selector
 * @param {Element|Document} [context=document]
 * @returns {Element|null}
 */
export function qs(selector, context = document) {
  return context.querySelector(selector);
}

/**
 * Select all matching elements as a plain array.
 * @param {string} selector
 * @param {Element|Document} [context=document]
 * @returns {Element[]}
 */
export function qsa(selector, context = document) {
  return Array.from(context.querySelectorAll(selector));
}

/**
 * Create an element with optional attributes and text content.
 * @param {string} tag
 * @param {Object} [attrs={}]
 * @param {string} [text='']
 * @returns {Element}
 */
export function createElement(tag, attrs = {}, text = '') {
  const el = document.createElement(tag);
  Object.entries(attrs).forEach(([k, v]) => {
    if (v != null) el.setAttribute(k, v);
  });
  if (text) el.textContent = text;
  return el;
}

// --- Minimal event bus ---

const _listeners = {};

/**
 * Subscribe to a named event.
 * @param {string} event
 * @param {Function} handler
 */
export function on(event, handler) {
  (_listeners[event] = _listeners[event] || []).push(handler);
}

/**
 * Unsubscribe from a named event.
 * @param {string} event
 * @param {Function} handler
 */
export function off(event, handler) {
  if (!_listeners[event]) return;
  _listeners[event] = _listeners[event].filter(fn => fn !== handler);
}

/**
 * Emit a named event with optional payload.
 * @param {string} event
 * @param {*} [data]
 */
export function emit(event, data) {
  (_listeners[event] || []).forEach(fn => fn(data));
}
