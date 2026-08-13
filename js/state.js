/* ═══════════════════════════════════════════════════════════
   MEMENTO DIARY — Global State & Persistence
   ═══════════════════════════════════════════════════════════ */

export const state = {
  entries: JSON.parse(localStorage.getItem('memento_entries') || '[]'),
  currentDiary: null,
  calendarDate: new Date(),
  sortAsc: true,

  // Editor grid state
  gridCols: 10,
  gridRows: 8,
  occupiedCells: {}, // key: "row-col" → widgetId
  widgets: [],       // placed widgets for current diary
  widgetIdCounter: 0,

  // Placement mode
  placementMode: false,
  placementSize: null,
  placementImage: null,
  placementType: null,

  // Carousel
  carouselIndex: 0,
  todoCarouselIndex: 0,
  memoCarouselIndex: 1,
  widgetSizes: [
    { label: '2×2', subtitle: 'Square — Small', cols: 2, rows: 2 },
    { label: '2×3', subtitle: 'Vertical — Small', cols: 2, rows: 3 },
    { label: '3×2', subtitle: 'Horizontal — Small', cols: 3, rows: 2 },
    { label: '3×3', subtitle: 'Square — Medium', cols: 3, rows: 3 },
    { label: '4×2', subtitle: 'Horizontal — Wide', cols: 4, rows: 2 },
    { label: '3×4', subtitle: 'Vertical — Tall', cols: 3, rows: 4 },
    { label: '4×4', subtitle: 'Square — Large', cols: 4, rows: 4 },
    { label: '5×3', subtitle: 'Horizontal — Panoramic', cols: 5, rows: 3 },
  ],

  // Font size for editor title
  titleFontSize: 28,

  memoProfile: null,
  memoData: null,
};

export const DEFAULT_MEMO_PROFILE = {
  coverImage: '',
  headerText: '오늘도 좋은 하루 되세요',
  profileImage: '',
  displayName: 'Guest',
};

const MEMO_PROFILE_STORAGE_KEY = 'memento_memo_profile';
export const MEMO_DATA_STORAGE_KEY = 'memento_memo_data';

export const memoWidgetSizes = [
  { label: '2×3', subtitle: '작게', cols: 2, rows: 3 },
  { label: '3×4', subtitle: '중간', cols: 3, rows: 4 },
  { label: '4×5', subtitle: '크게', cols: 4, rows: 5 },
];


function normalizeMemoTemplateIdField(templateId) {
  return templateId || 'basic';
}


function normalizeSharedMemoPage(page) {
  page.templateId = normalizeMemoTemplateIdField(page.templateId);
  if (page.category == null) page.category = '';
  if (page.date == null) page.date = '';
  if (page.title == null) page.title = '';
  if (page.content == null) page.content = '';
  delete page.sessionGroupId;
  delete page.sessionOrder;
  delete page.sessionTotal;
  delete page.editorSheetId;
  delete page.draftId;
}


function normalizeSharedMemoDraft(draft) {
  if (!draft || typeof draft !== 'object') return;
  if (!draft.id || typeof draft.id !== 'string' || !draft.id.trim()) {
    draft.id = crypto.randomUUID();
  } else {
    draft.id = draft.id.trim();
  }
  draft.templateId = normalizeMemoTemplateIdField(draft.templateId);
  if (draft.category == null) draft.category = '';
  if (draft.date == null) draft.date = '';
  if (draft.title == null) draft.title = '';
  if (typeof draft.content !== 'string') draft.content = draft.content == null ? '' : String(draft.content);
  if (draft.sourcePageId == null) draft.sourcePageId = '';
  if (draft.isContinuation == null) draft.isContinuation = false;
  if (!draft.createdAt) draft.createdAt = draft.updatedAt || new Date(0).toISOString();
  if (!draft.updatedAt) draft.updatedAt = draft.createdAt;
}


function dedupeMemoDraftIds(memo) {
  if (!memo || !Array.isArray(memo.drafts)) return;
  const seen = new Set();
  memo.drafts.forEach((draft) => {
    if (!draft?.id) return;
    if (seen.has(draft.id)) {
      console.warn('[Memo] duplicate draft id detected, reassigning:', draft.id);
      draft.id = crypto.randomUUID();
    }
    seen.add(draft.id);
  });
}


function migrateMemoDraftPagesToDrafts(memo) {
  if (!Array.isArray(memo.drafts)) memo.drafts = [];
  if (!Array.isArray(memo.draftPages)) return;

  memo.draftPages.forEach((page) => {
    if (!page?.id || memo.drafts.some((draft) => draft.id === page.id)) return;
    memo.drafts.push({
      id: page.id,
      title: page.title ?? '',
      content: page.content ?? '',
      date: page.date ?? '',
      category: page.category ?? memo.category ?? '',
      templateId: page.templateId ?? 'basic',
      createdAt: page.createdAt ?? page.updatedAt ?? new Date(0).toISOString(),
      updatedAt: page.updatedAt ?? page.createdAt ?? new Date(0).toISOString(),
      isContinuation: Boolean(page.isContinuation),
      sourcePageId: '',
    });
  });
  delete memo.draftPages;
}


function normalizeSharedMemo(memo) {
  if (memo.category == null || memo.category === 'default') memo.category = '';
  if (memo.coverImage == null) memo.coverImage = '';
  if (!Array.isArray(memo.pages)) memo.pages = [];
  migrateMemoDraftPagesToDrafts(memo);
  if (!Array.isArray(memo.drafts)) memo.drafts = [];
  memo.pages.forEach(normalizeSharedMemoPage);
  memo.drafts = memo.drafts.filter((draft) => draft && typeof draft === 'object');
  memo.drafts.forEach(normalizeSharedMemoDraft);
  dedupeMemoDraftIds(memo);
}


function normalizeMemoCategoryRecord(category) {
  if (!category || typeof category !== 'object') return null;
  const id = typeof category.id === 'string' ? category.id.trim() : '';
  const name = typeof category.name === 'string' ? category.name.trim() : '';
  if (!id || !name) return null;
  return { id, name };
}


function normalizeMemoCategories(categories) {
  if (!Array.isArray(categories)) return [];
  const seen = new Set();
  const result = [];
  categories.forEach((category) => {
    const normalized = normalizeMemoCategoryRecord(category);
    if (!normalized || seen.has(normalized.id)) return;
    seen.add(normalized.id);
    result.push(normalized);
  });
  return result;
}


function normalizeMemoActiveCategory(activeCategory, categories) {
  if (!activeCategory || activeCategory === 'all') return 'all';
  return categories.some((c) => c.id === activeCategory) ? activeCategory : 'all';
}


function reconcileMemoCategoryAssignments(memos, categoryIds) {
  memos.forEach((memo) => {
    if (memo.category && !categoryIds.has(memo.category)) {
      memo.category = '';
    }
  });
}


function loadMemoDataFromStorage() {
  try {
    const raw = localStorage.getItem(MEMO_DATA_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && Array.isArray(parsed.memos)) {
        return parsed;
      }
    }
  } catch {
    /* ignore */
  }
  return { memos: [], categories: [], activeCategory: 'all' };
}


export function ensureMemoData() {
  if (!state.memoData || typeof state.memoData !== 'object') {
    state.memoData = loadMemoDataFromStorage();
  }
  if (!Array.isArray(state.memoData.memos)) {
    state.memoData.memos = [];
  }
  if (!Array.isArray(state.memoData.categories)) {
    state.memoData.categories = [];
  }
  state.memoData.categories = normalizeMemoCategories(state.memoData.categories);
  state.memoData.activeCategory = normalizeMemoActiveCategory(
    state.memoData.activeCategory,
    state.memoData.categories
  );
  state.memoData.memos.forEach(normalizeSharedMemo);
  reconcileMemoCategoryAssignments(
    state.memoData.memos,
    new Set(state.memoData.categories.map((c) => c.id))
  );
  return state.memoData;
}


export function getMemoCategories() {
  return ensureMemoData().categories;
}


export function getMemoActiveCategory() {
  return ensureMemoData().activeCategory ?? 'all';
}


export function setMemoActiveCategory(categoryId) {
  ensureMemoData();
  if (!categoryId || categoryId === 'all') {
    state.memoData.activeCategory = 'all';
  } else if (state.memoData.categories.some((c) => c.id === categoryId)) {
    state.memoData.activeCategory = categoryId;
  } else {
    state.memoData.activeCategory = 'all';
  }
  saveMemoData();
}


export function getSharedMemos() {
  return ensureMemoData().memos;
}


export function saveMemoData() {
  ensureMemoData();
  localStorage.setItem(MEMO_DATA_STORAGE_KEY, JSON.stringify(state.memoData));
}


function collectMemosFromWidget(widget, byId) {
  if (widget?.type !== 'memo' || !Array.isArray(widget.memos)) return;
  widget.memos.forEach((memo) => {
    if (!memo?.id) return;
    const existing = byId.get(memo.id);
    if (!existing) {
      byId.set(memo.id, memo);
      return;
    }
    const existingTime = new Date(existing.updatedAt || existing.createdAt || 0).getTime();
    const nextTime = new Date(memo.updatedAt || memo.createdAt || 0).getTime();
    if (nextTime >= existingTime) {
      byId.set(memo.id, memo);
    }
  });
}


export function migrateMemoDataFromEntries() {
  ensureMemoData();

  const byId = new Map();
  state.memoData.memos.forEach((memo) => {
    if (memo?.id) byId.set(memo.id, memo);
  });

  let imported = false;
  for (const entry of state.entries) {
    for (const widget of entry.widgets ?? []) {
      const before = byId.size;
      collectMemosFromWidget(widget, byId);
      if (byId.size > before) imported = true;
    }
  }

  for (const widget of state.widgets ?? []) {
    const before = byId.size;
    collectMemosFromWidget(widget, byId);
    if (byId.size > before) imported = true;
  }

  const merged = Array.from(byId.values());
  merged.forEach(normalizeSharedMemo);
  state.memoData.memos = merged;

  if (imported || merged.length > 0) {
    saveMemoData();
  }
}


/* ── Persistence ────────────────────────────────────── */
export function saveEntries() {
  localStorage.setItem('memento_entries', JSON.stringify(state.entries));
}


function loadMemoProfileFromStorage() {
  try {
    const raw = localStorage.getItem(MEMO_PROFILE_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        return parsed;
      }
    }
  } catch {
    /* ignore */
  }
  return { ...DEFAULT_MEMO_PROFILE };
}


export function ensureMemoProfile() {
  if (!state.memoProfile || typeof state.memoProfile !== 'object') {
    state.memoProfile = loadMemoProfileFromStorage();
  }

  state.memoProfile = {
    coverImage: state.memoProfile.coverImage ?? '',
    headerText: state.memoProfile.headerText ?? DEFAULT_MEMO_PROFILE.headerText,
    profileImage: state.memoProfile.profileImage ?? '',
    displayName: state.memoProfile.displayName ?? DEFAULT_MEMO_PROFILE.displayName,
  };

  return state.memoProfile;
}


export function saveMemoProfile() {
  ensureMemoProfile();
  localStorage.setItem(MEMO_PROFILE_STORAGE_KEY, JSON.stringify(state.memoProfile));
}


function isMemoProfileMeaningful(profile) {
  if (!profile || typeof profile !== 'object') return false;

  return Boolean(
    profile.coverImage
    || profile.profileImage
    || (profile.headerText && profile.headerText !== DEFAULT_MEMO_PROFILE.headerText)
    || (profile.displayName && profile.displayName !== DEFAULT_MEMO_PROFILE.displayName)
  );
}


export function migrateMemoProfileFromEntries() {
  ensureMemoProfile();

  if (isMemoProfileMeaningful(state.memoProfile)) {
    return;
  }

  for (const entry of state.entries) {
    const widgets = entry.widgets ?? [];
    for (const widget of widgets) {
      if (widget.type !== 'memo' || !widget.profile) continue;
      if (!isMemoProfileMeaningful(widget.profile)) continue;

      state.memoProfile = {
        coverImage: widget.profile.coverImage ?? '',
        headerText: widget.profile.headerText ?? DEFAULT_MEMO_PROFILE.headerText,
        profileImage: widget.profile.profileImage ?? '',
        displayName: widget.profile.displayName ?? DEFAULT_MEMO_PROFILE.displayName,
      };
      saveMemoProfile();
      return;
    }
  }
}
