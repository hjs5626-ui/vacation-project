/* ═══════════════════════════════════════════════════════════
   MEMENTO DIARY — Main Entry Point & Event Orchestration
   ═══════════════════════════════════════════════════════════ */

import { state, migrateMemoProfileFromEntries, migrateMemoDataFromEntries } from './state.js';
import { dom, $, $$ } from './dom.js';
import { renderCalendar } from './calendar.js';
import { renderEntries, toggleSort, initContextMenu } from './entries.js';
import { buildSizeCarousel, buildTodoSizeCarousel, buildMemoSizeCarousel, navigateCarousel, navigateTodoCarousel, navigateMemoCarousel, openDrawer, closeDrawer, onChooseSize, onChooseTodoSize, onChooseMemoSize, onImageSelected, onConfirmYes, onConfirmNo } from './drawer.js';
import { openAddModal, closeAddModal, showModalStep, bindColorPicker, bindVisibilityOptions, createFile, createDiary } from './modals.js';
import { backToMain, saveDiary, changeFontSize } from './editor.js';
import { cancelPlacement, rerenderPlacedWidgets } from './widgets.js';
import { updateGridDimensionsFromContainer, buildLegoGrid } from './grid.js';
import { bindTodoComposeSheetEvents, bindTodoResizeSheetEvents, bindTodoDetailEvents, closeTodoDetailPanel } from './todo.js';
import { initAppDialogs } from './dialogs.js';
import { bindMemoFullscreenEvents, closeMemoFullscreen } from './memo.js';


/* ── Initialization ──────────────────────────────────── */
function init() {
  migrateMemoProfileFromEntries();
  migrateMemoDataFromEntries();
  renderCalendar();
  renderEntries();
  initContextMenu();
  buildSizeCarousel();
  buildTodoSizeCarousel();
  buildMemoSizeCarousel();
  initAppDialogs();
  bindTodoComposeSheetEvents();
  bindTodoResizeSheetEvents();
  bindTodoDetailEvents();
  bindMemoFullscreenEvents();
  bindEvents();
}


/* ── Event Binding ───────────────────────────────────── */
function bindEvents() {
  // Add modal
  dom.addBtn.addEventListener('click', openAddModal);
  dom.addModalClose.addEventListener('click', closeAddModal);
  dom.addModalOverlay.addEventListener('click', (e) => {
    if (e.target === dom.addModalOverlay) closeAddModal();
  });

  // Modal navigation
  dom.chooseFile.addEventListener('click', () => showModalStep('file'));
  dom.chooseDiary.addEventListener('click', () => showModalStep('diary'));
  dom.fileBack.addEventListener('click', () => showModalStep('choose'));
  dom.diaryBack.addEventListener('click', () => showModalStep('choose'));

  // Color pickers
  bindColorPicker(dom.fileColorPicker);
  bindColorPicker(dom.diaryColorPicker);

  // Visibility options
  bindVisibilityOptions(dom.fileVisibility, dom.fileAllowedUsers);
  bindVisibilityOptions(dom.diaryVisibility);

  // Create buttons
  dom.fileCreateBtn.addEventListener('click', createFile);
  dom.diaryCreateBtn.addEventListener('click', createDiary);

  // Sort
  dom.sortBtn.addEventListener('click', toggleSort);

  // Calendar
  dom.calPrev.addEventListener('click', () => { state.calendarDate.setMonth(state.calendarDate.getMonth() - 1); renderCalendar(); });
  dom.calNext.addEventListener('click', () => { state.calendarDate.setMonth(state.calendarDate.getMonth() + 1); renderCalendar(); });

  // Editor
  dom.editorBack.addEventListener('click', () => {
    closeMemoFullscreen();
    closeTodoDetailPanel();
    backToMain();
  });
  dom.editorSave.addEventListener('click', saveDiary);
  dom.fontDec.addEventListener('click', () => changeFontSize(-2));
  dom.fontInc.addEventListener('click', () => changeFontSize(2));

  // FAB
  dom.fabAdd.addEventListener('click', openDrawer);

  // Drawer
  dom.drawerOverlay.addEventListener('click', (e) => {
    if (e.target === dom.drawerOverlay) closeDrawer();
  });

  // Drawer tabs
  dom.drawerTabs.addEventListener('click', (e) => {
    const tab = e.target.closest('.drawer-tab');
    if (!tab) return;
    $$('.drawer-tab').forEach((t) => t.classList.remove('active'));
    tab.classList.add('active');
    const tabName = tab.dataset.tab;
    $$('.tab-content').forEach((c) => c.classList.add('hidden'));
    $(`#tab-${tabName}`).classList.remove('hidden');
  });

  // Carousel navigation
  dom.carouselPrev.addEventListener('click', () => navigateCarousel(-1));
  dom.carouselNext.addEventListener('click', () => navigateCarousel(1));

  // Choose size
  dom.btnChooseSize.addEventListener('click', onChooseSize);
  dom.btnChooseTodoSize.addEventListener('click', onChooseTodoSize);

  // Memo carousel navigation
  dom.memoCarouselPrev.addEventListener('click', () => navigateMemoCarousel(-1));
  dom.memoCarouselNext.addEventListener('click', () => navigateMemoCarousel(1));
  dom.btnChooseMemoSize.addEventListener('click', onChooseMemoSize);

  // To-Do carousel navigation
  dom.todoCarouselPrev.addEventListener('click', () => navigateTodoCarousel(-1));
  dom.todoCarouselNext.addEventListener('click', () => navigateTodoCarousel(1));

  // File input change
  dom.fileInputHidden.addEventListener('change', onImageSelected);

  // Confirm dialog
  dom.confirmYes.addEventListener('click', onConfirmYes);
  dom.confirmNo.addEventListener('click', onConfirmNo);

  // Cancel placement
  dom.cancelPlacement.addEventListener('click', cancelPlacement);

  // Responsive grid
  window.addEventListener('resize', () => {
    if (!dom.editorPage.classList.contains('active')) return;
    updateGridDimensionsFromContainer();
    buildLegoGrid();
    rerenderPlacedWidgets();
  });
}


/* ── Boot ─────────────────────────────────────────────── */
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
