/* Memo page editor — photo pick, insert, overflow */

import {
  collectMemoImageIdsFromHtml,
  createMemoImageRecordFromFile,
  deleteMemoImageBlob,
  hydrateMemoImagesInContainer,
  isMemoMediaQuotaError,
  loadMemoImageIntoElement,
  revokeMemoImageObjectUrls,
  stripMemoImageSrcForSerialize,
} from './memo-media.js';
import {
  appendContinuationSheetAfterActive,
  ensureEditorSessionFromDraft,
  getLegacyQueueSheets,
  resetEditorSession,
} from './memo-editor-session.js';

export const MEMO_PHOTO_BLOCK_CLASS = 'memo-editor-photo-block';
export const MEMO_PHOTO_SELECTED_CLASS = 'memo-editor-photo-block--selected';
/** 속지 본문 가용 너비 대비 사진 블록 폭 (일정 크기 정책, CSS --memo-photo-block-width 와 동기) */
export const MEMO_PHOTO_BLOCK_WIDTH_RATIO = 0.3;

const PHOTO_BLOCK_MARGIN_Y = 16;

let isMemoPhotoPickerOpen = false;
let isMemoPhotoProcessing = false;
let savedEditorSelection = null;
let pendingPhotoRecords = [];
let pendingPhotoInsertIndex = 0;
let photoOverflowModalOpen = false;
let isMemoPhotoOverflowPromptOpen = false;

import {
  getOrCreateMeasureEditor,
  getSheetContentMaxHeight,
  getIsCreatingOverflowSheet,
  setIsCreatingOverflowSheet,
  showPhotoSheetOverflowDialog,
  removeSheetOverflowDialogs,
  applyPhotoMeasureHints,
} from './memo-sheet-overflow.js';

/** image ids saved in current batch but not yet in any editor HTML */
const pendingUnreferencedImageIds = new Set();

export function getMemoPhotoProcessingState() {
  return { isMemoPhotoPickerOpen, isMemoPhotoProcessing, photoOverflowModalOpen };
}

export function getPageEditorSheetQueue(widgetId) {
  return getLegacyQueueSheets(widgetId);
}

export function clearPageEditorSheetQueue(widgetId) {
  resetEditorSession(widgetId);
}

export function saveEditorSelection(contentEditor) {
  const sel = document.getSelection();
  if (!sel || sel.rangeCount === 0 || !contentEditor) {
    savedEditorSelection = null;
    return;
  }

  const range = sel.getRangeAt(0);
  if (!contentEditor.contains(range.commonAncestorContainer)) {
    savedEditorSelection = null;
    return;
  }

  savedEditorSelection = range.cloneRange();
}

export function restoreEditorSelection(contentEditor) {
  if (!contentEditor) return;
  contentEditor.focus();

  const sel = document.getSelection();
  if (!sel) return;

  if (savedEditorSelection && contentEditor.contains(savedEditorSelection.commonAncestorContainer)) {
    sel.removeAllRanges();
    sel.addRange(savedEditorSelection);
    return;
  }

  const range = document.createRange();
  range.selectNodeContents(contentEditor);
  range.collapse(false);
  sel.removeAllRanges();
  sel.addRange(range);
}

function getNodePath(node, root) {
  const path = [];
  let current = node;
  while (current && current !== root) {
    const parent = current.parentNode;
    if (!parent) break;
    path.unshift([...parent.childNodes].indexOf(current));
    current = parent;
  }
  return path;
}

function getNodeByPath(root, path) {
  let node = root;
  for (const index of path) {
    if (index < 0 || !node.childNodes[index]) return null;
    node = node.childNodes[index];
  }
  return node;
}

function getAvailableEditorWidth(contentEditor) {
  const width = contentEditor?.clientWidth ?? 0;
  if (width > 0) return width;
  const wrap = contentEditor?.closest('.memo-text-page-content-wrap');
  return wrap?.clientWidth ?? 1;
}

function populateMeasureFromEditor(measure, contentEditor) {
  measure.replaceChildren();
  measure.innerHTML = contentEditor.innerHTML;
  measure.querySelectorAll('.memo-photo-delete-toolbar, .memo-photo-selection-actions').forEach((el) => el.remove());
  measure.querySelectorAll(`.${MEMO_PHOTO_SELECTED_CLASS}`).forEach((el) => {
    el.classList.remove(MEMO_PHOTO_SELECTED_CLASS);
  });
  applyPhotoMeasureHints(measure, contentEditor);
}

function nextAnimationFrame() {
  return new Promise((resolve) => {
    requestAnimationFrame(resolve);
  });
}

async function waitForEditorLayoutReady(contentEditor, { maxAttempts = 12 } = {}) {
  if (!contentEditor) return false;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    await nextAnimationFrame();
    if (attempt % 2 === 1) {
      await nextAnimationFrame();
    }

    const maxH = getSheetContentMaxHeight(contentEditor);
    const width = getAvailableEditorWidth(contentEditor);
    if (maxH > 16 && width > 16) {
      return true;
    }
  }

  console.warn('[Memo] editor layout not ready for photo processing');
  return false;
}

async function waitAfterPhotoDomInsert(contentEditor, block) {
  await nextAnimationFrame();
  await nextAnimationFrame();

  const img = block?.querySelector('img');
  if (img?.src) {
    if (!img.complete || img.naturalHeight <= 0) {
      await new Promise((resolve) => {
        const finish = () => resolve();
        img.addEventListener('load', finish, { once: true });
        img.addEventListener('error', finish, { once: true });
        window.setTimeout(finish, 150);
      });
    }
  }

  void contentEditor?.offsetHeight;
  void block?.getBoundingClientRect?.()?.height;
}

function isEditorEmptyForPhotoInsert(contentEditor) {
  if (!contentEditor) return true;
  if (contentEditor.querySelector?.('[data-memo-image-id]')) return false;

  const text = (contentEditor.textContent ?? '').replace(/\u00a0/g, ' ').trim();
  if (text) return false;

  const html = contentEditor.innerHTML ?? '';
  if (!html.trim()) return true;

  const probe = document.createElement('div');
  probe.innerHTML = html;
  if (probe.querySelector('[data-memo-image-id]')) return false;
  return !(probe.textContent ?? '').replace(/\u00a0/g, ' ').trim();
}

function insertBlockInMeasureAtSelection(measure, block, contentEditor) {
  const blockClone = block.cloneNode(true);
  const spacer = document.createElement('div');
  spacer.appendChild(document.createElement('br'));

  if (!savedEditorSelection || !contentEditor.contains(savedEditorSelection.commonAncestorContainer)) {
    measure.appendChild(blockClone);
    measure.appendChild(spacer);
    return;
  }

  const path = getNodePath(savedEditorSelection.startContainer, contentEditor);
  const targetNode = getNodeByPath(measure, path);
  if (!targetNode) {
    measure.appendChild(blockClone);
    measure.appendChild(spacer);
    return;
  }

  const offset = savedEditorSelection.startOffset;
  if (targetNode.nodeType === Node.TEXT_NODE) {
    const range = document.createRange();
    range.setStart(targetNode, Math.min(offset, targetNode.length));
    range.collapse(true);
    range.insertNode(blockClone);
    blockClone.after(spacer);
    return;
  }

  const ref = targetNode.childNodes[Math.min(offset, targetNode.childNodes.length)] ?? null;
  if (ref) {
    targetNode.insertBefore(blockClone, ref);
  } else {
    targetNode.appendChild(blockClone);
  }
  blockClone.after(spacer);
}

function applyPhotoBlockMeasureLayout(block, record, contentEditor) {
  const img = block.querySelector('img');
  if (!img || !record?.width || !record?.height) return;

  const editorWidth = getAvailableEditorWidth(contentEditor);
  const blockWidth = editorWidth * MEMO_PHOTO_BLOCK_WIDTH_RATIO;
  block.style.width = `${blockWidth}px`;
  block.style.maxWidth = '100%';
  img.style.display = 'block';
  img.style.width = '100%';
  img.style.height = 'auto';
  img.style.aspectRatio = `${record.width} / ${record.height}`;
}

function doesPhotoBlockFitAtSelection(contentEditor, record) {
  const measure = getOrCreateMeasureEditor(contentEditor);
  populateMeasureFromEditor(measure, contentEditor);
  const block = createPhotoBlockElement(record);
  applyPhotoBlockMeasureLayout(block, record, contentEditor);
  insertBlockInMeasureAtSelection(measure, block, contentEditor);
  return measure.scrollHeight <= measure.clientHeight + 2;
}

function computePhotoInsertDecision(contentEditor, record) {
  const maxHeight = getSheetContentMaxHeight(contentEditor);
  if (maxHeight <= 16) {
    return { action: 'wait', reason: 'editor-not-ready' };
  }

  if (isEditorEmptyForPhotoInsert(contentEditor)) {
    return { action: 'insert', reason: 'empty-sheet-first-photo' };
  }

  if (doesPhotoBlockFitAtSelection(contentEditor, record)) {
    return { action: 'insert' };
  }
  return { action: 'nextSheet' };
}

function finishPhotoProcessing(root, confirmBtn) {
  isMemoPhotoProcessing = false;
  removePhotoProcessingOverlay(root);
  syncMemoPhotoToolbarState(root);
  if (confirmBtn) confirmBtn.disabled = false;
}

async function cancelRemainingPendingPhotos() {
  const remaining = pendingPhotoRecords.slice(pendingPhotoInsertIndex);
  await Promise.all(
    remaining.map(async (record) => {
      if (!pendingUnreferencedImageIds.has(record.id)) return;
      pendingUnreferencedImageIds.delete(record.id);
      try {
        await deleteMemoImageBlob(record.id);
      } catch (error) {
        console.warn('[Memo] failed to delete cancelled pending image:', record.id, error);
      }
    })
  );
  pendingPhotoInsertIndex = pendingPhotoRecords.length;
}

function ensurePhotoBlockStructure(block) {
  if (!block) return;
  if (block.querySelector('.memo-editor-photo-block-media')) return;

  const img = block.querySelector('img[data-memo-image-id]') ?? block.querySelector('img');
  if (!img || !block.contains(img)) return;

  const imgParent = img.parentElement;
  if (!imgParent) return;

  const isPhotoToolbar = (el) =>
    el?.classList?.contains('memo-photo-selection-actions')
    || el?.classList?.contains('memo-photo-delete-toolbar');

  // After save/sanitize: wrapper div remains but lost memo-editor-photo-block-media class.
  if (
    imgParent.parentElement === block
    && imgParent.tagName === 'DIV'
    && !isPhotoToolbar(imgParent)
  ) {
    imgParent.classList.add('memo-editor-photo-block-media');
    return;
  }

  // Legacy/plain blocks: img is a direct child of the photo block.
  if (imgParent === block) {
    const media = document.createElement('div');
    media.className = 'memo-editor-photo-block-media';
    block.insertBefore(media, img);
    media.appendChild(img);
    return;
  }

  // Deeper nesting (e.g. p > img): wrap within the img's immediate parent only.
  if (img.parentElement === imgParent) {
    const media = document.createElement('div');
    media.className = 'memo-editor-photo-block-media';
    imgParent.insertBefore(media, img);
    media.appendChild(img);
  }
}

function createPhotoBlockElement(record) {
  const block = document.createElement('div');
  block.className = MEMO_PHOTO_BLOCK_CLASS;
  block.contentEditable = 'false';
  block.dataset.memoImageId = record.id;

  const media = document.createElement('div');
  media.className = 'memo-editor-photo-block-media';

  const img = document.createElement('img');
  img.dataset.memoImageId = record.id;
  img.dataset.memoImageWidth = String(record.width);
  img.dataset.memoImageHeight = String(record.height);
  img.alt = '';
  img.draggable = false;

  media.appendChild(img);
  block.appendChild(media);
  return block;
}

function insertNodeAtSelection(contentEditor, node) {
  restoreEditorSelection(contentEditor);
  const sel = document.getSelection();
  if (!sel || sel.rangeCount === 0) {
    contentEditor.appendChild(node);
    return;
  }

  const range = sel.getRangeAt(0);
  range.collapse(false);
  range.insertNode(node);

  const spacer = document.createElement('div');
  spacer.appendChild(document.createElement('br'));
  node.after(spacer);

  const newRange = document.createRange();
  newRange.setStart(spacer, 0);
  newRange.collapse(true);
  sel.removeAllRanges();
  sel.addRange(newRange);
}

export function preparePhotoContinuationInsert(contentEditor) {
  savedEditorSelection = null;
  if (!contentEditor) return;
  contentEditor.focus();
  const sel = document.getSelection();
  if (!sel) return;
  const range = document.createRange();
  range.selectNodeContents(contentEditor);
  range.collapse(true);
  sel.removeAllRanges();
  sel.addRange(range);
}

async function attachBlobToPhotoBlock(block, record) {
  const img = block.querySelector('img');
  if (!img) return;
  const url = URL.createObjectURL(record.blob);
  img.src = url;
  img.dataset.memoObjectUrl = url;
}

function markImageReferenced(imageId) {
  pendingUnreferencedImageIds.delete(imageId);
}

function trackUnreferencedImage(imageId) {
  pendingUnreferencedImageIds.add(imageId);
}

async function cleanupUnreferencedPendingImages() {
  const ids = [...pendingUnreferencedImageIds];
  pendingUnreferencedImageIds.clear();
  await Promise.all(
    ids.map(async (id) => {
      try {
        await deleteMemoImageBlob(id);
      } catch (error) {
        console.warn('[Memo] failed to delete unreferenced image:', id, error);
      }
    })
  );
}

function removePhotoProcessingOverlay(root) {
  root?.querySelector('.memo-photo-processing-overlay')?.remove();
}

function showPhotoProcessingOverlay(root, message = '사진을 처리하고 있습니다...') {
  if (!root || root.querySelector('.memo-photo-processing-overlay')) return;

  const overlay = document.createElement('div');
  overlay.className = 'memo-photo-processing-overlay';
  overlay.setAttribute('aria-live', 'polite');
  const text = document.createElement('p');
  text.className = 'memo-photo-processing-message';
  text.textContent = message;
  overlay.appendChild(text);
  root.appendChild(overlay);
}

function removePhotoConfirmDialog(root) {
  root?.querySelector('.memo-photo-add-dialog')?.remove();
}

function showPhotoConfirmDialog(root, count, onConfirm, onCancel) {
  if (root?.querySelector('.memo-photo-add-dialog')) return;

  const overlay = document.createElement('div');
  overlay.className = 'memo-photo-add-dialog';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');

  const panel = document.createElement('div');
  panel.className = 'memo-photo-add-dialog-panel glass-panel';

  const message = document.createElement('p');
  message.className = 'memo-photo-add-dialog-message';
  message.textContent = count > 1 ? `사진 ${count}장을 추가할까요?` : '사진 1장을 추가할까요?';

  const actions = document.createElement('div');
  actions.className = 'memo-photo-add-dialog-actions';

  const cancelBtn = document.createElement('button');
  cancelBtn.type = 'button';
  cancelBtn.className = 'btn-secondary memo-photo-add-cancel';
  cancelBtn.textContent = '취소';

  const confirmBtn = document.createElement('button');
  confirmBtn.type = 'button';
  confirmBtn.className = 'btn-primary memo-photo-add-confirm';
  confirmBtn.textContent = '추가';

  actions.append(cancelBtn, confirmBtn);
  panel.append(message, actions);
  overlay.appendChild(panel);
  root.appendChild(overlay);

  cancelBtn.addEventListener('click', () => {
    removePhotoConfirmDialog(root);
    onCancel?.();
  });

  confirmBtn.addEventListener('click', () => {
    if (isMemoPhotoProcessing) return;
    confirmBtn.disabled = true;
    onConfirm?.(confirmBtn);
  });
}

function removePhotoOverflowDialog(root) {
  photoOverflowModalOpen = false;
  isMemoPhotoOverflowPromptOpen = false;
  removeSheetOverflowDialogs(root);
}

async function insertPendingPhotosSequential(
  contentEditor,
  root,
  { syncDraft, onContinuationNeeded, onBaselineRefresh }
) {
  while (pendingPhotoInsertIndex < pendingPhotoRecords.length) {
    contentEditor = root.querySelector('.memo-text-page-content');
    if (!contentEditor) {
      console.warn('[Memo] photo insert aborted: content editor missing');
      return;
    }

    if (!(await waitForEditorLayoutReady(contentEditor))) {
      console.warn('[Memo] photo insert aborted: editor layout not ready');
      return;
    }

    const record = pendingPhotoRecords[pendingPhotoInsertIndex];
    let decision = computePhotoInsertDecision(contentEditor, record);

    if (decision.action === 'wait') {
      if (!(await waitForEditorLayoutReady(contentEditor, { maxAttempts: 20 }))) {
        console.warn('[Memo] photo insert aborted: editor never became ready');
        return;
      }
      decision = computePhotoInsertDecision(contentEditor, record);
      if (decision.action === 'wait') {
        console.warn('[Memo] photo insert aborted: editor height still unavailable');
        return;
      }
    }

    if (decision.action === 'nextSheet') {
      removePhotoProcessingOverlay(root);
      isMemoPhotoOverflowPromptOpen = true;
      photoOverflowModalOpen = true;

      const remaining = pendingPhotoRecords.length - pendingPhotoInsertIndex;
      const shouldContinue = await showPhotoSheetOverflowDialog(
        root,
        remaining,
        async () => {
          if (getIsCreatingOverflowSheet()) return;
          setIsCreatingOverflowSheet(true);
          try {
            await onContinuationNeeded?.();
          } finally {
            setIsCreatingOverflowSheet(false);
          }
        },
        async () => {
          await cancelRemainingPendingPhotos();
        }
      );

      removePhotoOverflowDialog(root);

      if (!shouldContinue) {
        onBaselineRefresh?.();
        return;
      }

      contentEditor = root.querySelector('.memo-text-page-content');
      if (!contentEditor) return;

      preparePhotoContinuationInsert(contentEditor);

      if (!(await waitForEditorLayoutReady(contentEditor, { maxAttempts: 20 }))) {
        console.warn('[Memo] photo insert aborted after continuation: editor not ready');
        return;
      }

      // overflow 사진 index 유지 — 같은 사진부터 재검사
      continue;
    }

    const block = createPhotoBlockElement(record);
    await attachBlobToPhotoBlock(block, record);
    insertNodeAtSelection(contentEditor, block);
    await waitAfterPhotoDomInsert(contentEditor, block);
    markImageReferenced(record.id);
    pendingPhotoInsertIndex += 1;
    syncDraft?.();
    onBaselineRefresh?.();
  }

  pendingPhotoRecords = [];
  pendingPhotoInsertIndex = 0;
  pendingUnreferencedImageIds.clear();
  onBaselineRefresh?.();
}

export function buildMemoPhotoFileInput() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.multiple = true;
  input.className = 'memo-photo-file-input hidden';
  input.tabIndex = -1;
  input.setAttribute('aria-hidden', 'true');
  return input;
}

export function syncMemoPhotoToolbarState(root) {
  if (!root) return;
  const disabled = isMemoPhotoProcessing || isMemoPhotoPickerOpen;
  root.querySelectorAll('.memo-text-page-tool[data-tool-id="photo"]').forEach((btn) => {
    btn.disabled = disabled;
  });
  const saveBtn = root.querySelector('.memo-text-page-save');
  if (saveBtn) saveBtn.disabled = isMemoPhotoProcessing;
}

function resetMemoPhotoPickerState(root) {
  isMemoPhotoPickerOpen = false;
  syncMemoPhotoToolbarState(root);
}

export function openMemoPhotoPicker(contentEditor, fileInput, root) {
  if (isMemoPhotoProcessing || isMemoPhotoPickerOpen) return;
  saveEditorSelection(contentEditor);
  isMemoPhotoPickerOpen = true;
  syncMemoPhotoToolbarState(root);
  fileInput.value = '';

  const onPickerClose = () => {
    window.removeEventListener('focus', onPickerClose);
    fileInput.removeEventListener('cancel', onPickerClose);
    resetMemoPhotoPickerState(root);
  };

  fileInput.addEventListener('cancel', onPickerClose, { once: true });
  window.addEventListener(
    'focus',
    () => {
      window.setTimeout(() => {
        if (isMemoPhotoPickerOpen && !fileInput.files?.length) {
          onPickerClose();
        }
      }, 400);
    },
    { once: true }
  );

  fileInput.click();
}

export async function handleMemoPhotoFileInputChange(
  fileInput,
  contentEditor,
  root,
  { showToast, syncDraft, onContinuationNeeded, onComplete }
) {
  resetMemoPhotoPickerState(root);

  const files = [...(fileInput.files ?? [])];
  fileInput.value = '';

  if (!files.length) return;

  const validFiles = [];
  let rejected = 0;
  files.forEach((file) => {
    if (!file.type.startsWith('image/')) {
      rejected += 1;
      return;
    }
    if (file.type === 'image/gif') {
      rejected += 1;
      return;
    }
    validFiles.push(file);
  });

  if (!validFiles.length) {
    if (rejected) showToast?.('지원하지 않는 이미지 형식입니다.');
    return;
  }

  showPhotoConfirmDialog(
    root,
    validFiles.length,
    async (confirmBtn) => {
      isMemoPhotoProcessing = true;
      syncMemoPhotoToolbarState(root);
      showPhotoProcessingOverlay(root);

      pendingPhotoRecords = [];
      pendingPhotoInsertIndex = 0;
      pendingUnreferencedImageIds.clear();

      try {
        let failCount = 0;
        for (const file of validFiles) {
          try {
            const record = await createMemoImageRecordFromFile(file);
            pendingPhotoRecords.push(record);
            trackUnreferencedImage(record.id);
          } catch (error) {
            failCount += 1;
            console.warn('[Memo] image processing failed:', file.name, error);
            if (isMemoMediaQuotaError(error)) {
              showToast?.('사진을 저장할 공간이 부족합니다.');
              break;
            }
          }
        }

        removePhotoConfirmDialog(root);

        if (!pendingPhotoRecords.length) {
          showToast?.(failCount ? '사진 일부를 불러오지 못했습니다.' : '선택한 사진을 처리할 수 없습니다.');
          onComplete?.();
          return;
        }

        if (failCount > 0) {
          showToast?.('사진 일부를 불러오지 못했습니다.');
        }

        finishPhotoProcessing(root, confirmBtn);

        await insertPendingPhotosSequential(contentEditor, root, {
          showToast,
          syncDraft,
          onContinuationNeeded,
          onBaselineRefresh: () => onComplete?.(),
        });
      } catch (error) {
        console.error('[Memo] photo batch failed:', error);
        showToast?.('선택한 사진을 처리할 수 없습니다.');
        await cleanupUnreferencedPendingImages();
        pendingPhotoRecords = [];
        pendingPhotoInsertIndex = 0;
        onComplete?.();
      } finally {
        removePhotoConfirmDialog(root);
        finishPhotoProcessing(root, confirmBtn);
      }
    },
    async () => {
      await cleanupUnreferencedPendingImages();
      pendingPhotoRecords = [];
      pendingPhotoInsertIndex = 0;
    }
  );
}

export function beginPhotoContinuationSheet(w, helpers) {
  beginContinuationSheetWithContent(w, helpers, '');
}


export function beginContinuationSheetWithContent(w, helpers, initialContent = '') {
  const {
    syncPageEditorDraftFromForm,
    pageEditorDrafts,
    pageEditorBaselines,
    clonePageDraft,
    getPageEditorMemoCategoryId,
    MEMO_BASIC_TEMPLATE_ID,
  } = helpers;

  syncPageEditorDraftFromForm(w);
  const current = pageEditorDrafts.get(w.id);
  ensureEditorSessionFromDraft(w.id, current, clonePageDraft);

  const newSheet = appendContinuationSheetAfterActive(w.id, {
    initialContent: initialContent ?? '',
    templateId: MEMO_BASIC_TEMPLATE_ID,
    memoCategoryId: getPageEditorMemoCategoryId(w, current),
    insertPosition: current?.insertPosition ?? 'after-current',
    draftId: current?.draftId ?? null,
  });

  if (newSheet) {
    pageEditorDrafts.set(w.id, clonePageDraft(newSheet));
    pageEditorBaselines.set(w.id, clonePageDraft(newSheet));
  }
}

export function serializeMemoEditorHtml(contentEditor, sanitizeMemoHtml) {
  if (!contentEditor) return '';
  const clone = contentEditor.cloneNode(true);
  stripMemoImageSrcForSerialize(clone);
  clone.querySelectorAll(`.${MEMO_PHOTO_SELECTED_CLASS}`).forEach((el) => {
    el.classList.remove(MEMO_PHOTO_SELECTED_CLASS);
  });
  clone.querySelectorAll('.memo-photo-delete-toolbar, .memo-photo-selection-actions').forEach((el) => el.remove());
  return sanitizeMemoHtml(clone.innerHTML);
}

export function memoHtmlHasVisibleContent(html) {
  if (!html) return false;
  const div = document.createElement('div');
  div.innerHTML = html;
  if (div.querySelector('[data-memo-image-id]')) return true;
  return Boolean((div.textContent ?? '').replace(/\u00a0/g, ' ').trim());
}

export async function setupMemoEditorImages(contentEditor, { editable = true } = {}) {
  if (!contentEditor) return;
  revokeMemoImageObjectUrls(contentEditor);
  await hydrateMemoImagesInContainer(contentEditor, { readOnly: !editable });
}

export async function setupMemoReadModeImages(container) {
  if (!container) return;
  revokeMemoImageObjectUrls(container);
  await hydrateMemoImagesInContainer(container, { readOnly: true });
}

export function bindMemoPhotoEditorInteractions(w, shell, contentEditor, root, helpers) {
  const {
    syncPageEditorDraftFromForm,
    collectAllMemoImageHtmlSources,
    deleteMemoImageIfUnreferenced,
    coverPhoto,
  } = helpers;

  if (!contentEditor || shell.dataset.memoPhotoBound) return;
  shell.dataset.memoPhotoBound = '1';

  let selectedPhotoBlock = null;
  let deleteToolbar = null;

  const clearPhotoSelection = () => {
    selectedPhotoBlock?.classList.remove(MEMO_PHOTO_SELECTED_CLASS);
    selectedPhotoBlock = null;
    deleteToolbar?.remove();
    deleteToolbar = null;
  };

  const refreshCoverToolbar = (block) => {
    if (!deleteToolbar || !block) return;

    const imageId = block.dataset.memoImageId ?? '';
    const coverBtn = deleteToolbar.querySelector('.memo-photo-cover-btn');
    const clearBtn = deleteToolbar.querySelector('.memo-photo-cover-clear-btn');
    const isCover = Boolean(imageId && coverPhoto?.getCoverPhotoId?.() === imageId);

    if (coverBtn) coverBtn.hidden = isCover;
    if (clearBtn) clearBtn.hidden = !isCover;
  };

  const showDeleteToolbar = (block) => {
    ensurePhotoBlockStructure(block);
    deleteToolbar?.remove();
    deleteToolbar = document.createElement('div');
    deleteToolbar.className = 'memo-photo-selection-actions memo-photo-delete-toolbar';
    deleteToolbar.contentEditable = 'false';
    deleteToolbar.setAttribute('contenteditable', 'false');
    deleteToolbar.addEventListener('mousedown', (e) => e.preventDefault());

    const coverBtn = document.createElement('button');
    coverBtn.type = 'button';
    coverBtn.className = 'memo-photo-cover-btn';
    coverBtn.textContent = '대표사진 설정';

    const clearCoverBtn = document.createElement('button');
    clearCoverBtn.type = 'button';
    clearCoverBtn.className = 'memo-photo-cover-clear-btn';
    clearCoverBtn.textContent = '대표사진 해제';

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'memo-photo-delete-btn';
    btn.textContent = '사진 삭제';

    deleteToolbar.append(coverBtn, clearCoverBtn, btn);
    block.appendChild(deleteToolbar);

    if (!coverPhoto) {
      coverBtn.hidden = true;
      clearCoverBtn.hidden = true;
    }

    refreshCoverToolbar(block);

    coverBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const imageId = block.dataset.memoImageId;
      if (!imageId) return;
      coverPhoto?.setCoverPhoto?.(imageId);
      refreshCoverToolbar(block);
    });

    clearCoverBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      coverPhoto?.clearCoverPhoto?.();
      refreshCoverToolbar(block);
    });

    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const imageId = block.dataset.memoImageId;
      if (imageId && coverPhoto?.getCoverPhotoId?.() === imageId) {
        coverPhoto?.clearCoverPhoto?.();
      }
      revokeMemoImageObjectUrls(block);
      block.remove();
      clearPhotoSelection();
      syncPageEditorDraftFromForm(w);

      if (imageId) {
        const sources = collectAllMemoImageHtmlSources?.() ?? [];
        const stillUsed = sources.some((html) => collectMemoImageIdsFromHtml(html).has(imageId));
        if (!stillUsed) {
          await deleteMemoImageIfUnreferenced?.(imageId);
        }
      }
    });
  };

  contentEditor.addEventListener('click', (e) => {
    const block = e.target.closest(`.${MEMO_PHOTO_BLOCK_CLASS}`);
    if (!block || !contentEditor.contains(block)) {
      clearPhotoSelection();
      return;
    }
    e.preventDefault();
    clearPhotoSelection();
    selectedPhotoBlock = block;
    block.classList.add(MEMO_PHOTO_SELECTED_CLASS);
    showDeleteToolbar(block);
  });

  shell.addEventListener('click', (e) => {
    if (!e.target.closest(`.${MEMO_PHOTO_BLOCK_CLASS}`)) {
      clearPhotoSelection();
    }
  });
}

export function removeMemoPhotoDialogs(root) {
  removePhotoConfirmDialog(root);
  removePhotoOverflowDialog(root);
  removePhotoProcessingOverlay(root);
  removeSheetOverflowDialogs(root);
}

export function resetMemoPhotoSession(widgetId) {
  isMemoPhotoPickerOpen = false;
  isMemoPhotoProcessing = false;
  photoOverflowModalOpen = false;
  isMemoPhotoOverflowPromptOpen = false;
  savedEditorSelection = null;
  pendingPhotoRecords = [];
  pendingPhotoInsertIndex = 0;
  pendingUnreferencedImageIds.clear();
}

export function memoContentHasImages(html) {
  return collectMemoImageIdsFromHtml(html).size > 0;
}

export function getMemoDraftExcerptWithPhotos(content, truncateFn) {
  const text = truncateFn?.(content) ?? '';
  if (text) return text;
  if (memoContentHasImages(content)) return '사진이 포함된 임시저장본';
  return '';
}

export function openMemoImageLightbox(imageId, root) {
  if (!imageId || !root) return;

  root.querySelector('.memo-image-lightbox')?.remove();

  const overlay = document.createElement('div');
  overlay.className = 'memo-image-lightbox';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');

  const backdrop = document.createElement('button');
  backdrop.type = 'button';
  backdrop.className = 'memo-image-lightbox-backdrop';
  backdrop.setAttribute('aria-label', '닫기');

  const panel = document.createElement('div');
  panel.className = 'memo-image-lightbox-panel';

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'memo-image-lightbox-close';
  closeBtn.textContent = '✕';
  closeBtn.setAttribute('aria-label', '닫기');

  const img = document.createElement('img');
  img.className = 'memo-image-lightbox-img';
  img.dataset.memoImageId = imageId;
  img.alt = '';

  panel.append(closeBtn, img);
  overlay.append(backdrop, panel);
  root.appendChild(overlay);

  const close = () => {
    revokeMemoImageObjectUrls(overlay);
    overlay.remove();
  };

  backdrop.addEventListener('click', close);
  closeBtn.addEventListener('click', close);

  loadMemoImageIntoElement(img).catch(() => {
    const fallback = document.createElement('p');
    fallback.className = 'memo-image-fallback';
    fallback.textContent = '사진을 불러올 수 없습니다.';
    img.replaceWith(fallback);
  });
}

export function bindMemoReadModePhotoLightbox(container, root) {
  if (!container || container.dataset.memoLightboxBound) return;
  container.dataset.memoLightboxBound = '1';

  container.addEventListener('click', (e) => {
    if (e.target.closest('.memo-page-editor')) return;
    const img = e.target.closest('img[data-memo-image-id]');
    if (!img) return;
    e.preventDefault();
    openMemoImageLightbox(img.dataset.memoImageId, root);
  });
}
