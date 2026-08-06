/* ═══════════════════════════════════════════════════════════
   MEMENTO DIARY — Widget Placement, Rendering & Removal
   ═══════════════════════════════════════════════════════════ */

import { state } from './state.js';
import { dom } from './dom.js';
import { showToast } from './utils.js';
import { checkPlacement, markCellsOccupied, freeCells, clearCellHighlights, buildLegoGrid, reserveMapArea, highlightPlacementPreview } from './grid.js';
import { buildTodoWidgetShell, ensureTodoWidgetData, bindTodoWidgetEvents, refreshTodoTabs, openTodoResizeSheet } from './todo.js';
import { buildMemoWidgetShell, ensureMemoWidgetData, initMemoSessionState, bindMemoWidgetEvents, renderMemoPreview, closeMemoFullscreen } from './memo.js';


const TODO_DRAG_HOLD_MS = 400;
const TODO_DRAG_MOVE_THRESHOLD = 8;


function getGridMetrics() {
  const cellSize = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--grid-cell'));
  const gap = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--grid-gap'));
  return { cellSize, gap, total: cellSize + gap };
}


function applyWidgetGridPosition(el, w) {
  const { cellSize, gap, total } = getGridMetrics();
  el.style.position = 'absolute';
  el.style.left = `${w.col * total}px`;
  el.style.top = `${w.row * total}px`;
  el.style.width = `${w.cols * cellSize + (w.cols - 1) * gap}px`;
  el.style.height = `${w.rows * cellSize + (w.rows - 1) * gap}px`;
  el.style.transform = '';
  el.style.zIndex = '';
  el.style.transition = '';
  el.style.userSelect = '';
}


function isTodoWidgetDragTarget(target) {
  if (target.closest('.todo-widget-header, .todo-widget-tabs, .todo-tab')) return false;
  if (target.closest('button, input, textarea, select, a')) return false;
  if (target.closest('.todo-task-check, [data-action="toggle-task"]')) return false;
  return Boolean(target.closest('.todo-widget-body'));
}


function persistWidgetLayoutQuietly() {
  import('./editor.js').then(({ persistWidgetLayout }) => persistWidgetLayout());
}


function bindTodoWidgetPointerDrag(el, w) {
  if (el.dataset.todoDragBound) return;
  el.dataset.todoDragBound = '1';

  let holdTimer = null;
  let session = null;

  const clearHoldTimer = () => {
    if (holdTimer) {
      clearTimeout(holdTimer);
      holdTimer = null;
    }
  };

  const resetSession = () => {
    clearHoldTimer();
    if (session?.pointerId != null) {
      try {
        el.releasePointerCapture(session.pointerId);
      } catch {
        /* ignore */
      }
    }
    session = null;
    el.classList.remove('placed-widget--hold-armed', 'placed-widget--dragging');
    el.style.userSelect = '';
  };

  const clampGridPosition = (left, top) => {
    const { total } = getGridMetrics();
    const maxLeft = Math.max(0, (state.gridCols - w.cols) * total);
    const maxTop = Math.max(0, (state.gridRows - w.rows) * total);
    return {
      left: Math.max(0, Math.min(left, maxLeft)),
      top: Math.max(0, Math.min(top, maxTop)),
    };
  };

  const gridCoordsFromPixels = (left, top) => {
    const { total } = getGridMetrics();
    let col = Math.round(left / total);
    let row = Math.round(top / total);
    col = Math.max(0, Math.min(col, state.gridCols - w.cols));
    row = Math.max(0, Math.min(row, state.gridRows - w.rows));
    return { row, col };
  };

  const beginDragging = () => {
    if (!session || session.phase === 'dragging') return;

    session.phase = 'dragging';
    session.didDrag = true;
    el.classList.remove('placed-widget--hold-armed');
    el.classList.add('placed-widget--dragging');
    el.style.transition = 'none';
    el.style.userSelect = 'none';
    el.style.zIndex = '50';

    session.origRow = w.row;
    session.origCol = w.col;
    freeCells(w.id);
  };

  const updateDragging = (clientX, clientY) => {
    if (!session || session.phase !== 'dragging') return;

    const gridRect = dom.legoGrid.getBoundingClientRect();
    let left = clientX - gridRect.left - session.offsetX;
    let top = clientY - gridRect.top - session.offsetY;
    ({ left, top } = clampGridPosition(left, top));

    el.style.left = `${left}px`;
    el.style.top = `${top}px`;

    const { row, col } = gridCoordsFromPixels(left, top);
    session.previewRow = row;
    session.previewCol = col;
    highlightPlacementPreview(row, col, w.cols, w.rows, w.id);
  };

  const finishDragging = () => {
    if (!session) return;

    const { origRow, origCol, didDrag } = session;
    clearCellHighlights();

    if (session.phase === 'dragging') {
      let nextRow = session.previewRow ?? session.origRow;
      let nextCol = session.previewCol ?? session.origCol;
      ({ row: nextRow, col: nextCol } = gridCoordsFromPixels(
        parseFloat(el.style.left) || 0,
        parseFloat(el.style.top) || 0,
      ));

      if (checkPlacement(nextRow, nextCol, w.cols, w.rows, w.id)) {
        w.row = nextRow;
        w.col = nextCol;
      } else {
        w.row = origRow;
        w.col = origCol;
        showToast('현재 위치에서는 배치할 수 없습니다.');
      }

      markCellsOccupied(w.row, w.col, w.cols, w.rows, w.id);
      applyWidgetGridPosition(el, w);

      if (didDrag) {
        el.dataset.suppressTodoClick = '1';
        persistWidgetLayoutQuietly();
      }
    }

    resetSession();
  };

  el.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    if (state.placementMode) return;
    if (e.target.closest('.todo-widget-header, .todo-widget-tabs, .todo-tab, .todo-widget-resize, .todo-widget-delete, button')) return;
    if (!isTodoWidgetDragTarget(e.target)) return;

    clearHoldTimer();
    resetSession();

    const widgetRect = el.getBoundingClientRect();
    session = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      offsetX: e.clientX - widgetRect.left,
      offsetY: e.clientY - widgetRect.top,
      phase: 'pending',
      didDrag: false,
      origRow: w.row,
      origCol: w.col,
    };

    holdTimer = setTimeout(() => {
      if (!session || session.phase !== 'pending') return;
      session.phase = 'armed';
      el.classList.add('placed-widget--hold-armed');
      try {
        el.setPointerCapture(session.pointerId);
      } catch {
        /* ignore */
      }
    }, TODO_DRAG_HOLD_MS);
  });

  el.addEventListener('pointermove', (e) => {
    if (!session || e.pointerId !== session.pointerId) return;

    const dx = e.clientX - session.startX;
    const dy = e.clientY - session.startY;
    const distance = Math.hypot(dx, dy);

    if (session.phase === 'pending') {
      if (distance > TODO_DRAG_MOVE_THRESHOLD) {
        clearHoldTimer();
        resetSession();
      }
      return;
    }

    if (session.phase === 'armed') {
      if (distance > 0) {
        e.preventDefault();
        beginDragging();
        updateDragging(e.clientX, e.clientY);
      }
      return;
    }

    if (session.phase === 'dragging') {
      e.preventDefault();
      updateDragging(e.clientX, e.clientY);
    }
  });

  const endPointer = (e) => {
    if (!session || e.pointerId !== session.pointerId) return;

    clearHoldTimer();

    if (session.phase === 'armed') {
      el.dataset.suppressTodoClick = '1';
      resetSession();
      return;
    }

    if (session.phase === 'dragging') {
      e.preventDefault();
      finishDragging();
      return;
    }

    resetSession();
  };

  el.addEventListener('pointerup', endPointer);
  el.addEventListener('pointercancel', endPointer);

  el.addEventListener('dragstart', (e) => e.preventDefault());
}


function bindLegacyLongPressMove(el, w) {
  let pressTimer;
  let pressStartX = 0;
  let pressStartY = 0;
  const DRAG_CANCEL_PX = 8;

  const shouldSkipPressStart = (target) => {
    if (target.closest('button, input, textarea, select')) return true;
    if (w.type === 'memo' && target.closest('.memo-preview-open, .memo-preview-body')) return true;
    return false;
  };

  const cancelPress = () => clearTimeout(pressTimer);

  const startPress = (clientX, clientY) => {
    pressStartX = clientX;
    pressStartY = clientY;
    pressTimer = setTimeout(() => pickupWidget(w), 500);
  };

  const trackPressMove = (clientX, clientY) => {
    if (!pressTimer) return;
    const dx = clientX - pressStartX;
    const dy = clientY - pressStartY;
    if (Math.hypot(dx, dy) > DRAG_CANCEL_PX) cancelPress();
  };

  el.addEventListener('touchstart', (e) => {
    if (shouldSkipPressStart(e.target)) return;
    const touch = e.touches[0];
    if (!touch) return;
    startPress(touch.clientX, touch.clientY);
  }, { passive: true });
  el.addEventListener('touchend', cancelPress);
  el.addEventListener('touchmove', (e) => {
    const touch = e.touches[0];
    if (touch) trackPressMove(touch.clientX, touch.clientY);
  }, { passive: true });

  el.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    if (shouldSkipPressStart(e.target)) return;
    startPress(e.clientX, e.clientY);
  });
  el.addEventListener('mousemove', (e) => {
    trackPressMove(e.clientX, e.clientY);
  });
  el.addEventListener('mouseup', cancelPress);
  el.addEventListener('mouseleave', cancelPress);
}


/* ── Place Widget ────────────────────────────────────── */
export function placeWidget(row, col, wCols, wRows, imageData) {
  let widgetId = `w_${state.widgetIdCounter++}`;
  let type = 'gallery';

  if (state.movingWidget) {
    widgetId = state.movingWidget.id;
    type = state.movingWidget.type;
  } else if (state.placementType) {
    type = state.placementType;
  }

  markCellsOccupied(row, col, wCols, wRows, widgetId);

  const widgetData = {
    id: widgetId,
    type,
    row: Number(row),
    col: Number(col),
    cols: Number(wCols),
    rows: Number(wRows),
    imageData,
  };

  if (type === 'todo') {
    if (state.movingWidget) {
      ensureTodoWidgetData(state.movingWidget);
      widgetData.groups = JSON.parse(JSON.stringify(state.movingWidget.groups ?? []));
      widgetData.activeTab = state.movingWidget.activeTab ?? 'all';
      widgetData.todoSchemaVersion = state.movingWidget.todoSchemaVersion ?? 2;
    } else {
      widgetData.groups = [];
      widgetData.activeTab = 'all';
      widgetData.todoSchemaVersion = 2;
    }
  }

  if (type === 'memo') {
    if (state.movingWidget) {
      widgetData.memos = state.movingWidget.memos ?? [];
      widgetData.profile = state.movingWidget.profile
        ? { ...state.movingWidget.profile }
        : undefined;
      widgetData.sortBy = state.movingWidget.sortBy;
      widgetData.activeCategory = state.movingWidget.activeCategory;
    } else {
      widgetData.memos = [];
    }
    ensureMemoWidgetData(widgetData);
    initMemoSessionState(widgetData);
  }

  state.widgets.push(widgetData);

  renderPlacedWidget(widgetData);
}


/* ── Render Widget ───────────────────────────────────── */
export function renderPlacedWidget(w) {
  const grid = dom.legoGrid;
  const cellSize = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--grid-cell'));
  const gap = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--grid-gap'));

  const el = document.createElement('div');
  el.className = 'placed-widget';
  el.dataset.widgetId = w.id;

  const left = w.col * (cellSize + gap);
  const top = w.row * (cellSize + gap);
  const width = w.cols * cellSize + (w.cols - 1) * gap;
  const height = w.rows * cellSize + (w.rows - 1) * gap;

  el.style.left = left + 'px';
  el.style.top = top + 'px';
  el.style.width = width + 'px';
  el.style.height = height + 'px';

  if (w.type === 'todo') {
    el.classList.add('placed-widget--todo');
    el.dataset.widgetCols = String(w.cols);
    el.dataset.widgetRows = String(w.rows);
    ensureTodoWidgetData(w);
    el.innerHTML = buildTodoWidgetShell();
    refreshTodoTabs(el, w);
    bindTodoWidgetEvents(el);

    const resizeBtn = el.querySelector('.todo-widget-resize');
    if (resizeBtn) {
      resizeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        openTodoResizeSheet(w.id);
      });
    }
  } else if (w.type === 'memo') {
    el.classList.add('placed-widget--memo');
    el.dataset.widgetCols = String(w.cols);
    el.dataset.widgetRows = String(w.rows);
    ensureMemoWidgetData(w);
    initMemoSessionState(w);
    el.innerHTML = buildMemoWidgetShell();
    renderMemoPreview(el, w);
    bindMemoWidgetEvents(el);
  } else {
    el.innerHTML = `
      <img src="${w.imageData}" alt="Widget" />
      <button class="widget-delete" title="Remove widget">✕</button>
    `;
  }

  const deleteBtn = el.querySelector('.widget-delete');
  if (deleteBtn) {
    deleteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      removeWidget(w.id);
    });
  }

  // Todo: pointer drag; gallery/memo: legacy long-press pickup
  if (w.type === 'todo') {
    bindTodoWidgetPointerDrag(el, w);
  } else {
    bindLegacyLongPressMove(el, w);
  }

  // Entrance animation
  el.style.opacity = '0';
  el.style.transform = 'scale(0.8)';
  grid.appendChild(el);
  requestAnimationFrame(() => {
    el.style.transition = 'opacity 0.2s, transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1)';
    el.style.opacity = '1';
    el.style.transform = 'scale(1)';
  });
}


/* ── Remove Widget ───────────────────────────────────── */
export function removeWidget(widgetId) {
  freeCells(widgetId);

  state.widgets = state.widgets.filter((w) => w.id !== widgetId);

  const el = dom.legoGrid.querySelector(`.placed-widget[data-widget-id="${widgetId}"]`);
  if (el) {
    el.style.transition = 'opacity 0.15s, transform 0.15s';
    el.style.opacity = '0';
    el.style.transform = 'scale(0.8)';
    setTimeout(() => el.remove(), 150);
  }

  showToast('Widget removed');
}


export function resizeTodoWidget(widgetId, newCols, newRows) {
  const w = state.widgets.find((x) => x.id === widgetId);
  if (!w || w.type !== 'todo') return false;

  const row = Number(w.row);
  const col = Number(w.col);
  const oldCols = Number(w.cols);
  const oldRows = Number(w.rows);
  const cols = Number(newCols);
  const rows = Number(newRows);

  if (oldCols === cols && oldRows === rows) return true;

  freeCells(widgetId);

  if (!checkPlacement(row, col, cols, rows)) {
    markCellsOccupied(row, col, oldCols, oldRows, widgetId);
    showToast('현재 위치에서는 해당 크기로 변경할 수 없습니다.');
    return false;
  }

  w.row = row;
  w.col = col;
  w.cols = cols;
  w.rows = rows;
  markCellsOccupied(row, col, cols, rows, widgetId);

  const el = dom.legoGrid.querySelector(`.placed-widget[data-widget-id="${widgetId}"]`);
  if (el) el.remove();

  renderPlacedWidget(w);
  return true;
}


/* ── Pickup Widget (Move) ────────────────────────────── */
export function pickupWidget(w) {
  freeCells(w.id);
  state.widgets = state.widgets.filter((x) => x.id !== w.id);
  const el = dom.legoGrid.querySelector(`.placed-widget[data-widget-id="${w.id}"]`);
  if (el) el.remove();

  state.movingWidget = w; // Store to restore if cancelled
  enterPlacementMode({ cols: w.cols, rows: w.rows }, w.imageData, w.type || 'gallery');
}


/* ── Restore Widget (from saved data) ────────────────── */
export function restoreWidget(w) {
  const widgetId = `w_${state.widgetIdCounter++}`;
  const widgetData = { ...w, id: widgetId };

  if (widgetData.type === 'memo') {
    initMemoSessionState(widgetData);
    closeMemoFullscreen();
  }

  if (checkPlacement(w.row, w.col, w.cols, w.rows)) {
    markCellsOccupied(w.row, w.col, w.cols, w.rows, widgetId);
    state.widgets.push(widgetData);
    renderPlacedWidget(widgetData);
  }
}


/* ── Re-render all placed widgets ────────────────────── */
export function rerenderPlacedWidgets() {
  dom.legoGrid.querySelectorAll('.placed-widget').forEach((el) => el.remove());

  state.occupiedCells = {};
  dom.legoGrid.querySelectorAll('.grid-cell').forEach((c) => c.classList.remove('occupied'));

  reserveMapArea();

  const currentWidgets = [...state.widgets];
  state.widgets = [];
  currentWidgets.forEach((w) => {
    if (checkPlacement(w.row, w.col, w.cols, w.rows)) {
      markCellsOccupied(w.row, w.col, w.cols, w.rows, w.id);
      state.widgets.push(w);
      renderPlacedWidget(w);
    }
  });
}


/* ── Placement Mode ──────────────────────────────────── */
export function enterPlacementMode(size, imageData, type) {
  state.placementMode = true;
  state.placementSize = size;
  state.placementImage = imageData;
  state.placementType = type;
  dom.placementOverlay.classList.remove('hidden');
  dom.fabAdd.style.display = 'none';
}

export function exitPlacementMode() {
  state.placementMode = false;
  state.placementSize = null;
  state.placementImage = null;
  state.placementType = null;
  state.movingWidget = null;
  dom.placementOverlay.classList.add('hidden');
  dom.fabAdd.style.display = '';
  clearCellHighlights();
}

export function cancelPlacement() {
  if (state.movingWidget) {
    // Restore the widget to its original location
    const w = state.movingWidget;
    markCellsOccupied(w.row, w.col, w.cols, w.rows, w.id);
    state.widgets.push(w);
    renderPlacedWidget(w);
    showToast('Move cancelled');
  } else {
    showToast('Placement cancelled');
  }
  exitPlacementMode();
}
