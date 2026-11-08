// ===== X Buddy — Background Service Worker =====
// The LLM request must happen here, not in the content script.
// Chrome now blocks page-origin requests from x.com to loopback (localhost)
// via Local Network Access. Extension pages/service workers with the
// localhost host permission are allowed to make the request.

importScripts('shared.js');

// Keep these storage keys in sync with content.js and popup.js.
const KEYWORDS_KEY = 'xbBuddyKeywords';
const NEGATIVE_KEYWORDS_KEY = 'xbBuddyNegativeKeywords';
const NOTIFICATION_KEY = 'xbBuddyNotification';
const MENU_POSITIVE = 'xb-add-positive';
const MENU_NEGATIVE = 'xb-add-negative';
const MAX_KEYWORD_LENGTH = 100;

const LLM_STATUS_TIMEOUT_MS = 4000;
const LLM_MODELS_TIMEOUT_MS = 10000;

async function resolveLlmSettings(overrides) {
  let stored = {};
  try {
    const result = await chrome.storage.local.get(LLM_SETTINGS_KEY);
    stored = result[LLM_SETTINGS_KEY];
  } catch (err) {
    console.warn('[X Buddy] Could not load LLM settings:', err);
  }

  const merged = stored && typeof stored === 'object' ? { ...stored } : {};
  if (overrides && typeof overrides === 'object') {
    for (const key of [
      'baseUrl', 'model', 'temperature', 'maxTokens',
      'timeoutSeconds', 'disableThinking', 'apiKey',
    ]) {
      if (overrides[key] !== undefined) merged[key] = overrides[key];
    }
  }

  return normalizeLlmSettings(merged);
}

function llmHeaders(settings, withContentType = false) {
  const headers = {};
  if (withContentType) headers['Content-Type'] = 'application/json';
  if (settings.apiKey) headers.Authorization = `Bearer ${settings.apiKey}`;
  return headers;
}

function isTimeoutError(err) {
  return err?.name === 'TimeoutError' || err?.name === 'AbortError';
}

async function llmHttpError(resp) {
  if (resp.status === 401 || resp.status === 403) {
    return new Error('LLM server rejected the API key');
  }
  if (resp.status === 404) {
    return new Error('LLM endpoint or model not found');
  }

  let detail = '';
  try {
    const text = await resp.text();
    if (text) detail = text.replace(/\s+/g, ' ').trim().slice(0, 200);
  } catch {
    // The body is optional for the error message.
  }

  return new Error(`LLM returned HTTP ${resp.status}${detail ? ` — ${detail}` : ''}`);
}

function getTone(toneId) {
  return TONES.find((tone) => tone.id === toneId)
    || TONES.find((tone) => tone.id === DEFAULT_TONE_ID)
    || TONES[0];
}

async function loadTonePrompt(toneId) {
  const tone = getTone(toneId);
  const key = TONE_PROMPT_PREFIX + tone.id;
  try {
    const stored = await chrome.storage.local.get(key);
    return resolveTonePrompt(tone, stored[key]);
  } catch (err) {
    console.warn('[X Buddy] Could not load tone prompt:', err);
    return tone.defaultPrompt;
  }
}

async function loadReplyLength() {
  try {
    const stored = await chrome.storage.local.get(REPLY_LENGTH_KEY);
    return normalizeReplyLength(stored[REPLY_LENGTH_KEY]);
  } catch (err) {
    console.warn('[X Buddy] Could not load reply length:', err);
    return DEFAULT_REPLY_LENGTH;
  }
}

function cleanReply(text) {
  let out = String(text || '').trim();
  out = out.replace(/^```[a-z]*\s*/i, '').replace(/```\s*$/i, '').trim();
  out = out.replace(/^(?:reply|response)\s*:\s*/i, '').trim();
  out = out.replace(/^["“”'](.*)["“”']$/s, '$1').trim();
  return out;
}

async function generateReply(postText, toneId) {
  const post = String(postText || '').trim().slice(0, 6000);
  if (!post) throw new Error('No post text to reply to');

  const settings = await resolveLlmSettings();
  if (!settings.model) {
    throw new Error('No model selected — choose one in Settings');
  }
  const [systemPrompt, replyLength] = await Promise.all([
    loadTonePrompt(toneId),
    loadReplyLength(),
  ]);
  const userPrompt = `Write a reply to this post:\n\n${post}\n\n${buildReplyLengthInstruction(replyLength)}`;

  const body = JSON.stringify({
    model: settings.model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    temperature: settings.temperature,
    max_tokens: settings.maxTokens,
    // Reasoning models spend tokens on thinking. Thinking adds ~5s of latency
    // and occasionally leaves the model with a reasoning-only completion; this
    // server (llama.cpp) honours the standard chat-template switch. Only send
    // the switch when the user has it enabled.
    ...(settings.disableThinking
      ? { chat_template_kwargs: { enable_thinking: false } }
      : {}),
  });

  let resp;
  try {
    resp = await fetch(`${settings.baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: llmHeaders(settings, true),
      body,
      signal: AbortSignal.timeout(settings.timeoutSeconds * 1000),
    });
  } catch (err) {
    if (isTimeoutError(err)) {
      throw new Error(`LLM request timed out after ${settings.timeoutSeconds}s — increase Timeout`);
    }
    throw new Error(`Could not reach LLM server at ${settings.baseUrl}`);
  }

  if (!resp.ok) throw await llmHttpError(resp);

  let data;
  try {
    data = await resp.json();
  } catch {
    throw new Error('LLM returned an unreadable response');
  }

  const choice = data?.choices?.[0];

  // OpenAI-compatible response format
  const content = choice?.message?.content ?? choice?.delta?.content ?? data?.content ?? data?.response;
  if (typeof content === 'string' && content.trim()) {
    const reply = cleanReply(content);
    if (reply) return reply;
  }

  // Reasoning-only completion — never inject chain-of-thought into the composer.
  if (choice?.message?.reasoning_content) {
    throw new Error('Model returned reasoning only — try again');
  }

  throw new Error('Unexpected LLM response');
}

async function fetchLlmModels(settings) {
  let resp;
  try {
    resp = await fetch(`${settings.baseUrl}/v1/models`, {
      method: 'GET',
      headers: llmHeaders(settings),
      signal: AbortSignal.timeout(LLM_MODELS_TIMEOUT_MS),
    });
  } catch (err) {
    if (isTimeoutError(err)) {
      throw new Error('Timed out while fetching models');
    }
    throw new Error(`Could not reach LLM server at ${settings.baseUrl}`);
  }

  if (!resp.ok) throw await llmHttpError(resp);

  let data;
  try {
    data = await resp.json();
  } catch {
    throw new Error('LLM server did not return a model list');
  }

  const raw = Array.isArray(data?.data)
    ? data.data
    : (Array.isArray(data?.models) ? data.models : (Array.isArray(data) ? data : []));
  const seen = new Set();
  const models = [];

  for (const item of raw) {
    const id = typeof item === 'string' ? item : item?.id;
    if (typeof id !== 'string') continue;
    const model = id.trim();
    if (!model || seen.has(model)) continue;
    seen.add(model);
    models.push(model);
  }

  models.sort((a, b) => a.localeCompare(b));
  return models.slice(0, 200);
}

async function checkLlmStatus() {
  try {
    const settings = await resolveLlmSettings();
    const resp = await fetch(`${settings.baseUrl}/v1/models`, {
      method: 'GET',
      headers: llmHeaders(settings),
      signal: AbortSignal.timeout(LLM_STATUS_TIMEOUT_MS),
    });
    return resp.ok;
  } catch {
    return false;
  }
}

// ===================================================================
//  CONTEXT MENUS
// ===================================================================

function normalizeKeywordList(arr) {
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

async function setNotification(payload) {
  try {
    await chrome.storage.local.set({ [NOTIFICATION_KEY]: payload });
  } catch (err) {
    console.warn('[X Buddy] Failed to set keyword notification:', err);
  }
}

function setupContextMenus() {
  chrome.contextMenus.removeAll(() => {
    const documentUrlPatterns = ['https://x.com/*', 'https://twitter.com/*'];

    chrome.contextMenus.create({
      id: MENU_POSITIVE,
      title: 'Add "%s" to Positive Keywords',
      contexts: ['selection'],
      documentUrlPatterns,
    }, () => void chrome.runtime.lastError);

    chrome.contextMenus.create({
      id: MENU_NEGATIVE,
      title: 'Add "%s" to Negative Keywords',
      contexts: ['selection'],
      documentUrlPatterns,
    }, () => void chrome.runtime.lastError);
  });
}

chrome.runtime.onInstalled.addListener(setupContextMenus);
chrome.runtime.onStartup.addListener(setupContextMenus);

// Unpacked reloads do not always fire onInstalled, so recreate the menus when
// the service worker starts as well.
setupContextMenus();

chrome.contextMenus.onClicked.addListener(async (info) => {
  if (info.menuItemId !== MENU_POSITIVE && info.menuItemId !== MENU_NEGATIVE) return;

  let keyword = String(info.selectionText || '').replace(/\s+/g, ' ').trim();
  if (!keyword) return;

  keyword = keyword.replace(/^#+/, '').trim();
  if (!keyword) return;

  if (keyword.length > MAX_KEYWORD_LENGTH) {
    await setNotification({ error: 'Keyword is too long (max 100 characters)' });
    return;
  }

  const storageKey = info.menuItemId === MENU_POSITIVE ? KEYWORDS_KEY : NEGATIVE_KEYWORDS_KEY;
  const listType = info.menuItemId === MENU_POSITIVE ? 'positive' : 'negative';

  try {
    const result = await chrome.storage.local.get(storageKey);
    const list = normalizeKeywordList(result[storageKey]);
    const lower = keyword.toLowerCase();

    if (list.some(k => k.toLowerCase() === lower)) {
      await chrome.storage.local.set({
        [NOTIFICATION_KEY]: { keyword, listType, duplicate: true },
      });
      return;
    }

    list.push(keyword);
    await chrome.storage.local.set({
      [storageKey]: list,
      [NOTIFICATION_KEY]: { keyword, listType },
    });
  } catch (err) {
    console.warn('[X Buddy] Failed to save keyword from context menu:', err);
    await setNotification({ error: 'Failed to save keyword' });
  }
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'xb:generate-reply') {
    generateReply(message.postText, message.toneId)
      .then((reply) => sendResponse({ ok: true, reply }))
      .catch((err) => sendResponse({ ok: false, error: err?.message || 'LLM request failed' }));
    return true; // async response
  }

  if (message?.type === 'xb:llm-status') {
    checkLlmStatus()
      .then((ok) => sendResponse({ ok }))
      .catch(() => sendResponse({ ok: false }));
    return true;
  }

  if (message?.type === 'xb:llm-models') {
    const baseUrl = normalizeLlmBaseUrl(message.baseUrl);
    if (!baseUrl) {
      sendResponse({ ok: false, error: 'Invalid server URL' });
      return false;
    }

    resolveLlmSettings({
      baseUrl,
      apiKey: typeof message.apiKey === 'string' ? message.apiKey : undefined,
    })
      .then((settings) => fetchLlmModels(settings))
      .then((models) => sendResponse({ ok: true, models }))
      .catch((err) => sendResponse({ ok: false, error: err?.message || 'Could not fetch models' }));
    return true;
  }

  return false;
});
