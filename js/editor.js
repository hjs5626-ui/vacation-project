/* ═══════════════════════════════════════════════════════════
   MEMENTO DIARY — Editor Screen Logic
   ═══════════════════════════════════════════════════════════ */

import { state, saveEntries } from './state.js';
import { dom } from './dom.js';
import { showToast, navigateTo } from './utils.js';
import { updateGridDimensionsFromContainer, buildLegoGrid } from './grid.js';
import { restoreWidget } from './widgets.js';
import { renderEntries } from './entries.js';
import { ensureMemoWidgetData } from './memo.js';


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
function serializeWidget(w) {
  const base = {
    id: w.id,
    type: w.type,
    row: w.row,
    col: w.col,
    cols: w.cols,
    rows: w.rows,
  };

  if (w.type === 'gallery') {
    return { ...base, imageData: w.imageData };
  }

  if (w.type === 'todo') {
    return {
      ...base,
      groups: w.groups ?? [],
      tasks: w.tasks ?? [],
      activeTab: w.activeTab ?? 'all',
    };
  }

  if (w.type === 'memo') {
    ensureMemoWidgetData(w);
    return {
      ...base,
      profile: {
        coverImage: w.profile.coverImage ?? '',
        headerText: w.profile.headerText ?? '',
        profileImage: w.profile.profileImage ?? '',
        displayName: w.profile.displayName ?? 'Guest',
      },
      sortBy: w.sortBy,
      activeCategory: w.activeCategory,
      memos: w.memos.map((m) => ({
        id: m.id,
        title: m.title,
        content: m.content,
        category: m.category ?? 'default',
        coverImage: m.coverImage ?? '',
        pages: (m.pages ?? []).map((p) => ({
          id: p.id,
          templateId: p.templateId ?? 'basic',
          category: p.category ?? '',
          date: p.date ?? '',
          title: p.title ?? '',
          content: p.content ?? '',
          isContinuation: Boolean(p.isContinuation),
          createdAt: p.createdAt,
          updatedAt: p.updatedAt,
        })),
        draftPages: (m.draftPages ?? []).map((p) => ({
          id: p.id,
          templateId: p.templateId ?? 'basic',
          category: p.category ?? '',
          date: p.date ?? '',
          title: p.title ?? '',
          content: p.content ?? '',
          isContinuation: Boolean(p.isContinuation),
          createdAt: p.createdAt,
          updatedAt: p.updatedAt,
        })),
        createdAt: m.createdAt,
        updatedAt: m.updatedAt,
      })),
    };
  }

  return { ...base, imageData: w.imageData };
}

export function saveDiary() {
  if (!state.currentDiary) return;

  state.currentDiary.title = dom.editorTitle.value.trim() || 'Untitled';
  state.currentDiary.titleFontSize = state.titleFontSize;

  state.currentDiary.widgets = state.widgets.map(serializeWidget);

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
