/* Memo page editor — multi-sheet writing session */

const pageEditorSessions = new Map();

export function createEditorSheetId() {
  return crypto.randomUUID();
}

export function cloneEditorSheet(sheet) {
  if (!sheet) return null;
  return {
    editorSheetId: sheet.editorSheetId || createEditorSheetId(),
    pageId: sheet.pageId ?? null,
    draftId: sheet.draftId ?? null,
    templateId: sheet.templateId,
    memoCategoryId: sheet.memoCategoryId ?? '',
    date: sheet.date ?? '',
    title: sheet.title ?? '',
    content: sheet.content ?? '',
    insertPosition: sheet.insertPosition ?? 'after-current',
    isTemporary: sheet.isTemporary ?? false,
    isContinuation: Boolean(sheet.isContinuation),
  };
}

export function sheetFromPageDraft(draft, clonePageDraft) {
  const base = clonePageDraft ? clonePageDraft(draft) : draft;
  return cloneEditorSheet(base);
}

function inferSourceType(sheet) {
  if (sheet?.pageId) return 'page';
  if (sheet?.draftId) return 'draft';
  return 'new';
}

function createSession(widgetId, { memoId = null, sourceType = 'new', sessionGroupId = null } = {}) {
  const id = sessionGroupId || crypto.randomUUID();
  return {
    id,
    widgetId,
    memoId,
    sourceType,
    sessionGroupId: id,
    sheets: [],
    activeSheetIndex: 0,
    createdAt: new Date().toISOString(),
  };
}

export function resetAllEditorSessions() {
  pageEditorSessions.clear();
}

export function resetEditorSession(widgetId) {
  pageEditorSessions.delete(widgetId);
}

export function getEditorSession(widgetId) {
  return pageEditorSessions.get(widgetId) ?? null;
}

export function initEditorSessionWithSheet(
  widgetId,
  sheet,
  { memoId = null, sourceType = null, sessionGroupId = null } = {},
  clonePageDraft
) {
  const session = createSession(widgetId, {
    memoId,
    sourceType: sourceType ?? inferSourceType(sheet),
    sessionGroupId,
  });
  session.sheets = [sheetFromPageDraft(sheet, clonePageDraft)];
  session.activeSheetIndex = 0;
  pageEditorSessions.set(widgetId, session);
  return session;
}

export function initEditorSessionWithSheets(
  widgetId,
  sheets,
  {
    memoId = null,
    sourceType = 'draft',
    sessionGroupId = null,
    activeSheetIndex = 0,
  } = {},
  clonePageDraft
) {
  const session = createSession(widgetId, { memoId, sourceType, sessionGroupId });
  session.sheets = sheets.map((sheet) => sheetFromPageDraft(sheet, clonePageDraft));
  session.activeSheetIndex = Math.max(0, Math.min(activeSheetIndex, session.sheets.length - 1));
  pageEditorSessions.set(widgetId, session);
  return session;
}

export function migrateLegacyQueueToSession(widgetId, currentDraft, queue, clonePageDraft) {
  const existingSession = getEditorSession(widgetId);
  const sessionGroupId = existingSession?.sessionGroupId ?? null;
  const sheets = [...queue.map((item) => sheetFromPageDraft(item, clonePageDraft))];
  if (currentDraft) {
    sheets.push(sheetFromPageDraft(currentDraft, clonePageDraft));
  }
  if (!sheets.length && currentDraft) {
    sheets.push(sheetFromPageDraft(currentDraft, clonePageDraft));
  }
  return initEditorSessionWithSheets(
    widgetId,
    sheets,
    {
      memoId: existingSession?.memoId ?? null,
      sourceType: existingSession?.sourceType ?? inferSourceType(currentDraft),
      activeSheetIndex: existingSession?.activeSheetIndex ?? Math.max(0, sheets.length - 1),
      sessionGroupId,
    },
    clonePageDraft
  );
}

export function ensureEditorSessionFromDraft(widgetId, draft, clonePageDraft, { memoId = null } = {}) {
  if (!draft) return getEditorSession(widgetId);

  let session = getEditorSession(widgetId);
  if (!session) {
    session = initEditorSessionWithSheet(
      widgetId,
      draft,
      { memoId, sourceType: inferSourceType(draft) },
      clonePageDraft
    );
    return session;
  }

  syncCurrentDraftIntoSession(widgetId, draft, clonePageDraft);
  if (memoId && !session.memoId) session.memoId = memoId;
  return session;
}

export function getEditorSessionSheets(widgetId) {
  return getEditorSession(widgetId)?.sheets ?? [];
}

export function getEditorSessionSheetCount(widgetId) {
  return getEditorSessionSheets(widgetId).length;
}

export function getActiveEditorSheetIndex(widgetId) {
  const session = getEditorSession(widgetId);
  return session?.activeSheetIndex ?? 0;
}

export function getActiveEditorSheet(widgetId) {
  const session = getEditorSession(widgetId);
  if (!session?.sheets.length) return null;
  return session.sheets[session.activeSheetIndex] ?? null;
}

export function getSessionGroupId(widgetId) {
  return getEditorSession(widgetId)?.sessionGroupId ?? null;
}

export function syncSheetIntoSession(widgetId, index, patch) {
  const session = getEditorSession(widgetId);
  if (!session || index < 0 || index >= session.sheets.length) return;
  session.sheets[index] = cloneEditorSheet({ ...session.sheets[index], ...patch });
}

export function syncCurrentDraftIntoSession(widgetId, draft, clonePageDraft) {
  const session = getEditorSession(widgetId);
  if (!session || !draft) return null;
  const idx = session.activeSheetIndex;
  session.sheets[idx] = sheetFromPageDraft({ ...session.sheets[idx], ...clonePageDraft(draft) }, clonePageDraft);
  return session.sheets[idx];
}

export function setActiveEditorSheetIndex(widgetId, index) {
  const session = getEditorSession(widgetId);
  if (!session || index < 0 || index >= session.sheets.length) return false;
  session.activeSheetIndex = index;
  return true;
}

export function appendContinuationSheetAfterActive(
  widgetId,
  {
    initialContent = '',
    templateId,
    memoCategoryId,
    insertPosition,
    draftId = null,
  } = {}
) {
  const session = getEditorSession(widgetId);
  if (!session?.sheets.length) return null;

  const afterIndex = session.activeSheetIndex;
  const current = session.sheets[afterIndex];

  const newSheet = cloneEditorSheet({
    editorSheetId: createEditorSheetId(),
    pageId: null,
    draftId: afterIndex === 0 ? draftId ?? current.draftId ?? null : null,
    templateId: templateId || current.templateId,
    memoCategoryId: memoCategoryId || current.memoCategoryId,
    date: '',
    title: '',
    content: initialContent ?? '',
    insertPosition: insertPosition || current.insertPosition || 'after-current',
    isTemporary: false,
    isContinuation: true,
  });

  session.sheets.splice(afterIndex + 1, 0, newSheet);
  session.activeSheetIndex = afterIndex + 1;
  return newSheet;
}

export function appendContinuationSheetAtEnd(
  widgetId,
  {
    initialContent = '',
    templateId,
    memoCategoryId,
    insertPosition,
  } = {}
) {
  const session = getEditorSession(widgetId);
  if (!session?.sheets.length) return null;

  const lastIndex = session.sheets.length - 1;
  session.activeSheetIndex = lastIndex;
  return appendContinuationSheetAfterActive(widgetId, {
    initialContent,
    templateId,
    memoCategoryId,
    insertPosition,
    draftId: session.sheets[0]?.draftId ?? null,
  });
}

export function filterSavableSessionSheets(sheets, hasVisibleContent) {
  if (!Array.isArray(sheets) || !sheets.length) return [];
  return sheets.filter((sheet, index) => {
    if (index === 0) return true;
    if (!sheet.isContinuation) return true;
    return hasVisibleContent(sheet.content);
  });
}

export function sessionHasMultipleSheets(widgetId) {
  return getEditorSessionSheetCount(widgetId) > 1;
}

export function collectSessionSheetContents(widgetId) {
  return getEditorSessionSheets(widgetId).map((sheet) => sheet.content ?? '');
}

export function collectSessionDraftIds(widgetId) {
  const ids = new Set();
  getEditorSessionSheets(widgetId).forEach((sheet) => {
    if (sheet.draftId) ids.add(sheet.draftId);
  });
  return ids;
}

/** @deprecated Use getEditorSessionSheets — returns all sheets except active (legacy queue shape) */
export function getLegacyQueueSheets(widgetId) {
  const session = getEditorSession(widgetId);
  if (!session?.sheets.length) return [];
  const active = session.activeSheetIndex;
  return session.sheets.filter((_, index) => index !== active).map(cloneEditorSheet);
}
