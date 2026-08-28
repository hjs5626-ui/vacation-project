/* ═══════════════════════════════════════════════════════════
   MEMENTO DIARY — Widget Thumbnail Editor
   Separate module: does not rewrite widget / memo / todo logic.
   Uses DOM objects + a drawing canvas (no Fabric/Konva).
   ═══════════════════════════════════════════════════════════ */

import { state, saveEntries } from './state.js';
import { showToast } from './utils.js';
import { closeTodoDetailPanel } from './todo.js';
import {
  EMOJI_CATEGORIES,
  EMOJI_FONT,
  getRecentEmojis,
  rememberEmoji,
  searchEmojis,
} from './emojiCatalog.js';


const SCHEMA_VERSION = 1;
const WORLD_MULTIPLIER = 3;
const MIN_OBJECT_SIZE = 28;
const MIN_EMOJI_SIZE = 8;
const PHOTO_MAX_EDGE = 1600;

export const THUMBNAIL_FONTS = [
  { id: 'inter', label: 'Inter', family: 'Inter, sans-serif' },
  { id: 'outfit', label: 'Outfit', family: 'Outfit, sans-serif' },
  { id: 'noto', label: 'Noto Sans KR', family: "'Noto Sans KR', sans-serif" },
  { id: 'gaegu', label: 'Gaegu', family: 'Gaegu, cursive' },
  { id: 'nanum-pen', label: 'Nanum Pen', family: "'Nanum Pen Script', cursive" },
  { id: 'georgia', label: 'Georgia', family: 'Georgia, serif' },
  { id: 'courier', label: 'Courier', family: "'Courier New', monospace" },
];

const COLOR_SWATCHES = [
  '#2C2C35', '#FFFFFF', '#6B7280',
  '#FF8FB1', '#FF9F8F', '#FFB86B', '#FFD86B',
  '#86D8A8', '#80D8CC', '#89C7F7', '#8EA7FF', '#B49AF5',
  '#ef4444', '#111827',
];

const PEN_SIZES = [2, 4, 8, 14];

const ICONS = {
  close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>',
  text: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 7V5h16v2M12 5v14M9 19h6"/></svg>',
  photo: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="8.5" cy="10.5" r="1.5"/><path d="M21 16l-5-5-9 9"/></svg>',
  sticker: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><circle cx="9" cy="10" r="1" fill="currentColor"/><circle cx="15" cy="10" r="1" fill="currentColor"/></svg>',
  draw: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/></svg>',
  pencil: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/></svg>',
  widget: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="8" height="8" rx="1.5"/><rect x="13" y="3" width="8" height="8" rx="1.5"/><rect x="3" y="13" width="8" height="8" rx="1.5"/><rect x="13" y="13" width="8" height="8" rx="1.5"/></svg>',
};

let overlay = null;
let workspace = null;
let stage = null;
let worldEl = null;
let objectsLayer = null;
let frameEl = null;
let drawCanvas = null;
let drawCtx = null;
let fileInput = null;
let inspectorEl = null;
let drawPanelEl = null;
let stickerPanelEl = null;
let emojiGridEl = null;
let emojiCatsEl = null;
let emojiSearchEl = null;
let emojiCategoryId = 'smile';
let emojiQuery = '';

let editingWidgetId = null;
let project = null;
let viewScale = 1;
let frameLeft = 0;
let frameTop = 0;
let selectedId = null;
let tool = 'select';
let penColor = '#2C2C35';
let penWidth = 4;
let drawMode = 'pen';
let currentStroke = null;
let dragSession = null;
let bound = false;


function genId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
}


function clone(value) {
  return JSON.parse(JSON.stringify(value));
}


export function findWidgetById(widgetId) {
  if (!widgetId) return null;
  const fromState = state.widgets?.find((w) => w.id === widgetId);
  if (fromState) return fromState;
  const pages = state.currentDiary?.pages;
  if (!Array.isArray(pages)) return null;
  for (const page of pages) {
    const found = page?.widgets?.find((w) => w.id === widgetId);
    if (found) return found;
  }
  return null;
}


export function getWidgetPixelSize(w) {
  const rootStyle = getComputedStyle(document.documentElement);
  const cellSize = parseInt(rootStyle.getPropertyValue('--grid-cell'), 10) || 60;
  const gap = parseInt(rootStyle.getPropertyValue('--grid-gap'), 10) || 4;
  const cols = Number(w?.cols) || 2;
  const rows = Number(w?.rows) || 2;
  return {
    width: cols * cellSize + (cols - 1) * gap,
    height: rows * cellSize + (rows - 1) * gap,
  };
}


function emptyProject(frameWidth, frameHeight) {
  return {
    version: SCHEMA_VERSION,
    frameWidth,
    frameHeight,
    objects: [],
    drawing: { strokes: [] },
  };
}


function adaptProject(raw, frameWidth, frameHeight) {
  if (!raw || typeof raw !== 'object') return emptyProject(frameWidth, frameHeight);
  const next = clone(raw);
  next.version = SCHEMA_VERSION;
  next.objects = Array.isArray(next.objects)
    ? next.objects.filter((obj) => obj && obj.id && (obj.type === 'image' || obj.type === 'text' || obj.type === 'emoji'))
    : [];
  next.drawing = next.drawing && Array.isArray(next.drawing.strokes)
    ? next.drawing
    : { strokes: [] };

  const oldW = Number(next.frameWidth) || frameWidth;
  const oldH = Number(next.frameHeight) || frameHeight;
  const sx = frameWidth / oldW;
  const sy = frameHeight / oldH;

  if (sx !== 1 || sy !== 1) {
    const avg = (sx + sy) / 2;
    next.objects.forEach((obj) => {
      obj.x *= sx;
      obj.y *= sy;
      obj.width *= sx;
      obj.height *= sy;
      if (obj.fontSize) obj.fontSize *= avg;
    });
    next.drawing.strokes.forEach((stroke) => {
      stroke.width *= avg;
      (stroke.points || []).forEach((p) => {
        p.x *= sx;
        p.y *= sy;
      });
    });
  }

  next.frameWidth = frameWidth;
  next.frameHeight = frameHeight;
  return next;
}


function nextZ() {
  return project.objects.reduce((max, obj) => Math.max(max, obj.zIndex || 0), 0) + 1;
}


function fontFamilyById(id) {
  return THUMBNAIL_FONTS.find((f) => f.id === id)?.family || THUMBNAIL_FONTS[0].family;
}


function isThumbnailVisible(w) {
  return Boolean(w?.thumbnail?.image) && w.thumbnail.enabled !== false;
}


/* ── Widget chrome (pencil + optional cover) ─────────── */
export function attachWidgetThumbnailChrome(el, w) {
  if (!el || !w) return;

  el.querySelector('.widget-thumbnail-cover')?.remove();
  el.querySelector('.widget-thumbnail-edit')?.remove();

  if (isThumbnailVisible(w)) {
    const cover = document.createElement('div');
    cover.className = 'widget-thumbnail-cover';
    const img = document.createElement('img');
    img.src = w.thumbnail.image;
    img.alt = '';
    cover.appendChild(img);
    el.appendChild(cover);
  }

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'widget-thumbnail-edit';
  btn.title = '썸네일 꾸미기';
  btn.innerHTML = ICONS.pencil;
  btn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    openThumbnailEditor(w.id);
  });
  el.appendChild(btn);
}


function refreshWidgetCover(widget) {
  const el = document.querySelector(`.placed-widget[data-widget-id="${widget.id}"]`);
  if (!el) return;
  attachWidgetThumbnailChrome(el, widget);
}


/* ── Overlay DOM ─────────────────────────────────────── */
function ensureOverlay() {
  if (overlay) return overlay;

  overlay = document.createElement('div');
  overlay.id = 'thumbnail-editor-overlay';
  overlay.className = 'te-overlay hidden';
  overlay.innerHTML = `
    <style>
      /* 불필요한 꾸미기 도구들을 숨겨서 순수 크롭 툴로만 동작하게 만듭니다 */
      .te-tools,
      .te-inspector,
      .te-draw-panel,
      .te-sticker-panel,
      .te-use-default,
      .te-handle {
        display: none !important;
      }
      .crop-zoom-controls {
        position: absolute;
        right: 24px;
        top: 50%;
        transform: translateY(-50%);
        display: flex;
        flex-direction: column;
        gap: 12px;
        z-index: 1000;
      }
      .crop-zoom-controls button {
        width: 48px;
        height: 48px;
        border-radius: 50%;
        background: rgba(255, 255, 255, 0.9);
        border: 1px solid rgba(0,0,0,0.1);
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        font-size: 24px;
        font-weight: 300;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        color: #333;
        transition: transform 0.15s, background 0.15s;
      }
      .crop-zoom-controls button:hover {
        transform: scale(1.05);
        background: #fff;
      }
      .crop-zoom-controls button:active {
        transform: scale(0.95);
      }
    </style>
    <button type="button" class="te-close" id="te-close" title="닫기">${ICONS.close}</button>
    
    <div class="crop-zoom-controls">
      <button type="button" id="crop-zoom-in" title="확대">+</button>
      <button type="button" id="crop-zoom-out" title="축소">-</button>
    </div>

    <div class="te-tools">
      <button type="button" class="te-tool" data-te-tool="text" title="텍스트">${ICONS.text}</button>
      <button type="button" class="te-tool" data-te-tool="photo" title="사진">${ICONS.photo}</button>
      <button type="button" class="te-tool" data-te-tool="sticker" title="스티커">${ICONS.sticker}</button>
      <button type="button" class="te-tool" data-te-tool="draw" title="그리기">${ICONS.draw}</button>
    </div>
    <div class="te-workspace" id="te-workspace">
      <div class="te-stage" id="te-stage">
        <div class="te-world" id="te-world">
          <div class="te-objects" id="te-objects"></div>
          <canvas class="te-draw-canvas" id="te-draw-canvas"></canvas>
          <div class="te-frame" id="te-frame"></div>
        </div>
      </div>
    </div>
    <div class="te-panel te-inspector hidden" id="te-inspector"></div>
    <div class="te-panel te-draw-panel hidden" id="te-draw-panel"></div>
    <div class="te-panel te-sticker-panel hidden" id="te-sticker-panel">
      <div class="te-panel-title">이모티콘</div>
      <input type="search" class="te-emoji-search" id="te-emoji-search" placeholder="검색 (하트, 고양이, 커피…)" />
      <div class="te-emoji-cats" id="te-emoji-cats"></div>
      <div class="te-emoji-grid" id="te-emoji-grid"></div>
    </div>
    <button type="button" class="te-use-default" id="te-use-default" title="꾸민 내용은 저장되고, 기본 위젯 모습으로 돌아갑니다">
      ${ICONS.widget}
      <span>기본 위젯으로</span>
    </button>
    <button type="button" class="te-save" id="te-save">완료</button>
    <input type="file" id="te-file-input" accept="image/*" hidden />
  `;
  document.body.appendChild(overlay);

  workspace = overlay.querySelector('#te-workspace');
  stage = overlay.querySelector('#te-stage');
  worldEl = overlay.querySelector('#te-world');
  objectsLayer = overlay.querySelector('#te-objects');
  frameEl = overlay.querySelector('#te-frame');
  drawCanvas = overlay.querySelector('#te-draw-canvas');
  drawCtx = drawCanvas.getContext('2d');
  fileInput = overlay.querySelector('#te-file-input');
  inspectorEl = overlay.querySelector('#te-inspector');
  drawPanelEl = overlay.querySelector('#te-draw-panel');
  stickerPanelEl = overlay.querySelector('#te-sticker-panel');
  emojiGridEl = overlay.querySelector('#te-emoji-grid');
  emojiCatsEl = overlay.querySelector('#te-emoji-cats');
  emojiSearchEl = overlay.querySelector('#te-emoji-search');

  overlay.querySelector('#te-close').addEventListener('click', closeThumbnailEditor);
  
  overlay.querySelector('#crop-zoom-in').addEventListener('click', () => {
    if (project && project.objects.length > 0) {
      const obj = project.objects[0];
      const scale = 1.1;
      const oldW = obj.width;
      const oldH = obj.height;
      obj.width *= scale;
      obj.height *= scale;
      obj.x -= (obj.width - oldW) / 2;
      obj.y -= (obj.height - oldH) / 2;
      renderAll();
    }
  });

  overlay.querySelector('#crop-zoom-out').addEventListener('click', () => {
    if (project && project.objects.length > 0) {
      const obj = project.objects[0];
      const scale = 1 / 1.1;
      const oldW = obj.width;
      const oldH = obj.height;
      obj.width *= scale;
      obj.height *= scale;
      obj.x -= (obj.width - oldW) / 2;
      obj.y -= (obj.height - oldH) / 2;
      renderAll();
    }
  });

  workspace.addEventListener('wheel', (e) => {
    if (project && project.objects.length > 0) {
      e.preventDefault();
      const obj = project.objects[0];
      const scale = Math.exp(-e.deltaY * 0.002);
      const oldW = obj.width;
      const oldH = obj.height;
      obj.width *= scale;
      obj.height *= scale;
      obj.x -= (obj.width - oldW) / 2;
      obj.y -= (obj.height - oldH) / 2;
      renderAll();
    }
  }, { passive: false });

  let initialPinchDistance = null;
  let initialPinchWidth = null;
  let initialPinchHeight = null;
  let initialPinchX = null;
  let initialPinchY = null;

  workspace.addEventListener('touchstart', (e) => {
    if (e.touches.length === 2 && project && project.objects.length > 0) {
      e.preventDefault();
      dragSession = null;
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      initialPinchDistance = Math.hypot(dx, dy);
      const obj = project.objects[0];
      initialPinchWidth = obj.width;
      initialPinchHeight = obj.height;
      initialPinchX = obj.x;
      initialPinchY = obj.y;
    }
  }, { passive: false });

  workspace.addEventListener('touchmove', (e) => {
    if (e.touches.length === 2 && initialPinchDistance !== null && project && project.objects.length > 0) {
      e.preventDefault();
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.hypot(dx, dy);
      const scale = dist / initialPinchDistance;
      const obj = project.objects[0];
      obj.width = initialPinchWidth * scale;
      obj.height = initialPinchHeight * scale;
      obj.x = initialPinchX - (obj.width - initialPinchWidth) / 2;
      obj.y = initialPinchY - (obj.height - initialPinchHeight) / 2;
      renderAll();
    }
  }, { passive: false });

  workspace.addEventListener('touchend', (e) => {
    if (e.touches.length < 2) {
      initialPinchDistance = null;
    }
  });

  overlay.querySelector('#te-save').addEventListener('click', () => saveAndClose(true));
  overlay.querySelector('#te-use-default').addEventListener('click', () => saveAndClose(false));
  overlay.querySelectorAll('[data-te-tool]').forEach((btn) => {
    btn.addEventListener('click', () => onToolClick(btn.dataset.teTool));
  });
  emojiSearchEl.addEventListener('input', () => {
    emojiQuery = emojiSearchEl.value;
    renderEmojiGrid();
  });
  emojiCatsEl.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-emoji-cat]');
    if (!btn) return;
    emojiCategoryId = btn.dataset.emojiCat;
    emojiQuery = '';
    if (emojiSearchEl) emojiSearchEl.value = '';
    renderEmojiCats();
    renderEmojiGrid();
  });
  emojiGridEl.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-emoji]');
    if (!btn) return;
    addEmojiObject(btn.dataset.emoji);
  });
  fileInput.addEventListener('change', onPhotoChosen);
  workspace.addEventListener('pointerdown', onWorkspacePointerDown);
  drawCanvas.addEventListener('pointerdown', onDrawPointerDown);
  window.addEventListener('resize', onEditorResize);
  document.addEventListener('keydown', onEditorKeydown);

  return overlay;
}


export function initThumbnailEditor() {
  if (bound) return;
  bound = true;
  ensureOverlay();
}


/* ── Open / close ────────────────────────────────────── */
export function openThumbnailEditor(widgetId) {
  const widget = findWidgetById(widgetId);
  if (!widget) {
    showToast('위젯을 찾을 수 없습니다.');
    return;
  }

  closeTodoDetailPanel?.();
  ensureOverlay();

  editingWidgetId = widget.id;
  const size = getWidgetPixelSize(widget);
  project = adaptProject(widget.thumbnail?.project, size.width, size.height);
  selectedId = null;
  tool = 'select';
  currentStroke = null;
  dragSession = null;

  const isEmpty = project.objects.length === 0 && project.drawing.strokes.length === 0;
  const baseImage = widget.thumbnail?.image || widget.imageData;
  
  if (isEmpty && baseImage) {
    const img = new Image();
    img.onload = () => {
      const width = img.naturalWidth || size.width;
      const height = img.naturalHeight || size.height;
      const maxW = project.frameWidth;
      const maxH = project.frameHeight;
      const scale = Math.max(maxW / width, maxH / height);
      const w = width * scale;
      const h = height * scale;
      project.objects.push({
        id: genId('img'),
        type: 'image',
        x: (project.frameWidth - w) / 2,
        y: (project.frameHeight - h) / 2,
        width: w,
        height: h,
        rotation: 0,
        zIndex: nextZ(),
        src: baseImage
      });
      renderAll();
    };
    img.src = baseImage;
  }

  overlay.classList.remove('hidden');
  layoutStage();
  renderAll();
  setTool('select');
  updateEditorActionLabels(widget);
}


export function closeThumbnailEditor() {
  if (!overlay || overlay.classList.contains('hidden')) return;
  overlay.classList.add('hidden');
  editingWidgetId = null;
  project = null;
  selectedId = null;
  tool = 'select';
  currentStroke = null;
  dragSession = null;
  overlay.classList.remove('is-drawing');
  overlay.classList.remove('is-erasing');
}


function onEditorResize() {
  if (!overlay || overlay.classList.contains('hidden') || !project) return;
  layoutStage();
  renderAll();
}


function onEditorKeydown(e) {
  if (!overlay || overlay.classList.contains('hidden')) return;
  if (e.key === 'Escape') {
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) return;
    closeThumbnailEditor();
    return;
  }
  if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId) {
    if (['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) return;
    e.preventDefault();
    removeSelected();
  }
}


/* ── Layout ──────────────────────────────────────────── */
function layoutStage() {
  const frameW = project.frameWidth;
  const frameH = project.frameHeight;
  const worldW = frameW * WORLD_MULTIPLIER;
  const worldH = frameH * WORLD_MULTIPLIER;
  frameLeft = frameW;
  frameTop = frameH;

  const maxW = Math.min(window.innerWidth * 0.5, 560);
  const maxH = Math.min(window.innerHeight * 0.55, 500);
  viewScale = Math.max(0.7, Math.min(maxW / frameW, maxH / frameH, 3.2));

  stage.style.width = `${worldW * viewScale}px`;
  stage.style.height = `${worldH * viewScale}px`;

  frameEl.style.left = `${frameLeft * viewScale}px`;
  frameEl.style.top = `${frameTop * viewScale}px`;
  frameEl.style.width = `${frameW * viewScale}px`;
  frameEl.style.height = `${frameH * viewScale}px`;

  drawCanvas.width = worldW;
  drawCanvas.height = worldH;
  drawCanvas.style.width = '100%';
  drawCanvas.style.height = '100%';
}


function screenToFrame(clientX, clientY) {
  const rect = stage.getBoundingClientRect();
  const worldX = (clientX - rect.left) / viewScale;
  const worldY = (clientY - rect.top) / viewScale;
  return {
    x: worldX - frameLeft,
    y: worldY - frameTop,
  };
}


/* ── Render ──────────────────────────────────────────── */
function renderAll() {
  renderObjects();
  renderDrawing();
  renderInspector();
  renderDrawPanel();
}


function renderObjects() {
  objectsLayer.replaceChildren();
  const sorted = [...project.objects].sort((a, b) => (a.zIndex || 0) - (b.zIndex || 0));
  sorted.forEach((obj) => {
    const el = document.createElement('div');
    el.className = 'te-object' + (obj.id === selectedId ? ' is-selected' : '');
    el.dataset.objectId = obj.id;
    el.style.left = `${(frameLeft + obj.x) * viewScale}px`;
    el.style.top = `${(frameTop + obj.y) * viewScale}px`;
    el.style.width = `${obj.width * viewScale}px`;
    el.style.height = `${obj.height * viewScale}px`;
    el.style.transform = `rotate(${obj.rotation || 0}deg)`;
    el.style.zIndex = String(obj.zIndex || 1);

    if (obj.type === 'image') {
      const img = document.createElement('img');
      img.src = obj.src;
      img.alt = '';
      img.draggable = false;
      el.appendChild(img);
    } else if (obj.type === 'text') {
      const text = document.createElement('div');
      text.className = 'te-text';
      text.textContent = obj.text || '';
      text.style.fontFamily = fontFamilyById(obj.fontId);
      text.style.fontSize = `${(obj.fontSize || 28) * viewScale}px`;
      text.style.color = obj.color || '#2C2C35';
      el.appendChild(text);
    } else if (obj.type === 'emoji') {
      const emoji = document.createElement('div');
      emoji.className = 'te-emoji';
      emoji.textContent = obj.char || '';
      emoji.style.fontFamily = EMOJI_FONT;
      emoji.style.fontSize = `${Math.min(obj.width, obj.height) * viewScale * 0.86}px`;
      el.appendChild(emoji);
    }

    if (obj.id === selectedId && tool !== 'draw') {
      ['nw', 'ne', 'sw', 'se'].forEach((corner) => {
        const handle = document.createElement('div');
        handle.className = `te-handle te-handle-${corner}`;
        handle.dataset.handle = corner;
        el.appendChild(handle);
      });
      const rotate = document.createElement('div');
      rotate.className = 'te-handle te-handle-rotate';
      rotate.dataset.handle = 'rotate';
      el.appendChild(rotate);
    }

    el.addEventListener('pointerdown', (e) => onObjectPointerDown(e, obj));
    objectsLayer.appendChild(el);
  });
}


function renderDrawing() {
  if (!drawCtx || !project) return;
  drawCtx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);
  replayStrokes(drawCtx, project.drawing.strokes, currentStroke, frameLeft, frameTop, 1);
}


function replayStrokes(ctx, strokes, extraStroke, ox, oy, scale) {
  (strokes || []).forEach((stroke) => drawStroke(ctx, stroke, ox, oy, scale));
  if (extraStroke) drawStroke(ctx, extraStroke, ox, oy, scale);
}


function drawStroke(ctx, stroke, ox, oy, scale) {
  const pts = stroke.points;
  if (!pts || pts.length === 0) return;
  ctx.save();
  if (stroke.mode === 'erase') {
    ctx.globalCompositeOperation = 'destination-out';
    ctx.strokeStyle = 'rgba(0,0,0,1)';
  } else {
    ctx.globalCompositeOperation = 'source-over';
    ctx.strokeStyle = stroke.color || '#2C2C35';
  }
  ctx.lineWidth = stroke.width * scale;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo((pts[0].x + ox) * scale, (pts[0].y + oy) * scale);
  for (let i = 1; i < pts.length; i++) {
    ctx.lineTo((pts[i].x + ox) * scale, (pts[i].y + oy) * scale);
  }
  if (pts.length === 1) {
    ctx.lineTo((pts[0].x + ox) * scale + 0.01, (pts[0].y + oy) * scale);
  }
  ctx.stroke();
  ctx.restore();
}


function renderInspector() {
  const obj = project.objects.find((o) => o.id === selectedId);
  if (!obj || tool === 'draw') {
    inspectorEl.classList.add('hidden');
    inspectorEl.innerHTML = '';
    return;
  }

  inspectorEl.classList.remove('hidden');
  if (obj.type === 'text') {
    inspectorEl.innerHTML = `
      <div class="te-field">
        <label>내용</label>
        <input type="text" id="te-text-input" value="${escapeAttr(obj.text || '')}" />
      </div>
      <div class="te-field">
        <label>폰트</label>
        <select id="te-font-select">
          ${THUMBNAIL_FONTS.map((f) => `<option value="${f.id}" ${f.id === obj.fontId ? 'selected' : ''}>${f.label}</option>`).join('')}
        </select>
      </div>
      <div class="te-field">
        <label>크기</label>
        <input type="range" id="te-font-size" min="12" max="96" value="${obj.fontSize || 28}" />
      </div>
      <div class="te-swatches" id="te-text-colors">${swatchButtons(obj.color)}</div>
      ${layerButtons()}
    `;
    inspectorEl.querySelector('#te-text-input').addEventListener('input', (e) => {
      obj.text = e.target.value;
      renderObjects();
    });
    inspectorEl.querySelector('#te-font-select').addEventListener('change', (e) => {
      obj.fontId = e.target.value;
      renderObjects();
    });
    inspectorEl.querySelector('#te-font-size').addEventListener('input', (e) => {
      obj.fontSize = Number(e.target.value);
      renderObjects();
    });
    bindSwatches(inspectorEl.querySelector('#te-text-colors'), (color) => {
      obj.color = color;
      renderObjects();
      renderInspector();
    });
  } else if (obj.type === 'emoji') {
    inspectorEl.innerHTML = `
      <div class="te-emoji-preview" style="font-family:${EMOJI_FONT}">${obj.char || ''}</div>
      ${layerButtons()}
    `;
  } else {
    inspectorEl.innerHTML = `
      <div class="te-panel-title" style="margin:0">사진</div>
      ${layerButtons()}
    `;
  }
  bindLayerButtons();
}


function layerButtons() {
  return `
    <button type="button" class="te-icon-btn" data-te-layer="forward">앞으로</button>
    <button type="button" class="te-icon-btn" data-te-layer="back">뒤로</button>
    <button type="button" class="te-icon-btn danger" data-te-layer="delete">삭제</button>
  `;
}


function bindLayerButtons() {
  inspectorEl.querySelector('[data-te-layer="forward"]')?.addEventListener('click', bringForward);
  inspectorEl.querySelector('[data-te-layer="back"]')?.addEventListener('click', sendBackward);
  inspectorEl.querySelector('[data-te-layer="delete"]')?.addEventListener('click', removeSelected);
}


function renderDrawPanel() {
  if (tool !== 'draw') {
    drawPanelEl.classList.add('hidden');
    return;
  }
  drawPanelEl.classList.remove('hidden');
  drawPanelEl.innerHTML = `
    <div class="te-draw-modes">
      <button type="button" class="te-draw-mode ${drawMode === 'pen' ? 'is-active' : ''}" data-draw-mode="pen">펜</button>
      <button type="button" class="te-draw-mode ${drawMode === 'erase' ? 'is-active' : ''}" data-draw-mode="erase">지우개</button>
    </div>
    ${drawMode === 'pen' ? `<div class="te-swatches">${swatchButtons(penColor)}</div>` : '<p class="te-sticker-placeholder">그림을 문질러 지울 수 있습니다.</p>'}
    <div class="te-pen-sizes">
      ${PEN_SIZES.map((size) => `
        <button type="button" class="te-pen-size ${size === penWidth ? 'is-active' : ''}" data-pen-size="${size}" title="${size}px">
          <span class="te-pen-dot" style="width:${Math.min(size + 4, 16)}px;height:${Math.min(size + 4, 16)}px;color:${drawMode === 'erase' ? '#6B7280' : penColor}"></span>
        </button>
      `).join('')}
    </div>
  `;
  bindSwatches(drawPanelEl.querySelector('.te-swatches'), (color) => {
    penColor = color;
    drawMode = 'pen';
    renderDrawPanel();
  });
  drawPanelEl.querySelectorAll('[data-draw-mode]').forEach((btn) => {
    btn.addEventListener('click', () => {
      drawMode = btn.dataset.drawMode === 'erase' ? 'erase' : 'pen';
      overlay.classList.toggle('is-erasing', drawMode === 'erase');
      renderDrawPanel();
    });
  });
  drawPanelEl.querySelectorAll('[data-pen-size]').forEach((btn) => {
    btn.addEventListener('click', () => {
      penWidth = Number(btn.dataset.penSize);
      renderDrawPanel();
    });
  });
}


function swatchButtons(active) {
  return COLOR_SWATCHES.map((color) => `
    <button type="button" class="te-swatch ${color.toLowerCase() === (active || '').toLowerCase() ? 'is-active' : ''}"
      data-color="${color}" style="background:${color}" title="${color}"></button>
  `).join('');
}


function bindSwatches(root, onPick) {
  root?.querySelectorAll('[data-color]').forEach((btn) => {
    btn.addEventListener('click', () => onPick(btn.dataset.color));
  });
}


function escapeAttr(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;');
}


/* ── Tools ───────────────────────────────────────────── */
function setTool(next) {
  tool = next;
  overlay.classList.toggle('is-drawing', next === 'draw');
  overlay.classList.toggle('is-erasing', next === 'draw' && drawMode === 'erase');
  overlay.querySelectorAll('[data-te-tool]').forEach((btn) => {
    btn.classList.toggle('is-active', btn.dataset.teTool === next);
  });
  stickerPanelEl.classList.toggle('hidden', next !== 'sticker');
  if (next === 'draw') selectedId = null;
  if (next === 'sticker') {
    renderEmojiCats();
    renderEmojiGrid();
    requestAnimationFrame(() => emojiSearchEl?.focus());
  }
  renderAll();
}


function onToolClick(name) {
  if (name === 'text') {
    addTextObject();
    setTool('select');
    return;
  }
  if (name === 'photo') {
    fileInput.value = '';
    fileInput.click();
    setTool('select');
    return;
  }
  if (name === 'sticker') {
    setTool(tool === 'sticker' ? 'select' : 'sticker');
    return;
  }
  if (name === 'draw') {
    setTool(tool === 'draw' ? 'select' : 'draw');
  }
}


function addTextObject() {
  const width = Math.min(project.frameWidth * 0.7, 220);
  const height = 48;
  const obj = {
    id: genId('txt'),
    type: 'text',
    x: (project.frameWidth - width) / 2,
    y: (project.frameHeight - height) / 2,
    width,
    height,
    rotation: 0,
    zIndex: nextZ(),
    text: '텍스트',
    fontId: 'inter',
    fontSize: 28,
    color: '#2C2C35',
  };
  project.objects.push(obj);
  selectedId = obj.id;
  renderAll();
}


function addEmojiObject(char) {
  if (!char || !project) return;
  const size = Math.max(40, Math.min(project.frameWidth, project.frameHeight) * 0.38);
  const stack = project.objects.filter((o) => o.type === 'emoji').length;
  const offset = (stack % 7) * 10;
  const obj = {
    id: genId('emo'),
    type: 'emoji',
    x: (project.frameWidth - size) / 2 + offset,
    y: (project.frameHeight - size) / 2 + offset,
    width: size,
    height: size,
    rotation: 0,
    zIndex: nextZ(),
    char,
  };
  project.objects.push(obj);
  selectedId = obj.id;
  rememberEmoji(char);
  renderEmojiCats();
  renderEmojiGrid();
  renderObjects();
  renderInspector();
}


function renderEmojiCats() {
  if (!emojiCatsEl) return;
  const recent = getRecentEmojis();
  const cats = [
    { id: 'recent', label: '최근' },
    ...EMOJI_CATEGORIES.map((cat) => ({ id: cat.id, label: cat.label })),
  ];
  emojiCatsEl.innerHTML = cats.map((cat) => `
    <button type="button" class="te-emoji-cat ${cat.id === emojiCategoryId ? 'is-active' : ''}"
      data-emoji-cat="${cat.id}" ${cat.id === 'recent' && recent.length === 0 ? 'disabled' : ''}>${cat.label}</button>
  `).join('');
}


function renderEmojiGrid() {
  if (!emojiGridEl) return;
  const query = emojiQuery.trim();
  let items;
  if (query) {
    items = searchEmojis(query);
  } else if (emojiCategoryId === 'recent') {
    items = getRecentEmojis().map((char) => ({ char }));
  } else {
    items = EMOJI_CATEGORIES.find((cat) => cat.id === emojiCategoryId)?.items || EMOJI_CATEGORIES[0].items;
  }

  if (!items.length) {
    emojiGridEl.innerHTML = '<p class="te-sticker-placeholder">해당하는 이모티콘이 없습니다.</p>';
    return;
  }

  emojiGridEl.innerHTML = items.map((item) => `
    <button type="button" class="te-emoji-btn" data-emoji="${item.char}" title="${item.char}">${item.char}</button>
  `).join('');
}


async function onPhotoChosen(e) {
  const file = e.target.files?.[0];
  e.target.value = '';
  if (!file) return;
  try {
    const { src, width, height } = await readImageFile(file);
    // Scale the image to COVER the frame so the user can pan to specify which part to show
    const scale = Math.max(project.frameWidth / width, project.frameHeight / height);
    const w = width * scale;
    const h = height * scale;
    const obj = {
      id: genId('img'),
      type: 'image',
      x: (project.frameWidth - w) / 2,
      y: (project.frameHeight - h) / 2,
      width: w,
      height: h,
      rotation: 0,
      zIndex: nextZ(),
      src,
    };
    project.objects.push(obj);
    selectedId = obj.id;
    renderAll();
  } catch {
    showToast('사진을 불러오지 못했습니다.');
  }
}


function readImageFile(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      let w = img.naturalWidth;
      let h = img.naturalHeight;
      if (w > PHOTO_MAX_EDGE || h > PHOTO_MAX_EDGE) {
        const s = PHOTO_MAX_EDGE / Math.max(w, h);
        w = Math.round(w * s);
        h = Math.round(h * s);
      }
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      resolve({ src: canvas.toDataURL('image/jpeg', 0.86), width: w, height: h });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('image'));
    };
    img.src = url;
  });
}


function bringForward() {
  const obj = project.objects.find((o) => o.id === selectedId);
  if (!obj) return;
  obj.zIndex = nextZ();
  renderObjects();
}


function sendBackward() {
  const obj = project.objects.find((o) => o.id === selectedId);
  if (!obj) return;
  const min = project.objects.reduce((m, o) => Math.min(m, o.zIndex || 0), obj.zIndex || 0);
  obj.zIndex = min - 1;
  renderObjects();
}


function removeSelected() {
  if (!selectedId) return;
  project.objects = project.objects.filter((o) => o.id !== selectedId);
  selectedId = null;
  renderAll();
}


/* ── Pointer: objects ────────────────────────────────── */
function onObjectPointerDown(e, obj) {
  if (tool === 'draw') return;
  e.stopPropagation();
  e.preventDefault();
  selectedId = obj.id;
  renderAll();

  const handle = e.target.closest('[data-handle]')?.dataset.handle || 'move';
  const start = screenToFrame(e.clientX, e.clientY);
  const cx = obj.x + obj.width / 2;
  const cy = obj.y + obj.height / 2;

  dragSession = {
    type: handle === 'rotate' ? 'rotate' : handle === 'move' ? 'move' : 'scale',
    objectId: obj.id,
    startX: start.x,
    startY: start.y,
    orig: {
      x: obj.x,
      y: obj.y,
      width: obj.width,
      height: obj.height,
      rotation: obj.rotation || 0,
      fontSize: obj.fontSize || 28,
    },
    centerX: cx,
    centerY: cy,
    startDist: Math.hypot(start.x - cx, start.y - cy) || 1,
  };

  const pointerId = e.pointerId;
  const onMove = (ev) => {
    if (ev.pointerId !== pointerId) return;
    ev.preventDefault();
    applyDrag(screenToFrame(ev.clientX, ev.clientY));
  };
  const onUp = (ev) => {
    if (ev.pointerId !== pointerId) return;
    dragSession = null;
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    renderAll();
  };
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
}


function applyDrag(point) {
  if (!dragSession) return;
  const obj = project.objects.find((o) => o.id === dragSession.objectId);
  if (!obj) return;
  const { orig, type } = dragSession;

  if (type === 'move') {
    obj.x = orig.x + (point.x - dragSession.startX);
    obj.y = orig.y + (point.y - dragSession.startY);
  } else if (type === 'rotate') {
    obj.rotation = Math.atan2(point.y - dragSession.centerY, point.x - dragSession.centerX) * (180 / Math.PI) + 90;
  } else if (type === 'scale') {
    const dist = Math.hypot(point.x - dragSession.centerX, point.y - dragSession.centerY);
    const minScale = obj.type === 'emoji' ? 0.04 : 0.12;
    const minSize = obj.type === 'emoji' ? MIN_EMOJI_SIZE : MIN_OBJECT_SIZE;
    const scale = Math.max(minScale, dist / dragSession.startDist);
    const width = Math.max(minSize, orig.width * scale);
    const height = Math.max(minSize, orig.height * scale);
    obj.width = width;
    obj.height = height;
    obj.x = dragSession.centerX - width / 2;
    obj.y = dragSession.centerY - height / 2;
    if (obj.type === 'text') {
      obj.fontSize = Math.max(10, orig.fontSize * scale);
    }
  }
  renderObjects();
}


function onWorkspacePointerDown(e) {
  if (tool === 'draw') return;
  if (e.target.closest('.te-object') || e.target.closest('.te-panel') || e.target.closest('.te-tool')) return;
  selectedId = null;
  renderAll();
}


/* ── Drawing ─────────────────────────────────────────── */
function onDrawPointerDown(e) {
  if (tool !== 'draw') return;
  e.preventDefault();
  e.stopPropagation();
  const point = screenToFrame(e.clientX, e.clientY);
  currentStroke = {
    id: genId('ink'),
    mode: drawMode === 'erase' ? 'erase' : 'pen',
    color: penColor,
    width: penWidth,
    points: [point],
  };
  const pointerId = e.pointerId;
  drawCanvas.setPointerCapture(pointerId);

  const onMove = (ev) => {
    if (ev.pointerId !== pointerId || !currentStroke) return;
    const next = screenToFrame(ev.clientX, ev.clientY);
    const last = currentStroke.points[currentStroke.points.length - 1];
    if (Math.hypot(next.x - last.x, next.y - last.y) < 0.6) return;
    currentStroke.points.push(next);
    renderDrawing();
  };
  const onUp = (ev) => {
    if (ev.pointerId !== pointerId) return;
    if (currentStroke) {
      project.drawing.strokes.push(currentStroke);
      currentStroke = null;
      renderDrawing();
    }
    drawCanvas.removeEventListener('pointermove', onMove);
    drawCanvas.removeEventListener('pointerup', onUp);
  };
  drawCanvas.addEventListener('pointermove', onMove);
  drawCanvas.addEventListener('pointerup', onUp);
}


/* ── Export / save ───────────────────────────────────── */
function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}


function wrapTextLines(ctx, text, maxWidth) {
  const lines = [];
  const paragraphs = String(text || '').split('\n');
  paragraphs.forEach((para, pIdx) => {
    if (!para) {
      lines.push('');
      return;
    }
    let line = '';
    for (const ch of para) {
      const test = line + ch;
      if (ctx.measureText(test).width > maxWidth && line) {
        lines.push(line);
        line = ch;
      } else {
        line = test;
      }
    }
    lines.push(line);
    if (pIdx < paragraphs.length - 1 && para) {
      /* paragraph already pushed */
    }
  });
  return lines;
}


async function exportFrameImage() {
  const w = project.frameWidth;
  const h = project.frameHeight;
  const scale = 2;
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(w * scale));
  canvas.height = Math.max(1, Math.round(h * scale));
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, canvas.width, canvas.height);
  ctx.clip();

  const sorted = [...project.objects].sort((a, b) => (a.zIndex || 0) - (b.zIndex || 0));
  for (const obj of sorted) {
    ctx.save();
    const cx = (obj.x + obj.width / 2) * scale;
    const cy = (obj.y + obj.height / 2) * scale;
    ctx.translate(cx, cy);
    ctx.rotate((obj.rotation || 0) * Math.PI / 180);
    const ow = obj.width * scale;
    const oh = obj.height * scale;
    if (obj.type === 'image' && obj.src) {
      try {
        const img = await loadImage(obj.src);
        ctx.drawImage(img, -ow / 2, -oh / 2, ow, oh);
      } catch { /* skip broken image */ }
    } else if (obj.type === 'text') {
      const fontSize = (obj.fontSize || 28) * scale;
      ctx.font = `${fontSize}px ${fontFamilyById(obj.fontId)}`;
      ctx.fillStyle = obj.color || '#2C2C35';
      ctx.textBaseline = 'top';
      const lines = wrapTextLines(ctx, obj.text || '', ow);
      const lineHeight = fontSize * 1.25;
      lines.forEach((line, i) => {
        ctx.fillText(line, -ow / 2, -oh / 2 + i * lineHeight);
      });
    } else if (obj.type === 'emoji') {
      const fontSize = Math.min(ow, oh) * 0.86;
      ctx.font = `${fontSize}px ${EMOJI_FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(obj.char || '', 0, 0);
    }
    ctx.restore();
  }

  ctx.restore();

  const ink = document.createElement('canvas');
  ink.width = canvas.width;
  ink.height = canvas.height;
  const inkCtx = ink.getContext('2d');
  replayStrokes(inkCtx, project.drawing.strokes, null, 0, 0, scale);
  ctx.drawImage(ink, 0, 0);

  return canvas.toDataURL('image/png');
}


async function saveAndClose(enabled) {
  const widget = findWidgetById(editingWidgetId);
  if (!widget || !project) {
    closeThumbnailEditor();
    return;
  }

  const saveBtn = overlay.querySelector('#te-save');
  const defaultBtn = overlay.querySelector('#te-use-default');
  saveBtn.disabled = true;
  if (defaultBtn) defaultBtn.disabled = true;
  try {
    let image = widget.thumbnail?.image || '';
    try {
      image = await exportFrameImage();
    } catch {
      /* keep previously saved image so decorations are not lost */
    }

    widget.thumbnail = {
      image,
      project: clone(project),
      enabled,
    };
    persistWidget(widget);
    refreshWidgetCover(widget);
    showToast(enabled
      ? '꾸민 썸네일을 적용했습니다.'
      : '기본 위젯으로 표시합니다. 꾸민 내용은 그대로 저장됩니다.');
    closeThumbnailEditor();
  } catch (err) {
    console.error(err);
    showToast('저장 용량이 부족하거나 저장에 실패했습니다.');
  } finally {
    saveBtn.disabled = false;
    if (defaultBtn) defaultBtn.disabled = false;
  }
}


function updateEditorActionLabels(widget) {
  const saveBtn = overlay?.querySelector('#te-save');
  const defaultBtn = overlay?.querySelector('#te-use-default');
  if (!saveBtn) return;
  const showingCustom = isThumbnailVisible(widget);
  saveBtn.textContent = showingCustom ? '완료' : '꾸민 썸네일 적용';
  if (defaultBtn) {
    defaultBtn.classList.toggle('is-current', !showingCustom);
  }
}


function persistWidget(widget) {
  let found = false;
  const pages = state.currentDiary?.pages;
  if (Array.isArray(pages)) {
    for (const page of pages) {
      if (!page || !Array.isArray(page.widgets)) continue;
      const idx = page.widgets.findIndex((existing) => existing.id === widget.id);
      if (idx >= 0) {
        page.widgets[idx] = widget;
        found = true;
        break;
      }
    }
  }
  if (!found) {
    const page = pages?.[state.currentSpreadIndex ?? 0];
    if (page) {
      if (!Array.isArray(page.widgets)) page.widgets = [];
      page.widgets.push(widget);
    }
  }

  const stateIdx = state.widgets.findIndex((existing) => existing.id === widget.id);
  if (stateIdx >= 0) state.widgets[stateIdx] = widget;

  saveEntries();
}
