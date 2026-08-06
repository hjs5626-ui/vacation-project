/* ═══════════════════════════════════════════════════════════
   MEMENTO DIARY — Memo Widget Logic
   ═══════════════════════════════════════════════════════════ */

import { state, saveEntries, ensureMemoProfile, saveMemoProfile, DEFAULT_MEMO_PROFILE } from './state.js';
import { dom } from './dom.js';
import { showToast } from './utils.js';
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
  { id: 'photo', icon: '📷', label: '사진', toast: '사진 첨부 기능은 준비 중입니다.' },
  { id: 'align', icon: '≡', label: '정렬', toast: '텍스트 정렬 기능은 준비 중입니다.' },
  { id: 'map', icon: '📍', label: '지도', toast: '지도 불러오기 기능은 준비 중입니다.' },
  { id: 'ledger', icon: '₩', label: '가계부', toast: '가계부 불러오기 기능은 준비 중입니다.' },
  { id: 'link', icon: '🔗', label: '링크', toast: '외부 링크 첨부 기능은 준비 중입니다.' },
  { id: 'archive', icon: '🗂️', label: '보관함', toast: '보관함 기능은 준비 중입니다.', edge: true },
];

const SHEET_TITLE_MAX_LENGTH = 50;
const PAGE_OVERFLOW_TOAST = '한 페이지에 입력할 수 있는 분량을 초과했습니다.';
const CONTINUE_SHEET_FILL_RATIO = 0.88;

const MEMO_HTML_ALLOWED_TAGS = new Set(['div', 'p', 'br', 'strong', 'b', 'em', 'i', 'u']);

/** Session-only — not persisted */
let activeMemoWidgetId = null;
let fullscreenViewMode = 'home';
let selectedMemoId = null;
let fabExpanded = false;
let isCreateSetupMenuOpen = false;
let isTemplatePopupOpen = false;
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

  if (w.sortBy == null) w.sortBy = 'updatedAt';
  if (w.activeCategory == null) w.activeCategory = 'all';

  w.memos.forEach((memo) => {
    if (memo.category == null) memo.category = 'default';
    if (memo.coverImage == null) memo.coverImage = '';
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
}


function resetPageEditorSessionState() {
  pageEditorDrafts.clear();
  pageEditorBaselines.clear();
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
  isCreateSetupMenuOpen = false;
  resetTemplatePopupSessionState();
  resetPageEditorSessionState();
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
  const html = sanitizeMemoHtml(el.innerHTML);
  if (!memoContentToPlainText(html).trim()) return '';
  return html;
}


function renderMemoPageContentIntoElement(el, content) {
  if (!el) return;
  el.replaceChildren();
  const html = renderMemoPageContentHtml(content);
  if (html) el.innerHTML = html;
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
  const memo = w.memos.find((m) => m.id === diaryId);
  if (!memo) return;

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


function renderBinderSheetSlot(slotEl, page, memo, options = {}) {
  if (!slotEl) return;
  slotEl.replaceChildren();

  const { side = 'left', emptyMessage = null, showBlankSheet = false } = options;

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

  const sheet = document.createElement('article');
  sheet.className = 'memo-binder-sheet';
  sheet.dataset.pageId = page.id;
  sheet.dataset.side = side;

  const isContinuation = isPageContinuation(page);
  if (isContinuation) {
    sheet.classList.add('memo-binder-sheet--continuation');
  }

  const editBtn = document.createElement('button');
  editBtn.type = 'button';
  editBtn.className = 'memo-binder-page-edit';
  editBtn.textContent = '편집';

  const header = document.createElement('header');
  header.className = 'memo-binder-sheet-header sheet-header';

  const categoryText = formatPageCategoryDisplay(page.category);
  if (categoryText) {
    const categoryEl = document.createElement('p');
    categoryEl.className = 'memo-binder-sheet-category sheet-category';
    categoryEl.textContent = categoryText;
    header.appendChild(categoryEl);
  }

  if (isContinuation) {
    header.append(editBtn);
  } else {
    const dateEl = document.createElement('p');
    dateEl.className = 'memo-binder-sheet-date sheet-date';
    dateEl.textContent = formatPageDateDisplay(page.date);
    header.append(dateEl, editBtn);

    const titleEl = document.createElement('h3');
    titleEl.className = 'memo-binder-sheet-title sheet-title';
    titleEl.textContent = page.title || '제목 없음';

    const divider = document.createElement('hr');
    divider.className = 'memo-binder-sheet-divider sheet-divider';
    divider.setAttribute('aria-hidden', 'true');

    const contentEl = document.createElement('div');
    contentEl.className = 'memo-binder-sheet-content sheet-content memo-sheet-read-content';
    renderMemoPageContentIntoElement(contentEl, page.content);

    const pageIndex = memo.pages.findIndex((p) => p.id === page.id);
    const pageNumEl = document.createElement('p');
    pageNumEl.className = 'memo-binder-sheet-page-number sheet-page-number';
    pageNumEl.textContent = pageIndex >= 0 ? `${pageIndex + 1}` : '';

    sheet.append(header, titleEl, divider, contentEl, pageNumEl);
    slotEl.appendChild(sheet);
    return;
  }

  const contentEl = document.createElement('div');
  contentEl.className =
    'memo-binder-sheet-content sheet-content memo-sheet-read-content memo-binder-sheet-content--continuation';
  renderMemoPageContentIntoElement(contentEl, page.content);

  const pageIndex = memo.pages.findIndex((p) => p.id === page.id);
  const pageNumEl = document.createElement('p');
  pageNumEl.className = 'memo-binder-sheet-page-number sheet-page-number';
  pageNumEl.textContent = pageIndex >= 0 ? `${pageIndex + 1}` : '';

  sheet.append(header, contentEl, pageNumEl);
  slotEl.appendChild(sheet);
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

  renderBinderSheetSlot(leftSlot, spread.leftPage, memo, { side: 'left' });
  renderBinderSheetSlot(rightSlot, spread.rightPage, memo, {
    side: 'right',
    emptyMessage: !pages.length ? '아직 추가된 페이지가 없습니다.' : null,
    showBlankSheet: pages.length > 0 && spread.leftPage && !spread.rightPage,
  });

  const stage = book.closest('.memo-create-setup-stage');
  const nav = stage?.querySelector('.memo-binder-nav');
  updateBinderPageNavState(nav, memo);
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


function getPageCategoryLabel() {
  return '카테고리 없음';
}


function clonePageDraft(draft) {
  return {
    pageId: draft.pageId ?? null,
    templateId: normalizeMemoTemplateId(draft.templateId),
    category: '',
    date: draft.date ?? '',
    title: draft.title ?? '',
    content: draft.content ?? '',
    insertPosition: draft.insertPosition ?? 'after-current',
    isTemporary: draft.isTemporary ?? false,
    isContinuation: Boolean(draft.isContinuation),
  };
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
  const draft = {
    pageId: null,
    templateId: normalizeMemoTemplateId(sheetDraft.selectedTemplateId),
    category: '',
    date: getLocalDateInputValue(),
    title: '',
    content: '',
    insertPosition: sheetDraft.insertPosition ?? 'after-current',
    isTemporary: false,
    isContinuation: false,
  };
  pageEditorDrafts.set(w.id, draft);
  pageEditorBaselines.set(w.id, clonePageDraft(draft));
  fullscreenViewMode = 'pageEditor';
  renderMemoFullscreen();
}


function openTextPageEditorForPage(w, pageId) {
  const memo = findMemoContainingPage(w, pageId);
  const page = memo?.pages.find((p) => p.id === pageId);
  if (!memo || !page) return;

  currentDiaryId = memo.id;
  currentPageId = pageId;

  const draft = {
    pageId: page.id,
    templateId: normalizeMemoTemplateId(page.templateId),
    category: '',
    date: isPageContinuation(page) ? '' : page.date || getLocalDateInputValue(),
    title: isPageContinuation(page) ? '' : page.title === '제목 없음' ? '' : page.title ?? '',
    content: page.content ?? '',
    insertPosition: 'after-current',
    isTemporary: false,
    isContinuation: isPageContinuation(page),
  };
  pageEditorDrafts.set(w.id, draft);
  pageEditorBaselines.set(w.id, clonePageDraft(draft));
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
  if (!draft) return false;

  if ((draft.title || '').trim() || memoContentToPlainText(draft.content).trim()) {
    return true;
  }

  return isPageEditorDirty(w);
}


function exitPageEditorToCreateSetup(w) {
  removePageEditorLeaveDialog();
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
      category: 'default',
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


function bindPageEditorContentLimits(w, titleInput, contentEditor, continueBtn) {
  let lastValidContent = getRichEditorContentHtml(contentEditor);
  let composing = false;

  const syncAndContinue = () => {
    syncPageEditorDraftFromForm(w);
    if (continueBtn) {
      const showContinue = getPageEditorContentFillRatio(contentEditor) >= CONTINUE_SHEET_FILL_RATIO;
      continueBtn.hidden = !showContinue;
      const continueRow = continueBtn.closest('.memo-text-page-continue-row');
      if (continueRow) continueRow.hidden = !showContinue;
    }
  };

  const rejectOverflow = () => {
    contentEditor.innerHTML = lastValidContent;
    showToast(PAGE_OVERFLOW_TOAST);
    syncAndContinue();
  };

  const validateContent = () => {
    if (composing) {
      syncAndContinue();
      return;
    }
    if (!isPageEditorContentWithinLimit(contentEditor)) {
      rejectOverflow();
      return;
    }
    lastValidContent = getRichEditorContentHtml(contentEditor);
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


function persistTextPageFromDraft(w) {
  syncPageEditorDraftFromForm(w);
  const draft = pageEditorDrafts.get(w.id);
  if (!draft) return false;

  const contentInput = dom.memoFullscreenBody?.querySelector('.memo-text-page-content');
  if (contentInput && !isPageEditorContentWithinLimit(contentInput)) {
    showToast(PAGE_OVERFLOW_TOAST);
    return false;
  }

  const container = dom.memoFullscreenBody;
  const draftTitle = draft.title ?? '';
  const draftContent = sanitizeMemoHtml(draft.content ?? '');
  if (container && !doesPageContentFitReadSheet(draftTitle, draftContent, container, isPageContinuation(draft))) {
    showToast(PAGE_OVERFLOW_TOAST);
    return false;
  }

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
      category: 'default',
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

  let savedPageId = draft.pageId;

  if (draft.pageId) {
    const page = memo.pages.find((p) => p.id === draft.pageId);
    if (page) {
      page.category = '';
      page.date = pageDate;
      page.title = pageTitle;
      page.isContinuation = isPageContinuation(draft);
      page.content = sanitizeMemoHtml(draft.content ?? '');
      page.templateId = normalizeMemoTemplateId(draft.templateId ?? page.templateId);
      page.updatedAt = now;
      currentPageId = page.id;
      savedPageId = page.id;
    }
  } else {
    const newPage = {
      id: crypto.randomUUID(),
      templateId: normalizeMemoTemplateId(draft.templateId),
      category: '',
      date: pageDate,
      title: pageTitle,
      isContinuation: isPageContinuation(draft),
      content: sanitizeMemoHtml(draft.content ?? ''),
      createdAt: now,
      updatedAt: now,
    };
    memo.pages = insertPageByPosition(
      memo.pages,
      newPage,
      draft.insertPosition ?? 'after-current',
      currentPageId
    );
    currentPageId = newPage.id;
    savedPageId = newPage.id;
  }

  if (savedPageId) {
    memo.draftPages = memo.draftPages.filter((p) => p.id !== savedPageId);
  }

  if (!isPageContinuation(draft)) {
    memo.title = pageTitle;
  }
  memo.content = sanitizeMemoHtml(draft.content ?? '');
  memo.updatedAt = now;
  currentDiaryId = memo.id;

  saveEntries();
  refreshMemoPreview(w.id);
  return true;
}


function continueWritingOnNextSheet(w) {
  if (!persistTextPageFromDraft(w)) return;

  const memo = getActiveCreateSetupMemo(w);
  const page = memo?.pages.find((p) => p.id === currentPageId);

  const draft = {
    pageId: null,
    templateId: MEMO_BASIC_TEMPLATE_ID,
    category: page?.category ?? '',
    date: '',
    title: '',
    content: '',
    insertPosition: 'after-current',
    isTemporary: false,
    isContinuation: true,
  };
  pageEditorDrafts.set(w.id, draft);
  pageEditorBaselines.set(w.id, clonePageDraft(draft));
  fullscreenViewMode = 'pageEditor';
  renderMemoFullscreen();
}


function saveTextPageFromDraft(w) {
  if (!persistTextPageFromDraft(w)) return;

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

  const categoryBtn = document.createElement('button');
  categoryBtn.type = 'button';
  categoryBtn.className = 'memo-text-page-category-btn';
  categoryBtn.textContent = '카테고리 없음';

  const saveBtn = document.createElement('button');
  saveBtn.type = 'button';
  saveBtn.className = 'memo-text-page-save';
  saveBtn.textContent = '저장';

  header.append(backBtn, categoryBtn, saveBtn);

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
  shell.append(header, body, continueRow, buildTextPageToolbar());
  container.appendChild(shell);

  ensurePageEditorMeasureRoot(container);
  bindPageEditorContentLimits(w, isContinuation ? null : titleInput, contentEditor, continueBtn);
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


function getSortedMemos(w) {
  return [...w.memos].sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
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

  const sortBtn = document.createElement('button');
  sortBtn.type = 'button';
  sortBtn.className = 'memo-home-sort';
  sortBtn.textContent = '정렬 ▾';

  const categoryBtn = document.createElement('button');
  categoryBtn.type = 'button';
  categoryBtn.className = 'memo-home-category';
  categoryBtn.textContent = '카테고리';

  const editBtn = document.createElement('button');
  editBtn.type = 'button';
  editBtn.className = 'memo-home-edit';
  editBtn.textContent = '편집';

  toolbar.append(sortBtn, categoryBtn, editBtn);

  const cardsSection = document.createElement('section');
  cardsSection.className = 'memo-home-cards';

  if (w.memos.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'memo-home-empty';
    empty.textContent = '작성된 다이어리가 없습니다.';
    cardsSection.appendChild(empty);
  } else {
    const grid = document.createElement('div');
    grid.className = 'memo-home-card-grid';

    getSortedMemos(w).forEach((memo) => {
      const card = document.createElement('article');
      card.className = 'memo-home-card';
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
      grid.appendChild(card);
    });

    cardsSection.appendChild(grid);
  }

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
}


function renderMemoFullscreen() {
  const w = getActiveMemoWidget();
  if (!w || !dom.memoFullscreenBody) return;

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
  isCreateSetupMenuOpen = false;
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
  stage.append(binderStage, buildTemplatePopupElement());

  setup.append(backBtn, stage);
  container.appendChild(setup);

  refreshBinderSpreadView(w);
  syncCreateSetupMenuUi();
  syncTemplatePopupUi();
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

  w.memos = w.memos.filter((m) => m.id !== selectedMemoId);
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

  dom.memoFullscreenBody.addEventListener('dblclick', (e) => {
    const w = getActiveMemoWidget();
    if (!w || fullscreenViewMode !== 'createSetup') return;
    const sheet = e.target.closest('.memo-binder-sheet');
    if (sheet?.dataset.pageId) {
      openBinderPageEditor(w, sheet.dataset.pageId);
    }
  });

  dom.memoFullscreenBody.addEventListener('click', (e) => {
    const w = getActiveMemoWidget();
    if (!w) return;

    if (fullscreenViewMode === 'home') {
      if (e.target.closest('.memo-home-sort')) {
        showToast('정렬 기능은 준비 중입니다.');
        return;
      }
      if (e.target.closest('.memo-home-category')) {
        showToast('카테고리 기능은 준비 중입니다.');
        return;
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
        showToast('검색 기능은 준비 중입니다.');
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
      if (e.target.closest('.memo-text-page-category-btn')) {
        showToast('카테고리 관리 기능은 준비 중입니다.');
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
      if (toolBtn) {
        showToast(toolBtn.dataset.toolToast || '준비 중인 기능입니다.');
        return;
      }
      return;
    }

    if (fullscreenViewMode === 'createSetup') {
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
          openTemplatePopup();
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
    if (fullscreenViewMode === 'pageEditor') {
      if (dom.memoFullscreenBody?.querySelector('.memo-page-leave-dialog')) {
        removePageEditorLeaveDialog();
        return;
      }
    }
    if (fullscreenViewMode !== 'createSetup') return;
    if (isTemplatePopupOpen) {
      closeTemplatePopup();
      return;
    }
    if (isCreateSetupMenuOpen) {
      closeCreateSetupMenu();
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
