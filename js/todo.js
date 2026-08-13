/* ═══════════════════════════════════════════════════════════
   MEMENTO DIARY — To-Do Widget Logic (Group → Category → Todo)
   ═══════════════════════════════════════════════════════════ */

import { state } from './state.js';
import { dom } from './dom.js';
import { openInputDialog, openConfirmDialog, openChoiceDialog, openColorPickerDialog, showToast, isAppDialogOpen } from './dialogs.js';
import { hexToRgba, normalizeHexColor } from './utils.js';


const ALL_TAB = 'all';
const WIDGET_PREVIEW_MAX = 5;
const DETAIL_TAB_CLICK_DELAY = 250;
const CATEGORY_HEADER_CLICK_DELAY = 250;
const TODO_REORDER_HOLD_MS = 400;
const TODO_REORDER_MOVE_THRESHOLD = 8;
const TODO_REORDER_CLICK_SUPPRESS_MS = 450;
const DEFAULT_CATEGORY_NAME = '기본';
const DEFAULT_CATEGORY_COLOR = '#FF8FB1';
const TODO_SCHEMA_VERSION = 2;

let todoResizeContext = null;
let todoComposeContext = null;
let activeTodoWidgetId = null;
let groupManageMenuEl = null;
let groupManageContext = null;
let detailTabClickTimer = null;
let categoryHeaderClickTimer = null;
let todoReorderHoldTimer = null;
let todoReorderSession = null;
let todoReorderSuppressUntil = 0;


function persistTodoLayout() {
  import('./editor.js').then(({ persistWidgetLayout }) => persistWidgetLayout());
}


function genId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
}


function normalizeTodo(todo) {
  return {
    id: todo.id || genId('t'),
    text: todo.text ?? todo.title ?? '',
    completed: Boolean(todo.completed),
    createdAt: todo.createdAt,
  };
}


function normalizeCategory(category) {
  if (!category.id) category.id = genId('c');
  if (!category.name) category.name = '카테고리';
  if (category.collapsed == null) category.collapsed = false;
  category.color = normalizeHexColor(category.color, DEFAULT_CATEGORY_COLOR);
  if (!Array.isArray(category.todos)) category.todos = [];
  category.todos = category.todos.map(normalizeTodo);
}


function getCategoryColor(category) {
  return normalizeHexColor(category?.color, DEFAULT_CATEGORY_COLOR);
}


function applyAccentColorStyles(el, color) {
  const accent = normalizeHexColor(color, DEFAULT_CATEGORY_COLOR);
  el.style.setProperty('--category-color', accent);
  el.style.setProperty('--category-color-border', hexToRgba(accent, 0.3));
  el.style.setProperty('--category-color-soft', hexToRgba(accent, 0.14));
  el.style.setProperty('--category-color-bg', hexToRgba(accent, 0.08));
  el.style.setProperty('--category-color-light', hexToRgba(accent, 0.08));
  el.style.setProperty('--category-color-muted', hexToRgba(accent, 0.72));
}


function getGroupColor(group) {
  return normalizeHexColor(group?.color, DEFAULT_CATEGORY_COLOR);
}


function normalizeGroup(group) {
  if (!group.id) group.id = genId('g');
  if (!group.name) group.name = '그룹';
  if (group.color) group.color = normalizeHexColor(group.color, DEFAULT_CATEGORY_COLOR);
  if (!Array.isArray(group.todos)) group.todos = [];
  group.todos = group.todos.map(normalizeTodo);
  if (!Array.isArray(group.categories)) group.categories = [];
  group.categories.forEach(normalizeCategory);
  syncGroupItemOrder(group);
}


function syncGroupItemOrder(group) {
  if (!Array.isArray(group.itemOrder)) group.itemOrder = [];

  const seen = new Set();
  const nextOrder = [];

  group.itemOrder.forEach((entry) => {
    if (!entry?.type || !entry?.id) return;
    const key = `${entry.type}:${entry.id}`;
    if (seen.has(key)) return;

    if (entry.type === 'todo' && group.todos.some((t) => t.id === entry.id)) {
      nextOrder.push({ type: 'todo', id: entry.id });
      seen.add(key);
    } else if (entry.type === 'category' && group.categories.some((c) => c.id === entry.id)) {
      nextOrder.push({ type: 'category', id: entry.id });
      seen.add(key);
    }
  });

  group.todos.forEach((todo) => {
    const key = `todo:${todo.id}`;
    if (!seen.has(key)) {
      nextOrder.push({ type: 'todo', id: todo.id });
      seen.add(key);
    }
  });

  group.categories.forEach((category) => {
    const key = `category:${category.id}`;
    if (!seen.has(key)) {
      nextOrder.push({ type: 'category', id: category.id });
      seen.add(key);
    }
  });

  group.itemOrder = nextOrder;
}


function addGroupItemOrderEntry(group, type, id) {
  syncGroupItemOrder(group);
  if (group.itemOrder.some((entry) => entry.type === type && entry.id === id)) return;
  group.itemOrder.push({ type, id });
}


function removeGroupItemOrderEntry(group, type, id) {
  if (!Array.isArray(group.itemOrder)) return;
  group.itemOrder = group.itemOrder.filter((entry) => !(entry.type === type && entry.id === id));
}


function migrateLegacyTodoData(w) {
  if (w.todoSchemaVersion >= TODO_SCHEMA_VERSION) return;

  // Flat categories (category-centric refactor) → groups with one default category each
  if (Array.isArray(w.categories) && !Array.isArray(w.groups)) {
    w.groups = w.categories.map((cat) => ({
      id: cat.id,
      name: cat.name,
      categories: [{
        id: genId('c'),
        name: DEFAULT_CATEGORY_NAME,
        color: DEFAULT_CATEGORY_COLOR,
        collapsed: Boolean(cat.collapsed),
        todos: (cat.todos ?? []).map(normalizeTodo),
      }],
    }));
    delete w.categories;
    if (w.activeTab == null) w.activeTab = ALL_TAB;
    w.todoSchemaVersion = TODO_SCHEMA_VERSION;
    return;
  }

  // Legacy groups + flat tasks
  if (Array.isArray(w.groups) && Array.isArray(w.tasks)) {
    w.groups = w.groups.map((group) => ({
      id: group.id,
      name: group.name,
      categories: [{
        id: genId('c'),
        name: DEFAULT_CATEGORY_NAME,
        color: DEFAULT_CATEGORY_COLOR,
        collapsed: false,
        todos: w.tasks
          .filter((task) => task.groupId === group.id)
          .map(normalizeTodo),
      }],
    }));
    delete w.tasks;
    if (w.activeTab == null) w.activeTab = ALL_TAB;
    w.todoSchemaVersion = TODO_SCHEMA_VERSION;
    return;
  }

  // Groups with legacy direct todos on group (pre–group.todos feature) → default category
  if (Array.isArray(w.groups)) {
    w.groups.forEach((group) => {
      if (Array.isArray(group.todos) && group.todos.length > 0 && !Array.isArray(group.categories)) {
        group.categories = [{
          id: genId('c'),
          name: DEFAULT_CATEGORY_NAME,
          color: DEFAULT_CATEGORY_COLOR,
          collapsed: false,
          todos: group.todos.map(normalizeTodo),
        }];
        group.todos = [];
      }
      if (!Array.isArray(group.categories)) group.categories = [];
    });
    if (w.activeTab == null) w.activeTab = ALL_TAB;
    w.todoSchemaVersion = TODO_SCHEMA_VERSION;
    return;
  }

  w.groups = [];
  if (w.activeTab == null) w.activeTab = ALL_TAB;
  w.todoSchemaVersion = TODO_SCHEMA_VERSION;
}


export function ensureTodoWidgetData(w) {
  migrateLegacyTodoData(w);

  if (!Array.isArray(w.groups)) w.groups = [];
  if (w.activeTab == null) w.activeTab = ALL_TAB;

  w.groups.forEach(normalizeGroup);

  if (w.activeTab !== ALL_TAB && !w.groups.some((g) => g.id === w.activeTab)) {
    w.activeTab = w.groups.length ? w.groups[0].id : ALL_TAB;
  }
}


function getTodoWidgetElement(widgetId) {
  return dom.legoGrid.querySelector(`.placed-widget[data-widget-id="${widgetId}"]`);
}


function getActiveTodoWidget() {
  if (!activeTodoWidgetId) return null;
  return state.widgets.find((w) => w.id === activeTodoWidgetId) ?? null;
}


function findGroup(w, groupId) {
  ensureTodoWidgetData(w);
  return w.groups.find((g) => g.id === groupId) ?? null;
}


function findCategoryInGroup(group, categoryId) {
  return group.categories.find((c) => c.id === categoryId) ?? null;
}


function findCategory(w, groupId, categoryId) {
  const group = findGroup(w, groupId);
  if (!group) return null;
  return findCategoryInGroup(group, categoryId);
}


function findCategoryGlobal(w, categoryId) {
  ensureTodoWidgetData(w);
  for (const group of w.groups) {
    const category = findCategoryInGroup(group, categoryId);
    if (category) return { group, category };
  }
  return null;
}


function findTodo(w, todoId) {
  ensureTodoWidgetData(w);
  for (const group of w.groups) {
    const direct = group.todos.find((t) => t.id === todoId);
    if (direct) return { group, category: null, todo: direct, isDirect: true };

    for (const category of group.categories) {
      const todo = category.todos.find((t) => t.id === todoId);
      if (todo) return { group, category, todo, isDirect: false };
    }
  }
  return null;
}


function getTodoText(todo) {
  return todo.text ?? todo.title ?? '';
}


function collectWidgetPreviewItems(w) {
  ensureTodoWidgetData(w);

  const items = [];

  const appendFromGroup = (group) => {
    syncGroupItemOrder(group);
    group.itemOrder.forEach((entry) => {
      if (entry.type === 'todo') {
        const todo = group.todos.find((t) => t.id === entry.id);
        if (todo) items.push({ kind: 'direct', group, todo });
      } else if (entry.type === 'category') {
        const category = group.categories.find((c) => c.id === entry.id);
        if (!category) return;
        category.todos.forEach((todo) => {
          items.push({ kind: 'category', group, category, todo });
        });
      }
    });
  };

  if (w.activeTab === ALL_TAB) {
    w.groups.forEach(appendFromGroup);
  } else {
    const group = findGroup(w, w.activeTab);
    if (group) appendFromGroup(group);
  }

  return items;
}


function groupPreviewItemsIntoBlocks(items, activeTab) {
  const blocks = [];

  items.forEach((item) => {
    const key = item.kind === 'direct'
      ? `direct:${item.group.id}`
      : `category:${item.category.id}`;

    let block = blocks.find((b) => b.key === key);
    if (!block) {
      block = {
        key,
        kind: item.kind,
        group: item.group,
        category: item.category ?? null,
        todos: [],
      };
      blocks.push(block);
    }
    block.todos.push(item.todo);
  });

  return blocks;
}


export function syncTodoWidgetView(widgetId) {
  const w = state.widgets.find((x) => x.id === widgetId);
  if (!w) return;

  const el = getTodoWidgetElement(widgetId);
  if (el) refreshTodoTabs(el, w);
  if (activeTodoWidgetId === widgetId) renderTodoDetailPanel();
}


function setActiveTab(widgetId, tabId) {
  const w = state.widgets.find((x) => x.id === widgetId);
  if (!w) return;

  ensureTodoWidgetData(w);
  w.activeTab = tabId;

  syncTodoWidgetView(widgetId);
  persistTodoLayout();
}


function createTodoGroup(w, name) {
  ensureTodoWidgetData(w);
  const group = {
    id: genId('g'),
    name: name ?? `그룹${w.groups.length + 1}`,
    todos: [],
    categories: [],
    itemOrder: [],
  };
  w.groups.push(group);
  w.activeTab = group.id;
  return group;
}


function createTodoCategory(w, groupId, name) {
  const group = findGroup(w, groupId);
  if (!group) return null;

  const category = {
    id: genId('c'),
    name,
    color: DEFAULT_CATEGORY_COLOR,
    collapsed: false,
    todos: [],
  };
  group.categories.push(category);
  addGroupItemOrderEntry(group, 'category', category.id);
  return category;
}


function createTodoItem(text) {
  return {
    id: genId('t'),
    text,
    completed: false,
    createdAt: new Date().toISOString(),
  };
}


function toggleTodoTask(w, todoId) {
  const found = findTodo(w, todoId);
  if (!found) return;
  found.todo.completed = !found.todo.completed;
}


function deleteTodoTask(w, todoId) {
  ensureTodoWidgetData(w);
  w.groups.forEach((group) => {
    const wasDirect = group.todos.some((t) => t.id === todoId);
    group.todos = group.todos.filter((t) => t.id !== todoId);
    if (wasDirect) removeGroupItemOrderEntry(group, 'todo', todoId);
    group.categories.forEach((category) => {
      category.todos = category.todos.filter((t) => t.id !== todoId);
    });
  });
}


function addDirectTodoToGroup(w, groupId, text) {
  const group = findGroup(w, groupId);
  if (!group) return;

  const trimmed = text.trim();
  if (!trimmed) return;

  group.todos.push(createTodoItem(trimmed));
  addGroupItemOrderEntry(group, 'todo', group.todos[group.todos.length - 1].id);
  syncTodoWidgetView(w.id);
  persistTodoLayout();
}


function deleteTodoGroup(w, groupId) {
  ensureTodoWidgetData(w);

  w.groups = w.groups.filter((g) => g.id !== groupId);

  if (w.activeTab === groupId) {
    w.activeTab = w.groups.length ? w.groups[0].id : ALL_TAB;
  }

  syncTodoWidgetView(w.id);
  persistTodoLayout();
}


function deleteTodoCategory(w, groupId, categoryId) {
  const group = findGroup(w, groupId);
  if (!group) return;

  group.categories = group.categories.filter((c) => c.id !== categoryId);
  removeGroupItemOrderEntry(group, 'category', categoryId);
  syncTodoWidgetView(w.id);
  persistTodoLayout();
}


function toggleCategoryCollapsed(w, groupId, categoryId) {
  const category = findCategory(w, groupId, categoryId);
  if (!category) return;
  category.collapsed = !category.collapsed;
  syncTodoWidgetView(w.id);
  persistTodoLayout();
}


function addTodoToCategory(w, groupId, categoryId, text) {
  const category = findCategory(w, groupId, categoryId);
  if (!category) return;

  const trimmed = text.trim();
  if (!trimmed) return;

  category.todos.push(createTodoItem(trimmed));
  category.collapsed = false;
  syncTodoWidgetView(w.id);
  persistTodoLayout();
}


/* ── Manage menus ────────────────────────────────────── */

function closeGroupManageMenu() {
  if (groupManageMenuEl) {
    groupManageMenuEl.remove();
    groupManageMenuEl = null;
  }
  groupManageContext = null;
  document.removeEventListener('click', handleGroupManageMenuOutsideClick, true);
}


function handleGroupManageMenuOutsideClick(e) {
  if (groupManageMenuEl?.contains(e.target)) return;
  closeGroupManageMenu();
}


function openGroupManageMenu(anchorEl, groupId) {
  if (groupId === ALL_TAB) return;

  const w = getActiveTodoWidget();
  if (!w) return;

  const group = findGroup(w, groupId);
  if (!group) return;

  closeGroupManageMenu();
  groupManageContext = { widgetId: w.id, kind: 'group', groupId };

  const menu = document.createElement('div');
  menu.className = 'todo-group-manage-menu glass-panel';
  menu.setAttribute('role', 'menu');

  const renameBtn = document.createElement('button');
  renameBtn.type = 'button';
  renameBtn.className = 'todo-group-manage-item';
  renameBtn.dataset.action = 'menu-rename-group';
  renameBtn.textContent = '그룹명 변경';

  const deleteBtn = document.createElement('button');
  deleteBtn.type = 'button';
  deleteBtn.className = 'todo-group-manage-item todo-group-manage-item--danger';
  deleteBtn.dataset.action = 'menu-delete-group';
  deleteBtn.textContent = '그룹 삭제';

  menu.appendChild(renameBtn);
  menu.appendChild(deleteBtn);
  document.body.appendChild(menu);
  groupManageMenuEl = menu;

  positionFloatingMenu(menu, anchorEl);

  menu.addEventListener('click', (e) => {
    e.stopPropagation();
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    handleGroupManageMenuAction(btn.dataset.action);
  });

  setTimeout(() => {
    document.addEventListener('click', handleGroupManageMenuOutsideClick, true);
  }, 0);
}


function openCategoryManageMenu(anchorEl, groupId, categoryId) {
  const w = getActiveTodoWidget();
  if (!w) return;

  const category = findCategory(w, groupId, categoryId);
  if (!category) return;

  closeGroupManageMenu();
  groupManageContext = { widgetId: w.id, kind: 'category', groupId, categoryId };

  const menu = document.createElement('div');
  menu.className = 'todo-group-manage-menu glass-panel';
  menu.setAttribute('role', 'menu');

  const renameBtn = document.createElement('button');
  renameBtn.type = 'button';
  renameBtn.className = 'todo-group-manage-item';
  renameBtn.dataset.action = 'menu-rename-category';
  renameBtn.textContent = '카테고리명 수정';

  const colorBtn = document.createElement('button');
  colorBtn.type = 'button';
  colorBtn.className = 'todo-group-manage-item';
  colorBtn.dataset.action = 'menu-change-category-color';
  colorBtn.textContent = '색상 변경';

  const deleteBtn = document.createElement('button');
  deleteBtn.type = 'button';
  deleteBtn.className = 'todo-group-manage-item todo-group-manage-item--danger';
  deleteBtn.dataset.action = 'menu-delete-category';
  deleteBtn.textContent = '카테고리 삭제';

  menu.appendChild(renameBtn);
  menu.appendChild(colorBtn);
  menu.appendChild(deleteBtn);
  document.body.appendChild(menu);
  groupManageMenuEl = menu;

  positionFloatingMenu(menu, anchorEl);

  menu.addEventListener('click', (e) => {
    e.stopPropagation();
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    handleGroupManageMenuAction(btn.dataset.action);
  });

  setTimeout(() => {
    document.addEventListener('click', handleGroupManageMenuOutsideClick, true);
  }, 0);
}


function positionFloatingMenu(menu, anchorEl) {
  const rect = anchorEl.getBoundingClientRect();
  const menuRect = menu.getBoundingClientRect();
  let top = rect.bottom + 6;
  let left = rect.left;

  if (left + menuRect.width > window.innerWidth - 8) {
    left = window.innerWidth - menuRect.width - 8;
  }
  if (top + menuRect.height > window.innerHeight - 8) {
    top = rect.top - menuRect.height - 6;
  }

  menu.style.top = `${Math.max(8, top)}px`;
  menu.style.left = `${Math.max(8, left)}px`;
}


function handleGroupManageMenuAction(action) {
  if (!groupManageContext) return;

  const w = state.widgets.find((x) => x.id === groupManageContext.widgetId);
  if (!w) {
    closeGroupManageMenu();
    return;
  }

  const { groupId, categoryId } = groupManageContext;
  closeGroupManageMenu();

  if (action === 'menu-rename-group') {
    const group = findGroup(w, groupId);
    if (group) renameTodoGroup(w, group);
  } else if (action === 'menu-delete-group') {
    confirmDeleteTodoGroup(w, groupId);
  } else if (action === 'menu-rename-category') {
    const category = findCategory(w, groupId, categoryId);
    if (category) renameTodoCategory(w, groupId, category);
  } else if (action === 'menu-change-category-color') {
    const category = findCategory(w, groupId, categoryId);
    if (category) changeTodoCategoryColor(w, groupId, category);
  } else if (action === 'menu-delete-category') {
    confirmDeleteTodoCategory(w, groupId, categoryId);
  }
}


async function renameTodoGroup(w, group) {
  const name = await openInputDialog({
    title: '그룹명 수정',
    value: group.name,
    maxLength: 50,
    confirmLabel: '저장',
  });
  if (name === null) return;

  const duplicate = w.groups.some((g) => g.id !== group.id && g.name === name);
  if (duplicate) {
    showToast('이미 같은 이름의 그룹이 있습니다');
    return;
  }

  group.name = name;
  syncTodoWidgetView(w.id);
  persistTodoLayout();
}


async function renameTodoCategory(w, groupId, category) {
  const group = findGroup(w, groupId);
  if (!group) return;

  const name = await openInputDialog({
    title: '카테고리명 수정',
    value: category.name,
    maxLength: 50,
    confirmLabel: '저장',
  });
  if (name === null) return;

  const duplicate = group.categories.some((c) => c.id !== category.id && c.name === name);
  if (duplicate) {
    showToast('이미 같은 이름의 카테고리가 있습니다');
    return;
  }

  category.name = name;
  syncTodoWidgetView(w.id);
  persistTodoLayout();
}


async function changeTodoCategoryColor(w, groupId, category) {
  const color = await openColorPickerDialog({
    title: '색상 변경',
    value: getCategoryColor(category),
  });
  if (color === null) return;

  category.color = normalizeHexColor(color, DEFAULT_CATEGORY_COLOR);
  syncTodoWidgetView(w.id);
  persistTodoLayout();
}


async function confirmDeleteTodoGroup(w, groupId) {
  const ok = await openConfirmDialog({
    title: '그룹 삭제',
    message: '이 그룹과 그룹 안의 할 일을 삭제할까요?',
    confirmLabel: '삭제',
    danger: true,
  });
  if (!ok) return;
  deleteTodoGroup(w, groupId);
}


async function confirmDeleteTodoCategory(w, groupId, categoryId) {
  const ok = await openConfirmDialog({
    title: '카테고리 삭제',
    message: '이 카테고리와 카테고리 안의 할 일을 삭제할까요?',
    confirmLabel: '삭제',
    danger: true,
  });
  if (!ok) return;
  deleteTodoCategory(w, groupId, categoryId);
}


async function confirmDeleteTodoTask(w, todoId) {
  const ok = await openConfirmDialog({
    title: '할 일 삭제',
    message: '이 할 일을 삭제할까요?',
    confirmLabel: '삭제',
    danger: true,
  });
  if (!ok) return;
  deleteTodoTask(w, todoId);
  syncTodoWidgetView(w.id);
  persistTodoLayout();
}


/* ── Widget View ─────────────────────────────────────── */

export function buildTodoWidgetShell() {
  return `
    <div class="todo-widget">
      <header class="todo-widget-header">
        <div class="todo-widget-tabs"></div>
        <button type="button" class="todo-widget-resize" aria-label="크기 변경" title="크기 변경">⤢</button>
        <button type="button" class="widget-delete todo-widget-delete" title="Remove widget">✕</button>
      </header>
      <div class="todo-widget-body">
        <p class="todo-empty">아직 할 일이 없습니다</p>
        <ul class="todo-task-list hidden"></ul>
        <p class="todo-overflow hidden"></p>
      </div>
    </div>
  `;
}


function buildWidgetTaskItem(todo, accentColor) {
  const item = document.createElement('li');
  item.className = 'todo-task-item' + (todo.completed ? ' todo-task-item--completed' : '');
  item.dataset.taskId = todo.id;
  applyAccentColorStyles(item, accentColor);

  const check = document.createElement('button');
  check.type = 'button';
  check.className = 'todo-task-check' + (todo.completed ? ' todo-task-check--done' : '');
  check.dataset.action = 'toggle-task';
  check.dataset.taskId = todo.id;
  check.setAttribute('aria-label', todo.completed ? '완료 취소' : '완료 표시');

  const title = document.createElement('span');
  title.className = 'todo-task-title';
  title.textContent = getTodoText(todo);

  item.appendChild(check);
  item.appendChild(title);
  return item;
}


function refreshTodoTaskList(el, w) {
  ensureTodoWidgetData(w);

  const body = el.querySelector('.todo-widget-body');
  if (!body) return;

  const emptyEl = body.querySelector('.todo-empty');
  const listEl = body.querySelector('.todo-task-list');
  const overflowEl = body.querySelector('.todo-overflow');
  if (!emptyEl || !listEl || !overflowEl) return;

  const allItems = collectWidgetPreviewItems(w);

  if (allItems.length === 0) {
    emptyEl.classList.remove('hidden');
    listEl.classList.add('hidden');
    overflowEl.classList.add('hidden');
    listEl.replaceChildren();
    overflowEl.textContent = '';
    return;
  }

  emptyEl.classList.add('hidden');
  listEl.classList.remove('hidden');

  const preview = allItems.slice(0, WIDGET_PREVIEW_MAX);
  const overflowCount = allItems.length - preview.length;

  listEl.replaceChildren();

  const blocks = groupPreviewItemsIntoBlocks(preview, w.activeTab);

  blocks.forEach((block) => {
    if (block.kind === 'direct') {
      const blockEl = document.createElement('li');
      blockEl.className = 'todo-widget-direct-block';

      const sublist = document.createElement('ul');
      sublist.className = 'todo-widget-direct-tasks';

      block.todos.forEach((todo) => {
        sublist.appendChild(buildWidgetTaskItem(todo, getGroupColor(block.group)));
      });

      blockEl.appendChild(sublist);
      listEl.appendChild(blockEl);
      return;
    }

    const accentColor = getCategoryColor(block.category);

    const blockEl = document.createElement('li');
    blockEl.className = 'todo-widget-category-block';
    applyAccentColorStyles(blockEl, accentColor);

    const label = document.createElement('div');
    label.className = 'todo-widget-category-label';

    const dot = document.createElement('span');
    dot.className = 'todo-widget-category-dot';
    dot.style.backgroundColor = accentColor;
    label.appendChild(dot);

    const nameSpan = document.createElement('span');
    nameSpan.className = 'todo-widget-category-name';
    nameSpan.textContent = w.activeTab === ALL_TAB
      ? `${block.group.name} · ${block.category.name}`
      : block.category.name;
    label.appendChild(nameSpan);
    blockEl.appendChild(label);

    const sublist = document.createElement('ul');
    sublist.className = 'todo-widget-category-tasks';

    block.todos.forEach((todo) => {
      sublist.appendChild(buildWidgetTaskItem(todo, accentColor));
    });

    blockEl.appendChild(sublist);
    listEl.appendChild(blockEl);
  });

  if (overflowCount > 0) {
    overflowEl.classList.remove('hidden');
    overflowEl.textContent = `외 ${overflowCount}개`;
  } else {
    overflowEl.classList.add('hidden');
    overflowEl.textContent = '';
  }
}


export function refreshTodoTabs(el, w) {
  ensureTodoWidgetData(w);

  const tabsContainer = el.querySelector('.todo-widget-tabs');
  if (!tabsContainer) return;

  tabsContainer.replaceChildren();

  const allTab = document.createElement('button');
  allTab.type = 'button';
  allTab.className = 'todo-tab' + (w.activeTab === ALL_TAB ? ' todo-tab--active' : '');
  allTab.dataset.groupId = ALL_TAB;
  allTab.textContent = '전체';
  tabsContainer.appendChild(allTab);

  w.groups.forEach((group) => {
    const tab = document.createElement('button');
    tab.type = 'button';
    tab.className = 'todo-tab' + (w.activeTab === group.id ? ' todo-tab--active' : '');
    tab.dataset.groupId = group.id;
    tab.textContent = group.name;
    tabsContainer.appendChild(tab);
  });

  const activeTabEl = tabsContainer.querySelector('.todo-tab--active');
  if (activeTabEl) {
    activeTabEl.scrollIntoView({ inline: 'nearest', block: 'nearest' });
  }

  refreshTodoTaskList(el, w);
}


export function bindTodoWidgetEvents(el) {
  const root = el.querySelector('.todo-widget');
  if (!root || root.dataset.todoBound) return;
  root.dataset.todoBound = '1';

  const widgetId = el.dataset.widgetId;

  root.addEventListener('click', (e) => {
    if (el.dataset.suppressTodoClick) {
      delete el.dataset.suppressTodoClick;
      e.stopPropagation();
      return;
    }

    const w = state.widgets.find((x) => x.id === widgetId);
    if (!w) return;

    if (e.target.closest('.todo-widget-header')) {
      const tab = e.target.closest('.todo-tab');
      if (tab) {
        e.stopPropagation();
        const tabId = tab.dataset.groupId || ALL_TAB;
        if (w.activeTab !== tabId) setActiveTab(widgetId, tabId);
      } else {
        e.stopPropagation();
      }
      return;
    }

    if (e.target.closest('[data-action="toggle-task"]')) {
      e.stopPropagation();
      toggleTodoTask(w, e.target.closest('[data-action="toggle-task"]').dataset.taskId);
      refreshTodoTaskList(el, w);
      persistTodoLayout();
      return;
    }

    if (e.target.closest('.todo-widget-body')) {
      e.stopPropagation();
      openTodoDetailPanel(widgetId);
    }
  });
}


/* ── Detail Modal ────────────────────────────────────── */

function handleTodoModalKeydown(e) {
  if (e.key !== 'Escape' || !activeTodoWidgetId || isAppDialogOpen()) return;
  e.preventDefault();
  closeTodoDetailPanel();
}


export function openTodoDetailPanel(widgetId) {
  const w = state.widgets.find((x) => x.id === widgetId);
  if (!w || w.type !== 'todo') return;

  if (todoResizeContext?.widgetId === widgetId) closeTodoResizeSheet();

  activeTodoWidgetId = widgetId;

  if (dom.todoModalTitle) dom.todoModalTitle.textContent = 'To-Do';

  dom.todoModalOverlay.classList.remove('hidden');
  requestAnimationFrame(() => dom.todoModalOverlay.classList.add('active'));
  document.addEventListener('keydown', handleTodoModalKeydown);
  renderTodoDetailPanel();
}


export function closeTodoDetailPanel() {
  const widgetId = activeTodoWidgetId;
  activeTodoWidgetId = null;

  cancelTodoReorderSession();

  clearTimeout(detailTabClickTimer);
  detailTabClickTimer = null;
  clearTimeout(categoryHeaderClickTimer);
  categoryHeaderClickTimer = null;
  closeGroupManageMenu();

  document.removeEventListener('keydown', handleTodoModalKeydown);
  dom.todoModalOverlay.classList.remove('active');

  setTimeout(() => {
    dom.todoModalOverlay.classList.add('hidden');
    if (dom.todoDetailBody) dom.todoDetailBody.replaceChildren();
  }, 200);

  if (widgetId) syncTodoWidgetView(widgetId);
}


function buildDetailGroupTabs(w) {
  const tabsWrap = document.createElement('div');
  tabsWrap.className = 'todo-detail-tabs';

  const allTab = document.createElement('button');
  allTab.type = 'button';
  allTab.className = 'todo-detail-tab' + (w.activeTab === ALL_TAB ? ' todo-detail-tab--active' : '');
  allTab.dataset.tabId = ALL_TAB;
  allTab.textContent = '전체';
  tabsWrap.appendChild(allTab);

  w.groups.forEach((group) => {
    const tab = document.createElement('button');
    tab.type = 'button';
    tab.className = 'todo-detail-tab' + (w.activeTab === group.id ? ' todo-detail-tab--active' : '');
    tab.dataset.tabId = group.id;
    tab.textContent = group.name;
    tabsWrap.appendChild(tab);
  });

  const addGroupBtn = document.createElement('button');
  addGroupBtn.type = 'button';
  addGroupBtn.className = 'todo-detail-add-group';
  addGroupBtn.dataset.action = 'add-group';
  addGroupBtn.textContent = '+ 그룹';
  tabsWrap.appendChild(addGroupBtn);

  return tabsWrap;
}


function buildTaskItem(todo, accentColor) {
  const item = document.createElement('li');
  item.className = 'todo-detail-task-item' + (todo.completed ? ' todo-detail-task-item--completed' : '');
  item.dataset.taskId = todo.id;
  applyAccentColorStyles(item, accentColor);

  const handle = document.createElement('span');
  handle.className = 'todo-detail-task-drag-handle';
  handle.setAttribute('aria-hidden', 'true');
  handle.textContent = '⋮⋮';

  const check = document.createElement('button');
  check.type = 'button';
  check.className = 'todo-detail-task-check' + (todo.completed ? ' todo-detail-task-check--done' : '');
  check.dataset.action = 'toggle-task';
  check.dataset.taskId = todo.id;
  check.setAttribute('aria-label', todo.completed ? '완료 취소' : '완료 표시');

  const title = document.createElement('span');
  title.className = 'todo-detail-task-title';
  title.textContent = getTodoText(todo);
  title.dataset.taskId = todo.id;

  const deleteBtn = document.createElement('button');
  deleteBtn.type = 'button';
  deleteBtn.className = 'todo-detail-task-delete';
  deleteBtn.dataset.action = 'delete-task';
  deleteBtn.dataset.taskId = todo.id;
  deleteBtn.setAttribute('aria-label', '할 일 삭제');
  deleteBtn.textContent = '✕';

  item.appendChild(handle);
  item.appendChild(check);
  item.appendChild(title);
  item.appendChild(deleteBtn);
  return item;
}


function buildDirectTaskItem(todo, group, showGroupName) {
  const item = buildTaskItem(todo, getGroupColor(group));
  item.classList.add('todo-detail-task-item--direct');

  if (showGroupName) {
    const titleEl = item.querySelector('.todo-detail-task-title');
    const content = document.createElement('div');
    content.className = 'todo-direct-task-content';
    titleEl.replaceWith(content);
    content.appendChild(titleEl);

    const groupLabel = document.createElement('span');
    groupLabel.className = 'todo-direct-group-label';
    groupLabel.textContent = group.name;
    content.appendChild(groupLabel);
  }

  return item;
}


function appendDirectTodoItems(container, group, showGroupName) {
  renderGroupItemsByOrder(container, group, showGroupName, false);
}


function renderGroupItemsByOrder(container, group, showGroupName, allowGroupReorder) {
  syncGroupItemOrder(group);
  if (!group.itemOrder.length) return;

  const listEl = document.createElement('ul');
  listEl.className = 'todo-group-item-list';
  if (allowGroupReorder) {
    listEl.dataset.reorderScope = 'group-items';
    listEl.dataset.groupId = group.id;
  }

  group.itemOrder.forEach((entry) => {
    if (entry.type === 'todo') {
      const todo = group.todos.find((t) => t.id === entry.id);
      if (!todo) return;
      const item = buildDirectTaskItem(todo, group, showGroupName);
      item.classList.add('todo-group-order-item');
      listEl.appendChild(item);
      return;
    }

    if (entry.type === 'category') {
      const category = group.categories.find((c) => c.id === entry.id);
      if (!category) return;
      const wrap = document.createElement('li');
      wrap.className = 'todo-group-order-item todo-group-order-item--category';
      wrap.appendChild(buildCategoryCard(null, group, category, showGroupName));
      listEl.appendChild(wrap);
    }
  });

  if (listEl.childElementCount > 0) {
    container.appendChild(listEl);
  }
}


function buildDetailFooterActions() {
  const footer = document.createElement('div');
  footer.className = 'todo-detail-footer-actions';

  const addTaskBtn = document.createElement('button');
  addTaskBtn.type = 'button';
  addTaskBtn.className = 'todo-add-task-btn';
  addTaskBtn.dataset.action = 'add-direct-task';
  addTaskBtn.textContent = '+ 할 일 추가';

  const addCategoryBtn = document.createElement('button');
  addCategoryBtn.type = 'button';
  addCategoryBtn.className = 'todo-add-category-btn';
  addCategoryBtn.dataset.action = 'add-category';
  addCategoryBtn.textContent = '+ 카테고리 추가';

  footer.appendChild(addTaskBtn);
  footer.appendChild(addCategoryBtn);
  return footer;
}


function buildCategoryCard(w, group, category, showGroupLabel) {
  const card = document.createElement('section');
  card.className = 'todo-category-card' + (category.collapsed ? ' todo-category-card--collapsed' : '');
  card.dataset.groupId = group.id;
  card.dataset.categoryId = category.id;
  applyAccentColorStyles(card, category.color);

  if (showGroupLabel) {
    const groupLabel = document.createElement('p');
    groupLabel.className = 'todo-category-group-label';
    groupLabel.textContent = group.name;
    card.appendChild(groupLabel);
  }

  const header = document.createElement('div');
  header.className = 'todo-category-header';
  header.dataset.groupId = group.id;
  header.dataset.categoryId = category.id;

  const dragHandle = document.createElement('span');
  dragHandle.className = 'todo-category-drag-handle';
  dragHandle.setAttribute('aria-hidden', 'true');
  dragHandle.textContent = '⋮⋮';

  const toggleBtn = document.createElement('button');
  toggleBtn.type = 'button';
  toggleBtn.className = 'todo-category-toggle';
  toggleBtn.dataset.action = 'toggle-collapse';
  toggleBtn.dataset.groupId = group.id;
  toggleBtn.dataset.categoryId = category.id;
  toggleBtn.setAttribute('aria-label', category.collapsed ? '펼치기' : '접기');
  toggleBtn.textContent = category.collapsed ? '▸' : '▾';

  const name = document.createElement('span');
  name.className = 'todo-category-name';
  name.textContent = category.name;

  const addBtn = document.createElement('button');
  addBtn.type = 'button';
  addBtn.className = 'todo-category-add-btn';
  addBtn.dataset.action = 'show-add-task';
  addBtn.dataset.groupId = group.id;
  addBtn.dataset.categoryId = category.id;
  addBtn.setAttribute('aria-label', '할 일 추가');
  addBtn.textContent = '+';

  header.appendChild(dragHandle);
  header.appendChild(toggleBtn);
  header.appendChild(name);
  header.appendChild(addBtn);
  card.appendChild(header);

  const body = document.createElement('div');
  body.className = 'todo-category-body';

  if (!category.collapsed) {
    if (category.todos.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'todo-category-empty';
      empty.textContent = '아직 할 일이 없습니다';
      body.appendChild(empty);
    }

    if (category.todos.length > 0) {
      const list = document.createElement('ul');
      list.className = 'todo-detail-task-list todo-category-task-list';
      list.dataset.reorderScope = 'category';
      list.dataset.groupId = group.id;
      list.dataset.categoryId = category.id;
      category.todos.forEach((todo) => {
        list.appendChild(buildTaskItem(todo, getCategoryColor(category)));
      });
      body.appendChild(list);
    }
  }

  card.appendChild(body);
  return card;
}


function getGroupSectionsForDetail(w) {
  if (w.activeTab === ALL_TAB) {
    return w.groups.map((group) => ({ group, showGroupLabel: true }));
  }

  const group = findGroup(w, w.activeTab);
  return group ? [{ group, showGroupLabel: false }] : [];
}


export function renderTodoDetailPanel() {
  cancelTodoReorderSession();

  const w = getActiveTodoWidget();
  if (!w || !dom.todoDetailBody) return;

  ensureTodoWidgetData(w);
  dom.todoDetailBody.replaceChildren();

  dom.todoDetailBody.appendChild(buildDetailGroupTabs(w));

  const listWrap = document.createElement('div');
  listWrap.className = 'todo-category-list';

  const groupSections = getGroupSectionsForDetail(w);
  const showGroupLabel = w.activeTab === ALL_TAB;

  if (w.groups.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'todo-detail-empty';
    empty.textContent = '그룹을 추가하고 할 일을 등록하세요.';
    listWrap.appendChild(empty);
  } else {
    groupSections.forEach(({ group }) => {
      renderGroupItemsByOrder(listWrap, group, showGroupLabel, w.activeTab !== ALL_TAB);
    });
  }

  dom.todoDetailBody.appendChild(listWrap);

  if (w.groups.length > 0) {
    dom.todoDetailBody.appendChild(buildDetailFooterActions());
  }
}


async function addNewGroup(w) {
  const name = await openInputDialog({
    title: '그룹 추가',
    value: `그룹${w.groups.length + 1}`,
    placeholder: '그룹 이름을 입력하세요',
    maxLength: 50,
    confirmLabel: '추가',
  });
  if (name === null) return;

  createTodoGroup(w, name);
  syncTodoWidgetView(w.id);
  persistTodoLayout();
}


async function pickGroupForAction(w, message) {
  if (w.groups.length === 0) {
    showToast('먼저 그룹을 추가하세요');
    return null;
  }

  if (w.groups.length === 1) return w.groups[0];

  const groupId = await openChoiceDialog({
    title: '그룹 선택',
    message,
    choices: w.groups.map((g) => ({ value: g.id, label: g.name })),
    cancelLabel: '취소',
  });

  if (!groupId) return null;
  return findGroup(w, groupId);
}


async function pickGroupForNewCategory(w) {
  return pickGroupForAction(w, '카테고리를 추가할 그룹을 선택하세요');
}


async function pickGroupForNewDirectTodo(w) {
  return pickGroupForAction(w, '일반 할 일을 추가할 그룹을 선택하세요');
}


async function addNewCategory(w, group) {
  const name = await openInputDialog({
    title: '카테고리 추가',
    value: `카테고리${group.categories.length + 1}`,
    placeholder: '카테고리 이름을 입력하세요',
    maxLength: 50,
    confirmLabel: '추가',
  });
  if (name === null) return;

  createTodoCategory(w, group.id, name);
  w.activeTab = group.id;
  syncTodoWidgetView(w.id);
  persistTodoLayout();
}


async function addNewCategoryForActiveTab(w) {
  if (w.activeTab === ALL_TAB) {
    const group = await pickGroupForNewCategory(w);
    if (!group) return;
    await addNewCategory(w, group);
    return;
  }

  const group = findGroup(w, w.activeTab);
  if (!group) return;
  await addNewCategory(w, group);
}


async function addNewDirectTodo(w, group) {
  const text = await openInputDialog({
    title: '할 일 추가',
    placeholder: '할 일을 입력하세요',
    maxLength: 120,
    confirmLabel: '추가',
  });
  if (text === null) return;

  addDirectTodoToGroup(w, group.id, text);
}


async function addNewDirectTodoForActiveTab(w) {
  if (w.activeTab === ALL_TAB) {
    const group = await pickGroupForNewDirectTodo(w);
    if (!group) return;
    await addNewDirectTodo(w, group);
    return;
  }

  const group = findGroup(w, w.activeTab);
  if (!group) return;
  await addNewDirectTodo(w, group);
}


async function addNewTodoToCategory(w, groupId, categoryId) {
  const category = findCategory(w, groupId, categoryId);
  if (!category) return;

  const text = await openInputDialog({
    title: '할 일 추가',
    placeholder: '할 일을 입력하세요',
    maxLength: 120,
    confirmLabel: '추가',
  });
  if (text === null) return;

  category.collapsed = false;
  addTodoToCategory(w, groupId, categoryId, text);
}


async function editTodoItem(w, todoId) {
  const found = findTodo(w, todoId);
  if (!found) return;

  const text = await openInputDialog({
    title: '할 일 수정',
    value: getTodoText(found.todo),
    placeholder: '할 일을 입력하세요',
    maxLength: 120,
    confirmLabel: '저장',
  });
  if (text === null) return;

  found.todo.text = text;
  syncTodoWidgetView(w.id);
  persistTodoLayout();
}


function shouldSuppressTodoReorderClick() {
  return Date.now() < todoReorderSuppressUntil;
}


function suppressTodoReorderClick(ms = TODO_REORDER_CLICK_SUPPRESS_MS) {
  todoReorderSuppressUntil = Date.now() + ms;
}


function isTodoReorderEnabled(w) {
  return Boolean(w && w.activeTab !== ALL_TAB);
}


function getReorderListContext(w, listEl) {
  const scope = listEl.dataset.reorderScope;
  const groupId = listEl.dataset.groupId;
  if (!scope || !groupId) return null;

  const group = findGroup(w, groupId);
  if (!group) return null;

  if (scope === 'group-items') {
    syncGroupItemOrder(group);
    return { scope, group, groupId, itemOrder: group.itemOrder };
  }

  if (scope === 'category') {
    const category = findCategoryInGroup(group, listEl.dataset.categoryId);
    if (!category) return null;
    return { scope, group, groupId, categoryId: category.id, todos: category.todos };
  }

  return null;
}


function getReorderScopeItems(listEl, scope) {
  if (scope === 'group-items') {
    return [...listEl.querySelectorAll(':scope > .todo-group-order-item')];
  }
  return [...listEl.querySelectorAll('.todo-detail-task-item')];
}


function isTodoReorderDragTarget(target, item) {
  if (!item) return false;
  if (target.closest('.todo-detail-task-drag-handle')) return true;
  if (target.closest('.todo-detail-task-check, .todo-detail-task-delete, .todo-detail-task-title, .todo-direct-task-content, .todo-direct-group-label')) {
    return false;
  }
  return target.closest('.todo-detail-task-item') === item;
}


function isCategoryGroupReorderTarget(target, card) {
  if (!card) return false;
  if (target.closest('.todo-category-body, .todo-detail-task-list, .todo-detail-task-item')) return false;
  if (target.closest('.todo-category-toggle, .todo-category-add-btn, .todo-category-name')) return false;
  if (target.closest('.todo-category-drag-handle')) return true;
  const header = target.closest('.todo-category-header');
  return Boolean(header && card.contains(header));
}


function resolveReorderPointerTarget(e, w) {
  if (!isTodoReorderEnabled(w)) return null;

  const taskItem = e.target.closest('.todo-detail-task-item');
  const categoryList = taskItem?.closest('.todo-detail-task-list[data-reorder-scope="category"]');
  if (taskItem && categoryList && isTodoReorderDragTarget(e.target, taskItem)) {
    return { item: taskItem, listEl: categoryList, scope: 'category' };
  }

  const groupList = e.target.closest('.todo-group-item-list[data-reorder-scope="group-items"]');
  if (!groupList) return null;

  const directItem = e.target.closest('.todo-detail-task-item.todo-group-order-item');
  if (directItem && directItem.parentElement === groupList && isTodoReorderDragTarget(e.target, directItem)) {
    return { item: directItem, listEl: groupList, scope: 'group-items' };
  }

  const categoryWrap = e.target.closest('.todo-group-order-item--category');
  if (categoryWrap && categoryWrap.parentElement === groupList) {
    const card = categoryWrap.querySelector('.todo-category-card');
    if (card && isCategoryGroupReorderTarget(e.target, card)) {
      return { item: categoryWrap, listEl: groupList, scope: 'group-items' };
    }
  }

  return null;
}


function getReorderItemClasses(scope) {
  if (scope === 'group-items') {
    return {
      armed: 'todo-group-order-item--reorder-armed',
      placeholder: 'todo-group-order-item--reorder-placeholder',
      ghost: 'todo-group-order-item--reorder-ghost',
      listActive: 'todo-group-item-list--reorder-active',
    };
  }
  return {
    armed: 'todo-detail-task-item--reorder-armed',
    placeholder: 'todo-detail-task-item--reorder-placeholder',
    ghost: 'todo-detail-task-item--reorder-ghost',
    listActive: 'todo-detail-task-list--reorder-active',
  };
}


function moveTodoInArray(todos, fromIndex, toIndex) {
  if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0 || fromIndex >= todos.length) return false;
  const [moved] = todos.splice(fromIndex, 1);
  todos.splice(toIndex, 0, moved);
  return true;
}


function moveGroupItemOrder(group, fromIndex, toIndex) {
  syncGroupItemOrder(group);
  return moveTodoInArray(group.itemOrder, fromIndex, toIndex);
}


function getTodoReorderInsertTarget(listEl, clientY, draggingItem, scope) {
  const items = getReorderScopeItems(listEl, scope);
  for (const child of items) {
    if (child === draggingItem) continue;
    const rect = child.getBoundingClientRect();
    const mid = rect.top + rect.height / 2;
    if (clientY < mid) return child;
  }
  return null;
}


function computeTodoReorderTargetIndex(listEl, draggingItem, insertBeforeEl, scope) {
  const items = getReorderScopeItems(listEl, scope);
  const fromIndex = items.indexOf(draggingItem);
  if (fromIndex < 0) return fromIndex;

  let insertBeforeIndex = insertBeforeEl ? items.indexOf(insertBeforeEl) : items.length;
  if (insertBeforeIndex < 0) insertBeforeIndex = items.length;

  let toIndex = insertBeforeIndex;
  if (fromIndex < toIndex) toIndex -= 1;
  return Math.max(0, Math.min(toIndex, items.length - 1));
}


function updateTodoReorderDropIndicator(session, clientY) {
  if (!session?.indicator || !session.listEl) return;

  const insertBeforeEl = getTodoReorderInsertTarget(session.listEl, clientY, session.item, session.scope);
  session.insertBeforeEl = insertBeforeEl;
  session.toIndex = computeTodoReorderTargetIndex(session.listEl, session.item, insertBeforeEl, session.scope);

  const listEl = session.listEl;
  const indicator = session.indicator;

  if (insertBeforeEl) {
    indicator.style.top = `${insertBeforeEl.offsetTop - 5}px`;
  } else {
    const items = getReorderScopeItems(listEl, session.scope);
    const last = items[items.length - 1];
    indicator.style.top = last
      ? `${last.offsetTop + last.offsetHeight + 5}px`
      : '0px';
  }

  indicator.classList.toggle(
    'todo-reorder-drop-indicator--hidden',
    session.fromIndex === session.toIndex,
  );
}


function clearTodoReorderHoldTimer() {
  if (todoReorderHoldTimer) {
    clearTimeout(todoReorderHoldTimer);
    todoReorderHoldTimer = null;
  }
}


function removeTodoReorderDropIndicator(session) {
  session?.indicator?.remove();
  session?.listEl?.classList.remove('todo-detail-task-list--reorder-active', 'todo-group-item-list--reorder-active');
}


function resetTodoReorderVisuals(session) {
  if (!session) return;

  const classes = getReorderItemClasses(session.scope ?? 'category');
  session.item?.classList.remove(classes.armed, classes.placeholder);
  session.item?.style.removeProperty('visibility');
  session.ghost?.remove();
  removeTodoReorderDropIndicator(session);
  document.body.classList.remove('todo-reorder-active');
}


function cancelTodoReorderSession() {
  clearTodoReorderHoldTimer();
  resetTodoReorderVisuals(todoReorderSession);

  if (todoReorderSession?.pointerId != null && dom.todoDetailBody) {
    try {
      dom.todoDetailBody.releasePointerCapture(todoReorderSession.pointerId);
    } catch {
      /* ignore */
    }
  }

  todoReorderSession = null;
}


function beginTodoReorderDrag(session, clientX, clientY) {
  const { item, listEl, scope } = session;
  const rect = item.getBoundingClientRect();
  const classes = getReorderItemClasses(scope);

  clearTimeout(categoryHeaderClickTimer);
  categoryHeaderClickTimer = null;

  session.phase = 'dragging';
  session.didDrag = true;
  item.classList.remove(classes.armed);
  item.classList.add(classes.placeholder);

  const ghost = item.cloneNode(true);
  ghost.classList.add(classes.ghost);
  ghost.removeAttribute('data-task-id');
  ghost.style.width = `${rect.width}px`;
  ghost.style.height = `${rect.height}px`;
  ghost.style.left = `${rect.left}px`;
  ghost.style.top = `${rect.top}px`;
  document.body.appendChild(ghost);
  session.ghost = ghost;

  listEl.classList.add(classes.listActive);

  const indicator = document.createElement('div');
  indicator.className = 'todo-reorder-drop-indicator todo-reorder-drop-indicator--hidden';
  listEl.appendChild(indicator);
  session.indicator = indicator;

  document.body.classList.add('todo-reorder-active');
  updateTodoReorderGhostPosition(session, clientX, clientY);
  updateTodoReorderDropIndicator(session, clientY);
}


function updateTodoReorderGhostPosition(session, clientX, clientY) {
  if (!session?.ghost) return;
  session.ghost.style.left = `${clientX - session.offsetX}px`;
  session.ghost.style.top = `${clientY - session.offsetY}px`;
}


function applyReorderDomMove(listEl, fromIndex, insertBeforeEl, scope) {
  const items = getReorderScopeItems(listEl, scope);
  const moving = items[fromIndex];
  if (!moving) return;

  moving.style.visibility = 'hidden';
  if (insertBeforeEl) {
    listEl.insertBefore(moving, insertBeforeEl);
  } else {
    listEl.appendChild(moving);
  }
}


function finishTodoReorderDrag(session) {
  const w = getActiveTodoWidget();
  if (!w || !session?.item || !session.listEl) {
    cancelTodoReorderSession();
    return;
  }

  const context = getReorderListContext(w, session.listEl);
  if (!context) {
    cancelTodoReorderSession();
    return;
  }

  const { item, listEl, ghost, fromIndex, scope } = session;
  const classes = getReorderItemClasses(scope);
  const toIndex = session.toIndex ?? fromIndex;
  let changed = false;

  if (scope === 'category') {
    changed = fromIndex !== toIndex && moveTodoInArray(context.todos, fromIndex, toIndex);
  } else if (scope === 'group-items') {
    changed = fromIndex !== toIndex && moveGroupItemOrder(context.group, fromIndex, toIndex);
  }

  if (changed) {
    applyReorderDomMove(listEl, fromIndex, session.insertBeforeEl, scope);
    persistTodoLayout();
    const widgetEl = getTodoWidgetElement(w.id);
    if (widgetEl) refreshTodoTaskList(widgetEl, w);
  }

  const settleRect = item.getBoundingClientRect();

  const cleanup = () => {
    item.style.removeProperty('visibility');
    item.classList.remove(classes.placeholder);
    suppressTodoReorderClick();
    cancelTodoReorderSession();
  };

  if (ghost && changed) {
    ghost.style.transition = 'left 0.22s var(--todo-ease), top 0.22s var(--todo-ease), opacity 0.22s var(--todo-ease), transform 0.22s var(--todo-ease)';
    ghost.style.left = `${settleRect.left}px`;
    ghost.style.top = `${settleRect.top}px`;
    ghost.style.transform = 'scale(1)';
    ghost.style.opacity = '0.92';
    window.setTimeout(cleanup, 220);
  } else {
    cleanup();
  }
}


function bindTodoDetailReorderEvents() {
  if (!dom.todoDetailBody || dom.todoDetailBody.dataset.reorderBound) return;
  dom.todoDetailBody.dataset.reorderBound = '1';

  const onPointerDown = (e) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    if (todoReorderSession) return;

    const w = getActiveTodoWidget();
    if (!w) return;

    const target = resolveReorderPointerTarget(e, w);
    if (!target) return;

    const { item, listEl, scope } = target;
    const context = getReorderListContext(w, listEl);
    const itemCount = getReorderScopeItems(listEl, scope).length;
    if (!context || itemCount < 2) return;

    e.preventDefault();

    const rect = item.getBoundingClientRect();
    const items = getReorderScopeItems(listEl, scope);
    const fromIndex = items.indexOf(item);
    if (fromIndex < 0) return;

    const classes = getReorderItemClasses(scope);

    clearTodoReorderHoldTimer();
    cancelTodoReorderSession();

    todoReorderSession = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      offsetX: e.clientX - rect.left,
      offsetY: e.clientY - rect.top,
      phase: 'pending',
      didDrag: false,
      item,
      listEl,
      scope,
      fromIndex,
      toIndex: fromIndex,
      insertBeforeEl: null,
      ghost: null,
      indicator: null,
    };

    todoReorderHoldTimer = window.setTimeout(() => {
      if (!todoReorderSession || todoReorderSession.phase !== 'pending') return;
      todoReorderSession.phase = 'armed';
      item.classList.add(classes.armed);
      try {
        dom.todoDetailBody.setPointerCapture(todoReorderSession.pointerId);
      } catch {
        /* ignore */
      }
    }, TODO_REORDER_HOLD_MS);
  };

  const onPointerMove = (e) => {
    if (!todoReorderSession || e.pointerId !== todoReorderSession.pointerId) return;

    const dx = e.clientX - todoReorderSession.startX;
    const dy = e.clientY - todoReorderSession.startY;
    const distance = Math.hypot(dx, dy);

    if (todoReorderSession.phase === 'pending') {
      if (distance > TODO_REORDER_MOVE_THRESHOLD) {
        clearTodoReorderHoldTimer();
        cancelTodoReorderSession();
      }
      return;
    }

    if (todoReorderSession.phase === 'armed') {
      if (distance > 0) {
        e.preventDefault();
        beginTodoReorderDrag(todoReorderSession, e.clientX, e.clientY);
      }
      return;
    }

    if (todoReorderSession.phase === 'dragging') {
      e.preventDefault();
      updateTodoReorderGhostPosition(todoReorderSession, e.clientX, e.clientY);
      updateTodoReorderDropIndicator(todoReorderSession, e.clientY);
    }
  };

  const onPointerEnd = (e) => {
    if (!todoReorderSession || e.pointerId !== todoReorderSession.pointerId) return;

    clearTodoReorderHoldTimer();

    if (todoReorderSession.phase === 'armed') {
      suppressTodoReorderClick();
      cancelTodoReorderSession();
      return;
    }

    if (todoReorderSession.phase === 'dragging') {
      e.preventDefault();
      finishTodoReorderDrag(todoReorderSession);
      return;
    }

    cancelTodoReorderSession();
  };

  dom.todoDetailBody.addEventListener('pointerdown', onPointerDown);
  dom.todoDetailBody.addEventListener('pointermove', onPointerMove);
  dom.todoDetailBody.addEventListener('pointerup', onPointerEnd);
  dom.todoDetailBody.addEventListener('pointercancel', onPointerEnd);
}


export function bindTodoDetailEvents() {
  if (!dom.todoModalOverlay || dom.todoModalOverlay.dataset.bound) return;
  dom.todoModalOverlay.dataset.bound = '1';

  dom.todoModalClose.addEventListener('click', closeTodoDetailPanel);

  dom.todoModalOverlay.addEventListener('click', (e) => {
    if (e.target === dom.todoModalOverlay) closeTodoDetailPanel();
  });

  dom.todoModal?.addEventListener('click', (e) => e.stopPropagation());

  dom.todoDetailBody.addEventListener('click', (e) => {
    const w = getActiveTodoWidget();
    if (!w) return;

    if (shouldSuppressTodoReorderClick()) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }

    const actionEl = e.target.closest('[data-action]');
    if (actionEl) {
      e.stopPropagation();
      const action = actionEl.dataset.action;
      const groupId = actionEl.dataset.groupId;
      const categoryId = actionEl.dataset.categoryId;
      const taskId = actionEl.dataset.taskId;

      if (action === 'add-group') {
        addNewGroup(w);
        return;
      }

      if (action === 'add-category') {
        addNewCategoryForActiveTab(w);
        return;
      }

      if (action === 'add-direct-task') {
        addNewDirectTodoForActiveTab(w);
        return;
      }

      if (action === 'toggle-collapse') {
        toggleCategoryCollapsed(w, groupId, categoryId);
        return;
      }

      if (action === 'show-add-task') {
        addNewTodoToCategory(w, groupId, categoryId);
        return;
      }

      if (action === 'toggle-task') {
        toggleTodoTask(w, taskId);
        syncTodoWidgetView(w.id);
        persistTodoLayout();
        return;
      }

      if (action === 'delete-task') {
        confirmDeleteTodoTask(w, taskId);
        return;
      }

      return;
    }

    const detailTab = e.target.closest('.todo-detail-tab');
    if (detailTab) {
      e.stopPropagation();
      const tabId = detailTab.dataset.tabId;
      if (!tabId || tabId === w.activeTab) return;

      clearTimeout(detailTabClickTimer);
      detailTabClickTimer = setTimeout(() => {
        setActiveTab(w.id, tabId);
        detailTabClickTimer = null;
      }, DETAIL_TAB_CLICK_DELAY);
      return;
    }

    const header = e.target.closest('.todo-category-header');
    if (header) {
      if (e.target.closest('.todo-category-toggle, .todo-category-add-btn, .todo-category-drag-handle')) return;
      if (shouldSuppressTodoReorderClick()) return;

      e.stopPropagation();
      const { groupId: gId, categoryId: cId } = header.dataset;
      clearTimeout(categoryHeaderClickTimer);
      categoryHeaderClickTimer = setTimeout(() => {
        toggleCategoryCollapsed(w, gId, cId);
        categoryHeaderClickTimer = null;
      }, CATEGORY_HEADER_CLICK_DELAY);
    }
  });

  dom.todoDetailBody.addEventListener('dblclick', (e) => {
    const w = getActiveTodoWidget();
    if (!w) return;

    if (shouldSuppressTodoReorderClick()) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }

    const titleEl = e.target.closest('.todo-detail-task-title');
    if (titleEl) {
      e.preventDefault();
      e.stopPropagation();
      editTodoItem(w, titleEl.dataset.taskId);
      return;
    }

    const detailTab = e.target.closest('.todo-detail-tab');
    if (detailTab) {
      const tabId = detailTab.dataset.tabId;
      if (!tabId || tabId === ALL_TAB) return;

      e.preventDefault();
      e.stopPropagation();
      clearTimeout(detailTabClickTimer);
      detailTabClickTimer = null;

      if (w.activeTab !== tabId) setActiveTab(w.id, tabId);

      const anchor = dom.todoDetailBody.querySelector(`.todo-detail-tab[data-tab-id="${tabId}"]`);
      if (anchor) openGroupManageMenu(anchor, tabId);
      return;
    }

    const nameEl = e.target.closest('.todo-category-name');
    if (nameEl) {
      const header = nameEl.closest('.todo-category-header');
      if (!header) return;
      e.preventDefault();
      e.stopPropagation();
      clearTimeout(categoryHeaderClickTimer);
      categoryHeaderClickTimer = null;
      openCategoryManageMenu(nameEl, header.dataset.groupId, header.dataset.categoryId);
    }
  });

  bindTodoDetailReorderEvents();
}


/* ── Legacy compose sheet ────────────────────────────── */

export function openTodoComposeSheet(widgetId, group) {
  if (todoResizeContext?.widgetId === widgetId) closeTodoResizeSheet();
  todoComposeContext = { widgetId, groupId: group.id };
  dom.todoComposeHeading.textContent = `${group.name}에 할 일 추가`;
  dom.todoComposeTitle.value = '';
  dom.todoComposeOverlay.classList.remove('hidden');
  requestAnimationFrame(() => dom.todoComposeOverlay.classList.add('active'));
  dom.todoComposeTitle.focus();
}


export function closeTodoComposeSheet() {
  dom.todoComposeOverlay.classList.remove('active');
  setTimeout(() => dom.todoComposeOverlay.classList.add('hidden'), 450);
  dom.todoComposeTitle.value = '';
  todoComposeContext = null;
}


export function bindTodoComposeSheetEvents() {
  dom.todoComposeCancel.addEventListener('click', closeTodoComposeSheet);
  dom.todoComposeSubmit.addEventListener('click', () => {
    if (!todoComposeContext) return;
    showToast('카테고리에서 + 버튼으로 할 일을 추가하세요');
    closeTodoComposeSheet();
  });
  dom.todoComposeOverlay.addEventListener('click', (e) => {
    if (e.target === dom.todoComposeOverlay) closeTodoComposeSheet();
  });
}


/* ── Resize Sheet ────────────────────────────────────── */

function buildTodoResizeSizeOptions(w) {
  if (!dom.todoResizeSizeList) return;

  dom.todoResizeSizeList.replaceChildren();

  state.widgetSizes.forEach((size) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'todo-resize-size-option';
    if (w.cols === size.cols && w.rows === size.rows) {
      btn.classList.add('todo-resize-size-option--current');
    }
    btn.dataset.cols = String(size.cols);
    btn.dataset.rows = String(size.rows);

    const label = document.createElement('span');
    label.className = 'todo-resize-size-label';
    label.textContent = size.label;

    const subtitle = document.createElement('span');
    subtitle.className = 'todo-resize-size-subtitle';
    subtitle.textContent = size.subtitle;

    btn.appendChild(label);
    btn.appendChild(subtitle);
    dom.todoResizeSizeList.appendChild(btn);
  });
}


export function openTodoResizeSheet(widgetId) {
  if (!dom.todoResizeOverlay || !dom.todoResizeSizeList) return;

  const w = state.widgets.find((x) => x.id === widgetId);
  if (!w || w.type !== 'todo') return;

  todoResizeContext = { widgetId };
  buildTodoResizeSizeOptions(w);

  dom.todoResizeOverlay.classList.remove('hidden');
  requestAnimationFrame(() => dom.todoResizeOverlay.classList.add('active'));
}


export function closeTodoResizeSheet() {
  if (!dom.todoResizeOverlay) return;

  dom.todoResizeOverlay.classList.remove('active');
  setTimeout(() => dom.todoResizeOverlay.classList.add('hidden'), 450);

  if (dom.todoResizeSizeList) dom.todoResizeSizeList.replaceChildren();
  todoResizeContext = null;
}


async function handleTodoResizeSelect(cols, rows) {
  if (!todoResizeContext) return;

  const { widgetId } = todoResizeContext;
  const { resizeTodoWidget } = await import('./widgets.js');

  if (resizeTodoWidget(widgetId, cols, rows)) {
    closeTodoResizeSheet();
  }
}


export function bindTodoResizeSheetEvents() {
  if (!dom.todoResizeOverlay || !dom.todoResizeSizeList || !dom.todoResizeCancel) return;

  dom.todoResizeCancel.addEventListener('click', closeTodoResizeSheet);

  dom.todoResizeOverlay.addEventListener('click', (e) => {
    if (e.target === dom.todoResizeOverlay) closeTodoResizeSheet();
  });

  dom.todoResizeSizeList.addEventListener('click', (e) => {
    const btn = e.target.closest('.todo-resize-size-option');
    if (!btn) return;

    handleTodoResizeSelect(Number(btn.dataset.cols), Number(btn.dataset.rows));
  });
}
