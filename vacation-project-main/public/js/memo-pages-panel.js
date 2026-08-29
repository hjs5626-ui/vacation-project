/* Memo read-mode — page management overlay (thumbnail grid, reorder, delete) */

const LONG_PRESS_MS = 500;
const MOVE_THRESHOLD = 10;

/** @type {HTMLElement | null} */
let overlayEl = null;
/** @type {import('./memo-pages-panel.js').MemoPagesPanelHost | null} */
let host = null;

let selectionMode = false;
/** @type {Set<string>} */
let selectedPageIds = new Set();

let longPressTimer = null;
let dragActive = false;
let dragPageId = null;
/** @type {HTMLElement | null} */
let dragGhostEl = null;
/** @type {HTMLElement | null} */
let dragSourceCard = null;
let dragStartX = 0;
let dragStartY = 0;
let longPressReady = false;
let suppressNextClick = false;
/** index in memo.pages where placeholder sits */
let dropTargetIndex = -1;
/** @type {HTMLElement | null} */
let insertCaretEl = null;

function clearInsertCaret() {
  insertCaretEl?.remove();
  insertCaretEl = null;
}

/** @typedef {object} MemoPagesPanelHost
 * @property {HTMLElement} mount
 * @property {() => object | null} getMemo
 * @property {() => string | null} getCurrentPageId
 * @property {(page: object, container: HTMLElement) => void} renderPageThumbnail
 * @property {(container: HTMLElement) => Promise<void>} setupReadImages
 * @property {(pageId: string) => void} onNavigate
 * @property {(movedPageId: string, targetIndex: number) => void} onReorder
 * @property {(pageIds: string[]) => Promise<boolean>} onDelete
 * @property {() => void} onReadViewRefresh
 */

function clearLongPressTimer() {
  if (longPressTimer) {
    clearTimeout(longPressTimer);
    longPressTimer = null;
  }
}

function resetDragState() {
  clearLongPressTimer();
  clearInsertCaret();
  dragActive = false;
  dragPageId = null;
  longPressReady = false;
  dropTargetIndex = -1;
  dragGhostEl?.remove();
  dragGhostEl = null;
  dragSourceCard?.classList.remove('memo-pages-card--dragging');
  dragSourceCard = null;
  document.removeEventListener('pointermove', onDocumentPointerMove);
  document.removeEventListener('pointerup', onDocumentPointerUp);
  document.removeEventListener('pointercancel', onDocumentPointerCancel);
}

function resetSelectionState() {
  selectionMode = false;
  selectedPageIds = new Set();
  clearInsertCaret();
}

function isPanelOpen() {
  return Boolean(overlayEl?.isConnected);
}

function getPages() {
  return host?.getMemo()?.pages ?? [];
}

function getVisibleCards() {
  const grid = overlayEl?.querySelector('.memo-pages-grid');
  if (!grid) return [];
  return [...grid.querySelectorAll('.memo-pages-card:not(.memo-pages-card--dragging)')];
}

function computeDropIndex(clientX, clientY) {
  const pages = getPages();
  const cards = getVisibleCards();
  if (!cards.length) return 0;

  const firstRect = cards[0].getBoundingClientRect();
  const lastRect = cards[cards.length - 1].getBoundingClientRect();
  if (clientY < firstRect.top) return 0;
  if (clientY > lastRect.bottom) return pages.length;

  let bestCard = null;
  let bestDist = Infinity;

  for (const card of cards) {
    const rect = card.getBoundingClientRect();
    if (clientY < rect.top || clientY > rect.bottom) continue;

    const centerX = rect.left + rect.width / 2;
    const dist = Math.abs(clientX - centerX);
    if (dist < bestDist) {
      bestDist = dist;
      bestCard = card;
    }
  }

  if (!bestCard) {
    let closestRowDist = Infinity;
    for (const card of cards) {
      const rect = card.getBoundingClientRect();
      const rowCenterY = rect.top + rect.height / 2;
      const dist = Math.abs(clientY - rowCenterY);
      if (dist < closestRowDist) {
        closestRowDist = dist;
        bestCard = card;
      }
    }
  }

  if (!bestCard) return pages.length;

  const rect = bestCard.getBoundingClientRect();
  const pageId = bestCard.dataset.pageId;
  const idx = pages.findIndex((p) => p.id === pageId);
  if (idx < 0) return pages.length;

  const insertBefore = clientX < rect.left + rect.width / 2;
  return insertBefore ? idx : idx + 1;
}

function positionInsertCaret() {
  const grid = overlayEl?.querySelector('.memo-pages-grid');
  if (!grid) return;

  if (!dragActive || dropTargetIndex < 0) {
    clearInsertCaret();
    return;
  }

  const pages = getPages();
  const cards = getVisibleCards();

  if (!insertCaretEl) {
    insertCaretEl = document.createElement('div');
    insertCaretEl.className = 'memo-pages-insert-caret';
    insertCaretEl.setAttribute('aria-hidden', 'true');
    grid.appendChild(insertCaretEl);
  }

  let anchorCard;
  if (dropTargetIndex >= pages.length) {
    anchorCard = cards[cards.length - 1];
  } else {
    const targetPageId = pages[dropTargetIndex]?.id;
    anchorCard = cards.find((c) => c.dataset.pageId === targetPageId);
  }

  if (!anchorCard) {
    clearInsertCaret();
    return;
  }

  const caretHeight = Math.max(48, anchorCard.offsetHeight * 0.82);
  const top = anchorCard.offsetTop + (anchorCard.offsetHeight - caretHeight) / 2;
  const left =
    dropTargetIndex >= pages.length
      ? anchorCard.offsetLeft + anchorCard.offsetWidth + 8
      : anchorCard.offsetLeft - 8;

  insertCaretEl.style.left = `${left}px`;
  insertCaretEl.style.top = `${top}px`;
  insertCaretEl.style.height = `${caretHeight}px`;
}

function updateDropIndicator() {
  if (!dragActive || dropTargetIndex < 0) {
    clearInsertCaret();
    return;
  }
  positionInsertCaret();
}

function startDragGhost(card, clientX, clientY) {
  if (!overlayEl || !card) return;

  dragSourceCard = card;
  dragPageId = card.dataset.pageId ?? null;
  card.classList.add('memo-pages-card--dragging');

  dragGhostEl = card.cloneNode(true);
  dragGhostEl.classList.add('memo-pages-card--ghost');
  dragGhostEl.classList.remove('memo-pages-card--dragging', 'memo-pages-card--current');
  overlayEl.appendChild(dragGhostEl);

  const rect = card.getBoundingClientRect();
  dragGhostEl.style.width = `${rect.width}px`;
  dragGhostEl.style.height = `${rect.height}px`;
  positionGhost(clientX, clientY, rect.width / 2, rect.height / 2);

  dragActive = true;
  dropTargetIndex = getPages().findIndex((p) => p.id === dragPageId);
  updateDropIndicator();
}

function positionGhost(clientX, clientY, offsetX, offsetY) {
  if (!dragGhostEl) return;
  dragGhostEl.style.left = `${clientX - offsetX}px`;
  dragGhostEl.style.top = `${clientY - offsetY}px`;
}

function onDocumentPointerMove(e) {
  if (!host || selectionMode) return;

  const dx = e.clientX - dragStartX;
  const dy = e.clientY - dragStartY;
  const distance = Math.sqrt(dx * dx + dy * dy);

  if (!dragActive && !longPressReady) {
    if (distance > MOVE_THRESHOLD) {
      clearLongPressTimer();
    }
    return;
  }

  if (!dragActive && longPressReady) {
    e.preventDefault();
    if (dragSourceCard) startDragGhost(dragSourceCard, e.clientX, e.clientY);
    return;
  }

  if (dragActive) {
    e.preventDefault();
    const rect = dragGhostEl?.getBoundingClientRect();
    positionGhost(e.clientX, e.clientY, rect ? rect.width / 2 : 60, rect ? rect.height / 2 : 80);
    dropTargetIndex = computeDropIndex(e.clientX, e.clientY);
    updateDropIndicator();
  }
}

function finishDrag(commit) {
  const movedId = dragPageId;
  const target = dropTargetIndex;
  const panelHost = host;

  resetDragState();

  if (commit && panelHost && movedId != null && target >= 0) {
    panelHost.onReorder(movedId, target);
    panelHost.onReadViewRefresh();
  }

  renderGrid();
  if (panelHost && overlayEl) {
    panelHost.setupReadImages(overlayEl.querySelector('.memo-pages-grid')).catch(() => {});
  }
}

function onDocumentPointerUp(e) {
  clearLongPressTimer();

  if (dragActive) {
    suppressNextClick = true;
    finishDrag(true);
    return;
  }

  if (longPressReady) {
    longPressReady = false;
    dragSourceCard?.classList.remove('memo-pages-card--press-ready');
    dragSourceCard = null;
  }

  document.removeEventListener('pointermove', onDocumentPointerMove);
  document.removeEventListener('pointerup', onDocumentPointerUp);
  document.removeEventListener('pointercancel', onDocumentPointerCancel);
}

function onDocumentPointerCancel() {
  suppressNextClick = true;
  if (dragActive) {
    finishDrag(false);
    return;
  }
  clearLongPressTimer();
  longPressReady = false;
  dragSourceCard?.classList.remove('memo-pages-card--press-ready');
  dragSourceCard = null;
  document.removeEventListener('pointermove', onDocumentPointerMove);
  document.removeEventListener('pointerup', onDocumentPointerUp);
  document.removeEventListener('pointercancel', onDocumentPointerCancel);
}

function onCardPointerDown(e) {
  if (!host || selectionMode || e.button !== 0) return;
  if (e.target.closest('.memo-pages-card-check')) return;

  const card = e.target.closest('.memo-pages-card');
  if (!card) return;

  resetDragState();
  dragStartX = e.clientX;
  dragStartY = e.clientY;
  dragSourceCard = card;
  longPressReady = false;

  clearLongPressTimer();
  longPressTimer = setTimeout(() => {
    longPressReady = true;
    card.classList.add('memo-pages-card--press-ready');
  }, LONG_PRESS_MS);

  document.addEventListener('pointermove', onDocumentPointerMove);
  document.addEventListener('pointerup', onDocumentPointerUp);
  document.addEventListener('pointercancel', onDocumentPointerCancel);
}

function onCardClick(e) {
  if (!host) return;
  if (suppressNextClick) {
    suppressNextClick = false;
    e.preventDefault();
    e.stopPropagation();
    return;
  }

  const card = e.target.closest('.memo-pages-card');
  if (!card?.dataset.pageId) return;

  const pageId = card.dataset.pageId;

  if (selectionMode) {
    e.preventDefault();
    e.stopPropagation();
    if (selectedPageIds.has(pageId)) {
      selectedPageIds.delete(pageId);
    } else {
      selectedPageIds.add(pageId);
    }
    syncChrome();
    renderGrid();
    host.setupReadImages(overlayEl.querySelector('.memo-pages-grid')).catch(() => {});
    return;
  }

  host.onNavigate(pageId);
}

function syncChrome() {
  if (!overlayEl) return;

  const selectBtn = overlayEl.querySelector('.memo-pages-select-toggle');
  const deleteBtn = overlayEl.querySelector('.memo-pages-delete');
  const count = selectedPageIds.size;

  if (selectBtn) {
    selectBtn.textContent = selectionMode ? '완료' : '선택';
    selectBtn.setAttribute('aria-pressed', selectionMode ? 'true' : 'false');
  }

  if (deleteBtn) {
    if (!selectionMode) {
      deleteBtn.hidden = true;
    } else {
      deleteBtn.hidden = false;
      deleteBtn.disabled = count === 0;
      deleteBtn.textContent = count === 0 ? '삭제' : `${count}개 삭제`;
    }
  }

  overlayEl.classList.toggle('memo-pages-overlay--selection', selectionMode);
}

function buildCard(page, index, currentPageId) {
  const card = document.createElement('article');
  card.className = 'memo-pages-card';
  card.dataset.pageId = page.id;
  card.setAttribute('role', 'button');
  card.tabIndex = 0;

  if (page.id === currentPageId) {
    card.classList.add('memo-pages-card--current');
  }
  if (selectionMode && selectedPageIds.has(page.id)) {
    card.classList.add('memo-pages-card--selected');
  }

  const num = document.createElement('span');
  num.className = 'memo-pages-card-num';
  num.textContent = String(index + 1);

  const check = document.createElement('span');
  check.className = 'memo-pages-card-check';
  check.setAttribute('aria-hidden', selectionMode ? 'false' : 'true');
  check.innerHTML = selectionMode
    ? `<span class="memo-pages-card-check-box${selectedPageIds.has(page.id) ? ' is-checked' : ''}"></span>`
    : '';

  const preview = document.createElement('div');
  preview.className = 'memo-pages-card-preview';
  host.renderPageThumbnail(page, preview);

  card.append(num, check, preview);

  if (!selectionMode) {
    card.addEventListener('pointerdown', onCardPointerDown);
  }

  card.addEventListener('click', onCardClick);

  return card;
}

function renderGrid() {
  if (!overlayEl || !host) return;

  const grid = overlayEl.querySelector('.memo-pages-grid');
  if (!grid) return;

  resetDragState();
  grid.replaceChildren();

  const memo = host.getMemo();
  const pages = memo?.pages ?? [];
  const currentPageId = host.getCurrentPageId();

  if (!pages.length) {
    const empty = document.createElement('p');
    empty.className = 'memo-pages-empty';
    empty.textContent = '페이지가 없습니다';
    grid.appendChild(empty);
    return;
  }

  pages.forEach((page, index) => {
    grid.appendChild(buildCard(page, index, currentPageId));
  });
}

function buildOverlay() {
  const overlay = document.createElement('div');
  overlay.className = 'memo-pages-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', '페이지 관리');

  const backdrop = document.createElement('button');
  backdrop.type = 'button';
  backdrop.className = 'memo-pages-backdrop';
  backdrop.setAttribute('aria-label', '닫기');

  const panel = document.createElement('div');
  panel.className = 'memo-pages-panel glass-panel';

  const header = document.createElement('header');
  header.className = 'memo-pages-header';

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'memo-pages-close';
  closeBtn.textContent = '닫기';

  const title = document.createElement('h2');
  title.className = 'memo-pages-title';
  title.textContent = '페이지';

  const selectBtn = document.createElement('button');
  selectBtn.type = 'button';
  selectBtn.className = 'memo-pages-select-toggle';
  selectBtn.textContent = '선택';

  header.append(closeBtn, title, selectBtn);

  const grid = document.createElement('div');
  grid.className = 'memo-pages-grid';

  const footer = document.createElement('footer');
  footer.className = 'memo-pages-footer';

  const deleteBtn = document.createElement('button');
  deleteBtn.type = 'button';
  deleteBtn.className = 'memo-pages-delete btn-secondary';
  deleteBtn.textContent = '삭제';
  deleteBtn.hidden = true;
  deleteBtn.disabled = true;

  footer.appendChild(deleteBtn);
  panel.append(header, grid, footer);
  overlay.append(backdrop, panel);

  backdrop.addEventListener('click', () => closeMemoPagesPanel());
  closeBtn.addEventListener('click', () => closeMemoPagesPanel());

  selectBtn.addEventListener('click', () => {
    resetDragState();
    if (selectionMode) {
      resetSelectionState();
    } else {
      selectionMode = true;
    }
    syncChrome();
    renderGrid();
    host?.setupReadImages(overlay.querySelector('.memo-pages-grid')).catch(() => {});
  });

  deleteBtn.addEventListener('click', async () => {
    if (!host || selectedPageIds.size === 0) return;
    const ids = [...selectedPageIds];
    const ok = await host.onDelete(ids);
    if (!ok) return;
    resetSelectionState();
    syncChrome();
    host.onReadViewRefresh();
    renderGrid();
    host.setupReadImages(overlay.querySelector('.memo-pages-grid')).catch(() => {});
  });

  return overlay;
}

function onOverlayKeydown(e) {
  if (e.key !== 'Escape' || !isPanelOpen()) return;
  e.preventDefault();
  e.stopPropagation();
  closeMemoPagesPanel();
}

/**
 * @param {MemoPagesPanelHost} panelHost
 */
export function openMemoPagesPanel(panelHost) {
  if (!panelHost?.mount) return;

  closeMemoPagesPanel();
  host = panelHost;
  resetSelectionState();

  overlayEl = buildOverlay();
  panelHost.mount.appendChild(overlayEl);

  syncChrome();
  renderGrid();
  panelHost.setupReadImages(overlayEl.querySelector('.memo-pages-grid')).catch(() => {});

  document.addEventListener('keydown', onOverlayKeydown, true);
  requestAnimationFrame(() => overlayEl?.classList.add('memo-pages-overlay--open'));
}

export function closeMemoPagesPanel() {
  resetDragState();
  resetSelectionState();
  document.removeEventListener('keydown', onOverlayKeydown, true);

  if (overlayEl) {
    overlayEl.classList.remove('memo-pages-overlay--open');
    overlayEl.remove();
  }
  overlayEl = null;
  host = null;
}

export function isMemoPagesPanelOpen() {
  return isPanelOpen();
}

/**
 * @param {object} memo
 * @param {string} movedPageId
 * @param {number} targetIndex
 * @returns {boolean}
 */
export function reorderMemoPages(memo, movedPageId, targetIndex) {
  if (!memo || !movedPageId) return false;
  const pages = [...(memo.pages ?? [])];
  const fromIndex = pages.findIndex((p) => p.id === movedPageId);
  if (fromIndex < 0) return false;

  const [moved] = pages.splice(fromIndex, 1);
  const insertAt = Math.max(0, Math.min(targetIndex, pages.length));
  pages.splice(insertAt, 0, moved);
  memo.pages = pages;
  return true;
}

/**
 * @param {object[]} beforePages
 * @param {object[]} afterPages
 * @param {string | null} previousCurrentId
 * @param {Set<string>} deletedIds
 * @returns {string | null}
 */
export function resolveCurrentPageIdAfterDelete(beforePages, afterPages, previousCurrentId, deletedIds) {
  if (!deletedIds.has(previousCurrentId)) {
    if (afterPages.some((p) => p.id === previousCurrentId)) return previousCurrentId;
    return afterPages[0]?.id ?? null;
  }

  if (!afterPages.length) return null;

  const oldIdx = beforePages.findIndex((p) => p.id === previousCurrentId);
  if (oldIdx < 0) return afterPages[0]?.id ?? null;
  if (oldIdx < afterPages.length) return afterPages[oldIdx].id;
  return afterPages[afterPages.length - 1].id;
}
