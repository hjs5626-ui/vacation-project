/* ═══════════════════════════════════════════════════════════
   MEMENTO DIARY — Memo Widget Logic
   ═══════════════════════════════════════════════════════════ */

import { state, saveEntries, ensureMemoProfile, saveMemoProfile, DEFAULT_MEMO_PROFILE } from './state.js';
import { dom } from './dom.js';
import { showToast } from './utils.js';
import { openConfirmDialog } from './dialogs.js';
import {
  MEMO_PHOTO_BLOCK_CLASS,
  buildMemoPhotoFileInput,
  openMemoPhotoPicker,
  handleMemoPhotoFileInputChange,
  bindMemoPhotoEditorInteractions,
  setupMemoEditorImages,
  setupMemoReadModeImages,
  serializeMemoEditorHtml,
  memoHtmlHasVisibleContent,
  beginPhotoContinuationSheet,
} from './memo-photo.js';
import { collectMemoImageIdsFromHtml, deleteMemoImageBlob, loadMemoImageIntoElement } from './memo-media.js';
import { applyPhotoMeasureHints } from './memo-sheet-overflow.js';
import { reflowEditorSessionSheets } from './memo-session-reflow.js';
import {
  closeMemoPagesPanel,
  isMemoPagesPanelOpen,
  openMemoPagesPanel,
  reorderMemoPages,
  resolveCurrentPageIdAfterDelete,
} from './memo-pages-panel.js';
import {
  appendContinuationSheetAtEnd,
  ensureEditorSessionFromDraft,
  filterSavableSessionSheets,
  getActiveEditorSheet,
  getActiveEditorSheetIndex,
  getEditorSession,
  getEditorSessionSheetCount,
  initEditorSessionWithSheet,
  initEditorSessionWithSheets,
  resetAllEditorSessions,
  resetEditorSession,
  setActiveEditorSheetIndex,
  syncCurrentDraftIntoSession,
} from './memo-editor-session.js';


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
  { id: 'trash', label: '휴지통' },
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

const TEMPLATE_CAROUSEL_PAGE_SIZE = 4;

const TEXT_PAGE_TOOLBAR_ITEMS = [
  { id: 'photo', icon: '📷', label: '사진' },
  { id: 'align', icon: '≡', label: '정렬', toast: '텍스트 정렬 기능은 준비 중입니다.' },
  { id: 'map', icon: '📍', label: '지도', toast: '지도 불러오기 기능은 준비 중입니다.' },
  { id: 'ledger', icon: '₩', label: '가계부', toast: '가계부 불러오기 기능은 준비 중입니다.' },
  { id: 'link', icon: '🔗', label: '링크', toast: '외부 링크 첨부 기능은 준비 중입니다.' },
  { id: 'archive', icon: '🗂️', label: '보관함', toast: '보관함 기능은 준비 중입니다.', edge: true },
];

const SHEET_TITLE_MAX_LENGTH = 50;
const PAGE_OVERFLOW_TOAST = '한 페이지에 입력할 수 있는 분량을 초과했습니다.';
const CONTINUE_SHEET_FILL_RATIO = 0.88;

const MEMO_HTML_ALLOWED_TAGS = new Set(['div', 'p', 'br', 'strong', 'b', 'em', 'i', 'u', 'img']);
const DEFAULT_MEMO_COVER_IMAGE = 'assets/memo-default-cover.png';

const MEMO_CATEGORY_ALL = 'all';
const MEMO_CATEGORY_NAME_MAX_LENGTH = 30;
const MEMO_SORT_OPTIONS = [
  { id: 'updatedAt-desc', label: '최신순' },
  { id: 'updatedAt-asc', label: '오래된순' },
  { id: 'title-asc', label: '이름순' },
];

/** Session-only — not persisted */
let activeMemoWidgetId = null;
let fullscreenViewMode = 'home';
let selectedMemoId = null;
let fabExpanded = false;
let isMemoNoteMenuOpen = false;
let isMemoSortMenuOpen = false;
let isMemoCategoryMenuOpen = false;
let isMemoSearchOpen = false;
let memoSearchQuery = '';
let isMemoEditorCategoryPickerOpen = false;
let isMemoCategoryAdding = false;
let memoCategoryEditingId = null;
let memoCategoryDraftName = '';
let isTemplatePopupOpen = false;
let selectedInsertPosition = 'after-current';
let selectedTemplateId = null;
let templateCarouselIndex = 0;

/** widgetId → { insertPosition, selectedTemplateId } */
const createSetupSheetDrafts = new Map();

/** createSetup·읽기 화면에서 표시 중인 다이어리(memo) id */
let currentDiaryId = null;
let currentPageId = null;

const pageEditorDrafts = new Map();
const pageEditorBaselines = new Map();


function normalizeMemoTemplateId(templateId) {
  return templateId || MEMO_BASIC_TEMPLATE_ID;
}


export function ensureMemoWidgetData(w) {
  if (!Array.isArray(w.memos)) w.memos = [];

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

  if (w.sortBy == null || w.sortBy === 'updatedAt') w.sortBy = 'updatedAt-desc';
  if (w.activeCategory == null) w.activeCategory = MEMO_CATEGORY_ALL;
  if (!Array.isArray(w.categories)) w.categories = [];

  w.memos.forEach((memo) => {
    if (memo.category == null) memo.category = '';
    if (memo.coverImage == null) memo.coverImage = '';
    if (memo.coverImageId == null) memo.coverImageId = '';
    if (!Array.isArray(memo.pages)) memo.pages = [];
    if (!Array.isArray(memo.draftPages)) memo.draftPages = [];
    const normalizePageFields = (page) => {
      page.templateId = normalizeMemoTemplateId(page.templateId);
      if (page.category == null) page.category = '';
      if (page.date == null) page.date = '';
      if (page.title == null) page.title = '';
      if (page.content == null) page.content = '';
    };
    memo.pages.forEach(normalizePageFields);
    memo.draftPages.forEach(normalizePageFields);
  });
}


export function initMemoSessionState(w) {
  editorDrafts.delete(w.id);
  profileDrafts.delete(w.id);
  createSetupSheetDrafts.delete(w.id);
  pageEditorDrafts.delete(w.id);
  pageEditorBaselines.delete(w.id);
  resetEditorSession(w.id);
}


function resetPageEditorSessionState() {
  pageEditorDrafts.clear();
  pageEditorBaselines.clear();
  resetAllEditorSessions();
  currentDiaryId = null;
  currentPageId = null;
}


function resetTemplatePopupSessionState() {
  isTemplatePopupOpen = false;
  selectedInsertPosition = 'after-current';
  selectedTemplateId = null;
  templateCarouselIndex = 0;
}


function resetFullscreenSession() {
  activeMemoWidgetId = null;
  fullscreenViewMode = 'home';
  selectedMemoId = null;
  fabExpanded = false;
  isMemoNoteMenuOpen = false;
  isMemoSortMenuOpen = false;
  isMemoCategoryMenuOpen = false;
  isMemoSearchOpen = false;
  memoSearchQuery = '';
  isMemoEditorCategoryPickerOpen = false;
  resetMemoCategoryInlineUi();
  resetTemplatePopupSessionState();
  resetPageEditorSessionState();
}


function syncMemoNoteMenuUi() {
  const moreBtn = dom.memoFullscreenBody?.querySelector('.memo-note-more');
  const menu = dom.memoFullscreenBody?.querySelector('.memo-note-menu');
  if (!moreBtn || !menu) return;

  moreBtn.setAttribute('aria-expanded', isMemoNoteMenuOpen ? 'true' : 'false');
  menu.hidden = !isMemoNoteMenuOpen;
  menu.classList.toggle('memo-note-menu--open', isMemoNoteMenuOpen);
}


function toggleMemoNoteMenu() {
  isMemoNoteMenuOpen = !isMemoNoteMenuOpen;
  syncMemoNoteMenuUi();
}


function closeMemoNoteMenu() {
  if (!isMemoNoteMenuOpen) return;
  isMemoNoteMenuOpen = false;
  syncMemoNoteMenuUi();
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


function isMemoPhotoBlockElement(el) {
  return (
    el?.nodeType === Node.ELEMENT_NODE
    && el.classList?.contains(MEMO_PHOTO_BLOCK_CLASS)
    && el.hasAttribute('data-memo-image-id')
  );
}


function isMemoPhotoImageElement(el) {
  return el?.nodeType === Node.ELEMENT_NODE && el.tagName.toLowerCase() === 'img' && el.hasAttribute('data-memo-image-id');
}


function preserveMemoElementAttributes(el, allowedNames) {
  [...el.attributes].forEach((attr) => {
    if (!allowedNames.includes(attr.name)) el.removeAttribute(attr.name);
  });
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

      if (isMemoPhotoBlockElement(child)) {
        preserveMemoElementAttributes(child, ['class', 'data-memo-image-id']);
        walk(child);
        return;
      }

      if (isMemoPhotoImageElement(child)) {
        preserveMemoElementAttributes(child, [
          'data-memo-image-id',
          'data-memo-image-width',
          'data-memo-image-height',
        ]);
        return;
      }

      if (!MEMO_HTML_ALLOWED_TAGS.has(tag)) {
        while (child.firstChild) {
          node.insertBefore(child.firstChild, child);
        }
        removeQueue.push(child);
        return;
      }

      [...child.attributes].forEach((attr) => child.removeAttribute(attr.name));
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
  return div.textContent ?? '';
}


function setRichEditorContent(el, content) {
  if (!el) return;
  if (!content) {
    el.innerHTML = '';
    return;
  }
  el.innerHTML = renderMemoPageContentHtml(content);
}


function getRichEditorContentHtml(el) {
  if (!el) return '';
  const html = serializeMemoEditorHtml(el, sanitizeMemoHtml);
  if (!memoHtmlHasVisibleContent(html)) return '';
  return html;
}


function renderMemoPageContentIntoElement(el, content) {
  if (!el) return;
  el.replaceChildren();
  const html = renderMemoPageContentHtml(content);
  if (html) el.innerHTML = html;
}


function renderMemoPageThumbnailPreview(page, container) {
  if (!container || !page) return;

  const isContinuation = isPageContinuation(page);
  const shell = document.createElement('div');
  shell.className = 'memo-pages-thumb-sheet';
  if (isContinuation) {
    shell.classList.add('memo-pages-thumb-sheet--continuation');
  }

  if (!isContinuation) {
    const dateEl = document.createElement('p');
    dateEl.className = 'memo-pages-thumb-date';
    dateEl.textContent = formatPageDateDisplay(page.date) || '\u00a0';

    const titleEl = document.createElement('p');
    titleEl.className = 'memo-pages-thumb-title';
    titleEl.textContent = page.title || '제목 없음';

    shell.append(dateEl, titleEl);
  }

  const contentEl = document.createElement('div');
  contentEl.className = 'memo-pages-thumb-content memo-sheet-read-content';
  if (isContinuation) {
    contentEl.classList.add('memo-pages-thumb-content--continuation');
  }
  renderMemoPageContentIntoElement(contentEl, page.content);
  shell.appendChild(contentEl);
  container.appendChild(shell);
}


function persistMemoPagesChange(w, memo) {
  if (!w || !memo) return;
  memo.updatedAt = new Date().toISOString();
  syncMemoWidgetToEntry(w);
  saveEntries();
  refreshMemoPreview(w.id);
}


function openMemoPagesOverlay(w) {
  const memo = getActiveCreateSetupMemo(w);
  if (!memo) return;

  closeMemoNoteMenu();

  openMemoPagesPanel({
    mount: dom.memoFullscreenOverlay,
    getMemo: () => getActiveCreateSetupMemo(w),
    getCurrentPageId: () => currentPageId,
    renderPageThumbnail: renderMemoPageThumbnailPreview,
    setupReadImages: (container) => setupMemoReadModeImages(container),
    onNavigate: (pageId) => {
      currentPageId = pageId;
      closeMemoPagesPanel();
      refreshMemoSinglePageView(w);
    },
    onReorder: (movedPageId, targetIndex) => {
      const activeMemo = getActiveCreateSetupMemo(w);
      if (!activeMemo) return;
      if (!reorderMemoPages(activeMemo, movedPageId, targetIndex)) return;
      persistMemoPagesChange(w, activeMemo);
    },
    onDelete: async (pageIds) => {
      const activeMemo = getActiveCreateSetupMemo(w);
      if (!activeMemo || !pageIds.length) return false;

      const ok = await openConfirmDialog({
        title: '페이지 삭제',
        message:
          pageIds.length === 1
            ? '선택한 페이지를 삭제할까요?'
            : `선택한 ${pageIds.length}개의 페이지를 삭제할까요?`,
        confirmLabel: '삭제',
        cancelLabel: '취소',
        danger: true,
      });
      if (!ok) return false;

      const beforePages = [...(activeMemo.pages ?? [])];
      const deletedIds = new Set(pageIds);
      activeMemo.pages = beforePages.filter((p) => !deletedIds.has(p.id));
      currentPageId = resolveCurrentPageIdAfterDelete(
        beforePages,
        activeMemo.pages,
        currentPageId,
        deletedIds
      );
      persistMemoPagesChange(w, activeMemo);
      return true;
    },
    onReadViewRefresh: () => {
      refreshMemoSinglePageView(w);
    },
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


function getMemoProfile() {
  return ensureMemoProfile();
}


function formatPageCategoryDisplay(category) {
  const value = (category || '').trim();
  if (!value) return null;
  return value;
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
  const memo = w.memos.find((m) => m.id === diaryId);
  if (!memo) return;

  currentDiaryId = diaryId;
  resolveCurrentPageIdForDiary(memo);
  fabExpanded = false;
  isMemoNoteMenuOpen = false;
  resetTemplatePopupSessionState();
  pageEditorDrafts.delete(w.id);
  pageEditorBaselines.delete(w.id);
  fullscreenViewMode = 'createSetup';
  renderMemoFullscreen();
}


function formatPageDateDisplay(dateStr) {
  if (!dateStr) return '';
  const d = new Date(`${dateStr}T12:00:00`);
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' });
}


function getPageCategoryLabel() {
  return '카테고리 없음';
}


function clonePageDraft(draft) {
  return {
    pageId: draft.pageId ?? null,
    editorSheetId: draft.editorSheetId ?? null,
    draftId: draft.draftId ?? null,
    templateId: normalizeMemoTemplateId(draft.templateId),
    category: '',
    memoCategoryId: draft.memoCategoryId ?? '',
    date: draft.date ?? '',
    title: draft.title ?? '',
    content: draft.content ?? '',
    insertPosition: draft.insertPosition ?? 'after-current',
    isTemporary: draft.isTemporary ?? false,
    isContinuation: Boolean(draft.isContinuation),
  };
}


function getPageEditorMemoCategoryId(w, current) {
  if (current?.memoCategoryId) return current.memoCategoryId;
  const memo = getActiveCreateSetupMemo(w);
  return normalizeMemoCategoryValue(memo?.category) ? memo.category : '';
}


function getPhotoContinuationHelpers() {
  return {
    syncPageEditorDraftFromForm,
    pageEditorDrafts,
    pageEditorBaselines,
    clonePageDraft,
    getPageEditorMemoCategoryId,
    MEMO_BASIC_TEMPLATE_ID,
  };
}


function buildEditorSessionNav() {
  const nav = document.createElement('div');
  nav.className = 'memo-editor-session-nav';
  nav.hidden = true;

  const prevBtn = document.createElement('button');
  prevBtn.type = 'button';
  prevBtn.className = 'memo-editor-session-prev';
  prevBtn.textContent = '‹';
  prevBtn.setAttribute('aria-label', '이전 작성 속지');

  const indicator = document.createElement('span');
  indicator.className = 'memo-editor-session-indicator';

  const nextBtn = document.createElement('button');
  nextBtn.type = 'button';
  nextBtn.className = 'memo-editor-session-next';
  nextBtn.textContent = '›';
  nextBtn.setAttribute('aria-label', '다음 작성 속지');

  nav.append(prevBtn, indicator, nextBtn);
  return nav;
}


function syncEditorSessionNav(w, navEl) {
  if (!navEl) return;

  const draft = pageEditorDrafts.get(w.id);
  if (draft) {
    ensureEditorSessionFromDraft(w.id, draft, clonePageDraft, { memoId: currentDiaryId ?? null });
  }

  const count = getEditorSessionSheetCount(w.id);
  if (count <= 1) {
    navEl.hidden = true;
    return;
  }

  navEl.hidden = false;
  const idx = getActiveEditorSheetIndex(w.id);
  const indicator = navEl.querySelector('.memo-editor-session-indicator');
  const prevBtn = navEl.querySelector('.memo-editor-session-prev');
  const nextBtn = navEl.querySelector('.memo-editor-session-next');

  if (indicator) indicator.textContent = `${idx + 1} / ${count}`;
  if (prevBtn) prevBtn.disabled = idx <= 0;
  if (nextBtn) nextBtn.disabled = idx >= count - 1;
}


function navigateEditorSessionSheet(w, delta) {
  syncPageEditorDraftFromForm(w);
  const draft = pageEditorDrafts.get(w.id);
  if (!draft) return;

  ensureEditorSessionFromDraft(w.id, draft, clonePageDraft, { memoId: currentDiaryId ?? null });
  syncCurrentDraftIntoSession(w.id, draft, clonePageDraft);

  const session = getEditorSession(w.id);
  if (!session?.sheets.length) return;

  const newIndex = session.activeSheetIndex + delta;
  if (newIndex < 0 || newIndex >= session.sheets.length) return;

  setActiveEditorSheetIndex(w.id, newIndex);
  const activeSheet = getActiveEditorSheet(w.id);
  if (!activeSheet) return;

  pageEditorDrafts.set(w.id, clonePageDraft(activeSheet));
  pageEditorBaselines.set(w.id, clonePageDraft(activeSheet));
  renderMemoFullscreen();
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


function ensureMemoDraftPages(memo) {
  if (!Array.isArray(memo.draftPages)) memo.draftPages = [];
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
    return w.memos.find((m) => m.id === currentDiaryId) ?? null;
  }
  if (currentPageId) {
    return w.memos.find((m) => m.pages.some((p) => p.id === currentPageId)) ?? null;
  }
  return null;
}


function findMemoContainingPage(w, pageId) {
  ensureMemoWidgetData(w);
  return w.memos.find((m) => m.pages.some((p) => p.id === pageId)) ?? null;
}


function openTextPageEditorNew(w, sheetDraft) {
  const parentMemo = getActiveCreateSetupMemo(w);
  const draft = {
    pageId: null,
    templateId: normalizeMemoTemplateId(sheetDraft.selectedTemplateId),
    category: '',
    memoCategoryId: normalizeMemoCategoryValue(parentMemo?.category),
    date: getLocalDateInputValue(),
    title: '',
    content: '',
    insertPosition: sheetDraft.insertPosition ?? 'after-current',
    isTemporary: false,
    isContinuation: false,
  };
  pageEditorDrafts.set(w.id, draft);
  pageEditorBaselines.set(w.id, clonePageDraft(draft));
  initEditorSessionWithSheet(w.id, draft, { memoId: currentDiaryId ?? null, sourceType: 'new' }, clonePageDraft);
  isMemoNoteMenuOpen = false;
  fullscreenViewMode = 'pageEditor';
  renderMemoFullscreen();
}


function openTextPageEditorForPage(w, pageId) {
  const memo = findMemoContainingPage(w, pageId);
  const page = memo?.pages.find((p) => p.id === pageId);
  if (!memo || !page) return;

  currentDiaryId = memo.id;
  currentPageId = pageId;

  const pages = memo.pages ?? [];
  const pageIndex = Math.max(0, pages.findIndex((p) => p.id === pageId));

  const sheetFromPage = (p) => ({
    pageId: p.id,
    templateId: normalizeMemoTemplateId(p.templateId),
    category: '',
    memoCategoryId: normalizeMemoCategoryValue(memo.category),
    date: isPageContinuation(p) ? '' : p.date || getLocalDateInputValue(),
    title: isPageContinuation(p) ? '' : p.title === '제목 없음' ? '' : p.title ?? '',
    content: p.content ?? '',
    insertPosition: 'after-current',
    isTemporary: false,
    isContinuation: isPageContinuation(p),
  });

  if (pages.length > 1) {
    const sheets = pages.map(sheetFromPage);
    initEditorSessionWithSheets(
      w.id,
      sheets,
      { memoId: memo.id, sourceType: 'page', activeSheetIndex: pageIndex },
      clonePageDraft
    );
    const activeDraft = clonePageDraft(sheets[pageIndex]);
    pageEditorDrafts.set(w.id, activeDraft);
    pageEditorBaselines.set(w.id, clonePageDraft(activeDraft));
  } else {
    const draft = sheetFromPage(page);
    pageEditorDrafts.set(w.id, draft);
    pageEditorBaselines.set(w.id, clonePageDraft(draft));
    initEditorSessionWithSheet(w.id, draft, { memoId: memo.id, sourceType: 'page' }, clonePageDraft);
  }

  isMemoNoteMenuOpen = false;
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

  if (isPageContinuation(current)) {
    pageEditorDrafts.set(w.id, {
      ...current,
      date: '',
      title: '',
      content: getRichEditorContentHtml(contentInput),
      category: '',
    });
    return;
  }

  const dateInput = root.querySelector('.memo-text-page-date');
  const titleInput = root.querySelector('.memo-text-page-title');
  if (!dateInput || !titleInput) return;

  pageEditorDrafts.set(w.id, {
    ...current,
    date: dateInput.value,
    title: titleInput.value,
    content: getRichEditorContentHtml(contentInput),
    category: '',
  });
}


function shouldShowPageEditorLeaveDialog(w) {
  syncPageEditorDraftFromForm(w);
  const draft = pageEditorDrafts.get(w.id);
  if (draft) {
    ensureEditorSessionFromDraft(w.id, draft, clonePageDraft, { memoId: currentDiaryId ?? null });
    syncCurrentDraftIntoSession(w.id, draft, clonePageDraft);
  }

  if (getEditorSessionSheetCount(w.id) > 1) return true;

  if (!draft) return false;

  if ((draft.title || '').trim() || memoContentToPlainText(draft.content).trim()) {
    return true;
  }

  return isPageEditorDirty(w);
}


function exitPageEditorToCreateSetup(w) {
  removePageEditorLeaveDialog();
  resetEditorSession(w.id);
  pageEditorDrafts.delete(w.id);
  pageEditorBaselines.delete(w.id);
  fullscreenViewMode = 'createSetup';
  renderMemoFullscreen();
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
    || (draft.memoCategoryId ?? '') !== (baseline.memoCategoryId ?? '')
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
  exitPageEditorToCreateSetup(w);
}


function saveTemporaryPageToDraftPages(w) {
  syncPageEditorDraftFromForm(w);
  const draft = pageEditorDrafts.get(w.id);
  if (!draft) return;

  ensureMemoWidgetData(w);
  const now = new Date().toISOString();
  const pageTitle = pageTitleForSave(draft);
  const pageDate = pageDateForSave(draft);

  let memo = getActiveCreateSetupMemo(w);
  if (draft.pageId) {
    memo = findMemoContainingPage(w, draft.pageId);
  }

  if (!memo) {
    memo = {
      id: crypto.randomUUID(),
      title: isPageContinuation(draft) ? '제목 없음' : pageTitle,
      content: draft.content || '',
      category: normalizeMemoCategoryValue(draft.memoCategoryId) ? draft.memoCategoryId : '',
      coverImage: '',
      pages: [],
      draftPages: [],
      createdAt: now,
      updatedAt: now,
    };
    w.memos.push(memo);
    currentDiaryId = memo.id;
  }

  ensureMemoDraftPages(memo);

  const tempPageId = draft.pageId || crypto.randomUUID();

  if (draft.pageId) {
    memo.pages = memo.pages.filter((p) => p.id !== draft.pageId);
    if (currentPageId === draft.pageId) {
      currentPageId = null;
    }
  }

  const existingIndex = memo.draftPages.findIndex((p) => p.id === tempPageId);
  const tempPage = {
    id: tempPageId,
    templateId: normalizeMemoTemplateId(draft.templateId),
    category: '',
    date: pageDate,
    title: pageTitle,
    content: sanitizeMemoHtml(draft.content ?? ''),
    isContinuation: isPageContinuation(draft),
    createdAt: existingIndex >= 0 ? memo.draftPages[existingIndex].createdAt : now,
    updatedAt: now,
  };

  if (existingIndex >= 0) {
    memo.draftPages[existingIndex] = tempPage;
  } else {
    memo.draftPages.push(tempPage);
  }

  memo.updatedAt = now;
  currentDiaryId = memo.id;
  removePageEditorLeaveDialog();
  pageEditorDrafts.delete(w.id);
  pageEditorBaselines.delete(w.id);
  fullscreenViewMode = 'createSetup';
  syncMemoWidgetToEntry(w);
  saveEntries();
  renderMemoFullscreen();
  refreshMemoPreview(w.id);
  showToast('보관함에 임시저장되었습니다.');
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
  applyPhotoMeasureHints(measure, contentEl);

  return contentEl.scrollHeight <= contentEl.clientHeight + 2;
}


function isPageEditorContentWithinLimit(contentInput) {
  if (!contentInput) return true;
  return contentInput.scrollHeight <= contentInput.clientHeight + 2;
}


function getPageEditorContentFillRatio(contentInput) {
  if (!contentInput || !contentInput.clientHeight) return 0;
  return contentInput.scrollHeight / contentInput.clientHeight;
}


function getEditorCaretBookmark(root) {
  const sel = document.getSelection();
  if (!sel || sel.rangeCount === 0) return null;

  const range = sel.getRangeAt(0);
  if (!root.contains(range.commonAncestorContainer)) return null;

  function nodePath(node) {
    const path = [];
    let current = node;
    while (current && current !== root) {
      const parent = current.parentNode;
      if (!parent) return null;
      path.unshift([...parent.childNodes].indexOf(current));
      current = parent;
    }
    return path;
  }

  return {
    startPath: nodePath(range.startContainer),
    startOffset: range.startOffset,
    endPath: nodePath(range.endContainer),
    endOffset: range.endOffset,
  };
}


function collapseEditorCaretToEnd(root) {
  root.focus();
  const sel = document.getSelection();
  if (!sel) return;

  const range = document.createRange();
  range.selectNodeContents(root);
  range.collapse(false);
  sel.removeAllRanges();
  sel.addRange(range);
}


function setEditorCaretBookmark(root, bookmark) {
  root.focus();
  const sel = document.getSelection();
  if (!sel) return;

  function nodeAt(path) {
    if (!path) return null;
    let node = root;
    for (const index of path) {
      if (index < 0 || !node.childNodes[index]) return null;
      node = node.childNodes[index];
    }
    return node;
  }

  function setRangePos(range, path, offset, which) {
    const node = nodeAt(path);
    if (!node) return false;

    const maxOffset =
      node.nodeType === Node.TEXT_NODE
        ? (node.textContent?.length ?? 0)
        : node.childNodes.length;
    const safeOffset = Math.max(0, Math.min(offset, maxOffset));

    if (which === 'start') range.setStart(node, safeOffset);
    else range.setEnd(node, safeOffset);
    return true;
  }

  if (!bookmark?.startPath) {
    collapseEditorCaretToEnd(root);
    return;
  }

  const range = document.createRange();
  if (!setRangePos(range, bookmark.startPath, bookmark.startOffset, 'start')) {
    collapseEditorCaretToEnd(root);
    return;
  }

  if (bookmark.endPath) {
    if (!setRangePos(range, bookmark.endPath, bookmark.endOffset, 'end')) {
      range.collapse(true);
    }
  } else {
    range.collapse(true);
  }

  sel.removeAllRanges();
  sel.addRange(range);
}


function bindEditorSessionNav(w, navEl) {
  if (!navEl || navEl.dataset.bound) return;
  navEl.dataset.bound = '1';

  navEl.querySelector('.memo-editor-session-prev')?.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    navigateEditorSessionSheet(w, -1);
  });
  navEl.querySelector('.memo-editor-session-next')?.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    navigateEditorSessionSheet(w, 1);
  });
}


function syncEditorUiAfterInput(w, contentEditor, continueBtn) {
  syncPageEditorDraftFromForm(w);
  if (!continueBtn) return;

  const showContinue = getPageEditorContentFillRatio(contentEditor) >= CONTINUE_SHEET_FILL_RATIO;
  continueBtn.hidden = !showContinue;
  const continueRow = continueBtn.closest('.memo-text-page-continue-row');
  if (continueRow) {
    const sessionNav = continueRow.querySelector('.memo-editor-session-nav');
    if (sessionNav) syncEditorSessionNav(w, sessionNav);
    continueRow.hidden = !(showContinue || getEditorSessionSheetCount(w.id) > 1);
  }
}


function applyEditorSessionReflow(w, contentEditor, { caretBookmark, continueBtn } = {}) {
  const draft = pageEditorDrafts.get(w.id);
  if (!draft || !contentEditor) return false;

  ensureEditorSessionFromDraft(w.id, draft, clonePageDraft, { memoId: currentDiaryId ?? null });
  syncCurrentDraftIntoSession(w.id, draft, clonePageDraft);

  const session = getEditorSession(w.id);
  if (!session) return false;

  const activeBefore = session.activeSheetIndex;
  const result = reflowEditorSessionSheets(session, contentEditor, { memoHtmlHasVisibleContent });

  if (!result.changed) {
    syncEditorUiAfterInput(w, contentEditor, continueBtn);
    return false;
  }

  session.sheets = result.sheets;
  session.activeSheetIndex = result.activeSheetIndex;

  const activeSheet = session.sheets[session.activeSheetIndex];
  if (!activeSheet) return false;

  pageEditorDrafts.set(w.id, clonePageDraft(activeSheet));

  if (session.activeSheetIndex === activeBefore) {
    setRichEditorContent(contentEditor, activeSheet.content ?? '');
    setupMemoEditorImages(contentEditor, { editable: true }).catch(() => {});
    if (caretBookmark) {
      setEditorCaretBookmark(contentEditor, caretBookmark);
    }
    syncEditorUiAfterInput(w, contentEditor, continueBtn);
    return true;
  }

  renderMemoFullscreen();
  requestAnimationFrame(() => {
    const editor = dom.memoFullscreenBody?.querySelector('.memo-text-page-content');
    if (editor && caretBookmark) {
      setEditorCaretBookmark(editor, caretBookmark);
    }
  });
  return true;
}


function bindPageEditorContentLimits(w, titleInput, contentEditor, continueBtn) {
  let composing = false;
  let isReflowing = false;
  let pendingReflow = false;

  const scheduleReflow = () => {
    if (isReflowing) {
      pendingReflow = true;
      return;
    }
    isReflowing = true;
    pendingReflow = false;

    const caret = getEditorCaretBookmark(contentEditor);

    try {
      applyEditorSessionReflow(w, contentEditor, { caretBookmark: caret, continueBtn });
    } finally {
      isReflowing = false;
      if (pendingReflow) {
        requestAnimationFrame(scheduleReflow);
      }
    }
  };

  const onEditorMutation = () => {
    if (composing) {
      syncPageEditorDraftFromForm(w);
      return;
    }
    scheduleReflow();
  };

  contentEditor.addEventListener('compositionstart', () => {
    composing = true;
  });
  contentEditor.addEventListener('compositionend', () => {
    composing = false;
    scheduleReflow();
  });

  contentEditor.addEventListener('input', onEditorMutation);

  contentEditor.addEventListener('keydown', (e) => {
    if (composing) return;
    if (e.key === 'Backspace' || e.key === 'Delete') {
      requestAnimationFrame(scheduleReflow);
    }
  });

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
    scheduleReflow();
  });

  if (titleInput) {
    titleInput.maxLength = SHEET_TITLE_MAX_LENGTH;
    titleInput.addEventListener('input', () => syncPageEditorDraftFromForm(w));
  }

  syncEditorUiAfterInput(w, contentEditor, continueBtn);
}


function persistTextPageFromDraft(w) {
  syncPageEditorDraftFromForm(w);
  const draft = pageEditorDrafts.get(w.id);
  if (!draft) return false;

  ensureEditorSessionFromDraft(w.id, draft, clonePageDraft, { memoId: currentDiaryId ?? null });
  syncCurrentDraftIntoSession(w.id, draft, clonePageDraft);

  const session = getEditorSession(w.id);
  let sheets = session?.sheets?.length
    ? filterSavableSessionSheets(session.sheets, memoHtmlHasVisibleContent)
    : [draft];

  if (!sheets.length) {
    sheets = session?.sheets?.length ? [session.sheets[0]] : [draft];
  }

  const container = dom.memoFullscreenBody;
  const activeIdx = getActiveEditorSheetIndex(w.id);

  for (let i = 0; i < sheets.length; i += 1) {
    const sheet = sheets[i];
    const isCont = i > 0 || isPageContinuation(sheet);
    const draftTitle = sheet.title ?? '';
    const draftContent = sanitizeMemoHtml(sheet.content ?? '');

    if (i === activeIdx) {
      const contentInput = container?.querySelector('.memo-text-page-content');
      if (contentInput && !isPageEditorContentWithinLimit(contentInput)) {
        showToast(PAGE_OVERFLOW_TOAST);
        return false;
      }
    }

    if (container && !doesPageContentFitReadSheet(draftTitle, draftContent, container, isCont)) {
      showToast(PAGE_OVERFLOW_TOAST);
      return false;
    }
  }

  ensureMemoWidgetData(w);
  const now = new Date().toISOString();
  const firstSheet = sheets[0];
  let memo = getActiveCreateSetupMemo(w);

  if (firstSheet.pageId) {
    memo = findMemoContainingPage(w, firstSheet.pageId);
  }

  if (!memo) {
    const pageTitle = pageTitleForSave(firstSheet);
    memo = {
      id: crypto.randomUUID(),
      title: isPageContinuation(firstSheet) ? '제목 없음' : pageTitle,
      content: firstSheet.content || '',
      category: normalizeMemoCategoryValue(firstSheet.memoCategoryId) ? firstSheet.memoCategoryId : '',
      coverImage: '',
      coverImageId: '',
      pages: [],
      draftPages: [],
      createdAt: now,
      updatedAt: now,
    };
    w.memos.push(memo);
    currentDiaryId = memo.id;
  }

  ensureMemoDraftPages(memo);

  const savedPageIds = new Set();
  let anchorPageId = currentPageId;

  for (let i = 0; i < sheets.length; i += 1) {
    const sheet = sheets[i];
    const pageTitle = pageTitleForSave(sheet);
    const pageDate = pageDateForSave(sheet);
    const isCont = i > 0 || isPageContinuation(sheet);

    if (sheet.pageId) {
      const page = memo.pages.find((p) => p.id === sheet.pageId);
      if (page) {
        page.category = '';
        page.date = pageDate;
        page.title = pageTitle;
        page.isContinuation = isCont;
        page.content = sanitizeMemoHtml(sheet.content ?? '');
        page.templateId = normalizeMemoTemplateId(sheet.templateId ?? page.templateId);
        page.updatedAt = now;
        anchorPageId = page.id;
        currentPageId = page.id;
        savedPageIds.add(page.id);
      }
    } else {
      const newPage = {
        id: crypto.randomUUID(),
        templateId: normalizeMemoTemplateId(sheet.templateId),
        category: '',
        date: pageDate,
        title: pageTitle,
        isContinuation: isCont,
        content: sanitizeMemoHtml(sheet.content ?? ''),
        createdAt: now,
        updatedAt: now,
      };
      const insertPos = i === 0 ? (sheet.insertPosition ?? 'after-current') : 'after-current';
      memo.pages = insertPageByPosition(memo.pages, newPage, insertPos, anchorPageId);
      anchorPageId = newPage.id;
      currentPageId = newPage.id;
      savedPageIds.add(newPage.id);
    }
  }

  if (savedPageIds.size) {
    memo.draftPages = memo.draftPages.filter((p) => !savedPageIds.has(p.id));
  }

  if (!isPageContinuation(firstSheet)) {
    memo.title = pageTitleForSave(firstSheet);
  }
  memo.category = normalizeMemoCategoryValue(firstSheet.memoCategoryId) ? firstSheet.memoCategoryId : '';
  memo.content = sanitizeMemoHtml(sheets[sheets.length - 1].content ?? '');
  memo.updatedAt = now;
  currentDiaryId = memo.id;

  syncMemoWidgetToEntry(w);
  saveEntries();
  refreshMemoPreview(w.id);
  return true;
}


function continueWritingOnNextSheet(w) {
  syncPageEditorDraftFromForm(w);
  const draft = pageEditorDrafts.get(w.id);
  if (!draft) return;

  ensureEditorSessionFromDraft(w.id, draft, clonePageDraft, { memoId: currentDiaryId ?? null });
  syncCurrentDraftIntoSession(w.id, draft, clonePageDraft);

  const container = dom.memoFullscreenBody;
  const contentInput = container?.querySelector('.memo-text-page-content');
  if (contentInput && !isPageEditorContentWithinLimit(contentInput)) {
    showToast(PAGE_OVERFLOW_TOAST);
    return;
  }

  const draftTitle = draft.title ?? '';
  const draftContent = sanitizeMemoHtml(draft.content ?? '');
  if (container && !doesPageContentFitReadSheet(draftTitle, draftContent, container, isPageContinuation(draft))) {
    showToast(PAGE_OVERFLOW_TOAST);
    return;
  }

  const newSheet = appendContinuationSheetAtEnd(w.id, {
    initialContent: '',
    templateId: MEMO_BASIC_TEMPLATE_ID,
    memoCategoryId: getPageEditorMemoCategoryId(w, draft),
    insertPosition: draft.insertPosition ?? 'after-current',
  });
  if (!newSheet) return;

  pageEditorDrafts.set(w.id, clonePageDraft(newSheet));
  pageEditorBaselines.set(w.id, clonePageDraft(newSheet));
  renderMemoFullscreen();
}


function saveTextPageFromDraft(w) {
  if (!persistTextPageFromDraft(w)) return;

  resetEditorSession(w.id);
  pageEditorDrafts.delete(w.id);
  pageEditorBaselines.delete(w.id);
  fullscreenViewMode = 'createSetup';
  renderMemoFullscreen();
  showToast('페이지가 저장되었습니다.');
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

  const categoryAnchor = document.createElement('div');
  categoryAnchor.className = 'memo-text-page-category-anchor';

  const categoryBtn = document.createElement('button');
  categoryBtn.type = 'button';
  categoryBtn.className = 'memo-text-page-category-btn';
  categoryBtn.textContent = '카테고리 없음';

  categoryAnchor.append(categoryBtn, buildMemoEditorCategoryPicker(w));

  const saveBtn = document.createElement('button');
  saveBtn.type = 'button';
  saveBtn.className = 'memo-text-page-save';
  saveBtn.textContent = '저장';

  header.append(backBtn, categoryAnchor, saveBtn);

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

  const sessionNav = buildEditorSessionNav();
  syncEditorSessionNav(w, sessionNav);
  bindEditorSessionNav(w, sessionNav);

  const continueBtn = document.createElement('button');
  continueBtn.type = 'button';
  continueBtn.className = 'memo-text-page-continue';
  continueBtn.textContent = '다음 속지에 이어쓰기';
  continueBtn.hidden = true;

  continueRow.append(sessionNav, continueBtn);
  continueRow.hidden = sessionNav.hidden && continueBtn.hidden;

  body.append(sheetSurface);
  shell.append(header, body, continueRow, buildTextPageToolbar());
  container.appendChild(shell);

  sheetSurface.addEventListener('click', (e) => {
    if (e.target.closest('.memo-text-page-content')) return;
    if (e.target.closest('input, button, textarea, select, label')) return;
    contentEditor.focus();
  });

  ensurePageEditorMeasureRoot(container);
  bindPageEditorContentLimits(w, isContinuation ? null : titleInput, contentEditor, continueBtn);

  let photoFileInput = shell.querySelector('.memo-photo-file-input');
  if (!photoFileInput) {
    photoFileInput = buildMemoPhotoFileInput();
    shell.appendChild(photoFileInput);
  }

  photoFileInput.onchange = () => {
    handleMemoPhotoFileInputChange(photoFileInput, contentEditor, container, {
      showToast,
      syncDraft: () => syncPageEditorDraftFromForm(w),
      onContinuationNeeded: async () => {
        beginPhotoContinuationSheet(w, getPhotoContinuationHelpers());
        renderMemoFullscreen();
      },
      onComplete: () => {
        const currentDraft = pageEditorDrafts.get(w.id);
        if (currentDraft) {
          pageEditorBaselines.set(w.id, clonePageDraft(currentDraft));
        }
        const editor = dom.memoFullscreenBody?.querySelector('.memo-text-page-content');
        const continueBtn = dom.memoFullscreenBody?.querySelector('.memo-text-page-continue');
        if (editor) {
          applyEditorSessionReflow(w, editor, { continueBtn });
        }
      },
    });
  };

  setupMemoEditorImages(contentEditor, { editable: true }).catch(() => {});

  bindMemoPhotoEditorInteractions(w, shell, contentEditor, container, {
    syncPageEditorDraftFromForm: () => syncPageEditorDraftFromForm(w),
    collectAllMemoImageHtmlSources: () => collectAllMemoImageHtmlSources(w),
    deleteMemoImageIfUnreferenced: deleteMemoImageBlob,
    coverPhoto: {
      getCoverPhotoId: () => getMemoForCoverPhoto(w)?.coverImageId ?? '',
      setCoverPhoto: (imageId) => setMemoCoverPhoto(w, imageId),
      clearCoverPhoto: () => clearMemoCoverPhoto(w),
    },
  });

  syncEditorCategoryBtn(w);
  syncMemoEditorCategoryPickerUi();
}


function collectMemoImageIdsFromMemo(memo, w = null) {
  const ids = new Set();
  if (!memo) return ids;

  (memo.pages ?? []).forEach((page) => {
    collectMemoImageIdsFromHtml(page.content ?? '').forEach((id) => ids.add(id));
  });
  (memo.draftPages ?? []).forEach((page) => {
    collectMemoImageIdsFromHtml(page.content ?? '').forEach((id) => ids.add(id));
  });

  if (w && currentDiaryId === memo.id) {
    const editor = dom.memoFullscreenBody?.querySelector('.memo-text-page-content');
    if (editor) {
      collectMemoImageIdsFromHtml(serializeMemoEditorHtml(editor, sanitizeMemoHtml)).forEach((id) =>
        ids.add(id)
      );
    }
  }

  return ids;
}


function resolveMemoCoverImageId(memo, w = null) {
  const coverImageId = memo?.coverImageId?.trim();
  if (!coverImageId) return '';
  return collectMemoImageIdsFromMemo(memo, w).has(coverImageId) ? coverImageId : '';
}


function getMemoForCoverPhoto(w) {
  ensureMemoWidgetData(w);
  let memo = getActiveCreateSetupMemo(w);
  if (memo) return memo;

  if (currentDiaryId) {
    memo = w.memos.find((m) => m.id === currentDiaryId) ?? null;
  }
  if (memo) return memo;

  const draft = pageEditorDrafts.get(w.id);
  if (draft?.pageId) {
    return findMemoContainingPage(w, draft.pageId);
  }
  return null;
}


function setMemoCoverPhoto(w, imageId) {
  const memo = getMemoForCoverPhoto(w);
  if (!memo || !imageId) return;

  memo.coverImageId = imageId;
  syncMemoWidgetToEntry(w);
  saveEntries();
  refreshMemoPreview(w.id);
  showToast('대표사진으로 설정되었습니다.');
}


function clearMemoCoverPhoto(w) {
  const memo = getMemoForCoverPhoto(w);
  if (!memo?.coverImageId) return;

  memo.coverImageId = '';
  syncMemoWidgetToEntry(w);
  saveEntries();
  refreshMemoPreview(w.id);
  showToast('대표사진이 해제되었습니다.');
}


function collectAllMemoImageHtmlSources(w) {
  const sources = [];
  const editor = dom.memoFullscreenBody?.querySelector('.memo-text-page-content');
  const activeIdx = getActiveEditorSheetIndex(w.id);
  const session = getEditorSession(w.id);

  if (session?.sheets?.length) {
    session.sheets.forEach((sheet, idx) => {
      if (idx === activeIdx && editor) {
        sources.push(serializeMemoEditorHtml(editor, sanitizeMemoHtml));
      } else {
        sources.push(sheet.content ?? '');
      }
    });
  } else if (editor) {
    sources.push(serializeMemoEditorHtml(editor, sanitizeMemoHtml));
  }

  ensureMemoWidgetData(w);
  w.memos.forEach((memo) => {
    (memo.pages ?? []).forEach((page) => sources.push(page.content ?? ''));
    (memo.draftPages ?? []).forEach((page) => sources.push(page.content ?? ''));
  });
  return sources;
}


function buildMemoHomeCardThumb(memo, w) {
  const thumb = document.createElement('div');
  thumb.className = 'memo-home-card-thumb';

  const img = document.createElement('img');
  img.alt = '';

  const coverImageId = resolveMemoCoverImageId(memo, w);
  if (coverImageId) {
    img.dataset.memoImageId = coverImageId;
  } else if (memo.coverImage) {
    img.src = memo.coverImage;
  } else {
    img.src = DEFAULT_MEMO_COVER_IMAGE;
  }

  thumb.appendChild(img);
  return thumb;
}


async function hydrateMemoHomeCardThumbs(container) {
  if (!container) return;

  const imgs = container.querySelectorAll('.memo-home-card-thumb img[data-memo-image-id]');
  await Promise.all(
    [...imgs].map(async (img) => {
      const ok = await loadMemoImageIntoElement(img);
      if (!ok) img.src = DEFAULT_MEMO_COVER_IMAGE;
    })
  );
}


function findMemoWidgetById(widgetId) {
  if (!widgetId) return null;
  const inCurrentGrid = state.widgets.find((x) => x.id === widgetId);
  if (inCurrentGrid) return inCurrentGrid;

  const pages = state.currentDiary?.pages;
  if (!Array.isArray(pages)) return null;

  for (const page of pages) {
    if (!page?.widgets) continue;
    const found = page.widgets.find((x) => x.id === widgetId);
    if (found) return found;
  }
  return null;
}


function syncMemoWidgetToEntry(w) {
  if (!w?.id || !state.currentDiary?.pages) return;

  const pages = state.currentDiary.pages;
  const spreadIndex = state.currentSpreadIndex ?? 0;

  for (let i = 0; i < pages.length; i++) {
    const page = pages[i];
    if (!page) continue;
    if (!Array.isArray(page.widgets)) page.widgets = [];
    const idx = page.widgets.findIndex((existing) => existing.id === w.id);
    if (idx >= 0) {
      page.widgets[idx] = w;
      if (i === spreadIndex) state.widgets = page.widgets;
      return;
    }
  }

  const currentPage = pages[spreadIndex];
  if (!currentPage) return;
  if (!Array.isArray(currentPage.widgets)) currentPage.widgets = [];
  if (!currentPage.widgets.some((existing) => existing.id === w.id)) {
    currentPage.widgets.push(w);
  }
  state.widgets = currentPage.widgets;
}


function getActiveMemoWidget() {
  if (!activeMemoWidgetId) return null;
  return findMemoWidgetById(activeMemoWidgetId);
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


function normalizeMemoCategoryValue(category) {
  const value = (category ?? '').trim();
  if (!value || value === 'default') return '';
  return value;
}


function normalizeMemoSortBy(sortBy) {
  if (sortBy === 'updatedAt' || sortBy == null) return 'updatedAt-desc';
  return MEMO_SORT_OPTIONS.some((opt) => opt.id === sortBy) ? sortBy : 'updatedAt-desc';
}


function getMemoSortTimestamp(memo) {
  const raw = memo?.updatedAt || memo?.createdAt;
  const time = raw ? new Date(raw).getTime() : 0;
  return Number.isNaN(time) ? 0 : time;
}


function findMemoCategory(w, categoryId) {
  if (!categoryId) return null;
  return (w.categories ?? []).find((cat) => cat.id === categoryId) ?? null;
}


function getMemoCategoryLabel(w, categoryId) {
  const normalized = normalizeMemoCategoryValue(categoryId);
  if (!normalized) return '카테고리 없음';
  return findMemoCategory(w, normalized)?.name ?? '카테고리 없음';
}


function getMemoCategoryCounts(w) {
  ensureMemoWidgetData(w);
  const counts = { [MEMO_CATEGORY_ALL]: w.memos.length };
  (w.categories ?? []).forEach((cat) => {
    counts[cat.id] = 0;
  });
  w.memos.forEach((memo) => {
    const categoryId = normalizeMemoCategoryValue(memo.category);
    if (categoryId && counts[categoryId] != null) {
      counts[categoryId] += 1;
    }
  });
  return counts;
}


function getFilteredMemos(w) {
  ensureMemoWidgetData(w);
  const activeCategory = w.activeCategory ?? MEMO_CATEGORY_ALL;
  if (activeCategory === MEMO_CATEGORY_ALL) return [...w.memos];
  return w.memos.filter((memo) => normalizeMemoCategoryValue(memo.category) === activeCategory);
}


function normalizeMemoSearchQuery(query) {
  return (query ?? '').trim().toLowerCase();
}


function memoHtmlToSearchText(html) {
  return memoContentToPlainText(html).replace(/\s+/g, ' ').trim();
}


function getMemoSearchableText(memo) {
  const parts = [];
  if (memo.title) parts.push(memo.title);
  if (memo.content) parts.push(memoHtmlToSearchText(memo.content));
  (memo.pages ?? []).forEach((page) => {
    if (page.title) parts.push(page.title);
    if (page.content) parts.push(memoHtmlToSearchText(page.content));
  });
  return parts.join(' ').toLowerCase();
}


function memoMatchesSearch(memo, query) {
  const normalized = normalizeMemoSearchQuery(query);
  if (!normalized) return true;
  return getMemoSearchableText(memo).includes(normalized);
}


function getSearchFilteredMemos(memos, query) {
  const normalized = normalizeMemoSearchQuery(query);
  if (!normalized) return [...memos];
  return memos.filter((memo) => memoMatchesSearch(memo, normalized));
}


function sortMemoList(memos, sortBy) {
  const sorted = [...memos];
  const normalizedSort = normalizeMemoSortBy(sortBy);

  if (normalizedSort === 'updatedAt-desc') {
    sorted.sort((a, b) => getMemoSortTimestamp(b) - getMemoSortTimestamp(a));
  } else if (normalizedSort === 'updatedAt-asc') {
    sorted.sort((a, b) => getMemoSortTimestamp(a) - getMemoSortTimestamp(b));
  } else if (normalizedSort === 'title-asc') {
    sorted.sort((a, b) =>
      (a.title || '제목 없음').localeCompare(b.title || '제목 없음', 'ko', { sensitivity: 'base' })
    );
  }

  return sorted;
}


function getSortedAndFilteredMemos(w) {
  let filtered = getFilteredMemos(w);
  if (isMemoSearchOpen) {
    filtered = getSearchFilteredMemos(filtered, memoSearchQuery);
  }
  return sortMemoList(filtered, w.sortBy);
}


function focusMemoHomeSearchInput() {
  requestAnimationFrame(() => {
    const input = dom.memoFullscreenBody?.querySelector('.memo-home-search-input');
    if (!input) return;
    input.focus();
    const len = input.value.length;
    input.setSelectionRange(len, len);
  });
}


function syncMemoHomeSearchClearBtn() {
  const clearBtn = dom.memoFullscreenBody?.querySelector('.memo-home-search-clear');
  if (clearBtn) clearBtn.hidden = !memoSearchQuery.trim();
}


function openMemoSearch() {
  isMemoSearchOpen = true;
  memoSearchQuery = '';
  fabExpanded = false;
  closeMemoHomeMenus();
  renderMemoFullscreen();
  focusMemoHomeSearchInput();
}


function closeMemoSearch() {
  if (!isMemoSearchOpen) return;
  isMemoSearchOpen = false;
  memoSearchQuery = '';
  renderMemoFullscreen();
}


function clearMemoHomeSearch() {
  memoSearchQuery = '';
  const input = dom.memoFullscreenBody?.querySelector('.memo-home-search-input');
  if (input) input.value = '';
  syncMemoHomeSearchClearBtn();
  refreshMemoHomeCardGrid(getActiveMemoWidget());
  focusMemoHomeSearchInput();
}


function refreshMemoHomeCardGrid(w) {
  if (!w) return;
  const cardsSection = dom.memoFullscreenBody?.querySelector('.memo-home-cards');
  if (!cardsSection) return;
  renderMemoHomeCardsSection(cardsSection, w);
}


function buildMemoHomeSearchBar() {
  const overlay = document.createElement('div');
  overlay.className = 'memo-home-search-overlay';

  const header = document.createElement('header');
  header.className = 'memo-home-search-header';

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'memo-home-search-close';
  closeBtn.setAttribute('aria-label', '검색 닫기');
  closeBtn.textContent = '←';

  const field = document.createElement('div');
  field.className = 'memo-home-search-field';

  const icon = document.createElement('span');
  icon.className = 'memo-home-search-icon';
  icon.setAttribute('aria-hidden', 'true');
  icon.textContent = '🔍';

  const input = document.createElement('input');
  input.type = 'search';
  input.className = 'memo-home-search-input';
  input.placeholder = '메모 검색';
  input.autocomplete = 'off';
  input.enterKeyHint = 'search';
  input.value = memoSearchQuery;

  const clearBtn = document.createElement('button');
  clearBtn.type = 'button';
  clearBtn.className = 'memo-home-search-clear';
  clearBtn.setAttribute('aria-label', '검색어 지우기');
  clearBtn.textContent = '×';
  clearBtn.hidden = !memoSearchQuery.trim();

  field.append(icon, input, clearBtn);
  header.append(closeBtn, field);
  overlay.appendChild(header);
  return overlay;
}


function renderMemoHomeCardsSection(cardsSection, w) {
  ensureMemoWidgetData(w);
  cardsSection.replaceChildren();

  const trimmedQuery = memoSearchQuery.trim();

  if (w.memos.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'memo-home-empty';
    empty.textContent = isMemoSearchOpen ? '작성된 메모가 없습니다.' : '작성된 다이어리가 없습니다.';
    cardsSection.appendChild(empty);
    return;
  }

  const visibleMemos = getSortedAndFilteredMemos(w);

  if (!visibleMemos.length) {
    const empty = document.createElement('p');
    empty.className = 'memo-home-empty';
    if (isMemoSearchOpen && trimmedQuery) {
      empty.append(`"${trimmedQuery}"`, '에 대한 검색 결과가 없습니다.');
    } else {
      empty.textContent = '해당 카테고리에 메모가 없습니다.';
    }
    cardsSection.appendChild(empty);
    return;
  }

  const grid = document.createElement('div');
  grid.className = 'memo-home-card-grid';

  visibleMemos.forEach((memo) => {
    const card = document.createElement('article');
    card.className = 'memo-home-card';
    card.dataset.memoId = memo.id;

    const thumb = buildMemoHomeCardThumb(memo, w);

    const title = document.createElement('h3');
    title.className = 'memo-home-card-title';
    title.textContent = memo.title || '제목 없음';

    const date = document.createElement('p');
    date.className = 'memo-home-card-date';
    date.textContent = formatMemoDate(memo.updatedAt);

    card.append(thumb, title, date);
    grid.appendChild(card);
  });

  cardsSection.appendChild(grid);
  hydrateMemoHomeCardThumbs(cardsSection);
}


function resetMemoCategoryInlineUi() {
  isMemoCategoryAdding = false;
  memoCategoryEditingId = null;
  memoCategoryDraftName = '';
}


function closeMemoHomeMenus() {
  isMemoSortMenuOpen = false;
  isMemoCategoryMenuOpen = false;
  resetMemoCategoryInlineUi();
  syncMemoHomeMenusUi();
}


function closeMemoEditorCategoryPicker() {
  if (!isMemoEditorCategoryPickerOpen) return;
  isMemoEditorCategoryPickerOpen = false;
  syncMemoEditorCategoryPickerUi();
}


function syncMemoHomeMenusUi() {
  const sortMenu = dom.memoFullscreenBody?.querySelector('.memo-home-sort-menu');
  const categoryMenu = dom.memoFullscreenBody?.querySelector('.memo-home-category-menu');
  const sortBtn = dom.memoFullscreenBody?.querySelector('.memo-home-sort');
  const categoryBtn = dom.memoFullscreenBody?.querySelector('.memo-home-category');

  if (sortMenu) {
    sortMenu.hidden = !isMemoSortMenuOpen;
    sortMenu.classList.toggle('memo-home-menu--open', isMemoSortMenuOpen);
  }
  if (categoryMenu) {
    categoryMenu.hidden = !isMemoCategoryMenuOpen;
    categoryMenu.classList.toggle('memo-home-menu--open', isMemoCategoryMenuOpen);
  }
  if (sortBtn) sortBtn.setAttribute('aria-expanded', isMemoSortMenuOpen ? 'true' : 'false');
  if (categoryBtn) categoryBtn.setAttribute('aria-expanded', isMemoCategoryMenuOpen ? 'true' : 'false');

  const w = getActiveMemoWidget();
  if (!w) return;

  const activeSort = normalizeMemoSortBy(w.sortBy);
  dom.memoFullscreenBody?.querySelectorAll('.memo-home-sort-option').forEach((btn) => {
    const isActive = btn.dataset.sortBy === activeSort;
    btn.classList.toggle('is-active', isActive);
    const check = btn.querySelector('.memo-sort-menu-check');
    if (check) check.hidden = !isActive;
  });

  const activeCategory = w.activeCategory ?? MEMO_CATEGORY_ALL;
  dom.memoFullscreenBody?.querySelectorAll('.memo-category-filter-button').forEach((btn) => {
    btn.classList.toggle('is-active', btn.dataset.categoryId === activeCategory);
  });
}


function focusMemoCategoryInlineInput(selector) {
  requestAnimationFrame(() => {
    const input = dom.memoFullscreenBody?.querySelector(selector);
    if (!input) return;
    input.focus();
    input.select();
  });
}


function attachMemoCategoryInlineInputHandlers(input, onConfirm, onCancel) {
  input.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Enter') {
      e.preventDefault();
      onConfirm();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onCancel();
    }
  });
  input.addEventListener('click', (e) => e.stopPropagation());
}


function refreshMemoHomeCategoryMenu(w) {
  const anchor = dom.memoFullscreenBody?.querySelector('.memo-home-category-anchor');
  if (!anchor) return;

  const oldMenu = anchor.querySelector('.memo-home-category-menu');
  const newMenu = buildMemoCategoryMenu(w);
  if (oldMenu) {
    oldMenu.replaceWith(newMenu);
  } else {
    anchor.appendChild(newMenu);
  }

  isMemoCategoryMenuOpen = true;
  syncMemoHomeMenusUi();

  if (isMemoCategoryAdding) {
    focusMemoCategoryInlineInput('.memo-category-inline-input--add');
  } else if (memoCategoryEditingId) {
    focusMemoCategoryInlineInput('.memo-category-inline-input--edit');
  }
}


function buildMemoSortMenu(w) {
  const menu = document.createElement('div');
  menu.className = 'memo-home-sort-menu memo-home-menu';
  menu.hidden = true;
  menu.setAttribute('role', 'menu');

  MEMO_SORT_OPTIONS.forEach((opt, index) => {
    const item = document.createElement('div');
    item.className = 'memo-sort-menu-item';
    if (index === MEMO_SORT_OPTIONS.length - 1) {
      item.classList.add('memo-sort-menu-item--last');
    }

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'memo-home-sort-option memo-sort-menu-button';
    btn.dataset.sortBy = opt.id;
    btn.setAttribute('role', 'menuitem');

    const label = document.createElement('span');
    label.className = 'memo-sort-menu-label';
    label.textContent = opt.label;

    const check = document.createElement('span');
    check.className = 'memo-sort-menu-check';
    check.textContent = '✓';
    check.setAttribute('aria-hidden', 'true');

    const isActive = normalizeMemoSortBy(w.sortBy) === opt.id;
    if (isActive) btn.classList.add('is-active');
    check.hidden = !isActive;

    btn.append(label, check);
    item.appendChild(btn);
    menu.appendChild(item);
  });

  return menu;
}


function buildMemoCategoryFilterButton(categoryId, name, count, isActive) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'memo-category-filter-button';
  btn.dataset.categoryId = categoryId;

  const label = document.createElement('span');
  label.className = 'memo-category-name';
  label.textContent = name;

  const countEl = document.createElement('span');
  countEl.className = 'memo-category-count';
  countEl.textContent = String(count);

  btn.append(label, countEl);
  if (isActive) btn.classList.add('is-active');
  return btn;
}


function buildMemoCategoryInlineAddRow(w) {
  const item = document.createElement('div');
  item.className = 'memo-category-menu-item memo-category-menu-item--inline';

  const form = document.createElement('div');
  form.className = 'memo-category-inline-form';

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'memo-category-inline-input memo-category-inline-input--add';
  input.placeholder = '카테고리 이름';
  input.maxLength = MEMO_CATEGORY_NAME_MAX_LENGTH;
  input.value = memoCategoryDraftName;

  const actions = document.createElement('div');
  actions.className = 'memo-category-inline-actions';

  const cancelBtn = document.createElement('button');
  cancelBtn.type = 'button';
  cancelBtn.className = 'memo-category-inline-cancel memo-category-add-cancel';
  cancelBtn.textContent = '취소';

  const confirmBtn = document.createElement('button');
  confirmBtn.type = 'button';
  confirmBtn.className = 'memo-category-inline-confirm memo-category-add-confirm';
  confirmBtn.textContent = '추가';

  actions.append(cancelBtn, confirmBtn);
  form.append(input, actions);
  item.appendChild(form);

  attachMemoCategoryInlineInputHandlers(
    input,
    () => {
      if (addMemoCategory(w, input.value)) {
        resetMemoCategoryInlineUi();
        refreshMemoHomeCategoryMenu(w);
      }
    },
    () => {
      resetMemoCategoryInlineUi();
      refreshMemoHomeCategoryMenu(w);
    }
  );

  return item;
}


function buildMemoCategoryInlineEditRow(w, cat) {
  const item = document.createElement('div');
  item.className = 'memo-category-menu-item memo-category-menu-item--inline';
  item.dataset.categoryId = cat.id;

  const form = document.createElement('div');
  form.className = 'memo-category-inline-form';

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'memo-category-inline-input memo-category-inline-input--edit';
  input.placeholder = '카테고리 이름';
  input.maxLength = MEMO_CATEGORY_NAME_MAX_LENGTH;
  input.value = cat.name;

  const actions = document.createElement('div');
  actions.className = 'memo-category-inline-actions';

  const cancelBtn = document.createElement('button');
  cancelBtn.type = 'button';
  cancelBtn.className = 'memo-category-inline-cancel memo-category-edit-cancel';
  cancelBtn.dataset.categoryId = cat.id;
  cancelBtn.textContent = '취소';

  const saveBtn = document.createElement('button');
  saveBtn.type = 'button';
  saveBtn.className = 'memo-category-inline-confirm memo-category-edit-save';
  saveBtn.dataset.categoryId = cat.id;
  saveBtn.textContent = '저장';

  actions.append(cancelBtn, saveBtn);
  form.append(input, actions);
  item.appendChild(form);

  attachMemoCategoryInlineInputHandlers(
    input,
    () => {
      if (renameMemoCategory(w, cat.id, input.value)) {
        resetMemoCategoryInlineUi();
        refreshMemoHomeCategoryMenu(w);
      }
    },
    () => {
      resetMemoCategoryInlineUi();
      refreshMemoHomeCategoryMenu(w);
    }
  );

  return item;
}


function buildMemoCategoryMenu(w) {
  ensureMemoWidgetData(w);
  const counts = getMemoCategoryCounts(w);
  const activeCategory = w.activeCategory ?? MEMO_CATEGORY_ALL;
  const menu = document.createElement('div');
  menu.className = 'memo-home-category-menu memo-home-menu memo-category-menu';
  menu.hidden = true;
  menu.setAttribute('role', 'menu');

  const allItem = document.createElement('div');
  allItem.className = 'memo-category-menu-item memo-category-menu-item--all';
  allItem.appendChild(
    buildMemoCategoryFilterButton(
      MEMO_CATEGORY_ALL,
      '전체',
      counts[MEMO_CATEGORY_ALL] ?? 0,
      activeCategory === MEMO_CATEGORY_ALL
    )
  );
  menu.appendChild(allItem);

  w.categories.forEach((cat, index) => {
    const item = document.createElement('div');
    item.className = 'memo-category-menu-item';
    item.dataset.categoryId = cat.id;
    if (index === w.categories.length - 1 && !isMemoCategoryAdding) {
      item.classList.add('memo-category-menu-item--last-user');
    }

    if (memoCategoryEditingId === cat.id) {
      menu.appendChild(buildMemoCategoryInlineEditRow(w, cat));
      return;
    }

    const filterBtn = buildMemoCategoryFilterButton(
      cat.id,
      cat.name,
      counts[cat.id] ?? 0,
      activeCategory === cat.id
    );

    const actions = document.createElement('div');
    actions.className = 'memo-category-row-actions';

    const editBtn = document.createElement('button');
    editBtn.type = 'button';
    editBtn.className = 'memo-category-edit-button';
    editBtn.dataset.categoryId = cat.id;
    editBtn.textContent = '수정';

    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = 'memo-category-delete-button';
    deleteBtn.dataset.categoryId = cat.id;
    deleteBtn.textContent = '삭제';

    actions.append(editBtn, deleteBtn);
    item.append(filterBtn, actions);
    menu.appendChild(item);
  });

  if (isMemoCategoryAdding) {
    menu.appendChild(buildMemoCategoryInlineAddRow(w));
  } else {
    const addItem = document.createElement('div');
    addItem.className = 'memo-category-menu-item memo-category-menu-item--add-trigger';

    const addBtn = document.createElement('button');
    addBtn.type = 'button';
    addBtn.className = 'memo-home-category-add memo-category-menu-add-trigger';
    addBtn.textContent = '+ 카테고리 추가';

    addItem.appendChild(addBtn);
    menu.appendChild(addItem);
  }

  return menu;
}


function syncMemoEditorCategoryPickerUi() {
  const picker = dom.memoFullscreenBody?.querySelector('.memo-editor-category-picker');
  const btn = dom.memoFullscreenBody?.querySelector('.memo-text-page-category-btn');
  if (picker) {
    picker.hidden = !isMemoEditorCategoryPickerOpen;
    picker.classList.toggle('memo-editor-category-picker--open', isMemoEditorCategoryPickerOpen);
  }
  if (btn) btn.setAttribute('aria-expanded', isMemoEditorCategoryPickerOpen ? 'true' : 'false');

  const w = getActiveMemoWidget();
  const draft = w ? pageEditorDrafts.get(w.id) : null;
  const selectedId = draft?.memoCategoryId ?? '';

  dom.memoFullscreenBody?.querySelectorAll('.memo-editor-category-option').forEach((option) => {
    option.classList.toggle('is-active', (option.dataset.categoryId ?? '') === selectedId);
  });
}


function syncEditorCategoryBtn(w) {
  const btn = dom.memoFullscreenBody?.querySelector('.memo-text-page-category-btn');
  const draft = pageEditorDrafts.get(w.id);
  if (!btn || !draft) return;
  btn.textContent = getMemoCategoryLabel(w, draft.memoCategoryId);
}


function buildMemoEditorCategoryPicker(w) {
  ensureMemoWidgetData(w);
  const picker = document.createElement('div');
  picker.className = 'memo-editor-category-picker';
  picker.hidden = true;

  const panel = document.createElement('div');
  panel.className = 'memo-editor-category-picker-panel memo-home-menu';
  panel.setAttribute('role', 'menu');

  const noneItem = document.createElement('div');
  noneItem.className = 'memo-editor-category-menu-item';
  const noneBtn = document.createElement('button');
  noneBtn.type = 'button';
  noneBtn.className = 'memo-editor-category-option';
  noneBtn.dataset.categoryId = '';
  noneBtn.textContent = '없음';
  noneItem.appendChild(noneBtn);
  panel.appendChild(noneItem);

  w.categories.forEach((cat, index) => {
    const item = document.createElement('div');
    item.className = 'memo-editor-category-menu-item';
    if (index === w.categories.length - 1) {
      item.classList.add('memo-editor-category-menu-item--last');
    }
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'memo-editor-category-option';
    btn.dataset.categoryId = cat.id;
    btn.textContent = cat.name;
    item.appendChild(btn);
    panel.appendChild(item);
  });

  picker.appendChild(panel);
  return picker;
}


function addMemoCategory(w, name) {
  const trimmed = (name ?? '').trim();
  if (!trimmed) {
    showToast('카테고리 이름을 입력해주세요.');
    return false;
  }
  if (trimmed.length > MEMO_CATEGORY_NAME_MAX_LENGTH) {
    showToast(`카테고리 이름은 ${MEMO_CATEGORY_NAME_MAX_LENGTH}자 이하로 입력해주세요.`);
    return false;
  }

  ensureMemoWidgetData(w);
  const duplicate = (w.categories ?? []).some(
    (cat) => cat.name.trim().toLowerCase() === trimmed.toLowerCase()
  );
  if (duplicate) {
    showToast('이미 같은 이름의 카테고리가 있습니다.');
    return false;
  }

  w.categories.push({ id: crypto.randomUUID(), name: trimmed });
  syncMemoWidgetToEntry(w);
  saveEntries();
  return true;
}


function renameMemoCategory(w, categoryId, name) {
  const cat = findMemoCategory(w, categoryId);
  if (!cat) return false;

  const trimmed = (name ?? '').trim();
  if (!trimmed) {
    showToast('카테고리 이름을 입력해주세요.');
    return false;
  }
  if (trimmed.length > MEMO_CATEGORY_NAME_MAX_LENGTH) {
    showToast(`카테고리 이름은 ${MEMO_CATEGORY_NAME_MAX_LENGTH}자 이하로 입력해주세요.`);
    return false;
  }

  const duplicate = (w.categories ?? []).some(
    (item) => item.id !== categoryId && item.name.trim().toLowerCase() === trimmed.toLowerCase()
  );
  if (duplicate) {
    showToast('이미 같은 이름의 카테고리가 있습니다.');
    return false;
  }

  cat.name = trimmed;
  syncMemoWidgetToEntry(w);
  saveEntries();
  return true;
}


function deleteMemoCategory(w, categoryId) {
  ensureMemoWidgetData(w);
  w.categories = (w.categories ?? []).filter((cat) => cat.id !== categoryId);
  w.memos.forEach((memo) => {
    if (normalizeMemoCategoryValue(memo.category) === categoryId) {
      memo.category = '';
    }
  });
  if (w.activeCategory === categoryId) {
    w.activeCategory = MEMO_CATEGORY_ALL;
  }
  syncMemoWidgetToEntry(w);
  saveEntries();
}


function getSortedMemos(w) {
  const sortBy = normalizeMemoSortBy(w.sortBy);
  const sorted = [...w.memos];

  if (sortBy === 'updatedAt-desc') {
    sorted.sort((a, b) => getMemoSortTimestamp(b) - getMemoSortTimestamp(a));
  } else if (sortBy === 'updatedAt-asc') {
    sorted.sort((a, b) => getMemoSortTimestamp(a) - getMemoSortTimestamp(b));
  } else if (sortBy === 'title-asc') {
    sorted.sort((a, b) =>
      (a.title || '제목 없음').localeCompare(b.title || '제목 없음', 'ko', { sensitivity: 'base' })
    );
  }

  return sorted;
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
  ensureMemoWidgetData(w);
  const body = el.querySelector('.memo-widget-body');
  if (!body) return;

  body.replaceChildren();

  const preview = document.createElement('div');
  preview.className = 'memo-preview';

  const countEl = document.createElement('p');
  countEl.className = 'memo-preview-count';
  countEl.textContent = `${w.memos.length}개의 다이어리`;
  preview.appendChild(countEl);

  const bodyBtn = document.createElement('div');
  bodyBtn.className = 'memo-preview-body';
  bodyBtn.setAttribute('role', 'button');
  bodyBtn.tabIndex = 0;

  if (w.memos.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'memo-preview-empty';
    empty.textContent = '작성된 메모가 없습니다.';
    bodyBtn.appendChild(empty);
  } else {
    const list = document.createElement('ul');
    list.className = 'memo-preview-recent';

    getRecentMemos(w).forEach((memo) => {
      const item = document.createElement('li');
      item.className = 'memo-preview-recent-item';
      item.textContent = memo.title || '제목 없음';
      list.appendChild(item);
    });

    bodyBtn.appendChild(list);
  }

  preview.appendChild(bodyBtn);

  const openBtn = document.createElement('button');
  openBtn.type = 'button';
  openBtn.className = 'memo-preview-open';
  openBtn.textContent = '열기';
  preview.appendChild(openBtn);

  body.appendChild(preview);
}


function renderMemoHome(container, w) {
  ensureMemoWidgetData(w);
  const profile = getMemoProfile();

  const home = document.createElement('div');
  home.className = 'memo-home';
  if (isMemoSearchOpen) {
    home.classList.add('memo-home--search-open');
  }

  const cardsSection = document.createElement('section');
  cardsSection.className = 'memo-home-cards';

  if (isMemoSearchOpen) {
    home.append(buildMemoHomeSearchBar(), cardsSection);
    renderMemoHomeCardsSection(cardsSection, w);
    container.appendChild(home);
    return;
  }

  const cover = document.createElement('section');
  cover.className = 'memo-home-cover';

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

  const sortAnchor = document.createElement('div');
  sortAnchor.className = 'memo-home-sort-anchor';

  const sortBtn = document.createElement('button');
  sortBtn.type = 'button';
  sortBtn.className = 'memo-home-sort';
  sortBtn.textContent = '정렬 ▾';
  sortBtn.setAttribute('aria-haspopup', 'menu');
  sortBtn.setAttribute('aria-expanded', 'false');

  sortAnchor.append(sortBtn, buildMemoSortMenu(w));

  const categoryAnchor = document.createElement('div');
  categoryAnchor.className = 'memo-home-category-anchor';

  const categoryBtn = document.createElement('button');
  categoryBtn.type = 'button';
  categoryBtn.className = 'memo-home-category';
  categoryBtn.textContent = '카테고리';
  categoryBtn.setAttribute('aria-haspopup', 'menu');
  categoryBtn.setAttribute('aria-expanded', 'false');

  categoryAnchor.append(categoryBtn, buildMemoCategoryMenu(w));

  const editBtn = document.createElement('button');
  editBtn.type = 'button';
  editBtn.className = 'memo-home-edit';
  editBtn.textContent = '편집';

  toolbar.append(sortAnchor, categoryAnchor, editBtn);

  renderMemoHomeCardsSection(cardsSection, w);

  const fab = document.createElement('div');
  fab.className = 'memo-home-fab';

  const fabActions = document.createElement('div');
  fabActions.className = 'memo-home-fab-actions';
  if (fabExpanded) fabActions.classList.add('memo-home-fab-actions--open');

  const searchBtn = document.createElement('button');
  searchBtn.type = 'button';
  searchBtn.className = 'memo-home-fab-search';
  searchBtn.title = '검색';
  searchBtn.setAttribute('aria-label', '검색');
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

  home.append(cover, toolbar, cardsSection, fab);
  container.appendChild(home);
  syncMemoHomeMenusUi();
}


function renderMemoFullscreen() {
  const w = getActiveMemoWidget();
  if (!w || !dom.memoFullscreenBody) return;

  dom.memoFullscreenBody.replaceChildren();
  dom.memoFullscreenBody.classList.toggle('memo-fullscreen-body--home', fullscreenViewMode === 'home');
  dom.memoFullscreenBody.classList.toggle(
    'memo-fullscreen-body--home-search',
    fullscreenViewMode === 'home' && isMemoSearchOpen
  );
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

  if (fullscreenViewMode === 'editor') {
    renderMemoEditor(dom.memoFullscreenBody, w);
  } else if (fullscreenViewMode === 'profileEditor') {
    renderProfileEditor(dom.memoFullscreenBody, w);
  } else if (fullscreenViewMode === 'createSetup') {
    renderMemoCreateSetup(dom.memoFullscreenBody, w);
  } else if (fullscreenViewMode === 'pageEditor') {
    renderTextPageEditor(dom.memoFullscreenBody, w);
  } else {
    renderMemoHome(dom.memoFullscreenBody, w);
  }
}


export function openMemoFullscreen(widgetId) {
  const w = state.widgets.find((x) => x.id === widgetId);
  if (!w || w.type !== 'memo') return;

  activeMemoWidgetId = widgetId;
  fullscreenViewMode = 'home';
  selectedMemoId = null;
  fabExpanded = false;
  isMemoSearchOpen = false;
  memoSearchQuery = '';
  isMemoNoteMenuOpen = false;
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

  closeMemoPagesPanel();

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
        'memo-fullscreen-body--home-search',
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
  isMemoNoteMenuOpen = false;
  resetTemplatePopupSessionState();
  currentDiaryId = null;
  currentPageId = null;
  pageEditorDrafts.delete(w.id);
  pageEditorBaselines.delete(w.id);
  renderMemoFullscreen();
}


function goBackFromCreateSetup() {
  const w = getActiveMemoWidget();
  closeMemoPagesPanel();
  isMemoNoteMenuOpen = false;
  resetTemplatePopupSessionState();
  if (w) {
    pageEditorDrafts.delete(w.id);
    pageEditorBaselines.delete(w.id);
  }
  currentDiaryId = null;
  currentPageId = null;
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

  isMemoNoteMenuOpen = false;
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

  isMemoNoteMenuOpen = false;
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
  isMemoNoteMenuOpen = false;
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


function renderMemoSinglePageContent(pageEl, page) {
  const isContinuation = isPageContinuation(page);
  if (isContinuation) {
    pageEl.classList.add('memo-note-page--continuation');
  }

  const editBtn = document.createElement('button');
  editBtn.type = 'button';
  editBtn.className = 'memo-note-page-edit';
  editBtn.textContent = '편집';

  const header = document.createElement('header');
  header.className = 'memo-note-page-header';

  const categoryText = formatPageCategoryDisplay(page.category);
  if (categoryText) {
    const categoryEl = document.createElement('p');
    categoryEl.className = 'memo-note-page-category';
    categoryEl.textContent = categoryText;
    header.appendChild(categoryEl);
  }

  if (isContinuation) {
    header.append(editBtn);
    pageEl.append(header);
  } else {
    const dateEl = document.createElement('p');
    dateEl.className = 'memo-note-page-date';
    dateEl.textContent = formatPageDateDisplay(page.date);
    header.append(dateEl, editBtn);

    const titleEl = document.createElement('h3');
    titleEl.className = 'memo-note-page-title';
    titleEl.textContent = page.title || '제목 없음';

    const divider = document.createElement('hr');
    divider.className = 'memo-note-page-divider';
    divider.setAttribute('aria-hidden', 'true');

    pageEl.append(header, titleEl, divider);
  }

  const contentEl = document.createElement('div');
  contentEl.className = 'memo-note-page-content memo-sheet-read-content';
  if (isContinuation) {
    contentEl.classList.add('memo-note-page-content--continuation');
  }
  renderMemoPageContentIntoElement(contentEl, page.content);
  pageEl.appendChild(contentEl);
}


function navigateMemoReadPage(w, direction) {
  const memo = getActiveCreateSetupMemo(w);
  const pages = memo?.pages ?? [];
  if (!pages.length) return;

  let idx = pages.findIndex((p) => p.id === currentPageId);
  if (idx < 0) idx = 0;

  const nextIdx = idx + direction;
  if (nextIdx < 0 || nextIdx >= pages.length) return;

  currentPageId = pages[nextIdx].id;
  refreshMemoSinglePageView(w);
}


function updateMemoNotePageNavState(navEl, memo) {
  if (!navEl) return;

  const pages = memo?.pages ?? [];
  if (pages.length <= 1) {
    navEl.hidden = true;
    return;
  }

  navEl.hidden = false;

  let idx = pages.findIndex((p) => p.id === currentPageId);
  if (idx < 0) idx = 0;

  const indicator = navEl.querySelector('.memo-note-page-indicator');
  const prevBtn = navEl.querySelector('.memo-note-page-prev');
  const nextBtn = navEl.querySelector('.memo-note-page-next');

  if (indicator) indicator.textContent = `${idx + 1} / ${pages.length}`;
  if (prevBtn) prevBtn.disabled = idx <= 0;
  if (nextBtn) nextBtn.disabled = idx >= pages.length - 1;
}


function buildMemoNotePageNav(memo) {
  const nav = document.createElement('div');
  nav.className = 'memo-note-page-nav';

  const prevBtn = document.createElement('button');
  prevBtn.type = 'button';
  prevBtn.className = 'memo-note-page-prev';
  prevBtn.textContent = '‹';
  prevBtn.setAttribute('aria-label', '이전 페이지');

  const indicator = document.createElement('span');
  indicator.className = 'memo-note-page-indicator';

  const nextBtn = document.createElement('button');
  nextBtn.type = 'button';
  nextBtn.className = 'memo-note-page-next';
  nextBtn.textContent = '›';
  nextBtn.setAttribute('aria-label', '다음 페이지');

  nav.append(prevBtn, indicator, nextBtn);
  updateMemoNotePageNavState(nav, memo);
  return nav;
}


function refreshMemoSinglePageView(w) {
  const pageArea = dom.memoFullscreenBody?.querySelector('.memo-note-page-area');
  if (!pageArea) {
    renderMemoFullscreen();
    return;
  }

  const memo = getActiveCreateSetupMemo(w);
  if (memo) resolveCurrentPageIdForDiary(memo);

  pageArea.replaceChildren();

  const pages = memo?.pages ?? [];
  if (!pages.length) {
    const empty = document.createElement('div');
    empty.className = 'memo-note-page-area-empty';
    empty.textContent = 'Empty';
    pageArea.appendChild(empty);
    return;
  }

  let page = pages.find((p) => p.id === currentPageId) ?? null;
  if (!page) {
    page = pages[0];
    currentPageId = page.id;
  }

  const pageEl = document.createElement('article');
  pageEl.className = 'memo-note-page glass-panel';
  pageEl.dataset.pageId = page.id;
  renderMemoSinglePageContent(pageEl, page);
  pageArea.appendChild(pageEl);

  if (pages.length > 1) {
    pageArea.appendChild(buildMemoNotePageNav(memo));
  }

  setupMemoReadModeImages(pageArea).catch(() => {});
}


function renderMemoSinglePageView(container, w) {
  const view = document.createElement('div');
  view.className = 'memo-note-view';

  const toolbar = document.createElement('div');
  toolbar.className = 'memo-note-toolbar';

  const backBtn = document.createElement('button');
  backBtn.type = 'button';
  backBtn.className = 'memo-note-back';
  backBtn.textContent = '←';
  backBtn.setAttribute('aria-label', 'Memo 홈으로');

  const menuAnchor = document.createElement('div');
  menuAnchor.className = 'memo-note-menu-anchor';

  const moreBtn = document.createElement('button');
  moreBtn.type = 'button';
  moreBtn.className = 'memo-note-more';
  moreBtn.textContent = '⋮';
  moreBtn.setAttribute('aria-label', '메모 메뉴');
  moreBtn.setAttribute('aria-expanded', 'false');
  moreBtn.setAttribute('aria-haspopup', 'menu');

  const menuPanel = document.createElement('div');
  menuPanel.className = 'memo-note-menu';
  menuPanel.setAttribute('role', 'menu');
  menuPanel.hidden = true;

  createSetupMenuItems.forEach((item, index) => {
    const menuBtn = document.createElement('button');
    menuBtn.type = 'button';
    menuBtn.className = 'memo-note-menu-item';
    menuBtn.dataset.setupId = item.id;
    menuBtn.setAttribute('role', 'menuitem');
    menuBtn.textContent = item.label;
    menuPanel.appendChild(menuBtn);

    if (index < createSetupMenuItems.length - 1) {
      const divider = document.createElement('span');
      divider.className = 'memo-note-menu-divider';
      divider.setAttribute('aria-hidden', 'true');
      menuPanel.appendChild(divider);
    }
  });

  menuAnchor.append(moreBtn, menuPanel);
  toolbar.append(backBtn, menuAnchor);

  const pageArea = document.createElement('div');
  pageArea.className = 'memo-note-page-area';

  const stage = document.createElement('div');
  stage.className = 'memo-note-stage';
  stage.append(toolbar, pageArea, buildTemplatePopupElement());

  view.appendChild(stage);
  container.appendChild(view);

  refreshMemoSinglePageView(w);
  syncMemoNoteMenuUi();
  syncTemplatePopupUi();
}


function renderMemoCreateSetup(container, w) {
  renderMemoSinglePageView(container, w);
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
  isMemoNoteMenuOpen = false;
  fullscreenViewMode = 'home';
  renderMemoFullscreen();
  showToast('프로필이 저장되었습니다.');
}


function cancelProfileEditor(w) {
  profileDrafts.delete(w.id);
  isMemoNoteMenuOpen = false;
  fullscreenViewMode = 'home';
  renderMemoFullscreen();
}


function getEditorDraft(w) {
  if (editorDrafts.has(w.id)) {
    return editorDrafts.get(w.id);
  }

  if (selectedMemoId) {
    const memo = w.memos.find((m) => m.id === selectedMemoId);
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
    const memo = w.memos.find((m) => m.id === selectedMemoId);
    if (memo) {
      memo.title = title;
      memo.content = content;
      memo.updatedAt = now;
    }
  } else {
    w.memos.push({
      id: crypto.randomUUID(),
      title,
      content,
      category: 'default',
      coverImage: '',
      pages: [],
      draftPages: [],
      createdAt: now,
      updatedAt: now,
    });
  }

  editorDrafts.delete(w.id);
  isMemoNoteMenuOpen = false;
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

  w.memos = w.memos.filter((m) => m.id !== selectedMemoId);
  editorDrafts.delete(w.id);
  isMemoNoteMenuOpen = false;
  fullscreenViewMode = 'home';
  selectedMemoId = null;
  fabExpanded = false;
  renderMemoFullscreen();
  refreshMemoPreview(w.id);
  showToast('메모가 삭제되었습니다.');
}


function goBackToHome(w) {
  editorDrafts.delete(w.id);
  isMemoNoteMenuOpen = false;
  fullscreenViewMode = 'home';
  selectedMemoId = null;
  renderMemoFullscreen();
}


export function bindMemoFullscreenEvents() {
  if (dom.memoFullscreenOverlay.dataset.bound) return;
  dom.memoFullscreenOverlay.dataset.bound = '1';

  dom.memoFullscreenBack.addEventListener('click', closeMemoFullscreen);

  dom.memoFullscreenBody.addEventListener('input', (e) => {
    if (fullscreenViewMode !== 'home' || !isMemoSearchOpen) return;
    const input = e.target.closest('.memo-home-search-input');
    if (!input) return;
    memoSearchQuery = input.value;
    syncMemoHomeSearchClearBtn();
    refreshMemoHomeCardGrid(getActiveMemoWidget());
  });

  dom.memoFullscreenBody.addEventListener('dblclick', (e) => {
    const w = getActiveMemoWidget();
    if (!w || fullscreenViewMode !== 'createSetup') return;
    const pageEl = e.target.closest('.memo-note-page');
    if (pageEl?.dataset.pageId) {
      openBinderPageEditor(w, pageEl.dataset.pageId);
    }
  });

  dom.memoFullscreenBody.addEventListener('click', (e) => {
    const w = getActiveMemoWidget();
    if (!w) return;

    if (fullscreenViewMode === 'home') {
      if (e.target.closest('.memo-category-add-cancel')) {
        e.stopPropagation();
        resetMemoCategoryInlineUi();
        refreshMemoHomeCategoryMenu(w);
        return;
      }
      if (e.target.closest('.memo-category-add-confirm')) {
        e.stopPropagation();
        const input = dom.memoFullscreenBody?.querySelector('.memo-category-inline-input--add');
        if (addMemoCategory(w, input?.value ?? '')) {
          resetMemoCategoryInlineUi();
          refreshMemoHomeCategoryMenu(w);
        }
        return;
      }
      if (e.target.closest('.memo-category-edit-cancel')) {
        e.stopPropagation();
        resetMemoCategoryInlineUi();
        refreshMemoHomeCategoryMenu(w);
        return;
      }
      if (e.target.closest('.memo-category-edit-save')) {
        e.stopPropagation();
        const categoryId = e.target.closest('.memo-category-edit-save')?.dataset.categoryId;
        const input = dom.memoFullscreenBody?.querySelector('.memo-category-inline-input--edit');
        if (renameMemoCategory(w, categoryId, input?.value ?? '')) {
          resetMemoCategoryInlineUi();
          refreshMemoHomeCategoryMenu(w);
        }
        return;
      }
      if (e.target.closest('.memo-category-inline-input')) {
        return;
      }
      if (e.target.closest('.memo-home-sort-option')) {
        const btn = e.target.closest('.memo-home-sort-option');
        w.sortBy = btn.dataset.sortBy;
        syncMemoWidgetToEntry(w);
        saveEntries();
        closeMemoHomeMenus();
        renderMemoFullscreen();
        return;
      }
      if (e.target.closest('.memo-category-edit-button')) {
        e.stopPropagation();
        const categoryId = e.target.closest('.memo-category-edit-button')?.dataset.categoryId;
        if (!findMemoCategory(w, categoryId)) return;
        isMemoCategoryAdding = false;
        memoCategoryEditingId = categoryId;
        refreshMemoHomeCategoryMenu(w);
        return;
      }
      if (e.target.closest('.memo-category-delete-button')) {
        e.stopPropagation();
        const categoryId = e.target.closest('.memo-category-delete-button')?.dataset.categoryId;
        const cat = findMemoCategory(w, categoryId);
        if (!cat) return;
        openConfirmDialog({
          title: `'${cat.name}' 카테고리를 삭제할까요?`,
          message: '이 카테고리에 포함된 메모는 삭제되지 않으며 카테고리만 해제됩니다.',
          confirmLabel: '삭제',
          cancelLabel: '취소',
          danger: true,
        }).then((confirmed) => {
          if (!confirmed) return;
          deleteMemoCategory(w, categoryId);
          resetMemoCategoryInlineUi();
          refreshMemoHomeCategoryMenu(w);
        });
        return;
      }
      if (e.target.closest('.memo-home-category-add')) {
        e.stopPropagation();
        resetMemoCategoryInlineUi();
        isMemoCategoryAdding = true;
        isMemoCategoryMenuOpen = true;
        refreshMemoHomeCategoryMenu(w);
        return;
      }
      if (e.target.closest('.memo-category-filter-button')) {
        const btn = e.target.closest('.memo-category-filter-button');
        w.activeCategory = btn.dataset.categoryId ?? MEMO_CATEGORY_ALL;
        syncMemoWidgetToEntry(w);
        saveEntries();
        closeMemoHomeMenus();
        renderMemoFullscreen();
        return;
      }
      if (e.target.closest('.memo-home-sort-menu') || e.target.closest('.memo-home-category-menu')) {
        return;
      }
      if (e.target.closest('.memo-home-sort')) {
        isMemoCategoryMenuOpen = false;
        resetMemoCategoryInlineUi();
        isMemoSortMenuOpen = !isMemoSortMenuOpen;
        syncMemoHomeMenusUi();
        return;
      }
      if (e.target.closest('.memo-home-category')) {
        isMemoSortMenuOpen = false;
        const willOpen = !isMemoCategoryMenuOpen;
        if (willOpen) resetMemoCategoryInlineUi();
        isMemoCategoryMenuOpen = willOpen;
        syncMemoHomeMenusUi();
        return;
      }
      if (isMemoSortMenuOpen || isMemoCategoryMenuOpen) {
        closeMemoHomeMenus();
      }
      if (e.target.closest('.memo-home-edit')) {
        openProfileEditor();
        return;
      }
      if (e.target.closest('.memo-home-fab-toggle')) {
        toggleMemoFab();
        return;
      }
      if (e.target.closest('.memo-home-fab-search')) {
        openMemoSearch();
        return;
      }
      if (e.target.closest('.memo-home-search-close')) {
        closeMemoSearch();
        return;
      }
      if (e.target.closest('.memo-home-search-clear')) {
        clearMemoHomeSearch();
        return;
      }
      if (e.target.closest('.memo-home-fab-new')) {
        openMemoCreateSetup();
        return;
      }

      const card = e.target.closest('.memo-home-card');
      if (card?.dataset.memoId) {
        openMemoBinderForDiary(w, card.dataset.memoId);
        return;
      }

      return;
    }

    if (fullscreenViewMode === 'pageEditor') {
      if (e.target.closest('.memo-editor-category-option')) {
        const option = e.target.closest('.memo-editor-category-option');
        const draft = pageEditorDrafts.get(w.id);
        if (!draft) return;
        pageEditorDrafts.set(w.id, {
          ...draft,
          memoCategoryId: option.dataset.categoryId ?? '',
        });
        closeMemoEditorCategoryPicker();
        syncEditorCategoryBtn(w);
        return;
      }
      if (e.target.closest('.memo-editor-category-picker-panel')) {
        return;
      }
      if (e.target.closest('.memo-text-page-category-btn')) {
        e.stopPropagation();
        isMemoEditorCategoryPickerOpen = !isMemoEditorCategoryPickerOpen;
        syncMemoEditorCategoryPickerUi();
        return;
      }
      if (isMemoEditorCategoryPickerOpen) {
        closeMemoEditorCategoryPicker();
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
      if (e.target.closest('.memo-text-page-back')) {
        goBackFromPageEditor(w);
        return;
      }
      if (e.target.closest('.memo-text-page-save')) {
        saveTextPageFromDraft(w);
        return;
      }
      if (e.target.closest('.memo-text-page-continue')) {
        continueWritingOnNextSheet(w);
        return;
      }
      const toolBtn = e.target.closest('.memo-text-page-tool');
      if (toolBtn?.dataset.toolId === 'photo') {
        e.stopPropagation();
        const fileInput = dom.memoFullscreenBody?.querySelector('.memo-photo-file-input');
        const contentEditor = dom.memoFullscreenBody?.querySelector('.memo-text-page-content');
        if (fileInput && contentEditor) {
          openMemoPhotoPicker(contentEditor, fileInput, dom.memoFullscreenBody);
        }
        return;
      }
      if (toolBtn) {
        showToast(toolBtn.dataset.toolToast || '준비 중인 기능입니다.');
        return;
      }
      return;
    }

    if (fullscreenViewMode === 'createSetup') {
      if (e.target.closest('.memo-note-page-prev')) {
        navigateMemoReadPage(w, -1);
        return;
      }
      if (e.target.closest('.memo-note-page-next')) {
        navigateMemoReadPage(w, 1);
        return;
      }
      if (e.target.closest('.memo-note-page-edit')) {
        const pageEl = e.target.closest('.memo-note-page');
        if (pageEl?.dataset.pageId) {
          openBinderPageEditor(w, pageEl.dataset.pageId);
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
      if (e.target.closest('.memo-note-back')) {
        goBackFromCreateSetup();
        return;
      }
      if (e.target.closest('.memo-note-more')) {
        e.stopPropagation();
        toggleMemoNoteMenu();
        return;
      }
      const menuItem = e.target.closest('.memo-note-menu-item');
      if (menuItem) {
        e.stopPropagation();
        if (menuItem.dataset.setupId === 'template') {
          closeMemoNoteMenu();
          openTemplatePopup();
          return;
        }
        if (menuItem.dataset.setupId === 'pages') {
          closeMemoNoteMenu();
          openMemoPagesOverlay(w);
          return;
        }
        showToast('준비 중인 기능입니다.');
        closeMemoNoteMenu();
        return;
      }
      if (e.target.closest('.memo-note-menu')) {
        return;
      }
      if (isMemoNoteMenuOpen) {
        closeMemoNoteMenu();
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
    if (fullscreenViewMode === 'pageEditor') {
      if (dom.memoFullscreenBody?.querySelector('.memo-page-leave-dialog')) {
        removePageEditorLeaveDialog();
        return;
      }
      if (isMemoEditorCategoryPickerOpen) {
        closeMemoEditorCategoryPicker();
        return;
      }
    }
    if (fullscreenViewMode === 'home') {
      if (isMemoCategoryAdding || memoCategoryEditingId) {
        resetMemoCategoryInlineUi();
        const activeWidget = getActiveMemoWidget();
        if (activeWidget) refreshMemoHomeCategoryMenu(activeWidget);
        return;
      }
      if (isMemoSortMenuOpen || isMemoCategoryMenuOpen) {
        closeMemoHomeMenus();
        return;
      }
      if (isMemoSearchOpen) {
        closeMemoSearch();
        return;
      }
    }
    if (fullscreenViewMode !== 'createSetup') return;
    if (isMemoPagesPanelOpen()) {
      closeMemoPagesPanel();
      return;
    }
    if (isTemplatePopupOpen) {
      closeTemplatePopup();
      return;
    }
    if (isMemoNoteMenuOpen) {
      closeMemoNoteMenu();
    }
  });
}


export function bindMemoWidgetEvents(el) {
  const root = el.querySelector('.memo-widget');
  if (!root || root.dataset.memoBound) return;
  root.dataset.memoBound = '1';

  const widgetId = el.dataset.widgetId;
  const openSelector = '.memo-preview-open, .memo-preview-body';

  root.addEventListener('click', (e) => {
    if (e.target.closest('.widget-delete')) return;

    if (e.target.closest(openSelector)) {
      e.stopPropagation();
      openMemoFullscreen(widgetId);
    }
  });

  root.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    if (!e.target.closest('.memo-preview-body')) return;
    e.preventDefault();
    e.stopPropagation();
    openMemoFullscreen(widgetId);
  });

  root.addEventListener('mousedown', (e) => {
    if (e.target.closest(`button, ${openSelector}`)) e.stopPropagation();
  });

  root.addEventListener('pointerdown', (e) => {
    if (e.target.closest(`button, ${openSelector}`)) e.stopPropagation();
  });
}
