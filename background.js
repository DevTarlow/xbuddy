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

async function loadVoiceConfig() {
  try {
    const stored = await chrome.storage.local.get([
      VOICE_KEY,
      VOICE_RULES_KEY,
      VOICE_RULES_ENABLED_KEY,
      VOICE_STYLE_KEY,
    ]);
    return resolveVoiceSettings({
      persona: stored[VOICE_KEY],
      rules: stored[VOICE_RULES_KEY],
      rulesEnabled: stored[VOICE_RULES_ENABLED_KEY],
      style: stored[VOICE_STYLE_KEY],
    });
  } catch (err) {
    console.warn('[X Buddy] Could not load voice settings:', err);
    return resolveVoiceSettings({});
  }
}

async function loadPostExamples() {
  try {
    const stored = await chrome.storage.local.get(POST_EXAMPLES_KEY);
    return resolvePostExamples(stored[POST_EXAMPLES_KEY]);
  } catch (err) {
    console.warn('[X Buddy] Could not load post examples:', err);
    return DEFAULT_POST_EXAMPLES;
  }
}

async function loadReplyExamples() {
  try {
    const stored = await chrome.storage.local.get(REPLY_EXAMPLES_KEY);
    return resolveReplyExamples(stored[REPLY_EXAMPLES_KEY]);
  } catch (err) {
    console.warn('[X Buddy] Could not load reply examples:', err);
    return DEFAULT_REPLY_EXAMPLES;
  }
}

async function loadTone(toneId) {
  let customTones = [];
  let hiddenToneIds = [];
  try {
    const stored = await chrome.storage.local.get([CUSTOM_TONES_KEY, HIDDEN_TONES_KEY]);
    customTones = stored[CUSTOM_TONES_KEY];
    hiddenToneIds = stored[HIDDEN_TONES_KEY];
  } catch (err) {
    console.warn('[X Buddy] Could not load reply tones:', err);
  }

  const tones = resolveVisibleTones(customTones, hiddenToneIds);
  const tone = tones.find((item) => item.id === toneId)
    || tones.find((item) => item.id === DEFAULT_TONE_ID)
    || tones[0];

  if (!tone) {
    return { id: DEFAULT_TONE_ID, label: 'Generic', direction: TONES[0].direction };
  }

  const key = TONE_PROMPT_PREFIX + tone.id;
  let storedPrompt = {};
  try {
    storedPrompt = await chrome.storage.local.get(key);
  } catch (err) {
    console.warn('[X Buddy] Could not load tone instruction:', err);
  }

  return {
    ...tone,
    direction: resolveToneInstruction(tone, storedPrompt[key]),
  };
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

function toMessageTurns(turns) {
  return turns.flatMap((turn) => [
    { role: 'user', content: turn.user },
    { role: 'assistant', content: turn.assistant },
  ]);
}

function withExamplesCaveat(systemPrompt, turns) {
  return turns.length ? `${systemPrompt}\n\n${EXAMPLES_CAVEAT}` : systemPrompt;
}

// Shared by Magic Reply and Draft Post. Returns the raw completion; each caller
// applies its own cleanup.
async function requestCompletion(settings, systemPrompt, userPrompt, turns = []) {
  const body = JSON.stringify({
    model: settings.model,
    messages: [
      { role: 'system', content: systemPrompt },
      ...turns,
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
  if (typeof content === 'string' && content.trim()) return content;

  // Reasoning-only completion — never inject chain-of-thought into the composer.
  if (choice?.message?.reasoning_content) {
    throw new Error('Model returned reasoning only — try again');
  }

  throw new Error('Unexpected LLM response');
}

// Clean once, then allow exactly one rewrite when a banned stock phrase slips
// through. If the rewrite is still dirty, strip the phrase as a last resort.
async function completeCleanText({
  settings,
  systemPrompt,
  userPrompt,
  turns,
  clean,
  cleanOptions,
}) {
  const first = clean(
    await requestCompletion(settings, systemPrompt, userPrompt, turns),
    cleanOptions
  );
  if (!first) throw new Error('Unexpected LLM response');

  const banned = findBannedPhrases(first);
  if (banned.length === 0) return first;

  const retryPrompt = buildBannedRetryPrompt(userPrompt, banned);
  const second = clean(
    await requestCompletion(settings, systemPrompt, retryPrompt, turns),
    cleanOptions
  );
  if (!second) throw new Error('Unexpected LLM response');

  const remaining = findBannedPhrases(second);
  if (remaining.length === 0) return second;

  const stripped = stripBannedPhrases(second);
  if (!stripped) throw new Error('Unexpected LLM response');
  return stripped;
}

async function generateReply(postText, toneId, nudgeId) {
  const post = String(postText || '').trim().slice(0, 6000);
  if (!post) throw new Error('No post text to reply to');

  const settings = await resolveLlmSettings();
  if (!settings.model) {
    throw new Error('No model selected — choose one in Settings');
  }

  const [voice, tone, replyLength, replyExamples] = await Promise.all([
    loadVoiceConfig(),
    loadTone(toneId),
    loadReplyLength(),
    loadReplyExamples(),
  ]);

  const turns = toMessageTurns(parseReplyExamples(replyExamples));
  const systemPrompt = withExamplesCaveat(
    composeReplySystemPrompt(voice, tone.direction),
    turns
  );
  const userPrompt = composeReplyUserPrompt(post, replyLength, nudgeId);

  return completeCleanText({
    settings,
    systemPrompt,
    userPrompt,
    turns,
    clean: cleanReply,
    cleanOptions: { allowHashtags: voice.style.hashtags === 'allow' },
  });
}

async function generatePost(note, nudgeId) {
  const source = String(note || '').trim().slice(0, 4000);
  if (!source) throw new Error('No text to draft from');

  const settings = await resolveLlmSettings();
  if (!settings.model) {
    throw new Error('No model selected — choose one in Settings');
  }

  const [voice, postExamples] = await Promise.all([loadVoiceConfig(), loadPostExamples()]);
  const turns = toMessageTurns(parsePostExamples(postExamples));
  const systemPrompt = withExamplesCaveat(composePostSystemPrompt(voice), turns);
  const userPrompt = composePostUserPrompt(source, nudgeId);

  return completeCleanText({
    settings,
    systemPrompt,
    userPrompt,
    turns,
    clean: cleanPost,
    cleanOptions: { allowHashtags: voice.style.hashtags === 'allow' },
  });
}

async function generateVoice(samples) {
  const text = String(samples || '').trim().slice(0, VOICE_GENERATION_LIMITS.maxSamplesLength);
  if (!text) throw new Error('Paste a few of your posts first');

  const settings = await resolveLlmSettings();
  if (!settings.model) {
    throw new Error('No model selected — choose one in Settings');
  }

  const content = await requestCompletion(
    { ...settings, maxTokens: Math.max(settings.maxTokens, VOICE_GENERATION_LIMITS.maxTokens) },
    VOICE_FROM_SAMPLES_SYSTEM,
    `${VOICE_FROM_SAMPLES_USER}${text}`
  );

  const voice = parseGeneratedVoice(content);
  if (!voice) throw new Error('Could not read a voice from the model — try again');
  return voice;
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

// ===================================================================
//  OPEN-TAB RECOVERY
// ===================================================================
// Content scripts run once when a document loads. If Chrome restores an X tab
// before the extension finishes starting, or the extension is reloaded while a
// tab stays open, that document never gets the content script and the page
// looks inactive until it is refreshed. Recover those tabs from the service
// worker so the user does not have to refresh by hand.

const X_TAB_URL_PATTERNS = ['https://x.com/*', 'https://twitter.com/*'];
const CONTENT_LOADED_ATTR = 'data-xb-buddy-loaded';
const CONTENT_SCHEDULED_ATTR = 'data-xb-buddy-scheduled';
// Set by 1.7.1 and earlier. It is the only marker an old tab has, and the
// first 1.7.2 service-worker start must reload that tab instead of injecting
// a second copy of the top-level consts into the document.
const LEGACY_CONTENT_ATTR = 'data-xb-buddy';
const CONTENT_SCRIPT_FILES = ['shared.js', 'content.js'];
const METRICS_SCRIPT_FILES = ['page-metrics.js'];
const CONTENT_STYLE_FILES = ['styles.css'];
const CONTENT_PING_RETRY_MS = 250;
const CONTENT_INJECT_DELAY_MS = 1000;
const STALE_TAB_RELOAD_MS = 30_000;

const recoveredTabReloads = new Map();
const recoveryInFlight = new Set();
let recoveryTimer = null;
let recoveryRun = null;

function isXTabUrl(url) {
  return /^https:\/\/(?:x|twitter)\.com\//i.test(String(url || ''));
}

// Permission changes can also arrive for the loopback LLM hosts. Only an X
// grant should trigger a tab scan, and the granted pattern may carry a
// subdomain or wildcard even when the manifest declares the bare host.
function isXOriginPattern(origin) {
  return /^(?:\*|https?):\/\/(?:\*\.)?(?:[a-z0-9-]+\.)*(?:x|twitter)\.com(?::\d+)?(?:\/.*)?$/i
    .test(String(origin || ''));
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function pingContentScript(tabId) {
  try {
    const response = await chrome.tabs.sendMessage(tabId, { type: 'xb:ping' });
    return response?.ok === true;
  } catch {
    return false;
  }
}

async function hasContentMarker(tabId, attr) {
  try {
    const [result] = await chrome.scripting.executeScript({
      target: { tabId },
      func: (name) => document.documentElement.hasAttribute(name),
      args: [attr],
    });
    return result?.result === true;
  } catch {
    return false;
  }
}

async function tabHasDraft(tabId) {
  try {
    const [result] = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        const editables = document.querySelectorAll(
          '[data-testid="tweetTextarea_0"], [role="textbox"][contenteditable="true"], '
          + '[contenteditable="true"], textarea'
        );
        for (const el of editables) {
          const text = el.tagName === 'TEXTAREA' ? el.value : el.textContent;
          if (text && text.trim()) return true;
        }
        return false;
      },
    });
    return result?.result === true;
  } catch {
    return false;
  }
}

async function injectContentScripts(tabId) {
  // The MAIN-world helper must exist before content.js evaluates feed rules.
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: METRICS_SCRIPT_FILES,
      world: 'MAIN',
    });
  } catch (err) {
    console.warn('[X Buddy] Could not inject the page metrics helper:', err);
  }

  try {
    await chrome.scripting.insertCSS({
      target: { tabId },
      files: CONTENT_STYLE_FILES,
    });
  } catch (err) {
    console.warn('[X Buddy] Could not inject styles:', err);
  }

  await chrome.scripting.executeScript({
    target: { tabId },
    files: CONTENT_SCRIPT_FILES,
  });
}

async function reloadStaleTab(tab) {
  const lastReload = recoveredTabReloads.get(tab.id) || 0;
  if (Date.now() - lastReload < STALE_TAB_RELOAD_MS) return;

  // Never throw away an unsent composer draft. The activation check below
  // retries after the draft is cleared or posted.
  if (await tabHasDraft(tab.id)) return;

  recoveredTabReloads.set(tab.id, Date.now());
  try {
    await chrome.tabs.reload(tab.id);
  } catch (err) {
    console.warn('[X Buddy] Could not reload stale tab:', err);
  }
}

// Re-read a tab before a programmatic change. The tab passed to
// ensureTabContent can be a second old by the time a ping retry or injection
// delay finishes, and a new load may have started in that window.
async function getReadyXTab(tabId) {
  try {
    const tab = await chrome.tabs.get(tabId);
    if (!tab?.id || tab.discarded || tab.status !== 'complete' || !isXTabUrl(tab.url)) {
      return null;
    }
    return tab;
  } catch {
    return null;
  }
}

async function ensureTabContent(tab) {
  if (!tab?.id || tab.discarded || !isXTabUrl(tab.url)) return;

  // A document that is still loading has its declarative document_start and
  // document_idle scripts queued but not run. Injecting now would race them,
  // and a second evaluation of shared.js would collide with its top-level
  // consts. tabs.onUpdated calls this again when the load completes.
  if (tab.status !== 'complete') return;

  if (recoveryInFlight.has(tab.id)) return;

  recoveryInFlight.add(tab.id);
  try {
    if (await pingContentScript(tab.id)) return;

    // A declarative injection may still be starting on a fresh document.
    await wait(CONTENT_PING_RETRY_MS);
    if (await pingContentScript(tab.id)) return;

    if (await hasContentMarker(tab.id, CONTENT_LOADED_ATTR)
        || await hasContentMarker(tab.id, LEGACY_CONTENT_ATTR)) {
      // The document still carries a marker from a content script whose
      // chrome.* context died with the previous extension instance. It cannot
      // recover in place, so reload once and let the new instance inject.
      // A 1.7.1 tab has only the legacy data-xb-buddy marker; it takes this
      // same path, including the unsent-draft guard in reloadStaleTab.
      const current = await getReadyXTab(tab.id);
      if (current) await reloadStaleTab(current);
      return;
    }

    // The tab may have started a load while the ping was retrying. Leave the
    // fresh document to its declarative copy and wait for the next completion.
    if (!(await getReadyXTab(tab.id))) return;

    // document_idle content scripts run at or just after the load event. Give
    // the declarative copy time to start before treating it as missing.
    await wait(CONTENT_INJECT_DELAY_MS);
    if (await pingContentScript(tab.id)) return;
    if (await hasContentMarker(tab.id, CONTENT_LOADED_ATTR)
        || await hasContentMarker(tab.id, LEGACY_CONTENT_ATTR)) return;

    if (await hasContentMarker(tab.id, CONTENT_SCHEDULED_ATTR)) {
      // The document_start marker says the declarative idle scripts are still
      // queued for this document. Wait for them instead of injecting a second
      // copy; a manual refresh covers the rare canceled-injection case.
      return;
    }

    // Final freshness check. A load that started during the injection delay
    // would be queuing its own declarative copy right now, so check the live
    // tab and the markers again immediately before injecting.
    if (await pingContentScript(tab.id)) return;
    if (!(await getReadyXTab(tab.id))) return;
    if (await hasContentMarker(tab.id, CONTENT_LOADED_ATTR)
        || await hasContentMarker(tab.id, LEGACY_CONTENT_ATTR)
        || await hasContentMarker(tab.id, CONTENT_SCHEDULED_ATTR)) return;

    try {
      await injectContentScripts(tab.id);
    } catch (err) {
      console.warn('[X Buddy] Could not inject content scripts:', err);
    }
  } finally {
    recoveryInFlight.delete(tab.id);
  }
}

async function recoverOpenTabs() {
  if (recoveryRun) return recoveryRun;

  recoveryRun = (async () => {
    let tabs = [];
    try {
      tabs = await chrome.tabs.query({ url: X_TAB_URL_PATTERNS });
    } catch (err) {
      console.warn('[X Buddy] Could not list X tabs:', err);
      return;
    }
    await Promise.allSettled(tabs.map((tab) => ensureTabContent(tab)));
  })();

  try {
    await recoveryRun;
  } finally {
    recoveryRun = null;
  }
}

function scheduleTabRecovery(delayMs = 1000) {
  if (recoveryTimer) return;
  recoveryTimer = setTimeout(() => {
    recoveryTimer = null;
    recoverOpenTabs().catch((err) => {
      console.warn('[X Buddy] Tab recovery failed:', err);
    });
  }, delayMs);
}

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status !== 'complete' || !isXTabUrl(tab?.url)) return;
  ensureTabContent(tab).catch((err) => {
    console.warn('[X Buddy] Could not check tab content:', err);
  });
});

// A stale tab that deferred recovery because it was being typed in gets
// another chance when the user comes back to it.
chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  try {
    const tab = await chrome.tabs.get(tabId);
    if (isXTabUrl(tab?.url)) await ensureTabContent(tab);
  } catch (err) {
    console.warn('[X Buddy] Could not check the activated tab:', err);
  }
});

// A withheld Site access grant can be approved from the popup or from
// chrome://extensions. Recover open tabs as soon as x.com access arrives.
// Ignore grants for the loopback LLM hosts, which cannot change X tab access.
chrome.permissions.onAdded.addListener((permissions) => {
  const origins = Array.isArray(permissions?.origins) ? permissions.origins : [];
  if (!origins.some(isXOriginPattern)) return;
  scheduleTabRecovery(0);
});

// ===================================================================
//  LIFECYCLE
// ===================================================================

chrome.runtime.onInstalled.addListener(() => {
  setupContextMenus();
  scheduleTabRecovery();
});

chrome.runtime.onStartup.addListener(() => {
  setupContextMenus();
  scheduleTabRecovery();
});

// Unpacked reloads do not always fire onInstalled, so recreate the menus and
// recover already-open tabs when the service worker starts as well.
setupContextMenus();
scheduleTabRecovery();

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
    generateReply(message.postText, message.toneId, message.nudge)
      .then((reply) => sendResponse({ ok: true, reply }))
      .catch((err) => sendResponse({ ok: false, error: err?.message || 'LLM request failed' }));
    return true; // async response
  }

  if (message?.type === 'xb:generate-post') {
    generatePost(message.note, message.nudge)
      .then((post) => sendResponse({ ok: true, post }))
      .catch((err) => sendResponse({ ok: false, error: err?.message || 'LLM request failed' }));
    return true; // async response
  }

  if (message?.type === 'xb:generate-voice') {
    generateVoice(message.samples)
      .then((voice) => sendResponse({ ok: true, voice }))
      .catch((err) => sendResponse({ ok: false, error: err?.message || 'Could not generate a voice' }));
    return true; // async response
  }

  if (message?.type === 'xb:recover-tabs') {
    recoverOpenTabs()
      .then(() => sendResponse({ ok: true }))
      .catch((err) => sendResponse({ ok: false, error: err?.message || 'Recovery failed' }));
    return true;
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
