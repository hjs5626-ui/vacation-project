/* ═══════════════════════════════════════════════════════════
   MEMENTO DIARY — Ledger API Client (Mocked with localStorage)
   ═══════════════════════════════════════════════════════════ */

function getLedgers() {
  try {
    const data = localStorage.getItem('memento_ledgers');
    return data ? JSON.parse(data) : {};
  } catch {
    return {};
  }
}

function saveLedgers(data) {
  try {
    localStorage.setItem('memento_ledgers', JSON.stringify(data));
  } catch (e) {
    console.error("Failed to save ledgers to localStorage", e);
  }
}

function getWidgetKey(diaryId, widgetId) {
  return `${diaryId}_${widgetId}`;
}

export async function fetchLedgerItems(diaryId, widgetId) {
  const ledgers = getLedgers();
  const key = getWidgetKey(diaryId, widgetId);
  return ledgers[key] || [];
}

export async function createLedgerItem(diaryId, widgetId, payload) {
  const ledgers = getLedgers();
  const key = getWidgetKey(diaryId, widgetId);
  if (!ledgers[key]) ledgers[key] = [];
  
  const newItem = {
    ...payload,
    id: `l_${Date.now()}_${Math.floor(Math.random()*1000)}`
  };
  
  ledgers[key].push(newItem);
  saveLedgers(ledgers);
  return newItem;
}

export async function updateLedgerItem(diaryId, widgetId, itemId, payload) {
  const ledgers = getLedgers();
  const key = getWidgetKey(diaryId, widgetId);
  if (!ledgers[key]) throw new Error("Widget not found");
  
  const idx = ledgers[key].findIndex(i => i.id === itemId);
  if (idx === -1) throw new Error("Item not found");
  
  ledgers[key][idx] = { ...ledgers[key][idx], ...payload };
  saveLedgers(ledgers);
  return ledgers[key][idx];
}

export async function deleteLedgerItem(diaryId, widgetId, itemId) {
  const ledgers = getLedgers();
  const key = getWidgetKey(diaryId, widgetId);
  if (ledgers[key]) {
    ledgers[key] = ledgers[key].filter(i => i.id !== itemId);
    saveLedgers(ledgers);
  }
  return { success: true };
}

export async function deleteLedgerWidget(diaryId, widgetId) {
  const ledgers = getLedgers();
  const key = getWidgetKey(diaryId, widgetId);
  if (ledgers[key]) {
    delete ledgers[key];
    saveLedgers(ledgers);
  }
  return { success: true };
}
