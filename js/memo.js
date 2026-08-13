/* ═══════════════════════════════════════════════════════════
   MEMENTO DIARY — Memo Widget Logic
   ═══════════════════════════════════════════════════════════ */

import {
  state,
  saveEntries,
  ensureMemoProfile,
  saveMemoProfile,
  DEFAULT_MEMO_PROFILE,
  getSharedMemos,
  saveMemoData,
  ensureMemoData,
  getMemoCategories,
  getMemoActiveCategory,
  setMemoActiveCategory,
} from './state.js';
import { dom } from './dom.js';
import { showToast } from './utils.js';
import { collectMemoImageIdsFromHtml, deleteMemoImageBlob, applyMemoImageLayoutHints } from './memo-media.js';
import {
  beginPhotoContinuationSheet,
  beginContinuationSheetWithContent,
  bindMemoPhotoEditorInteractions,
  bindMemoReadModePhotoLightbox,
  buildMemoPhotoFileInput,
  getMemoDraftExcerptWithPhotos,
  getPageEditorSheetQueue,
  handleMemoPhotoFileInputChange,
  memoHtmlHasVisibleContent,
  openMemoPhotoPicker,
  removeMemoPhotoDialogs,
  resetMemoPhotoSession,
  serializeMemoEditorHtml,
  setupMemoEditorImages,
  setupMemoReadModeImages,
  syncMemoPhotoToolbarState,
  MEMO_PHOTO_BLOCK_CLASS,
  MEMO_PHOTO_SELECTED_CLASS,
} from './memo-photo.js';
import {
  doesHtmlFitEditorSheet,
  getIsCreatingOverflowSheet,
  getSheetContentMaxHeight,
  measureHtmlContentHeight,
  removeSheetOverflowDialogs,
  setIsCreatingOverflowSheet,
  showTextSheetOverflowDialog,
  splitHtmlAtSheetLimit,
} from './memo-sheet-overflow.js';
import {
  appendContinuationSheetAtEnd,
  collectSessionDraftIds,
  ensureEditorSessionFromDraft,
  filterSavableSessionSheets,
  getActiveEditorSheet,
  getActiveEditorSheetIndex,
  getEditorSession,
  getEditorSessionSheetCount,
  getEditorSessionSheets,
  initEditorSessionWithSheet,
  initEditorSessionWithSheets,
  migrateLegacyQueueToSession,
  resetEditorSession,
  resetAllEditorSessions,
  setActiveEditorSheetIndex,
  syncCurrentDraftIntoSession,
} from './memo-editor-session.js';
import { openConfirmDialog } from './dialogs.js';


const editorDrafts = new Map();
const profileDrafts = new Map();

const DEFAULT_PROFILE = DEFAULT_MEMO_PROFILE;

const IMAGE_MAX_BYTES = 12 * 1024 * 1024;
const IMAGE_BG = '#FDF4F0';
const PROFILE_IMAGE_OUTPUT_SIZE = 512;
const PROFILE_IMAGE_JPEG_QUALITY = 0.8;
const COVER_ASPECT = 16 / 6;
const COVER_MAX_WIDTH = 1280;
const COVER_MAX_HEIGHT = 480;
const COVER_JPEG_QUALITY = 0.78;

const createSetupMenuItems = [
  { id: 'template', label: '속지선택' },
  { id: 'pages', label: '페이지' },
  { id: 'archive', label: '보관함' },
  { id: 'delete', label: '삭제' },
];

const insertPositionOptions = [
  { id: 'before-current', label: '현재 페이지 전' },
  { id: 'after-current', label: '현재 페이지 후' },
  { id: 'append-last', label: '맨 마지막' },
];

const memoPageTemplates = [
  { id: 'basic', label: '기본', layout: 'basic' },
];

const MEMO_BASIC_TEMPLATE_ID = 'basic';

const MEMO_SORT_OPTIONS = [
  { sortBy: 'updatedAt', label: '최신순' },
  { sortBy: 'updatedAtAsc', label: '오래된순' },
  { sortBy: 'title', label: '제목순' },
];

const TEMPLATE_CAROUSEL_PAGE_SIZE = 4;

const TEXT_PAGE_TOOLBAR_ITEMS = [
  { id: 'photo', icon: '📷', label: '사진' },
  { id: 'align', icon: '≡', label: '정렬' },
  { id: 'map', icon: '📍', label: '지도', toast: '지도 불러오기 기능은 준비 중입니다.' },
  { id: 'ledger', icon: '₩', label: '가계부', toast: '가계부 불러오기 기능은 준비 중입니다.' },
  { id: 'link', icon: '🔗', label: '링크', toast: '외부 링크 첨부 기능은 준비 중입니다.' },
  { id: 'archive', icon: '🗂️', label: '보관함', edge: true },
];

const SHEET_TITLE_MAX_LENGTH = 50;
const CONTINUE_SHEET_FILL_RATIO = 0.88;

const MEMO_CATEGORY_NAME_MAX_LENGTH = 20;
const MEMO_ACTIVE_CATEGORY_ALL = 'all';

const MEMO_HTML_ALLOWED_TAGS = new Set([
  'p',
  'div',
  'br',
  'strong',
  'b',
  'em',
  'i',
  'u',
  'span',
  'ul',
  'ol',
  'li',
  'a',
  'img',
  'figure',
  'figcaption',
]);

const MEMO_HTML_GLOBAL_ALLOWED_ATTRS = new Set(['class']);

const MEMO_HTML_TAG_ALLOWED_ATTRS = {
  a: new Set(['href', 'target', 'rel']),
  img: new Set([
    'data-memo-image-id',
    'data-memo-image-width',
    'data-memo-image-height',
    'data-memo-display-width',
    'data-memo-display-height',
    'alt',
  ]),
  div: new Set(['data-memo-image-id']),
};

/** Session-only — not persisted */
let activeMemoWidgetId = null;
let fullscreenViewMode = 'home';
let selectedMemoId = null;
let fabExpanded = false;
let isCreateSetupMenuOpen = false;
let isMemoHomeSortMenuOpen = false;
let isMemoHomeCategoryMenuOpen = false;
let isMemoHomeEditMode = false;
let isMemoHomeSearchOpen = false;
let memoHomeSearchQuery = '';
let isPageEditorCategoryMenuOpen = false;
let isTemplatePopupOpen = false;
let previewPickerTargetWidgetId = null;
let previewPickerSelectedPageId = null;
let isMemoDeleteSelectionMode = false;
const selectedDeletePageIds = new Set();
let isMemoPageDeleteInProgress = false;
let isMemoDiaryDeleteInProgress = false;
let isArchivePopupOpen = false;
let archiveMemoId = null;
let archiveDraftId = null;
let archiveDraftGroupId = null;
let archiveDraftIds = [];
let archiveDraftActiveIndex = 0;
let archiveAnchorPageId = null;
let draftDetailInsertPosition = 'append-last';
let draftAddScope = 'all';
let isDraftAddInProgress = false;
let isArchiveDraftDeleting = false;
let isArchiveGroupDeleting = false;
let isArchiveGroupAdding = false;
let archiveMenuScrollCleanup = null;
let archiveMenuOutsideClickHandler = null;
let archiveMenuResizeHandler = null;
let archiveMenuIgnoreOutsideUntil = 0;

const MEMO_PAGE_MANAGER_LONG_PRESS_DELAY = 400;
const MEMO_PAGE_MANAGER_DRAG_CANCEL_DISTANCE = 10;

let isMemoPageManagerOpen = false;
let memoPageManagerMemoId = null;
let memoPageManagerOriginalPageIds = [];
let memoPageManagerWorkingPages = [];
let memoPageManagerSelectedIds = new Set();
let isMemoPageManagerSelectionMode = false;
let isMemoPageManagerDirty = false;
let memoPageManagerDragState = null;
let isMemoPageManagerSaving = false;
let memoPageManagerPointerCleanup = null;
let didMemoPageManagerDrag = false;
let suppressMemoPageManagerClickUntil = 0;
let memoPageManagerOpenPageId = null;

const MEMO_EDITOR_ALIGN_CLASSES = ['memo-align-left', 'memo-align-center', 'memo-align-right'];
const MEMO_EDITOR_ALIGNABLE_BLOCK_TAGS = new Set(['div', 'p', 'ul', 'ol', 'li']);

let memoEditorSavedAlignmentRange = null;
let isMemoEditorAlignMenuOpen = false;
let memoEditorAlignOutsideClickHandler = null;
let selectedInsertPosition = 'after-current';
let selectedTemplateId = null;
let templateCarouselIndex = 0;

/** widgetId → { insertPosition, selectedTemplateId } */
const createSetupSheetDrafts = new Map();

/** createSetup·바인더에서 표시 중인 다이어리(memo) id */
let currentDiaryId = null;
let currentPageId = null;
let isPageTurning = false;

const pageEditorDrafts = new Map();
const pageEditorBaselines = new Map();
const pageEditorBaselineRefreshers = new Map();
let isEditorSessionSaving = false;
let isEditorSessionDraftSaving = false;


function normalizeMemoTemplateId(templateId) {
  return templateId || MEMO_BASIC_TEMPLATE_ID;
}


export function ensureMemoWidgetData(w) {
  if (!w || w.type !== 'memo') return w;
  ensureMemoData();

  if (!w.profile || typeof w.profile !== 'object') {
    w.profile = { ...DEFAULT_PROFILE };
  } else {
    w.profile = {
      coverImage: w.profile.coverImage ?? '',
      headerText: w.profile.headerText ?? DEFAULT_PROFILE.headerText,
      profileImage: w.profile.profileImage ?? '',
      displayName: w.profile.displayName ?? DEFAULT_PROFILE.displayName,
    };
  }

  if (w.sortBy == null) w.sortBy = 'updatedAt';
  w.sortBy = normalizeMemoSortBy(w.sortBy);
  if (w.previewMemoId == null) w.previewMemoId = '';
  if (w.previewPageId == null) w.previewPageId = '';
  validateMemoWidgetPreview(w);
  return w;
}


function validateMemoWidgetPreview(w) {
  if (!w.previewMemoId || !w.previewPageId) {
    w.previewMemoId = '';
    w.previewPageId = '';
    return;
  }
  const memo = findSharedMemoById(w.previewMemoId);
  const page = memo?.pages?.find((p) => p.id === w.previewPageId);
  if (!page) {
    w.previewMemoId = '';
    w.previewPageId = '';
  }
}


function findSharedMemoById(memoId) {
  if (!memoId) return null;
  return getSharedMemos().find((m) => m.id === memoId) ?? null;
}


function findDiaryWidgetById(widgetId) {
  if (!widgetId || !state.currentDiary?.widgets) return null;
  return state.currentDiary.widgets.find((dw) => dw.id === widgetId) ?? null;
}


function persistMemoWidgetSettings(w) {
  if (!w) return;
  ensureMemoWidgetData(w);
  const diaryWidget = findDiaryWidgetById(w.id);
  if (diaryWidget) {
    diaryWidget.sortBy = w.sortBy;
    diaryWidget.previewMemoId = w.previewMemoId ?? '';
    diaryWidget.previewPageId = w.previewPageId ?? '';
  }
  saveEntries();
}


export function initMemoSessionState(w) {
  editorDrafts.delete(w.id);
  profileDrafts.delete(w.id);
  createSetupSheetDrafts.delete(w.id);
  pageEditorDrafts.delete(w.id);
  pageEditorBaselines.delete(w.id);
  resetEditorSession(w.id);
  resetMemoPhotoSession(w.id);
}


function resetPageEditorSessionState() {
  closeMemoEditorAlignMenu();
  pageEditorDrafts.clear();
  pageEditorBaselines.clear();
  pageEditorBaselineRefreshers.clear();
  resetAllEditorSessions();
  currentDiaryId = null;
  currentPageId = null;
}


function resetArchiveSessionState() {
  isArchivePopupOpen = false;
  archiveMemoId = null;
  archiveDraftId = null;
  archiveDraftGroupId = null;
  archiveDraftIds = [];
  archiveDraftActiveIndex = 0;
  archiveAnchorPageId = null;
  draftDetailInsertPosition = 'append-last';
  draftAddScope = 'all';
  isDraftAddInProgress = false;
  isArchiveDraftDeleting = false;
  isArchiveGroupDeleting = false;
  isArchiveGroupAdding = false;
  closeArchiveDraftCardMenu();
  dom.memoFullscreenBody?.querySelector('.memo-archive-popup')?.remove();
  dom.memoFullscreenBody?.querySelector('.memo-draft-add-dialog')?.remove();
  dom.memoFullscreenBody?.querySelector('.memo-draft-add-scope-dialog')?.remove();
  dom.memoFullscreenBody?.querySelector('.memo-draft-delete-dialog')?.remove();
}


function resetArchiveDetailState() {
  archiveMemoId = null;
  archiveDraftId = null;
  archiveDraftGroupId = null;
  archiveDraftIds = [];
  archiveDraftActiveIndex = 0;
  archiveAnchorPageId = null;
  draftDetailInsertPosition = 'append-last';
  draftAddScope = 'all';
  isArchiveDraftDeleting = false;
  isArchiveGroupDeleting = false;
  isArchiveGroupAdding = false;
}


function resetTemplatePopupSessionState() {
  isTemplatePopupOpen = false;
  selectedInsertPosition = 'after-current';
  selectedTemplateId = null;
  templateCarouselIndex = 0;
}


function resetFullscreenSession() {
  const widgetId = activeMemoWidgetId;
  activeMemoWidgetId = null;
  fullscreenViewMode = 'home';
  selectedMemoId = null;
  fabExpanded = false;
  isCreateSetupMenuOpen = false;
  isMemoHomeSortMenuOpen = false;
  isMemoHomeCategoryMenuOpen = false;
  isMemoHomeEditMode = false;
  isMemoHomeSearchOpen = false;
  memoHomeSearchQuery = '';
  isPageEditorCategoryMenuOpen = false;
  previewPickerTargetWidgetId = null;
  previewPickerSelectedPageId = null;
  resetMemoDeleteSelectionState();
  resetTemplatePopupSessionState();
  resetArchiveSessionState();
  resetPageEditorSessionState();
  resetMemoPhotoSession(widgetId);
  removeMemoPhotoDialogs(dom.memoFullscreenBody);
}


function removeMemoPageDeleteConfirmDialog() {
  dom.memoFullscreenBody?.querySelector('.memo-page-delete-dialog')?.remove();
}


function resetMemoDeleteSelectionState() {
  isMemoDeleteSelectionMode = false;
  selectedDeletePageIds.clear();
  isMemoPageDeleteInProgress = false;
  removeMemoPageDeleteConfirmDialog();
}


function enterMemoDeleteSelectionMode(w) {
  if (!w || previewPickerTargetWidgetId) return;
  isMemoDeleteSelectionMode = true;
  selectedDeletePageIds.clear();
  closeCreateSetupMenu();
  closeTemplatePopup();
  renderMemoFullscreen();
}


function exitMemoDeleteSelectionMode(w, { rerender = true } = {}) {
  resetMemoDeleteSelectionState();
  if (rerender && w) renderMemoFullscreen();
}


function toggleDeletePageSelection(pageId, w) {
  const memo = getActiveCreateSetupMemo(w);
  if (!pageId || !memo?.pages?.some((page) => page.id === pageId)) return;

  if (selectedDeletePageIds.has(pageId)) {
    selectedDeletePageIds.delete(pageId);
  } else {
    selectedDeletePageIds.add(pageId);
  }

  syncDeleteSelectionUi();
  refreshBinderSpreadView(w);
}


function syncDeleteSelectionUi() {
  const root = dom.memoFullscreenBody;
  if (!root) return;

  const count = selectedDeletePageIds.size;
  const status = root.querySelector('.memo-delete-selection-status');
  if (status) {
    status.textContent = count > 0
      ? `선택한 페이지 ${count}개`
      : '삭제할 페이지를 선택하세요.';
  }

  const deleteBtn = root.querySelector('.memo-delete-selection-confirm');
  if (deleteBtn) {
    deleteBtn.disabled = count === 0 || isMemoPageDeleteInProgress;
  }

  const cancelBtn = root.querySelector('.memo-delete-selection-cancel');
  if (cancelBtn) {
    cancelBtn.disabled = isMemoPageDeleteInProgress;
  }
}


function buildMemoDeleteSelectionBar() {
  const count = selectedDeletePageIds.size;
  const bar = document.createElement('div');
  bar.className = 'memo-delete-selection-bar glass-panel';

  const status = document.createElement('p');
  status.className = 'memo-delete-selection-status';
  status.textContent = count > 0
    ? `선택한 페이지 ${count}개`
    : '삭제할 페이지를 선택하세요.';

  const actions = document.createElement('div');
  actions.className = 'memo-delete-selection-actions';

  const cancelBtn = document.createElement('button');
  cancelBtn.type = 'button';
  cancelBtn.className = 'btn-secondary memo-delete-selection-cancel';
  cancelBtn.textContent = '선택 취소';
  cancelBtn.disabled = isMemoPageDeleteInProgress;

  const deleteBtn = document.createElement('button');
  deleteBtn.type = 'button';
  deleteBtn.className = 'btn-primary memo-delete-selection-confirm';
  deleteBtn.textContent = '삭제';
  deleteBtn.disabled = count === 0 || isMemoPageDeleteInProgress;

  actions.append(cancelBtn, deleteBtn);
  bar.append(status, actions);
  return bar;
}


function showMemoPageDeleteConfirmDialog(count, onConfirm) {
  if (dom.memoFullscreenBody?.querySelector('.memo-page-delete-dialog')) return;

  const overlay = document.createElement('div');
  overlay.className = 'memo-page-delete-dialog';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-labelledby', 'memo-page-delete-dialog-title');

  const panel = document.createElement('div');
  panel.className = 'memo-page-delete-dialog-panel glass-panel';

  const title = document.createElement('p');
  title.id = 'memo-page-delete-dialog-title';
  title.className = 'memo-page-delete-dialog-message';
  title.textContent = `선택한 페이지 ${count}개를 삭제하시겠습니까?`;

  const subtitle = document.createElement('p');
  subtitle.className = 'memo-page-delete-dialog-submessage';
  subtitle.textContent = '삭제된 페이지는 복구할 수 없습니다.';

  const actions = document.createElement('div');
  actions.className = 'memo-page-delete-dialog-actions';

  const cancelBtn = document.createElement('button');
  cancelBtn.type = 'button';
  cancelBtn.className = 'btn-secondary memo-page-delete-cancel';
  cancelBtn.textContent = '취소';

  const confirmBtn = document.createElement('button');
  confirmBtn.type = 'button';
  confirmBtn.className = 'btn-primary memo-page-delete-confirm';
  confirmBtn.textContent = '삭제';

  actions.append(cancelBtn, confirmBtn);
  panel.append(title, subtitle, actions);
  overlay.appendChild(panel);
  dom.memoFullscreenBody?.appendChild(overlay);

  cancelBtn.addEventListener('click', () => {
    removeMemoPageDeleteConfirmDialog();
  });

  confirmBtn.addEventListener('click', () => {
    if (isMemoPageDeleteInProgress) return;
    removeMemoPageDeleteConfirmDialog();
    onConfirm();
  });
}


function recomputeMemoDiarySummary(memo) {
  if (!memo) return;
  const pages = Array.isArray(memo.pages) ? memo.pages : [];
  if (!pages.length) {
    memo.title = '제목 없음';
    memo.content = '';
    return;
  }

  const firstMainPage = pages.find((page) => !isPageContinuation(page)) ?? pages[0];
  if (firstMainPage && !isPageContinuation(firstMainPage)) {
    memo.title = normalizeTitle(firstMainPage.title);
  } else {
    memo.title = '제목 없음';
  }
  memo.content = sanitizeMemoHtml(firstMainPage?.content ?? '');
}


function clearWidgetPreviewsForDeletedMemo(memoId, deletedPageIds) {
  const deletedSet = deletedPageIds instanceof Set ? deletedPageIds : new Set(deletedPageIds ?? []);
  if (!memoId) return;

  const clearWidget = (widget) => {
    if (widget?.type !== 'memo') return false;
    if (widget.previewMemoId === memoId) {
      widget.previewMemoId = '';
      widget.previewPageId = '';
      return true;
    }
    if (deletedSet.size && deletedSet.has(widget.previewPageId)) {
      widget.previewMemoId = '';
      widget.previewPageId = '';
      return true;
    }
    return false;
  };

  let changed = false;
  state.widgets.forEach((widget) => {
    if (clearWidget(widget)) changed = true;
  });
  state.entries.forEach((entry) => {
    entry.widgets?.forEach((widget) => {
      if (clearWidget(widget)) changed = true;
    });
  });

  if (!changed) return;

  saveEntries();
  state.widgets.forEach((widget) => {
    if (widget.type !== 'memo') return;
    const el = getPlacedWidgetEl(widget.id);
    if (el) renderMemoPreview(el, widget);
  });
}


function collectMemoImageIdsFromMemo(memo) {
  const ids = new Set();
  if (!memo) return ids;
  if (Array.isArray(memo.pages)) {
    memo.pages.forEach((page) => {
      collectMemoImageIdsFromHtml(page.content ?? '').forEach((id) => ids.add(id));
    });
  }
  if (Array.isArray(memo.drafts)) {
    memo.drafts.forEach((draft) => {
      collectMemoImageIdsFromHtml(draft.content ?? '').forEach((id) => ids.add(id));
    });
  }
  return ids;
}


function removeMemoDiaryDeleteConfirmDialog() {
  dom.memoFullscreenBody?.querySelector('.memo-diary-delete-dialog')?.remove();
}


function showMemoDiaryDeleteConfirmDialog(onConfirm) {
  if (dom.memoFullscreenBody?.querySelector('.memo-diary-delete-dialog')) return;
  if (isMemoDiaryDeleteInProgress) return;

  const overlay = document.createElement('div');
  overlay.className = 'memo-diary-delete-dialog';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-labelledby', 'memo-diary-delete-dialog-title');

  const panel = document.createElement('div');
  panel.className = 'memo-diary-delete-dialog-panel glass-panel';

  const title = document.createElement('p');
  title.id = 'memo-diary-delete-dialog-title';
  title.className = 'memo-diary-delete-dialog-message';
  title.textContent = '이 다이어리를 삭제할까요?';

  const subtitle = document.createElement('p');
  subtitle.className = 'memo-diary-delete-dialog-submessage';
  subtitle.textContent =
    '다이어리에 작성된 모든 페이지와 임시저장본이 함께 삭제됩니다. 삭제한 내용은 복구할 수 없습니다.';

  const actions = document.createElement('div');
  actions.className = 'memo-diary-delete-dialog-actions';

  const cancelBtn = document.createElement('button');
  cancelBtn.type = 'button';
  cancelBtn.className = 'btn-secondary memo-diary-delete-cancel';
  cancelBtn.textContent = '취소';

  const confirmBtn = document.createElement('button');
  confirmBtn.type = 'button';
  confirmBtn.className = 'btn-primary memo-diary-delete-confirm';
  confirmBtn.textContent = '삭제';

  actions.append(cancelBtn, confirmBtn);
  panel.append(title, subtitle, actions);
  overlay.appendChild(panel);
  dom.memoFullscreenBody?.appendChild(overlay);

  cancelBtn.addEventListener('click', () => {
    removeMemoDiaryDeleteConfirmDialog();
  });

  confirmBtn.addEventListener('click', () => {
    if (isMemoDiaryDeleteInProgress) return;
    confirmBtn.disabled = true;
    removeMemoDiaryDeleteConfirmDialog();
    onConfirm();
  });
}


async function executeDeleteMemoDiary(w, memoId) {
  if (isMemoDiaryDeleteInProgress) return;

  const memos = getSharedMemos();
  const memoIndex = memos.findIndex((m) => m.id === memoId);
  if (memoIndex < 0) return;

  const memo = memos[memoIndex];
  const deletedPageIds = new Set((memo.pages ?? []).map((page) => page.id));
  const imageIds = collectMemoImageIdsFromMemo(memo);

  isMemoDiaryDeleteInProgress = true;

  try {
    clearWidgetPreviewsForDeletedMemo(memoId, deletedPageIds);

    if (currentDiaryId === memoId) {
      currentDiaryId = null;
      currentPageId = null;
      pageEditorDrafts.delete(w.id);
      pageEditorBaselines.delete(w.id);
      resetEditorSession(w.id);
      resetMemoPhotoSession(w.id);
    }
    if (archiveMemoId === memoId) {
      resetArchiveDetailState();
      if (isArchivePopupOpen) closeArchivePopup();
    }
    const session = getEditorSession(w.id);
    if (session?.memoId === memoId) {
      resetEditorSession(w.id);
    }

    memos.splice(memoIndex, 1);
    saveMemoData();

    await Promise.all(
      [...imageIds].map((imageId) => deleteMemoImageIfUnreferenced(imageId, w))
    );

    refreshMemoPreview(w.id);
    renderMemoFullscreen();
    showToast('다이어리를 삭제했습니다.');
  } catch (error) {
    console.error('[Memo] executeDeleteMemoDiary failed:', error);
    showToast('다이어리 삭제에 실패했습니다.');
  } finally {
    isMemoDiaryDeleteInProgress = false;
  }
}


function clearWidgetPreviewsForDeletedPages(memoId, deletedPageIds) {
  const deletedSet = deletedPageIds instanceof Set ? deletedPageIds : new Set(deletedPageIds);
  if (!memoId || deletedSet.size === 0) return;

  const clearWidget = (widget) => {
    if (widget?.type !== 'memo') return false;
    if (widget.previewMemoId === memoId && deletedSet.has(widget.previewPageId)) {
      widget.previewMemoId = '';
      widget.previewPageId = '';
      return true;
    }
    return false;
  };

  let changed = false;
  state.widgets.forEach((widget) => {
    if (clearWidget(widget)) changed = true;
  });
  state.entries.forEach((entry) => {
    entry.widgets?.forEach((widget) => {
      if (clearWidget(widget)) changed = true;
    });
  });

  if (!changed) return;

  saveEntries();
  state.widgets.forEach((widget) => {
    if (widget.type !== 'memo') return;
    const el = getPlacedWidgetEl(widget.id);
    if (el) renderMemoPreview(el, widget);
  });
}


function resolveCurrentPageIdAfterDeletion(pages, deletedPageIds, previousPageId, previousIndex) {
  if (!Array.isArray(pages) || !pages.length) {
    currentPageId = null;
    return;
  }

  if (previousPageId && pages.some((page) => page.id === previousPageId) && !deletedPageIds.has(previousPageId)) {
    currentPageId = previousPageId;
    return;
  }

  const nextPage = pages[previousIndex] ?? pages[previousIndex - 1] ?? pages[0];
  currentPageId = nextPage?.id ?? null;
}


function executeDeleteSelectedPages(w) {
  if (isMemoPageDeleteInProgress) return;

  const memo = getActiveCreateSetupMemo(w);
  if (!memo || !Array.isArray(memo.pages)) return;

  const idsToDelete = [...selectedDeletePageIds].filter((id) =>
    memo.pages.some((page) => page.id === id)
  );
  if (!idsToDelete.length) return;

  isMemoPageDeleteInProgress = true;
  syncDeleteSelectionUi();

  const deletedSet = new Set(idsToDelete);
  const previousPageId = currentPageId;
  const previousIndex = previousPageId
    ? memo.pages.findIndex((page) => page.id === previousPageId)
    : -1;

  memo.pages = memo.pages.filter((page) => !deletedSet.has(page.id));

  resolveCurrentPageIdAfterDeletion(memo.pages, deletedSet, previousPageId, previousIndex);

  recomputeMemoDiarySummary(memo);
  memo.updatedAt = new Date().toISOString();

  clearWidgetPreviewsForDeletedPages(memo.id, deletedSet);
  saveMemoData();

  resetMemoDeleteSelectionState();
  isMemoPageDeleteInProgress = false;

  refreshMemoPreview(w.id);
  renderMemoFullscreen();
  showToast('선택한 페이지가 삭제되었습니다.');
}


function syncCreateSetupMenuUi() {
  const bookmark = dom.memoFullscreenBody?.querySelector('.memo-create-setup-bookmark-toggle');
  const menu = dom.memoFullscreenBody?.querySelector('.memo-create-setup-menu');
  if (!bookmark || !menu) return;

  bookmark.setAttribute('aria-expanded', isCreateSetupMenuOpen ? 'true' : 'false');
  menu.hidden = !isCreateSetupMenuOpen;
  menu.classList.toggle('memo-create-setup-menu--open', isCreateSetupMenuOpen);
}


function toggleCreateSetupMenu() {
  isCreateSetupMenuOpen = !isCreateSetupMenuOpen;
  syncCreateSetupMenuUi();
}


function closeCreateSetupMenu() {
  if (!isCreateSetupMenuOpen) return;
  isCreateSetupMenuOpen = false;
  syncCreateSetupMenuUi();
}


function getTemplateCarouselPageCount() {
  return Math.max(1, Math.ceil(memoPageTemplates.length / TEMPLATE_CAROUSEL_PAGE_SIZE));
}


function getTemplatesForCarouselPage(pageIndex) {
  const start = pageIndex * TEMPLATE_CAROUSEL_PAGE_SIZE;
  return memoPageTemplates.slice(start, start + TEMPLATE_CAROUSEL_PAGE_SIZE);
}


function getInsertPositionLabel(id) {
  return insertPositionOptions.find((opt) => opt.id === id)?.label ?? id;
}


function getTemplateLabel(id) {
  const normalized = normalizeMemoTemplateId(id);
  return memoPageTemplates.find((t) => t.id === normalized)?.label ?? normalized;
}


function isMemoContentPlainText(content) {
  if (!content || typeof content !== 'string') return true;
  return !/<[a-z][^>]*>/i.test(content);
}


function escapeMemoHtmlText(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}


function plainTextToMemoHtml(text) {
  const normalized = (text ?? '').replace(/\r\n/g, '\n');
  if (!normalized) return '';
  return normalized
    .split('\n')
    .map((line) => {
      if (line === '') return '<br>';
      return `<div>${escapeMemoHtmlText(line)}</div>`;
    })
    .join('');
}


function sanitizeMemoHtml(html) {
  if (html == null || html === '') return '';

  const raw = String(html).trim();
  if (!raw) return '';

  if (isMemoContentPlainText(raw)) {
    return plainTextToMemoHtml(raw);
  }

  const doc = new DOMParser().parseFromString(`<body>${raw}</body>`, 'text/html');
  sanitizeMemoHtmlNode(doc.body);
  return doc.body.innerHTML.trim();
}


function isSafeMemoHtmlUrl(value) {
  if (!value || typeof value !== 'string') return false;
  const trimmed = value.trim();
  if (!trimmed || /[\u0000-\u001F\u007F]/.test(trimmed)) return false;
  const lower = trimmed.toLowerCase();
  if (
    lower.startsWith('javascript:') ||
    lower.startsWith('vbscript:') ||
    lower.startsWith('data:') ||
    lower.startsWith('file:')
  ) {
    return false;
  }
  return /^(https?:|mailto:)/i.test(trimmed) || trimmed.startsWith('/') || trimmed.startsWith('#');
}


function sanitizeMemoHtmlAttributes(el) {
  const tag = el.tagName.toLowerCase();
  const allowed = new Set(MEMO_HTML_GLOBAL_ALLOWED_ATTRS);
  const tagAllowed = MEMO_HTML_TAG_ALLOWED_ATTRS[tag];
  if (tagAllowed) {
    tagAllowed.forEach((name) => allowed.add(name));
  }

  [...el.attributes].forEach((attr) => {
    const name = attr.name.toLowerCase();
    if (name.startsWith('on') || name === 'srcdoc' || name === 'style') {
      el.removeAttribute(attr.name);
      return;
    }
    if (tag === 'img' && name === 'src') {
      el.removeAttribute(attr.name);
      return;
    }
    if (!allowed.has(name)) {
      el.removeAttribute(attr.name);
      return;
    }
    if (name === 'href' && !isSafeMemoHtmlUrl(attr.value)) {
      el.removeAttribute(attr.name);
      return;
    }
    if (name === 'target' && attr.value !== '_blank') {
      el.removeAttribute(attr.name);
      return;
    }
    if (name === 'rel') {
      const safeRel = attr.value
        .split(/\s+/)
        .filter((token) => ['noopener', 'noreferrer', 'nofollow'].includes(token.toLowerCase()));
      if (safeRel.length) el.setAttribute('rel', safeRel.join(' '));
      else el.removeAttribute('rel');
      return;
    }
    if (name === 'class') {
      const safeClass = attr.value
        .split(/\s+/)
        .filter((token) => /^[\w-]+$/.test(token))
        .join(' ');
      if (safeClass) el.setAttribute('class', safeClass);
      else el.removeAttribute('class');
    }
  });

  if (tag === 'a' && el.getAttribute('target') === '_blank') {
    const relTokens = new Set(
      (el.getAttribute('rel') ?? '')
        .split(/\s+/)
        .filter(Boolean)
        .map((token) => token.toLowerCase())
    );
    relTokens.add('noopener');
    relTokens.add('noreferrer');
    el.setAttribute('rel', [...relTokens].join(' '));
  }
}


function sanitizeMemoHtmlNode(root) {
  const removeQueue = [];

  const walk = (node) => {
    [...node.childNodes].forEach((child) => {
      if (child.nodeType === Node.TEXT_NODE) return;

      if (child.nodeType !== Node.ELEMENT_NODE) {
        removeQueue.push(child);
        return;
      }

      const tag = child.tagName.toLowerCase();
      if (tag === 'br') {
        [...child.attributes].forEach((attr) => child.removeAttribute(attr.name));
        return;
      }

      if (!MEMO_HTML_ALLOWED_TAGS.has(tag)) {
        while (child.firstChild) {
          node.insertBefore(child.firstChild, child);
        }
        removeQueue.push(child);
        return;
      }

      sanitizeMemoHtmlAttributes(child);
      walk(child);
    });
  };

  walk(root);
  removeQueue.forEach((node) => node.remove());
}


function renderMemoPageContentHtml(content) {
  if (!content) return '';
  if (isMemoContentPlainText(content)) {
    return sanitizeMemoHtml(plainTextToMemoHtml(content));
  }
  return sanitizeMemoHtml(content);
}


function memoContentToPlainText(content) {
  if (!content) return '';
  if (isMemoContentPlainText(content)) return content;
  const div = document.createElement('div');
  div.innerHTML = sanitizeMemoHtml(content);
  div.querySelectorAll('[data-memo-image-id]').forEach((el) => el.remove());
  return div.textContent ?? '';
}


function collectAllMemoImageHtmlSources(w) {
  const sources = [];
  getSharedMemos().forEach((memo) => {
    if (Array.isArray(memo.pages)) {
      memo.pages.forEach((page) => sources.push(page.content ?? ''));
    }
    if (Array.isArray(memo.drafts)) {
      memo.drafts.forEach((draft) => sources.push(draft.content ?? ''));
    }
  });
  if (w) {
    getEditorSessionSheets(w.id).forEach((sheet) => {
      if (sheet?.content) sources.push(sheet.content);
    });
    const draft = pageEditorDrafts.get(w.id);
    if (draft?.content && !getEditorSession(w.id)) {
      sources.push(draft.content);
    }
  }
  return sources;
}


function isMemoImageIdReferenced(imageId, w) {
  if (!imageId) return false;
  return collectAllMemoImageHtmlSources(w).some((html) =>
    collectMemoImageIdsFromHtml(html).has(imageId)
  );
}


async function deleteMemoImageIfUnreferenced(imageId, w) {
  if (!imageId || isMemoImageIdReferenced(imageId, w)) return;
  try {
    await deleteMemoImageBlob(imageId);
  } catch (error) {
    console.warn('[Memo] deleteMemoImageIfUnreferenced failed:', imageId, error);
  }
}


function setRichEditorContent(el, content) {
  if (!el) return;
  if (!content) {
    el.innerHTML = '';
    return;
  }
  el.innerHTML = renderMemoPageContentHtml(content);
  setupMemoEditorImages(el).catch((error) => {
    console.warn('[Memo] setupMemoEditorImages failed:', error);
  });
}


function getRichEditorContentHtml(el) {
  if (!el) return '';
  const html = el.classList.contains('memo-rich-editor')
    ? serializeMemoEditorHtml(el, sanitizeMemoHtml)
    : sanitizeMemoHtml(el.innerHTML);
  if (!memoHtmlHasVisibleContent(html)) return '';
  return html;
}


function renderMemoPageContentIntoElement(el, content) {
  if (!el) return;
  el.replaceChildren();
  const html = renderMemoPageContentHtml(content);
  if (html) el.innerHTML = html;
  applyMemoImageLayoutHints(el);
  setupMemoReadModeImages(el).catch((error) => {
    console.warn('[Memo] setupMemoReadModeImages failed:', error);
  });
}


function openTemplatePopup() {
  isTemplatePopupOpen = true;
  selectedInsertPosition = 'after-current';
  selectedTemplateId = MEMO_BASIC_TEMPLATE_ID;
  templateCarouselIndex = 0;
  syncTemplatePopupUi();
}


function closeTemplatePopup() {
  if (!isTemplatePopupOpen) return;
  isTemplatePopupOpen = false;
  syncTemplatePopupUi();
}


function shiftTemplateCarousel(delta) {
  const pageCount = getTemplateCarouselPageCount();
  templateCarouselIndex = (templateCarouselIndex + delta + pageCount) % pageCount;
  syncTemplatePopupUi();
}


function confirmTemplatePopupSelection() {
  const w = getActiveMemoWidget();
  if (!w || !selectedTemplateId) return;

  if (selectedTemplateId !== MEMO_BASIC_TEMPLATE_ID) {
    showToast('아직 준비 중인 속지입니다.');
    return;
  }

  const payload = {
    insertPosition: selectedInsertPosition,
    selectedTemplateId: MEMO_BASIC_TEMPLATE_ID,
  };

  createSetupSheetDrafts.set(w.id, payload);
  closeTemplatePopup();
  openTextPageEditorNew(w, payload);
}


function appendTemplatePreview(previewEl, layout) {
  previewEl.className = `memo-template-card-preview memo-template-preview--${layout}`;

  const addPhoto = (className = '') => {
    const photo = document.createElement('div');
    photo.className = `memo-template-preview-photo ${className}`.trim();
    photo.textContent = 'Photo';
    previewEl.appendChild(photo);
  };

  const addTitleLine = () => {
    const line = document.createElement('div');
    line.className = 'memo-template-preview-title-line';
    previewEl.appendChild(line);
  };

  const addBodyLines = (count = 3) => {
    for (let i = 0; i < count; i += 1) {
      const line = document.createElement('div');
      line.className = 'memo-template-preview-body-line';
      previewEl.appendChild(line);
    }
  };

  previewEl.replaceChildren();

  switch (layout) {
    case 'photo-only':
      addPhoto('memo-template-preview-photo--large');
      break;
    case 'basic':
      addTitleLine();
      addBodyLines(5);
      break;
    case 'photo-text':
      addPhoto();
      addTitleLine();
      addBodyLines(3);
      break;
    case 'two-photo-text':
      addPhoto('memo-template-preview-photo--small');
      addPhoto('memo-template-preview-photo--small');
      addTitleLine();
      addBodyLines(2);
      break;
    case 'scrapbook':
      addPhoto('memo-template-preview-photo--tiny');
      addTitleLine();
      addBodyLines(2);
      addPhoto('memo-template-preview-photo--tiny');
      break;
    case 'large-photo-caption':
      addPhoto('memo-template-preview-photo--large');
      addBodyLines(2);
      break;
    default:
      addBodyLines(2);
  }
}


function syncTemplatePopupUi() {
  const popup = dom.memoFullscreenBody?.querySelector('.memo-template-popup');
  if (!popup) return;

  popup.hidden = !isTemplatePopupOpen;
  popup.classList.toggle('memo-template-popup--open', isTemplatePopupOpen);
  popup.classList.toggle('memo-template-popup--single', memoPageTemplates.length <= 1);
  popup.setAttribute('aria-hidden', isTemplatePopupOpen ? 'false' : 'true');

  insertPositionOptions.forEach((opt) => {
    const btn = popup.querySelector(`.memo-template-insert-option[data-insert-position="${opt.id}"]`);
    if (!btn) return;
    const selected = selectedInsertPosition === opt.id;
    btn.classList.toggle('memo-template-insert-option--selected', selected);
    btn.setAttribute('aria-pressed', selected ? 'true' : 'false');
  });

  const grid = popup.querySelector('.memo-template-carousel-grid');
  if (grid) {
    grid.replaceChildren();
    getTemplatesForCarouselPage(templateCarouselIndex).forEach((template) => {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'memo-template-card';
      card.dataset.templateId = template.id;
      if (selectedTemplateId === template.id) {
        card.classList.add('memo-template-card--selected');
      }

      const preview = document.createElement('div');
      appendTemplatePreview(preview, template.layout);

      const label = document.createElement('span');
      label.className = 'memo-template-card-label';
      label.textContent = template.label;

      const check = document.createElement('span');
      check.className = 'memo-template-card-check';
      check.textContent = '✓';
      check.setAttribute('aria-hidden', 'true');

      card.append(preview, label, check);
      grid.appendChild(card);
    });
  }

  const addBtn = popup.querySelector('.memo-template-popup-add');
  if (addBtn) {
    addBtn.disabled = !selectedInsertPosition;
  }

  const carouselNav = popup.querySelector('.memo-template-carousel-nav');
  if (carouselNav) {
    carouselNav.hidden = memoPageTemplates.length <= 1;
  }
}


function buildTemplatePopupElement() {
  const popup = document.createElement('div');
  popup.className = 'memo-template-popup';
  popup.hidden = true;
  popup.setAttribute('role', 'dialog');
  popup.setAttribute('aria-modal', 'true');
  popup.setAttribute('aria-labelledby', 'memo-template-popup-title');
  popup.setAttribute('aria-hidden', 'true');

  const backdrop = document.createElement('button');
  backdrop.type = 'button';
  backdrop.className = 'memo-template-popup-backdrop';
  backdrop.setAttribute('aria-label', '속지 선택 닫기');

  const dialog = document.createElement('div');
  dialog.className = 'memo-template-popup-dialog glass-panel';

  const header = document.createElement('div');
  header.className = 'memo-template-popup-header';

  const title = document.createElement('h3');
  title.id = 'memo-template-popup-title';
  title.className = 'memo-template-popup-title';
  title.textContent = '속지 선택';

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'memo-template-popup-close';
  closeBtn.textContent = '✕';
  closeBtn.setAttribute('aria-label', '닫기');

  header.append(title, closeBtn);

  const insertRow = document.createElement('div');
  insertRow.className = 'memo-template-insert-row';
  insertRow.setAttribute('role', 'group');
  insertRow.setAttribute('aria-label', '삽입 위치');

  insertPositionOptions.forEach((opt) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'memo-template-insert-option';
    btn.dataset.insertPosition = opt.id;
    btn.textContent = opt.label;
    btn.setAttribute('aria-pressed', opt.id === selectedInsertPosition ? 'true' : 'false');
    insertRow.appendChild(btn);
  });

  const carousel = document.createElement('div');
  carousel.className = 'memo-template-carousel memo-template-carousel--single';

  const grid = document.createElement('div');
  grid.className = 'memo-template-carousel-grid memo-template-carousel-grid--single';
  carousel.appendChild(grid);

  const carouselNav = document.createElement('div');
  carouselNav.className = 'memo-template-carousel-nav';
  carouselNav.hidden = true;

  const prevBtn = document.createElement('button');
  prevBtn.type = 'button';
  prevBtn.className = 'memo-template-carousel-prev';
  prevBtn.textContent = '‹';
  prevBtn.setAttribute('aria-label', '이전 템플릿');

  const nextBtn = document.createElement('button');
  nextBtn.type = 'button';
  nextBtn.className = 'memo-template-carousel-next';
  nextBtn.textContent = '›';
  nextBtn.setAttribute('aria-label', '다음 템플릿');

  carouselNav.append(prevBtn, nextBtn);

  const addBtn = document.createElement('button');
  addBtn.type = 'button';
  addBtn.className = 'btn-primary memo-template-popup-add';
  addBtn.textContent = '추가';
  addBtn.disabled = true;

  dialog.append(header, insertRow, carousel, carouselNav, addBtn);
  popup.append(backdrop, dialog);
  return popup;
}


function getLocalDateInputValue(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}


function normalizeMemoCategoryId(categoryId) {
  if (!categoryId) return '';
  return getMemoCategories().some((category) => category.id === categoryId) ? categoryId : '';
}


function getMemoDiaryCategoryLabel(categoryId) {
  const normalized = normalizeMemoCategoryId(categoryId);
  if (!normalized) return '카테고리 없음';
  return getMemoCategories().find((category) => category.id === normalized)?.name ?? '카테고리 없음';
}


function getPageEditorMemoCategoryId(w, draft) {
  const memo = getActiveCreateSetupMemo(w);
  if (memo) return normalizeMemoCategoryId(memo.category);
  return normalizeMemoCategoryId(draft?.memoCategoryId ?? '');
}


function buildPageEditorCategoryMenu(w, draft) {
  const menu = document.createElement('div');
  menu.className = 'memo-editor-category-menu';
  menu.hidden = !isPageEditorCategoryMenuOpen;
  menu.setAttribute('role', 'menu');
  menu.setAttribute('aria-label', '다이어리 카테고리 선택');

  const selectedId = getPageEditorMemoCategoryId(w, draft);

  const noneOption = document.createElement('button');
  noneOption.type = 'button';
  noneOption.className = 'memo-editor-category-option';
  noneOption.dataset.categoryId = '';
  noneOption.setAttribute('role', 'menuitemradio');
  const noneSelected = !selectedId;
  noneOption.setAttribute('aria-checked', noneSelected ? 'true' : 'false');
  if (noneSelected) noneOption.classList.add('memo-editor-category-option--selected');

  const noneLabel = document.createElement('span');
  noneLabel.className = 'memo-editor-category-name';
  noneLabel.textContent = '카테고리 없음';

  const noneCheck = document.createElement('span');
  noneCheck.className = 'memo-editor-category-check';
  noneCheck.textContent = '✓';
  noneCheck.setAttribute('aria-hidden', 'true');

  noneOption.append(noneLabel, noneCheck);
  menu.appendChild(noneOption);

  getMemoCategories().forEach((category) => {
    const optionBtn = document.createElement('button');
    optionBtn.type = 'button';
    optionBtn.className = 'memo-editor-category-option';
    optionBtn.dataset.categoryId = category.id;
    optionBtn.setAttribute('role', 'menuitemradio');
    const selected = selectedId === category.id;
    optionBtn.setAttribute('aria-checked', selected ? 'true' : 'false');
    if (selected) optionBtn.classList.add('memo-editor-category-option--selected');

    const label = document.createElement('span');
    label.className = 'memo-editor-category-name';
    label.textContent = category.name;

    const check = document.createElement('span');
    check.className = 'memo-editor-category-check';
    check.textContent = '✓';
    check.setAttribute('aria-hidden', 'true');

    optionBtn.append(label, check);
    menu.appendChild(optionBtn);
  });

  return menu;
}


function syncPageEditorCategoryUi(w) {
  const draft = pageEditorDrafts.get(w.id);
  if (!draft) return;

  const root = dom.memoFullscreenBody;
  if (!root) return;

  const categoryId = getPageEditorMemoCategoryId(w, draft);
  const label = getMemoDiaryCategoryLabel(categoryId);

  const btn = root.querySelector('.memo-editor-category-button');
  if (btn) btn.textContent = label;

  const menu = root.querySelector('.memo-editor-category-menu');
  if (menu) {
    menu.hidden = !isPageEditorCategoryMenuOpen;
    menu.querySelectorAll('.memo-editor-category-option').forEach((option) => {
      const selected = (option.dataset.categoryId || '') === (categoryId || '');
      option.classList.toggle('memo-editor-category-option--selected', selected);
      option.setAttribute('aria-checked', selected ? 'true' : 'false');
    });
  }

  const toggle = root.querySelector('.memo-editor-category-button');
  if (toggle) {
    toggle.setAttribute('aria-expanded', isPageEditorCategoryMenuOpen ? 'true' : 'false');
  }
}


function applyPageEditorMemoCategory(w, categoryId) {
  const draft = pageEditorDrafts.get(w.id);
  if (!draft) return;

  const normalized = normalizeMemoCategoryId(categoryId);
  draft.memoCategoryId = normalized;
  pageEditorDrafts.set(w.id, draft);

  const memo = getActiveCreateSetupMemo(w);
  if (memo && memo.category !== normalized) {
    memo.category = normalized;
    saveMemoData();
    refreshMemoPreview(w.id);
  }

  isPageEditorCategoryMenuOpen = false;
  syncPageEditorCategoryUi(w);
}


function getMemoProfile() {
  return ensureMemoProfile();
}


function computeBinderSpread(pages, pageId) {
  if (!pages?.length) {
    return {
      leftPage: null,
      rightPage: null,
      spreadIndex: 0,
      spreadCount: 0,
      leftPageNumber: null,
      rightPageNumber: null,
    };
  }

  let idx = pageId ? pages.findIndex((p) => p.id === pageId) : 0;
  if (idx < 0) idx = 0;

  let spreadIndex = 0;
  let leftPage = null;
  let rightPage = null;

  if (idx === 0) {
    spreadIndex = 0;
    rightPage = pages[0];
  } else {
    spreadIndex = Math.floor((idx - 1) / 2) + 1;
    leftPage = pages[spreadIndex * 2 - 1] ?? null;
    rightPage = pages[spreadIndex * 2] ?? null;
  }

  const spreadCount = pages.length <= 1 ? 1 : 1 + Math.ceil((pages.length - 1) / 2);

  const pageNumber = (page) => {
    if (!page) return null;
    const i = pages.findIndex((p) => p.id === page.id);
    return i >= 0 ? i + 1 : null;
  };

  return {
    leftPage,
    rightPage,
    spreadIndex,
    spreadCount,
    leftPageNumber: pageNumber(leftPage),
    rightPageNumber: pageNumber(rightPage),
  };
}


function getTargetPageIdForSpread(pages, targetSpreadIndex) {
  if (!pages.length) return null;
  if (targetSpreadIndex <= 0) return pages[0].id;
  const leftIdx = targetSpreadIndex * 2 - 1;
  return pages[leftIdx]?.id ?? pages[0].id;
}


function prefersReducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}


function setBinderNavDisabled(root, disabled) {
  const nav =
    root?.closest('.memo-binder-stage')?.querySelector('.memo-binder-nav')
    ?? root?.closest('.memo-create-setup-stage')?.querySelector('.memo-binder-nav');
  if (!nav) return;
  nav.querySelectorAll('.memo-binder-nav-prev, .memo-binder-nav-next').forEach((btn) => {
    btn.disabled = disabled;
  });
}


function resolveCurrentPageIdForDiary(memo) {
  if (!memo?.pages?.length) {
    currentPageId = null;
    return;
  }
  if (currentPageId && memo.pages.some((p) => p.id === currentPageId)) {
    return;
  }
  currentPageId = memo.pages[0].id;
}


function openMemoBinderForDiary(w, diaryId) {
  ensureMemoWidgetData(w);
  const memo = findSharedMemoById(diaryId);
  if (!memo) return;

  resetMemoDeleteSelectionState();
  currentDiaryId = diaryId;
  resolveCurrentPageIdForDiary(memo);
  fabExpanded = false;
  isCreateSetupMenuOpen = false;
  resetTemplatePopupSessionState();
  pageEditorDrafts.delete(w.id);
  pageEditorBaselines.delete(w.id);
  fullscreenViewMode = 'createSetup';
  renderMemoFullscreen();
}


function buildBinderPageNav(memo) {
  const nav = document.createElement('div');
  nav.className = 'memo-binder-nav memo-page-controls';

  const prevBtn = document.createElement('button');
  prevBtn.type = 'button';
  prevBtn.className = 'memo-binder-nav-prev';
  prevBtn.textContent = '<';
  prevBtn.setAttribute('aria-label', '이전 펼침');

  const indicator = document.createElement('span');
  indicator.className = 'memo-binder-nav-indicator';

  const nextBtn = document.createElement('button');
  nextBtn.type = 'button';
  nextBtn.className = 'memo-binder-nav-next';
  nextBtn.textContent = '>';
  nextBtn.setAttribute('aria-label', '다음 펼침');

  nav.append(prevBtn, indicator, nextBtn);
  updateBinderPageNavState(nav, memo);
  return nav;
}


function updateBinderPageNavState(navEl, memo) {
  if (!navEl) return;

  const pages = memo?.pages ?? [];
  if (!pages.length) {
    navEl.hidden = true;
    return;
  }

  navEl.hidden = false;

  const spread = computeBinderSpread(pages, currentPageId);
  const indicator = navEl.querySelector('.memo-binder-nav-indicator');
  const prevBtn = navEl.querySelector('.memo-binder-nav-prev');
  const nextBtn = navEl.querySelector('.memo-binder-nav-next');

  if (indicator) {
    const { leftPageNumber, rightPageNumber } = spread;
    if (leftPageNumber && rightPageNumber) {
      indicator.textContent = `${leftPageNumber}–${rightPageNumber} / ${pages.length}`;
    } else if (rightPageNumber) {
      indicator.textContent = `${rightPageNumber} / ${pages.length}`;
    } else if (leftPageNumber) {
      indicator.textContent = `${leftPageNumber} / ${pages.length}`;
    } else {
      indicator.textContent = `— / ${pages.length}`;
    }
  }

  const atFirstSpread = spread.spreadIndex <= 0;
  const atLastSpread = spread.spreadIndex >= spread.spreadCount - 1;

  if (prevBtn) prevBtn.disabled = atFirstSpread;
  if (nextBtn) nextBtn.disabled = atLastSpread;
}


function buildBinderSheetElement(page, memo, options = {}) {
  if (!page || !memo) return null;

  const {
    side = 'left',
    showEdit = true,
    pickerMode = false,
    selectedPageId = null,
    showPageNumber = true,
    deleteSelectionMode = false,
    selectedDeletePageIds: selectedDeleteIds = null,
    thumbnailMode = false,
  } = options;

  const sheet = document.createElement('article');
  sheet.className = 'memo-binder-sheet';
  if (thumbnailMode) {
    sheet.classList.add('memo-binder-sheet--thumbnail');
  }
  if (!showPageNumber) {
    sheet.classList.add('memo-binder-sheet--no-page-number');
  }
  sheet.dataset.pageId = page.id;
  sheet.dataset.side = side;

  const isContinuation = isPageContinuation(page);
  if (isContinuation) {
    sheet.classList.add('memo-binder-sheet--continuation');
  }

  if (pickerMode) {
    const isSelected = selectedPageId === page.id;
    sheet.classList.toggle('memo-binder-sheet--pick-selected', isSelected);
    const pickBtn = document.createElement('button');
    pickBtn.type = 'button';
    pickBtn.className = 'memo-binder-page-pick';
    pickBtn.dataset.pageId = page.id;
    pickBtn.setAttribute('aria-label', '미리보기 페이지 선택');
    pickBtn.setAttribute('aria-pressed', isSelected ? 'true' : 'false');
    pickBtn.textContent = isSelected ? '☑' : '○';
    sheet.appendChild(pickBtn);
  } else if (deleteSelectionMode) {
    const isSelected = selectedDeleteIds?.has(page.id);
    sheet.classList.toggle('memo-binder-sheet--delete-selected', Boolean(isSelected));
    const deletePickBtn = document.createElement('button');
    deletePickBtn.type = 'button';
    deletePickBtn.className = 'memo-binder-page-delete-pick';
    deletePickBtn.dataset.pageId = page.id;
    deletePickBtn.setAttribute('aria-label', '삭제할 페이지 선택');
    deletePickBtn.setAttribute('aria-pressed', isSelected ? 'true' : 'false');
    deletePickBtn.textContent = isSelected ? '☑' : '○';
    sheet.appendChild(deletePickBtn);
  }

  const header = document.createElement('header');
  header.className = 'memo-binder-sheet-header sheet-header';

  let editBtn = null;
  if (showEdit && !pickerMode && !deleteSelectionMode) {
    editBtn = document.createElement('button');
    editBtn.type = 'button';
    editBtn.className = 'memo-binder-page-edit';
    editBtn.textContent = '편집';
  }

  if (isContinuation) {
    if (editBtn) header.appendChild(editBtn);

    const contentEl = document.createElement('div');
    contentEl.className =
      'memo-binder-sheet-content sheet-content memo-sheet-read-content memo-binder-sheet-content--continuation';
    renderMemoPageContentIntoElement(contentEl, page.content);

    if (showPageNumber) {
      const pageIndex = memo.pages.findIndex((p) => p.id === page.id);
      const pageNumEl = document.createElement('p');
      pageNumEl.className = 'memo-binder-sheet-page-number sheet-page-number';
      pageNumEl.textContent = pageIndex >= 0 ? `${pageIndex + 1}` : '';
      sheet.append(header, contentEl, pageNumEl);
    } else {
      sheet.append(header, contentEl);
    }
    return sheet;
  }

  const dateEl = document.createElement('p');
  dateEl.className = 'memo-binder-sheet-date sheet-date';
  dateEl.textContent = formatPageDateDisplay(page.date);
  if (editBtn) {
    header.append(dateEl, editBtn);
  } else {
    header.appendChild(dateEl);
  }

  const titleEl = document.createElement('h3');
  titleEl.className = 'memo-binder-sheet-title sheet-title';
  titleEl.textContent = page.title || '제목 없음';

  const divider = document.createElement('hr');
  divider.className = 'memo-binder-sheet-divider sheet-divider';
  divider.setAttribute('aria-hidden', 'true');

  const contentEl = document.createElement('div');
  contentEl.className = 'memo-binder-sheet-content sheet-content memo-sheet-read-content';
  renderMemoPageContentIntoElement(contentEl, page.content);

  if (showPageNumber) {
    const pageIndex = memo.pages.findIndex((p) => p.id === page.id);
    const pageNumEl = document.createElement('p');
    pageNumEl.className = 'memo-binder-sheet-page-number sheet-page-number';
    pageNumEl.textContent = pageIndex >= 0 ? `${pageIndex + 1}` : '';
    sheet.append(header, titleEl, divider, contentEl, pageNumEl);
  } else {
    sheet.append(header, titleEl, divider, contentEl);
  }
  return sheet;
}


function getMemoWidgetPreviewSizeClass(w) {
  const cols = w?.cols ?? 3;
  const rows = w?.rows ?? 4;
  if (cols === 2 && rows === 3) return 'memo-widget-preview--small';
  if (cols === 3 && rows === 4) return 'memo-widget-preview--medium';
  if (cols === 4 && rows === 5) return 'memo-widget-preview--large';
  const area = cols * rows;
  if (area <= 6) return 'memo-widget-preview--small';
  if (area <= 12) return 'memo-widget-preview--medium';
  return 'memo-widget-preview--large';
}


function buildMemoWidgetPreviewElement(page, memo, w) {
  if (!page || !memo) return null;

  const root = document.createElement('div');
  root.className = `memo-preview-content-area ${getMemoWidgetPreviewSizeClass(w)}`;

  const isContinuation = isPageContinuation(page);
  if (isContinuation) {
    root.classList.add('memo-widget-preview--continuation');
    const contentEl = document.createElement('div');
    contentEl.className = 'memo-widget-preview-content memo-sheet-read-content';
    renderMemoPageContentIntoElement(contentEl, page.content);
    root.appendChild(contentEl);
    return root;
  }

  const dateEl = document.createElement('p');
  dateEl.className = 'memo-widget-preview-date';
  dateEl.textContent = formatPageDateDisplay(page.date);

  const titleEl = document.createElement('h3');
  titleEl.className = 'memo-widget-preview-title';
  titleEl.textContent = page.title || '제목 없음';

  const divider = document.createElement('hr');
  divider.className = 'memo-widget-preview-divider';
  divider.setAttribute('aria-hidden', 'true');

  const contentEl = document.createElement('div');
  contentEl.className = 'memo-widget-preview-content memo-sheet-read-content';
  renderMemoPageContentIntoElement(contentEl, page.content);

  root.append(dateEl, titleEl, divider, contentEl);
  return root;
}


function renderBinderSheetSlot(slotEl, page, memo, options = {}) {
  if (!slotEl) return;
  slotEl.replaceChildren();

  const {
    side = 'left',
    emptyMessage = null,
    showBlankSheet = false,
    pickerMode = false,
    selectedPageId = null,
    deleteSelectionMode = false,
    selectedDeletePageIds: selectedDeleteIds = null,
  } = options;

  if (!page) {
    if (emptyMessage) {
      const sheet = document.createElement('article');
      sheet.className = 'memo-binder-sheet memo-binder-sheet--empty';
      sheet.dataset.side = side;

      const header = document.createElement('header');
      header.className = 'memo-binder-sheet-header sheet-header';
      const dateEl = document.createElement('p');
      dateEl.className = 'memo-binder-sheet-date sheet-date';
      dateEl.textContent = '\u00a0';
      header.appendChild(dateEl);

      const titleEl = document.createElement('h3');
      titleEl.className = 'memo-binder-sheet-title sheet-title';
      titleEl.textContent = '\u00a0';

      const divider = document.createElement('hr');
      divider.className = 'memo-binder-sheet-divider sheet-divider';
      divider.setAttribute('aria-hidden', 'true');

      const contentEl = document.createElement('div');
      contentEl.className = 'memo-binder-sheet-content sheet-content';
      const msg = document.createElement('p');
      msg.className = 'memo-binder-sheet-empty-msg';
      msg.textContent = emptyMessage;
      contentEl.appendChild(msg);

      const pageNumEl = document.createElement('p');
      pageNumEl.className = 'memo-binder-sheet-page-number sheet-page-number';
      pageNumEl.textContent = '\u00a0';

      sheet.append(header, titleEl, divider, contentEl, pageNumEl);
      slotEl.appendChild(sheet);
    } else if (showBlankSheet) {
      const sheet = document.createElement('article');
      sheet.className = 'memo-binder-sheet memo-binder-sheet--blank';
      sheet.dataset.side = side;
      sheet.setAttribute('aria-hidden', 'true');
      slotEl.appendChild(sheet);
    }
    return;
  }

  const sheet = buildBinderSheetElement(page, memo, {
    side,
    showEdit: !pickerMode && !deleteSelectionMode,
    pickerMode,
    selectedPageId,
    deleteSelectionMode,
    selectedDeletePageIds: selectedDeleteIds,
  });
  if (sheet) slotEl.appendChild(sheet);
}


function syncPreviewPickerUi() {
  const addBtn = dom.memoFullscreenBody?.querySelector('.memo-preview-picker-add');
  if (addBtn) {
    addBtn.disabled = !previewPickerSelectedPageId;
  }
}


function refreshBinderSpreadView(w) {
  const book = dom.memoFullscreenBody?.querySelector('.memo-binder-book');
  if (!book) {
    renderMemoFullscreen();
    return;
  }

  const memo = getActiveCreateSetupMemo(w);
  if (memo) resolveCurrentPageIdForDiary(memo);
  const pages = memo?.pages ?? [];
  const spread = computeBinderSpread(pages, currentPageId);

  const leftSlot = book.querySelector('.memo-binder-sheet-slot--left');
  const rightSlot = book.querySelector('.memo-binder-sheet-slot--right');
  const pickerMode = Boolean(previewPickerTargetWidgetId);
  const deleteSelectionMode = isMemoDeleteSelectionMode && !pickerMode;
  const sheetOptions = {
    pickerMode,
    selectedPageId: previewPickerSelectedPageId,
    deleteSelectionMode,
    selectedDeletePageIds: selectedDeletePageIds,
  };

  renderBinderSheetSlot(leftSlot, spread.leftPage, memo, { side: 'left', ...sheetOptions });
  renderBinderSheetSlot(rightSlot, spread.rightPage, memo, {
    side: 'right',
    emptyMessage: !pages.length ? '아직 추가된 페이지가 없습니다.' : null,
    showBlankSheet: pages.length > 0 && spread.leftPage && !spread.rightPage,
    ...sheetOptions,
  });

  const stage = book.closest('.memo-create-setup-stage');
  const nav = stage?.querySelector('.memo-binder-nav');
  updateBinderPageNavState(nav, memo);
  syncPreviewPickerUi();
  syncDeleteSelectionUi();
}


function navigateBinderSpread(w, direction) {
  if (isPageTurning) return;

  const memo = getActiveCreateSetupMemo(w);
  const pages = memo?.pages ?? [];
  if (!pages.length || !currentPageId) return;

  const spread = computeBinderSpread(pages, currentPageId);
  const targetSpread = spread.spreadIndex + direction;
  if (targetSpread < 0 || targetSpread >= spread.spreadCount) return;

  const newPageId = getTargetPageIdForSpread(pages, targetSpread);
  if (!newPageId) return;

  const book = dom.memoFullscreenBody?.querySelector('.memo-binder-book');
  if (!book || prefersReducedMotion()) {
    currentPageId = newPageId;
    refreshBinderSpreadView(w);
    return;
  }

  isPageTurning = true;
  setBinderNavDisabled(book, true);

  let animSheet;
  let animClass;
  if (direction > 0) {
    animSheet = book.querySelector(
      '.memo-binder-sheet-slot--right .memo-binder-sheet:not(.memo-binder-sheet--blank):not(.memo-binder-sheet--empty)'
    );
    animClass = 'memo-binder-sheet--turn-next';
  } else {
    animSheet = book.querySelector(
      '.memo-binder-sheet-slot--left .memo-binder-sheet:not(.memo-binder-sheet--blank):not(.memo-binder-sheet--empty)'
    );
    if (animSheet) {
      animClass = 'memo-binder-sheet--turn-prev';
    } else {
      animSheet = book.querySelector(
        '.memo-binder-sheet-slot--right .memo-binder-sheet:not(.memo-binder-sheet--blank):not(.memo-binder-sheet--empty)'
      );
      animClass = 'memo-binder-sheet--turn-prev-out';
    }
  }

  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    if (animSheet) animSheet.classList.remove(animClass);
    currentPageId = newPageId;
    isPageTurning = false;
    setBinderNavDisabled(book, false);
    refreshBinderSpreadView(w);
  };

  if (!animSheet) {
    finish();
    return;
  }

  const onEnd = (e) => {
    if (e.target !== animSheet) return;
    animSheet.removeEventListener('animationend', onEnd);
    finish();
  };

  animSheet.addEventListener('animationend', onEnd);
  animSheet.classList.add(animClass);
  window.setTimeout(finish, 520);
}


function formatPageDateDisplay(dateStr) {
  if (!dateStr) return '';
  const d = new Date(`${dateStr}T12:00:00`);
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' });
}


function refreshPageEditorContentBaseline(w) {
  pageEditorBaselineRefreshers.get(w.id)?.();
}


function registerPageEditorBaselineRefresher(w, refresher) {
  if (refresher) pageEditorBaselineRefreshers.set(w.id, refresher);
  else pageEditorBaselineRefreshers.delete(w.id);
}


async function splitCurrentEditorToNextSheet(w, contentEditor) {
  syncPageEditorDraftFromForm(w);
  const html = getRichEditorContentHtml(contentEditor);
  const { fitHtml, overflowHtml } = splitHtmlAtSheetLimit(contentEditor, html);

  contentEditor.innerHTML = renderMemoPageContentHtml(fitHtml);
  await setupMemoEditorImages(contentEditor);

  const draft = pageEditorDrafts.get(w.id);
  if (draft) {
    draft.content = getRichEditorContentHtml(contentEditor);
    pageEditorDrafts.set(w.id, draft);
    ensurePageEditorSession(w, draft);
    syncCurrentDraftIntoSession(w.id, draft, clonePageDraft);
  }

  beginContinuationSheetWithContent(w, {
    syncPageEditorDraftFromForm: (widget) => syncPageEditorDraftFromForm(widget),
    pageEditorDrafts,
    pageEditorBaselines,
    clonePageDraft,
    getPageEditorMemoCategoryId,
    MEMO_BASIC_TEMPLATE_ID,
  }, overflowHtml);
  renderMemoFullscreen();
}


async function ensureEditorSheetsFitBeforeSave(w) {
  syncPageEditorDraftFromForm(w);
  ensurePageEditorSession(w, pageEditorDrafts.get(w.id));

  const session = getEditorSession(w.id);
  const sheetCount = session?.sheets.length ?? 1;

  // overflow로 이미 분리된 다중 속지 세션은 저장 시 재검사하지 않음
  if (sheetCount > 1) {
    return true;
  }

  const contentEditor = dom.memoFullscreenBody?.querySelector('.memo-text-page-content');
  if (!contentEditor) return true;

  const html = getRichEditorContentHtml(contentEditor);
  if (doesHtmlFitEditorSheet(contentEditor, html)) return true;

  const confirmed = await showTextSheetOverflowDialog(
    dom.memoFullscreenBody,
    async () => {
      if (getIsCreatingOverflowSheet()) return;
      setIsCreatingOverflowSheet(true);
      try {
        await splitCurrentEditorToNextSheet(w, contentEditor);
      } finally {
        setIsCreatingOverflowSheet(false);
      }
    },
    () => {}
  );

  if (!confirmed) return false;
  return ensureEditorSheetsFitBeforeSave(w);
}


function isMultiSheetEditorSession(w) {
  const session = getEditorSession(w.id);
  return (session?.sheets.length ?? 0) > 1;
}


function syncSessionBeforePersist(w) {
  syncPageEditorDraftFromForm(w);
  ensurePageEditorSession(w, pageEditorDrafts.get(w.id));
  syncCurrentDraftIntoSession(w.id, pageEditorDrafts.get(w.id), clonePageDraft);
}


function getSessionSheetsForPersist(w) {
  syncSessionBeforePersist(w);

  const session = getEditorSession(w.id);
  if (session?.sheets.length) {
    return filterSavableSessionSheets(session.sheets, memoHtmlHasVisibleContent);
  }

  const legacyQueue = getPageEditorSheetQueue(w.id);
  const current = pageEditorDrafts.get(w.id);
  if (legacyQueue.length && current) {
    migrateLegacyQueueToSession(w.id, current, legacyQueue, clonePageDraft);
    return filterSavableSessionSheets(getEditorSessionSheets(w.id), memoHtmlHasVisibleContent);
  }

  if (current) {
    return filterSavableSessionSheets([clonePageDraft(current)], memoHtmlHasVisibleContent);
  }
  return [];
}


function validateSessionSheetsIntegrity(sheets) {
  const editorSheetIds = new Set();
  const pageIds = new Set();

  for (let i = 0; i < sheets.length; i += 1) {
    const sheet = sheets[i];

    if (sheet.editorSheetId) {
      if (editorSheetIds.has(sheet.editorSheetId)) {
        console.warn('[Memo] duplicate editorSheetId in session:', sheet.editorSheetId);
        return { ok: false, index: i, reason: 'duplicate-editorSheetId' };
      }
      editorSheetIds.add(sheet.editorSheetId);
    }

    if (sheet.pageId) {
      if (pageIds.has(sheet.pageId)) {
        console.warn('[Memo] duplicate pageId in session:', sheet.pageId);
        return { ok: false, index: i, reason: 'duplicate-pageId' };
      }
      pageIds.add(sheet.pageId);
    }

    try {
      sanitizeMemoHtml(sheet.content ?? '');
      collectMemoImageIdsFromHtml(sheet.content ?? '');
    } catch (error) {
      console.warn('[Memo] session sheet serialize failed at index:', i, error);
      return { ok: false, index: i, reason: 'serialize-failed' };
    }
  }

  const contentEditor = dom.memoFullscreenBody?.querySelector('.memo-text-page-content');
  if (contentEditor) {
    for (let i = 0; i < sheets.length; i += 1) {
      const html = sheets[i].content ?? '';
      if (!html.includes('data-memo-image-id')) continue;
      if (!doesHtmlFitEditorSheet(contentEditor, html)) {
        console.warn('[Memo] photo clipping safety check failed at sheet index:', i);
        return { ok: false, index: i, reason: 'photo-clipping-detected' };
      }
    }
  }

  return { ok: true };
}


function showSessionIntegrityFailure(integrity) {
  if (integrity.reason === 'photo-clipping-detected') {
    showToast('일부 사진이 페이지 영역을 벗어났습니다. 다음 속지로 이동해 주세요.');
    return;
  }
  showToast('페이지를 저장할 수 없습니다.');
}


function clonePageDraft(draft) {
  return {
    editorSheetId: draft.editorSheetId ?? null,
    pageId: draft.pageId ?? null,
    draftId: draft.draftId ?? null,
    templateId: normalizeMemoTemplateId(draft.templateId),
    memoCategoryId: draft.memoCategoryId ?? '',
    date: draft.date ?? '',
    title: draft.title ?? '',
    content: draft.content ?? '',
    insertPosition: draft.insertPosition ?? 'after-current',
    isTemporary: draft.isTemporary ?? false,
    isContinuation: Boolean(draft.isContinuation),
  };
}


function initPageEditorSession(
  w,
  draft,
  { memoId = null, sourceType = null, sessionGroupId = null } = {}
) {
  initEditorSessionWithSheet(
    w.id,
    draft,
    { memoId, sourceType, sessionGroupId },
    clonePageDraft
  );
}


function ensurePageEditorSession(w, draft) {
  const memo = getActiveCreateSetupMemo(w);
  return ensureEditorSessionFromDraft(w.id, draft, clonePageDraft, { memoId: memo?.id ?? null });
}


function syncActiveSheetFromSession(w) {
  const sheet = getActiveEditorSheet(w.id);
  if (!sheet) return null;
  const draft = clonePageDraft(sheet);
  pageEditorDrafts.set(w.id, draft);
  return draft;
}


function getSessionSheetsForEditor(w) {
  return getSessionSheetsForPersist(w);
}


async function openEditorSessionSheet(w, targetIndex) {
  if (targetIndex === getActiveEditorSheetIndex(w.id)) return;

  closeMemoEditorAlignMenu();
  syncPageEditorDraftFromForm(w);
  syncCurrentDraftIntoSession(w.id, pageEditorDrafts.get(w.id), clonePageDraft);

  if (!setActiveEditorSheetIndex(w.id, targetIndex)) return;

  const draft = syncActiveSheetFromSession(w);
  if (draft) {
    pageEditorBaselines.set(w.id, clonePageDraft(draft));
  }
  registerPageEditorBaselineRefresher(w, null);
  isPageEditorCategoryMenuOpen = false;
  renderMemoFullscreen();
}


function buildEditorSessionNav(w) {
  const total = getEditorSessionSheetCount(w.id);
  if (total < 2) return null;

  const index = getActiveEditorSheetIndex(w.id);

  const nav = document.createElement('div');
  nav.className = 'memo-editor-session-nav';
  nav.setAttribute('role', 'navigation');
  nav.setAttribute('aria-label', '작성 세션 속지 이동');

  const prevBtn = document.createElement('button');
  prevBtn.type = 'button';
  prevBtn.className = 'memo-editor-session-prev';
  prevBtn.textContent = '‹ 이전 속지';
  prevBtn.disabled = index <= 0;

  const indicator = document.createElement('span');
  indicator.className = 'memo-editor-session-indicator';
  indicator.textContent = `${index + 1} / ${total}`;

  const nextBtn = document.createElement('button');
  nextBtn.type = 'button';
  nextBtn.className = 'memo-editor-session-next';
  nextBtn.textContent = '다음 속지 ›';
  nextBtn.disabled = index >= total - 1;

  nav.append(prevBtn, indicator, nextBtn);
  return nav;
}


function isPageContinuation(pageOrDraft) {
  return Boolean(pageOrDraft?.isContinuation);
}


function pageTitleForSave(draft) {
  if (isPageContinuation(draft)) return '';
  return normalizeTitle(draft.title);
}


function pageDateForSave(draft) {
  if (isPageContinuation(draft)) return '';
  return draft.date ?? '';
}


function ensureMemoDrafts(memo) {
  if (!memo) return;
  if (!Array.isArray(memo.drafts)) memo.drafts = [];
}


function normalizeDraftInsertPosition(position) {
  if (position === 'before-current' || position === 'after-current' || position === 'append-last') {
    return position;
  }
  return 'append-last';
}


function getDraftSortTimestamp(draft) {
  const updated = new Date(draft?.updatedAt || 0).getTime();
  if (!Number.isNaN(updated) && updated > 0) return updated;
  const created = new Date(draft?.createdAt || 0).getTime();
  if (!Number.isNaN(created) && created > 0) return created;
  return 0;
}


function sanitizeDraftContent(content) {
  if (typeof content !== 'string') return '';
  try {
    return sanitizeMemoHtml(content);
  } catch (error) {
    console.warn('[Memo] draft content sanitizer failed:', error);
    return '';
  }
}


function buildPageFromMemoDraft(draft, now = new Date().toISOString()) {
  const isContinuation = Boolean(draft?.isContinuation);
  return stripPageSessionMeta({
    id: crypto.randomUUID(),
    templateId: normalizeMemoTemplateId(draft?.templateId),
    category: '',
    date: isContinuation ? '' : draft?.date ?? '',
    title: isContinuation ? '' : normalizeTitle(draft?.title),
    isContinuation,
    content: sanitizeDraftContent(draft?.content ?? ''),
    createdAt: now,
    updatedAt: now,
  });
}


function stripPageSessionMeta(page) {
  if (!page || typeof page !== 'object') return page;
  delete page.sessionGroupId;
  delete page.sessionOrder;
  delete page.sessionTotal;
  delete page.editorSheetId;
  delete page.draftId;
  return page;
}


function removeMemoDraftById(memo, draftId) {
  if (!memo || !draftId || !Array.isArray(memo.drafts)) return false;
  const before = memo.drafts.length;
  memo.drafts = memo.drafts.filter((draft) => draft.id !== draftId);
  return memo.drafts.length < before;
}


function removeMemoDraftAfterPageSave(memo, editorDraft, savedPageId) {
  if (!memo || !Array.isArray(memo.drafts)) return;

  const draftId = editorDraft?.draftId;
  if (draftId) {
    if (removeMemoDraftById(memo, draftId)) return;
    console.warn('[Memo] draftId not found for removal after page save:', draftId);
    return;
  }

  if (!savedPageId) return;

  const matches = memo.drafts.filter(
    (draft) => draft.sourcePageId && draft.sourcePageId === savedPageId
  );
  if (matches.length === 1) {
    removeMemoDraftById(memo, matches[0].id);
    return;
  }
  if (matches.length > 1) {
    console.warn(
      '[Memo] multiple drafts share sourcePageId, skipping auto-removal:',
      savedPageId
    );
  }
}


function cloneMemoDraftForEditor(draft, memo) {
  return {
    pageId: draft.sourcePageId || null,
    draftId: draft.id,
    templateId: normalizeMemoTemplateId(draft.templateId),
    memoCategoryId: normalizeMemoCategoryId(draft.category || memo.category),
    date: isPageContinuation(draft) ? '' : draft.date || getLocalDateInputValue(),
    title: isPageContinuation(draft)
      ? ''
      : draft.title === '제목 없음'
        ? ''
        : draft.title ?? '',
    content: sanitizeDraftContent(draft.content ?? ''),
    insertPosition: 'after-current',
    isTemporary: false,
    isContinuation: Boolean(draft.isContinuation),
  };
}


function resolveArchiveDraftContext(w) {
  if (!w || !archiveMemoId || !archiveDraftIds.length) return null;

  const memo = findSharedMemoById(archiveMemoId);
  if (!memo?.id || memo.id !== archiveMemoId) {
    console.warn('[Memo] archive memo context mismatch:', archiveMemoId);
    return null;
  }

  const currentMemo = getActiveCreateSetupMemo(w);
  if (currentMemo?.id !== archiveMemoId) {
    console.warn('[Memo] current diary differs from archive context');
    return null;
  }

  const activeDraftId = archiveDraftIds[archiveDraftActiveIndex] ?? archiveDraftId;
  const draft = findMemoDraft(memo, activeDraftId);
  if (!draft) {
    console.warn('[Memo] archive draft not found:', activeDraftId);
    return null;
  }

  return { memo, draft, draftId: activeDraftId };
}


function sortDraftGroupDrafts(memo, sessionGroupId) {
  if (!memo || !sessionGroupId) return [];
  const groupDrafts = memo.drafts.filter((item) => item.sessionGroupId === sessionGroupId);
  const sorted = groupDrafts.slice().sort((a, b) => {
    const orderA = a.sessionOrder;
    const orderB = b.sessionOrder;
    if (orderA != null && orderB != null && orderA !== orderB) {
      return orderA - orderB;
    }
    return memo.drafts.indexOf(a) - memo.drafts.indexOf(b);
  });

  const orders = sorted.map((item) => item.sessionOrder).filter((order) => order != null);
  if (orders.length > 1 && new Set(orders).size !== orders.length) {
    console.warn('[Memo] duplicate sessionOrder in draft group:', sessionGroupId);
  }
  return sorted;
}


function pickGroupRepresentativeDraft(sortedDrafts) {
  if (!sortedDrafts.length) return null;
  const titled = sortedDrafts.find(
    (draft) =>
      !isPageContinuation(draft)
      && (draft.title || '').trim()
      && draft.title !== '제목 없음'
  );
  return titled ?? sortedDrafts[0];
}


function getArchiveGroupDisplayTitle(sortedDrafts) {
  const representative = pickGroupRepresentativeDraft(sortedDrafts);
  if (!representative) return '제목 없음';
  if (isPageContinuation(representative)) return '이어쓰기';
  return representative.title || '제목 없음';
}


function warnDraftGroupMetaIssues(memo, sessionGroupId, groupDrafts) {
  if (!sessionGroupId || !groupDrafts.length) return;
  const storedTotals = new Set(
    groupDrafts.map((draft) => draft.sessionTotal).filter((total) => total != null)
  );
  if (storedTotals.size > 1) {
    console.warn('[Memo] sessionTotal mismatch within group:', sessionGroupId, [...storedTotals]);
  }
  const expectedTotal = groupDrafts[0]?.sessionTotal;
  if (expectedTotal != null && expectedTotal !== groupDrafts.length) {
    console.warn(
      '[Memo] sessionTotal differs from draft count:',
      sessionGroupId,
      expectedTotal,
      groupDrafts.length
    );
  }
}


function shouldPersistDraftsAsGroup(session, sheets) {
  if (!session) return sheets.length > 1;
  if (session.sourceType === 'page') return sheets.length > 1;
  return session.sourceType === 'new' || session.sourceType === 'draft';
}


function removeDraftsBeforeGroupPersist(memo, sessionGroupId, sheets) {
  const keepingIds = new Set(sheets.map((sheet) => sheet.draftId).filter(Boolean));

  memo.drafts = memo.drafts.filter((draft) => {
    if (draft.sessionGroupId === sessionGroupId) {
      return keepingIds.has(draft.id);
    }
    if (!draft.sessionGroupId && keepingIds.has(draft.id)) {
      return false;
    }
    return true;
  });
}


function persistDraftGroupFromSheets(memo, sheets, sessionGroupId, now) {
  const sessionTotal = sheets.length;
  const firstDraftId = sheets[0]?.draftId ?? null;

  sheets.forEach((sheet, index) => {
    upsertMemoDraftFromSheet(memo, sheet, now, index === 0 ? firstDraftId : null, {
      sessionGroupId,
      sessionOrder: index,
      sessionTotal,
    });
  });

  recomputeDraftGroupMeta(memo, sessionGroupId);
  warnDraftGroupMetaIssues(memo, sessionGroupId, sortDraftGroupDrafts(memo, sessionGroupId));
}


function recomputeDraftGroupMeta(memo, sessionGroupId) {
  if (!memo || !sessionGroupId) return;
  const sorted = sortDraftGroupDrafts(memo, sessionGroupId);
  const total = sorted.length;
  sorted.forEach((draft, index) => {
    draft.sessionOrder = index;
    draft.sessionTotal = total;
  });
}


function initArchiveDraftGroupView(memo, draftId) {
  const draft = findMemoDraft(memo, draftId);
  if (!memo?.id || !draft) return false;

  archiveMemoId = memo.id;
  archiveDraftId = draftId;

  if (draft.sessionGroupId) {
    archiveDraftGroupId = draft.sessionGroupId;
    archiveDraftIds = sortDraftGroupDrafts(memo, draft.sessionGroupId).map((item) => item.id);
    archiveDraftActiveIndex = Math.max(0, archiveDraftIds.indexOf(draftId));
  } else {
    archiveDraftGroupId = null;
    archiveDraftIds = [draftId];
    archiveDraftActiveIndex = 0;
  }

  return true;
}


function collectDraftImageIds(draft) {
  if (!draft?.content) return [];
  return [...collectMemoImageIdsFromHtml(draft.content)];
}


async function deleteDraftImagesIfUnreferenced(memo, draftIds, w) {
  const imageIds = new Set();
  draftIds.forEach((draftId) => {
    const draft = findMemoDraft(memo, draftId);
    collectDraftImageIds(draft).forEach((imageId) => imageIds.add(imageId));
  });

  for (const imageId of imageIds) {
    await deleteMemoImageIfUnreferenced(imageId, w);
  }
}


function findMemoDraft(memo, draftId) {
  if (!memo || !draftId || !Array.isArray(memo.drafts)) return null;
  return memo.drafts.find((draft) => draft.id === draftId) ?? null;
}


function getSortedMemoDrafts(memo) {
  ensureMemoDrafts(memo);
  return memo.drafts
    .filter((draft) => draft && typeof draft === 'object' && draft.id)
    .slice()
    .sort((a, b) => getDraftSortTimestamp(b) - getDraftSortTimestamp(a));
}


function getSessionDraftDisplayTitle(representative, sessionTotal) {
  if (sessionTotal > 1) {
    const baseTitle = isPageContinuation(representative)
      ? '이어쓰기'
      : representative.title || '제목 없음';
    return `${baseTitle} · ${sessionTotal}페이지 임시저장본`;
  }
  return isPageContinuation(representative) ? '이어쓰기' : representative.title || '제목 없음';
}


function getArchiveDraftEntries(memo) {
  ensureMemoDrafts(memo);
  const groupMap = new Map();
  const singles = [];

  memo.drafts.forEach((draft) => {
    if (!draft?.id) return;
    const groupId = draft.sessionGroupId;
    if (groupId) {
      if (!groupMap.has(groupId)) {
        groupMap.set(groupId, []);
      }
      groupMap.get(groupId).push(draft);
      return;
    }
    singles.push(draft);
  });

  const entries = [];

  groupMap.forEach((groupDrafts, sessionGroupId) => {
    const sorted = sortDraftGroupDrafts(memo, sessionGroupId);
    if (!sorted.length) return;
    if (sorted.length !== groupDrafts.length) {
      console.warn(
        '[Memo] duplicate group entries collapsed for sessionGroupId:',
        sessionGroupId,
        groupDrafts.length,
        sorted.length
      );
    }
    warnDraftGroupMetaIssues(memo, sessionGroupId, sorted);
    const latestUpdatedAt = sorted.reduce(
      (latest, item) => Math.max(latest, getDraftSortTimestamp(item)),
      0
    );
    entries.push({
      type: 'session',
      drafts: sorted,
      representative: pickGroupRepresentativeDraft(sorted),
      sortTimestamp: latestUpdatedAt,
    });
  });

  singles.forEach((draft) => {
    entries.push({
      type: 'single',
      drafts: [draft],
      representative: draft,
      sortTimestamp: getDraftSortTimestamp(draft),
    });
  });

  entries.sort((a, b) => b.sortTimestamp - a.sortTimestamp);
  return entries;
}


function formatMemoDateTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('ko-KR', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}


function truncateDraftBodyPreview(content, maxLen = 120) {
  const plain = memoContentToPlainText(content).replace(/\s+/g, ' ').trim();
  if (!plain) return '';
  if (plain.length <= maxLen) return plain;
  return `${plain.slice(0, maxLen)}…`;
}


const DRAFT_INSERT_POSITION_OPTIONS = [
  { id: 'before-current', label: '현재 페이지 앞' },
  { id: 'after-current', label: '현재 페이지 뒤' },
  { id: 'append-last', label: '맨 마지막' },
];


function buildArchivePopupElement() {
  const popup = document.createElement('div');
  popup.className = 'memo-archive-popup';
  popup.hidden = true;
  popup.setAttribute('role', 'dialog');
  popup.setAttribute('aria-modal', 'true');
  popup.setAttribute('aria-labelledby', 'memo-archive-popup-title');
  popup.setAttribute('aria-hidden', 'true');

  const backdrop = document.createElement('button');
  backdrop.type = 'button';
  backdrop.className = 'memo-archive-popup-backdrop';
  backdrop.setAttribute('aria-label', '보관함 닫기');

  const dialog = document.createElement('div');
  dialog.className = 'memo-archive-popup-dialog glass-panel';

  const header = document.createElement('div');
  header.className = 'memo-archive-popup-header';

  const title = document.createElement('h3');
  title.id = 'memo-archive-popup-title';
  title.className = 'memo-archive-popup-title';
  title.textContent = '보관함';

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'memo-archive-popup-close';
  closeBtn.textContent = '✕';
  closeBtn.setAttribute('aria-label', '닫기');

  header.append(title, closeBtn);

  const list = document.createElement('div');
  list.className = 'memo-archive-draft-list';

  dialog.append(header, list);
  popup.append(backdrop, dialog);
  return popup;
}


function ensureArchiveMenuLayer() {
  if (!dom.memoFullscreenBody) return null;

  dom.memoFullscreenBody
    .querySelectorAll('.memo-archive-popup-dialog .memo-archive-menu-layer')
    .forEach((legacyLayer) => legacyLayer.remove());

  let layer = dom.memoFullscreenBody.querySelector(':scope > .memo-archive-menu-layer');
  if (!layer) {
    layer = document.createElement('div');
    layer.className = 'memo-archive-menu-layer';
    layer.hidden = true;
    layer.setAttribute('aria-hidden', 'true');
    dom.memoFullscreenBody.appendChild(layer);
  }
  return layer;
}


function mountArchivePopupOverlay(container) {
  if (!container) return;
  if (!container.querySelector('.memo-archive-popup')) {
    container.appendChild(buildArchivePopupElement());
  }
  ensureArchiveMenuLayer();
  syncArchivePopupUi();
}


function closeArchiveDraftCardMenu() {
  const layer = ensureArchiveMenuLayer();
  if (layer) {
    layer.replaceChildren();
    layer.hidden = true;
    layer.setAttribute('aria-hidden', 'true');
  }
  if (archiveMenuScrollCleanup) {
    archiveMenuScrollCleanup();
    archiveMenuScrollCleanup = null;
  }
  if (archiveMenuOutsideClickHandler) {
    document.removeEventListener('click', archiveMenuOutsideClickHandler, true);
    archiveMenuOutsideClickHandler = null;
  }
  if (archiveMenuResizeHandler) {
    window.removeEventListener('resize', archiveMenuResizeHandler);
    archiveMenuResizeHandler = null;
  }
}


function positionArchiveCardMenu(menu, anchorBtn) {
  if (!menu || !anchorBtn) return;

  const margin = 8;
  const rect = anchorBtn.getBoundingClientRect();
  const menuWidth = menu.offsetWidth;
  const menuHeight = menu.offsetHeight;
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;

  const spaceBelow = viewportHeight - rect.bottom - margin;
  const spaceAbove = rect.top - margin;
  const openUp = spaceBelow < menuHeight && spaceAbove >= spaceBelow;

  let left = rect.right - menuWidth;
  left = Math.max(margin, Math.min(left, viewportWidth - menuWidth - margin));

  menu.style.position = 'fixed';
  menu.style.left = `${left}px`;
  menu.style.right = 'auto';
  menu.style.zIndex = '25';

  menu.classList.toggle('memo-archive-draft-menu--above', openUp);
  if (openUp) {
    menu.style.top = `${Math.max(margin, rect.top - menuHeight - margin)}px`;
  } else {
    menu.style.top = `${Math.min(viewportHeight - menuHeight - margin, rect.bottom + margin)}px`;
  }
}


function bindArchiveCardMenuItem(item, w, draftId, isGroup) {
  item.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    const action = item.dataset.action;
    closeArchiveDraftCardMenu();

    const memo = getActiveCreateSetupMemo(w);
    if (!memo) return;

    if (action === 'continue') {
      closeArchivePopup();
      openTextPageEditorForDraft(w, draftId);
      return;
    }

    if (action === 'add') {
      if (!initArchiveDraftGroupView(memo, draftId)) return;
      archiveAnchorPageId =
        currentPageId && memo.pages.some((page) => page.id === currentPageId)
          ? currentPageId
          : null;
      draftDetailInsertPosition = 'append-last';
      closeArchivePopup();
      if (isGroup) {
        draftAddScope = 'all';
        showDraftAddConfirmDialog(() => addDraftToDiary(w));
      } else {
        draftAddScope = 'current';
        showDraftAddConfirmDialog(() => addDraftToDiary(w));
      }
      return;
    }

    if (action === 'delete') {
      if (!initArchiveDraftGroupView(memo, draftId)) return;
      closeArchivePopup();
      const total = archiveDraftIds.length;
      showArchiveDraftDeleteConfirmDialog({
        message:
          total > 1
            ? '이 임시저장본의 모든 페이지를 삭제할까요?'
            : '이 임시저장본을 삭제할까요?',
        submessage:
          total > 1
            ? `총 ${total}페이지가 삭제되며 복구할 수 없습니다.`
            : '삭제한 내용은 복구할 수 없습니다.',
        confirmLabel: total > 1 ? '전체 삭제' : '삭제',
        onConfirm: () => {
          deleteArchiveDraftGroup(w);
        },
      });
    }
  });
}


function openArchiveDraftCardMenu(w, anchorBtn, draftId, triggerEvent) {
  triggerEvent?.preventDefault();
  triggerEvent?.stopPropagation();
  closeArchiveDraftCardMenu();

  const memo = getActiveCreateSetupMemo(w);
  const draft = findMemoDraft(memo, draftId);
  if (!memo || !draft) return;

  const isGroup = anchorBtn.dataset.isGroup === 'true';

  const menu = document.createElement('div');
  menu.className = 'memo-archive-draft-menu glass-panel';
  menu.setAttribute('role', 'menu');
  menu.setAttribute('aria-label', '임시저장본 메뉴');

  const continueItem = document.createElement('button');
  continueItem.type = 'button';
  continueItem.className = 'memo-archive-draft-menu-item';
  continueItem.dataset.action = 'continue';
  continueItem.setAttribute('role', 'menuitem');
  continueItem.textContent = isGroup ? '전체 계속 작성' : '계속 작성';

  const addItem = document.createElement('button');
  addItem.type = 'button';
  addItem.className = 'memo-archive-draft-menu-item';
  addItem.dataset.action = 'add';
  addItem.setAttribute('role', 'menuitem');
  addItem.textContent = isGroup ? '전체 페이지 추가' : '페이지 추가';

  const deleteItem = document.createElement('button');
  deleteItem.type = 'button';
  deleteItem.className = 'memo-archive-draft-menu-item memo-archive-draft-menu-item--danger';
  deleteItem.dataset.action = 'delete';
  deleteItem.setAttribute('role', 'menuitem');
  deleteItem.textContent = isGroup ? '전체 삭제' : '삭제';

  menu.append(continueItem, addItem, deleteItem);
  bindArchiveCardMenuItem(continueItem, w, draftId, isGroup);
  bindArchiveCardMenuItem(addItem, w, draftId, isGroup);
  bindArchiveCardMenuItem(deleteItem, w, draftId, isGroup);

  const layer = ensureArchiveMenuLayer();
  if (!layer) return;

  layer.appendChild(menu);
  layer.hidden = false;
  layer.setAttribute('aria-hidden', 'false');

  archiveMenuIgnoreOutsideUntil = performance.now() + 300;

  requestAnimationFrame(() => {
    positionArchiveCardMenu(menu, anchorBtn);
  });

  const list = dom.memoFullscreenBody?.querySelector('.memo-archive-draft-list');
  const onScroll = () => closeArchiveDraftCardMenu();
  list?.addEventListener('scroll', onScroll, { passive: true });
  archiveMenuScrollCleanup = () => list?.removeEventListener('scroll', onScroll);

  archiveMenuResizeHandler = () => closeArchiveDraftCardMenu();
  window.addEventListener('resize', archiveMenuResizeHandler);

  archiveMenuOutsideClickHandler = (e) => {
    if (performance.now() < archiveMenuIgnoreOutsideUntil) return;
    if (
      e.target.closest('.memo-archive-draft-menu')
      || e.target.closest('.memo-archive-draft-menu-btn')
      || e.target.closest('.memo-archive-menu-layer .memo-archive-draft-menu')
    ) {
      return;
    }
    closeArchiveDraftCardMenu();
  };
  setTimeout(() => {
    document.addEventListener('click', archiveMenuOutsideClickHandler, true);
  }, 0);
}


function renderArchiveDraftList(listEl, w) {
  if (!listEl) return;
  listEl.replaceChildren();

  const memo = getActiveCreateSetupMemo(w);
  const entries = memo ? getArchiveDraftEntries(memo) : [];

  if (!entries.length) {
    const empty = document.createElement('p');
    empty.className = 'memo-archive-empty';
    empty.textContent = '보관함에 임시저장된 페이지가 없습니다.';
    listEl.appendChild(empty);
    return;
  }

  entries.forEach((entry) => {
    try {
      const draft = entry.representative;
      if (!draft?.id) return;

      const draftCount = entry.drafts.length;
      const firstDraft = entry.drafts[0] ?? draft;

      const cardWrap = document.createElement('div');
      cardWrap.className = 'memo-archive-draft-card-wrap';
      if (entry.type === 'session') {
        cardWrap.classList.add('memo-archive-draft-card-wrap--session');
      }

      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'memo-archive-draft-card';
      if (entry.type === 'session') {
        card.classList.add('memo-archive-draft-card--session');
      }
      card.dataset.draftId = firstDraft.id;
      if (firstDraft.sessionGroupId) {
        card.dataset.sessionGroupId = firstDraft.sessionGroupId;
      }

      const representative = draft;
      const previewDraft = entry.drafts[0] ?? representative;

      const dateEl = document.createElement('p');
      dateEl.className = 'memo-archive-draft-date';
      dateEl.textContent = isPageContinuation(representative)
        ? '이어쓰기'
        : formatPageDateDisplay(representative.date) || '날짜 없음';

      const titleEl = document.createElement('h4');
      titleEl.className = 'memo-archive-draft-title';
      titleEl.textContent =
        entry.type === 'session'
          ? getArchiveGroupDisplayTitle(entry.drafts)
          : isPageContinuation(representative)
            ? '이어쓰기'
            : representative.title || '제목 없음';

      const excerptEl = document.createElement('p');
      excerptEl.className = 'memo-archive-draft-excerpt';
      excerptEl.textContent =
        getMemoDraftExcerptWithPhotos(previewDraft.content, (c) => truncateDraftBodyPreview(c)) ||
        '내용 없음';

      const updatedEl = document.createElement('p');
      updatedEl.className = 'memo-archive-draft-updated';
      const latestDraft = entry.drafts.reduce((latest, item) => {
        if (!latest) return item;
        return getDraftSortTimestamp(item) > getDraftSortTimestamp(latest) ? item : latest;
      }, null);
      updatedEl.textContent = `마지막 수정 ${formatMemoDateTime(latestDraft?.updatedAt ?? draft.updatedAt)}`;

      if (draftCount > 1) {
        const pageCountEl = document.createElement('p');
        pageCountEl.className = 'memo-archive-draft-page-count';
        pageCountEl.textContent = `${draftCount}페이지 임시저장본`;
        card.append(dateEl, titleEl, pageCountEl, excerptEl, updatedEl);
      } else {
        card.append(dateEl, titleEl, excerptEl, updatedEl);
      }

      const menuBtn = document.createElement('button');
      menuBtn.type = 'button';
      menuBtn.className = 'memo-archive-draft-menu-btn';
      menuBtn.dataset.draftId = firstDraft.id;
      menuBtn.dataset.isGroup = draftCount > 1 ? 'true' : 'false';
      menuBtn.dataset.draftCount = String(draftCount);
      menuBtn.setAttribute('aria-label', '임시저장본 메뉴');
      menuBtn.setAttribute('aria-haspopup', 'menu');
      menuBtn.textContent = '⋯';

      cardWrap.append(card, menuBtn);
      listEl.appendChild(cardWrap);
    } catch (error) {
      console.warn('[Memo] failed to render draft card:', entry?.representative?.id, error);
      const fallback = document.createElement('div');
      fallback.className = 'memo-archive-draft-card memo-archive-draft-card--error';
      fallback.textContent = '임시저장본을 표시할 수 없습니다.';
      listEl.appendChild(fallback);
    }
  });
}


function syncArchivePopupUi() {
  const popup = dom.memoFullscreenBody?.querySelector('.memo-archive-popup');
  if (!popup) return;

  popup.hidden = !isArchivePopupOpen;
  popup.classList.toggle('memo-archive-popup--open', isArchivePopupOpen);
  popup.setAttribute('aria-hidden', isArchivePopupOpen ? 'false' : 'true');

  const list = popup.querySelector('.memo-archive-draft-list');
  if (isArchivePopupOpen) {
    renderArchiveDraftList(list, getActiveMemoWidget());
  }
}


function openArchivePopup(w) {
  if (!w || !getActiveCreateSetupMemo(w)) {
    showToast('다이어리를 먼저 열어주세요.');
    return;
  }
  if (fullscreenViewMode === 'pageEditor') {
    syncPageEditorDraftFromForm(w);
  }
  ensureArchiveMenuLayer();
  closeArchiveDraftCardMenu();
  isArchivePopupOpen = true;
  syncArchivePopupUi();
}


function closeArchivePopup() {
  if (!isArchivePopupOpen) return;
  isArchivePopupOpen = false;
  closeArchiveDraftCardMenu();
  syncArchivePopupUi();
}


function resetMemoPageManagerPointerSession() {
  if (memoPageManagerPointerCleanup) {
    memoPageManagerPointerCleanup();
    memoPageManagerPointerCleanup = null;
  }
  if (memoPageManagerDragState) {
    cancelMemoPageManagerDrag();
  }
}


function resetMemoPageManagerSession() {
  resetMemoPageManagerPointerSession();
  isMemoPageManagerOpen = false;
  memoPageManagerMemoId = null;
  memoPageManagerOriginalPageIds = [];
  memoPageManagerWorkingPages = [];
  memoPageManagerSelectedIds = new Set();
  isMemoPageManagerSelectionMode = false;
  isMemoPageManagerDirty = false;
  memoPageManagerDragState = null;
  isMemoPageManagerSaving = false;
  memoPageManagerOpenPageId = null;
  didMemoPageManagerDrag = false;
  suppressMemoPageManagerClickUntil = 0;
}


function buildMemoPageManagerOverlayElement() {
  const overlay = document.createElement('div');
  overlay.className = 'memo-page-manager-overlay';
  overlay.hidden = true;
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-labelledby', 'memo-page-manager-title');
  overlay.setAttribute('aria-hidden', 'true');

  const dialog = document.createElement('div');
  dialog.className = 'memo-page-manager-dialog glass-panel';

  const header = document.createElement('header');
  header.className = 'memo-page-manager-header';

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'memo-page-manager-close';
  closeBtn.textContent = '←';
  closeBtn.setAttribute('aria-label', '닫기');

  const title = document.createElement('h2');
  title.id = 'memo-page-manager-title';
  title.className = 'memo-page-manager-title';
  title.textContent = '페이지';

  const headerActions = document.createElement('div');
  headerActions.className = 'memo-page-manager-header-actions';

  const selectToggle = document.createElement('button');
  selectToggle.type = 'button';
  selectToggle.className = 'memo-page-manager-select-toggle';
  selectToggle.textContent = '선택';

  const doneBtn = document.createElement('button');
  doneBtn.type = 'button';
  doneBtn.className = 'memo-page-manager-done';
  doneBtn.textContent = '완료';

  headerActions.append(selectToggle, doneBtn);
  header.append(closeBtn, title, headerActions);

  const help = document.createElement('p');
  help.className = 'memo-page-manager-help';
  help.textContent = '페이지를 길게 눌러 순서를 변경할 수 있습니다.';

  const grid = document.createElement('div');
  grid.className = 'memo-page-manager-grid';

  const selectionBar = document.createElement('div');
  selectionBar.className = 'memo-page-manager-selection-bar';
  selectionBar.hidden = true;

  dialog.append(header, help, grid, selectionBar);
  overlay.appendChild(dialog);
  return overlay;
}


function getMemoPageManagerPageTitle(page) {
  if (!page) return '제목 없음';
  if (isPageContinuation(page)) return '이어쓰기';
  return page.title || '제목 없음';
}


function buildMemoPageManagerThumbnail(page, memo) {
  const thumbnail = document.createElement('div');
  thumbnail.className = 'memo-page-manager-thumbnail';

  const scaleWrap = document.createElement('div');
  scaleWrap.className = 'memo-page-manager-thumbnail-scale';

  const thumbMemo = { ...memo, pages: memoPageManagerWorkingPages };
  const sheet = buildBinderSheetElement(page, thumbMemo, {
    showEdit: false,
    showPageNumber: false,
    thumbnailMode: true,
  });
  if (sheet) {
    scaleWrap.appendChild(sheet);
  }

  thumbnail.appendChild(scaleWrap);
  return thumbnail;
}


function buildMemoPageManagerItem(page, index, memo) {
  const item = document.createElement('button');
  item.type = 'button';
  item.className = 'memo-page-manager-item';
  item.dataset.pageId = page.id;
  item.setAttribute('aria-pressed', memoPageManagerSelectedIds.has(page.id) ? 'true' : 'false');
  item.setAttribute(
    'aria-label',
    `${index + 1}페이지 ${getMemoPageManagerPageTitle(page)}`
  );

  if (page.id === currentPageId) {
    item.classList.add('memo-page-manager-item--current');
  }
  if (memoPageManagerSelectedIds.has(page.id)) {
    item.classList.add('memo-page-manager-item--selected');
  }

  item.appendChild(buildMemoPageManagerThumbnail(page, memo));

  const meta = document.createElement('div');
  meta.className = 'memo-page-manager-meta';

  const pageNumber = document.createElement('span');
  pageNumber.className = 'memo-page-manager-page-number';
  pageNumber.textContent = String(index + 1);

  const pageTitle = document.createElement('span');
  pageTitle.className = 'memo-page-manager-page-title';
  pageTitle.textContent = getMemoPageManagerPageTitle(page);

  meta.append(pageNumber, pageTitle);

  const selectMark = document.createElement('span');
  selectMark.className = 'memo-page-manager-select-mark';
  selectMark.textContent = memoPageManagerSelectedIds.has(page.id) ? '☑' : '○';
  selectMark.setAttribute('aria-hidden', 'true');

  item.append(meta, selectMark);
  return item;
}


function syncMemoPageManagerSelectionBar() {
  const bar = dom.memoFullscreenBody?.querySelector('.memo-page-manager-selection-bar');
  if (!bar) return;

  bar.replaceChildren();
  bar.hidden = !isMemoPageManagerSelectionMode;

  const count = memoPageManagerSelectedIds.size;
  const status = document.createElement('p');
  status.className = 'memo-page-manager-selection-status';
  status.textContent =
    count > 0 ? `선택한 페이지 ${count}개` : '삭제할 페이지를 선택하세요.';

  const actions = document.createElement('div');
  actions.className = 'memo-page-manager-selection-actions';

  const clearBtn = document.createElement('button');
  clearBtn.type = 'button';
  clearBtn.className = 'btn-secondary memo-page-manager-selection-clear';
  clearBtn.textContent = '선택 해제';
  clearBtn.disabled = count === 0;

  const deleteBtn = document.createElement('button');
  deleteBtn.type = 'button';
  deleteBtn.className = 'btn-primary memo-page-manager-selection-delete';
  deleteBtn.textContent = '삭제';
  deleteBtn.disabled = count === 0 || isMemoPageManagerSaving;

  actions.append(clearBtn, deleteBtn);
  bar.append(status, actions);
}


function syncMemoPageManagerHeader() {
  const overlay = dom.memoFullscreenBody?.querySelector('.memo-page-manager-overlay');
  if (!overlay) return;

  overlay.classList.toggle(
    'memo-page-manager-overlay--selection-mode',
    isMemoPageManagerSelectionMode
  );

  const selectToggle = overlay.querySelector('.memo-page-manager-select-toggle');
  const doneBtn = overlay.querySelector('.memo-page-manager-done');
  const help = overlay.querySelector('.memo-page-manager-help');

  if (selectToggle) {
    selectToggle.textContent = isMemoPageManagerSelectionMode ? '선택 취소' : '선택';
    selectToggle.disabled = isMemoPageManagerSaving || !memoPageManagerWorkingPages.length;
  }
  if (doneBtn) {
    doneBtn.disabled = isMemoPageManagerSaving;
  }
  if (help) {
    help.hidden = isMemoPageManagerSelectionMode;
  }
}


function renderMemoPageManagerGrid(w) {
  const grid = dom.memoFullscreenBody?.querySelector('.memo-page-manager-grid');
  if (!grid) return;

  resetMemoPageManagerPointerSession();
  grid.replaceChildren();

  const memo = findSharedMemoById(memoPageManagerMemoId);
  if (!memo) return;

  const pages = Array.isArray(memoPageManagerWorkingPages) ? memoPageManagerWorkingPages : [];

  if (!pages.length) {
    const empty = document.createElement('p');
    empty.className = 'memo-page-manager-empty';
    empty.textContent = '아직 추가된 페이지가 없습니다.';
    grid.appendChild(empty);
    syncMemoPageManagerHeader();
    syncMemoPageManagerSelectionBar();
    return;
  }

  pages.forEach((page, index) => {
    if (!page?.id) return;
    grid.appendChild(buildMemoPageManagerItem(page, index, memo));
  });

  bindMemoPageManagerGridEvents(grid, w);
  syncMemoPageManagerHeader();
  syncMemoPageManagerSelectionBar();
}


function syncMemoPageManagerUi() {
  const overlay = dom.memoFullscreenBody?.querySelector('.memo-page-manager-overlay');
  if (!overlay) return;

  overlay.hidden = !isMemoPageManagerOpen;
  overlay.classList.toggle('memo-page-manager-overlay--open', isMemoPageManagerOpen);
  overlay.classList.toggle(
    'memo-page-manager-overlay--selection-mode',
    isMemoPageManagerSelectionMode
  );
  overlay.setAttribute('aria-hidden', isMemoPageManagerOpen ? 'false' : 'true');

  if (isMemoPageManagerOpen) {
    const w = getActiveMemoWidget();
    if (w) renderMemoPageManagerGrid(w);
  }
}


function openMemoPageManager(w) {
  const memo = getActiveCreateSetupMemo(w);
  if (!memo) return;

  closeCreateSetupMenu();
  resetMemoPageManagerSession();

  memoPageManagerMemoId = memo.id;
  memoPageManagerOriginalPageIds = (Array.isArray(memo.pages) ? memo.pages : [])
    .map((page) => page.id)
    .filter(Boolean);
  memoPageManagerWorkingPages = Array.isArray(memo.pages) ? [...memo.pages] : [];
  memoPageManagerOpenPageId = currentPageId;
  isMemoPageManagerOpen = true;
  syncMemoPageManagerUi();
}


function closeMemoPageManagerImmediate() {
  resetMemoPageManagerSession();
  syncMemoPageManagerUi();
}


function requestCloseMemoPageManager(w) {
  if (isMemoPageManagerSaving) return;
  if (!isMemoPageManagerDirty) {
    closeMemoPageManagerImmediate();
    if (w) renderMemoFullscreen();
    return;
  }
  showMemoPageManagerDiscardDialog({
    onContinue: () => {},
    onDiscard: () => {
      closeMemoPageManagerImmediate();
      if (w) renderMemoFullscreen();
    },
    onSave: async () => {
      const saved = await saveMemoPageManagerChanges(w);
      if (saved) renderMemoFullscreen();
    },
  });
}


function toggleMemoPageManagerSelectionMode() {
  if (isMemoPageManagerSaving || memoPageManagerDragState) return;
  isMemoPageManagerSelectionMode = !isMemoPageManagerSelectionMode;
  if (!isMemoPageManagerSelectionMode) {
    memoPageManagerSelectedIds.clear();
  }
  const w = getActiveMemoWidget();
  if (w) renderMemoPageManagerGrid(w);
}


function toggleMemoPageManagerPageSelection(pageId) {
  if (!pageId) return;
  if (memoPageManagerSelectedIds.has(pageId)) {
    memoPageManagerSelectedIds.delete(pageId);
  } else {
    memoPageManagerSelectedIds.add(pageId);
  }
  const w = getActiveMemoWidget();
  if (w) renderMemoPageManagerGrid(w);
}


function navigateMemoPageManagerToPage(w, pageId) {
  if (
    isMemoPageManagerSelectionMode
    || memoPageManagerDragState
    || isMemoPageManagerSaving
    || didMemoPageManagerDrag
    || performance.now() < suppressMemoPageManagerClickUntil
  ) {
    return;
  }
  if (!pageId || !memoPageManagerWorkingPages.some((page) => page.id === pageId)) return;

  currentPageId = pageId;
  closeMemoPageManagerImmediate();
  renderMemoFullscreen();
}


function removeMemoPageManagerDeleteDialog() {
  dom.memoFullscreenBody?.querySelector('.memo-page-manager-delete-dialog')?.remove();
}


function showMemoPageManagerDeleteConfirmDialog(count, onConfirm) {
  if (dom.memoFullscreenBody?.querySelector('.memo-page-manager-delete-dialog')) return;

  const overlay = document.createElement('div');
  overlay.className = 'memo-page-manager-delete-dialog';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-labelledby', 'memo-page-manager-delete-dialog-title');

  const panel = document.createElement('div');
  panel.className = 'memo-page-manager-delete-dialog-panel glass-panel';

  const title = document.createElement('p');
  title.id = 'memo-page-manager-delete-dialog-title';
  title.className = 'memo-page-manager-delete-dialog-message';
  title.textContent = `선택한 페이지 ${count}개를 삭제할까요?`;

  const subtitle = document.createElement('p');
  subtitle.className = 'memo-page-manager-delete-dialog-submessage';
  subtitle.textContent = '삭제한 페이지는 복구할 수 없습니다.';

  const actions = document.createElement('div');
  actions.className = 'memo-page-manager-delete-dialog-actions';

  const cancelBtn = document.createElement('button');
  cancelBtn.type = 'button';
  cancelBtn.className = 'btn-secondary memo-page-manager-delete-cancel';
  cancelBtn.textContent = '취소';

  const confirmBtn = document.createElement('button');
  confirmBtn.type = 'button';
  confirmBtn.className = 'btn-primary memo-page-manager-delete-confirm';
  confirmBtn.textContent = '삭제';

  actions.append(cancelBtn, confirmBtn);
  panel.append(title, subtitle, actions);
  overlay.appendChild(panel);
  dom.memoFullscreenBody?.appendChild(overlay);

  cancelBtn.addEventListener('click', () => {
    removeMemoPageManagerDeleteDialog();
  });

  confirmBtn.addEventListener('click', () => {
    removeMemoPageManagerDeleteDialog();
    onConfirm();
  });
}


function removeMemoPageManagerDiscardDialog() {
  dom.memoFullscreenBody?.querySelector('.memo-page-manager-discard-dialog')?.remove();
}


function showMemoPageManagerDiscardDialog({ onContinue, onDiscard, onSave }) {
  if (dom.memoFullscreenBody?.querySelector('.memo-page-manager-discard-dialog')) return;

  const overlay = document.createElement('div');
  overlay.className = 'memo-page-manager-discard-dialog';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-labelledby', 'memo-page-manager-discard-dialog-title');

  const panel = document.createElement('div');
  panel.className = 'memo-page-manager-discard-dialog-panel glass-panel';

  const title = document.createElement('p');
  title.id = 'memo-page-manager-discard-dialog-title';
  title.className = 'memo-page-manager-discard-dialog-message';
  title.textContent = '페이지 변경사항을 저장할까요?';

  const actions = document.createElement('div');
  actions.className = 'memo-page-manager-discard-dialog-actions';

  const continueBtn = document.createElement('button');
  continueBtn.type = 'button';
  continueBtn.className = 'memo-page-leave-continue memo-page-manager-discard-continue';
  continueBtn.textContent = '계속 편집';

  const discardBtn = document.createElement('button');
  discardBtn.type = 'button';
  discardBtn.className = 'btn-secondary memo-page-manager-discard-discard';
  discardBtn.textContent = '저장하지 않기';

  const saveBtn = document.createElement('button');
  saveBtn.type = 'button';
  saveBtn.className = 'btn-primary memo-page-manager-discard-save';
  saveBtn.textContent = '저장';

  actions.append(continueBtn, discardBtn, saveBtn);
  panel.append(title, actions);
  overlay.appendChild(panel);
  dom.memoFullscreenBody?.appendChild(overlay);

  continueBtn.addEventListener('click', () => {
    removeMemoPageManagerDiscardDialog();
    onContinue?.();
  });

  discardBtn.addEventListener('click', () => {
    removeMemoPageManagerDiscardDialog();
    onDiscard?.();
  });

  saveBtn.addEventListener('click', () => {
    removeMemoPageManagerDiscardDialog();
    onSave?.();
  });
}


function applyMemoPageManagerDelete(selectedIds) {
  const idSet = selectedIds instanceof Set ? selectedIds : new Set(selectedIds);
  memoPageManagerWorkingPages = memoPageManagerWorkingPages.filter((page) => !idSet.has(page.id));
  memoPageManagerSelectedIds.clear();
  isMemoPageManagerDirty = true;
  const w = getActiveMemoWidget();
  if (w) renderMemoPageManagerGrid(w);
}


function resolveMemoPageManagerCurrentPageIdAfterSave(memo, deletedPageIds) {
  const deletedSet = deletedPageIds instanceof Set ? deletedPageIds : new Set(deletedPageIds);
  const pages = memo?.pages ?? [];
  const anchorPageId = memoPageManagerOpenPageId ?? currentPageId;

  if (!pages.length) {
    currentPageId = null;
    return;
  }

  if (anchorPageId && pages.some((page) => page.id === anchorPageId) && !deletedSet.has(anchorPageId)) {
    currentPageId = anchorPageId;
    return;
  }

  if (currentPageId && pages.some((page) => page.id === currentPageId) && !deletedSet.has(currentPageId)) {
    return;
  }

  const originalIndex = memoPageManagerOriginalPageIds.indexOf(anchorPageId);
  if (originalIndex >= 0) {
    for (let i = originalIndex; i < memoPageManagerOriginalPageIds.length; i += 1) {
      const candidateId = memoPageManagerOriginalPageIds[i];
      if (!deletedSet.has(candidateId) && pages.some((page) => page.id === candidateId)) {
        currentPageId = candidateId;
        return;
      }
    }
    for (let i = originalIndex - 1; i >= 0; i -= 1) {
      const candidateId = memoPageManagerOriginalPageIds[i];
      if (!deletedSet.has(candidateId) && pages.some((page) => page.id === candidateId)) {
        currentPageId = candidateId;
        return;
      }
    }
  }

  resolveCurrentPageIdForDiary(memo);
}


async function saveMemoPageManagerChanges(w) {
  if (isMemoPageManagerSaving) return false;

  if (!isMemoPageManagerDirty) {
    closeMemoPageManagerImmediate();
    return true;
  }

  const memo = findSharedMemoById(memoPageManagerMemoId);
  if (!memo) {
    closeMemoPageManagerImmediate();
    return false;
  }

  const workingPages = memoPageManagerWorkingPages.filter((page) => page?.id);
  const workingIds = workingPages.map((page) => page.id);
  if (new Set(workingIds).size !== workingIds.length) {
    console.warn('[Memo] duplicate page ids in page manager save');
    showToast('페이지 저장에 실패했습니다.');
    return false;
  }

  isMemoPageManagerSaving = true;
  syncMemoPageManagerHeader();
  syncMemoPageManagerSelectionBar();

  const originalIdSet = new Set(memoPageManagerOriginalPageIds);
  const workingIdSet = new Set(workingIds);
  const deletedPageIds = [...originalIdSet].filter((id) => !workingIdSet.has(id));

  const deletedPages = (Array.isArray(memo.pages) ? memo.pages : []).filter((page) =>
    deletedPageIds.includes(page.id)
  );
  const imageIds = new Set();
  deletedPages.forEach((page) => {
    collectMemoImageIdsFromHtml(page.content ?? '').forEach((id) => imageIds.add(id));
  });

  const backupPages = Array.isArray(memo.pages) ? [...memo.pages] : [];
  memo.pages = workingPages;
  recomputeMemoDiarySummary(memo);
  memo.updatedAt = new Date().toISOString();
  resolveMemoPageManagerCurrentPageIdAfterSave(memo, deletedPageIds);

  if (deletedPageIds.length) {
    clearWidgetPreviewsForDeletedPages(memo.id, deletedPageIds);
  }

  try {
    saveMemoData();
  } catch (error) {
    console.error('[Memo] saveMemoPageManagerChanges failed:', error);
    memo.pages = backupPages;
    isMemoPageManagerSaving = false;
    syncMemoPageManagerHeader();
    syncMemoPageManagerSelectionBar();
    showToast('페이지 저장에 실패했습니다.');
    return false;
  }

  closeMemoPageManagerImmediate();
  isMemoPageManagerSaving = false;

  if (imageIds.size) {
    Promise.all([...imageIds].map((imageId) => deleteMemoImageIfUnreferenced(imageId, w))).catch(
      (error) => {
        console.warn('[Memo] page manager image cleanup failed:', error);
      }
    );
  }

  return true;
}


function cancelMemoPageManagerDrag() {
  const state = memoPageManagerDragState;
  if (!state) return;

  state.item?.classList.remove('memo-page-manager-item--dragging');
  state.ghost?.remove();
  state.placeholder?.remove();
  state.grid?.classList.remove('memo-page-manager-grid--dragging');
  document.body.style.userSelect = '';
  memoPageManagerDragState = null;
}


function computeMemoPageManagerInsertIndex(clientX, clientY) {
  const grid = dom.memoFullscreenBody?.querySelector('.memo-page-manager-grid');
  if (!grid || !memoPageManagerDragState) return memoPageManagerDragState?.fromIndex ?? 0;

  const candidates = [...grid.querySelectorAll(
    '.memo-page-manager-item:not(.memo-page-manager-item--dragging)'
  )];

  if (!candidates.length) return 0;

  for (let i = 0; i < candidates.length; i += 1) {
    const rect = candidates[i].getBoundingClientRect();
    const centerY = rect.top + rect.height / 2;
    const centerX = rect.left + rect.width / 2;

    if (clientY < centerY || (clientY <= rect.bottom && clientX < centerX)) {
      const pageId = candidates[i].dataset.pageId;
      const index = memoPageManagerWorkingPages.findIndex((page) => page.id === pageId);
      return index >= 0 ? index : i;
    }
  }

  return memoPageManagerWorkingPages.length - 1;
}


function updateMemoPageManagerDragPosition(e) {
  const state = memoPageManagerDragState;
  if (!state?.ghost) return;

  state.ghost.style.left = `${e.clientX - state.ghost.offsetWidth / 2}px`;
  state.ghost.style.top = `${e.clientY - state.ghost.offsetHeight / 2}px`;

  const insertIndex = computeMemoPageManagerInsertIndex(e.clientX, e.clientY);
  if (insertIndex === state.insertIndex) return;

  state.insertIndex = insertIndex;
  const items = [...state.grid.querySelectorAll(
    '.memo-page-manager-item:not(.memo-page-manager-item--dragging)'
  )];

  if (insertIndex >= items.length) {
    state.grid.appendChild(state.placeholder);
  } else {
    state.grid.insertBefore(state.placeholder, items[insertIndex]);
  }
}


function startMemoPageManagerDrag(item, e) {
  if (isMemoPageManagerSelectionMode || isMemoPageManagerSaving) return;

  const pageId = item.dataset.pageId;
  const fromIndex = memoPageManagerWorkingPages.findIndex((page) => page.id === pageId);
  if (fromIndex < 0) return;

  didMemoPageManagerDrag = true;

  const ghost = item.cloneNode(true);
  ghost.className = 'memo-page-manager-drag-ghost';
  ghost.style.width = `${item.offsetWidth}px`;
  ghost.style.height = `${item.offsetHeight}px`;
  document.body.appendChild(ghost);

  const placeholder = document.createElement('div');
  placeholder.className = 'memo-page-manager-drop-placeholder';
  placeholder.style.width = `${item.offsetWidth}px`;
  placeholder.style.height = `${item.offsetHeight}px`;

  item.classList.add('memo-page-manager-item--dragging');
  item.after(placeholder);

  const grid = item.closest('.memo-page-manager-grid');
  grid?.classList.add('memo-page-manager-grid--dragging');

  try {
    item.setPointerCapture(e.pointerId);
  } catch (error) {
    console.warn('[Memo] page manager pointer capture failed:', error);
  }

  memoPageManagerDragState = {
    pageId,
    fromIndex,
    insertIndex: fromIndex,
    pointerId: e.pointerId,
    item,
    ghost,
    placeholder,
    grid,
  };

  updateMemoPageManagerDragPosition(e);
  document.body.style.userSelect = 'none';
}


function endMemoPageManagerDrag(w, e) {
  const state = memoPageManagerDragState;
  if (!state) return;

  const fromIndex = state.fromIndex;
  const gridChildren = [...state.grid.children];
  let toIndex = gridChildren.indexOf(state.placeholder);
  if (toIndex < 0) toIndex = fromIndex;

  try {
    if (state.item.hasPointerCapture?.(e.pointerId)) {
      state.item.releasePointerCapture(e.pointerId);
    }
  } catch (error) {
    console.warn('[Memo] page manager pointer release failed:', error);
  }

  state.item.classList.remove('memo-page-manager-item--dragging');
  state.ghost.remove();
  state.placeholder.remove();
  state.grid.classList.remove('memo-page-manager-grid--dragging');
  document.body.style.userSelect = '';
  memoPageManagerDragState = null;

  if (fromIndex !== toIndex && memoPageManagerWorkingPages.length > 1) {
    const pages = memoPageManagerWorkingPages;
    const [movedPage] = pages.splice(fromIndex, 1);
    const adjustedIndex = toIndex > fromIndex ? toIndex - 1 : toIndex;
    pages.splice(Math.max(0, Math.min(adjustedIndex, pages.length)), 0, movedPage);
    isMemoPageManagerDirty = true;
  }

  suppressMemoPageManagerClickUntil = performance.now() + 300;
  setTimeout(() => {
    didMemoPageManagerDrag = false;
  }, 350);

  renderMemoPageManagerGrid(w);
}


function bindMemoPageManagerGridEvents(grid, w) {
  resetMemoPageManagerPointerSession();

  let longPressTimer = null;
  let pointerStart = null;
  let activePointerId = null;

  const cancelLongPress = () => {
    if (longPressTimer) {
      clearTimeout(longPressTimer);
      longPressTimer = null;
    }
  };

  const onPointerDown = (e) => {
    if (isMemoPageManagerSelectionMode || isMemoPageManagerSaving) return;
    const item = e.target.closest('.memo-page-manager-item');
    if (!item?.dataset.pageId) return;
    if (memoPageManagerDragState) return;

    activePointerId = e.pointerId;
    pointerStart = { x: e.clientX, y: e.clientY, pageId: item.dataset.pageId, item };

    cancelLongPress();
    longPressTimer = setTimeout(() => {
      longPressTimer = null;
      if (!pointerStart || pointerStart.pageId !== item.dataset.pageId) return;
      startMemoPageManagerDrag(item, e);
    }, MEMO_PAGE_MANAGER_LONG_PRESS_DELAY);
  };

  const onPointerMove = (e) => {
    if (memoPageManagerDragState && e.pointerId === memoPageManagerDragState.pointerId) {
      updateMemoPageManagerDragPosition(e);
      e.preventDefault();
      return;
    }
    if (!pointerStart || e.pointerId !== activePointerId) return;

    const dx = e.clientX - pointerStart.x;
    const dy = e.clientY - pointerStart.y;
    if (Math.hypot(dx, dy) >= MEMO_PAGE_MANAGER_DRAG_CANCEL_DISTANCE) {
      cancelLongPress();
    }
  };

  const onPointerUp = (e) => {
    if (memoPageManagerDragState && e.pointerId === memoPageManagerDragState.pointerId) {
      endMemoPageManagerDrag(w, e);
      pointerStart = null;
      activePointerId = null;
      return;
    }
    cancelLongPress();
    pointerStart = null;
    activePointerId = null;
  };

  const onPointerCancel = (e) => {
    if (memoPageManagerDragState) {
      cancelMemoPageManagerDrag();
      suppressMemoPageManagerClickUntil = performance.now() + 300;
      setTimeout(() => {
        didMemoPageManagerDrag = false;
      }, 350);
      renderMemoPageManagerGrid(w);
    }
    cancelLongPress();
    pointerStart = null;
    activePointerId = null;
  };

  grid.addEventListener('pointerdown', onPointerDown);
  grid.addEventListener('pointermove', onPointerMove);
  grid.addEventListener('pointerup', onPointerUp);
  grid.addEventListener('pointercancel', onPointerCancel);

  memoPageManagerPointerCleanup = () => {
    cancelLongPress();
    cancelMemoPageManagerDrag();
    grid.removeEventListener('pointerdown', onPointerDown);
    grid.removeEventListener('pointermove', onPointerMove);
    grid.removeEventListener('pointerup', onPointerUp);
    grid.removeEventListener('pointercancel', onPointerCancel);
  };
}


function removeDraftAddConfirmDialog() {
  dom.memoFullscreenBody?.querySelector('.memo-draft-add-dialog')?.remove();
}


function showDraftAddConfirmDialog(onConfirm) {
  if (dom.memoFullscreenBody?.querySelector('.memo-draft-add-dialog')) return;

  const overlay = document.createElement('div');
  overlay.className = 'memo-draft-add-dialog';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');

  const panel = document.createElement('div');
  panel.className = 'memo-draft-add-dialog-panel glass-panel';

  const message = document.createElement('p');
  message.className = 'memo-draft-add-dialog-message';
  message.textContent = '임시저장본을 다이어리에 추가할까요?';

  const subtitle = document.createElement('p');
  subtitle.className = 'memo-draft-add-dialog-submessage';
  subtitle.textContent = '추가 후에는 보관함에서 제거됩니다.';

  const actions = document.createElement('div');
  actions.className = 'memo-draft-add-dialog-actions';

  const cancelBtn = document.createElement('button');
  cancelBtn.type = 'button';
  cancelBtn.className = 'btn-secondary memo-draft-add-cancel';
  cancelBtn.textContent = '취소';

  const confirmBtn = document.createElement('button');
  confirmBtn.type = 'button';
  confirmBtn.className = 'btn-primary memo-draft-add-confirm';
  confirmBtn.textContent = '추가';

  actions.append(cancelBtn, confirmBtn);
  panel.append(message, subtitle, actions);
  overlay.appendChild(panel);
  dom.memoFullscreenBody?.appendChild(overlay);

  cancelBtn.addEventListener('click', () => {
    removeDraftAddConfirmDialog();
  });

  confirmBtn.addEventListener('click', () => {
    if (isDraftAddInProgress) return;
    confirmBtn.disabled = true;
    onConfirm();
  });
}


function openDraftDetail(w, draftId) {
  const memo = getActiveCreateSetupMemo(w);
  if (!initArchiveDraftGroupView(memo, draftId)) return;

  closeArchiveDraftCardMenu();
  closeArchivePopup();
  archiveAnchorPageId =
    currentPageId && memo.pages.some((page) => page.id === currentPageId) ? currentPageId : null;
  draftDetailInsertPosition = 'append-last';
  draftAddScope = archiveDraftIds.length > 1 ? 'all' : 'current';
  pageEditorDrafts.delete(w.id);
  pageEditorBaselines.delete(w.id);
  fullscreenViewMode = 'draftDetail';
  renderMemoFullscreen();
}


function openTextPageEditorForDraft(w, draftId) {
  const memo = getActiveCreateSetupMemo(w);
  const draft = findMemoDraft(memo, draftId);
  if (!memo || !draft) return;

  closeArchivePopup();
  removeDraftAddConfirmDialog();
  removeDraftAddScopeDialog();
  removeArchiveDraftDeleteDialog();
  resetArchiveDetailState();
  resetEditorSession(w.id);
  resetMemoPhotoSession(w.id);

  if (draft.sessionGroupId) {
    const groupDrafts = sortDraftGroupDrafts(memo, draft.sessionGroupId);
    const sheets = groupDrafts.map((item) => cloneMemoDraftForEditor(item, memo));
    const activeIndex = Math.max(0, groupDrafts.findIndex((item) => item.id === draftId));

    initEditorSessionWithSheets(
      w.id,
      sheets,
      {
        memoId: memo.id,
        sourceType: 'draft',
        sessionGroupId: draft.sessionGroupId,
        activeSheetIndex: activeIndex,
      },
      clonePageDraft
    );

    const activeSheet = getActiveEditorSheet(w.id);
    pageEditorDrafts.set(w.id, clonePageDraft(activeSheet));
    pageEditorBaselines.set(w.id, clonePageDraft(activeSheet));
  } else {
    const editorDraft = cloneMemoDraftForEditor(draft, memo);
    pageEditorDrafts.set(w.id, editorDraft);
    pageEditorBaselines.set(w.id, clonePageDraft(editorDraft));
    initPageEditorSession(w, editorDraft, {
      memoId: memo.id,
      sourceType: 'draft',
      sessionGroupId: draft.sessionGroupId || null,
    });
  }

  fullscreenViewMode = 'pageEditor';
  renderMemoFullscreen();
}


function removeDraftAddScopeDialog() {
  dom.memoFullscreenBody?.querySelector('.memo-draft-add-scope-dialog')?.remove();
}


function removeArchiveDraftDeleteDialog() {
  dom.memoFullscreenBody?.querySelector('.memo-draft-delete-dialog')?.remove();
}


function showDraftAddScopeDialog(onSelect) {
  if (dom.memoFullscreenBody?.querySelector('.memo-draft-add-scope-dialog')) return;

  const overlay = document.createElement('div');
  overlay.className = 'memo-draft-add-scope-dialog';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');

  const panel = document.createElement('div');
  panel.className = 'memo-draft-add-scope-dialog-panel glass-panel';

  const message = document.createElement('p');
  message.className = 'memo-draft-add-scope-dialog-message';
  message.textContent = '어떤 페이지를 추가할까요?';

  const actions = document.createElement('div');
  actions.className = 'memo-draft-add-scope-dialog-actions';

  const currentBtn = document.createElement('button');
  currentBtn.type = 'button';
  currentBtn.className = 'btn-secondary memo-draft-add-scope-current';
  currentBtn.textContent = '현재 페이지만';

  const allBtn = document.createElement('button');
  allBtn.type = 'button';
  allBtn.className = 'btn-primary memo-draft-add-scope-all';
  allBtn.textContent = '전체 페이지';

  const cancelBtn = document.createElement('button');
  cancelBtn.type = 'button';
  cancelBtn.className = 'memo-draft-add-scope-cancel';
  cancelBtn.textContent = '취소';

  actions.append(currentBtn, allBtn, cancelBtn);
  panel.append(message, actions);
  overlay.appendChild(panel);
  dom.memoFullscreenBody?.appendChild(overlay);

  cancelBtn.addEventListener('click', () => {
    removeDraftAddScopeDialog();
  });
  currentBtn.addEventListener('click', () => {
    removeDraftAddScopeDialog();
    onSelect('current');
  });
  allBtn.addEventListener('click', () => {
    removeDraftAddScopeDialog();
    onSelect('all');
  });
}


function showArchiveDraftDeleteConfirmDialog({ message, submessage, confirmLabel, onConfirm }) {
  if (dom.memoFullscreenBody?.querySelector('.memo-draft-delete-dialog')) return;

  const overlay = document.createElement('div');
  overlay.className = 'memo-draft-delete-dialog';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');

  const panel = document.createElement('div');
  panel.className = 'memo-draft-delete-dialog-panel glass-panel';

  const messageEl = document.createElement('p');
  messageEl.className = 'memo-draft-delete-dialog-message';
  messageEl.textContent = message;

  const submessageEl = document.createElement('p');
  submessageEl.className = 'memo-draft-delete-dialog-submessage';
  submessageEl.textContent = submessage;

  const actions = document.createElement('div');
  actions.className = 'memo-draft-delete-dialog-actions';

  const cancelBtn = document.createElement('button');
  cancelBtn.type = 'button';
  cancelBtn.className = 'btn-secondary memo-draft-delete-cancel';
  cancelBtn.textContent = '취소';

  const confirmBtn = document.createElement('button');
  confirmBtn.type = 'button';
  confirmBtn.className = 'btn-primary memo-draft-delete-confirm';
  confirmBtn.textContent = confirmLabel;

  actions.append(cancelBtn, confirmBtn);
  panel.append(messageEl, submessageEl, actions);
  overlay.appendChild(panel);
  dom.memoFullscreenBody?.appendChild(overlay);

  cancelBtn.addEventListener('click', () => {
    removeArchiveDraftDeleteDialog();
  });
  confirmBtn.addEventListener('click', () => {
    if (isArchiveDraftDeleting || isArchiveGroupDeleting) return;
    confirmBtn.disabled = true;
    onConfirm();
  });
}


function getArchiveDraftsToAdd(memo, scope) {
  if (scope === 'current') {
    const draftId = archiveDraftIds[archiveDraftActiveIndex] ?? archiveDraftId;
    const draft = findMemoDraft(memo, draftId);
    return draft ? [draft] : [];
  }

  if (archiveDraftGroupId) {
    return sortDraftGroupDrafts(memo, archiveDraftGroupId);
  }

  const draftId = archiveDraftIds[archiveDraftActiveIndex] ?? archiveDraftId;
  const draft = findMemoDraft(memo, draftId);
  return draft ? [draft] : [];
}


function addDraftToDiary(w) {
  if (isDraftAddInProgress || isArchiveGroupAdding) return;

  const context = resolveArchiveDraftContext(w);
  if (!context) {
    showToast('다이어리가 변경되어 추가할 수 없습니다.');
    resetArchiveDetailState();
    removeDraftAddConfirmDialog();
    fullscreenViewMode = 'createSetup';
    renderMemoFullscreen();
    return;
  }

  const { memo, draft, draftId } = context;

  if (!memo.drafts.some((item) => item.id === draftId)) {
    console.warn('[Memo] draft already removed, skipping duplicate add:', draftId);
    showToast('이미 처리된 임시저장본입니다.');
    resetArchiveDetailState();
    removeDraftAddConfirmDialog();
    fullscreenViewMode = 'createSetup';
    renderMemoFullscreen();
    return;
  }

  isDraftAddInProgress = true;
  isArchiveGroupAdding = true;
  syncDraftDetailInsertUi();

  try {
    const now = new Date().toISOString();
    const draftsToAdd = getArchiveDraftsToAdd(memo, draftAddScope);
    if (!draftsToAdd.length) {
      throw new Error('No drafts to add');
    }

    let insertPosition = normalizeDraftInsertPosition(draftDetailInsertPosition);
    let anchorPageId = archiveAnchorPageId;

    if (
      (insertPosition === 'before-current' || insertPosition === 'after-current')
      && (!anchorPageId || !memo.pages.some((page) => page.id === anchorPageId))
    ) {
      console.info('[Memo] archive anchor page missing, falling back to append-last');
      insertPosition = 'append-last';
      anchorPageId = null;
    }

    const pagesBefore = memo.pages.length;
    let firstAddedPageId = null;
    let lastPageId = null;

    draftsToAdd.forEach((item, index) => {
      const newPage = buildPageFromMemoDraft(item, now);
      const position = index === 0 ? insertPosition : 'after-current';
      const anchor = index === 0 ? anchorPageId : lastPageId;
      memo.pages = insertPageByPosition(memo.pages, newPage, position, anchor);
      if (index === 0) firstAddedPageId = newPage.id;
      lastPageId = newPage.id;
    });

    if (memo.pages.length !== pagesBefore + draftsToAdd.length) {
      throw new Error('Page insertion failed');
    }

    recomputeMemoDiarySummary(memo);
    memo.updatedAt = now;

    const removedDraftIds = draftsToAdd.map((item) => item.id);
    const imageIdsForCleanup = removedDraftIds.flatMap((id) => {
      const item = findMemoDraft(memo, id);
      return collectDraftImageIds(item);
    });

    saveMemoData();

    if (draftAddScope === 'all' && archiveDraftGroupId) {
      memo.drafts = memo.drafts.filter((item) => item.sessionGroupId !== archiveDraftGroupId);
    } else {
      removedDraftIds.forEach((id) => {
        removeMemoDraftById(memo, id);
      });
      if (archiveDraftGroupId) {
        recomputeDraftGroupMeta(memo, archiveDraftGroupId);
      }
    }

    saveMemoData();
    Promise.all(
      [...new Set(imageIdsForCleanup)].map((imageId) => deleteMemoImageIfUnreferenced(imageId, w))
    ).catch((error) => {
      console.warn('[Memo] draft image cleanup after add failed:', error);
    });

    currentPageId = lastPageId;
    currentDiaryId = memo.id;
    refreshMemoPreview(w.id);

    resetArchiveDetailState();
    removeDraftAddConfirmDialog();
    fullscreenViewMode = 'createSetup';
    renderMemoFullscreen();
    showToast(
      draftsToAdd.length > 1
        ? `${draftsToAdd.length}페이지를 다이어리에 추가했습니다.`
        : '다이어리에 추가했습니다.'
    );
  } catch (error) {
    console.error('[Memo] addDraftToDiary failed:', error);
    showToast('다이어리에 추가하지 못했습니다.');
    const confirmBtn = dom.memoFullscreenBody?.querySelector('.memo-draft-add-confirm');
    if (confirmBtn) confirmBtn.disabled = false;
  } finally {
    isDraftAddInProgress = false;
    isArchiveGroupAdding = false;
    syncDraftDetailInsertUi();
  }
}


async function deleteCurrentArchiveDraftPage(w) {
  if (isArchiveDraftDeleting || isArchiveGroupDeleting || isDraftAddInProgress) return;

  const context = resolveArchiveDraftContext(w);
  if (!context) return;

  const { memo, draftId } = context;
  const draft = findMemoDraft(memo, draftId);
  if (!draft) return;

  isArchiveDraftDeleting = true;
  syncDraftDetailInsertUi();

  try {
    const removedGroupId = draft.sessionGroupId ?? null;
    const imageIdsForCleanup = collectDraftImageIds(draft);
    removeMemoDraftById(memo, draftId);
    if (removedGroupId) {
      recomputeDraftGroupMeta(memo, removedGroupId);
    }

    memo.updatedAt = new Date().toISOString();
    saveMemoData();
    await Promise.all(
      imageIdsForCleanup.map((imageId) => deleteMemoImageIfUnreferenced(imageId, w))
    );

    archiveDraftIds = archiveDraftIds.filter((id) => id !== draftId);
    if (archiveDraftGroupId) {
      const remaining = sortDraftGroupDrafts(memo, archiveDraftGroupId);
      if (remaining.length) {
        archiveDraftIds = remaining.map((item) => item.id);
      }
    }
    if (!archiveDraftIds.length) {
      removeArchiveDraftDeleteDialog();
      resetArchiveDetailState();
      fullscreenViewMode = 'createSetup';
      renderMemoFullscreen();
      showToast('임시저장본을 삭제했습니다.');
      return;
    }

    if (archiveDraftActiveIndex >= archiveDraftIds.length) {
      archiveDraftActiveIndex = archiveDraftIds.length - 1;
    }
    archiveDraftId = archiveDraftIds[archiveDraftActiveIndex];
    removeArchiveDraftDeleteDialog();
    renderMemoFullscreen();
    showToast('임시저장본을 삭제했습니다.');
  } catch (error) {
    console.error('[Memo] deleteCurrentArchiveDraftPage failed:', error);
    showToast('삭제하지 못했습니다.');
    removeArchiveDraftDeleteDialog();
  } finally {
    isArchiveDraftDeleting = false;
    syncDraftDetailInsertUi();
  }
}


async function deleteArchiveDraftGroup(w) {
  if (isArchiveDraftDeleting || isArchiveGroupDeleting || isDraftAddInProgress) return;

  const memo = findSharedMemoById(archiveMemoId);
  if (!memo?.id) return;

  const draftIdsToRemove =
    archiveDraftGroupId && archiveDraftIds.length > 1
      ? [...archiveDraftIds]
      : [archiveDraftIds[archiveDraftActiveIndex] ?? archiveDraftId].filter(Boolean);

  if (!draftIdsToRemove.length) return;

  isArchiveGroupDeleting = true;
  syncDraftDetailInsertUi();

  try {
    const draftsToRemove = draftIdsToRemove
      .map((id) => findMemoDraft(memo, id))
      .filter(Boolean);
    const imageIdsForCleanup = draftsToRemove.flatMap((item) => collectDraftImageIds(item));

    if (archiveDraftGroupId && archiveDraftIds.length > 1) {
      memo.drafts = memo.drafts.filter((item) => item.sessionGroupId !== archiveDraftGroupId);
    } else {
      draftIdsToRemove.forEach((id) => {
        removeMemoDraftById(memo, id);
      });
    }

    memo.updatedAt = new Date().toISOString();
    saveMemoData();
    await Promise.all(
      [...new Set(imageIdsForCleanup)].map((imageId) => deleteMemoImageIfUnreferenced(imageId, w))
    );

    removeArchiveDraftDeleteDialog();
    resetArchiveDetailState();
    fullscreenViewMode = 'createSetup';
    renderMemoFullscreen();
    showToast('임시저장본을 삭제했습니다.');
  } catch (error) {
    console.error('[Memo] deleteArchiveDraftGroup failed:', error);
    showToast('삭제하지 못했습니다.');
    removeArchiveDraftDeleteDialog();
  } finally {
    isArchiveGroupDeleting = false;
    syncDraftDetailInsertUi();
  }
}


function navigateArchiveDraftDetail(delta) {
  if (!archiveDraftIds.length) return;
  const nextIndex = archiveDraftActiveIndex + delta;
  if (nextIndex < 0 || nextIndex >= archiveDraftIds.length) return;
  archiveDraftActiveIndex = nextIndex;
  archiveDraftId = archiveDraftIds[nextIndex];
  renderMemoFullscreen();
}


function syncDraftDetailInsertUi() {
  const root = dom.memoFullscreenBody;
  if (!root) return;

  draftDetailInsertPosition = normalizeDraftInsertPosition(draftDetailInsertPosition);

  root.querySelectorAll('.memo-draft-insert-option').forEach((btn) => {
    const selected = btn.dataset.insertPosition === draftDetailInsertPosition;
    btn.setAttribute('aria-pressed', selected ? 'true' : 'false');
    btn.textContent = btn.dataset.insertLabel ?? '';
  });

  const isBusy =
    isDraftAddInProgress || isArchiveDraftDeleting || isArchiveGroupDeleting || isArchiveGroupAdding;

  root.querySelectorAll(
    '.memo-draft-detail-add, .memo-draft-detail-continue, .memo-draft-detail-add-current, .memo-draft-detail-delete-current, .memo-draft-detail-delete-all, .memo-draft-detail-nav-prev, .memo-draft-detail-nav-next'
  ).forEach((btn) => {
    btn.disabled = isBusy;
  });

  const confirmBtn = root.querySelector('.memo-draft-add-confirm');
  if (confirmBtn) {
    confirmBtn.disabled = isBusy;
  }

  const navLabel = root.querySelector('.memo-draft-detail-nav-label');
  if (navLabel && archiveDraftIds.length) {
    navLabel.textContent = `${archiveDraftActiveIndex + 1} / ${archiveDraftIds.length}`;
  }

  const prevBtn = root.querySelector('.memo-draft-detail-nav-prev');
  if (prevBtn) {
    prevBtn.disabled = isBusy || archiveDraftActiveIndex <= 0;
  }
  const nextBtn = root.querySelector('.memo-draft-detail-nav-next');
  if (nextBtn) {
    nextBtn.disabled = isBusy || archiveDraftActiveIndex >= archiveDraftIds.length - 1;
  }
}


function renderDraftDetail(container, w) {
  const context = resolveArchiveDraftContext(w);
  if (!context) {
    showToast('임시저장본을 불러올 수 없습니다.');
    resetArchiveDetailState();
    fullscreenViewMode = 'createSetup';
    renderMemoFullscreen();
    return;
  }

  const { draft } = context;
  const isGroupDraft = archiveDraftIds.length > 1;

  const shell = document.createElement('div');
  shell.className = 'memo-draft-detail-shell';

  const header = document.createElement('header');
  header.className = 'memo-draft-detail-header';

  const backBtn = document.createElement('button');
  backBtn.type = 'button';
  backBtn.className = 'memo-draft-detail-back';
  backBtn.textContent = '←';
  backBtn.setAttribute('aria-label', '보관함으로');

  const titleLabel = document.createElement('span');
  titleLabel.className = 'memo-draft-detail-title-label';
  titleLabel.textContent = '임시저장본';

  header.append(backBtn, titleLabel);

  let nav = null;
  if (isGroupDraft) {
    nav = document.createElement('div');
    nav.className = 'memo-draft-detail-nav';
    nav.setAttribute('role', 'group');
    nav.setAttribute('aria-label', '임시저장 페이지 이동');

    const prevBtn = document.createElement('button');
    prevBtn.type = 'button';
    prevBtn.className = 'memo-draft-detail-nav-prev';
    prevBtn.textContent = '‹ 이전 페이지';
    prevBtn.disabled = archiveDraftActiveIndex <= 0;

    const navLabel = document.createElement('span');
    navLabel.className = 'memo-draft-detail-nav-label';
    navLabel.textContent = `${archiveDraftActiveIndex + 1} / ${archiveDraftIds.length}`;

    const nextBtn = document.createElement('button');
    nextBtn.type = 'button';
    nextBtn.className = 'memo-draft-detail-nav-next';
    nextBtn.textContent = '다음 페이지 ›';
    nextBtn.disabled = archiveDraftActiveIndex >= archiveDraftIds.length - 1;

    nav.append(prevBtn, navLabel, nextBtn);
  }

  const body = document.createElement('div');
  body.className = 'memo-draft-detail-body';

  const sheet = document.createElement('article');
  sheet.className = 'memo-binder-sheet memo-draft-detail-sheet';
  if (isPageContinuation(draft)) {
    sheet.classList.add('memo-binder-sheet--continuation');
  }

  if (!isPageContinuation(draft)) {
    const dateEl = document.createElement('p');
    dateEl.className = 'memo-binder-sheet-date sheet-date';
    dateEl.textContent = formatPageDateDisplay(draft.date);

    const titleEl = document.createElement('h3');
    titleEl.className = 'memo-binder-sheet-title sheet-title';
    titleEl.textContent = draft.title || '제목 없음';

    const divider = document.createElement('hr');
    divider.className = 'memo-binder-sheet-divider sheet-divider';
    divider.setAttribute('aria-hidden', 'true');

    const contentEl = document.createElement('div');
    contentEl.className = 'memo-binder-sheet-content sheet-content memo-sheet-read-content';
    renderMemoPageContentIntoElement(contentEl, sanitizeDraftContent(draft.content));

    sheet.append(dateEl, titleEl, divider, contentEl);
  } else {
    const contentEl = document.createElement('div');
    contentEl.className =
      'memo-binder-sheet-content sheet-content memo-sheet-read-content memo-binder-sheet-content--continuation';
    renderMemoPageContentIntoElement(contentEl, sanitizeDraftContent(draft.content));
    sheet.appendChild(contentEl);
  }

  body.appendChild(sheet);

  const insertSection = document.createElement('div');
  insertSection.className = 'memo-draft-insert-section';
  insertSection.setAttribute('role', 'group');
  insertSection.setAttribute('aria-label', '삽입 위치');

  const insertTitle = document.createElement('p');
  insertTitle.className = 'memo-draft-insert-title';
  insertTitle.textContent = '삽입 위치';

  const insertRow = document.createElement('div');
  insertRow.className = 'memo-draft-insert-row';

  DRAFT_INSERT_POSITION_OPTIONS.forEach((opt) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'memo-draft-insert-option';
    btn.dataset.insertPosition = opt.id;
    btn.dataset.insertLabel = opt.label;
    insertRow.appendChild(btn);
  });

  insertSection.append(insertTitle, insertRow);

  const actions = document.createElement('div');
  actions.className = 'memo-draft-detail-actions';

  if (isGroupDraft) {
    const currentSection = document.createElement('div');
    currentSection.className = 'memo-draft-detail-action-section';
    const currentLabel = document.createElement('p');
    currentLabel.className = 'memo-draft-detail-action-label';
    currentLabel.textContent = '현재 페이지';

    const addCurrentBtn = document.createElement('button');
    addCurrentBtn.type = 'button';
    addCurrentBtn.className = 'btn-secondary memo-draft-detail-add-current';
    addCurrentBtn.textContent = '현재 페이지만 추가';

    const deleteCurrentBtn = document.createElement('button');
    deleteCurrentBtn.type = 'button';
    deleteCurrentBtn.className = 'btn-secondary memo-draft-detail-delete-current memo-draft-detail-delete-current--danger';
    deleteCurrentBtn.textContent = '현재 페이지 삭제';

    currentSection.append(currentLabel, addCurrentBtn, deleteCurrentBtn);

    const groupSection = document.createElement('div');
    groupSection.className = 'memo-draft-detail-action-section';
    const groupLabel = document.createElement('p');
    groupLabel.className = 'memo-draft-detail-action-label';
    groupLabel.textContent = '전체 임시저장본';

    const continueBtn = document.createElement('button');
    continueBtn.type = 'button';
    continueBtn.className = 'btn-secondary memo-draft-detail-continue';
    continueBtn.textContent = '전체 계속 작성';

    const addBtn = document.createElement('button');
    addBtn.type = 'button';
    addBtn.className = 'btn-primary memo-draft-detail-add';
    addBtn.textContent = '전체 페이지 추가';

    const deleteAllBtn = document.createElement('button');
    deleteAllBtn.type = 'button';
    deleteAllBtn.className = 'btn-secondary memo-draft-detail-delete-all memo-draft-detail-delete-all--danger';
    deleteAllBtn.textContent = '전체 삭제';

    groupSection.append(groupLabel, continueBtn, addBtn, deleteAllBtn);
    actions.append(currentSection, groupSection);
  } else {
    const continueBtn = document.createElement('button');
    continueBtn.type = 'button';
    continueBtn.className = 'btn-secondary memo-draft-detail-continue';
    continueBtn.textContent = '계속 작성';

    const addBtn = document.createElement('button');
    addBtn.type = 'button';
    addBtn.className = 'btn-primary memo-draft-detail-add';
    addBtn.textContent = '페이지 추가';

    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = 'btn-secondary memo-draft-detail-delete-all memo-draft-detail-delete-all--danger';
    deleteBtn.textContent = '삭제';

    actions.append(continueBtn, addBtn, deleteBtn);
  }

  if (nav) {
    shell.append(header, nav, body, insertSection, actions);
  } else {
    shell.append(header, body, insertSection, actions);
  }
  container.appendChild(shell);
  syncDraftDetailInsertUi();
}


function insertPageByPosition(pages, newPage, insertPosition, anchorPageId) {
  const next = [...pages];
  if (next.length === 0) {
    next.push(newPage);
    return next;
  }

  let insertIndex = next.length;
  if (anchorPageId) {
    const currentIndex = next.findIndex((p) => p.id === anchorPageId);
    if (currentIndex >= 0) {
      if (insertPosition === 'before-current') insertIndex = currentIndex;
      else if (insertPosition === 'after-current') insertIndex = currentIndex + 1;
      else if (insertPosition === 'append-last') insertIndex = next.length;
    }
  }

  next.splice(insertIndex, 0, newPage);
  return next;
}


function getActiveCreateSetupMemo(w) {
  ensureMemoWidgetData(w);
  if (currentDiaryId) {
    return findSharedMemoById(currentDiaryId);
  }
  if (currentPageId) {
    return getSharedMemos().find((m) => m.pages.some((p) => p.id === currentPageId)) ?? null;
  }
  return null;
}


function findMemoContainingPage(w, pageId) {
  ensureMemoWidgetData(w);
  return getSharedMemos().find((m) => m.pages.some((p) => p.id === pageId)) ?? null;
}


function openTextPageEditorNew(w, sheetDraft) {
  resetEditorSession(w.id);
  resetMemoPhotoSession(w.id);
  const memo = getActiveCreateSetupMemo(w);
  const draft = {
    pageId: null,
    draftId: null,
    templateId: normalizeMemoTemplateId(sheetDraft.selectedTemplateId),
    memoCategoryId: memo ? normalizeMemoCategoryId(memo.category) : '',
    date: getLocalDateInputValue(),
    title: '',
    content: '',
    insertPosition: sheetDraft.insertPosition ?? 'after-current',
    isTemporary: false,
    isContinuation: false,
  };
  pageEditorDrafts.set(w.id, draft);
  pageEditorBaselines.set(w.id, clonePageDraft(draft));
  initPageEditorSession(w, draft, { memoId: memo?.id ?? null, sourceType: 'new' });
  fullscreenViewMode = 'pageEditor';
  renderMemoFullscreen();
}


function openTextPageEditorForPage(w, pageId) {
  const memo = findMemoContainingPage(w, pageId);
  const page = memo?.pages.find((p) => p.id === pageId);
  if (!memo || !page) return;

  resetEditorSession(w.id);
  resetMemoPhotoSession(w.id);
  removeMemoPhotoDialogs(dom.memoFullscreenBody);
  registerPageEditorBaselineRefresher(w, null);

  currentDiaryId = memo.id;
  currentPageId = pageId;

  const draft = {
    pageId: page.id,
    draftId: null,
    templateId: normalizeMemoTemplateId(page.templateId),
    memoCategoryId: normalizeMemoCategoryId(memo.category),
    date: isPageContinuation(page) ? '' : page.date || getLocalDateInputValue(),
    title: isPageContinuation(page) ? '' : page.title === '제목 없음' ? '' : page.title ?? '',
    content: page.content ?? '',
    insertPosition: 'after-current',
    isTemporary: false,
    isContinuation: isPageContinuation(page),
  };
  pageEditorDrafts.set(w.id, draft);
  pageEditorBaselines.set(w.id, clonePageDraft(draft));
  initPageEditorSession(w, draft, { memoId: memo.id, sourceType: 'page' });
  fullscreenViewMode = 'pageEditor';
  renderMemoFullscreen();
}


function syncPageEditorDraftFromForm(w) {
  const root = dom.memoFullscreenBody;
  if (!root) return;

  const contentInput = root.querySelector('.memo-text-page-content');
  if (!contentInput) return;

  const current = pageEditorDrafts.get(w.id);
  if (!current) return;

  let updated;
  if (isPageContinuation(current)) {
    updated = {
      ...current,
      date: '',
      title: '',
      content: getRichEditorContentHtml(contentInput),
    };
  } else {
    const dateInput = root.querySelector('.memo-text-page-date');
    const titleInput = root.querySelector('.memo-text-page-title');
    if (!dateInput || !titleInput) return;

    updated = {
      ...current,
      date: dateInput.value,
      title: titleInput.value,
      content: getRichEditorContentHtml(contentInput),
    };
  }

  pageEditorDrafts.set(w.id, updated);
  if (getEditorSession(w.id)) {
    syncCurrentDraftIntoSession(w.id, updated, clonePageDraft);
  }
}


function clearMemoEditorSavedAlignmentRange() {
  memoEditorSavedAlignmentRange = null;
}


function getActivePageEditorContentEditor() {
  return dom.memoFullscreenBody?.querySelector('.memo-text-page-content') ?? null;
}


function saveMemoEditorAlignmentRange(contentEditor, event) {
  clearMemoEditorSavedAlignmentRange();
  if (!contentEditor) return;

  const sel = document.getSelection();
  if (!sel || sel.rangeCount === 0) return;

  const range = sel.getRangeAt(0);
  if (range.collapsed) return;
  if (!isRangeWithinContentEditor(range, contentEditor)) return;

  memoEditorSavedAlignmentRange = range.cloneRange();
  if (event?.type === 'pointerdown' || event?.type === 'mousedown') {
    event.preventDefault();
  }
}


function isNodeWithinContentEditor(node, contentEditor) {
  if (!node || !contentEditor) return false;
  const element = node.nodeType === Node.TEXT_NODE ? node.parentElement : node;
  return Boolean(element && contentEditor.contains(element));
}


function isRangeWithinContentEditor(range, contentEditor) {
  if (!range || !contentEditor) return false;
  return (
    isNodeWithinContentEditor(range.startContainer, contentEditor)
    && isNodeWithinContentEditor(range.endContainer, contentEditor)
  );
}


function restoreMemoEditorAlignmentRange(contentEditor) {
  if (!contentEditor || !memoEditorSavedAlignmentRange) return false;
  if (!isRangeWithinContentEditor(memoEditorSavedAlignmentRange, contentEditor)) {
    clearMemoEditorSavedAlignmentRange();
    return false;
  }

  const sel = document.getSelection();
  if (!sel) return false;

  sel.removeAllRanges();
  sel.addRange(memoEditorSavedAlignmentRange);
  return true;
}


function wrapMemoEditorDirectTextNode(textNode, contentEditor) {
  if (!textNode || textNode.nodeType !== Node.TEXT_NODE) return null;
  if (textNode.parentElement !== contentEditor) return null;
  const text = (textNode.textContent ?? '').replace(/\u00a0/g, ' ');
  if (!text.trim()) return null;

  const wrapper = document.createElement('div');
  contentEditor.insertBefore(wrapper, textNode);
  wrapper.appendChild(textNode);
  return wrapper;
}


function ensureMemoEditorDirectTextNodesWrapped(contentEditor) {
  if (!contentEditor) return;

  [...contentEditor.childNodes].forEach((node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      wrapMemoEditorDirectTextNode(node, contentEditor);
    }
  });
}


function doesRangeIntersectNode(range, node) {
  if (!range || !node) return false;
  try {
    return range.intersectsNode(node);
  } catch {
    try {
      const nodeRange = document.createRange();
      nodeRange.selectNodeContents(node);
      return (
        range.compareBoundaryPoints(Range.END_TO_START, nodeRange) < 0
        && range.compareBoundaryPoints(Range.START_TO_END, nodeRange) > 0
      );
    } catch {
      return false;
    }
  }
}


function dedupeMemoEditorAlignBlocks(blocks, contentEditor) {
  const unique = [...new Set(blocks)];
  const set = new Set(unique);

  const withoutListContainers = unique.filter((el) => {
    if (el.tagName !== 'UL' && el.tagName !== 'OL') return true;
    return ![...set].some((other) => other.tagName === 'LI' && el.contains(other));
  });

  return withoutListContainers.filter((el) => {
    for (const other of set) {
      if (other !== el && el.contains(other)) return false;
    }
    return true;
  });
}


function isMemoEditorAlignBlockElement(el, contentEditor) {
  if (!el || el.nodeType !== Node.ELEMENT_NODE || !contentEditor.contains(el)) return false;
  if (el.classList.contains(MEMO_PHOTO_BLOCK_CLASS)) return true;
  return MEMO_EDITOR_ALIGNABLE_BLOCK_TAGS.has(el.tagName.toLowerCase());
}


function findMemoEditorAlignBlock(node, contentEditor) {
  let current = node;
  if (current?.nodeType === Node.TEXT_NODE) current = current.parentElement;
  while (current && current !== contentEditor) {
    if (isMemoEditorAlignBlockElement(current, contentEditor)) return current;
    current = current.parentElement;
  }
  return null;
}


function collectMemoEditorAlignBlocksInRange(range, contentEditor) {
  if (!range || range.collapsed || !contentEditor) return [];

  ensureMemoEditorDirectTextNodesWrapped(contentEditor);

  const blocks = new Set();
  const candidates = contentEditor.querySelectorAll(
    `div, p, ul, ol, li, .${MEMO_PHOTO_BLOCK_CLASS}`
  );
  candidates.forEach((el) => {
    if (!isMemoEditorAlignBlockElement(el, contentEditor)) return;
    if (doesRangeIntersectNode(range, el)) blocks.add(el);
  });

  return dedupeMemoEditorAlignBlocks([...blocks], contentEditor);
}


function getMemoEditorAlignBlocksFromRangeWithFallback(range, contentEditor) {
  if (!range || range.collapsed || !isRangeWithinContentEditor(range, contentEditor)) {
    return [];
  }

  ensureMemoEditorDirectTextNodesWrapped(contentEditor);

  let blocks = collectMemoEditorAlignBlocksInRange(range, contentEditor);
  if (blocks.length) return blocks;

  const startBlock = findMemoEditorAlignBlock(range.startContainer, contentEditor);
  const endBlock = findMemoEditorAlignBlock(range.endContainer, contentEditor);
  blocks = [startBlock, endBlock].filter(Boolean);
  return dedupeMemoEditorAlignBlocks(blocks, contentEditor);
}


function getMemoEditorSelectedPhotoBlock(contentEditor) {
  if (!contentEditor) return null;
  return contentEditor.querySelector(`.${MEMO_PHOTO_BLOCK_CLASS}.${MEMO_PHOTO_SELECTED_CLASS}`);
}


function getMemoEditorTopLevelAlignBlocks(contentEditor) {
  if (!contentEditor) return [];

  ensureMemoEditorDirectTextNodesWrapped(contentEditor);

  const blocks = [];
  contentEditor.childNodes.forEach((node) => {
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    if (isMemoEditorAlignBlockElement(node, contentEditor)) {
      blocks.push(node);
    }
  });
  return blocks;
}


function getMemoEditorAlignBlocksFromSavedOrLiveRange(contentEditor) {
  if (
    memoEditorSavedAlignmentRange
    && !memoEditorSavedAlignmentRange.collapsed
    && isRangeWithinContentEditor(memoEditorSavedAlignmentRange, contentEditor)
  ) {
    const savedBlocks = getMemoEditorAlignBlocksFromRangeWithFallback(
      memoEditorSavedAlignmentRange,
      contentEditor
    );
    if (savedBlocks.length) return savedBlocks;
    return [];
  }

  const sel = document.getSelection();
  if (sel?.rangeCount) {
    const range = sel.getRangeAt(0);
    if (!range.collapsed && isRangeWithinContentEditor(range, contentEditor)) {
      const liveBlocks = getMemoEditorAlignBlocksFromRangeWithFallback(range, contentEditor);
      if (liveBlocks.length) return liveBlocks;
      return [];
    }
  }

  return null;
}


function getMemoEditorAlignApplyTargets(contentEditor) {
  if (!contentEditor) return [];

  const rangeBlocks = getMemoEditorAlignBlocksFromSavedOrLiveRange(contentEditor);
  if (rangeBlocks !== null) return rangeBlocks;

  const selectedPhoto = getMemoEditorSelectedPhotoBlock(contentEditor);
  if (selectedPhoto) return [selectedPhoto];

  return getMemoEditorTopLevelAlignBlocks(contentEditor);
}


function getMemoEditorAlignMenuPreviewTargets(contentEditor) {
  if (!contentEditor) return [];

  const rangeBlocks = getMemoEditorAlignBlocksFromSavedOrLiveRange(contentEditor);
  if (rangeBlocks?.length) return rangeBlocks;

  const selectedPhoto = getMemoEditorSelectedPhotoBlock(contentEditor);
  if (selectedPhoto) return [selectedPhoto];

  const sel = document.getSelection();
  if (sel?.rangeCount) {
    const block = findMemoEditorAlignBlock(sel.getRangeAt(0).startContainer, contentEditor);
    if (block) return [block];
  }

  return getMemoEditorTopLevelAlignBlocks(contentEditor);
}


function readMemoEditorAlignState(targets) {
  const aligns = new Set();
  targets.forEach((el) => {
    MEMO_EDITOR_ALIGN_CLASSES.forEach((cls) => {
      if (el.classList.contains(cls)) aligns.add(cls.slice('memo-align-'.length));
    });
  });
  return aligns.size === 1 ? [...aligns][0] : null;
}


function removeMemoEditorAlignMenu() {
  dom.memoFullscreenBody?.querySelector('.memo-editor-align-menu')?.remove();
  if (memoEditorAlignOutsideClickHandler) {
    document.removeEventListener('click', memoEditorAlignOutsideClickHandler, true);
    memoEditorAlignOutsideClickHandler = null;
  }
  isMemoEditorAlignMenuOpen = false;
}


function closeMemoEditorAlignMenu() {
  removeMemoEditorAlignMenu();
  clearMemoEditorSavedAlignmentRange();
}


function positionMemoEditorAlignMenu(menu, anchorBtn) {
  if (!menu || !anchorBtn) return;

  const margin = 8;
  const rect = anchorBtn.getBoundingClientRect();
  const menuWidth = menu.offsetWidth;
  const menuHeight = menu.offsetHeight;

  let left = rect.left + rect.width / 2 - menuWidth / 2;
  left = Math.max(margin, Math.min(left, window.innerWidth - menuWidth - margin));

  let top = rect.top - menuHeight - margin;
  if (top < margin) top = rect.bottom + margin;

  menu.style.position = 'fixed';
  menu.style.left = `${left}px`;
  menu.style.top = `${top}px`;
  menu.style.zIndex = '26';
}


function openMemoEditorAlignMenu(w, anchorBtn) {
  const shell = dom.memoFullscreenBody?.querySelector('.memo-text-page-shell');
  const contentEditor = getActivePageEditorContentEditor();
  if (!shell || !contentEditor || !anchorBtn) return;

  removeMemoEditorAlignMenu();

  const previewTargets = getMemoEditorAlignMenuPreviewTargets(contentEditor);
  const currentAlign = readMemoEditorAlignState(previewTargets);

  const menu = document.createElement('div');
  menu.className = 'memo-editor-align-menu glass-panel';
  menu.setAttribute('role', 'menu');
  menu.setAttribute('aria-label', '본문 정렬');

  [
    { id: 'left', label: '왼쪽 정렬' },
    { id: 'center', label: '가운데 정렬' },
    { id: 'right', label: '오른쪽 정렬' },
  ].forEach(({ id, label }) => {
    const option = document.createElement('button');
    option.type = 'button';
    option.className = 'memo-editor-align-option';
    option.dataset.align = id;
    option.setAttribute('role', 'menuitemradio');
    option.textContent = label;
    option.setAttribute('aria-checked', currentAlign === id ? 'true' : 'false');
    if (currentAlign === id) option.classList.add('memo-editor-align-option--selected');
    menu.appendChild(option);
  });

  shell.appendChild(menu);
  isMemoEditorAlignMenuOpen = true;

  requestAnimationFrame(() => {
    positionMemoEditorAlignMenu(menu, anchorBtn);
  });

  memoEditorAlignOutsideClickHandler = (e) => {
    if (
      e.target.closest('.memo-editor-align-menu')
      || e.target.closest('.memo-text-page-tool[data-tool-id="align"]')
    ) {
      return;
    }
    closeMemoEditorAlignMenu();
  };
  setTimeout(() => {
    document.addEventListener('click', memoEditorAlignOutsideClickHandler, true);
  }, 0);
}


function toggleMemoEditorAlignMenu(w, anchorBtn) {
  if (isMemoEditorAlignMenuOpen) {
    closeMemoEditorAlignMenu();
    return;
  }
  openMemoEditorAlignMenu(w, anchorBtn);
}


function applyMemoEditorAlignment(align, w) {
  if (!['left', 'center', 'right'].includes(align)) return;

  const contentEditor = getActivePageEditorContentEditor();
  if (!contentEditor) {
    removeMemoEditorAlignMenu();
    clearMemoEditorSavedAlignmentRange();
    return;
  }

  const targets = getMemoEditorAlignApplyTargets(contentEditor);
  if (!targets.length) {
    removeMemoEditorAlignMenu();
    clearMemoEditorSavedAlignmentRange();
    return;
  }

  const alignClass = `memo-align-${align}`;
  targets.forEach((el) => {
    MEMO_EDITOR_ALIGN_CLASSES.forEach((cls) => el.classList.remove(cls));
    el.classList.add(alignClass);
  });

  syncPageEditorDraftFromForm(w);
  restoreMemoEditorAlignmentRange(contentEditor);
  clearMemoEditorSavedAlignmentRange();
  removeMemoEditorAlignMenu();
  contentEditor.focus();
}


function shouldShowPageEditorLeaveDialog(w) {
  syncPageEditorDraftFromForm(w);
  const draft = pageEditorDrafts.get(w.id);
  if (!draft) return false;

  const sessionSheets = getSessionSheetsForEditor(w);
  if (sessionSheets.some((sheet) => memoHtmlHasVisibleContent(sheet.content) || (sheet.title || '').trim())) {
    return true;
  }

  if ((draft.title || '').trim() || memoHtmlHasVisibleContent(draft.content)) {
    return true;
  }

  return isPageEditorDirty(w);
}


function exitPageEditorToCreateSetup(w) {
  closeMemoEditorAlignMenu();
  removePageEditorLeaveDialog();
  removeMemoPhotoDialogs(dom.memoFullscreenBody);
  removeSheetOverflowDialogs(dom.memoFullscreenBody);
  resetMemoPhotoSession(w.id);
  resetEditorSession(w.id);
  registerPageEditorBaselineRefresher(w, null);
  pageEditorDrafts.delete(w.id);
  pageEditorBaselines.delete(w.id);
  fullscreenViewMode = 'createSetup';
  renderMemoFullscreen();
}


function insertEditorDraftAsPage(memo, sheetDraft, anchorPageId, now) {
  const pageTitle = pageTitleForSave(sheetDraft);
  const pageDate = pageDateForSave(sheetDraft);
  const newPage = stripPageSessionMeta({
    id: crypto.randomUUID(),
    templateId: normalizeMemoTemplateId(sheetDraft.templateId),
    category: '',
    date: pageDate,
    title: pageTitle,
    isContinuation: isPageContinuation(sheetDraft),
    content: sanitizeMemoHtml(sheetDraft.content ?? ''),
    createdAt: now,
    updatedAt: now,
  });
  memo.pages = insertPageByPosition(
    memo.pages,
    newPage,
    sheetDraft.insertPosition ?? 'after-current',
    anchorPageId
  );
  return newPage.id;
}


function removePageEditorLeaveDialog() {
  dom.memoFullscreenBody?.querySelector('.memo-page-leave-dialog')?.remove();
}


function showPageEditorLeaveDialog() {
  removePageEditorLeaveDialog();

  const overlay = document.createElement('div');
  overlay.className = 'memo-page-leave-dialog';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');

  const panel = document.createElement('div');
  panel.className = 'memo-page-leave-dialog-panel glass-panel';

  const message = document.createElement('p');
  message.className = 'memo-page-leave-dialog-message';
  message.textContent = '작성 중인 페이지를 어떻게 할까요?';

  const actions = document.createElement('div');
  actions.className = 'memo-page-leave-dialog-actions';

  const tempBtn = document.createElement('button');
  tempBtn.type = 'button';
  tempBtn.className = 'btn-primary memo-page-leave-temp';
  tempBtn.textContent = '임시저장';

  const discardBtn = document.createElement('button');
  discardBtn.type = 'button';
  discardBtn.className = 'btn-secondary memo-page-leave-discard';
  discardBtn.textContent = '저장하지 않고 나가기';

  const continueBtn = document.createElement('button');
  continueBtn.type = 'button';
  continueBtn.className = 'memo-page-leave-continue';
  continueBtn.textContent = '계속 작성';

  actions.append(tempBtn, discardBtn, continueBtn);
  panel.append(message, actions);
  overlay.appendChild(panel);
  dom.memoFullscreenBody?.appendChild(overlay);
}


function isPageEditorDirty(w) {
  const draft = pageEditorDrafts.get(w.id);
  const baseline = pageEditorBaselines.get(w.id);
  if (!draft || !baseline) return false;

  return (
    draft.date !== baseline.date
    || draft.title !== baseline.title
    || draft.content !== baseline.content
    || Boolean(draft.isContinuation) !== Boolean(baseline.isContinuation)
  );
}


function goBackFromPageEditor(w) {
  if (!shouldShowPageEditorLeaveDialog(w)) {
    exitPageEditorToCreateSetup(w);
    return;
  }

  showPageEditorLeaveDialog();
}


function discardPageEditorAndLeave(w) {
  const sessionImageIds = collectEditorSessionImageIds(w);
  exitPageEditorToCreateSetup(w);
  sessionImageIds.forEach((imageId) => {
    deleteMemoImageIfUnreferenced(imageId, w);
  });
}


function collectEditorSessionImageIds(w) {
  const ids = new Set();
  getSessionSheetsForEditor(w).forEach((sheet) => {
    collectMemoImageIdsFromHtml(sheet.content ?? '').forEach((id) => ids.add(id));
  });
  const draft = pageEditorDrafts.get(w.id);
  if (draft?.content && !getEditorSession(w.id)) {
    collectMemoImageIdsFromHtml(draft.content).forEach((id) => ids.add(id));
  }
  return ids;
}


function upsertMemoDraftFromSheet(memo, sheetDraft, now, preferredDraftId = null, sessionMeta = null) {
  const pageTitle = pageTitleForSave(sheetDraft);
  const pageDate = pageDateForSave(sheetDraft);

  let targetDraftId = preferredDraftId || sheetDraft.draftId || null;
  let existingIndex = -1;
  if (targetDraftId) {
    existingIndex = memo.drafts.findIndex((item) => item.id === targetDraftId);
  } else {
    targetDraftId = crypto.randomUUID();
  }

  const memoDraft = {
    id: targetDraftId,
    title: pageTitle,
    content: sanitizeDraftContent(sheetDraft.content ?? ''),
    date: pageDate,
    category: normalizeMemoCategoryId(sheetDraft.memoCategoryId),
    templateId: normalizeMemoTemplateId(sheetDraft.templateId),
    createdAt: existingIndex >= 0 ? memo.drafts[existingIndex].createdAt : now,
    updatedAt: now,
    isContinuation: isPageContinuation(sheetDraft),
    sourcePageId:
      sheetDraft.pageId
      || (existingIndex >= 0 ? memo.drafts[existingIndex].sourcePageId : '')
      || '',
  };

  if (sessionMeta?.sessionGroupId) {
    memoDraft.sessionGroupId = sessionMeta.sessionGroupId;
    memoDraft.sessionOrder = sessionMeta.sessionOrder ?? 0;
    memoDraft.sessionTotal = sessionMeta.sessionTotal ?? 1;
  } else {
    delete memoDraft.sessionGroupId;
    delete memoDraft.sessionOrder;
    delete memoDraft.sessionTotal;
  }

  if (existingIndex >= 0) {
    memo.drafts[existingIndex] = memoDraft;
  } else {
    memo.drafts.push(memoDraft);
  }

  return targetDraftId;
}


function persistEditorSessionToDrafts(w, memo, now) {
  const sheets = getSessionSheetsForPersist(w);
  if (!sheets.length) return;

  const integrity = validateSessionSheetsIntegrity(sheets);
  if (!integrity.ok) {
    console.warn('[Memo] session draft integrity validation failed:', integrity);
    showSessionIntegrityFailure(integrity);
    throw new Error(`Session draft integrity validation failed: ${integrity.reason ?? 'unknown'}`);
  }

  const session = getEditorSession(w.id);
  const useGroup = shouldPersistDraftsAsGroup(session, sheets);

  if (useGroup) {
    const sessionGroupId = session?.sessionGroupId ?? crypto.randomUUID();
    removeDraftsBeforeGroupPersist(memo, sessionGroupId, sheets);
    persistDraftGroupFromSheets(memo, sheets, sessionGroupId, now);
    if (session) {
      session.sessionGroupId = sessionGroupId;
    }
    return;
  }

  const sheet = sheets[0];
  if (sheet.draftId) {
    removeMemoDraftById(memo, sheet.draftId);
  }
  if (sheet.pageId) {
    memo.drafts = memo.drafts.filter((item) => {
      if (item.sessionGroupId) return true;
      return item.sourcePageId !== sheet.pageId;
    });
  }

  const newDraftId = upsertMemoDraftFromSheet(memo, sheet, now, sheet.draftId, null);
  const savedDraft = findMemoDraft(memo, newDraftId);
  if (savedDraft) {
    delete savedDraft.sessionGroupId;
    delete savedDraft.sessionOrder;
    delete savedDraft.sessionTotal;
  }
}


function removeMemoDraftsAfterSessionSave(memo, w) {
  const session = getEditorSession(w.id);
  if (!session) {
    const draft = pageEditorDrafts.get(w.id);
    removeMemoDraftAfterPageSave(memo, draft, draft?.pageId);
    return;
  }

  const sessionGroupId = session.sessionGroupId;
  const draftIds = collectSessionDraftIds(w.id);

  if (sessionGroupId) {
    memo.drafts = memo.drafts.filter((item) => item.sessionGroupId !== sessionGroupId);
  }

  draftIds.forEach((draftId) => {
    removeMemoDraftById(memo, draftId);
  });

  try {
    saveMemoData();
  } catch (error) {
    console.error('[Memo] saveMemoData failed after session draft removal:', error);
  }
}


function persistEditorSessionToPages(w) {
  const sheets = getSessionSheetsForPersist(w);
  if (!sheets.length) return false;

  const integrity = validateSessionSheetsIntegrity(sheets);
  if (!integrity.ok) {
    console.warn('[Memo] session integrity validation failed:', integrity);
    showSessionIntegrityFailure(integrity);
    return false;
  }

  const now = new Date().toISOString();
  const firstSheet = sheets[0];
  let memo = getActiveCreateSetupMemo(w);

  if (firstSheet.pageId) {
    memo = findMemoContainingPage(w, firstSheet.pageId);
  }

  if (!memo) {
    memo = {
      id: crypto.randomUUID(),
      title: isPageContinuation(firstSheet) ? '제목 없음' : pageTitleForSave(firstSheet),
      content: firstSheet.content || '',
      category: normalizeMemoCategoryId(firstSheet.memoCategoryId),
      coverImage: '',
      pages: [],
      drafts: [],
      createdAt: now,
      updatedAt: now,
    };
    getSharedMemos().push(memo);
    currentDiaryId = memo.id;
  } else {
    memo.category = normalizeMemoCategoryId(firstSheet.memoCategoryId ?? memo.category);
  }

  ensureMemoDrafts(memo);

  let anchorPageId = currentPageId;

  for (let i = 0; i < sheets.length; i += 1) {
    const sheet = sheets[i];

    if (i === 0 && sheet.pageId) {
      const page = memo.pages.find((p) => p.id === sheet.pageId);
      if (page) {
        page.date = pageDateForSave(sheet);
        page.title = pageTitleForSave(sheet);
        page.isContinuation = isPageContinuation(sheet);
        page.content = sanitizeMemoHtml(sheet.content ?? '');
        page.templateId = normalizeMemoTemplateId(sheet.templateId ?? page.templateId);
        page.updatedAt = now;
        stripPageSessionMeta(page);
        anchorPageId = page.id;
        currentPageId = page.id;
      }
    } else if (i === 0) {
      const newPage = stripPageSessionMeta({
        id: crypto.randomUUID(),
        templateId: normalizeMemoTemplateId(sheet.templateId),
        category: '',
        date: pageDateForSave(sheet),
        title: pageTitleForSave(sheet),
        isContinuation: isPageContinuation(sheet),
        content: sanitizeMemoHtml(sheet.content ?? ''),
        createdAt: now,
        updatedAt: now,
      });
      memo.pages = insertPageByPosition(
        memo.pages,
        newPage,
        sheet.insertPosition ?? 'after-current',
        currentPageId
      );
      anchorPageId = newPage.id;
      currentPageId = newPage.id;
    } else {
      anchorPageId = insertEditorDraftAsPage(
        memo,
        { ...sheet, insertPosition: 'after-current' },
        anchorPageId,
        now
      );
      currentPageId = anchorPageId;
    }
  }

  if (!isPageContinuation(firstSheet)) {
    memo.title = pageTitleForSave(firstSheet);
  }
  memo.content = sanitizeMemoHtml(sheets[sheets.length - 1].content ?? '');
  memo.updatedAt = now;
  currentDiaryId = memo.id;

  try {
    saveMemoData();
  } catch (error) {
    console.error('[Memo] saveMemoData failed after session save:', error);
    showToast('저장하지 못했습니다.');
    return false;
  }

  removeMemoDraftsAfterSessionSave(memo, w);
  refreshMemoPreview(w.id);
  return true;
}


async function saveTemporaryPageToDraftPages(w) {
  if (isEditorSessionDraftSaving) return;

  syncSessionBeforePersist(w);

  if (!isMultiSheetEditorSession(w)) {
    const fits = await ensureEditorSheetsFitBeforeSave(w);
    if (!fits) return;
  }

  isEditorSessionDraftSaving = true;
  const tempButtons = dom.memoFullscreenBody?.querySelectorAll('.memo-page-leave-temp, .memo-text-page-save');
  tempButtons?.forEach((btn) => {
    btn.disabled = true;
  });

  try {
    const draft = pageEditorDrafts.get(w.id);
    if (!draft) return;

    const sheetCount = getSessionSheetsForPersist(w).length;

    ensureMemoWidgetData(w);
    const now = new Date().toISOString();

    let memo = getActiveCreateSetupMemo(w);
    const firstSheet = getSessionSheetsForPersist(w)[0] ?? draft;
    if (firstSheet.pageId) {
      memo = findMemoContainingPage(w, firstSheet.pageId) ?? memo;
    }

    if (!memo) {
      memo = {
        id: crypto.randomUUID(),
        title: isPageContinuation(firstSheet) ? '제목 없음' : pageTitleForSave(firstSheet),
        content: firstSheet.content || '',
        category: normalizeMemoCategoryId(firstSheet.memoCategoryId),
        coverImage: '',
        pages: [],
        drafts: [],
        createdAt: now,
        updatedAt: now,
      };
      getSharedMemos().push(memo);
      currentDiaryId = memo.id;
    } else {
      memo.category = normalizeMemoCategoryId(firstSheet.memoCategoryId ?? memo.category);
    }

    ensureMemoDrafts(memo);
    persistEditorSessionToDrafts(w, memo, now);

    memo.updatedAt = now;
    currentDiaryId = memo.id;
    removePageEditorLeaveDialog();
    registerPageEditorBaselineRefresher(w, null);
    resetEditorSession(w.id);
    pageEditorDrafts.delete(w.id);
    pageEditorBaselines.delete(w.id);
    fullscreenViewMode = 'createSetup';

    saveMemoData();
    renderMemoFullscreen();
    refreshMemoPreview(w.id);
    showToast(
      sheetCount > 1
        ? `보관함에 ${sheetCount}페이지를 임시저장했습니다.`
        : '보관함에 임시저장되었습니다.'
    );
  } catch (error) {
    console.error('[Memo] saveMemoData failed after temp save:', error);
    if (String(error?.message ?? '').includes('photo-clipping-detected')) {
      showSessionIntegrityFailure({ reason: 'photo-clipping-detected' });
    } else if (!String(error?.message ?? '').includes('integrity validation failed')) {
      showToast('임시저장하지 못했습니다.');
    }
  } finally {
    isEditorSessionDraftSaving = false;
    tempButtons?.forEach((btn) => {
      btn.disabled = false;
    });
  }
}


function openBinderPageEditor(w, pageId) {
  if (!pageId) return;
  currentDiaryId = findMemoContainingPage(w, pageId)?.id ?? currentDiaryId;
  openTextPageEditorForPage(w, pageId);
}


function ensurePageEditorMeasureRoot(container) {
  if (!container) return null;
  let measure = container.querySelector('.memo-sheet-measure');
  if (!measure) {
    measure = document.createElement('div');
    measure.className = 'memo-sheet-measure';
    measure.setAttribute('aria-hidden', 'true');
    const titleEl = document.createElement('div');
    titleEl.className = 'memo-sheet-measure-title';
    const contentEl = document.createElement('div');
    contentEl.className = 'memo-sheet-measure-content memo-binder-sheet-content memo-sheet-read-content';
    measure.append(titleEl, contentEl);
    container.appendChild(measure);
  }
  return measure;
}


function doesPageContentFitReadSheet(title, content, container, isContinuation = false) {
  const measure = ensurePageEditorMeasureRoot(container);
  if (!measure) return true;

  const titleEl = measure.querySelector('.memo-sheet-measure-title');
  const contentEl = measure.querySelector('.memo-sheet-measure-content');
  if (!titleEl || !contentEl) return true;

  contentEl.classList.toggle('memo-sheet-measure-content--continuation', isContinuation);
  if (isContinuation) {
    titleEl.hidden = true;
    titleEl.textContent = '';
  } else {
    titleEl.hidden = false;
    const displayTitle = (title || '').trim() || '제목 없음';
    titleEl.textContent = displayTitle;
  }

  renderMemoPageContentIntoElement(contentEl, content);

  return contentEl.offsetHeight <= contentEl.clientHeight + 2;
}


function isPageEditorContentWithinLimit(contentInput) {
  if (!contentInput) return true;
  const html = getRichEditorContentHtml(contentInput);
  return doesHtmlFitEditorSheet(contentInput, html);
}


function getPageEditorContentFillRatio(contentInput) {
  if (!contentInput) return 0;
  const max = getSheetContentMaxHeight(contentInput);
  if (!max) return 0;
  const html = getRichEditorContentHtml(contentInput);
  return measureHtmlContentHeight(contentInput, html) / max;
}


function bindPageEditorContentLimits(w, titleInput, contentEditor, continueBtn) {
  let lastValidContent = getRichEditorContentHtml(contentEditor);
  let composing = false;
  let overflowPromptOpen = false;

  registerPageEditorBaselineRefresher(w, () => {
    lastValidContent = getRichEditorContentHtml(contentEditor);
  });

  const syncAndContinue = () => {
    syncPageEditorDraftFromForm(w);
    if (continueBtn) {
      const showContinue = getPageEditorContentFillRatio(contentEditor) >= CONTINUE_SHEET_FILL_RATIO;
      continueBtn.hidden = !showContinue;
      const continueRow = continueBtn.closest('.memo-text-page-continue-row');
      if (continueRow) continueRow.hidden = !showContinue;
    }
  };

  const restoreLastValidContent = async () => {
    contentEditor.innerHTML = renderMemoPageContentHtml(lastValidContent);
    await setupMemoEditorImages(contentEditor);
    syncAndContinue();
  };

  const handleTextOverflow = async () => {
    if (overflowPromptOpen || getIsCreatingOverflowSheet()) return;
    overflowPromptOpen = true;

    const confirmed = await showTextSheetOverflowDialog(
      dom.memoFullscreenBody,
      async () => {
        if (getIsCreatingOverflowSheet()) return;
        setIsCreatingOverflowSheet(true);
        try {
          await splitCurrentEditorToNextSheet(w, contentEditor);
          lastValidContent = getRichEditorContentHtml(
            dom.memoFullscreenBody?.querySelector('.memo-text-page-content') ?? contentEditor
          );
        } finally {
          setIsCreatingOverflowSheet(false);
        }
      },
      async () => {
        await restoreLastValidContent();
        showToast('현재 페이지의 입력 가능한 분량을 초과했습니다.');
      }
    );

    overflowPromptOpen = false;
    if (confirmed) {
      syncAndContinue();
    }
  };

  const validateContent = () => {
    if (composing) {
      syncAndContinue();
      return;
    }
    const html = getRichEditorContentHtml(contentEditor);
    if (!doesHtmlFitEditorSheet(contentEditor, html)) {
      handleTextOverflow();
      return;
    }
    lastValidContent = html;
    syncAndContinue();
  };

  contentEditor.addEventListener('compositionstart', () => {
    composing = true;
  });
  contentEditor.addEventListener('compositionend', () => {
    composing = false;
    validateContent();
  });

  contentEditor.addEventListener('input', validateContent);

  contentEditor.addEventListener('paste', (e) => {
    e.preventDefault();
    const clipboard = e.clipboardData || window.clipboardData;
    const html = clipboard?.getData('text/html') ?? '';
    const text = clipboard?.getData('text/plain') ?? '';
    const toInsert = html ? sanitizeMemoHtml(html) : plainTextToMemoHtml(text);
    if (document.queryCommandSupported?.('insertHTML')) {
      document.execCommand('insertHTML', false, toInsert);
    } else {
      contentEditor.innerHTML = `${contentEditor.innerHTML}${toInsert}`;
    }
    validateContent();
  });

  if (titleInput) {
    titleInput.maxLength = SHEET_TITLE_MAX_LENGTH;
    titleInput.addEventListener('input', () => syncPageEditorDraftFromForm(w));
  }

  syncAndContinue();
}


function continueWritingOnNextSheet(w) {
  syncPageEditorDraftFromForm(w);
  ensurePageEditorSession(w, pageEditorDrafts.get(w.id));

  const currentDraft = pageEditorDrafts.get(w.id);
  const newSheet = appendContinuationSheetAtEnd(w.id, {
    initialContent: '',
    templateId: MEMO_BASIC_TEMPLATE_ID,
    memoCategoryId: getPageEditorMemoCategoryId(w, currentDraft),
    insertPosition: currentDraft?.insertPosition ?? 'after-current',
  });

  if (newSheet) {
    pageEditorDrafts.set(w.id, clonePageDraft(newSheet));
    pageEditorBaselines.set(w.id, clonePageDraft(newSheet));
  }

  registerPageEditorBaselineRefresher(w, null);
  renderMemoFullscreen();
}


async function saveTextPageFromDraft(w) {
  if (isEditorSessionSaving) return;

  syncSessionBeforePersist(w);

  if (!isMultiSheetEditorSession(w)) {
    const fits = await ensureEditorSheetsFitBeforeSave(w);
    if (!fits) return;
  }

  isEditorSessionSaving = true;
  const saveBtn = dom.memoFullscreenBody?.querySelector('.memo-text-page-save');
  if (saveBtn) saveBtn.disabled = true;

  const sheetCount = getSessionSheetsForPersist(w).length;

  try {
    const ok = persistEditorSessionToPages(w);
    if (!ok) {
      return;
    }

    resetEditorSession(w.id);
    registerPageEditorBaselineRefresher(w, null);
    pageEditorDrafts.delete(w.id);
    pageEditorBaselines.delete(w.id);
    fullscreenViewMode = 'createSetup';
    renderMemoFullscreen();
    showToast(
      sheetCount > 1 ? `${sheetCount}페이지가 저장되었습니다.` : '페이지가 저장되었습니다.'
    );
  } finally {
    isEditorSessionSaving = false;
    if (saveBtn) saveBtn.disabled = false;
  }
}


function buildTextPageToolbar() {
  const toolbar = document.createElement('div');
  toolbar.className = 'memo-text-page-toolbar';

  TEXT_PAGE_TOOLBAR_ITEMS.forEach((item) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'memo-text-page-tool';
    if (item.edge) btn.classList.add('memo-text-page-tool--edge');
    btn.dataset.toolId = item.id;
    btn.dataset.toolToast = item.toast;

    const icon = document.createElement('span');
    icon.className = 'memo-text-page-tool-icon';
    icon.textContent = item.icon;
    icon.setAttribute('aria-hidden', 'true');

    const label = document.createElement('span');
    label.className = 'memo-text-page-tool-label';
    label.textContent = item.label;

    btn.append(icon, label);
    toolbar.appendChild(btn);
  });

  return toolbar;
}


function renderTextPageEditor(container, w) {
  const draft = pageEditorDrafts.get(w.id);
  if (!draft) return;

  const isContinuation = isPageContinuation(draft);

  const shell = document.createElement('div');
  shell.className = 'memo-text-page-shell memo-text-page-shell--editor memo-page-editor';
  if (isContinuation) {
    shell.classList.add('is-continuation');
  }

  const header = document.createElement('header');
  header.className = 'memo-text-page-header';

  const backBtn = document.createElement('button');
  backBtn.type = 'button';
  backBtn.className = 'memo-text-page-back';
  backBtn.textContent = '←';

  const categoryWrap = document.createElement('div');
  categoryWrap.className = 'memo-editor-category-wrap';

  const categoryBtn = document.createElement('button');
  categoryBtn.type = 'button';
  categoryBtn.className = 'memo-editor-category-button memo-text-page-category-btn';
  categoryBtn.setAttribute('aria-haspopup', 'menu');
  categoryBtn.setAttribute('aria-expanded', isPageEditorCategoryMenuOpen ? 'true' : 'false');
  categoryBtn.textContent = getMemoDiaryCategoryLabel(getPageEditorMemoCategoryId(w, draft));

  const categoryMenu = buildPageEditorCategoryMenu(w, draft);
  categoryWrap.append(categoryBtn, categoryMenu);

  const saveBtn = document.createElement('button');
  saveBtn.type = 'button';
  saveBtn.className = 'memo-text-page-save';
  saveBtn.textContent = '저장';
  saveBtn.disabled = isEditorSessionSaving || isEditorSessionDraftSaving;

  header.append(backBtn, categoryWrap, saveBtn);

  const body = document.createElement('div');
  body.className = 'memo-text-page-body memo-text-page-body--sheet';

  const sheetSurface = document.createElement('div');
  sheetSurface.className = 'memo-text-page-sheet-surface';
  if (isContinuation) {
    sheetSurface.classList.add('memo-text-page-sheet-surface--continuation');
  }

  const dateInput = document.createElement('input');
  dateInput.type = 'date';
  dateInput.className = 'memo-text-page-date sheet-date';

  const titleInput = document.createElement('input');
  titleInput.type = 'text';
  titleInput.className = 'memo-text-page-title sheet-title';
  titleInput.placeholder = '제목';

  const divider = document.createElement('hr');
  divider.className = 'memo-text-page-sheet-divider sheet-divider';
  divider.setAttribute('aria-hidden', 'true');

  const contentWrap = document.createElement('div');
  contentWrap.className = 'memo-text-page-content-wrap';
  if (isContinuation) {
    contentWrap.classList.add('memo-text-page-content-wrap--continuation');
  }

  const contentEditor = document.createElement('div');
  contentEditor.className = 'memo-text-page-content memo-rich-editor sheet-content';
  contentEditor.contentEditable = 'true';
  contentEditor.setAttribute('role', 'textbox');
  contentEditor.setAttribute('aria-multiline', 'true');
  contentEditor.dataset.placeholder = '글을 입력해주세요';

  const pageSpacer = document.createElement('p');
  pageSpacer.className = 'memo-text-page-sheet-spacer';
  pageSpacer.setAttribute('aria-hidden', 'true');
  pageSpacer.textContent = '0';

  setRichEditorContent(contentEditor, draft.content ?? '');

  contentWrap.appendChild(contentEditor);

  if (isContinuation) {
    const headerSpacer = document.createElement('header');
    headerSpacer.className = 'memo-text-page-sheet-header-spacer memo-binder-sheet-header';
    headerSpacer.setAttribute('aria-hidden', 'true');
    sheetSurface.append(headerSpacer, contentWrap, pageSpacer);
  } else {
    dateInput.value = draft.date || getLocalDateInputValue();
    titleInput.value = draft.title ?? '';
    sheetSurface.append(dateInput, titleInput, divider, contentWrap, pageSpacer);
    dateInput.addEventListener('input', () => syncPageEditorDraftFromForm(w));
  }

  const continueRow = document.createElement('div');
  continueRow.className = 'memo-text-page-continue-row';
  continueRow.hidden = true;

  const continueBtn = document.createElement('button');
  continueBtn.type = 'button';
  continueBtn.className = 'memo-text-page-continue';
  continueBtn.textContent = '다음 속지에 이어쓰기';
  continueBtn.hidden = true;
  continueRow.appendChild(continueBtn);

  body.append(sheetSurface);

  const sessionNav = buildEditorSessionNav(w);
  if (sessionNav) {
    body.appendChild(sessionNav);
  }

  shell.append(header, body, continueRow, buildTextPageToolbar());

  const photoInput = buildMemoPhotoFileInput();
  shell.appendChild(photoInput);

  container.appendChild(shell);
  mountArchivePopupOverlay(container);

  ensurePageEditorMeasureRoot(container);
  bindPageEditorContentLimits(w, isContinuation ? null : titleInput, contentEditor, continueBtn);

  bindMemoPhotoEditorInteractions(w, shell, contentEditor, container, {
    syncPageEditorDraftFromForm: () => syncPageEditorDraftFromForm(w),
    collectAllMemoImageHtmlSources: () => collectAllMemoImageHtmlSources(w),
    deleteMemoImageIfUnreferenced: (imageId) => deleteMemoImageIfUnreferenced(imageId, w),
  });

  photoInput.addEventListener('change', () => {
    handleMemoPhotoFileInputChange(photoInput, contentEditor, container, {
      showToast,
      syncDraft: () => syncPageEditorDraftFromForm(w),
      onContinuationNeeded: async () => {
        beginPhotoContinuationSheet(w, {
          syncPageEditorDraftFromForm: (widget) => syncPageEditorDraftFromForm(widget),
          pageEditorDrafts,
          pageEditorBaselines,
          clonePageDraft,
          getPageEditorMemoCategoryId,
          MEMO_BASIC_TEMPLATE_ID,
        });
        renderMemoFullscreen();
      },
      onComplete: () => {
        syncPageEditorDraftFromForm(w);
        refreshPageEditorContentBaseline(w);
      },
    });
  });

  bindMemoReadModePhotoLightbox(container, container);
  syncMemoPhotoToolbarState(container);
}


function getActiveMemoWidget() {
  if (!activeMemoWidgetId) return null;
  return state.widgets.find((x) => x.id === activeMemoWidgetId) ?? null;
}


function getPlacedWidgetEl(widgetId) {
  return dom.legoGrid?.querySelector(`.placed-widget[data-widget-id="${widgetId}"]`) ?? null;
}


function refreshMemoPreview(widgetId) {
  const w = state.widgets.find((x) => x.id === widgetId);
  const el = getPlacedWidgetEl(widgetId);
  if (w && el) renderMemoPreview(el, w);
}


function truncatePreview(text, maxLen = 80) {
  const t = memoContentToPlainText(text).replace(/\s+/g, ' ').trim();
  if (!t) return '';
  if (t.length <= maxLen) return t;
  return `${t.slice(0, maxLen)}…`;
}


function normalizeTitle(raw) {
  const trimmed = (raw || '').trim();
  return trimmed || '제목 없음';
}


function formatMemoDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('ko-KR', { year: 'numeric', month: 'short', day: 'numeric' });
}


function normalizeMemoSortBy(sortBy) {
  if (MEMO_SORT_OPTIONS.some((opt) => opt.sortBy === sortBy)) {
    return sortBy;
  }
  return 'updatedAt';
}


function getMemoSortLabel(sortBy) {
  return MEMO_SORT_OPTIONS.find((opt) => opt.sortBy === normalizeMemoSortBy(sortBy))?.label
    ?? '최신순';
}


function getMemoSortTimestamp(memo) {
  const raw = memo?.updatedAt || memo?.createdAt;
  if (!raw) return 0;
  const time = new Date(raw).getTime();
  return Number.isNaN(time) ? 0 : time;
}


function isMemoUntitled(memo) {
  const title = (memo?.title ?? '').trim();
  return !title || title === '제목 없음';
}


function findDiaryWidgetForLiveWidget(w) {
  return findDiaryWidgetById(w?.id);
}


function persistMemoWidgetSort(w) {
  if (!w) return;
  w.sortBy = normalizeMemoSortBy(w.sortBy);
  persistMemoWidgetSettings(w);
}


function applyMemoSort(w, sortBy) {
  w.sortBy = normalizeMemoSortBy(sortBy);
  persistMemoWidgetSort(w);
}


function normalizeCategoryName(name) {
  return (name ?? '').trim().replace(/\s+/g, ' ');
}


function isDuplicateCategoryName(name, excludeId = null) {
  const normalized = normalizeCategoryName(name).toLocaleLowerCase('ko');
  if (!normalized) return false;
  return getMemoCategories().some(
    (category) =>
      category.id !== excludeId &&
      normalizeCategoryName(category.name).toLocaleLowerCase('ko') === normalized
  );
}


function getAllMemoCount() {
  return getSharedMemos().length;
}


function getMemoCategoryCount(categoryId) {
  return getSharedMemos().filter((memo) => memo.category === categoryId).length;
}


function getMemoCategoryDisplayName(categoryId) {
  if (!categoryId || categoryId === MEMO_ACTIVE_CATEGORY_ALL) return '전체';
  return getMemoCategories().find((category) => category.id === categoryId)?.name ?? '전체';
}


function getFilteredMemos() {
  const activeCategory = getMemoActiveCategory();
  const memos = getSharedMemos();
  if (activeCategory === MEMO_ACTIVE_CATEGORY_ALL) return [...memos];
  return memos.filter((memo) => memo.category === activeCategory);
}


function sortMemoList(memos, sortBy) {
  const sorted = [...memos];
  if (sortBy === 'updatedAtAsc') {
    return sorted.sort((a, b) => getMemoSortTimestamp(a) - getMemoSortTimestamp(b));
  }
  if (sortBy === 'title') {
    return sorted.sort((a, b) => {
      const untitledA = isMemoUntitled(a);
      const untitledB = isMemoUntitled(b);
      if (untitledA !== untitledB) {
        return untitledA ? 1 : -1;
      }
      return (a.title ?? '').trim().localeCompare((b.title ?? '').trim(), 'ko');
    });
  }
  return sorted.sort((a, b) => getMemoSortTimestamp(b) - getMemoSortTimestamp(a));
}


function getDisplayMemos(w) {
  ensureMemoWidgetData(w);
  const sortBy = normalizeMemoSortBy(w.sortBy);
  const categoryFiltered = getFilteredMemos();
  const searchFiltered = filterMemosBySearchQuery(categoryFiltered, memoHomeSearchQuery);
  return sortMemoList(searchFiltered, sortBy);
}


function normalizeMemoSearchText(value) {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLocaleLowerCase('ko-KR');
}


function memoHtmlToSearchText(html) {
  try {
    return memoContentToPlainText(html);
  } catch {
    return '';
  }
}


function memoMatchesSearchQuery(memo, query) {
  try {
    const normalizedQuery = normalizeMemoSearchText(query);
    if (!normalizedQuery) return true;

    const values = [memo?.title, memoHtmlToSearchText(memo?.content)];
    const pages = Array.isArray(memo?.pages) ? memo.pages : [];

    pages.forEach((page) => {
      values.push(page?.title);
      values.push(memoHtmlToSearchText(page?.content));
    });

    return values.some((value) => normalizeMemoSearchText(value).includes(normalizedQuery));
  } catch {
    return false;
  }
}


function filterMemosBySearchQuery(memos, query) {
  const normalizedQuery = normalizeMemoSearchText(query);
  if (!normalizedQuery) return [...memos];
  return memos.filter((memo) => memoMatchesSearchQuery(memo, query));
}


function hasActiveMemoHomeSearchQuery() {
  return normalizeMemoSearchText(memoHomeSearchQuery).length > 0;
}


function captureMemoHomeSearchInputState() {
  const input = dom.memoFullscreenBody?.querySelector('.memo-home-search-input');
  if (!input || document.activeElement !== input) return null;
  return {
    value: input.value,
    selectionStart: input.selectionStart ?? input.value.length,
    selectionEnd: input.selectionEnd ?? input.value.length,
  };
}


function restoreMemoHomeSearchInputState(state) {
  if (!state) return;
  const input = dom.memoFullscreenBody?.querySelector('.memo-home-search-input');
  if (!input) return;

  input.value = state.value;
  memoHomeSearchQuery = state.value;
  input.focus();
  try {
    input.setSelectionRange(state.selectionStart, state.selectionEnd);
  } catch {
    /* ignore */
  }
}


function syncMemoHomeSearchControls() {
  const root = dom.memoFullscreenBody;
  if (!root) return;

  const clearBtn = root.querySelector('.memo-home-search-clear');
  if (clearBtn) {
    clearBtn.hidden = !hasActiveMemoHomeSearchQuery();
  }

  const fabSearch = root.querySelector('.memo-home-fab-search');
  if (fabSearch) {
    fabSearch.classList.toggle('memo-home-search-fab--active', isMemoHomeSearchOpen);
  }

  const meta = root.querySelector('.memo-home-search-meta');
  const w = getActiveMemoWidget();
  if (meta && w) {
    if (hasActiveMemoHomeSearchQuery()) {
      meta.hidden = false;
      meta.textContent = `검색 결과 ${getDisplayMemos(w).length}개`;
    } else {
      meta.hidden = true;
      meta.textContent = '';
    }
  }
}


function fillMemoHomeCardsSection(section, w) {
  section.replaceChildren();
  if (isMemoHomeEditMode) {
    section.classList.add('memo-home-cards--edit-mode');
  } else {
    section.classList.remove('memo-home-cards--edit-mode');
  }

  const totalMemoCount = getAllMemoCount();
  if (totalMemoCount === 0) {
    const empty = document.createElement('p');
    empty.className = 'memo-home-empty';
    empty.textContent = '작성된 다이어리가 없습니다.';
    section.appendChild(empty);
    return;
  }

  const displayMemos = getDisplayMemos(w);
  if (displayMemos.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'memo-home-empty memo-home-search-empty';
    if (hasActiveMemoHomeSearchQuery()) {
      const queryText = memoHomeSearchQuery.trim();
      empty.textContent = queryText
        ? `"${queryText}"에 대한 검색 결과가 없습니다.`
        : '검색 결과가 없습니다.';
    } else {
      empty.textContent = '이 카테고리에 작성된 다이어리가 없습니다.';
    }
    section.appendChild(empty);
    return;
  }

  const grid = document.createElement('div');
  grid.className = 'memo-home-card-grid';

  displayMemos.forEach((memo) => {
    const card = document.createElement('article');
    card.className = 'memo-home-card';
    if (isMemoHomeEditMode) {
      card.classList.add('memo-home-card--edit-mode');
    }
    card.dataset.memoId = memo.id;

    const thumb = document.createElement('div');
    thumb.className = 'memo-home-card-thumb';
    if (memo.coverImage) {
      const img = document.createElement('img');
      img.src = memo.coverImage;
      img.alt = '';
      thumb.appendChild(img);
    } else {
      thumb.textContent = '대표사진';
    }

    const title = document.createElement('h3');
    title.className = 'memo-home-card-title';
    title.textContent = memo.title || '제목 없음';

    const date = document.createElement('p');
    date.className = 'memo-home-card-date';
    date.textContent = formatMemoDate(memo.updatedAt);

    card.append(thumb, title, date);
    if (isMemoHomeEditMode) {
      card.appendChild(buildMemoCardCategoryControl(memo));
      const deleteBtn = document.createElement('button');
      deleteBtn.type = 'button';
      deleteBtn.className = 'memo-home-card-delete';
      deleteBtn.dataset.memoId = memo.id;
      deleteBtn.textContent = '삭제';
      deleteBtn.disabled = isMemoDiaryDeleteInProgress;
      card.appendChild(deleteBtn);
    }
    grid.appendChild(card);
  });

  section.appendChild(grid);
}


function refreshMemoHomeCardList(w) {
  const section = dom.memoFullscreenBody?.querySelector('.memo-home-cards');
  if (!section || !w) return;

  const inputState = captureMemoHomeSearchInputState();
  fillMemoHomeCardsSection(section, w);
  syncMemoHomeSearchControls();
  restoreMemoHomeSearchInputState(inputState);
}


function buildMemoHomeSearchBar() {
  const bar = document.createElement('div');
  bar.className = 'memo-home-search-bar glass-panel';

  const icon = document.createElement('span');
  icon.className = 'memo-home-search-icon';
  icon.setAttribute('aria-hidden', 'true');
  icon.textContent = '🔍';

  const input = document.createElement('input');
  input.type = 'search';
  input.className = 'memo-home-search-input';
  input.placeholder = '다이어리 제목이나 내용을 검색하세요';
  input.value = memoHomeSearchQuery;
  input.setAttribute('aria-label', 'Memo 다이어리 검색');
  input.autocomplete = 'off';
  input.enterKeyHint = 'search';

  const clearBtn = document.createElement('button');
  clearBtn.type = 'button';
  clearBtn.className = 'memo-home-search-clear';
  clearBtn.setAttribute('aria-label', '검색어 지우기');
  clearBtn.textContent = '✕';
  clearBtn.hidden = !hasActiveMemoHomeSearchQuery();

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'memo-home-search-close';
  closeBtn.setAttribute('aria-label', '검색 닫기');
  closeBtn.textContent = '닫기';

  bar.append(icon, input, clearBtn, closeBtn);
  return bar;
}


function openMemoHomeSearch(w) {
  if (!w) return;
  isMemoHomeEditMode = false;
  closeMemoHomeMenus();
  isMemoHomeSearchOpen = true;
  renderMemoFullscreen();
  requestAnimationFrame(() => {
    dom.memoFullscreenBody?.querySelector('.memo-home-search-input')?.focus();
  });
}


function closeMemoHomeSearch(w, { clearQuery = true, rerender = true } = {}) {
  isMemoHomeSearchOpen = false;
  if (clearQuery) memoHomeSearchQuery = '';
  if (rerender && w) renderMemoFullscreen();
}


function toggleMemoHomeSearch(w) {
  if (isMemoHomeSearchOpen) {
    closeMemoHomeSearch(w);
  } else {
    openMemoHomeSearch(w);
  }
}


function clearMemoHomeSearchQuery(w) {
  memoHomeSearchQuery = '';
  refreshMemoHomeCardList(w);
  syncMemoHomeSearchControls();
  requestAnimationFrame(() => {
    dom.memoFullscreenBody?.querySelector('.memo-home-search-input')?.focus();
  });
}


function addMemoCategory(name) {
  const trimmed = normalizeCategoryName(name);
  if (!trimmed || trimmed.length > MEMO_CATEGORY_NAME_MAX_LENGTH) return null;
  if (isDuplicateCategoryName(trimmed)) return null;

  const category = { id: crypto.randomUUID(), name: trimmed };
  ensureMemoData().categories.push(category);
  saveMemoData();
  return category;
}


function renameMemoCategory(categoryId, name) {
  const trimmed = normalizeCategoryName(name);
  if (!trimmed || trimmed.length > MEMO_CATEGORY_NAME_MAX_LENGTH) return false;
  if (isDuplicateCategoryName(trimmed, categoryId)) return false;

  const category = getMemoCategories().find((item) => item.id === categoryId);
  if (!category) return false;

  category.name = trimmed;
  saveMemoData();
  return true;
}


function deleteMemoCategory(categoryId) {
  const categories = ensureMemoData().categories;
  const index = categories.findIndex((category) => category.id === categoryId);
  if (index < 0) return false;

  categories.splice(index, 1);
  getSharedMemos().forEach((memo) => {
    if (memo.category === categoryId) memo.category = '';
  });

  if (getMemoActiveCategory() === categoryId) {
    setMemoActiveCategory(MEMO_ACTIVE_CATEGORY_ALL);
  } else {
    saveMemoData();
  }
  return true;
}


function assignMemoDiaryCategory(memoId, categoryId) {
  const memo = findSharedMemoById(memoId);
  if (!memo) return false;

  if (!categoryId) {
    memo.category = '';
  } else if (getMemoCategories().some((category) => category.id === categoryId)) {
    memo.category = categoryId;
  } else {
    return false;
  }

  saveMemoData();
  return true;
}


function closeMemoHomeMenus() {
  isMemoHomeSortMenuOpen = false;
  isMemoHomeCategoryMenuOpen = false;
}


function promptAddMemoCategory(w) {
  const name = prompt('카테고리 이름을 입력하세요.');
  if (name == null) return;

  const trimmed = normalizeCategoryName(name);
  if (!trimmed) {
    showToast('카테고리 이름을 입력해 주세요.');
    return;
  }
  if (trimmed.length > MEMO_CATEGORY_NAME_MAX_LENGTH) {
    showToast(`카테고리 이름은 ${MEMO_CATEGORY_NAME_MAX_LENGTH}자 이하로 입력해 주세요.`);
    return;
  }
  if (isDuplicateCategoryName(trimmed)) {
    showToast('이미 같은 이름의 카테고리가 있습니다.');
    return;
  }

  const category = addMemoCategory(trimmed);
  if (!category) {
    showToast('카테고리를 추가하지 못했습니다.');
    return;
  }

  setMemoActiveCategory(category.id);
  isMemoHomeCategoryMenuOpen = false;
  renderMemoFullscreen();
  refreshMemoPreview(w.id);
  showToast(`"${category.name}" 카테고리가 추가되었습니다.`);
}


function promptEditMemoCategory(categoryId, w) {
  const category = getMemoCategories().find((item) => item.id === categoryId);
  if (!category) return;

  const name = prompt('카테고리 이름을 입력하세요.', category.name);
  if (name == null) return;

  const trimmed = normalizeCategoryName(name);
  if (!trimmed) {
    showToast('카테고리 이름을 입력해 주세요.');
    return;
  }
  if (trimmed.length > MEMO_CATEGORY_NAME_MAX_LENGTH) {
    showToast(`카테고리 이름은 ${MEMO_CATEGORY_NAME_MAX_LENGTH}자 이하로 입력해 주세요.`);
    return;
  }
  if (isDuplicateCategoryName(trimmed, categoryId)) {
    showToast('이미 같은 이름의 카테고리가 있습니다.');
    return;
  }
  if (!renameMemoCategory(categoryId, trimmed)) {
    showToast('카테고리 이름을 변경하지 못했습니다.');
    return;
  }

  renderMemoFullscreen();
  refreshMemoPreview(w.id);
  showToast('카테고리 이름이 변경되었습니다.');
}


function confirmDeleteMemoCategory(categoryId, w) {
  const category = getMemoCategories().find((item) => item.id === categoryId);
  if (!category) return;

  const count = getMemoCategoryCount(categoryId);
  let message = '이 카테고리를 삭제하시겠습니까?';
  if (count > 0) {
    message = '이 카테고리에 속한 다이어리는 미분류로 변경됩니다. 삭제하시겠습니까?';
  }
  if (!confirm(message)) return;

  if (!deleteMemoCategory(categoryId)) {
    showToast('카테고리를 삭제하지 못했습니다.');
    return;
  }

  isMemoHomeCategoryMenuOpen = false;
  renderMemoFullscreen();
  refreshMemoPreview(w.id);
  showToast('카테고리가 삭제되었습니다.');
}


function getSortedMemos(w) {
  return getDisplayMemos(w);
}


function getRecentMemos(w, limit = 3) {
  return getSortedMemos(w).slice(0, limit);
}


export function buildMemoWidgetShell() {
  return `
    <div class="memo-widget">
      <header class="memo-widget-header">
        <span class="memo-widget-title">Memo</span>
        <button type="button" class="widget-delete memo-widget-delete" title="Remove widget">✕</button>
      </header>
      <div class="memo-widget-body"></div>
    </div>
  `;
}


export function renderMemoPreview(el, w) {
  try {
    ensureMemoWidgetData(w);
    ensureMemoData();
    const body = el.querySelector('.memo-widget-body');
    if (!body) return;

    body.replaceChildren();

    const preview = document.createElement('div');
    preview.className = 'memo-preview';

    const sheetArea = document.createElement('div');
    sheetArea.className = 'memo-preview-sheet-area';
    sheetArea.setAttribute('role', 'button');
    sheetArea.tabIndex = 0;
    sheetArea.setAttribute('aria-label', '페이지 미리보기 선택');

    const hasPreview = renderMemoWidgetPagePreview(sheetArea, w);
    if (!hasPreview) {
      const addBtn = document.createElement('button');
      addBtn.type = 'button';
      addBtn.className = 'memo-preview-add';
      addBtn.setAttribute('aria-label', '페이지 미리보기 선택');
      addBtn.textContent = '+';
      sheetArea.appendChild(addBtn);
    }

    preview.appendChild(sheetArea);

    const openBtn = document.createElement('button');
    openBtn.type = 'button';
    openBtn.className = 'memo-preview-open';
    openBtn.textContent = '열기';
    preview.appendChild(openBtn);

    body.appendChild(preview);
  } catch (error) {
    console.error('Memo widget preview failed:', error);
    const body = el.querySelector('.memo-widget-body');
    if (!body) return;

    body.replaceChildren();
    const preview = document.createElement('div');
    preview.className = 'memo-preview';

    const sheetArea = document.createElement('div');
    sheetArea.className = 'memo-preview-sheet-area';
    sheetArea.appendChild(buildMemoPreviewFallbackElement());

    const openBtn = document.createElement('button');
    openBtn.type = 'button';
    openBtn.className = 'memo-preview-open';
    openBtn.textContent = '열기';

    preview.append(sheetArea, openBtn);
    body.appendChild(preview);
  }
}


function buildMemoPreviewClearButton() {
  const clearBtn = document.createElement('button');
  clearBtn.type = 'button';
  clearBtn.className = 'memo-preview-clear';
  clearBtn.title = '미리보기 제거';
  clearBtn.setAttribute('aria-label', '미리보기 제거');
  clearBtn.textContent = '✕';
  return clearBtn;
}


function buildMemoPreviewFallbackElement() {
  const fallback = document.createElement('div');
  fallback.className = 'memo-preview-content-area memo-preview-fallback';
  fallback.textContent = '미리보기를 표시할 수 없습니다.';
  return fallback;
}


function renderMemoWidgetPagePreview(container, w) {
  const memo = findSharedMemoById(w.previewMemoId);
  const page = memo?.pages?.find((p) => p.id === w.previewPageId);
  if (!memo || !page) return false;

  try {
    const previewContent = buildMemoWidgetPreviewElement(page, memo, w);
    if (!previewContent) return false;

    container.append(previewContent, buildMemoPreviewClearButton());
    return true;
  } catch (error) {
    console.error('Memo preview render failed:', error);
    container.append(buildMemoPreviewFallbackElement(), buildMemoPreviewClearButton());
    return true;
  }
}


export function openMemoPreviewPicker(widgetId) {
  const w = state.widgets.find((x) => x.id === widgetId);
  if (!w || w.type !== 'memo') return;
  resetMemoDeleteSelectionState();
  previewPickerTargetWidgetId = widgetId;
  previewPickerSelectedPageId = null;
  openMemoFullscreen(widgetId);
}


function clearMemoWidgetPreview(widgetId) {
  const w = state.widgets.find((x) => x.id === widgetId);
  if (!w || w.type !== 'memo') return;
  w.previewMemoId = '';
  w.previewPageId = '';
  persistMemoWidgetSettings(w);
  const el = dom.legoGrid?.querySelector(`.placed-widget[data-widget-id="${widgetId}"]`);
  if (el) renderMemoPreview(el, w);
}


function applyPreviewPickerSelection() {
  const targetId = previewPickerTargetWidgetId;
  if (!targetId || !previewPickerSelectedPageId || !currentDiaryId) return false;

  const targetWidget = state.widgets.find((x) => x.id === targetId);
  if (!targetWidget || targetWidget.type !== 'memo') return false;

  const memo = findSharedMemoById(currentDiaryId);
  const page = memo?.pages.find((p) => p.id === previewPickerSelectedPageId);
  if (!memo || !page) return false;

  targetWidget.previewMemoId = currentDiaryId;
  targetWidget.previewPageId = previewPickerSelectedPageId;
  persistMemoWidgetSettings(targetWidget);

  previewPickerTargetWidgetId = null;
  previewPickerSelectedPageId = null;
  closeMemoFullscreen();
  refreshMemoPreview(targetId);
  showToast('미리보기 페이지가 설정되었습니다.');
  return true;
}


function buildMemoHomeCategoryMenu(w) {
  const menu = document.createElement('div');
  menu.className = 'memo-home-category-menu';
  menu.hidden = !isMemoHomeCategoryMenuOpen;
  menu.setAttribute('role', 'menu');
  menu.setAttribute('aria-label', '카테고리 옵션');

  const activeCategory = getMemoActiveCategory();
  const allCount = getAllMemoCount();

  const allBtn = document.createElement('button');
  allBtn.type = 'button';
  allBtn.className = 'memo-home-category-option';
  allBtn.dataset.categoryId = MEMO_ACTIVE_CATEGORY_ALL;
  allBtn.setAttribute('role', 'menuitemradio');
  const allSelected = activeCategory === MEMO_ACTIVE_CATEGORY_ALL;
  allBtn.setAttribute('aria-checked', allSelected ? 'true' : 'false');
  allBtn.setAttribute('aria-label', `전체, 다이어리 ${allCount}개`);
  if (allSelected) allBtn.classList.add('memo-home-category-option--selected');

  const allName = document.createElement('span');
  allName.className = 'memo-home-category-name';
  allName.textContent = '전체';

  const allCountEl = document.createElement('span');
  allCountEl.className = 'memo-home-category-count';
  allCountEl.textContent = String(allCount);

  const allCheck = document.createElement('span');
  allCheck.className = 'memo-home-category-check';
  allCheck.textContent = '✓';
  allCheck.setAttribute('aria-hidden', 'true');

  allBtn.append(allName, allCountEl, allCheck);
  menu.appendChild(allBtn);

  getMemoCategories().forEach((category) => {
    const count = getMemoCategoryCount(category.id);
    const selected = activeCategory === category.id;

    const row = document.createElement('div');
    row.className = 'memo-home-category-item';

    const optionBtn = document.createElement('button');
    optionBtn.type = 'button';
    optionBtn.className = 'memo-home-category-option';
    optionBtn.dataset.categoryId = category.id;
    optionBtn.setAttribute('role', 'menuitemradio');
    optionBtn.setAttribute('aria-checked', selected ? 'true' : 'false');
    optionBtn.setAttribute('aria-label', `${category.name} 카테고리, 다이어리 ${count}개`);
    if (selected) optionBtn.classList.add('memo-home-category-option--selected');

    const nameEl = document.createElement('span');
    nameEl.className = 'memo-home-category-name';
    nameEl.textContent = category.name;

    const countEl = document.createElement('span');
    countEl.className = 'memo-home-category-count';
    countEl.textContent = String(count);

    const checkEl = document.createElement('span');
    checkEl.className = 'memo-home-category-check';
    checkEl.textContent = '✓';
    checkEl.setAttribute('aria-hidden', 'true');

    optionBtn.append(nameEl, countEl, checkEl);

    const actions = document.createElement('div');
    actions.className = 'memo-home-category-actions';

    const editBtn = document.createElement('button');
    editBtn.type = 'button';
    editBtn.className = 'memo-home-category-edit';
    editBtn.dataset.categoryId = category.id;
    editBtn.setAttribute('aria-label', `${category.name} 카테고리 이름 수정`);
    editBtn.textContent = '✎';

    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = 'memo-home-category-delete';
    deleteBtn.dataset.categoryId = category.id;
    deleteBtn.setAttribute('aria-label', `${category.name} 카테고리 삭제`);
    deleteBtn.textContent = '✕';

    actions.append(editBtn, deleteBtn);
    row.append(optionBtn, actions);
    menu.appendChild(row);
  });

  const addBtn = document.createElement('button');
  addBtn.type = 'button';
  addBtn.className = 'memo-home-category-add';
  addBtn.textContent = '+ 카테고리 추가';
  menu.appendChild(addBtn);

  return menu;
}


function buildMemoCardCategoryControl(memo) {
  const control = document.createElement('div');
  control.className = 'memo-card-category-control';

  const label = document.createElement('label');
  label.className = 'memo-card-category-label';
  label.textContent = '카테고리';

  const select = document.createElement('select');
  select.className = 'memo-card-category-select';
  select.dataset.memoId = memo.id;
  select.setAttribute('aria-label', `${memo.title || '제목 없음'} 카테고리 선택`);

  const noneOption = document.createElement('option');
  noneOption.value = '';
  noneOption.textContent = '카테고리 없음';
  select.appendChild(noneOption);

  getMemoCategories().forEach((category) => {
    const option = document.createElement('option');
    option.value = category.id;
    option.textContent = category.name;
    select.appendChild(option);
  });

  select.value = memo.category || '';
  control.append(label, select);
  return control;
}


function renderMemoHome(container, w) {
  ensureMemoWidgetData(w);
  const profile = getMemoProfile();

  const home = document.createElement('div');
  home.className = 'memo-home';

  const cover = document.createElement('section');
  cover.className = 'memo-home-cover';
  cover.setAttribute('role', 'button');
  cover.tabIndex = 0;
  cover.setAttribute('aria-label', '홈 프로필 편집');

  const coverBg = document.createElement('div');
  coverBg.className = 'memo-home-cover-bg';
  applyCoverBackground(coverBg, profile.coverImage);
  if (profile.coverImage) {
    cover.classList.add('memo-home-cover--has-image');
  }

  const headerText = document.createElement('p');
  headerText.className = 'memo-home-header-text';
  headerText.textContent = profile.headerText ?? '';

  const avatar = document.createElement('div');
  avatar.className = 'memo-home-profile-avatar';
  avatar.setAttribute('aria-hidden', 'true');
  fillProfileAvatarElement(avatar, profile.profileImage);

  const displayName = document.createElement('p');
  displayName.className = 'memo-home-display-name';
  displayName.textContent = profile.displayName || DEFAULT_PROFILE.displayName;

  cover.appendChild(coverBg);
  cover.appendChild(headerText);
  cover.appendChild(avatar);
  cover.appendChild(displayName);

  const toolbar = document.createElement('nav');
  toolbar.className = 'memo-home-toolbar glass-panel';

  const sortWrap = document.createElement('div');
  sortWrap.className = 'memo-home-sort-wrap';

  const sortBtn = document.createElement('button');
  sortBtn.type = 'button';
  sortBtn.className = 'memo-home-sort';
  sortBtn.textContent = `정렬 · ${getMemoSortLabel(w.sortBy)}`;
  sortBtn.setAttribute('aria-haspopup', 'menu');
  sortBtn.setAttribute('aria-expanded', isMemoHomeSortMenuOpen ? 'true' : 'false');

  const sortMenu = document.createElement('div');
  sortMenu.className = 'memo-home-sort-menu';
  sortMenu.hidden = !isMemoHomeSortMenuOpen;
  sortMenu.setAttribute('role', 'menu');
  sortMenu.setAttribute('aria-label', '정렬 옵션');

  MEMO_SORT_OPTIONS.forEach((opt) => {
    const optionBtn = document.createElement('button');
    optionBtn.type = 'button';
    optionBtn.className = 'memo-home-sort-option';
    optionBtn.dataset.sortBy = opt.sortBy;
    optionBtn.setAttribute('role', 'menuitemradio');
    const selected = normalizeMemoSortBy(w.sortBy) === opt.sortBy;
    optionBtn.setAttribute('aria-checked', selected ? 'true' : 'false');
    if (selected) {
      optionBtn.classList.add('memo-home-sort-option--selected');
    }

    const label = document.createElement('span');
    label.className = 'memo-home-sort-option-label';
    label.textContent = opt.label;

    const check = document.createElement('span');
    check.className = 'memo-home-sort-option-check';
    check.textContent = '✓';
    check.setAttribute('aria-hidden', 'true');

    optionBtn.append(label, check);
    sortMenu.appendChild(optionBtn);
  });

  sortWrap.append(sortBtn, sortMenu);

  const categoryWrap = document.createElement('div');
  categoryWrap.className = 'memo-home-category-wrap';

  const categoryBtn = document.createElement('button');
  categoryBtn.type = 'button';
  categoryBtn.className = 'memo-home-category';
  categoryBtn.textContent = `카테고리 · ${getMemoCategoryDisplayName(getMemoActiveCategory())}`;
  categoryBtn.setAttribute('aria-haspopup', 'menu');
  categoryBtn.setAttribute('aria-expanded', isMemoHomeCategoryMenuOpen ? 'true' : 'false');

  const categoryMenu = buildMemoHomeCategoryMenu(w);
  categoryWrap.append(categoryBtn, categoryMenu);

  const editBtn = document.createElement('button');
  editBtn.type = 'button';
  editBtn.className = 'memo-home-edit';
  if (isMemoHomeEditMode) {
    editBtn.classList.add('memo-home-edit--active');
    editBtn.textContent = '완료';
  } else {
    editBtn.textContent = '편집';
  }

  toolbar.append(sortWrap, categoryWrap, editBtn);

  let searchMeta = null;
  if (isMemoHomeSearchOpen) {
    searchMeta = document.createElement('p');
    searchMeta.className = 'memo-home-search-meta';
    searchMeta.setAttribute('aria-live', 'polite');
    searchMeta.hidden = !hasActiveMemoHomeSearchQuery();
    if (hasActiveMemoHomeSearchQuery()) {
      searchMeta.textContent = `검색 결과 ${getDisplayMemos(w).length}개`;
    }
  }

  const cardsSection = document.createElement('section');
  cardsSection.className = 'memo-home-cards';
  fillMemoHomeCardsSection(cardsSection, w);

  const fab = document.createElement('div');
  fab.className = 'memo-home-fab';

  const fabActions = document.createElement('div');
  fabActions.className = 'memo-home-fab-actions';
  if (fabExpanded) fabActions.classList.add('memo-home-fab-actions--open');

  const searchBtn = document.createElement('button');
  searchBtn.type = 'button';
  searchBtn.className = 'memo-home-fab-search';
  if (isMemoHomeSearchOpen) {
    searchBtn.classList.add('memo-home-search-fab--active');
  }
  searchBtn.title = '검색';
  searchBtn.setAttribute('aria-label', 'Memo 검색 열기');
  searchBtn.textContent = '🔍';

  const newBtn = document.createElement('button');
  newBtn.type = 'button';
  newBtn.className = 'memo-home-fab-new';
  newBtn.title = '새 메모';
  newBtn.setAttribute('aria-label', '새 메모');
  newBtn.textContent = '+';

  const toggleBtn = document.createElement('button');
  toggleBtn.type = 'button';
  toggleBtn.className = 'memo-home-fab-toggle';
  toggleBtn.title = '메뉴';
  toggleBtn.setAttribute('aria-label', '메뉴');
  toggleBtn.textContent = '⋯';

  fabActions.append(searchBtn, newBtn);
  fab.append(fabActions, toggleBtn);

  home.appendChild(cover);
  if (isMemoHomeSearchOpen) {
    home.appendChild(buildMemoHomeSearchBar());
  }
  home.appendChild(toolbar);
  if (searchMeta) home.appendChild(searchMeta);
  home.append(cardsSection, fab);
  container.appendChild(home);
}


function renderMemoFullscreen() {
  const w = getActiveMemoWidget();
  if (!w || !dom.memoFullscreenBody) return;

  if (fullscreenViewMode !== 'home') {
    isMemoHomeSortMenuOpen = false;
    isMemoHomeCategoryMenuOpen = false;
    isMemoHomeEditMode = false;
  }
  if (fullscreenViewMode !== 'pageEditor') {
    isPageEditorCategoryMenuOpen = false;
  }
  if (fullscreenViewMode !== 'createSetup' && isMemoDeleteSelectionMode) {
    resetMemoDeleteSelectionState();
  }
  if (fullscreenViewMode !== 'draftDetail' && fullscreenViewMode !== 'pageEditor') {
    resetArchiveDetailState();
  }
  if (fullscreenViewMode !== 'createSetup'
    && fullscreenViewMode !== 'pageEditor'
    && fullscreenViewMode !== 'draftDetail') {
    closeArchivePopup();
  }
  if (fullscreenViewMode !== 'createSetup' && isMemoPageManagerOpen) {
    resetMemoPageManagerSession();
  }

  dom.memoFullscreenBody.replaceChildren();
  dom.memoFullscreenBody.classList.toggle('memo-fullscreen-body--home', fullscreenViewMode === 'home');
  dom.memoFullscreenBody.classList.toggle('memo-fullscreen-body--editor', fullscreenViewMode === 'editor');
  dom.memoFullscreenBody.classList.toggle(
    'memo-fullscreen-body--profile-editor',
    fullscreenViewMode === 'profileEditor'
  );
  dom.memoFullscreenBody.classList.toggle(
    'memo-fullscreen-body--create-setup',
    fullscreenViewMode === 'createSetup'
  );
  dom.memoFullscreenBody.classList.toggle(
    'memo-fullscreen-body--page-editor',
    fullscreenViewMode === 'pageEditor'
  );
  dom.memoFullscreenBody.classList.toggle(
    'memo-fullscreen-body--draft-detail',
    fullscreenViewMode === 'draftDetail'
  );

  if (fullscreenViewMode === 'editor') {
    renderMemoEditor(dom.memoFullscreenBody, w);
  } else if (fullscreenViewMode === 'profileEditor') {
    renderProfileEditor(dom.memoFullscreenBody, w);
  } else if (fullscreenViewMode === 'createSetup') {
    renderMemoCreateSetup(dom.memoFullscreenBody, w);
  } else if (fullscreenViewMode === 'pageEditor') {
    renderTextPageEditor(dom.memoFullscreenBody, w);
  } else if (fullscreenViewMode === 'draftDetail') {
    renderDraftDetail(dom.memoFullscreenBody, w);
  } else {
    renderMemoHome(dom.memoFullscreenBody, w);
    if (isMemoHomeSearchOpen) {
      requestAnimationFrame(() => {
        dom.memoFullscreenBody?.querySelector('.memo-home-search-input')?.focus();
      });
    }
  }
}


export function openMemoFullscreen(widgetId) {
  const w = state.widgets.find((x) => x.id === widgetId);
  if (!w || w.type !== 'memo') return;

  activeMemoWidgetId = widgetId;
  fullscreenViewMode = 'home';
  selectedMemoId = null;
  fabExpanded = false;
  isCreateSetupMenuOpen = false;
  isMemoHomeSortMenuOpen = false;
  resetTemplatePopupSessionState();
  resetPageEditorSessionState();
  editorDrafts.delete(widgetId);
  profileDrafts.delete(widgetId);

  if (dom.memoFullscreenTitle) {
    dom.memoFullscreenTitle.textContent = 'Memo';
  }

  dom.editorPage?.classList.add('memo-overlay-open');
  dom.memoFullscreenOverlay.classList.remove('hidden');
  requestAnimationFrame(() => {
    dom.memoFullscreenOverlay.classList.add('active');
  });

  renderMemoFullscreen();
}


export function closeMemoFullscreen() {
  const widgetId = activeMemoWidgetId;

  if (widgetId) {
    editorDrafts.delete(widgetId);
    profileDrafts.delete(widgetId);
  }

  resetFullscreenSession();

  dom.memoFullscreenOverlay.classList.remove('active');
  dom.editorPage?.classList.remove('memo-overlay-open');

  setTimeout(() => {
    dom.memoFullscreenOverlay.classList.add('hidden');
    if (dom.memoFullscreenBody) {
      dom.memoFullscreenBody.replaceChildren();
      dom.memoFullscreenBody.classList.remove(
        'memo-fullscreen-body--home',
        'memo-fullscreen-body--editor',
        'memo-fullscreen-body--profile-editor',
        'memo-fullscreen-body--create-setup',
        'memo-fullscreen-body--page-editor',
        'memo-fullscreen-body--page-reader'
      );
    }
  }, 200);

  if (widgetId) {
    refreshMemoPreview(widgetId);
  }
}


function toggleMemoFab() {
  fabExpanded = !fabExpanded;
  const actions = dom.memoFullscreenBody?.querySelector('.memo-home-fab-actions');
  if (actions) {
    actions.classList.toggle('memo-home-fab-actions--open', fabExpanded);
  }
}


function openMemoCreateSetup() {
  const w = getActiveMemoWidget();
  if (!w) return;

  fullscreenViewMode = 'createSetup';
  selectedMemoId = null;
  fabExpanded = false;
  isCreateSetupMenuOpen = false;
  resetTemplatePopupSessionState();
  currentDiaryId = null;
  currentPageId = null;
  pageEditorDrafts.delete(w.id);
  pageEditorBaselines.delete(w.id);
  renderMemoFullscreen();
}


function goBackFromCreateSetup() {
  const w = getActiveMemoWidget();
  isCreateSetupMenuOpen = false;
  resetTemplatePopupSessionState();
  if (w) {
    pageEditorDrafts.delete(w.id);
    pageEditorBaselines.delete(w.id);
  }
  currentDiaryId = null;
  currentPageId = null;
  isPageTurning = false;
  fullscreenViewMode = 'home';
  selectedMemoId = null;
  renderMemoFullscreen();
}


/**
 * 속지선택 완료 후 editor 진입.
 * 향후 속지 선택 UI에서 선택 결과와 함께 호출합니다.
 */
function startMemoFromTemplateSelection(templateInfo = {}) {
  const w = getActiveMemoWidget();
  if (!w) return;

  isCreateSetupMenuOpen = false;
  resetTemplatePopupSessionState();
  fullscreenViewMode = 'editor';
  selectedMemoId = null;
  editorDrafts.set(w.id, {
    title: '',
    content: '',
    template: templateInfo,
  });
  renderMemoFullscreen();
}


function openMemoEditor(memoId = null) {
  const w = getActiveMemoWidget();
  if (!w) return;

  isCreateSetupMenuOpen = false;
  fullscreenViewMode = 'editor';
  selectedMemoId = memoId;
  fabExpanded = false;

  if (memoId) {
    editorDrafts.delete(w.id);
  }

  renderMemoFullscreen();
}


function normalizeDisplayName(raw) {
  const trimmed = (raw || '').trim();
  return trimmed || 'Guest';
}


function fillProfileAvatarElement(el, profileImage) {
  el.replaceChildren();
  if (profileImage) {
    const img = document.createElement('img');
    img.src = profileImage;
    img.alt = '';
    el.appendChild(img);
  } else {
    el.textContent = '프사';
  }
}


function applyCoverBackground(el, coverImage) {
  if (coverImage) {
    el.style.backgroundImage = `url(${coverImage})`;
    el.classList.add('memo-home-cover-bg--has-image');
  } else {
    el.style.backgroundImage = '';
    el.classList.remove('memo-home-cover-bg--has-image');
  }
}


function validateImageFile(file) {
  if (!file.type.startsWith('image/')) {
    showToast('이미지 파일만 선택할 수 있습니다.');
    return false;
  }

  if (file.size > IMAGE_MAX_BYTES) {
    showToast('파일 크기가 너무 큽니다. 다른 이미지를 선택해 주세요.');
    return false;
  }

  return true;
}


function readFileAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('READ_FAILED'));
    reader.readAsDataURL(file);
  });
}


function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('LOAD_FAILED'));
    img.src = src;
  });
}


async function compressProfileImage(file) {
  if (!file.type.startsWith('image/')) {
    throw new Error('INVALID_TYPE');
  }

  const dataUrl = await readFileAsDataURL(file);
  const img = await loadImage(dataUrl);

  const cropSize = Math.min(img.width, img.height);
  const sx = (img.width - cropSize) / 2;
  const sy = (img.height - cropSize) / 2;

  const canvas = document.createElement('canvas');
  canvas.width = PROFILE_IMAGE_OUTPUT_SIZE;
  canvas.height = PROFILE_IMAGE_OUTPUT_SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('CANVAS_FAILED');

  ctx.fillStyle = IMAGE_BG;
  ctx.fillRect(0, 0, PROFILE_IMAGE_OUTPUT_SIZE, PROFILE_IMAGE_OUTPUT_SIZE);
  ctx.drawImage(
    img,
    sx,
    sy,
    cropSize,
    cropSize,
    0,
    0,
    PROFILE_IMAGE_OUTPUT_SIZE,
    PROFILE_IMAGE_OUTPUT_SIZE
  );

  return canvas.toDataURL('image/jpeg', PROFILE_IMAGE_JPEG_QUALITY);
}


async function compressCoverImage(file) {
  if (!file.type.startsWith('image/')) {
    throw new Error('INVALID_TYPE');
  }

  const dataUrl = await readFileAsDataURL(file);
  const img = await loadImage(dataUrl);

  const srcAspect = img.width / img.height;
  let cropWidth;
  let cropHeight;
  let sx;
  let sy;

  if (srcAspect > COVER_ASPECT) {
    cropHeight = img.height;
    cropWidth = cropHeight * COVER_ASPECT;
    sx = (img.width - cropWidth) / 2;
    sy = 0;
  } else {
    cropWidth = img.width;
    cropHeight = cropWidth / COVER_ASPECT;
    sx = 0;
    sy = (img.height - cropHeight) / 2;
  }

  const scale = Math.min(COVER_MAX_WIDTH / cropWidth, COVER_MAX_HEIGHT / cropHeight, 1);
  const outWidth = Math.max(1, Math.round(cropWidth * scale));
  const outHeight = Math.max(1, Math.round(cropHeight * scale));

  const canvas = document.createElement('canvas');
  canvas.width = outWidth;
  canvas.height = outHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('CANVAS_FAILED');

  ctx.fillStyle = IMAGE_BG;
  ctx.fillRect(0, 0, outWidth, outHeight);
  ctx.drawImage(
    img,
    sx,
    sy,
    cropWidth,
    cropHeight,
    0,
    0,
    outWidth,
    outHeight
  );

  return canvas.toDataURL('image/jpeg', COVER_JPEG_QUALITY);
}


function updateProfileEditorAvatarPreview(container, profileImage) {
  const preview = container.querySelector('.memo-profile-avatar-preview');
  if (preview) fillProfileAvatarElement(preview, profileImage);
}


function updateProfileEditorCoverPreview(container, coverImage) {
  const preview = container.querySelector('.memo-profile-cover-preview');
  if (preview) applyCoverBackground(preview, coverImage);
}


async function handleProfileImageSelected(w, container, file) {
  if (!validateImageFile(file)) return;

  try {
    const dataUrl = await compressProfileImage(file);
    syncProfileDraftFromForm(container, w);
    const current = profileDrafts.get(w.id) || getProfileDraft(w);
    profileDrafts.set(w.id, {
      ...current,
      profileImage: dataUrl,
    });
    updateProfileEditorAvatarPreview(container, dataUrl);
  } catch {
    showToast('이미지를 처리할 수 없습니다.');
  }
}


async function handleCoverImageSelected(w, container, file) {
  if (!validateImageFile(file)) return;

  try {
    const dataUrl = await compressCoverImage(file);
    syncProfileDraftFromForm(container, w);
    const current = profileDrafts.get(w.id) || getProfileDraft(w);
    profileDrafts.set(w.id, {
      ...current,
      coverImage: dataUrl,
    });
    updateProfileEditorCoverPreview(container, dataUrl);
  } catch {
    showToast('커버 이미지를 처리할 수 없습니다.');
  }
}


function getProfileDraft(w) {
  if (profileDrafts.has(w.id)) {
    return profileDrafts.get(w.id);
  }

  const profile = getMemoProfile();
  return {
    coverImage: profile.coverImage ?? '',
    headerText: profile.headerText ?? '',
    displayName: profile.displayName ?? DEFAULT_PROFILE.displayName,
    profileImage: profile.profileImage ?? '',
  };
}


function syncProfileDraftFromForm(container, w) {
  const headerInput = container.querySelector('.memo-profile-header-text');
  const nameInput = container.querySelector('.memo-profile-display-name');
  if (!headerInput || !nameInput) return;

  const current = profileDrafts.get(w.id) || getProfileDraft(w);
  profileDrafts.set(w.id, {
    coverImage: current.coverImage ?? '',
    headerText: headerInput.value,
    displayName: nameInput.value,
    profileImage: current.profileImage ?? '',
  });
}


function openProfileEditor() {
  const w = getActiveMemoWidget();
  if (!w) return;

  ensureMemoWidgetData(w);
  isCreateSetupMenuOpen = false;
  fullscreenViewMode = 'profileEditor';
  fabExpanded = false;
  const profile = getMemoProfile();
  profileDrafts.set(w.id, {
    coverImage: profile.coverImage ?? '',
    headerText: profile.headerText ?? '',
    displayName: profile.displayName ?? DEFAULT_PROFILE.displayName,
    profileImage: profile.profileImage ?? '',
  });

  renderMemoFullscreen();
}


function renderProfileEditor(container, w) {
  const panel = document.createElement('div');
  panel.className = 'memo-profile-editor';

  const backBtn = document.createElement('button');
  backBtn.type = 'button';
  backBtn.className = 'memo-profile-cancel';
  backBtn.textContent = '← 취소';

  const heading = document.createElement('h2');
  heading.className = 'memo-profile-heading';
  heading.textContent = '홈 프로필 편집';

  const coverSection = document.createElement('div');
  coverSection.className = 'memo-profile-cover-section';

  const coverLabel = document.createElement('p');
  coverLabel.className = 'memo-profile-label';
  coverLabel.textContent = '커버 이미지';

  const coverPreview = document.createElement('div');
  coverPreview.className = 'memo-profile-cover-preview';

  const coverActions = document.createElement('div');
  coverActions.className = 'memo-profile-cover-actions';

  const coverFileInput = document.createElement('input');
  coverFileInput.type = 'file';
  coverFileInput.className = 'memo-profile-cover-file-input hidden';
  coverFileInput.accept = 'image/*';

  const coverSelectBtn = document.createElement('button');
  coverSelectBtn.type = 'button';
  coverSelectBtn.className = 'btn-secondary memo-profile-select-cover';
  coverSelectBtn.textContent = '커버 선택';

  const coverRemoveBtn = document.createElement('button');
  coverRemoveBtn.type = 'button';
  coverRemoveBtn.className = 'btn-secondary memo-profile-remove-cover';
  coverRemoveBtn.textContent = '커버 제거';

  const imageSection = document.createElement('div');
  imageSection.className = 'memo-profile-image-section';

  const profileLabel = document.createElement('p');
  profileLabel.className = 'memo-profile-label';
  profileLabel.textContent = '프로필 이미지';

  const avatarPreview = document.createElement('div');
  avatarPreview.className = 'memo-profile-avatar-preview memo-home-profile-avatar';

  const imageActions = document.createElement('div');
  imageActions.className = 'memo-profile-image-actions';

  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.className = 'memo-profile-file-input hidden';
  fileInput.accept = 'image/*';

  const selectBtn = document.createElement('button');
  selectBtn.type = 'button';
  selectBtn.className = 'btn-secondary memo-profile-select-image';
  selectBtn.textContent = '이미지 선택';

  const removeBtn = document.createElement('button');
  removeBtn.type = 'button';
  removeBtn.className = 'btn-secondary memo-profile-remove-image';
  removeBtn.textContent = '이미지 제거';

  const draft = getProfileDraft(w);
  applyCoverBackground(coverPreview, draft.coverImage);
  fillProfileAvatarElement(avatarPreview, draft.profileImage);
  profileDrafts.set(w.id, { ...draft });

  coverFileInput.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    await handleCoverImageSelected(w, container, file);
  });

  coverSelectBtn.addEventListener('click', () => {
    coverFileInput.click();
  });

  fileInput.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    await handleProfileImageSelected(w, container, file);
  });

  coverActions.append(coverFileInput, coverSelectBtn, coverRemoveBtn);
  coverSection.append(coverLabel, coverPreview, coverActions);

  imageActions.append(fileInput, selectBtn, removeBtn);
  imageSection.append(profileLabel, avatarPreview, imageActions);

  const headerLabel = document.createElement('label');
  headerLabel.className = 'memo-profile-label';
  headerLabel.htmlFor = 'memo-profile-header-text';
  headerLabel.textContent = '홈 문구';

  const headerInput = document.createElement('textarea');
  headerInput.id = 'memo-profile-header-text';
  headerInput.className = 'memo-profile-header-text';
  headerInput.placeholder = '커버 영역에 표시할 문구';
  headerInput.rows = 3;
  headerInput.maxLength = 200;
  headerInput.value = draft.headerText;

  const nameLabel = document.createElement('label');
  nameLabel.className = 'memo-profile-label';
  nameLabel.htmlFor = 'memo-profile-display-name';
  nameLabel.textContent = '이름';

  const nameInput = document.createElement('input');
  nameInput.type = 'text';
  nameInput.id = 'memo-profile-display-name';
  nameInput.className = 'memo-profile-display-name';
  nameInput.placeholder = '이름';
  nameInput.maxLength = 40;
  nameInput.value = draft.displayName;

  const onInput = () => syncProfileDraftFromForm(container, w);
  headerInput.addEventListener('input', onInput);
  nameInput.addEventListener('input', onInput);

  const saveBtn = document.createElement('button');
  saveBtn.type = 'button';
  saveBtn.className = 'btn-primary memo-profile-save';
  saveBtn.textContent = '저장';

  panel.append(
    backBtn,
    heading,
    coverSection,
    imageSection,
    headerLabel,
    headerInput,
    nameLabel,
    nameInput,
    saveBtn
  );
  container.appendChild(panel);
}


function renderMemoCreateSetup(container, w) {
  const setup = document.createElement('div');
  setup.className = 'memo-create-setup';

  const backBtn = document.createElement('button');
  backBtn.type = 'button';
  backBtn.className = 'memo-create-setup-back';
  backBtn.textContent = '←';
  backBtn.setAttribute('aria-label', '홈으로');

  const book = document.createElement('div');
  book.className = 'memo-create-setup-binder memo-binder-book glass-panel';

  const leftCover = document.createElement('div');
  leftCover.className = 'memo-binder-cover-side memo-binder-cover-side--left';

  const leftSlot = document.createElement('div');
  leftSlot.className = 'memo-binder-sheet-slot memo-binder-sheet-slot--left';
  leftCover.appendChild(leftSlot);

  const spine = document.createElement('div');
  spine.className = 'memo-create-setup-spine memo-binder-rings';
  spine.setAttribute('aria-hidden', 'true');

  for (let i = 0; i < 3; i += 1) {
    const ring = document.createElement('span');
    ring.className = 'memo-create-setup-ring';
    spine.appendChild(ring);
  }

  const rightCover = document.createElement('div');
  rightCover.className = 'memo-binder-cover-side memo-binder-cover-side--right';

  const menuAnchor = document.createElement('div');
  menuAnchor.className = 'memo-create-setup-menu-anchor';

  const bookmark = document.createElement('button');
  bookmark.type = 'button';
  bookmark.className = 'memo-create-setup-bookmark memo-create-setup-bookmark-toggle';
  bookmark.setAttribute('aria-label', '설정 메뉴 열기');
  bookmark.setAttribute('aria-expanded', 'false');
  bookmark.setAttribute('aria-haspopup', 'menu');

  const menuPanel = document.createElement('div');
  menuPanel.className = 'memo-create-setup-menu';
  menuPanel.setAttribute('role', 'menu');
  menuPanel.hidden = true;

  createSetupMenuItems.forEach((item, index) => {
    const menuBtn = document.createElement('button');
    menuBtn.type = 'button';
    menuBtn.className = 'memo-create-setup-menu-item';
    menuBtn.dataset.setupId = item.id;
    menuBtn.setAttribute('role', 'menuitem');
    menuBtn.textContent = item.label;
    menuPanel.appendChild(menuBtn);

    if (index < createSetupMenuItems.length - 1) {
      const divider = document.createElement('span');
      divider.className = 'memo-create-setup-menu-divider';
      divider.setAttribute('aria-hidden', 'true');
      menuPanel.appendChild(divider);
    }
  });

  menuAnchor.append(bookmark, menuPanel);

  const rightSlot = document.createElement('div');
  rightSlot.className = 'memo-binder-sheet-slot memo-binder-sheet-slot--right';

  rightCover.append(menuAnchor, rightSlot);
  book.append(leftCover, spine, rightCover);

  const memo = getActiveCreateSetupMemo(w);
  const nav = buildBinderPageNav(memo);

  const binderStage = document.createElement('div');
  binderStage.className = 'memo-binder-stage';
  binderStage.append(book, nav);

  const stage = document.createElement('div');
  stage.className = 'memo-create-setup-stage';
  stage.append(
    binderStage,
    buildTemplatePopupElement(),
    buildArchivePopupElement(),
    buildMemoPageManagerOverlayElement()
  );
  ensureArchiveMenuLayer();

  setup.append(backBtn, stage);

  if (previewPickerTargetWidgetId) {
    setup.classList.add('memo-create-setup--preview-picker');
    const pickerBar = document.createElement('div');
    pickerBar.className = 'memo-preview-picker-bar glass-panel';

    const pickerHint = document.createElement('p');
    pickerHint.className = 'memo-preview-picker-hint';
    pickerHint.textContent = '미리보기로 표시할 페이지를 선택하세요.';

    const addBtn = document.createElement('button');
    addBtn.type = 'button';
    addBtn.className = 'btn-primary memo-preview-picker-add';
    addBtn.textContent = '추가';
    addBtn.disabled = !previewPickerSelectedPageId;

    pickerBar.append(pickerHint, addBtn);
    setup.appendChild(pickerBar);
  } else if (isMemoDeleteSelectionMode) {
    setup.classList.add('memo-create-setup--delete-selection');
    setup.appendChild(buildMemoDeleteSelectionBar());
  }

  container.appendChild(setup);

  refreshBinderSpreadView(w);
  syncCreateSetupMenuUi();
  syncTemplatePopupUi();
  syncArchivePopupUi();
  syncMemoPageManagerUi();
}


function saveProfileFromDraft(w) {
  syncProfileDraftFromForm(dom.memoFullscreenBody, w);
  const draft = profileDrafts.get(w.id) || getProfileDraft(w);

  const profile = getMemoProfile();
  profile.coverImage = draft.coverImage ?? '';
  profile.headerText = draft.headerText ?? '';
  profile.displayName = normalizeDisplayName(draft.displayName);
  profile.profileImage = draft.profileImage ?? '';
  saveMemoProfile();

  profileDrafts.delete(w.id);
  isCreateSetupMenuOpen = false;
  fullscreenViewMode = 'home';
  renderMemoFullscreen();
  showToast('프로필이 저장되었습니다.');
}


function cancelProfileEditor(w) {
  profileDrafts.delete(w.id);
  isCreateSetupMenuOpen = false;
  fullscreenViewMode = 'home';
  renderMemoFullscreen();
}


function getEditorDraft(w) {
  if (editorDrafts.has(w.id)) {
    return editorDrafts.get(w.id);
  }

  if (selectedMemoId) {
    const memo = findSharedMemoById(selectedMemoId);
    if (memo) {
      const title = memo.title === '제목 없음' ? '' : memo.title;
      return { title, content: memo.content || '' };
    }
  }

  return { title: '', content: '' };
}


function syncDraftFromEditor(container, w) {
  const titleInput = container.querySelector('.memo-editor-title');
  const contentArea = container.querySelector('.memo-editor-content');
  if (!titleInput || !contentArea) return;

  editorDrafts.set(w.id, {
    title: titleInput.value,
    content: contentArea.value,
  });
}


function renderMemoEditor(container, w) {
  const scroll = document.createElement('div');
  scroll.className = 'memo-editor-scroll';

  const backBtn = document.createElement('button');
  backBtn.type = 'button';
  backBtn.className = 'memo-editor-back';
  backBtn.textContent = '← 홈';

  const titleInput = document.createElement('input');
  titleInput.type = 'text';
  titleInput.className = 'memo-editor-title';
  titleInput.placeholder = '제목';
  titleInput.maxLength = 120;

  const contentArea = document.createElement('textarea');
  contentArea.className = 'memo-editor-content';
  contentArea.placeholder = '내용을 입력하세요';

  const draft = getEditorDraft(w);
  titleInput.value = draft.title;
  contentArea.value = draft.content;
  editorDrafts.set(w.id, { ...draft });

  titleInput.addEventListener('input', () => syncDraftFromEditor(container, w));
  contentArea.addEventListener('input', () => syncDraftFromEditor(container, w));

  const actions = document.createElement('div');
  actions.className = 'memo-editor-actions';

  const saveBtn = document.createElement('button');
  saveBtn.type = 'button';
  saveBtn.className = 'btn-primary memo-editor-save';
  saveBtn.textContent = '저장';
  actions.appendChild(saveBtn);

  if (selectedMemoId) {
    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = 'btn-secondary memo-editor-delete';
    deleteBtn.textContent = '삭제';
    actions.appendChild(deleteBtn);
  }

  scroll.appendChild(backBtn);
  scroll.appendChild(titleInput);
  scroll.appendChild(contentArea);
  scroll.appendChild(actions);
  container.appendChild(scroll);
}


function saveMemoFromDraft(w) {
  syncDraftFromEditor(dom.memoFullscreenBody, w);
  const draft = editorDrafts.get(w.id) || getEditorDraft(w);
  const title = normalizeTitle(draft.title);
  const content = draft.content || '';
  const now = new Date().toISOString();

  if (selectedMemoId) {
    const memo = findSharedMemoById(selectedMemoId);
    if (memo) {
      memo.title = title;
      memo.content = content;
      memo.updatedAt = now;
    }
  } else {
    getSharedMemos().push({
      id: crypto.randomUUID(),
      title,
      content,
      category: '',
      coverImage: '',
      pages: [],
      drafts: [],
      createdAt: now,
      updatedAt: now,
    });
  }

  saveMemoData();

  editorDrafts.delete(w.id);
  isCreateSetupMenuOpen = false;
  fullscreenViewMode = 'home';
  selectedMemoId = null;
  fabExpanded = false;
  renderMemoFullscreen();
  refreshMemoPreview(w.id);
  showToast('메모가 저장되었습니다.');
}


async function deleteMemo(w) {
  if (!selectedMemoId) return;

  const ok = await openConfirmDialog({
    title: '메모 삭제',
    message: '이 메모를 삭제하시겠습니까?',
    confirmLabel: '삭제',
    danger: true,
  });
  if (!ok) return;

  const memos = getSharedMemos();
  const index = memos.findIndex((m) => m.id === selectedMemoId);
  if (index >= 0) {
    memos.splice(index, 1);
    saveMemoData();
  }
  editorDrafts.delete(w.id);
  isCreateSetupMenuOpen = false;
  fullscreenViewMode = 'home';
  selectedMemoId = null;
  fabExpanded = false;
  renderMemoFullscreen();
  refreshMemoPreview(w.id);
  showToast('메모가 삭제되었습니다.');
}


function goBackToHome(w) {
  editorDrafts.delete(w.id);
  isCreateSetupMenuOpen = false;
  fullscreenViewMode = 'home';
  selectedMemoId = null;
  renderMemoFullscreen();
}


export function bindMemoFullscreenEvents() {
  if (dom.memoFullscreenOverlay.dataset.bound) return;
  dom.memoFullscreenOverlay.dataset.bound = '1';

  dom.memoFullscreenBack.addEventListener('click', closeMemoFullscreen);
  bindMemoReadModePhotoLightbox(dom.memoFullscreenBody, dom.memoFullscreenBody);

  dom.memoFullscreenBody.addEventListener('dblclick', (e) => {
    const w = getActiveMemoWidget();
    if (!w || fullscreenViewMode !== 'createSetup') return;
    if (previewPickerTargetWidgetId || isMemoDeleteSelectionMode) return;
    const sheet = e.target.closest('.memo-binder-sheet');
    if (sheet?.dataset.pageId) {
      openBinderPageEditor(w, sheet.dataset.pageId);
    }
  });

  dom.memoFullscreenBody.addEventListener('change', (e) => {
    const select = e.target.closest('.memo-card-category-select');
    if (!select?.dataset.memoId) return;

    const w = getActiveMemoWidget();
    if (!w || fullscreenViewMode !== 'home' || !isMemoHomeEditMode) return;

    if (assignMemoDiaryCategory(select.dataset.memoId, select.value)) {
      renderMemoFullscreen();
      refreshMemoPreview(w.id);
    }
  });

  dom.memoFullscreenBody.addEventListener('input', (e) => {
    const input = e.target.closest('.memo-home-search-input');
    if (!input) return;

    const w = getActiveMemoWidget();
    if (!w || fullscreenViewMode !== 'home' || !isMemoHomeSearchOpen) return;

    memoHomeSearchQuery = input.value;
    refreshMemoHomeCardList(w);
    syncMemoHomeSearchControls();
  });

  dom.memoFullscreenBody.addEventListener('pointerdown', (e) => {
    if (fullscreenViewMode !== 'pageEditor') return;
    const alignBtn = e.target.closest('.memo-text-page-tool[data-tool-id="align"]');
    if (!alignBtn) return;
    saveMemoEditorAlignmentRange(getActivePageEditorContentEditor(), e);
  });

  dom.memoFullscreenBody.addEventListener('click', (e) => {
    const w = getActiveMemoWidget();
    if (!w) return;

    if (fullscreenViewMode === 'home') {
      const sortOption = e.target.closest('.memo-home-sort-option');
      if (sortOption?.dataset.sortBy) {
        applyMemoSort(w, sortOption.dataset.sortBy);
        closeMemoHomeMenus();
        renderMemoFullscreen();
        refreshMemoPreview(w.id);
        return;
      }

      if (e.target.closest('.memo-home-sort-wrap')) {
        if (e.target.closest('.memo-home-sort')) {
          isMemoHomeCategoryMenuOpen = false;
          isMemoHomeSortMenuOpen = !isMemoHomeSortMenuOpen;
          renderMemoFullscreen();
        }
        return;
      }

      const categoryEditBtn = e.target.closest('.memo-home-category-edit');
      if (categoryEditBtn?.dataset.categoryId) {
        e.stopPropagation();
        promptEditMemoCategory(categoryEditBtn.dataset.categoryId, w);
        return;
      }

      const categoryDeleteBtn = e.target.closest('.memo-home-category-delete');
      if (categoryDeleteBtn?.dataset.categoryId) {
        e.stopPropagation();
        confirmDeleteMemoCategory(categoryDeleteBtn.dataset.categoryId, w);
        return;
      }

      if (e.target.closest('.memo-home-category-add')) {
        promptAddMemoCategory(w);
        return;
      }

      const categoryOption = e.target.closest('.memo-home-category-option');
      if (categoryOption?.dataset.categoryId) {
        setMemoActiveCategory(categoryOption.dataset.categoryId);
        isMemoHomeCategoryMenuOpen = false;
        renderMemoFullscreen();
        return;
      }

      if (e.target.closest('.memo-home-category-wrap')) {
        if (e.target.closest('.memo-home-category')) {
          isMemoHomeSortMenuOpen = false;
          isMemoHomeCategoryMenuOpen = !isMemoHomeCategoryMenuOpen;
          renderMemoFullscreen();
        }
        return;
      }

      if (isMemoHomeSortMenuOpen || isMemoHomeCategoryMenuOpen) {
        closeMemoHomeMenus();
        renderMemoFullscreen();
      }

      if (e.target.closest('.memo-home-search-clear')) {
        e.stopPropagation();
        clearMemoHomeSearchQuery(w);
        return;
      }

      if (e.target.closest('.memo-home-search-close')) {
        e.stopPropagation();
        closeMemoHomeSearch(w);
        return;
      }

      if (e.target.closest('.memo-home-search-bar')) {
        return;
      }

      if (e.target.closest('.memo-home-edit')) {
        if (!isMemoHomeEditMode) {
          isMemoHomeSearchOpen = false;
          memoHomeSearchQuery = '';
        }
        isMemoHomeEditMode = !isMemoHomeEditMode;
        closeMemoHomeMenus();
        renderMemoFullscreen();
        return;
      }

      if (e.target.closest('.memo-home-cover')) {
        openProfileEditor();
        return;
      }
      if (e.target.closest('.memo-home-fab-toggle')) {
        toggleMemoFab();
        return;
      }
      if (e.target.closest('.memo-home-fab-search')) {
        toggleMemoHomeSearch(w);
        return;
      }
      if (e.target.closest('.memo-home-fab-new')) {
        openMemoCreateSetup();
        return;
      }

      const deleteDiaryBtn = e.target.closest('.memo-home-card-delete');
      if (deleteDiaryBtn?.dataset.memoId) {
        e.preventDefault();
        e.stopPropagation();
        if (isMemoDiaryDeleteInProgress) return;
        showMemoDiaryDeleteConfirmDialog(() => executeDeleteMemoDiary(w, deleteDiaryBtn.dataset.memoId));
        return;
      }

      const card = e.target.closest('.memo-home-card');
      if (card?.dataset.memoId) {
        if (
          isMemoHomeEditMode
          || e.target.closest('.memo-card-category-control')
          || e.target.closest('.memo-home-card-delete')
        ) {
          return;
        }
        if (previewPickerTargetWidgetId) {
          previewPickerSelectedPageId = null;
        }
        openMemoBinderForDiary(w, card.dataset.memoId);
        return;
      }

      return;
    }

    if (
      fullscreenViewMode === 'createSetup'
      || fullscreenViewMode === 'pageEditor'
      || fullscreenViewMode === 'draftDetail'
    ) {
      if (e.target.closest('.memo-archive-popup-close') || e.target.closest('.memo-archive-popup-backdrop')) {
        closeArchiveDraftCardMenu();
        closeArchivePopup();
        return;
      }
      if (
        e.target.closest('.memo-archive-popup-dialog')
        && !e.target.closest('.memo-archive-draft-menu-btn')
        && !e.target.closest('.memo-archive-draft-menu')
      ) {
        closeArchiveDraftCardMenu();
      }
      const archiveMenuBtn = e.target.closest('.memo-archive-draft-menu-btn');
      if (archiveMenuBtn?.dataset.draftId) {
        e.preventDefault();
        e.stopPropagation();
        openArchiveDraftCardMenu(w, archiveMenuBtn, archiveMenuBtn.dataset.draftId, e);
        return;
      }
      const archiveCard = e.target.closest('.memo-archive-draft-card');
      if (archiveCard?.dataset.draftId) {
        openDraftDetail(w, archiveCard.dataset.draftId);
        return;
      }
      if (e.target.closest('.memo-archive-popup-dialog')) {
        return;
      }
    }

    if (fullscreenViewMode === 'draftDetail') {
      if (e.target.closest('.memo-draft-add-cancel')) {
        removeDraftAddConfirmDialog();
        return;
      }
      if (e.target.closest('.memo-draft-add-scope-cancel')) {
        removeDraftAddScopeDialog();
        return;
      }
      if (e.target.closest('.memo-draft-delete-cancel')) {
        removeArchiveDraftDeleteDialog();
        return;
      }
      if (e.target.closest('.memo-draft-detail-back')) {
        resetArchiveDetailState();
        fullscreenViewMode = 'createSetup';
        renderMemoFullscreen();
        return;
      }
      if (e.target.closest('.memo-draft-detail-nav-prev')) {
        navigateArchiveDraftDetail(-1);
        return;
      }
      if (e.target.closest('.memo-draft-detail-nav-next')) {
        navigateArchiveDraftDetail(1);
        return;
      }
      if (e.target.closest('.memo-draft-insert-option')) {
        const btn = e.target.closest('.memo-draft-insert-option');
        draftDetailInsertPosition = normalizeDraftInsertPosition(btn.dataset.insertPosition);
        syncDraftDetailInsertUi();
        return;
      }
      if (e.target.closest('.memo-draft-detail-continue')) {
        const activeDraftId = archiveDraftIds[archiveDraftActiveIndex] ?? archiveDraftId;
        if (!activeDraftId || isDraftAddInProgress || isArchiveDraftDeleting || isArchiveGroupDeleting) {
          return;
        }
        openTextPageEditorForDraft(w, activeDraftId);
        return;
      }
      if (e.target.closest('.memo-draft-detail-add-current')) {
        if (isDraftAddInProgress || isArchiveGroupAdding) return;
        draftAddScope = 'current';
        showDraftAddConfirmDialog(() => addDraftToDiary(w));
        return;
      }
      if (e.target.closest('.memo-draft-detail-add')) {
        if (isDraftAddInProgress || isArchiveGroupAdding) return;
        draftAddScope = archiveDraftIds.length > 1 ? 'all' : 'current';
        showDraftAddConfirmDialog(() => addDraftToDiary(w));
        return;
      }
      if (e.target.closest('.memo-draft-detail-delete-current')) {
        if (isArchiveDraftDeleting || isArchiveGroupDeleting) return;
        showArchiveDraftDeleteConfirmDialog({
          message: '이 임시저장 페이지를 삭제할까요?',
          submessage: '삭제한 내용은 복구할 수 없습니다.',
          confirmLabel: '삭제',
          onConfirm: () => {
            deleteCurrentArchiveDraftPage(w);
          },
        });
        return;
      }
      if (e.target.closest('.memo-draft-detail-delete-all')) {
        if (isArchiveDraftDeleting || isArchiveGroupDeleting) return;
        const total = archiveDraftIds.length;
        showArchiveDraftDeleteConfirmDialog({
          message:
            total > 1
              ? '이 임시저장본의 모든 페이지를 삭제할까요?'
              : '이 임시저장본을 삭제할까요?',
          submessage:
            total > 1
              ? `총 ${total}페이지가 삭제되며 복구할 수 없습니다.`
              : '삭제한 내용은 복구할 수 없습니다.',
          confirmLabel: total > 1 ? '전체 삭제' : '삭제',
          onConfirm: () => {
            deleteArchiveDraftGroup(w);
          },
        });
        return;
      }
      return;
    }

    if (fullscreenViewMode === 'pageEditor') {
      if (e.target.closest('.memo-editor-align-option')) {
        e.preventDefault();
        e.stopPropagation();
        const option = e.target.closest('.memo-editor-align-option');
        if (option?.dataset.align) {
          applyMemoEditorAlignment(option.dataset.align, w);
        }
        return;
      }

      const categoryOption = e.target.closest('.memo-editor-category-option');
      if (categoryOption) {
        applyPageEditorMemoCategory(w, categoryOption.dataset.categoryId || '');
        return;
      }

      if (e.target.closest('.memo-editor-category-wrap')) {
        closeMemoEditorAlignMenu();
        if (e.target.closest('.memo-editor-category-button')) {
          isPageEditorCategoryMenuOpen = !isPageEditorCategoryMenuOpen;
          syncPageEditorCategoryUi(w);
        }
        return;
      }

      if (isPageEditorCategoryMenuOpen) {
        isPageEditorCategoryMenuOpen = false;
        syncPageEditorCategoryUi(w);
      }

      if (e.target.closest('.memo-page-leave-temp')) {
        saveTemporaryPageToDraftPages(w);
        return;
      }
      if (e.target.closest('.memo-page-leave-discard')) {
        discardPageEditorAndLeave(w);
        return;
      }
      if (e.target.closest('.memo-page-leave-continue')) {
        removePageEditorLeaveDialog();
        return;
      }
      if (e.target.closest('.memo-editor-session-prev')) {
        const index = getActiveEditorSheetIndex(w.id);
        openEditorSessionSheet(w, index - 1);
        return;
      }
      if (e.target.closest('.memo-editor-session-next')) {
        const index = getActiveEditorSheetIndex(w.id);
        openEditorSessionSheet(w, index + 1);
        return;
      }
      if (e.target.closest('.memo-text-page-back')) {
        closeMemoEditorAlignMenu();
        goBackFromPageEditor(w);
        return;
      }
      if (e.target.closest('.memo-text-page-save')) {
        closeMemoEditorAlignMenu();
        saveTextPageFromDraft(w);
        return;
      }
      if (e.target.closest('.memo-text-page-continue')) {
        continueWritingOnNextSheet(w);
        return;
      }
      const toolBtn = e.target.closest('.memo-text-page-tool');
      if (toolBtn) {
        if (toolBtn.dataset.toolId === 'photo') {
          closeMemoEditorAlignMenu();
          const contentEditor = dom.memoFullscreenBody?.querySelector('.memo-text-page-content');
          const photoInput = dom.memoFullscreenBody?.querySelector('.memo-photo-file-input');
          if (contentEditor && photoInput) {
            openMemoPhotoPicker(contentEditor, photoInput, dom.memoFullscreenBody);
          }
          return;
        }
        if (toolBtn.dataset.toolId === 'archive') {
          closeMemoEditorAlignMenu();
          openArchivePopup(w);
          return;
        }
        if (toolBtn.dataset.toolId === 'align') {
          e.preventDefault();
          e.stopPropagation();
          toggleMemoEditorAlignMenu(w, toolBtn);
          return;
        }
        closeMemoEditorAlignMenu();
        showToast(toolBtn.dataset.toolToast || '준비 중인 기능입니다.');
        return;
      }
      return;
    }

    if (fullscreenViewMode === 'createSetup') {
      if (e.target.closest('.memo-page-manager-delete-cancel')) {
        removeMemoPageManagerDeleteDialog();
        return;
      }
      if (e.target.closest('.memo-page-manager-discard-continue')) {
        removeMemoPageManagerDiscardDialog();
        return;
      }
      if (isMemoPageManagerOpen) {
        if (e.target.closest('.memo-page-manager-close')) {
          requestCloseMemoPageManager(w);
          return;
        }
        if (e.target.closest('.memo-page-manager-done')) {
          if (isMemoPageManagerSaving) return;
          if (!isMemoPageManagerDirty) {
            closeMemoPageManagerImmediate();
            renderMemoFullscreen();
            return;
          }
          saveMemoPageManagerChanges(w).then((saved) => {
            if (saved) renderMemoFullscreen();
            else syncMemoPageManagerUi();
          });
          return;
        }
        if (e.target.closest('.memo-page-manager-select-toggle')) {
          toggleMemoPageManagerSelectionMode();
          return;
        }
        if (e.target.closest('.memo-page-manager-selection-clear')) {
          memoPageManagerSelectedIds.clear();
          renderMemoPageManagerGrid(w);
          return;
        }
        if (e.target.closest('.memo-page-manager-selection-delete')) {
          const count = memoPageManagerSelectedIds.size;
          if (count === 0 || isMemoPageManagerSaving) return;
          showMemoPageManagerDeleteConfirmDialog(count, () => {
            applyMemoPageManagerDelete(new Set(memoPageManagerSelectedIds));
          });
          return;
        }
        const managerItem = e.target.closest('.memo-page-manager-item');
        if (managerItem?.dataset.pageId) {
          if (isMemoPageManagerSelectionMode) {
            toggleMemoPageManagerPageSelection(managerItem.dataset.pageId);
          } else {
            navigateMemoPageManagerToPage(w, managerItem.dataset.pageId);
          }
          return;
        }
        if (e.target.closest('.memo-page-manager-dialog')) {
          return;
        }
      }
      if (e.target.closest('.memo-preview-picker-add')) {
        applyPreviewPickerSelection();
        return;
      }
      if (e.target.closest('.memo-delete-selection-cancel')) {
        selectedDeletePageIds.clear();
        syncDeleteSelectionUi();
        refreshBinderSpreadView(w);
        return;
      }
      if (e.target.closest('.memo-delete-selection-confirm')) {
        const count = selectedDeletePageIds.size;
        if (count === 0 || isMemoPageDeleteInProgress) return;
        showMemoPageDeleteConfirmDialog(count, () => executeDeleteSelectedPages(w));
        return;
      }
      if (e.target.closest('.memo-binder-page-delete-pick')) {
        const pickBtn = e.target.closest('.memo-binder-page-delete-pick');
        toggleDeletePageSelection(pickBtn.dataset.pageId, w);
        return;
      }
      if (e.target.closest('.memo-binder-page-pick')) {
        const pickBtn = e.target.closest('.memo-binder-page-pick');
        const pageId = pickBtn.dataset.pageId ?? null;
        if (previewPickerSelectedPageId === pageId) {
          previewPickerSelectedPageId = null;
        } else {
          previewPickerSelectedPageId = pageId;
        }
        refreshBinderSpreadView(w);
        return;
      }
      if (e.target.closest('.memo-binder-nav-prev')) {
        navigateBinderSpread(w, -1);
        return;
      }
      if (e.target.closest('.memo-binder-nav-next')) {
        navigateBinderSpread(w, 1);
        return;
      }
      const binderEditBtn = e.target.closest('.memo-binder-page-edit');
      if (binderEditBtn) {
        if (previewPickerTargetWidgetId || isMemoDeleteSelectionMode) return;
        const sheet = binderEditBtn.closest('.memo-binder-sheet');
        if (sheet?.dataset.pageId) {
          openBinderPageEditor(w, sheet.dataset.pageId);
        }
        return;
      }
      if (e.target.closest('.memo-template-popup-dialog')) {
        if (e.target.closest('.memo-template-popup-close')) {
          closeTemplatePopup();
          return;
        }
        if (e.target.closest('.memo-template-insert-option')) {
          const btn = e.target.closest('.memo-template-insert-option');
          selectedInsertPosition = btn.dataset.insertPosition;
          syncTemplatePopupUi();
          return;
        }
        if (e.target.closest('.memo-template-card')) {
          const card = e.target.closest('.memo-template-card');
          selectedTemplateId = card.dataset.templateId;
          syncTemplatePopupUi();
          return;
        }
        if (e.target.closest('.memo-template-carousel-prev')) {
          shiftTemplateCarousel(-1);
          return;
        }
        if (e.target.closest('.memo-template-carousel-next')) {
          shiftTemplateCarousel(1);
          return;
        }
        if (e.target.closest('.memo-template-popup-add')) {
          confirmTemplatePopupSelection();
          return;
        }
        return;
      }
      if (e.target.closest('.memo-template-popup-backdrop')) {
        closeTemplatePopup();
        return;
      }
      if (e.target.closest('.memo-create-setup-back')) {
        if (isMemoPageManagerOpen) {
          requestCloseMemoPageManager(w);
          return;
        }
        goBackFromCreateSetup();
        return;
      }
      if (e.target.closest('.memo-create-setup-bookmark-toggle')) {
        e.stopPropagation();
        toggleCreateSetupMenu();
        return;
      }
      const menuItem = e.target.closest('.memo-create-setup-menu-item');
      if (menuItem) {
        e.stopPropagation();
        if (menuItem.dataset.setupId === 'template') {
          closeCreateSetupMenu();
          if (isMemoDeleteSelectionMode) {
            exitMemoDeleteSelectionMode(w, { rerender: false });
          }
          openTemplatePopup();
          return;
        }
        if (menuItem.dataset.setupId === 'delete') {
          closeCreateSetupMenu();
          if (isMemoDeleteSelectionMode) {
            exitMemoDeleteSelectionMode(w);
          } else {
            enterMemoDeleteSelectionMode(w);
          }
          return;
        }
        if (menuItem.dataset.setupId === 'archive') {
          closeCreateSetupMenu();
          openArchivePopup(w);
          return;
        }
        if (menuItem.dataset.setupId === 'pages') {
          closeCreateSetupMenu();
          openMemoPageManager(w);
          return;
        }
        showToast('준비 중인 기능입니다.');
        closeCreateSetupMenu();
        return;
      }
      if (e.target.closest('.memo-create-setup-menu')) {
        return;
      }
      if (isCreateSetupMenuOpen) {
        closeCreateSetupMenu();
      }
      if (isTemplatePopupOpen) {
        closeTemplatePopup();
      }
      return;
    }

    if (fullscreenViewMode === 'profileEditor') {
      if (e.target.closest('.memo-profile-cancel')) {
        cancelProfileEditor(w);
        return;
      }
      if (e.target.closest('.memo-profile-select-cover')) {
        const input = dom.memoFullscreenBody.querySelector('.memo-profile-cover-file-input');
        if (input) input.click();
        return;
      }
      if (e.target.closest('.memo-profile-remove-cover')) {
        syncProfileDraftFromForm(dom.memoFullscreenBody, w);
        const current = profileDrafts.get(w.id) || getProfileDraft(w);
        profileDrafts.set(w.id, {
          ...current,
          coverImage: '',
        });
        updateProfileEditorCoverPreview(dom.memoFullscreenBody, '');
        return;
      }
      if (e.target.closest('.memo-profile-select-image')) {
        const input = dom.memoFullscreenBody.querySelector('.memo-profile-file-input');
        if (input) input.click();
        return;
      }
      if (e.target.closest('.memo-profile-remove-image')) {
        syncProfileDraftFromForm(dom.memoFullscreenBody, w);
        const current = profileDrafts.get(w.id) || getProfileDraft(w);
        profileDrafts.set(w.id, {
          ...current,
          profileImage: '',
        });
        updateProfileEditorAvatarPreview(dom.memoFullscreenBody, '');
        return;
      }
      if (e.target.closest('.memo-profile-save')) {
        saveProfileFromDraft(w);
      }
      return;
    }

    if (fullscreenViewMode === 'editor') {
      if (e.target.closest('.memo-editor-back')) {
        goBackToHome(w);
        return;
      }

      if (e.target.closest('.memo-editor-save')) {
        saveMemoFromDraft(w);
        return;
      }

      if (e.target.closest('.memo-editor-delete')) {
        deleteMemo(w);
      }
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (fullscreenViewMode === 'home' && (isMemoHomeSortMenuOpen || isMemoHomeCategoryMenuOpen)) {
      closeMemoHomeMenus();
      renderMemoFullscreen();
      return;
    }
    if (fullscreenViewMode === 'home' && isMemoHomeSearchOpen) {
      closeMemoHomeSearch(getActiveMemoWidget());
      return;
    }
    if (fullscreenViewMode === 'home' && dom.memoFullscreenBody?.querySelector('.memo-diary-delete-dialog')) {
      removeMemoDiaryDeleteConfirmDialog();
      return;
    }
    if (fullscreenViewMode === 'pageEditor' && isPageEditorCategoryMenuOpen) {
      isPageEditorCategoryMenuOpen = false;
      const w = getActiveMemoWidget();
      if (w) syncPageEditorCategoryUi(w);
      return;
    }
    if (fullscreenViewMode === 'pageEditor') {
      if (dom.memoFullscreenBody?.querySelector('.memo-editor-align-menu')) {
        closeMemoEditorAlignMenu();
        return;
      }
      if (dom.memoFullscreenBody?.querySelector('.memo-page-leave-dialog')) {
        removePageEditorLeaveDialog();
        return;
      }
      if (dom.memoFullscreenBody?.querySelector('.memo-sheet-overflow-dialog')) {
        dom.memoFullscreenBody.querySelector('.memo-sheet-overflow-cancel')?.click();
        return;
      }
      if (dom.memoFullscreenBody?.querySelector('.memo-photo-overflow-dialog')) {
        dom.memoFullscreenBody.querySelector('.memo-photo-overflow-cancel')?.click();
        return;
      }
      if (dom.memoFullscreenBody?.querySelector('.memo-photo-add-dialog')) {
        dom.memoFullscreenBody.querySelector('.memo-photo-add-cancel')?.click();
        return;
      }
      if (dom.memoFullscreenBody?.querySelector('.memo-image-lightbox')) {
        dom.memoFullscreenBody.querySelector('.memo-image-lightbox-close')?.click();
        return;
      }
      if (dom.memoFullscreenBody?.querySelector('.memo-draft-add-dialog')) {
        removeDraftAddConfirmDialog();
        return;
      }
      if (dom.memoFullscreenBody?.querySelector('.memo-draft-add-scope-dialog')) {
        removeDraftAddScopeDialog();
        return;
      }
      if (dom.memoFullscreenBody?.querySelector('.memo-draft-delete-dialog')) {
        removeArchiveDraftDeleteDialog();
        return;
      }
      if (isArchivePopupOpen) {
        closeArchivePopup();
        return;
      }
    }
    if (fullscreenViewMode === 'draftDetail') {
      if (dom.memoFullscreenBody?.querySelector('.memo-draft-add-dialog')) {
        removeDraftAddConfirmDialog();
        return;
      }
      if (dom.memoFullscreenBody?.querySelector('.memo-draft-add-scope-dialog')) {
        removeDraftAddScopeDialog();
        return;
      }
      if (dom.memoFullscreenBody?.querySelector('.memo-draft-delete-dialog')) {
        removeArchiveDraftDeleteDialog();
        return;
      }
    }
    if (fullscreenViewMode === 'createSetup') {
      if (dom.memoFullscreenBody?.querySelector('.memo-page-manager-delete-dialog')) {
        removeMemoPageManagerDeleteDialog();
        return;
      }
      if (dom.memoFullscreenBody?.querySelector('.memo-page-manager-discard-dialog')) {
        removeMemoPageManagerDiscardDialog();
        return;
      }
      if (isMemoPageManagerOpen) {
        requestCloseMemoPageManager(getActiveMemoWidget());
        return;
      }
      const menuLayer = dom.memoFullscreenBody?.querySelector('.memo-archive-menu-layer');
      if (menuLayer && !menuLayer.hidden && menuLayer.querySelector('.memo-archive-draft-menu')) {
        closeArchiveDraftCardMenu();
        return;
      }
      if (dom.memoFullscreenBody?.querySelector('.memo-page-delete-dialog')) {
        removeMemoPageDeleteConfirmDialog();
        return;
      }
      if (dom.memoFullscreenBody?.querySelector('.memo-draft-add-dialog')) {
        removeDraftAddConfirmDialog();
        return;
      }
      if (isArchivePopupOpen) {
        closeArchivePopup();
        return;
      }
      if (isTemplatePopupOpen) {
        closeTemplatePopup();
        return;
      }
      if (isCreateSetupMenuOpen) {
        closeCreateSetupMenu();
      }
      return;
    }
    if (fullscreenViewMode === 'draftDetail') {
      resetArchiveDetailState();
      fullscreenViewMode = 'createSetup';
      renderMemoFullscreen();
    }
  });
}


export function bindMemoWidgetEvents(el) {
  const root = el.querySelector('.memo-widget');
  if (!root || root.dataset.memoBound) return;
  root.dataset.memoBound = '1';

  const widgetId = el.dataset.widgetId;

  root.addEventListener('click', (e) => {
    if (e.target.closest('.widget-delete')) return;

    if (e.target.closest('.memo-preview-clear')) {
      e.stopPropagation();
      clearMemoWidgetPreview(widgetId);
      return;
    }

    if (e.target.closest('.memo-preview-add')) {
      e.stopPropagation();
      openMemoPreviewPicker(widgetId);
      return;
    }

    if (e.target.closest('.memo-preview-sheet-area')) {
      e.stopPropagation();
      openMemoPreviewPicker(widgetId);
      return;
    }

    if (e.target.closest('.memo-preview-open')) {
      e.stopPropagation();
      previewPickerTargetWidgetId = null;
      previewPickerSelectedPageId = null;
      openMemoFullscreen(widgetId);
    }
  });

  root.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    if (!e.target.closest('.memo-preview-sheet-area')) return;
    e.preventDefault();
    e.stopPropagation();
    openMemoPreviewPicker(widgetId);
  });

  root.addEventListener('mousedown', (e) => {
    if (e.target.closest('button, .memo-preview-sheet-area, .memo-preview-open')) {
      e.stopPropagation();
    }
  });

  root.addEventListener('pointerdown', (e) => {
    if (e.target.closest('button, .memo-preview-sheet-area, .memo-preview-open')) {
      e.stopPropagation();
    }
  });
}
