/* ═══════════════════════════════════════════════════════════
   MEMENTO DIARY — DOM Cache
   ═══════════════════════════════════════════════════════════ */

export const $ = (sel) => document.querySelector(sel);
export const $$ = (sel) => document.querySelectorAll(sel);

export const dom = {
  mainPage: $('#main-page'),
  editorPage: $('#editor-page'),
  addModalOverlay: $('#add-modal-overlay'),
  addModal: $('#add-modal'),
  addBtn: $('#add-btn'),
  addModalClose: $('#add-modal-close'),

  // Modal steps
  stepChoose: $('#modal-step-choose'),
  stepFile: $('#modal-step-file'),
  stepDiary: $('#modal-step-diary'),
  chooseFile: $('#choose-file'),
  chooseDiary: $('#choose-diary'),
  fileBack: $('#file-back'),
  diaryBack: $('#diary-back'),

  // File creation
  fileColorPicker: $('#file-color-picker'),
  fileTitleInput: $('#file-title-input'),
  fileVisibility: $('#file-visibility'),
  fileAllowedUsers: $('#file-allowed-users'),
  fileCreateBtn: $('#file-create-btn'),

  // Diary creation
  diaryColorPicker: $('#diary-color-picker'),
  diaryTitleInput: $('#diary-title-input'),
  diaryVisibility: $('#diary-visibility'),
  diaryCreateBtn: $('#diary-create-btn'),

  // Main grid
  entriesGrid: $('#entries-grid'),
  emptyState: $('#empty-state'),
  entryCount: $('#entry-count'),

  // Profile Editor Overlay
  profileEditorOverlay: $('#profile-editor-overlay'),
  peBackBtn: $('#pe-back'),
  peSaveBtn: $('#pe-save'),
  peCoverPreview: $('#pe-cover-preview'),
  peCoverInput: $('#pe-cover-input'),
  peCoverSelectBtn: $('#pe-cover-select'),
  peCoverRemoveBtn: $('#pe-cover-remove'),
  peAvatarPreview: $('#pe-avatar-preview'),
  peProfileInput: $('#pe-profile-input'),
  peProfileSelectBtn: $('#pe-profile-select'),
  peProfileRemoveBtn: $('#pe-profile-remove'),
  peDisplayName: $('#pe-display-name'),
  peHeaderText: $('#pe-header-text'),

  // Sort
  sortBtn: $('#sort-btn'),

  // Calendar
  calMonth: $('#cal-month'),
  calDays: $('#cal-days'),
  calPrev: $('#cal-prev'),
  calNext: $('#cal-next'),
  calWeekdays: $('#cal-weekdays'),

  // Editor
  editorBack: $('#editor-back'),
  editorSave: $('#editor-save'),
  editorTitle: $('#editor-title'),
  editorLabel: $('#editor-label'),
  fontDec: $('#font-dec'),
  fontInc: $('#font-inc'),
  fontSizeDisplay: $('#font-size-display'),
  editorWorkspace: $('#editor-workspace'),
  editorMap: $('#editor-map'),
  legoGridContainer: $('#lego-grid-container'),
  legoGrid: $('#lego-grid'),
  
  // Book Overview
  pageOverviewOverlay: $('#page-overview-overlay'),
  closeOverviewBtn: $('#close-overview'),
  overviewGrid: $('#overview-grid'),
  bookSpine: $('#book-spine'),

  // Placement
  placementOverlay: $('#placement-overlay'),
  cancelPlacement: $('#cancel-placement'),

  // FAB
  fabAdd: $('#fab-add'),

  // Drawer
  drawerOverlay: $('#drawer-overlay'),
  drawer: $('#drawer'),
  drawerTabs: $('#drawer-tabs'),
  drawerContent: $('#drawer-content'),
  carouselViewport: $('#carousel-viewport'),
  carouselPrev: $('#carousel-prev'),
  carouselNext: $('#carousel-next'),
  carouselDots: $('#carousel-dots'),
  btnChooseSize: $('#btn-choose-size'),

  // To-Do carousel
  todoCarouselViewport: $('#todo-carousel-viewport'),
  todoCarouselPrev: $('#todo-carousel-prev'),
  todoCarouselNext: $('#todo-carousel-next'),
  todoCarouselDots: $('#todo-carousel-dots'),
  btnChooseTodoSize: $('#btn-choose-todo-size'),

  // To-Do compose sheet
  todoComposeOverlay: $('#todo-compose-overlay'),
  todoComposeHeading: $('#todo-compose-heading'),
  todoComposeTitle: $('#todo-compose-title'),
  todoComposeCancel: $('#todo-compose-cancel'),
  todoComposeSubmit: $('#todo-compose-submit'),

  // To-Do group rename modal
  todoRenameOverlay: $('#todo-rename-overlay'),
  todoRenameInput: $('#todo-rename-input'),
  todoRenameCancel: $('#todo-rename-cancel'),
  todoRenameSubmit: $('#todo-rename-submit'),

  // To-Do resize sheet
  todoResizeOverlay: $('#todo-resize-overlay'),
  todoResizeSizeList: $('#todo-resize-size-list'),
  todoResizeCancel: $('#todo-resize-cancel'),

  // Ledger carousel
  ledgerCarouselViewport: $('#ledger-carousel-viewport'),
  ledgerCarouselPrev: $('#ledger-carousel-prev'),
  ledgerCarouselNext: $('#ledger-carousel-next'),
  ledgerCarouselDots: $('#ledger-carousel-dots'),
  btnChooseLedger: $('#btn-choose-ledger'),

  // Memo carousel
  memoCarouselViewport: $('#memo-carousel-viewport'),
  memoCarouselPrev: $('#memo-carousel-prev'),
  memoCarouselNext: $('#memo-carousel-next'),
  memoCarouselDots: $('#memo-carousel-dots'),
  btnChooseMemo: $('#btn-choose-memo'),

  // Memo fullscreen
  memoFullscreenOverlay: $('#memo-fullscreen-overlay'),
  memoFullscreenBack: $('#memo-fullscreen-back'),
  memoFullscreenTitle: $('#memo-fullscreen-title'),
  memoFullscreenBody: $('#memo-fullscreen-body'),

  // Confirm
  confirmOverlay: $('#confirm-overlay'),
  confirmImage: $('#confirm-image'),
  confirmYes: $('#confirm-yes'),
  confirmNo: $('#confirm-no'),

  // File input
  fileInputHidden: $('#file-input-hidden'),

  // Context Menu
  ctxMenu: $('#context-menu'),
  ctxEdit: $('#ctx-edit'),
  ctxDelete: $('#ctx-delete'),

  // Toast
  toast: $('#toast'),
  toastMsg: $('#toast-msg'),

  // App dialogs (confirm / input / choice / color)
  appConfirmOverlay: $('#app-confirm-overlay'),
  appConfirmPanel: $('#app-confirm-panel'),
  appConfirmTitle: $('#app-confirm-title'),
  appConfirmMessage: $('#app-confirm-message'),
  appConfirmOk: $('#app-confirm-ok'),
  appConfirmCancel: $('#app-confirm-cancel'),
  appInputOverlay: $('#app-input-overlay'),
  appInputPanel: $('#app-input-panel'),
  appInputTitle: $('#app-input-title'),
  appInputField: $('#app-input-field'),
  appInputError: $('#app-input-error'),
  appInputConfirm: $('#app-input-confirm'),
  appInputCancel: $('#app-input-cancel'),
  appChoiceOverlay: $('#app-choice-overlay'),
  appChoicePanel: $('#app-choice-panel'),
  appChoiceTitle: $('#app-choice-title'),
  appChoiceMessage: $('#app-choice-message'),
  appChoiceList: $('#app-choice-list'),
  appChoiceCancel: $('#app-choice-cancel'),
  appColorOverlay: $('#app-color-overlay'),
  appColorPanel: $('#app-color-panel'),
  appColorTitle: $('#app-color-title'),
  appColorPreview: $('#app-color-preview'),
  appColorPalette: $('#app-color-palette'),
  appColorCustomBtn: $('#app-color-custom-btn'),
  appColorNativeInput: $('#app-color-native-input'),
  appColorCancel: $('#app-color-cancel'),
  appColorApply: $('#app-color-apply'),
};
