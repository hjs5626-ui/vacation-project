/* Memo page editor — continuous document reflow across session sheets */

import {
  cloneEditorSheet,
  createEditorSheetId,
} from './memo-editor-session.js';
import { splitHtmlAtSheetLimitForSheet } from './memo-sheet-overflow.js';

const MAX_REFLOW_ITERATIONS = 48;

function createContinuationSheet(templateSheet, content) {
  return cloneEditorSheet({
    editorSheetId: createEditorSheetId(),
    pageId: null,
    draftId: templateSheet?.draftId ?? null,
    templateId: templateSheet?.templateId,
    memoCategoryId: templateSheet?.memoCategoryId ?? '',
    date: '',
    title: '',
    content: content ?? '',
    insertPosition: templateSheet?.insertPosition ?? 'after-current',
    isTemporary: false,
    isContinuation: true,
  });
}

function sheetIsContinuationAtIndex(index, sheet) {
  return index > 0 || Boolean(sheet?.isContinuation);
}

function normalizeSheetHtml(html) {
  return html ?? '';
}

/**
 * Reflow session sheets forward (push overflow) and backward (pull content).
 * SSOT: returns new sheets array + activeSheetIndex; caller writes to session.
 */
export function reflowEditorSessionSheets(session, contentEditor, { memoHtmlHasVisibleContent }) {
  if (!session?.sheets?.length || !contentEditor) {
    return {
      changed: false,
      sheets: session?.sheets ?? [],
      activeSheetIndex: session?.activeSheetIndex ?? 0,
    };
  }

  const sheets = session.sheets.map((sheet) => cloneEditorSheet(sheet));
  let activeSheetIndex = session.activeSheetIndex;
  let changed = false;
  let iterations = 0;

  while (iterations < MAX_REFLOW_ITERATIONS) {
    iterations += 1;
    let passChanged = false;

    for (let i = 0; i < sheets.length; i += 1) {
      const isCont = sheetIsContinuationAtIndex(i, sheets[i]);
      const content = normalizeSheetHtml(sheets[i].content);
      const { fitHtml, overflowHtml } = splitHtmlAtSheetLimitForSheet(contentEditor, content, isCont);

      if (!overflowHtml?.trim()) continue;

      if (fitHtml !== content) {
        sheets[i].content = fitHtml;
        passChanged = true;
      }

      if (i + 1 < sheets.length) {
        const merged = overflowHtml + normalizeSheetHtml(sheets[i + 1].content);
        if (merged !== sheets[i + 1].content) {
          sheets[i + 1].content = merged;
          passChanged = true;
        }
      } else {
        sheets.push(createContinuationSheet(sheets[i], overflowHtml));
        passChanged = true;
      }
    }

    for (let i = 0; i < sheets.length - 1; i += 1) {
      const isCont = sheetIsContinuationAtIndex(i, sheets[i]);
      const current = normalizeSheetHtml(sheets[i].content);
      const next = normalizeSheetHtml(sheets[i + 1].content);
      if (!next) continue;

      const combined = current + next;
      const { fitHtml, overflowHtml } = splitHtmlAtSheetLimitForSheet(contentEditor, combined, isCont);

      if (fitHtml !== current || overflowHtml !== next) {
        sheets[i].content = fitHtml;
        sheets[i + 1].content = overflowHtml;
        passChanged = true;
      }
    }

    for (let i = sheets.length - 1; i > 0; i -= 1) {
      if (!memoHtmlHasVisibleContent(sheets[i].content)) {
        sheets.splice(i, 1);
        if (activeSheetIndex >= i) {
          activeSheetIndex = Math.max(0, activeSheetIndex - 1);
        }
        passChanged = true;
      }
    }

    if (!passChanged) break;
    changed = true;
  }

  if (activeSheetIndex >= sheets.length) {
    activeSheetIndex = Math.max(0, sheets.length - 1);
    changed = true;
  }

  return { changed, sheets, activeSheetIndex };
}
