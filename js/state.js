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
};


/* ── Persistence ────────────────────────────────────── */
export function saveEntries() {
  localStorage.setItem('memento_entries', JSON.stringify(state.entries));
}
