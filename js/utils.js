/* ═══════════════════════════════════════════════════════════
   MEMENTO DIARY — Utility Functions
   ═══════════════════════════════════════════════════════════ */

import { dom, $, $$ } from './dom.js';

export function escapeHTML(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}


export function normalizeHexColor(hex, fallback = '#FF8FB1') {
  if (typeof hex !== 'string') return fallback;

  let value = hex.trim();
  if (!value.startsWith('#')) value = `#${value}`;

  if (/^#[0-9A-Fa-f]{3}$/.test(value)) {
    const r = value[1];
    const g = value[2];
    const b = value[3];
    return `#${r}${r}${g}${g}${b}${b}`.toUpperCase();
  }

  if (/^#[0-9A-Fa-f]{6}$/.test(value)) {
    return value.toUpperCase();
  }

  return fallback;
}


export function hexToRgba(hex, alpha) {
  const normalized = normalizeHexColor(hex);
  const raw = normalized.slice(1);
  const r = Number.parseInt(raw.slice(0, 2), 16);
  const g = Number.parseInt(raw.slice(2, 4), 16);
  const b = Number.parseInt(raw.slice(4, 6), 16);
  const safeAlpha = Math.max(0, Math.min(1, Number(alpha) || 0));
  return `rgba(${r}, ${g}, ${b}, ${safeAlpha})`;
}

export function showToast(msg) {
  dom.toastMsg.textContent = msg;
  dom.toast.classList.remove('hidden');
  requestAnimationFrame(() => dom.toast.classList.add('show'));
  setTimeout(() => {
    dom.toast.classList.remove('show');
    setTimeout(() => dom.toast.classList.add('hidden'), 300);
  }, 2500);
}

/* ── Screen Navigation ───────────────────────────────── */
export function navigateTo(screenId) {
  $$('.screen').forEach((s) => s.classList.remove('active'));
  $(`#${screenId}`).classList.add('active');
}
