/* ═══════════════════════════════════════════════════════════
   MEMENTO DIARY — Main Entry Point & Event Orchestration
   ═══════════════════════════════════════════════════════════ */

import { state } from './state.js';
import { dom, $, $$ } from './dom.js';
import { renderCalendar } from './calendar.js';
import { renderEntries, toggleSort, initContextMenu } from './entries.js';
import { buildSizeCarousel, buildTodoSizeCarousel, buildLedgerSizeCarousel, buildMemoSizeCarousel, navigateCarousel, navigateTodoCarousel, navigateLedgerCarousel, navigateMemoCarousel, openDrawer, closeDrawer, onChooseSize, onChooseTodoSize, onChooseLedgerSize, onChooseMemoSize, onImageSelected, onConfirmYes, onConfirmNo } from './drawer.js';
import { openAddModal, closeAddModal, showModalStep, bindColorPicker, bindVisibilityOptions, createFile, createDiary } from './modals.js';
import { bindLedgerDetailEvents } from './ledgerDetail.js';
import { bindMemoFullscreenEvents } from './memo.js';
import { initAppDialogs } from './dialogs.js';
import { saveEntries, ensureMemoProfile, saveMemoProfile, DEFAULT_MEMO_PROFILE } from './state.js';
import { showToast } from './utils.js';
import { cancelPlacement, rerenderPlacedWidgets } from './widgets.js';
import { bindTodoComposeSheetEvents, bindTodoGroupRenameEvents, bindTodoResizeSheetEvents } from './todo.js';
import { updateGridDimensionsFromContainer, buildLegoGrid } from './grid.js';
import { renderBreadcrumbs } from './folderManager.js';
import { renderStorageBox } from './storageBox.js';
import { closeBookEditor, turnPageLeft, turnPageRight, renderBookSpread, openPageOverview, closePageOverview } from './bookEditor.js';


/* ── Initialization ──────────────────────────────────── */
function init() {
  renderCalendar();
  renderEntries();
  renderBreadcrumbs();
  renderStorageBox();
  initContextMenu();
  buildSizeCarousel();
  buildTodoSizeCarousel();
  buildLedgerSizeCarousel();
  buildMemoSizeCarousel();
  bindLedgerDetailEvents();
  bindMemoFullscreenEvents();
  initAppDialogs();
  bindTodoComposeSheetEvents();
  bindTodoGroupRenameEvents();
  bindTodoResizeSheetEvents();
  renderMainHero();
  bindProfileEditorEvents();
  bindEvents();
}

function renderMainHero() {
  const profile = ensureMemoProfile();
  const coverBg = document.getElementById('hero-cover-bg');
  const avatar = document.getElementById('hero-avatar');
  const name = document.getElementById('hero-name');
  const desc = document.getElementById('hero-desc');
  
  if (coverBg) {
    if (profile.coverImage) {
      coverBg.style.backgroundImage = `url(${profile.coverImage})`;
      coverBg.classList.add('has-image');
    } else {
      coverBg.style.backgroundImage = '';
      coverBg.classList.remove('has-image');
    }
  }
  
  if (avatar) {
    avatar.replaceChildren();
    if (profile.profileImage) {
      const img = document.createElement('img');
      img.src = profile.profileImage;
      avatar.appendChild(img);
    } else {
      avatar.textContent = '프사';
    }
  }
  
  if (name) name.textContent = profile.displayName || DEFAULT_MEMO_PROFILE.displayName;
  if (desc) desc.textContent = profile.headerText || '나의 다이어리';
}

/* ── Profile Editor ──────────────────────────────────── */
function bindProfileEditorEvents() {
  const profile = ensureMemoProfile();
  
  const profilePage = document.getElementById('profile-editor-page');
  const mainPage = document.getElementById('main-page');
  
  const peCoverPreview = document.getElementById('pe-cover-preview');
  const peCoverInput = document.getElementById('pe-cover-input');
  const peCoverSelectBtn = document.getElementById('pe-cover-select');
  const peCoverRemoveBtn = document.getElementById('pe-cover-remove');
  const peAvatarPreview = document.getElementById('pe-avatar-preview');
  const peProfileInput = document.getElementById('pe-profile-input');
  const peProfileSelectBtn = document.getElementById('pe-profile-select');
  const peProfileRemoveBtn = document.getElementById('pe-profile-remove');
  const peDisplayName = document.getElementById('pe-display-name');
  const peHeaderText = document.getElementById('pe-header-text');
  const peBackBtn = document.getElementById('pe-back');
  const peSaveBtn = document.getElementById('pe-save');
  const heroEditBtn = document.getElementById('hero-edit-btn');

  // Temporary state for the editor
  let currentCover = profile.coverImage;
  let currentAvatar = profile.profileImage;

  function updatePreviews() {
    if (!peCoverPreview || !peAvatarPreview) return;
    if (currentCover) {
      peCoverPreview.style.backgroundImage = `url(${currentCover})`;
      peCoverPreview.classList.add('has-image');
    } else {
      peCoverPreview.style.backgroundImage = '';
      peCoverPreview.classList.remove('has-image');
    }

    peAvatarPreview.replaceChildren();
    if (currentAvatar) {
      const img = document.createElement('img');
      img.src = currentAvatar;
      peAvatarPreview.appendChild(img);
    } else {
      peAvatarPreview.textContent = '프사';
    }
  }

  function readFileAsDataURL(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  // Cover Image
  peCoverSelectBtn?.addEventListener('click', () => peCoverInput?.click());
  peCoverInput?.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      currentCover = await readFileAsDataURL(file);
      updatePreviews();
    } catch (err) {
      showToast('이미지를 불러오는데 실패했습니다.');
    }
  });
  peCoverRemoveBtn?.addEventListener('click', () => {
    currentCover = '';
    updatePreviews();
  });

  // Avatar Image
  peProfileSelectBtn?.addEventListener('click', () => peProfileInput?.click());
  peProfileInput?.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      currentAvatar = await readFileAsDataURL(file);
      updatePreviews();
    } catch (err) {
      showToast('이미지를 불러오는데 실패했습니다.');
    }
  });
  peProfileRemoveBtn?.addEventListener('click', () => {
    currentAvatar = '';
    updatePreviews();
  });

  // Open/Close
  heroEditBtn?.addEventListener('click', () => {
    // Populate with current actual state
    currentCover = profile.coverImage;
    currentAvatar = profile.profileImage;
    if (peDisplayName) peDisplayName.value = profile.displayName || '';
    if (peHeaderText) peHeaderText.value = profile.headerText || '';
    updatePreviews();
    mainPage?.classList.remove('active');
    profilePage?.classList.add('active');
  });

  peBackBtn?.addEventListener('click', () => {
    profilePage?.classList.remove('active');
    mainPage?.classList.add('active');
  });

  // Save
  peSaveBtn?.addEventListener('click', () => {
    profile.coverImage = currentCover;
    profile.profileImage = currentAvatar;
    if (peDisplayName) profile.displayName = peDisplayName.value.trim() || DEFAULT_MEMO_PROFILE.displayName;
    if (peHeaderText) profile.headerText = peHeaderText.value.trim() || DEFAULT_MEMO_PROFILE.headerText;
    
    saveMemoProfile();
    renderMainHero();
    profilePage?.classList.remove('active');
    mainPage?.classList.add('active');
    showToast('프로필이 저장되었습니다.');
  });
}



/* ── Event Binding ───────────────────────────────────── */
function bindEvents() {
  // Add modal
  dom.addBtn?.addEventListener('click', openAddModal);
  dom.addModalClose?.addEventListener('click', closeAddModal);
  dom.addModalOverlay?.addEventListener('click', (e) => {
    if (e.target === dom.addModalOverlay) closeAddModal();
  });

  // Modal navigation
  dom.chooseFile?.addEventListener('click', () => showModalStep('file'));
  dom.chooseDiary?.addEventListener('click', () => showModalStep('diary'));
  dom.fileBack?.addEventListener('click', () => showModalStep('choose'));
  dom.diaryBack?.addEventListener('click', () => showModalStep('choose'));

  // Color pickers
  if (dom.fileColorPicker) bindColorPicker(dom.fileColorPicker);
  if (dom.diaryColorPicker) bindColorPicker(dom.diaryColorPicker);

  // Visibility options
  if (dom.fileVisibility) bindVisibilityOptions(dom.fileVisibility, dom.fileAllowedUsers);
  if (dom.diaryVisibility) bindVisibilityOptions(dom.diaryVisibility);

  // Create buttons
  dom.fileCreateBtn?.addEventListener('click', createFile);
  dom.diaryCreateBtn?.addEventListener('click', createDiary);

  // Sort
  dom.sortBtn?.addEventListener('click', toggleSort);

  // Calendar
  dom.calPrev?.addEventListener('click', () => { state.calendarDate.setMonth(state.calendarDate.getMonth() - 1); renderCalendar(); });
  dom.calNext?.addEventListener('click', () => { state.calendarDate.setMonth(state.calendarDate.getMonth() + 1); renderCalendar(); });

  // Editor (Book UI)
  dom.editorBack?.addEventListener('click', closeBookEditor);
  dom.editorSave?.addEventListener('click', () => {
    saveEntries();
    showToast('Diary saved!');
  });
  
  // Book navigation
  document.getElementById('book-prev')?.addEventListener('click', turnPageLeft);
  document.getElementById('book-next')?.addEventListener('click', turnPageRight);
  document.getElementById('book-spine')?.addEventListener('click', openPageOverview);
  document.getElementById('close-overview')?.addEventListener('click', closePageOverview);

  // Drawer
  dom.drawerOverlay?.addEventListener('click', (e) => {
    if (e.target === dom.drawerOverlay) closeDrawer();
  });

  // Drawer tabs
  dom.drawerTabs?.addEventListener('click', (e) => {
    const tab = e.target.closest('.drawer-tab');
    if (!tab) return;
    $$('.drawer-tab').forEach((t) => t.classList.remove('active'));
    tab.classList.add('active');
    const tabName = tab.dataset.tab;
    $$('.tab-content').forEach((c) => c.classList.add('hidden'));
    $(`#tab-${tabName}`).classList.remove('hidden');
  });

  // Carousel navigation
  dom.carouselPrev?.addEventListener('click', () => navigateCarousel(-1));
  dom.carouselNext?.addEventListener('click', () => navigateCarousel(1));

  // Choose size
  dom.btnChooseSize?.addEventListener('click', onChooseSize);
  dom.btnChooseTodoSize?.addEventListener('click', onChooseTodoSize);
  dom.btnChooseLedger?.addEventListener('click', onChooseLedgerSize);
  dom.btnChooseMemo?.addEventListener('click', onChooseMemoSize);

  // To-Do carousel navigation
  dom.todoCarouselPrev?.addEventListener('click', () => navigateTodoCarousel(-1));
  dom.todoCarouselNext?.addEventListener('click', () => navigateTodoCarousel(1));

  // Ledger carousel navigation
  dom.ledgerCarouselPrev?.addEventListener('click', () => navigateLedgerCarousel(-1));
  dom.ledgerCarouselNext?.addEventListener('click', () => navigateLedgerCarousel(1));

  // Memo carousel navigation
  dom.memoCarouselPrev?.addEventListener('click', () => navigateMemoCarousel(-1));
  dom.memoCarouselNext?.addEventListener('click', () => navigateMemoCarousel(1));

  // File input change
  dom.fileInputHidden?.addEventListener('change', onImageSelected);

  // Confirm dialog
  dom.confirmYes?.addEventListener('click', onConfirmYes);
  dom.confirmNo?.addEventListener('click', onConfirmNo);

  // Cancel placement
  dom.cancelPlacement?.addEventListener('click', cancelPlacement);

  // Responsive grid
  window.addEventListener('resize', () => {
    if (!dom.editorPage.classList.contains('active')) return;
    updateGridDimensionsFromContainer();
    buildLegoGrid();
    rerenderPlacedWidgets();
  });

  // Book Overview
  dom.bookSpine?.addEventListener('click', openPageOverview);
  dom.closeOverviewBtn?.addEventListener('click', closePageOverview);
}


/* ── Boot ─────────────────────────────────────────────── */
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
