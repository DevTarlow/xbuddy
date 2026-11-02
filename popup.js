// ===== X Buddy — Popup Script =====

// Keep these storage keys in sync with content.js and background.js.
const STORAGE_KEY = 'xbBuddyKeywords';
const NEGATIVE_STORAGE_KEY = 'xbBuddyNegativeKeywords';
const ENABLED_KEY = 'xbBuddyEnabled';
const POSITIVE_ENABLED_KEY = 'xbBuddyPositiveEnabled';
const NEGATIVE_ENABLED_KEY = 'xbBuddyNegativeEnabled';

// --- DOM refs ---
const masterToggle = document.getElementById('master-toggle');
const controls = document.getElementById('controls');
const positiveToggle = document.getElementById('positive-toggle');
const positiveSection = document.getElementById('positive-section');
const negativeToggle = document.getElementById('negative-toggle');
const negativeSection = document.getElementById('negative-section');
const keywordInput = document.getElementById('keyword-input');
const addBtn = document.getElementById('add-btn');
const keywordListEl = document.getElementById('keyword-list');
const emptyState = document.getElementById('empty-state');
const negativeKeywordInput = document.getElementById('negative-keyword-input');
const negativeAddBtn = document.getElementById('negative-add-btn');
const negativeKeywordListEl = document.getElementById('negative-keyword-list');
const negativeEmptyState = document.getElementById('negative-empty-state');
const llmDot = document.getElementById('llm-dot');
const llmLabel = document.getElementById('llm-label');

// --- State ---
let keywords = [];
let negativeKeywords = [];
let enabled = true;
let positiveEnabled = true;
let negativeEnabled = true;
let toastTimer = null;

// --- Toast ---
function showToast(msg) {
  if (toastTimer) clearTimeout(toastTimer);
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('visible');
  toastTimer = setTimeout(() => {
    el.classList.remove('visible');
    toastTimer = null;
  }, 2500);
}

// --- Normalization ---
function normalizeKeywords(arr) {
  if (!Array.isArray(arr)) return [];
  const seen = new Set();
  const out = [];
  for (const item of arr) {
    if (typeof item !== 'string') continue;
    const keyword = item.trim();
    if (!keyword) continue;
    const lower = keyword.toLowerCase();
    if (seen.has(lower)) continue;
    seen.add(lower);
    out.push(keyword);
  }
  return out;
}

// --- Storage helpers ---
async function loadState() {
  try {
    const result = await chrome.storage.local.get([
      STORAGE_KEY,
      NEGATIVE_STORAGE_KEY,
      ENABLED_KEY,
      POSITIVE_ENABLED_KEY,
      NEGATIVE_ENABLED_KEY,
    ]);
    keywords = normalizeKeywords(result[STORAGE_KEY] || []);
    negativeKeywords = normalizeKeywords(result[NEGATIVE_STORAGE_KEY] || []);
    enabled = result[ENABLED_KEY] !== false;
    positiveEnabled = result[POSITIVE_ENABLED_KEY] !== false;
    negativeEnabled = result[NEGATIVE_ENABLED_KEY] !== false;
  } catch (e) {
    console.error('[X Buddy] Failed to load settings:', e);
    showToast('Failed to load settings');
  }
}

async function saveKeywordList(storageKey, list) {
  try {
    await chrome.storage.local.set({ [storageKey]: list });
    return true;
  } catch (e) {
    console.error('[X Buddy] Failed to save keywords:', e);
    showToast('Failed to save keywords');
    return false;
  }
}

async function saveFlag(key, value) {
  try {
    await chrome.storage.local.set({ [key]: value });
    return true;
  } catch (e) {
    console.error(`[X Buddy] Failed to save ${key}:`, e);
    showToast('Failed to save setting');
    return false;
  }
}

// --- Rendering ---
function renderList(config) {
  const { listEl, emptyEl, items, emptyText, storageKey, renderFn } = config;
  listEl.innerHTML = '';

  if (items.length === 0) {
    emptyEl.textContent = emptyText;
    emptyEl.style.display = 'block';
    return;
  }

  emptyEl.style.display = 'none';

  for (const kw of items) {
    const li = document.createElement('li');
    li.className = 'keyword-item';

    const span = document.createElement('span');
    span.className = 'keyword-text';
    span.textContent = kw;

    const delBtn = document.createElement('button');
    delBtn.className = 'delete-btn';
    delBtn.textContent = '×';
    delBtn.title = `Remove "${kw}"`;
    delBtn.addEventListener('click', async () => {
      const idx = items.findIndex(k => k === kw);
      if (idx === -1) return;
      items.splice(idx, 1);
      const saved = await saveKeywordList(storageKey, items);
      if (!saved) {
        items.splice(idx, 0, kw);
        return;
      }
      renderFn();
    });

    li.appendChild(span);
    li.appendChild(delBtn);
    listEl.appendChild(li);
  }
}

function renderKeywords() {
  renderList({
    listEl: keywordListEl,
    emptyEl: emptyState,
    items: keywords,
    emptyText: 'No positive keywords yet.',
    storageKey: STORAGE_KEY,
    renderFn: renderKeywords,
  });
}

function renderNegativeKeywords() {
  renderList({
    listEl: negativeKeywordListEl,
    emptyEl: negativeEmptyState,
    items: negativeKeywords,
    emptyText: 'No negative keywords yet.',
    storageKey: NEGATIVE_STORAGE_KEY,
    renderFn: renderNegativeKeywords,
  });
}

// --- Add keyword ---
async function addKeyword(input, list, storageKey, renderFn) {
  const raw = input.value.trim();
  if (!raw) return;

  const lowerRaw = raw.toLowerCase();
  if (list.some(kw => kw.toLowerCase() === lowerRaw)) {
    input.value = '';
    return;
  }

  list.push(raw);
  const saved = await saveKeywordList(storageKey, list);
  if (!saved) {
    list.pop();
    return;
  }

  renderFn();
  input.value = '';
  input.focus();
}

// --- Toggle UI ---
function applyMasterState() {
  controls.classList.toggle('feature-disabled', !enabled);
  positiveToggle.disabled = !enabled;
  negativeToggle.disabled = !enabled;
}

function applyPositiveState() {
  positiveSection.classList.toggle('feature-disabled', !positiveEnabled);
}

function applyNegativeState() {
  negativeSection.classList.toggle('feature-disabled', !negativeEnabled);
}

// --- LLM connection check ---
async function checkLlmStatus() {
  try {
    // Route the health check through the same background path Magic Reply uses,
    // so the popup cannot report "Connected" while replies are blocked.
    const resp = await chrome.runtime.sendMessage({ type: 'xb:llm-status' });
    if (resp && resp.ok) {
      llmDot.className = 'dot connected';
      llmLabel.textContent = '● Connected';
    } else {
      llmDot.className = 'dot offline';
      llmLabel.textContent = '○ Offline';
    }
  } catch {
    llmDot.className = 'dot offline';
    llmLabel.textContent = '○ Offline';
  }
}

// --- Event listeners ---
masterToggle.addEventListener('change', async () => {
  const next = masterToggle.checked;
  if (await saveFlag(ENABLED_KEY, next)) {
    enabled = next;
    applyMasterState();
  } else {
    masterToggle.checked = enabled;
  }
});

positiveToggle.addEventListener('change', async () => {
  const next = positiveToggle.checked;
  if (await saveFlag(POSITIVE_ENABLED_KEY, next)) {
    positiveEnabled = next;
    applyPositiveState();
  } else {
    positiveToggle.checked = positiveEnabled;
  }
});

negativeToggle.addEventListener('change', async () => {
  const next = negativeToggle.checked;
  if (await saveFlag(NEGATIVE_ENABLED_KEY, next)) {
    negativeEnabled = next;
    applyNegativeState();
  } else {
    negativeToggle.checked = negativeEnabled;
  }
});

addBtn.addEventListener('click', () => {
  addKeyword(keywordInput, keywords, STORAGE_KEY, renderKeywords);
});

keywordInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') addBtn.click();
});

negativeAddBtn.addEventListener('click', () => {
  addKeyword(negativeKeywordInput, negativeKeywords, NEGATIVE_STORAGE_KEY, renderNegativeKeywords);
});

negativeKeywordInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') negativeAddBtn.click();
});

// --- Init ---
(async function init() {
  await loadState();
  masterToggle.checked = enabled;
  positiveToggle.checked = positiveEnabled;
  negativeToggle.checked = negativeEnabled;
  applyMasterState();
  applyPositiveState();
  applyNegativeState();
  renderKeywords();
  renderNegativeKeywords();
  checkLlmStatus();
})();
