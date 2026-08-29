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

  // Activate Ledger tab by default (first tab) — user can switch to Gallery etc.
  $$('.drawer-tab').forEach((t) => t.classList.toggle('active', t.dataset.tab === 'ledger'));
  $$('.tab-content').forEach((c) => c.classList.add('hidden'));
  $('#tab-ledger').classList.remove('hidden');

  state.carouselIndex = 0;
  state.ledgerCarouselIndex = 0;
  updateCarousel();
  updateLedgerCarousel();
}

export function buildLedgerSizeCarousel() {
  const viewport = $('#ledger-carousel-viewport');
  if (!viewport) return;
  viewport.innerHTML = '';

  state.ledgerSizes.forEach((size) => {
    const card = document.createElement('div');
    card.className = 'size-card ledger-size-card';
    card.innerHTML = `
      <div class="ledger-size-preview" aria-hidden="true">
        <div class="lsp-h lsp-date"></div>
        <div class="lsp-h lsp-content"></div>
        <div class="lsp-h lsp-cat"></div>
        <div class="lsp-h lsp-price"></div>
        <div class="lsp-lines"></div>
        <div class="lsp-foot"><span>합</span><span>~~~원</span></div>
      </div>
      <div class="size-label">${size.label}</div>
      <div class="size-dims">${size.subtitle}</div>
    `;
    viewport.appendChild(card);
  });

  const dots = $('#ledger-carousel-dots');
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
  const viewport = $('#ledger-carousel-viewport');
  if (!viewport) return;
  const idx = state.ledgerCarouselIndex || 0;
  viewport.querySelectorAll('.size-card').forEach((card) => {
    card.style.transform = `translateX(-${idx * 100}%)`;
  });
  const dots = $('#ledger-carousel-dots');
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
    enterPlacementMode(size, null);
    showToast('가계부를 놓을 위치를 클릭하세요');
  }, 250);
}

export function closeDrawer() {
  dom.drawerOverlay.classList.remove('active');
  setTimeout(() => dom.drawerOverlay.classList.add('hidden'), 450);
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
  state.placementType = 'gallery';

  closeDrawer();

  // Trigger file picker
  setTimeout(() => {
    dom.fileInputHidden.value = '';
    dom.fileInputHidden.click();
  }, 250);
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

  state.placementType = 'gallery';
  enterPlacementMode(state.placementSize, state.placementImage);
}

export function onConfirmNo() {
  dom.confirmOverlay.classList.remove('active');
  setTimeout(() => dom.confirmOverlay.classList.add('hidden'), 150);

  state.placementImage = null;
  showToast('Image import cancelled');

  setTimeout(openDrawer, 200);
}
