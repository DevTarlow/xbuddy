// ===== X Buddy — Popup Script =====

// Keep these storage keys in sync with content.js and background.js.
const STORAGE_KEY = 'xbBuddyKeywords';
const NEGATIVE_STORAGE_KEY = 'xbBuddyNegativeKeywords';
const ENABLED_KEY = 'xbBuddyEnabled';
const POSITIVE_ENABLED_KEY = 'xbBuddyPositiveEnabled';
const NEGATIVE_ENABLED_KEY = 'xbBuddyNegativeEnabled';
const GLOW_KEY = 'xbBuddyGlowColor';
const SETTINGS_OPEN_KEY = 'xbBuddySettingsOpen';
const DEFAULT_GLOW_COLOR = '#00ff41';

const PAGE_SIZE = 5;
const MAX_KEYWORD_LENGTH = 100;

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
const positiveSearch = document.getElementById('positive-search');
const positiveSearchClear = document.getElementById('positive-search-clear');
const positivePagination = document.getElementById('positive-pagination');
const positivePrevBtn = document.getElementById('positive-prev-btn');
const positiveNextBtn = document.getElementById('positive-next-btn');
const positivePageInfo = document.getElementById('positive-page-info');
const clearPositiveBtn = document.getElementById('clear-positive-btn');
const negativeKeywordInput = document.getElementById('negative-keyword-input');
const negativeAddBtn = document.getElementById('negative-add-btn');
const negativeKeywordListEl = document.getElementById('negative-keyword-list');
const negativeEmptyState = document.getElementById('negative-empty-state');
const negativeSearch = document.getElementById('negative-search');
const negativeSearchClear = document.getElementById('negative-search-clear');
const negativePagination = document.getElementById('negative-pagination');
const negativePrevBtn = document.getElementById('negative-prev-btn');
const negativeNextBtn = document.getElementById('negative-next-btn');
const negativePageInfo = document.getElementById('negative-page-info');
const clearNegativeBtn = document.getElementById('clear-negative-btn');
const feedRulesSection = document.getElementById('feed-rules-section');
const feedRulesToggle = document.getElementById('feed-rules-toggle');
const feedRuleAction = document.getElementById('feed-rule-action');
const feedRuleMetric = document.getElementById('feed-rule-metric');
const feedRuleOp = document.getElementById('feed-rule-op');
const feedRuleThreshold = document.getElementById('feed-rule-threshold');
const feedRuleAddBtn = document.getElementById('feed-rule-add-btn');
const feedRuleListEl = document.getElementById('feed-rule-list');
const feedRuleEmptyState = document.getElementById('feed-rule-empty-state');
const clearFeedRulesBtn = document.getElementById('clear-feed-rules-btn');
const settingsToggle = document.getElementById('settings-toggle');
const settingsArrow = document.getElementById('settings-arrow');
const settingsBody = document.getElementById('settings-body');
const glowColorInput = document.getElementById('glow-color-input');
const saveGlowColorBtn = document.getElementById('save-glow-color-btn');
const llmUrlInput = document.getElementById('llm-url-input');
const llmApiKeyInput = document.getElementById('llm-api-key-input');
const llmModelInput = document.getElementById('llm-model-input');
const llmModelListEl = document.getElementById('llm-model-list');
const llmFetchModelsBtn = document.getElementById('llm-fetch-models-btn');
const llmTemperatureInput = document.getElementById('llm-temperature-input');
const llmMaxTokensInput = document.getElementById('llm-max-tokens-input');
const llmTimeoutInput = document.getElementById('llm-timeout-input');
const llmDisableThinking = document.getElementById('llm-disable-thinking');
const llmFeedback = document.getElementById('llm-feedback');
const saveLlmBtn = document.getElementById('llm-save-btn');
const toneSelect = document.getElementById('tone-select');
const tonePromptLabel = document.getElementById('tone-prompt-label');
const tonePromptInput = document.getElementById('tone-prompt-input');
const saveToneBtn = document.getElementById('save-tone-btn');
const restoreToneBtn = document.getElementById('restore-tone-btn');
const exportBtn = document.getElementById('export-btn');
const importBtn = document.getElementById('import-btn');
const importInput = document.getElementById('import-input');
const llmDot = document.getElementById('llm-dot');
const llmLabel = document.getElementById('llm-label');

// --- State ---
let keywords = [];
let negativeKeywords = [];
let enabled = true;
let positiveEnabled = true;
let negativeEnabled = true;
let positivePage = 1;
let negativePage = 1;
let positiveSearchQuery = '';
let negativeSearchQuery = '';
let feedRules = [];
let feedRulesEnabled = true;
let glowColor = DEFAULT_GLOW_COLOR;
let settingsOpen = false;
let llmSettings = { ...LLM_DEFAULTS };
let tonePrompts = {};
let currentToneId = DEFAULT_TONE_ID;
let toastTimer = null;

// --- Toast ---
function showToast(msg, type = 'info') {
  if (toastTimer) clearTimeout(toastTimer);
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.toggle('error', type === 'error');
  el.classList.add('visible');
  toastTimer = setTimeout(() => {
    el.classList.remove('visible');
    toastTimer = null;
  }, 2500);
}

function flashSaveFeedback(btn, text, duration = 1500) {
  if (!btn) return;
  if (!btn._originalText) btn._originalText = btn.textContent;
  if (btn._flashTimer) clearTimeout(btn._flashTimer);
  btn.textContent = text;
  btn.disabled = true;
  btn._flashTimer = setTimeout(() => {
    btn.textContent = btn._originalText;
    btn.disabled = false;
    btn._flashTimer = null;
  }, duration);
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

function isValidHexColor(value) {
  return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value);
}

// --- Reply tones ---
function getCurrentTone() {
  return TONES.find(tone => tone.id === currentToneId)
    || TONES.find(tone => tone.id === DEFAULT_TONE_ID)
    || TONES[0];
}

function populateToneSelector() {
  const tone = getCurrentTone();
  currentToneId = tone.id;
  toneSelect.innerHTML = '';
  for (const item of TONES) {
    const option = document.createElement('option');
    option.value = item.id;
    option.textContent = item.label;
    toneSelect.appendChild(option);
  }
  toneSelect.value = currentToneId;
}

function updateToneEditor() {
  const tone = getCurrentTone();
  tonePromptLabel.textContent = `System Prompt (${tone.label}):`;
  tonePromptInput.value = tonePrompts[tone.id] || tone.defaultPrompt;
}

async function loadTonePrompts() {
  const keys = TONES.map(tone => TONE_PROMPT_PREFIX + tone.id);
  try {
    const stored = await chrome.storage.local.get(keys);
    for (const tone of TONES) {
      const value = stored[TONE_PROMPT_PREFIX + tone.id];
      tonePrompts[tone.id] = typeof value === 'string' && value.trim()
        ? value
        : tone.defaultPrompt;
    }
  } catch (e) {
    console.error('[X Buddy] Failed to load tone prompts:', e);
    for (const tone of TONES) tonePrompts[tone.id] = tone.defaultPrompt;
  }
}

// --- Local LLM settings ---
function setLlmFeedback(message, isError = false) {
  llmFeedback.textContent = message || '';
  llmFeedback.classList.toggle('error', Boolean(message) && isError);
}

function populateLlmModels(models) {
  llmModelListEl.innerHTML = '';
  for (const model of models.slice(0, 200)) {
    const option = document.createElement('option');
    option.value = model;
    llmModelListEl.appendChild(option);
  }
}

function applyLlmSettingsToForm() {
  llmUrlInput.value = llmSettings.baseUrl;
  llmApiKeyInput.value = llmSettings.apiKey;
  llmModelInput.value = llmSettings.model;
  llmTemperatureInput.value = String(llmSettings.temperature);
  llmMaxTokensInput.value = String(llmSettings.maxTokens);
  llmTimeoutInput.value = String(llmSettings.timeoutSeconds);
  llmDisableThinking.checked = llmSettings.disableThinking;
}

function readClampedNumber(input, min, max) {
  const raw = input.value.trim();
  if (!raw) return null;
  const num = Number(raw);
  if (!Number.isFinite(num)) return null;
  return Math.min(max, Math.max(min, num));
}

async function saveLlmSettings() {
  const baseUrl = normalizeLlmBaseUrl(llmUrlInput.value);
  if (!baseUrl) {
    flashSaveFeedback(saveLlmBtn, 'Invalid URL');
    setLlmFeedback('Use a localhost or 127.0.0.1 URL', true);
    llmUrlInput.focus();
    return;
  }

  const model = llmModelInput.value.trim();
  if (!model) {
    flashSaveFeedback(saveLlmBtn, 'Model required');
    setLlmFeedback('Enter a model name', true);
    llmModelInput.focus();
    return;
  }
  if (model.length > LLM_LIMITS.modelMaxLength) {
    flashSaveFeedback(saveLlmBtn, 'Model too long');
    setLlmFeedback(`Model names are capped at ${LLM_LIMITS.modelMaxLength} characters`, true);
    llmModelInput.focus();
    return;
  }

  const apiKey = llmApiKeyInput.value.trim();
  if (apiKey.length > LLM_LIMITS.apiKeyMaxLength) {
    flashSaveFeedback(saveLlmBtn, 'Key too long');
    setLlmFeedback(`API keys are capped at ${LLM_LIMITS.apiKeyMaxLength} characters`, true);
    llmApiKeyInput.focus();
    return;
  }

  const temperature = readClampedNumber(
    llmTemperatureInput, LLM_LIMITS.temperatureMin, LLM_LIMITS.temperatureMax
  );
  if (temperature === null) {
    flashSaveFeedback(saveLlmBtn, 'Invalid temperature');
    setLlmFeedback('Temperature must be a number from 0 to 2', true);
    llmTemperatureInput.focus();
    return;
  }

  const maxTokens = readClampedNumber(
    llmMaxTokensInput, LLM_LIMITS.maxTokensMin, LLM_LIMITS.maxTokensMax
  );
  if (maxTokens === null) {
    flashSaveFeedback(saveLlmBtn, 'Invalid tokens');
    setLlmFeedback('Max reply tokens must be a number', true);
    llmMaxTokensInput.focus();
    return;
  }

  const timeoutSeconds = readClampedNumber(
    llmTimeoutInput, LLM_LIMITS.timeoutSecondsMin, LLM_LIMITS.timeoutSecondsMax
  );
  if (timeoutSeconds === null) {
    flashSaveFeedback(saveLlmBtn, 'Invalid timeout');
    setLlmFeedback('Timeout must be a number', true);
    llmTimeoutInput.focus();
    return;
  }

  const next = {
    baseUrl,
    model,
    temperature: Math.round(temperature * 100) / 100,
    maxTokens: Math.round(maxTokens),
    timeoutSeconds: Math.round(timeoutSeconds),
    disableThinking: llmDisableThinking.checked,
    apiKey,
  };

  if (!(await saveFlag(LLM_SETTINGS_KEY, next))) return;

  llmSettings = next;
  applyLlmSettingsToForm();
  setLlmFeedback('');
  flashSaveFeedback(saveLlmBtn, 'Saved ✓');
  checkLlmStatus();
}

async function fetchLlmModels() {
  const baseUrl = normalizeLlmBaseUrl(llmUrlInput.value);
  if (!baseUrl) {
    setLlmFeedback('Use a localhost or 127.0.0.1 URL', true);
    llmUrlInput.focus();
    return;
  }

  const apiKey = llmApiKeyInput.value.trim();
  const originalText = llmFetchModelsBtn.textContent;
  llmFetchModelsBtn.disabled = true;
  llmFetchModelsBtn.textContent = 'Loading…';
  setLlmFeedback('Fetching models…');

  try {
    const response = await chrome.runtime.sendMessage({
      type: 'xb:llm-models',
      baseUrl,
      apiKey,
    });

    if (!response || !response.ok) {
      throw new Error(response?.error || 'Could not fetch models');
    }

    const models = Array.isArray(response.models) ? response.models : [];
    llmUrlInput.value = baseUrl;
    populateLlmModels(models);

    if (models.length === 0) {
      setLlmFeedback('Server returned no models — type the name manually');
    } else {
      setLlmFeedback(`Found ${models.length} model${models.length === 1 ? '' : 's'}`);
    }
  } catch (err) {
    console.error('[X Buddy] Failed to fetch models:', err);
    const message = /Receiving end does not exist|message port closed/i.test(err?.message || '')
      ? 'Reload the extension and try again'
      : (err?.message || 'Could not fetch models');
    setLlmFeedback(message, true);
  } finally {
    llmFetchModelsBtn.disabled = false;
    llmFetchModelsBtn.textContent = originalText;
  }
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
      GLOW_KEY,
      FEED_RULES_KEY,
      FEED_RULES_ENABLED_KEY,
      SETTINGS_OPEN_KEY,
      LLM_SETTINGS_KEY,
    ]);
    keywords = normalizeKeywords(result[STORAGE_KEY] || []);
    negativeKeywords = normalizeKeywords(result[NEGATIVE_STORAGE_KEY] || []);
    enabled = result[ENABLED_KEY] !== false;
    positiveEnabled = result[POSITIVE_ENABLED_KEY] !== false;
    negativeEnabled = result[NEGATIVE_ENABLED_KEY] !== false;
    glowColor = isValidHexColor(result[GLOW_KEY]) ? result[GLOW_KEY] : DEFAULT_GLOW_COLOR;
    feedRules = normalizeFeedRules(result[FEED_RULES_KEY]);
    feedRulesEnabled = result[FEED_RULES_ENABLED_KEY] !== false;
    settingsOpen = result[SETTINGS_OPEN_KEY] === true;
    llmSettings = normalizeLlmSettings(result[LLM_SETTINGS_KEY]);
  } catch (e) {
    console.error('[X Buddy] Failed to load settings:', e);
    showToast('Failed to load settings', 'error');
  }
}

async function saveKeywordList(storageKey, list) {
  try {
    await chrome.storage.local.set({ [storageKey]: list });
    return true;
  } catch (e) {
    console.error('[X Buddy] Failed to save keywords:', e);
    showToast('Failed to save keywords', 'error');
    return false;
  }
}

async function saveFlag(key, value) {
  try {
    await chrome.storage.local.set({ [key]: value });
    return true;
  } catch (e) {
    console.error(`[X Buddy] Failed to save ${key}:`, e);
    showToast('Failed to save setting', 'error');
    return false;
  }
}

// --- Rendering ---
function renderList(config) {
  const {
    containerEl, items, page, setPage, paginationEl, prevBtn, nextBtn,
    pageInfoEl, emptyEl, defaultEmptyText, filter, saveFn, renderFn,
  } = config;

  containerEl.innerHTML = '';

  const displayItems = filter ? items.filter(filter) : items;
  const totalPages = Math.max(1, Math.ceil(displayItems.length / PAGE_SIZE));
  const curPage = Math.min(Math.max(1, page), totalPages);
  setPage(curPage);

  if (displayItems.length === 0) {
    emptyEl.textContent = filter && items.length > 0 ? 'No matching keywords.' : defaultEmptyText;
    emptyEl.style.display = 'block';
    paginationEl.style.display = 'none';
    return;
  }

  emptyEl.style.display = 'none';

  const start = (curPage - 1) * PAGE_SIZE;
  const pageItems = displayItems.slice(start, start + PAGE_SIZE);

  for (const kw of pageItems) {
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
      const saved = await saveFn();
      if (!saved) {
        items.splice(idx, 0, kw);
        return;
      }
      const remaining = filter ? items.filter(filter) : items;
      const remainingPages = Math.max(1, Math.ceil(remaining.length / PAGE_SIZE));
      if (remaining.length === 0) {
        setPage(1);
      } else if (curPage > remainingPages) {
        setPage(remainingPages);
      }
      renderFn();
    });

    li.appendChild(span);
    li.appendChild(delBtn);
    containerEl.appendChild(li);
  }

  if (displayItems.length > PAGE_SIZE) {
    paginationEl.style.display = 'flex';
    pageInfoEl.textContent = `Page ${curPage} of ${totalPages}`;
    prevBtn.disabled = curPage <= 1;
    nextBtn.disabled = curPage >= totalPages;
  } else {
    paginationEl.style.display = 'none';
  }
}

function positiveConfig() {
  return {
    containerEl: keywordListEl,
    items: keywords,
    page: positivePage,
    setPage: (p) => { positivePage = p; },
    paginationEl: positivePagination,
    prevBtn: positivePrevBtn,
    nextBtn: positiveNextBtn,
    pageInfoEl: positivePageInfo,
    emptyEl: emptyState,
    defaultEmptyText: 'No positive keywords yet.',
    filter: positiveSearchQuery ? (kw) => kw.toLowerCase().includes(positiveSearchQuery) : null,
    saveFn: () => saveKeywordList(STORAGE_KEY, keywords),
    renderFn: renderKeywords,
  };
}

function negativeConfig() {
  return {
    containerEl: negativeKeywordListEl,
    items: negativeKeywords,
    page: negativePage,
    setPage: (p) => { negativePage = p; },
    paginationEl: negativePagination,
    prevBtn: negativePrevBtn,
    nextBtn: negativeNextBtn,
    pageInfoEl: negativePageInfo,
    emptyEl: negativeEmptyState,
    defaultEmptyText: 'No negative keywords yet.',
    filter: negativeSearchQuery ? (kw) => kw.toLowerCase().includes(negativeSearchQuery) : null,
    saveFn: () => saveKeywordList(NEGATIVE_STORAGE_KEY, negativeKeywords),
    renderFn: renderNegativeKeywords,
  };
}

function renderKeywords() {
  renderList(positiveConfig());
}

function renderNegativeKeywords() {
  renderList(negativeConfig());
}

// --- Feed rules ---
function fillRuleSelect(select, items) {
  select.innerHTML = '';
  for (const item of items) {
    const option = document.createElement('option');
    option.value = item.id;
    option.textContent = item.label;
    select.appendChild(option);
  }
}

function populateFeedRuleSelectors() {
  fillRuleSelect(feedRuleAction, FEED_RULE_ACTIONS);
  fillRuleSelect(feedRuleMetric, FEED_RULE_METRICS);
  fillRuleSelect(feedRuleOp, FEED_RULE_OPS);
}

function renderFeedRules() {
  feedRuleListEl.innerHTML = '';

  if (feedRules.length === 0) {
    feedRuleEmptyState.style.display = 'block';
    feedRuleListEl.style.display = 'none';
    return;
  }

  feedRuleEmptyState.style.display = 'none';
  feedRuleListEl.style.display = '';

  feedRules.forEach((rule, index) => {
    const label = formatFeedRule(rule);

    const li = document.createElement('li');
    li.className = 'keyword-item rule-item';

    const span = document.createElement('span');
    span.className = 'keyword-text rule-text';
    span.textContent = label;

    const delBtn = document.createElement('button');
    delBtn.className = 'delete-btn';
    delBtn.textContent = '×';
    delBtn.title = `Remove rule: ${label}`;
    delBtn.addEventListener('click', () => deleteFeedRule(index));

    li.appendChild(span);
    li.appendChild(delBtn);
    feedRuleListEl.appendChild(li);
  });
}

async function addFeedRule() {
  const raw = feedRuleThreshold.value.trim();
  const threshold = Number(raw);

  if (!raw || !Number.isInteger(threshold) ||
      threshold < FEED_RULE_LIMITS.thresholdMin ||
      threshold > FEED_RULE_LIMITS.thresholdMax) {
    flashSaveFeedback(feedRuleAddBtn, 'Invalid count');
    showToast(
      `Enter a whole number from 0 to ${FEED_RULE_LIMITS.thresholdMax.toLocaleString('en-US')}`,
      'error'
    );
    feedRuleThreshold.focus();
    return;
  }

  const rule = normalizeFeedRule({
    metric: feedRuleMetric.value,
    op: feedRuleOp.value,
    action: feedRuleAction.value,
    threshold,
  });

  if (!rule) {
    flashSaveFeedback(feedRuleAddBtn, 'Invalid rule');
    showToast('Could not create that rule', 'error');
    return;
  }

  if (feedRules.length >= FEED_RULE_LIMITS.maxRules) {
    flashSaveFeedback(feedRuleAddBtn, 'Rule limit');
    showToast(`Up to ${FEED_RULE_LIMITS.maxRules} feed rules`, 'error');
    return;
  }

  const key = feedRuleKey(rule);
  if (feedRules.some((existing) => feedRuleKey(existing) === key)) {
    flashSaveFeedback(feedRuleAddBtn, 'Already exists');
    showToast('That rule already exists', 'error');
    return;
  }

  feedRules.push(rule);
  if (!(await saveFlag(FEED_RULES_KEY, feedRules))) {
    feedRules.pop();
    return;
  }

  feedRuleThreshold.value = '';
  renderFeedRules();
  showToast('Feed rule added');
}

async function deleteFeedRule(index) {
  if (index < 0 || index >= feedRules.length) return;

  const removed = feedRules.splice(index, 1)[0];
  if (!(await saveFlag(FEED_RULES_KEY, feedRules))) {
    feedRules.splice(index, 0, removed);
    return;
  }

  renderFeedRules();
  showToast('Feed rule removed');
}

async function clearFeedRules() {
  if (feedRules.length === 0) return;
  if (!confirm('Delete all feed rules?')) return;

  const previous = feedRules.slice();
  feedRules.length = 0;

  if (!(await saveFlag(FEED_RULES_KEY, feedRules))) {
    feedRules.push(...previous);
    return;
  }

  renderFeedRules();
  showToast('All feed rules cleared');
}

// --- Add keyword ---
async function addKeyword(input, list, storageKey, addButton, renderFn, setPage, listLabel) {
  const raw = input.value.trim();
  if (!raw) return false;

  if (raw.length > MAX_KEYWORD_LENGTH) {
    flashSaveFeedback(addButton, 'Max 100 chars');
    return false;
  }

  const lowerRaw = raw.toLowerCase();
  if (list.some(kw => kw.toLowerCase() === lowerRaw)) {
    flashSaveFeedback(addButton, 'Already exists');
    input.value = '';
    return false;
  }

  list.push(raw);
  const saved = await saveKeywordList(storageKey, list);
  if (!saved) {
    list.pop();
    return false;
  }

  setPage(Math.ceil(list.length / PAGE_SIZE) || 1);
  renderFn();
  input.value = '';
  input.focus();
  showToast(`Added "${raw}" to ${listLabel} keywords`);
  return true;
}

// --- Clear keyword list ---
async function clearList(list, storageKey, listLabel, renderFn, setPage) {
  if (!confirm(`Delete all ${listLabel} keywords?`)) return;

  const previous = list.slice();
  list.length = 0;
  const saved = await saveKeywordList(storageKey, list);
  if (!saved) {
    list.push(...previous);
    return;
  }

  setPage(1);
  renderFn();
  showToast(`All ${listLabel} keywords cleared`);
}

// --- Export / Import ---
function prepareImportedKeywords(arr) {
  return normalizeKeywords(arr).filter(k => k.length <= MAX_KEYWORD_LENGTH);
}

function buildConfig() {
  return {
    app: 'xbuddy',
    version: 3,
    positive: keywords,
    negative: negativeKeywords,
    positiveEnabled,
    negativeEnabled,
    enabled,
    glowColor,
    feedRules: feedRules.map((rule) => ({ ...rule })),
    feedRulesEnabled,
    tonePrompts: { ...tonePrompts },
    llm: {
      baseUrl: llmSettings.baseUrl,
      model: llmSettings.model,
      temperature: llmSettings.temperature,
      maxTokens: llmSettings.maxTokens,
      timeoutSeconds: llmSettings.timeoutSeconds,
      disableThinking: llmSettings.disableThinking,
    },
  };
}

function exportConfig() {
  const blob = new Blob([JSON.stringify(buildConfig(), null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'xbuddy-config.json';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast('Config exported');
}

function refreshFromState() {
  masterToggle.checked = enabled;
  positiveToggle.checked = positiveEnabled;
  negativeToggle.checked = negativeEnabled;
  feedRulesToggle.checked = feedRulesEnabled;
  glowColorInput.value = glowColor;
  applyLlmSettingsToForm();
  setLlmFeedback('');

  positiveSearch.value = '';
  positiveSearchQuery = '';
  positiveSearchClear.classList.remove('visible');
  negativeSearch.value = '';
  negativeSearchQuery = '';
  negativeSearchClear.classList.remove('visible');
  positivePage = 1;
  negativePage = 1;
  feedRuleThreshold.value = '';

  applyMasterState();
  applyPositiveState();
  applyNegativeState();
  applyFeedRulesState();
  renderKeywords();
  renderNegativeKeywords();
  renderFeedRules();
  updateToneEditor();
}

function importedLlmNumber(value, min, max) {
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  if (typeof value === 'string' && !value.trim()) return null;
  const num = Number(value);
  if (!Number.isFinite(num)) return null;
  return Math.min(max, Math.max(min, num));
}

function applyImportedLlmSettings(raw) {
  if (!raw || typeof raw !== 'object') return null;

  const next = { ...llmSettings };
  let changed = false;

  const baseUrl = normalizeLlmBaseUrl(raw.baseUrl);
  if (baseUrl) {
    next.baseUrl = baseUrl;
    changed = true;
  }

  if (typeof raw.model === 'string') {
    const model = raw.model.trim();
    if (model && model.length <= LLM_LIMITS.modelMaxLength) {
      next.model = model;
      changed = true;
    }
  }

  const temperature = importedLlmNumber(
    raw.temperature, LLM_LIMITS.temperatureMin, LLM_LIMITS.temperatureMax
  );
  if (temperature !== null) {
    next.temperature = Math.round(temperature * 100) / 100;
    changed = true;
  }

  const maxTokens = importedLlmNumber(
    raw.maxTokens, LLM_LIMITS.maxTokensMin, LLM_LIMITS.maxTokensMax
  );
  if (maxTokens !== null) {
    next.maxTokens = Math.round(maxTokens);
    changed = true;
  }

  const timeoutSeconds = importedLlmNumber(
    raw.timeoutSeconds, LLM_LIMITS.timeoutSecondsMin, LLM_LIMITS.timeoutSecondsMax
  );
  if (timeoutSeconds !== null) {
    next.timeoutSeconds = Math.round(timeoutSeconds);
    changed = true;
  }

  if (typeof raw.disableThinking === 'boolean') {
    next.disableThinking = raw.disableThinking;
    changed = true;
  }

  // API keys are local-only and never imported from a config file.
  return changed ? next : null;
}

async function importFullConfig(data) {
  const toSet = {};

  if (Array.isArray(data.positive)) {
    toSet[STORAGE_KEY] = prepareImportedKeywords(data.positive);
  }
  if (Array.isArray(data.negative)) {
    toSet[NEGATIVE_STORAGE_KEY] = prepareImportedKeywords(data.negative);
  }
  if (typeof data.positiveEnabled === 'boolean') toSet[POSITIVE_ENABLED_KEY] = data.positiveEnabled;
  if (typeof data.negativeEnabled === 'boolean') toSet[NEGATIVE_ENABLED_KEY] = data.negativeEnabled;
  if (typeof data.enabled === 'boolean') toSet[ENABLED_KEY] = data.enabled;
  if (isValidHexColor(data.glowColor)) toSet[GLOW_KEY] = data.glowColor;
  if (Array.isArray(data.feedRules)) {
    toSet[FEED_RULES_KEY] = normalizeFeedRules(data.feedRules);
  }
  if (typeof data.feedRulesEnabled === 'boolean') {
    toSet[FEED_RULES_ENABLED_KEY] = data.feedRulesEnabled;
  }
  if (data.tonePrompts && typeof data.tonePrompts === 'object') {
    for (const tone of TONES) {
      const prompt = data.tonePrompts[tone.id];
      if (typeof prompt === 'string' && prompt.trim()) {
        toSet[TONE_PROMPT_PREFIX + tone.id] = prompt;
      }
    }
  }
  if (data.llm && typeof data.llm === 'object') {
    const nextLlm = applyImportedLlmSettings(data.llm);
    if (nextLlm) toSet[LLM_SETTINGS_KEY] = nextLlm;
  }

  if (Object.keys(toSet).length === 0) {
    flashSaveFeedback(importBtn, 'No settings in file');
    showToast('No settings in file', 'error');
    return;
  }

  try {
    await chrome.storage.local.set(toSet);
  } catch (e) {
    console.error('[X Buddy] Failed to import config:', e);
    flashSaveFeedback(importBtn, 'Import failed');
    showToast('Failed to import config', 'error');
    return;
  }

  if (toSet[STORAGE_KEY]) keywords = [...toSet[STORAGE_KEY]];
  if (toSet[NEGATIVE_STORAGE_KEY]) negativeKeywords = [...toSet[NEGATIVE_STORAGE_KEY]];
  if (toSet[ENABLED_KEY] !== undefined) enabled = toSet[ENABLED_KEY];
  if (toSet[POSITIVE_ENABLED_KEY] !== undefined) positiveEnabled = toSet[POSITIVE_ENABLED_KEY];
  if (toSet[NEGATIVE_ENABLED_KEY] !== undefined) negativeEnabled = toSet[NEGATIVE_ENABLED_KEY];
  if (toSet[GLOW_KEY]) glowColor = toSet[GLOW_KEY];
  if (toSet[FEED_RULES_KEY]) feedRules = [...toSet[FEED_RULES_KEY]];
  if (toSet[FEED_RULES_ENABLED_KEY] !== undefined) {
    feedRulesEnabled = toSet[FEED_RULES_ENABLED_KEY];
  }
  if (data.tonePrompts && typeof data.tonePrompts === 'object') {
    for (const tone of TONES) {
      const prompt = data.tonePrompts[tone.id];
      if (typeof prompt === 'string' && prompt.trim()) {
        tonePrompts[tone.id] = prompt;
      }
    }
  }
  if (toSet[LLM_SETTINGS_KEY]) llmSettings = { ...toSet[LLM_SETTINGS_KEY] };

  refreshFromState();
  flashSaveFeedback(importBtn, 'Imported ✓');
  showToast('Config imported');
  checkLlmStatus();
}

async function importLegacy(data) {
  const incomingPositive = Array.isArray(data)
    ? data
    : (Array.isArray(data.positive) ? data.positive : []);
  const incomingNegative = !Array.isArray(data) && Array.isArray(data.negative)
    ? data.negative
    : [];

  const previousPositive = keywords.slice();
  const previousNegative = negativeKeywords.slice();
  let added = 0;

  for (const raw of incomingPositive) {
    if (typeof raw !== 'string') continue;
    const keyword = raw.trim();
    if (!keyword || keyword.length > MAX_KEYWORD_LENGTH) continue;
    if (keywords.some(k => k.toLowerCase() === keyword.toLowerCase())) continue;
    keywords.push(keyword);
    added++;
  }

  for (const raw of incomingNegative) {
    if (typeof raw !== 'string') continue;
    const keyword = raw.trim();
    if (!keyword || keyword.length > MAX_KEYWORD_LENGTH) continue;
    if (negativeKeywords.some(k => k.toLowerCase() === keyword.toLowerCase())) continue;
    negativeKeywords.push(keyword);
    added++;
  }

  if (added === 0) {
    flashSaveFeedback(importBtn, 'Nothing new');
    showToast('No new keywords in file');
    return;
  }

  try {
    await chrome.storage.local.set({
      [STORAGE_KEY]: keywords,
      [NEGATIVE_STORAGE_KEY]: negativeKeywords,
    });
  } catch (e) {
    keywords = previousPositive;
    negativeKeywords = previousNegative;
    console.error('[X Buddy] Failed to import keywords:', e);
    flashSaveFeedback(importBtn, 'Import failed');
    showToast('Failed to import keywords', 'error');
    return;
  }

  refreshFromState();
  flashSaveFeedback(importBtn, 'Imported ✓');
  showToast(`Imported ${added} keyword${added === 1 ? '' : 's'}`);
}

async function handleImportFile() {
  const file = importInput.files[0];
  if (!file) return;

  try {
    const data = JSON.parse(await file.text());

    if (data && !Array.isArray(data) && data.app && data.app !== 'xbuddy') {
      flashSaveFeedback(importBtn, 'Wrong app');
      showToast('Not an X Buddy config', 'error');
      return;
    }

    if (data && !Array.isArray(data) && typeof data.version === 'number') {
      await importFullConfig(data);
      return;
    }

    if (Array.isArray(data) || (data && (Array.isArray(data.positive) || Array.isArray(data.negative)))) {
      await importLegacy(data);
      return;
    }

    flashSaveFeedback(importBtn, 'No keywords in file');
    showToast('No keywords in file', 'error');
  } catch (e) {
    console.error('[X Buddy] Import failed:', e);
    flashSaveFeedback(importBtn, 'Invalid file');
    showToast('Invalid config file', 'error');
  } finally {
    importInput.value = '';
  }
}

// --- Toggle UI ---
function applyMasterState() {
  controls.classList.toggle('feature-disabled', !enabled);
  positiveToggle.disabled = !enabled;
  negativeToggle.disabled = !enabled;
  feedRulesToggle.disabled = !enabled;
}

function applyPositiveState() {
  positiveSection.classList.toggle('feature-disabled', !positiveEnabled);
}

function applyNegativeState() {
  negativeSection.classList.toggle('feature-disabled', !negativeEnabled);
}

function applyFeedRulesState() {
  feedRulesSection.classList.toggle('feature-disabled', !feedRulesEnabled);
}

function applySettingsState() {
  settingsBody.classList.toggle('collapsed', !settingsOpen);
  settingsArrow.textContent = settingsOpen ? '▼' : '▶';
  settingsToggle.setAttribute('aria-expanded', String(settingsOpen));
}

// --- LLM connection check ---
async function checkLlmStatus() {
  llmDot.className = 'dot';
  llmLabel.textContent = 'Checking…';

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
    showToast(enabled ? 'X Buddy enabled' : 'X Buddy disabled');
  } else {
    masterToggle.checked = enabled;
  }
});

positiveToggle.addEventListener('change', async () => {
  const next = positiveToggle.checked;
  if (await saveFlag(POSITIVE_ENABLED_KEY, next)) {
    positiveEnabled = next;
    applyPositiveState();
    showToast(positiveEnabled ? 'Positive highlighting enabled' : 'Positive highlighting disabled');
  } else {
    positiveToggle.checked = positiveEnabled;
  }
});

negativeToggle.addEventListener('change', async () => {
  const next = negativeToggle.checked;
  if (await saveFlag(NEGATIVE_ENABLED_KEY, next)) {
    negativeEnabled = next;
    applyNegativeState();
    showToast(negativeEnabled ? 'Negative filtering enabled' : 'Negative filtering disabled');
  } else {
    negativeToggle.checked = negativeEnabled;
  }
});

feedRulesToggle.addEventListener('change', async () => {
  const next = feedRulesToggle.checked;
  if (await saveFlag(FEED_RULES_ENABLED_KEY, next)) {
    feedRulesEnabled = next;
    applyFeedRulesState();
    showToast(feedRulesEnabled ? 'Feed rules enabled' : 'Feed rules disabled');
  } else {
    feedRulesToggle.checked = feedRulesEnabled;
  }
});

feedRuleAddBtn.addEventListener('click', addFeedRule);

feedRuleThreshold.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') feedRuleAddBtn.click();
});

clearFeedRulesBtn.addEventListener('click', clearFeedRules);

addBtn.addEventListener('click', async () => {
  if (!keywordInput.value.trim()) return;
  positiveSearch.value = '';
  positiveSearchQuery = '';
  positiveSearchClear.classList.remove('visible');
  await addKeyword(
    keywordInput, keywords, STORAGE_KEY, addBtn, renderKeywords,
    (p) => { positivePage = p; }, 'positive'
  );
});

keywordInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') addBtn.click();
});

negativeAddBtn.addEventListener('click', async () => {
  if (!negativeKeywordInput.value.trim()) return;
  negativeSearch.value = '';
  negativeSearchQuery = '';
  negativeSearchClear.classList.remove('visible');
  await addKeyword(
    negativeKeywordInput, negativeKeywords, NEGATIVE_STORAGE_KEY, negativeAddBtn,
    renderNegativeKeywords, (p) => { negativePage = p; }, 'negative'
  );
});

negativeKeywordInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') negativeAddBtn.click();
});

// --- Search ---
positiveSearch.addEventListener('input', () => {
  positiveSearchQuery = positiveSearch.value.trim().toLowerCase();
  positiveSearchClear.classList.toggle('visible', positiveSearch.value.length > 0);
  positivePage = 1;
  renderKeywords();
});

positiveSearchClear.addEventListener('click', () => {
  positiveSearch.value = '';
  positiveSearchQuery = '';
  positiveSearchClear.classList.remove('visible');
  positivePage = 1;
  renderKeywords();
  positiveSearch.focus();
});

negativeSearch.addEventListener('input', () => {
  negativeSearchQuery = negativeSearch.value.trim().toLowerCase();
  negativeSearchClear.classList.toggle('visible', negativeSearch.value.length > 0);
  negativePage = 1;
  renderNegativeKeywords();
});

negativeSearchClear.addEventListener('click', () => {
  negativeSearch.value = '';
  negativeSearchQuery = '';
  negativeSearchClear.classList.remove('visible');
  negativePage = 1;
  renderNegativeKeywords();
  negativeSearch.focus();
});

// --- Pagination ---
positivePrevBtn.addEventListener('click', () => {
  positivePage -= 1;
  renderKeywords();
});

positiveNextBtn.addEventListener('click', () => {
  positivePage += 1;
  renderKeywords();
});

negativePrevBtn.addEventListener('click', () => {
  negativePage -= 1;
  renderNegativeKeywords();
});

negativeNextBtn.addEventListener('click', () => {
  negativePage += 1;
  renderNegativeKeywords();
});

// --- Clear all ---
clearPositiveBtn.addEventListener('click', async () => {
  positiveSearch.value = '';
  positiveSearchQuery = '';
  positiveSearchClear.classList.remove('visible');
  await clearList(
    keywords, STORAGE_KEY, 'positive', renderKeywords,
    (p) => { positivePage = p; }
  );
});

clearNegativeBtn.addEventListener('click', async () => {
  negativeSearch.value = '';
  negativeSearchQuery = '';
  negativeSearchClear.classList.remove('visible');
  await clearList(
    negativeKeywords, NEGATIVE_STORAGE_KEY, 'negative', renderNegativeKeywords,
    (p) => { negativePage = p; }
  );
});

// --- Settings ---
settingsToggle.addEventListener('click', async () => {
  settingsOpen = !settingsOpen;
  applySettingsState();
  await saveFlag(SETTINGS_OPEN_KEY, settingsOpen);
});

saveGlowColorBtn.addEventListener('click', async () => {
  const value = glowColorInput.value;
  if (!isValidHexColor(value)) {
    flashSaveFeedback(saveGlowColorBtn, 'Invalid color');
    return;
  }
  if (await saveFlag(GLOW_KEY, value)) {
    glowColor = value;
    flashSaveFeedback(saveGlowColorBtn, 'Saved ✓');
  }
});

saveLlmBtn.addEventListener('click', saveLlmSettings);
llmFetchModelsBtn.addEventListener('click', fetchLlmModels);

toneSelect.addEventListener('change', () => {
  currentToneId = toneSelect.value;
  updateToneEditor();
});

saveToneBtn.addEventListener('click', async () => {
  const value = tonePromptInput.value.trim();
  if (!value) {
    flashSaveFeedback(saveToneBtn, 'Prompt is empty');
    return;
  }
  const tone = getCurrentTone();
  if (await saveFlag(TONE_PROMPT_PREFIX + tone.id, value)) {
    tonePrompts[tone.id] = value;
    flashSaveFeedback(saveToneBtn, 'Saved ✓');
  }
});

restoreToneBtn.addEventListener('click', async () => {
  const tone = getCurrentTone();
  tonePromptInput.value = tone.defaultPrompt;
  if (await saveFlag(TONE_PROMPT_PREFIX + tone.id, tone.defaultPrompt)) {
    tonePrompts[tone.id] = tone.defaultPrompt;
    flashSaveFeedback(restoreToneBtn, 'Restored ✓');
  }
});

exportBtn.addEventListener('click', exportConfig);
importBtn.addEventListener('click', () => importInput.click());
importInput.addEventListener('change', handleImportFile);

// --- Init ---
(async function init() {
  await loadState();
  await loadTonePrompts();
  populateToneSelector();
  updateToneEditor();
  populateFeedRuleSelectors();
  masterToggle.checked = enabled;
  positiveToggle.checked = positiveEnabled;
  negativeToggle.checked = negativeEnabled;
  feedRulesToggle.checked = feedRulesEnabled;
  glowColorInput.value = glowColor;
  applyLlmSettingsToForm();
  applyMasterState();
  applyPositiveState();
  applyNegativeState();
  applyFeedRulesState();
  applySettingsState();
  renderKeywords();
  renderNegativeKeywords();
  renderFeedRules();
  checkLlmStatus();
})();
