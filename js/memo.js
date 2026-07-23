/* ═══════════════════════════════════════════════════════════
   MEMENTO DIARY — Memo Widget Logic
   ═══════════════════════════════════════════════════════════ */

import { state } from './state.js';
import { dom } from './dom.js';
import { showToast } from './utils.js';


const editorDrafts = new Map();
const profileDrafts = new Map();

const DEFAULT_PROFILE = {
  coverImage: '',
  headerText: '오늘도 좋은 하루 되세요',
  profileImage: '',
  displayName: 'Guest',
};

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

/** Session-only — not persisted */
let activeMemoWidgetId = null;
let fullscreenViewMode = 'home';
let selectedMemoId = null;
let fabExpanded = false;
let isCreateSetupMenuOpen = false;


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
  });
}


export function initMemoSessionState(w) {
  editorDrafts.delete(w.id);
  profileDrafts.delete(w.id);
}


function resetFullscreenSession() {
  activeMemoWidgetId = null;
  fullscreenViewMode = 'home';
  selectedMemoId = null;
  fabExpanded = false;
  isCreateSetupMenuOpen = false;
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
  const t = (text || '').replace(/\s+/g, ' ').trim();
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
  const { profile } = w;

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

  if (fullscreenViewMode === 'editor') {
    renderMemoEditor(dom.memoFullscreenBody, w);
  } else if (fullscreenViewMode === 'profileEditor') {
    renderProfileEditor(dom.memoFullscreenBody, w);
  } else if (fullscreenViewMode === 'createSetup') {
    renderMemoCreateSetup(dom.memoFullscreenBody, w);
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
        'memo-fullscreen-body--create-setup'
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
  renderMemoFullscreen();
}


function goBackFromCreateSetup() {
  isCreateSetupMenuOpen = false;
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

  ensureMemoWidgetData(w);
  return {
    coverImage: w.profile.coverImage ?? '',
    headerText: w.profile.headerText ?? '',
    displayName: w.profile.displayName ?? DEFAULT_PROFILE.displayName,
    profileImage: w.profile.profileImage ?? '',
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
  profileDrafts.set(w.id, {
    coverImage: w.profile.coverImage ?? '',
    headerText: w.profile.headerText ?? '',
    displayName: w.profile.displayName ?? DEFAULT_PROFILE.displayName,
    profileImage: w.profile.profileImage ?? '',
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

  const binder = document.createElement('div');
  binder.className = 'memo-create-setup-binder glass-panel';

  const leftPage = document.createElement('div');
  leftPage.className = 'memo-create-setup-page memo-create-setup-page--left';

  const spine = document.createElement('div');
  spine.className = 'memo-create-setup-spine';
  spine.setAttribute('aria-hidden', 'true');

  for (let i = 0; i < 3; i += 1) {
    const ring = document.createElement('span');
    ring.className = 'memo-create-setup-ring';
    spine.appendChild(ring);
  }

  const rightPage = document.createElement('div');
  rightPage.className = 'memo-create-setup-page memo-create-setup-page--right';

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
  rightPage.appendChild(menuAnchor);
  binder.append(leftPage, spine, rightPage);
  setup.append(backBtn, binder);
  container.appendChild(setup);
  syncCreateSetupMenuUi();
}


function saveProfileFromDraft(w) {
  syncProfileDraftFromForm(dom.memoFullscreenBody, w);
  const draft = profileDrafts.get(w.id) || getProfileDraft(w);

  ensureMemoWidgetData(w);
  w.profile.coverImage = draft.coverImage ?? '';
  w.profile.headerText = draft.headerText ?? '';
  w.profile.displayName = normalizeDisplayName(draft.displayName);
  w.profile.profileImage = draft.profileImage ?? '';

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


function deleteMemo(w) {
  if (!selectedMemoId) return;
  if (!confirm('이 메모를 삭제하시겠습니까?')) return;

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
      if (card) {
        openMemoEditor(card.dataset.memoId);
        return;
      }

      return;
    }

    if (fullscreenViewMode === 'createSetup') {
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
          // 향후: 속지 선택 UI 오픈 → 완료 시 startMemoFromTemplateSelection(templateInfo)
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
    if (fullscreenViewMode !== 'createSetup' || !isCreateSetupMenuOpen) return;
    closeCreateSetupMenu();
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
