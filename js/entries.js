/* ═══════════════════════════════════════════════════════════
   MEMENTO DIARY — Entry Rendering (Desktop Icon Style)
   ═══════════════════════════════════════════════════════════ */

import { state, saveEntries } from './state.js';
import { dom } from './dom.js';
import { escapeHTML, showToast } from './utils.js';
import { openConfirmDialog } from './dialogs.js';
import { openEditor } from './editor.js';
import { openEditModal } from './modals.js';

/* ── Context Menu State ──────────────────────────────── */
let currentContextMenuEntry = null;

export function initContextMenu() {
  dom.ctxDelete.addEventListener('click', () => {
    if (!currentContextMenuEntry) return;
    deleteEntry(currentContextMenuEntry.id);
    closeContextMenu();
  });

  dom.ctxEdit.addEventListener('click', () => {
    if (!currentContextMenuEntry) return;
    openEditModal(currentContextMenuEntry);
    closeContextMenu();
  });

  document.addEventListener('click', (e) => {
    if (!e.target.closest('#context-menu') && !e.target.closest('.entry-icon')) {
      closeContextMenu();
    }
  });

  document.addEventListener('scroll', closeContextMenu, { passive: true });
}

function openContextMenu(entry, x, y) {
  currentContextMenuEntry = entry;
  
  // Make sure it doesn't go off-screen
  const menuWidth = 140;
  const menuHeight = 80;
  const safeX = Math.min(x, window.innerWidth - menuWidth - 10);
  const safeY = Math.min(y, window.innerHeight - menuHeight - 10);

  dom.ctxMenu.style.left = `${safeX}px`;
  dom.ctxMenu.style.top = `${safeY}px`;
  dom.ctxMenu.classList.remove('hidden');
}

function closeContextMenu() {
  dom.ctxMenu.classList.add('hidden');
  currentContextMenuEntry = null;
}

async function deleteEntry(id) {
  const ok = await openConfirmDialog({
    title: '일기 삭제',
    message: '이 일기를 삭제할까요?',
    confirmLabel: '삭제',
    danger: true,
  });
  if (!ok) return;

  state.entries = state.entries.filter((e) => e.id !== id);
  saveEntries();
  renderEntries();
  showToast('일기가 삭제되었습니다');
}



/* ── Render Entries as Desktop Icons ─────────────────── */
export function renderEntries() {
  const grid = dom.entriesGrid;
  grid.innerHTML = '';

  if (state.entries.length === 0) {
    grid.appendChild(createEmptyState());
    dom.entryCount.textContent = '0 entries';
    return;
  }

  dom.entryCount.textContent = `${state.entries.length} ${state.entries.length === 1 ? 'entry' : 'entries'}`;

  const sorted = [...state.entries].sort((a, b) => {
    const dateA = new Date(a.createdAt).getTime();
    const dateB = new Date(b.createdAt).getTime();
    return state.sortAsc ? dateA - dateB : dateB - dateA;
  });

  sorted.forEach((entry) => {
    grid.appendChild(createEntryIcon(entry));
  });
}


/* ── Create Empty State ──────────────────────────────── */
function createEmptyState() {
  const div = document.createElement('div');
  div.className = 'empty-state';
  div.id = 'empty-state';
  div.innerHTML = `
    <div class="empty-icon">
      <svg viewBox="0 0 80 80" fill="none" stroke="currentColor" stroke-width="1.5">
        <rect x="10" y="10" width="60" height="60" rx="8"/>
        <path d="M30 35h20M30 45h12"/>
        <circle cx="55" cy="55" r="12" fill="rgba(139,92,246,0.2)" stroke="rgba(139,92,246,0.6)"/>
        <path d="M55 49v12M49 55h12" stroke="rgba(139,92,246,0.8)" stroke-width="2"/>
      </svg>
    </div>
    <h3>No entries yet</h3>
    <p>Tap <strong>+</strong> to create your first file or diary</p>
  `;
  return div;
}


/* ── Create Desktop-style Entry Icon ─────────────────── */
function createEntryIcon(entry) {
  const icon = document.createElement('div');
  icon.className = 'entry-icon';
  icon.dataset.id = entry.id;

  const color = entry.color || '#8b5cf6';

  let svgIcon = '';
  if (entry.type === 'file') {
    svgIcon = `<svg viewBox="0 0 24 24" fill="${color}" style="width: 44px; height: 44px; filter: drop-shadow(0 2px 6px rgba(0,0,0,0.1));">
      <path d="M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"/>
    </svg>`;
  } else {
    svgIcon = `<svg viewBox="0 0 24 24" fill="${color}" style="width: 44px; height: 44px; filter: drop-shadow(0 2px 6px rgba(0,0,0,0.1));">
      <path d="M18 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zM6 4h5v8l-2.5-1.5L6 12V4z"/>
    </svg>`;
  }

  icon.innerHTML = `
    <div class="entry-emoji">${svgIcon}</div>
    <div class="entry-name">${escapeHTML(entry.title)}</div>
  `;

  // Long press / right-click logic
  let pressTimer;
  const cancelPress = () => clearTimeout(pressTimer);
  
  icon.addEventListener('touchstart', (e) => {
    pressTimer = setTimeout(() => {
      openContextMenu(entry, e.touches[0].clientX, e.touches[0].clientY);
    }, 600);
  });
  icon.addEventListener('touchend', cancelPress);
  icon.addEventListener('touchmove', cancelPress);
  
  icon.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return; // Only left click for long press
    pressTimer = setTimeout(() => {
      openContextMenu(entry, e.clientX, e.clientY);
    }, 600);
  });
  icon.addEventListener('mouseup', cancelPress);
  icon.addEventListener('mouseleave', cancelPress);
  
  icon.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    openContextMenu(entry, e.clientX, e.clientY);
  });

  if (entry.type === 'diary') {
    icon.addEventListener('click', () => {
      if (!dom.ctxMenu.classList.contains('hidden')) return; // Don't open if menu just popped up
      openEditor(entry);
    });
  }

  return icon;
}


/* ── Toggle Sort ─────────────────────────────────────── */
export function toggleSort() {
  state.sortAsc = !state.sortAsc;
  renderEntries();
  showToast(state.sortAsc ? 'Sorted oldest first' : 'Sorted newest first');
}
