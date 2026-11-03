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

const LLM_URL = 'http://localhost:8080/v1/chat/completions';
const LLM_MODELS_URL = 'http://localhost:8080/v1/models';
const LLM_MODEL = 'gemma-4-E4B-it-QAT-Q4_0.gguf';
const REQUEST_TIMEOUT_MS = 60000;

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
    const value = stored[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  } catch (err) {
    console.warn('[X Buddy] Could not load tone prompt:', err);
  }
  return tone.defaultPrompt;
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

  const systemPrompt = await loadTonePrompt(toneId);

  const body = JSON.stringify({
    model: LLM_MODEL,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `Write a reply to this post:\n\n${post}` },
    ],
    temperature: 0.7,
    max_tokens: 250,
    // Gemma 4 is a reasoning model. Thinking tokens add ~5s of latency and
    // occasionally leave the model with a reasoning-only completion; this
    // server (llama.cpp) honours the standard chat-template switch.
    chat_template_kwargs: { enable_thinking: false },
  });

  const resp = await fetch(LLM_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!resp.ok) throw new Error(`LLM returned HTTP ${resp.status}`);

  const data = await resp.json();
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

async function checkLlmStatus() {
  const resp = await fetch(LLM_MODELS_URL, {
    method: 'GET',
    signal: AbortSignal.timeout(4000),
  });
  return resp.ok;
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

  return false;
});
