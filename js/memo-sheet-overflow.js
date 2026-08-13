/* Memo page editor — sheet height measurement, overflow split, dialogs */

const MEMO_PHOTO_BLOCK_CLASS = 'memo-editor-photo-block';

const PHOTO_BLOCK_MARGIN_Y = 16;
const MEMO_PHOTO_BLOCK_WIDTH_RATIO = 0.3;

let isCreatingOverflowSheet = false;

export function getIsCreatingOverflowSheet() {
  return isCreatingOverflowSheet;
}

export function setIsCreatingOverflowSheet(value) {
  isCreatingOverflowSheet = Boolean(value);
}

export function getAvailableEditorWidth(contentEditor) {
  const width = contentEditor?.clientWidth ?? 0;
  if (width > 0) return width;
  const wrap = contentEditor?.closest('.memo-text-page-content-wrap');
  return wrap?.clientWidth ?? 1;
}

export function getSheetContentMaxHeight(contentEditor) {
  const wrap = contentEditor?.closest('.memo-text-page-content-wrap');
  if (wrap?.clientHeight > 0) return wrap.clientHeight;
  return contentEditor?.clientHeight ?? 1;
}

export function getOrCreateMeasureEditor(contentEditor) {
  const measureRoot = contentEditor.closest('.memo-text-page-shell') ?? document.body;
  let measure = measureRoot.querySelector('.memo-sheet-overflow-measure');
  if (!measure) {
    measure = document.createElement('div');
    measure.className =
      'memo-sheet-overflow-measure memo-photo-measure memo-text-page-content memo-rich-editor sheet-content';
    measure.setAttribute('aria-hidden', 'true');
    measureRoot.appendChild(measure);
  }

  measure.style.width = `${getAvailableEditorWidth(contentEditor)}px`;
  measure.style.height = 'auto';
  measure.style.minHeight = '0';
  measure.style.maxHeight = 'none';
  measure.style.overflow = 'visible';
  return measure;
}

export function applyPhotoMeasureHints(measure, contentEditor) {
  if (!measure || !contentEditor) return;
  const editorWidth = getAvailableEditorWidth(contentEditor);
  const blockWidth = editorWidth * MEMO_PHOTO_BLOCK_WIDTH_RATIO;

  measure.querySelectorAll('.memo-editor-photo-block').forEach((block) => {
    const img = block.querySelector('img[data-memo-image-id]');
    if (!img) return;

    const naturalWidth = Number(img.dataset.memoImageWidth);
    const naturalHeight = Number(img.dataset.memoImageHeight);
    if (naturalWidth > 0 && naturalHeight > 0) {
      const displayHeight = (blockWidth * naturalHeight) / naturalWidth;
      img.style.display = 'block';
      img.style.width = '100%';
      img.style.height = `${displayHeight}px`;
    }
  });
}

function setMeasureHtml(measure, html, contentEditor) {
  measure.replaceChildren();
  if (html) measure.innerHTML = html;
  measure.querySelectorAll('.memo-photo-delete-toolbar').forEach((el) => el.remove());
  applyPhotoMeasureHints(measure, contentEditor);
}

export function measureHtmlContentHeight(contentEditor, html) {
  const measure = getOrCreateMeasureEditor(contentEditor);
  setMeasureHtml(measure, html ?? '', contentEditor);
  return measure.offsetHeight;
}

export function doesHtmlFitEditorSheet(contentEditor, html) {
  if (!contentEditor) return true;
  if (!html || !html.trim()) return true;
  const maxH = getSheetContentMaxHeight(contentEditor);
  return measureHtmlContentHeight(contentEditor, html) <= maxH + 2;
}

function htmlFromNodes(nodes) {
  const div = document.createElement('div');
  nodes.forEach((node) => div.appendChild(node.cloneNode(true)));
  return div.innerHTML;
}

function splitTextNode(textNode, maxChars) {
  if (maxChars <= 0) return { fit: '', overflow: textNode.textContent ?? '' };
  const text = textNode.textContent ?? '';
  if (maxChars >= text.length) return { fit: text, overflow: '' };
  return { fit: text.slice(0, maxChars), overflow: text.slice(maxChars) };
}

function trySplitLastTextNode(fitNodes, overflowNodes, contentEditor, maxH) {
  if (!fitNodes.length) return false;

  const last = fitNodes[fitNodes.length - 1];
  if (last.nodeType !== Node.ELEMENT_NODE) return false;

  const walker = document.createTreeWalker(last, NodeFilter.SHOW_TEXT);
  let textNode = walker.nextNode();
  if (!textNode) return false;

  const fullText = textNode.textContent ?? '';
  if (!fullText.trim()) return false;

  let lo = 0;
  let hi = fullText.length;
  let best = 0;

  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    const trial = fullText.slice(0, mid);
    textNode.textContent = trial;
    const h = measureHtmlContentHeight(contentEditor, htmlFromNodes(fitNodes));
    if (h <= maxH + 2) {
      best = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }

  textNode.textContent = fullText;
  if (best <= 0) return false;

  const { fit, overflow } = splitTextNode(textNode, best);
  textNode.textContent = fit;

  const overflowEl = last.cloneNode(true);
  const overflowWalker = document.createTreeWalker(overflowEl, NodeFilter.SHOW_TEXT);
  const overflowText = overflowWalker.nextNode();
  if (overflowText) overflowText.textContent = overflow;
  else return false;

  overflowNodes.unshift(overflowEl);
  return true;
}

export function splitHtmlAtSheetLimit(contentEditor, html) {
  if (!html?.trim()) {
    return { fitHtml: '', overflowHtml: '' };
  }

  const maxH = getSheetContentMaxHeight(contentEditor);
  if (measureHtmlContentHeight(contentEditor, html) <= maxH + 2) {
    return { fitHtml: html, overflowHtml: '' };
  }

  const wrapper = document.createElement('div');
  wrapper.innerHTML = html;
  const children = [...wrapper.childNodes];
  const fitNodes = [];
  const overflowNodes = [];

  for (let i = 0; i < children.length; i += 1) {
    const child = children[i];
    fitNodes.push(child.cloneNode(true));
    const trialHeight = measureHtmlContentHeight(contentEditor, htmlFromNodes(fitNodes));

    if (trialHeight <= maxH + 2) continue;

    fitNodes.pop();

    if (
      child.nodeType === Node.ELEMENT_NODE
      && (child.classList?.contains(MEMO_PHOTO_BLOCK_CLASS) || child.querySelector?.('[data-memo-image-id]'))
    ) {
      overflowNodes.push(child.cloneNode(true));
      for (let j = i + 1; j < children.length; j += 1) {
        overflowNodes.push(children[j].cloneNode(true));
      }
      return {
        fitHtml: htmlFromNodes(fitNodes),
        overflowHtml: htmlFromNodes(overflowNodes),
      };
    }

    fitNodes.push(child.cloneNode(true));
    if (trySplitLastTextNode(fitNodes, overflowNodes, contentEditor, maxH)) {
      for (let j = i + 1; j < children.length; j += 1) {
        overflowNodes.push(children[j].cloneNode(true));
      }
      return {
        fitHtml: htmlFromNodes(fitNodes),
        overflowHtml: htmlFromNodes(overflowNodes),
      };
    }

    fitNodes.pop();
    overflowNodes.push(child.cloneNode(true));
    for (let j = i + 1; j < children.length; j += 1) {
      overflowNodes.push(children[j].cloneNode(true));
    }
    return {
      fitHtml: htmlFromNodes(fitNodes),
      overflowHtml: htmlFromNodes(overflowNodes),
    };
  }

  return { fitHtml: html, overflowHtml: '' };
}

function removeSheetOverflowDialog(root) {
  root?.querySelector('.memo-sheet-overflow-dialog')?.remove();
}

export function showPhotoSheetOverflowDialog(root, remainingCount, onContinue, onCancel) {
  if (root?.querySelector('.memo-sheet-overflow-dialog')) return Promise.resolve(false);

  removeSheetOverflowDialog(root);

  const bodyText =
    remainingCount > 1
      ? `이 사진부터 남은 사진 ${remainingCount}장을\n다음 속지에서 계속 추가할까요?`
      : '이 사진을 다음 속지에 추가할까요?';

  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'memo-sheet-overflow-dialog memo-photo-overflow-dialog';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');

    const panel = document.createElement('div');
    panel.className = 'memo-sheet-overflow-dialog-panel memo-photo-overflow-dialog-panel glass-panel';

    const title = document.createElement('h2');
    title.className = 'memo-sheet-overflow-dialog-title memo-photo-overflow-dialog-title';
    title.textContent = '페이지 분량을 초과했습니다.';

    const message = document.createElement('p');
    message.className = 'memo-sheet-overflow-dialog-message memo-photo-overflow-dialog-message';
    message.textContent = bodyText;

    const actions = document.createElement('div');
    actions.className = 'memo-sheet-overflow-dialog-actions memo-photo-overflow-dialog-actions';

    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'btn-secondary memo-sheet-overflow-cancel memo-photo-overflow-cancel';
    cancelBtn.textContent = '취소';

    const continueBtn = document.createElement('button');
    continueBtn.type = 'button';
    continueBtn.className = 'btn-primary memo-sheet-overflow-continue memo-photo-overflow-confirm';
    continueBtn.textContent = '다음 속지에 추가';

    actions.append(cancelBtn, continueBtn);
    panel.append(title, message, actions);
    overlay.appendChild(panel);
    root.appendChild(overlay);

    cancelBtn.addEventListener('click', () => {
      removeSheetOverflowDialog(root);
      onCancel?.();
      resolve(false);
    });

    continueBtn.addEventListener('click', async () => {
      if (isCreatingOverflowSheet) return;
      continueBtn.disabled = true;
      removeSheetOverflowDialog(root);
      try {
        await onContinue?.();
        resolve(true);
      } catch (error) {
        console.error('[Memo] overflow continue failed:', error);
        resolve(false);
      }
    });
  });
}

export function showTextSheetOverflowDialog(root, onContinue, onCancel) {
  if (root?.querySelector('.memo-sheet-overflow-dialog')) return Promise.resolve(false);

  removeSheetOverflowDialog(root);

  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'memo-sheet-overflow-dialog memo-text-overflow-dialog';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');

    const panel = document.createElement('div');
    panel.className = 'memo-sheet-overflow-dialog-panel glass-panel';

    const title = document.createElement('h2');
    title.className = 'memo-sheet-overflow-dialog-title';
    title.textContent = '페이지 분량을 초과했습니다.';

    const message = document.createElement('p');
    message.className = 'memo-sheet-overflow-dialog-message';
    message.textContent = '초과한 내용을 다음 속지에서 이어 작성할까요?';

    const actions = document.createElement('div');
    actions.className = 'memo-sheet-overflow-dialog-actions';

    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'btn-secondary memo-sheet-overflow-cancel';
    cancelBtn.textContent = '취소';

    const continueBtn = document.createElement('button');
    continueBtn.type = 'button';
    continueBtn.className = 'btn-primary memo-sheet-overflow-continue';
    continueBtn.textContent = '다음 속지에 이어쓰기';

    actions.append(cancelBtn, continueBtn);
    panel.append(title, message, actions);
    overlay.appendChild(panel);
    root.appendChild(overlay);

    cancelBtn.addEventListener('click', () => {
      removeSheetOverflowDialog(root);
      onCancel?.();
      resolve(false);
    });

    continueBtn.addEventListener('click', async () => {
      if (isCreatingOverflowSheet) return;
      continueBtn.disabled = true;
      removeSheetOverflowDialog(root);
      try {
        await onContinue?.();
        resolve(true);
      } catch (error) {
        console.error('[Memo] overflow continue failed:', error);
        resolve(false);
      }
    });
  });
}

export function removeSheetOverflowDialogs(root) {
  removeSheetOverflowDialog(root);
}

export function measurePhotoBlockHeight(contentEditor, photoBlockHtml) {
  const measure = getOrCreateMeasureEditor(contentEditor);
  const baseHtml = contentEditor?.innerHTML ?? '';
  setMeasureHtml(measure, baseHtml + photoBlockHtml, contentEditor);
  return measure.offsetHeight;
}

export function wouldPhotoBlockFitOnPage(contentEditor, photoBlockOuterHtml) {
  const maxH = getSheetContentMaxHeight(contentEditor);
  return measurePhotoBlockHeight(contentEditor, photoBlockOuterHtml) <= maxH + 2;
}
