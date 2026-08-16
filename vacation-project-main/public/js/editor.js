/* ═══════════════════════════════════════════════════════════
   MEMENTO DIARY — Editor Screen Logic
   ═══════════════════════════════════════════════════════════ */

import { state, saveEntries } from './state.js';
import { dom } from './dom.js';
import { showToast, navigateTo } from './utils.js';
import { updateGridDimensionsFromContainer, buildLegoGrid } from './grid.js';
import { restoreWidget } from './widgets.js';
import { renderEntries } from './entries.js';


/* ── Open Editor ─────────────────────────────────────── */
export function openEditor(entry) {
  state.currentDiary = entry;
  state.occupiedCells = {};
  state.widgets = [];
  state.widgetIdCounter = 0;
  state.placementMode = false;
  state.titleFontSize = entry.titleFontSize || 28;

  dom.editorTitle.value = entry.title;
  dom.editorTitle.style.fontSize = state.titleFontSize + 'px';
  dom.fontSizeDisplay.textContent = state.titleFontSize + 'px';
  dom.editorLabel.textContent = 'Editing';
  dom.placementOverlay.classList.add('hidden');

  updateGridDimensionsFromContainer();
  buildLegoGrid();

  // Restore placed widgets
  if (entry.widgets && entry.widgets.length) {
    entry.widgets.forEach((w) => {
      restoreWidget(w);
    });
  }

  navigateTo('editor-page');
}


/* ── Save Diary ──────────────────────────────────────── */
export function saveDiary() {
  if (!state.currentDiary) return;

  state.currentDiary.title = dom.editorTitle.value.trim() || 'Untitled';
  state.currentDiary.titleFontSize = state.titleFontSize;

  state.currentDiary.widgets = state.widgets.map((w) => ({
    id: w.id,
    type: w.type,
    row: w.row,
    col: w.col,
    cols: w.cols,
    rows: w.rows,
    imageData: w.imageData,
  }));

  saveEntries();
  showToast('Diary saved!');
  dom.editorLabel.textContent = 'Saved ✓';
  setTimeout(() => { if (dom.editorLabel) dom.editorLabel.textContent = 'Editing'; }, 2000);
}


/* ── Font Size ───────────────────────────────────────── */
export function changeFontSize(delta) {
  state.titleFontSize = Math.min(56, Math.max(16, state.titleFontSize + delta));
  dom.editorTitle.style.fontSize = state.titleFontSize + 'px';
  dom.fontSizeDisplay.textContent = state.titleFontSize + 'px';
}


/* ── Back to Main ────────────────────────────────────── */
export function backToMain() {
  navigateTo('main-page');
  state.currentDiary = null;
  renderEntries();
}
