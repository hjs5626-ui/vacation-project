/* ═══════════════════════════════════════════════════════════
   MEMENTO DIARY — Custom Input / Confirm / Choice Dialogs
   ═══════════════════════════════════════════════════════════ */

import { dom } from './dom.js';
import { showToast, normalizeHexColor } from './utils.js';
export { showToast };


let activeDialog = null;
let inputResolver = null;
let confirmResolver = null;
let choiceResolver = null;
let colorResolver = null;
let colorPickerSelection = '#FF8FB1';

export const COLOR_PALETTE = [
  { value: '#FF8FB1', label: '핑크' },
  { value: '#FFD6E4', label: '연핑크' },
  { value: '#FF9F8F', label: '코랄' },
  { value: '#FFB86B', label: '오렌지' },
  { value: '#FFD86B', label: '옐로' },
  { value: '#86D8A8', label: '그린' },
  { value: '#80D8CC', label: '민트' },
  { value: '#89C7F7', label: '스카이블루' },
  { value: '#8EA7FF', label: '블루' },
  { value: '#B49AF5', label: '퍼플' },
];

function stopEvent(e) {
  e.stopPropagation();
}


function closeInputDialog(result) {
  if (!dom.appInputOverlay) return;

  dom.appInputOverlay.classList.remove('active');
  setTimeout(() => dom.appInputOverlay.classList.add('hidden'), 200);

  if (dom.appInputError) dom.appInputError.textContent = '';

  activeDialog = null;
  const resolve = inputResolver;
  inputResolver = null;
  resolve?.(result);
}


function closeConfirmDialog(result) {
  if (!dom.appConfirmOverlay) return;

  dom.appConfirmOverlay.classList.remove('active');
  setTimeout(() => dom.appConfirmOverlay.classList.add('hidden'), 200);

  activeDialog = null;
  const resolve = confirmResolver;
  confirmResolver = null;
  resolve?.(result);
}


function closeChoiceDialog(result) {
  if (!dom.appChoiceOverlay) return;

  dom.appChoiceOverlay.classList.remove('active');
  setTimeout(() => dom.appChoiceOverlay.classList.add('hidden'), 200);

  if (dom.appChoiceList) dom.appChoiceList.replaceChildren();

  activeDialog = null;
  const resolve = choiceResolver;
  choiceResolver = null;
  resolve?.(result);
}


function closeColorDialog(result) {
  if (!dom.appColorOverlay) return;

  dom.appColorOverlay.classList.remove('active');
  setTimeout(() => dom.appColorOverlay.classList.add('hidden'), 200);

  activeDialog = null;
  const resolve = colorResolver;
  colorResolver = null;
  resolve?.(result);
}


function updateColorPickerUI(selected) {
  colorPickerSelection = normalizeHexColor(selected);

  if (dom.appColorPreview) {
    dom.appColorPreview.style.backgroundColor = colorPickerSelection;
  }
  if (dom.appColorNativeInput) {
    dom.appColorNativeInput.value = colorPickerSelection;
  }

  dom.appColorPalette?.querySelectorAll('.app-color-swatch').forEach((btn) => {
    const isSelected = normalizeHexColor(btn.dataset.color) === colorPickerSelection;
    btn.classList.toggle('app-color-swatch--selected', isSelected);
    btn.setAttribute('aria-pressed', isSelected ? 'true' : 'false');
  });
}


function renderColorPalette() {
  if (!dom.appColorPalette) return;

  dom.appColorPalette.replaceChildren();

  COLOR_PALETTE.forEach(({ value, label }) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'app-color-swatch';
    btn.dataset.color = value;
    btn.style.backgroundColor = value;
    btn.setAttribute('aria-label', label);
    btn.title = label;

    const check = document.createElement('span');
    check.className = 'app-color-swatch-check';
    check.textContent = '✓';
    btn.appendChild(check);

    btn.addEventListener('click', (e) => {
      stopEvent(e);
      updateColorPickerUI(value);
    });

    dom.appColorPalette.appendChild(btn);
  });
}


/**
 * @param {object} [options]
 * @param {string} [options.title]
 * @param {string} [options.value]
 * @returns {Promise<string|null>}
 */
export function openColorPickerDialog(options = {}) {
  if (activeDialog || !dom.appColorOverlay) {
    return Promise.resolve(null);
  }

  const { title = '색상 변경', value = '#FF8FB1' } = options;

  activeDialog = 'color';
  colorPickerSelection = normalizeHexColor(value);

  if (dom.appColorTitle) dom.appColorTitle.textContent = title;

  renderColorPalette();
  updateColorPickerUI(colorPickerSelection);

  dom.appColorOverlay.classList.remove('hidden');
  requestAnimationFrame(() => dom.appColorOverlay.classList.add('active'));

  return new Promise((resolve) => {
    colorResolver = resolve;
  });
}

function handleInputConfirm() {
  const value = dom.appInputField?.value ?? '';
  const trimmed = value.trim();

  if (!trimmed) {
    if (dom.appInputError) {
      dom.appInputError.textContent = '내용을 입력하세요';
    } else {
      showToast('내용을 입력하세요');
    }
    dom.appInputField?.focus();
    return;
  }

  closeInputDialog(trimmed);
}


/**
 * @param {object} options
 * @param {string} options.title
 * @param {string} [options.value]
 * @param {string} [options.placeholder]
 * @param {number} [options.maxLength]
 * @param {string} [options.confirmLabel]
 * @param {string} [options.cancelLabel]
 * @returns {Promise<string|null>} trimmed value or null if cancelled
 */
export function openInputDialog(options = {}) {
  if (activeDialog || !dom.appInputOverlay) {
    return Promise.resolve(null);
  }

  const {
    title = '',
    value = '',
    placeholder = '',
    maxLength = 120,
    confirmLabel = '확인',
    cancelLabel = '취소',
  } = options;

  activeDialog = 'input';

  if (dom.appInputTitle) dom.appInputTitle.textContent = title;
  if (dom.appInputField) {
    dom.appInputField.value = value;
    dom.appInputField.placeholder = placeholder;
    dom.appInputField.maxLength = maxLength;
  }
  if (dom.appInputConfirm) dom.appInputConfirm.textContent = confirmLabel;
  if (dom.appInputCancel) dom.appInputCancel.textContent = cancelLabel;
  if (dom.appInputError) dom.appInputError.textContent = '';

  dom.appInputOverlay.classList.remove('hidden');
  requestAnimationFrame(() => dom.appInputOverlay.classList.add('active'));

  return new Promise((resolve) => {
    inputResolver = resolve;

    requestAnimationFrame(() => {
      dom.appInputField?.focus();
      dom.appInputField?.select();
    });
  });
}


/**
 * @param {object} options
 * @param {string} [options.title]
 * @param {string} options.message
 * @param {string} [options.confirmLabel]
 * @param {string} [options.cancelLabel]
 * @param {boolean} [options.danger]
 * @returns {Promise<boolean>}
 */
export function openConfirmDialog(options = {}) {
  if (activeDialog || !dom.appConfirmOverlay) {
    return Promise.resolve(false);
  }

  const {
    title = '확인',
    message = '',
    confirmLabel = '확인',
    cancelLabel = '취소',
    danger = false,
  } = options;

  activeDialog = 'confirm';

  if (dom.appConfirmTitle) dom.appConfirmTitle.textContent = title;
  if (dom.appConfirmMessage) dom.appConfirmMessage.textContent = message;
  if (dom.appConfirmOk) {
    dom.appConfirmOk.textContent = confirmLabel;
    dom.appConfirmOk.classList.toggle('app-dialog-btn--danger', danger);
  }
  if (dom.appConfirmCancel) dom.appConfirmCancel.textContent = cancelLabel;

  dom.appConfirmOverlay.classList.remove('hidden');
  requestAnimationFrame(() => dom.appConfirmOverlay.classList.add('active'));

  return new Promise((resolve) => {
    confirmResolver = resolve;
  });
}


/**
 * @param {object} options
 * @param {string} options.title
 * @param {string} [options.message]
 * @param {{ value: string, label: string }[]} options.choices
 * @param {string} [options.cancelLabel]
 * @returns {Promise<string|null>} selected value or null
 */
export function openChoiceDialog(options = {}) {
  if (activeDialog || !dom.appChoiceOverlay) {
    return Promise.resolve(null);
  }

  const {
    title = '선택',
    message = '',
    choices = [],
    cancelLabel = '취소',
  } = options;

  if (choices.length === 0) {
    return Promise.resolve(null);
  }

  activeDialog = 'choice';

  if (dom.appChoiceTitle) dom.appChoiceTitle.textContent = title;
  if (dom.appChoiceMessage) {
    dom.appChoiceMessage.textContent = message;
    dom.appChoiceMessage.classList.toggle('hidden', !message);
  }
  if (dom.appChoiceCancel) dom.appChoiceCancel.textContent = cancelLabel;

  if (dom.appChoiceList) {
    dom.appChoiceList.replaceChildren();
    choices.forEach((choice) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'app-dialog-choice-item';
      btn.textContent = choice.label;
      btn.addEventListener('click', (e) => {
        stopEvent(e);
        closeChoiceDialog(choice.value);
      });
      dom.appChoiceList.appendChild(btn);
    });
  }

  dom.appChoiceOverlay.classList.remove('hidden');
  requestAnimationFrame(() => dom.appChoiceOverlay.classList.add('active'));

  return new Promise((resolve) => {
    choiceResolver = resolve;
  });
}


export function isAppDialogOpen() {
  return activeDialog !== null;
}


export function initAppDialogs() {
  if (!dom.appInputOverlay || dom.appInputOverlay.dataset.bound) return;
  dom.appInputOverlay.dataset.bound = '1';

  dom.appInputCancel?.addEventListener('click', (e) => {
    stopEvent(e);
    closeInputDialog(null);
  });

  dom.appInputConfirm?.addEventListener('click', (e) => {
    stopEvent(e);
    handleInputConfirm();
  });

  dom.appInputOverlay.addEventListener('click', (e) => {
    if (e.target === dom.appInputOverlay) closeInputDialog(null);
  });

  dom.appInputPanel?.addEventListener('click', stopEvent);

  dom.appInputField?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleInputConfirm();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      closeInputDialog(null);
    }
  });

  dom.appConfirmCancel?.addEventListener('click', (e) => {
    stopEvent(e);
    closeConfirmDialog(false);
  });

  dom.appConfirmOk?.addEventListener('click', (e) => {
    stopEvent(e);
    closeConfirmDialog(true);
  });

  dom.appConfirmOverlay?.addEventListener('click', (e) => {
    if (e.target === dom.appConfirmOverlay) closeConfirmDialog(false);
  });

  dom.appConfirmPanel?.addEventListener('click', stopEvent);

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || !activeDialog) return;

    e.preventDefault();
    e.stopPropagation();

    if (activeDialog === 'input') {
      closeInputDialog(null);
    } else if (activeDialog === 'confirm') {
      closeConfirmDialog(false);
    } else if (activeDialog === 'choice') {
      closeChoiceDialog(null);
    } else if (activeDialog === 'color') {
      closeColorDialog(null);
    }
  }, true);

  dom.appChoiceCancel?.addEventListener('click', (e) => {
    stopEvent(e);
    closeChoiceDialog(null);
  });

  dom.appChoiceOverlay?.addEventListener('click', (e) => {
    if (e.target === dom.appChoiceOverlay) closeChoiceDialog(null);
  });

  dom.appChoicePanel?.addEventListener('click', stopEvent);

  dom.appColorCancel?.addEventListener('click', (e) => {
    stopEvent(e);
    closeColorDialog(null);
  });

  dom.appColorApply?.addEventListener('click', (e) => {
    stopEvent(e);
    closeColorDialog(colorPickerSelection);
  });

  dom.appColorOverlay?.addEventListener('click', (e) => {
    if (e.target === dom.appColorOverlay) closeColorDialog(null);
  });

  dom.appColorPanel?.addEventListener('click', stopEvent);

  dom.appColorCustomBtn?.addEventListener('click', (e) => {
    stopEvent(e);
    dom.appColorNativeInput?.click();
  });

  dom.appColorNativeInput?.addEventListener('input', (e) => {
    updateColorPickerUI(e.target.value);
  });
}
