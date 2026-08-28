/* ═══════════════════════════════════════════════════════════
   MEMENTO DIARY — Widget Drawer & Size Carousel
   ═══════════════════════════════════════════════════════════ */

import { state } from './state.js';
import { dom, $, $$ } from './dom.js';
import { showToast } from './utils.js';
import { enterPlacementMode } from './widgets.js';


/* ── Open / Close Drawer ─────────────────────────────── */
export function openDrawer() {
  dom.drawerOverlay.classList.remove('hidden');
  requestAnimationFrame(() => dom.drawerOverlay.classList.add('active'));

  // Activate Gallery tab by default
  $$('.drawer-tab').forEach((t) => t.classList.toggle('active', t.dataset.tab === 'gallery'));
  $$('.tab-content').forEach((c) => c.classList.add('hidden'));
  $('#tab-gallery').classList.remove('hidden');

  state.carouselIndex = 0;
  state.ledgerCarouselIndex = 0;
  state.todoCarouselIndex = 0;
  state.memoCarouselIndex = 0;
  updateCarousel();
  updateTodoCarousel();
  updateLedgerCarousel();
  updateMemoCarousel();
}

export function closeDrawer() {
  dom.drawerOverlay.classList.remove('active');
  setTimeout(() => dom.drawerOverlay.classList.add('hidden'), 450);
}


/* ── Ledger Carousel ──────────────────────────────────── */
export function buildLedgerSizeCarousel() {
  const viewport = dom.ledgerCarouselViewport;
  if (!viewport) return;
  viewport.innerHTML = '';

  state.ledgerSizes.forEach((size) => {
    const card = document.createElement('div');
    card.className = 'size-card';

    const preview = document.createElement('div');
    preview.className = 'size-preview ledger-size-preview-wrapper';
    preview.style.gridTemplateColumns = `repeat(${size.cols}, 1fr)`;

    const placeholder = document.createElement('div');
    placeholder.className = 'ledger-size-preview';
    placeholder.style.gridColumn = '1 / -1';
    placeholder.style.gridRow = '1 / -1';
    placeholder.setAttribute('aria-hidden', 'true');
    placeholder.innerHTML = `
      <div class="lsp-h lsp-date"></div>
      <div class="lsp-h lsp-content"></div>
      <div class="lsp-h lsp-cat"></div>
      <div class="lsp-h lsp-price"></div>
      <div class="lsp-lines"></div>
      <div class="lsp-foot"><span></span><span>~~~</span></div>
    `;
    preview.appendChild(placeholder);

    card.innerHTML = `
      <div class="size-label">${size.label}</div>
      <div class="size-dims">${size.subtitle}</div>
    `;
    card.insertBefore(preview, card.firstChild.nextSibling);
    viewport.appendChild(card);
  });

  const dots = dom.ledgerCarouselDots;
  if (dots) {
    dots.innerHTML = '';
    state.ledgerSizes.forEach((_, i) => {
      const dot = document.createElement('button');
      dot.className = 'carousel-dot';
      if (i === (state.ledgerCarouselIndex || 0)) dot.classList.add('active');
      dot.addEventListener('click', () => {
        state.ledgerCarouselIndex = i;
        updateLedgerCarousel();
      });
      dots.appendChild(dot);
    });
  }
  updateLedgerCarousel();
}

export function navigateLedgerCarousel(dir) {
  const max = state.ledgerSizes.length - 1;
  state.ledgerCarouselIndex = Math.max(0, Math.min(max, (state.ledgerCarouselIndex || 0) + dir));
  updateLedgerCarousel();
}

function updateLedgerCarousel() {
  const viewport = dom.ledgerCarouselViewport;
  if (!viewport) return;
  const idx = state.ledgerCarouselIndex || 0;
  viewport.querySelectorAll('.size-card').forEach((card) => {
    card.style.transform = `translateX(-${idx * 100}%)`;
  });
  const dots = dom.ledgerCarouselDots;
  dots?.querySelectorAll('.carousel-dot').forEach((dot, i) => {
    dot.classList.toggle('active', i === idx);
  });
}

export function onChooseLedgerSize() {
  const size = state.ledgerSizes[state.ledgerCarouselIndex || 0];
  state.placementType = 'ledger';
  state.placementSize = size;
  state.placementImage = null;
  closeDrawer();
  setTimeout(() => {
    enterPlacementMode(size, null, 'ledger');
    showToast('가계부를 놓을 위치를 클릭하세요');
  }, 250);
}


/* ── Memo Carousel ───────────────────────────────────── */
export function buildMemoSizeCarousel() {
  const viewport = dom.memoCarouselViewport;
  if (!viewport) return;
  viewport.innerHTML = '';

  state.widgetSizes.forEach((size) => {
    const card = document.createElement('div');
    card.className = 'size-card';

    const preview = document.createElement('div');
    preview.className = 'size-preview memo-size-preview';
    preview.style.gridTemplateColumns = `repeat(${size.cols}, 1fr)`;

    const placeholder = document.createElement('div');
    placeholder.className = 'size-preview-memo';
    placeholder.style.gridColumn = '1 / -1';
    placeholder.style.gridRow = '1 / -1';
    placeholder.textContent = 'Memo';
    preview.appendChild(placeholder);

    card.innerHTML = `
      <div class="size-label">${size.label}</div>
      <div class="size-dims">${size.subtitle}</div>
    `;
    card.insertBefore(preview, card.firstChild.nextSibling);
    viewport.appendChild(card);
  });

  const dots = dom.memoCarouselDots;
  if (dots) {
    dots.innerHTML = '';
    state.widgetSizes.forEach((_, i) => {
      const dot = document.createElement('button');
      dot.className = 'carousel-dot';
      if (i === (state.memoCarouselIndex || 0)) dot.classList.add('active');
      dot.addEventListener('click', () => {
        state.memoCarouselIndex = i;
        updateMemoCarousel();
      });
      dots.appendChild(dot);
    });
  }
  updateMemoCarousel();
}

export function navigateMemoCarousel(dir) {
  const max = state.widgetSizes.length - 1;
  state.memoCarouselIndex = Math.max(0, Math.min(max, (state.memoCarouselIndex || 0) + dir));
  updateMemoCarousel();
}

function updateMemoCarousel() {
  const viewport = dom.memoCarouselViewport;
  if (!viewport) return;
  const idx = state.memoCarouselIndex || 0;
  viewport.querySelectorAll('.size-card').forEach((card) => {
    card.style.transform = `translateX(-${idx * 100}%)`;
  });
  const dots = dom.memoCarouselDots;
  dots?.querySelectorAll('.carousel-dot').forEach((dot, i) => {
    dot.classList.toggle('active', i === idx);
  });
}

export function onChooseMemoSize() {
  const size = state.widgetSizes[state.memoCarouselIndex || 0];
  state.placementType = 'memo';
  state.placementSize = size;
  state.placementImage = null;
  closeDrawer();
  setTimeout(() => {
    enterPlacementMode(size, null, 'memo');
    showToast('메모를 놓을 위치를 클릭하세요');
  }, 250);
}


/* ── Size Carousel ───────────────────────────────────── */
export function buildSizeCarousel() {
  const viewport = dom.carouselViewport;
  viewport.innerHTML = '';

  state.widgetSizes.forEach((size) => {
    const card = document.createElement('div');
    card.className = 'size-card';

    // Build image preview with aspect ratio
    const preview = document.createElement('div');
    preview.className = 'size-preview';
    preview.style.gridTemplateColumns = `repeat(${size.cols}, 1fr)`;

    // Add placeholder image that matches the aspect ratio
    const imgContainer = document.createElement('div');
    imgContainer.className = 'size-preview-image';
    imgContainer.style.gridColumn = `1 / -1`;
    imgContainer.style.gridRow = `1 / -1`;

    const imgWidth = size.cols * 100;
    const imgHeight = size.rows * 100;
    const img = document.createElement('img');
    img.src = `https://picsum.photos/${imgWidth}/${imgHeight}?random=${size.cols}${size.rows}`;
    img.alt = `${size.label} preview`;
    img.loading = 'lazy';
    imgContainer.appendChild(img);
    preview.appendChild(imgContainer);

    card.innerHTML = `
      <div class="size-label">${size.label}</div>
      <div class="size-dims">${size.subtitle}</div>
    `;
    card.insertBefore(preview, card.firstChild.nextSibling);
    viewport.appendChild(card);
  });

  buildCarouselDots();
  updateCarousel();
}

function buildCarouselDots() {
  const dots = dom.carouselDots;
  dots.innerHTML = '';
  state.widgetSizes.forEach((_, i) => {
    const dot = document.createElement('button');
    dot.className = 'carousel-dot';
    if (i === state.carouselIndex) dot.classList.add('active');
    dot.addEventListener('click', () => {
      state.carouselIndex = i;
      updateCarousel();
    });
    dots.appendChild(dot);
  });
}

export function navigateCarousel(dir) {
  const max = state.widgetSizes.length - 1;
  state.carouselIndex = Math.max(0, Math.min(max, state.carouselIndex + dir));
  updateCarousel();
}

function updateCarousel() {
  const cards = dom.carouselViewport.querySelectorAll('.size-card');
  cards.forEach((card) => {
    card.style.transform = `translateX(-${state.carouselIndex * 100}%)`;
  });

  dom.carouselDots.querySelectorAll('.carousel-dot').forEach((dot, i) => {
    dot.classList.toggle('active', i === state.carouselIndex);
  });
}


/* ── Gallery Widget Flow ─────────────────────────────── */
export function onChooseSize() {
  const size = state.widgetSizes[state.carouselIndex];
  state.placementSize = size;

  closeDrawer();

  // Trigger file picker
  setTimeout(() => {
    dom.fileInputHidden.value = '';
    dom.fileInputHidden.click();
  }, 250);
}

export function onEditGallerySize() {
  // 실시간으로 남은 칸(최대 연속 빈칸) 계산
  let maxW = 0;
  let maxH = 0;
  const rows = state.gridRows || 20;
  const cols = state.gridCols || 8;
  const occupied = state.occupiedCells || {};

  // 가장 긴 가로 빈 공간 찾기
  for (let r = 0; r < rows; r++) {
    let currentW = 0;
    for (let c = 0; c < cols; c++) {
      if (!occupied[`${r}-${c}`]) currentW++;
      else {
        if (currentW > maxW) maxW = currentW;
        currentW = 0;
      }
    }
    if (currentW > maxW) maxW = currentW;
  }

  // 가장 긴 세로 빈 공간 찾기
  for (let c = 0; c < cols; c++) {
    let currentH = 0;
    for (let r = 0; r < rows; r++) {
      if (!occupied[`${r}-${c}`]) currentH++;
      else {
        if (currentH > maxH) maxH = currentH;
        currentH = 0;
      }
    }
    if (currentH > maxH) maxH = currentH;
  }

  if (maxW === 0) maxW = 1;
  if (maxH === 0) maxH = 1;

  dom.customSizeOverlay.dataset.maxW = maxW;
  dom.customSizeOverlay.dataset.maxH = maxH;

  dom.customSizeWarning.textContent = `현재 배치 가능한 최대 가로는 ${maxW}칸, 세로는 ${maxH}칸입니다.`;
  dom.customSizeWarning.style.color = '#e53935'; // 빨간색 글씨
  
  dom.customSizeW.max = maxW;
  dom.customSizeH.max = maxH;
  dom.customSizeW.value = Math.min(2, maxW).toString();
  dom.customSizeH.value = Math.min(2, maxH).toString();
  
  dom.customSizeOverlay.classList.remove('hidden');
  requestAnimationFrame(() => dom.customSizeOverlay.classList.add('active'));
}

export function onCustomSizeApply() {
  const maxW = parseInt(dom.customSizeOverlay.dataset.maxW || state.gridCols || 8, 10);
  const maxH = parseInt(dom.customSizeOverlay.dataset.maxH || 20, 10);
  
  const w = parseInt(dom.customSizeW.value, 10);
  const h = parseInt(dom.customSizeH.value, 10);

  if (isNaN(w) || isNaN(h) || w < 1 || h < 1) {
    alert("올바른 숫자를 입력해주세요.");
    return;
  }

  if (w > maxW || h > maxH) {
    alert(`입력하신 크기가 빈 공간보다 큽니다!\n현재 가로는 최대 ${maxW}칸, 세로는 최대 ${maxH}칸까지만 가능합니다.`);
    return;
  }

  // Valid size
  dom.customSizeOverlay.classList.remove('active');
  setTimeout(() => dom.customSizeOverlay.classList.add('hidden'), 150);

  state.placementSize = { cols: w, rows: h };
  closeDrawer();
  
  setTimeout(() => {
    dom.fileInputHidden.value = '';
    dom.fileInputHidden.click();
  }, 250);
}

export function onCustomSizeCancel() {
  dom.customSizeOverlay.classList.remove('active');
  setTimeout(() => dom.customSizeOverlay.classList.add('hidden'), 150);
}

export function onImageSelected(e) {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (ev) => {
    const imageData = ev.target.result;

    dom.confirmImage.src = imageData;
    dom.confirmOverlay.classList.remove('hidden');
    requestAnimationFrame(() => dom.confirmOverlay.classList.add('active'));

    state.placementImage = imageData;
  };
  reader.readAsDataURL(file);
}

export function onConfirmYes() {
  dom.confirmOverlay.classList.remove('active');
  setTimeout(() => dom.confirmOverlay.classList.add('hidden'), 150);

  enterPlacementMode(state.placementSize, state.placementImage, 'gallery');
}

export function onConfirmNo() {
  dom.confirmOverlay.classList.remove('active');
  setTimeout(() => dom.confirmOverlay.classList.add('hidden'), 150);

  state.placementImage = null;
  showToast('Image import cancelled');

  setTimeout(openDrawer, 200);
}


/* ── To-Do Widget Flow ───────────────────────────────── */
export function buildTodoSizeCarousel() {
  const viewport = dom.todoCarouselViewport;
  viewport.innerHTML = '';

  state.widgetSizes.forEach((size) => {
    const card = document.createElement('div');
    card.className = 'size-card';

    const preview = document.createElement('div');
    preview.className = 'size-preview todo-size-preview';
    preview.style.gridTemplateColumns = `repeat(${size.cols}, 1fr)`;

    const placeholder = document.createElement('div');
    placeholder.className = 'size-preview-todo';
    placeholder.style.gridColumn = '1 / -1';
    placeholder.style.gridRow = '1 / -1';
    placeholder.textContent = 'To-Do';
    preview.appendChild(placeholder);

    card.innerHTML = `
      <div class="size-label">${size.label}</div>
      <div class="size-dims">${size.subtitle}</div>
    `;
    card.insertBefore(preview, card.firstChild.nextSibling);
    viewport.appendChild(card);
  });

  buildTodoCarouselDots();
  updateTodoCarousel();
}

function buildTodoCarouselDots() {
  const dots = dom.todoCarouselDots;
  dots.innerHTML = '';
  state.widgetSizes.forEach((_, i) => {
    const dot = document.createElement('button');
    dot.className = 'carousel-dot';
    if (i === state.todoCarouselIndex) dot.classList.add('active');
    dot.addEventListener('click', () => {
      state.todoCarouselIndex = i;
      updateTodoCarousel();
    });
    dots.appendChild(dot);
  });
}

export function navigateTodoCarousel(dir) {
  const max = state.widgetSizes.length - 1;
  state.todoCarouselIndex = Math.max(0, Math.min(max, state.todoCarouselIndex + dir));
  updateTodoCarousel();
}

function updateTodoCarousel() {
  const cards = dom.todoCarouselViewport.querySelectorAll('.size-card');
  cards.forEach((card) => {
    card.style.transform = `translateX(-${state.todoCarouselIndex * 100}%)`;
  });

  dom.todoCarouselDots.querySelectorAll('.carousel-dot').forEach((dot, i) => {
    dot.classList.toggle('active', i === state.todoCarouselIndex);
  });
}

export function onChooseTodoSize() {
  const size = state.widgetSizes[state.todoCarouselIndex];
  closeDrawer();
  setTimeout(() => {
    enterPlacementMode(size, null, 'todo');
  }, 250);
}

