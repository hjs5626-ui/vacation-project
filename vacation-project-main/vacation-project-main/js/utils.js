/* ═══════════════════════════════════════════════════════════
   MEMENTO DIARY — Utility Functions
   ═══════════════════════════════════════════════════════════ */

import { dom, $, $$ } from './dom.js';

export function escapeHTML(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
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
