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
  memoCarouselIndex: 0,
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
};

export const DEFAULT_MEMO_PROFILE = {
  coverImage: '',
  headerText: '오늘도 좋은 하루 되세요',
  profileImage: '',
  displayName: 'Guest',
};

const MEMO_PROFILE_STORAGE_KEY = 'memento_memo_profile';

export const memoWidgetSizes = [
  { label: '3×3', subtitle: 'Small', cols: 3, rows: 3 },
  { label: '4×4', subtitle: 'Medium', cols: 4, rows: 4 },
  { label: '6×5', subtitle: 'Large', cols: 6, rows: 5 },
];


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
