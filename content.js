// ===== X Buddy — Content Script =====
// Injects keyword highlighting and Magic Reply into x.com (Twitter)

// Keep these storage keys in sync with popup.js and background.js.
const STORAGE_KEY = 'xbBuddyKeywords';
const NEGATIVE_STORAGE_KEY = 'xbBuddyNegativeKeywords';
const ENABLED_KEY = 'xbBuddyEnabled';
const POSITIVE_ENABLED_KEY = 'xbBuddyPositiveEnabled';
const NEGATIVE_ENABLED_KEY = 'xbBuddyNegativeEnabled';
const GLOW_KEY = 'xbBuddyGlowColor';
const DEFAULT_GLOW_COLOR = '#00ff41';
const PROCESSED_ATTR = 'data-xb-processed';
const MAGIC_REPLY_ATTR = 'data-magic-reply';

// --- Selectors (cascading — first match wins) ---
// X/Twitter uses data-testid attributes on tweet articles.
// Feed items: article[data-testid="tweet"]
// Thread detail: same article[data-testid="tweet"] in a detail context
const POST_SELECTORS = [
  'article[data-testid="tweet"]',      // Primary: every tweet on X
  'div[data-testid="tweet"]',           // Fallback: some tweet containers
  '[role="article"]',                    // ARIA fallback
  'article',                             // Widest semantic fallback
];

const DIALOG_SELECTORS = [
  'div[role="dialog"]',
  '[data-testid="sheetDialog"]',
];

// --- State ---
let keywordList = [];                  // positive keywords, original casing
let negativeKeywordList = [];          // negative keywords, original casing
let positiveEnabled = true;
let negativeEnabled = true;
let enabled = true;
let glowColor = DEFAULT_GLOW_COLOR;
let processedPosts = new WeakSet();    // prevent re-processing
let processedDialogs = new WeakSet();  // prevent re-injecting buttons
let observer = null;
let safetyInterval = null;
let reprocessTimer = null;

// Debug logging toggle — set to true to see what the extension is doing
const DEBUG = false;
function debug(...args) {
  if (DEBUG) console.log('[X Buddy]', ...args);
}

// ===================================================================
//  ERROR BOUNDARY
// ===================================================================

window.addEventListener('error', (e) => {
  console.error('[X Buddy] Unhandled error:', e.error || e.message);
});

window.addEventListener('unhandledrejection', (e) => {
  console.error('[X Buddy] Unhandled promise rejection:', e.reason);
});

// ===================================================================
//  INIT
// ===================================================================

(async function init() {
  // Defense-in-depth: only run on X/Twitter domains
  if (!/^https?:\/\/([a-z0-9-]+\.)?(x\.com|twitter\.com)\//.test(location.href)) {
    debug('Not on X/Twitter — exiting content script');
    return;
  }

  try {
    await loadSettings();
    listenForStorageChanges();

    if (!enabled) {
      debug('Extension disabled on load');
      return;
    }

    // Initial pass — the page may already have content
    debug('Initial scan starting...');
    debug(`Positive keywords: ${keywordList.join(', ') || '(none)'}`);
    debug(`Negative keywords: ${negativeKeywordList.join(', ') || '(none)'}`);

    startMutationObserver();
    startSafetyChecks();
    scanAllPosts();
    scanAllDialogs();
    scanInlineComposers();
  } catch (err) {
    console.error('[X Buddy] Initialization failed:', err);
  }
})();

// ===================================================================
//  SETTINGS LOADING
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

function normalizeGlowColor(value) {
  return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value)
    ? value
    : DEFAULT_GLOW_COLOR;
}

function applyGlowColor(hex) {
  const color = normalizeGlowColor(hex);
  const r = parseInt(color.slice(1, 3), 16);
  const g = parseInt(color.slice(3, 5), 16);
  const b = parseInt(color.slice(5, 7), 16);
  document.documentElement.style.setProperty('--xb-glow-rgb', `${r}, ${g}, ${b}`);
}

async function loadSettings() {
  enabled = true;
  positiveEnabled = true;
  negativeEnabled = true;
  glowColor = DEFAULT_GLOW_COLOR;
  try {
    const result = await chrome.storage.local.get([
      STORAGE_KEY,
      NEGATIVE_STORAGE_KEY,
      ENABLED_KEY,
      POSITIVE_ENABLED_KEY,
      NEGATIVE_ENABLED_KEY,
      GLOW_KEY,
    ]);
    keywordList = normalizeKeywordList(result[STORAGE_KEY] || []);
    negativeKeywordList = normalizeKeywordList(result[NEGATIVE_STORAGE_KEY] || []);
    enabled = result[ENABLED_KEY] !== false;
    positiveEnabled = result[POSITIVE_ENABLED_KEY] !== false;
    negativeEnabled = result[NEGATIVE_ENABLED_KEY] !== false;
    glowColor = normalizeGlowColor(result[GLOW_KEY]);
  } catch (err) {
    console.warn('[X Buddy] Could not load settings:', err);
    keywordList = [];
    negativeKeywordList = [];
  }
  applyGlowColor(glowColor);
}

function listenForStorageChanges() {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;

    if (changes[ENABLED_KEY] !== undefined) {
      const now = changes[ENABLED_KEY].newValue !== false;
      if (now !== enabled) {
        enabled = now;
        debug('Extension', enabled ? 'enabled' : 'disabled');
        if (enabled) {
          enableExtension();
        } else {
          disableExtension();
        }
        return;
      }
    }

    if (changes[GLOW_KEY] !== undefined) {
      glowColor = normalizeGlowColor(changes[GLOW_KEY].newValue);
      applyGlowColor(glowColor);
      debug('Glow color updated:', glowColor);
    }

    if (!enabled) return;

    if (changes[POSITIVE_ENABLED_KEY] !== undefined) {
      positiveEnabled = changes[POSITIVE_ENABLED_KEY].newValue !== false;
      debug('Positive highlighting', positiveEnabled ? 'enabled' : 'disabled');
      scheduleReprocess();
    }

    if (changes[NEGATIVE_ENABLED_KEY] !== undefined) {
      negativeEnabled = changes[NEGATIVE_ENABLED_KEY].newValue !== false;
      debug('Negative filtering', negativeEnabled ? 'enabled' : 'disabled');
      scheduleReprocess();
    }

    if (changes[STORAGE_KEY] !== undefined) {
      keywordList = normalizeKeywordList(changes[STORAGE_KEY].newValue || []);
      scheduleReprocess();
    }

    if (changes[NEGATIVE_STORAGE_KEY] !== undefined) {
      negativeKeywordList = normalizeKeywordList(changes[NEGATIVE_STORAGE_KEY].newValue || []);
      scheduleReprocess();
    }
  });
}

async function enableExtension() {
  await loadSettings();
  if (!enabled) return;
  resetPostProcessing();
  startMutationObserver();
  startSafetyChecks();
  scanAllPosts();
  scanAllDialogs();
  scanInlineComposers();
}

function disableExtension() {
  debug('disableExtension');

  if (observer) {
    observer.disconnect();
    observer = null;
  }
  if (safetyInterval) {
    clearInterval(safetyInterval);
    safetyInterval = null;
  }
  if (reprocessTimer) {
    clearTimeout(reprocessTimer);
    reprocessTimer = null;
  }

  resetPostProcessing();

  document.querySelectorAll('.magic-reply-btn').forEach((el) => el.remove());
  document.querySelectorAll(`[${MAGIC_REPLY_ATTR}]`).forEach((el) => {
    el.removeAttribute(MAGIC_REPLY_ATTR);
  });
  processedDialogs = new WeakSet();
}

function scheduleReprocess() {
  if (!enabled) return;
  if (reprocessTimer) clearTimeout(reprocessTimer);
  reprocessTimer = setTimeout(() => {
    reprocessTimer = null;
    if (!enabled) return;
    resetPostProcessing();
    scanAllPosts();
  }, 100);
}

// ===================================================================
//  MUTATION OBSERVER
// ===================================================================

function startMutationObserver() {
  if (!enabled) return;
  if (observer) observer.disconnect();

  let pending = false;
  let hasRelevantMutation = false;
  let postScanCooldown = false;
  const MIN_POST_SCAN_INTERVAL = 200;
  const postSelectorAll = POST_SELECTORS.join(',');

  function hasNewTweetNodes(mutations) {
    for (const m of mutations) {
      for (const node of m.addedNodes) {
        if (node.nodeType !== 1) continue;
        if (node.matches?.(postSelectorAll) ||
            node.matches?.('[data-testid="tweetText"]') ||
            node.querySelector?.(`${postSelectorAll}, [data-testid="tweetText"]`)) {
          return true;
        }
      }
    }
    return false;
  }

  function schedulePostScan() {
    if (postScanCooldown) return;
    postScanCooldown = true;
    setTimeout(() => {
      postScanCooldown = false;
      scanAllPosts();
    }, MIN_POST_SCAN_INTERVAL);
  }

  observer = new MutationObserver((mutations) => {
    if (!enabled) return;
    if (!hasRelevantMutation) {
      hasRelevantMutation = hasNewTweetNodes(mutations);
    }

    if (pending) return;
    pending = true;
    requestAnimationFrame(() => {
      pending = false;

      // Always scan dialogs/composers — cheap ops, need fast response
      scanAllDialogs();
      scanInlineComposers();

      // Throttle post scan via cooldown timer, not RAF timing
      if (hasRelevantMutation) {
        hasRelevantMutation = false;
        schedulePostScan();
      }
    });
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });
}

function startSafetyChecks() {
  if (!enabled) return;
  if (safetyInterval) {
    clearInterval(safetyInterval);
    safetyInterval = null;
  }

  // Re-scan periodically for the first ~15 seconds. This catches posts that
  // React mounts after our initial pass.
  let checks = 0;
  safetyInterval = setInterval(() => {
    if (!enabled) {
      clearInterval(safetyInterval);
      safetyInterval = null;
      return;
    }
    checks++;
    scanAllPosts();
    scanAllDialogs();
    scanInlineComposers();
    if (checks >= 5) {
      clearInterval(safetyInterval);
      safetyInterval = null;
    }
  }, 3000);
}

// ===================================================================
//  POST SCANNING & HIGHLIGHTING
// ===================================================================

function resetPostProcessing() {
  for (const el of document.querySelectorAll(`[${PROCESSED_ATTR}]`)) {
    el.removeAttribute(PROCESSED_ATTR);
  }
  for (const el of document.querySelectorAll('.xb-glow-post')) {
    el.classList.remove('xb-glow-post');
  }
  for (const el of document.querySelectorAll('.xb-hidden-post')) {
    el.classList.remove('xb-hidden-post');
  }
  processedPosts = new WeakSet();
}

function scanAllPosts() {
  if (!enabled) return;
  const allSelectors = POST_SELECTORS.join(',');
  const containers = document.querySelectorAll(allSelectors);
  let totalFound = 0;

  for (const el of containers) {
    if (processedPosts.has(el)) continue;
    if (el.hasAttribute(PROCESSED_ATTR)) {
      processedPosts.add(el);
      continue;
    }
    totalFound++;
    processPost(el);
  }

  // Fallback: tweetText elements outside known containers
  const postTextNodes = document.querySelectorAll('[data-testid="tweetText"]');
  for (const textNode of postTextNodes) {
    if (textNode.closest(`[${PROCESSED_ATTR}]`)) continue;

    let container = textNode.closest(allSelectors);
    if (!container) {
      container = textNode;
      for (let i = 0; i < 8; i++) {
        const parent = container.parentElement;
        if (!parent || parent === document.body) break;
        container = parent;
      }
    }

    if (container && !container.hasAttribute(PROCESSED_ATTR)) {
      totalFound++;
      processPost(container);
    }
  }

  if (totalFound > 0) debug(`scanAllPosts: found ${totalFound} new posts`);
}

function isWholeWordMatch(text, keyword) {
  // Escape regex special characters in the keyword
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  try {
    // \b only works when the keyword starts/ends with a word character.
    // Hashtags and terms like "C++" need an open boundary on that side.
    const lead = /^\w/.test(keyword) ? '\\b' : '';
    const trail = /\w$/.test(keyword) ? '\\b' : '';
    return new RegExp(`${lead}${escaped}${trail}`, 'iu').test(text);
  } catch {
    // Fallback to substring if regex is somehow invalid
    return text.toLowerCase().includes(keyword.toLowerCase());
  }
}

function findKeywordMatch(text, list) {
  for (const kw of list) {
    if (isWholeWordMatch(text, kw)) return kw;
  }
  return null;
}

function extractPostBodyText(container) {
  // Extract text content — try multiple strategies
  let postText = '';
  const textEl = container.querySelector('[data-testid="tweetText"]');
  if (textEl) {
    postText = textEl.textContent || '';
  }
  if (!postText.trim()) {
    // Fallback 1: look for any paragraph elements
    const paras = container.querySelectorAll('p');
    if (paras.length > 0) {
      postText = Array.from(paras).map(p => p.textContent).join(' ').trim();
    }
  }
  if (postText.trim()) {
    return { text: postText.trim(), fromBody: true };
  }
  // Fallback 2: get all text content (ignore very short results). This can
  // include author names and UI labels, so negative matching ignores it.
  const allText = container.textContent.trim();
  if (allText.length > 30) return { text: allText, fromBody: false };
  return { text: '', fromBody: false };
}

function getHideTarget(container) {
  const post = container.matches('article, [data-testid="tweet"], [role="article"]')
    ? container
    : container.closest('article, [data-testid="tweet"], [role="article"]') || container;

  // Hide the whole timeline cell so no empty row is left behind.
  const cell = post.closest('div[data-testid="cellInnerDiv"]');
  if (cell && !cell.querySelector('div[contenteditable="true"]')) return cell;
  return post;
}

function processPost(container) {
  if (!enabled) return;

  const { text: postText, fromBody } = extractPostBodyText(container);
  if (!postText.trim()) {
    // Do not mark this one: X may still be mounting the tweet text.
    debug('processPost: could not extract text from', container);
    return;
  }

  // Mark as processed only once we have text, so a post whose body renders
  // late can be picked up by a later scan.
  container.setAttribute(PROCESSED_ATTR, 'true');
  processedPosts.add(container);

  // Negative filter runs first: a post that matches both lists stays hidden.
  if (negativeEnabled && fromBody && negativeKeywordList.length > 0) {
    const matchedNegative = findKeywordMatch(postText, negativeKeywordList);
    if (matchedNegative) {
      container.classList.remove('xb-glow-post');
      const hideTarget = getHideTarget(container);
      if (hideTarget) hideTarget.classList.add('xb-hidden-post');
      debug(`Hid post matching "${matchedNegative}": "${postText.substring(0, 60)}..."`);
      return;
    }
  }

  if (positiveEnabled && keywordList.length > 0) {
    const matchedPositive = findKeywordMatch(postText, keywordList);
    if (matchedPositive) {
      container.classList.add('xb-glow-post');
      debug(`Highlighted post matching "${matchedPositive}": "${postText.substring(0, 60)}..."`);
    }
  }
}

// ===================================================================
//  DIALOG / MODAL SCANNING (Magic Reply injection)
// ===================================================================

function scanAllDialogs() {
  if (!enabled) return;
  for (const sel of DIALOG_SELECTORS) {
    const dialogs = document.querySelectorAll(sel);
    for (const dialog of dialogs) {
      // X re-renders dialogs aggressively. If React removed our button but the
      // marker attribute survived, re-inject instead of skipping forever.
      if (dialog.querySelector('.magic-reply-btn')) continue;
      if (dialog.hasAttribute(MAGIC_REPLY_ATTR)) dialog.removeAttribute(MAGIC_REPLY_ATTR);
      processedDialogs.delete(dialog);
      tryInjectMagicReply(dialog);
    }
  }
}

// ===================================================================
//  INLINE COMPOSER SCANNING
//  X's tweet detail page shows the reply composer inline (not in a dialog).
// ===================================================================

function scanInlineComposers() {
  if (!enabled) return;
  // Only embed the button on reply surfaces. The home timeline's "Post"
  // composer is also a contenteditable with tweetButtonInline, but replying
  // there would draft a reply to an unrelated tweet.
  const replyRoute = /\/status\//.test(location.pathname) ||
    /[?&]in_reply_to=/.test(location.search) ||
    /\/compose\/post/.test(location.pathname);
  if (!replyRoute) return;

  const textareas = document.querySelectorAll('div[contenteditable="true"]');
  for (const textarea of textareas) {
    // Skip if inside a dialog (handled by scanAllDialogs)
    if (textarea.closest('div[role="dialog"], [data-testid="sheetDialog"]')) continue;
    // Skip contenteditable elements outside the main tweet area (bio, lists, DMs)
    if (!textarea.closest('[data-testid="primaryColumn"], [data-testid="cellInnerDiv"]')) continue;

    // If React removed our button but left the marker, allow re-injection.
    const marked = textarea.closest(`[${MAGIC_REPLY_ATTR}]`);
    if (marked && marked.querySelector('.magic-reply-btn')) continue;
    if (marked) marked.removeAttribute(MAGIC_REPLY_ATTR);

    // Walk up to find a container with a send button
    let container = textarea;
    let found = false;
    for (let i = 0; i < 6; i++) {
      const parent = container.parentElement;
      if (!parent || parent === document.body) break;
      container = parent;
      if (container.querySelector('[data-testid="tweetButtonInline"], [data-testid="tweetButton"]')) {
        found = true;
        break;
      }
    }
    if (!found) continue;

    container.setAttribute(MAGIC_REPLY_ATTR, 'true');
    if (!container.querySelector('.magic-reply-btn')) {
      const btn = createMagicReplyButton(container);
      const sendBtn = container.querySelector(
        '[data-testid="tweetButtonInline"], [data-testid="tweetButton"]'
      );
      if (sendBtn?.parentElement) {
        sendBtn.parentElement.insertBefore(btn, sendBtn);
      }
    }
  }
}

function tryInjectMagicReply(dialog) {
  // X reply composer signals: contenteditable textarea + send button
  const hasComposer = !!dialog.querySelector('div[contenteditable="true"]');
  const hasSendButton = !!dialog.querySelector(
    '[data-testid="tweetButtonInline"], [data-testid="tweetButton"]'
  );
  const hasReplyAction = !!dialog.querySelector('[data-testid="reply"]');

  // Skip if none of the signals match — not a reply composer dialog
  if (!hasComposer && !hasSendButton && !hasReplyAction) return;

  // Strategy 1: Reply composer open — inject button near the send action
  if (hasComposer || hasSendButton) {
    const injected = injectButtonNearComposer(dialog);
    if (injected) {
      dialog.setAttribute(MAGIC_REPLY_ATTR, 'true');
      processedDialogs.add(dialog);
    }
    return;
  }
}

function createMagicReplyButton(dialog) {
  const btn = document.createElement('button');
  btn.className = 'magic-reply-btn';
  btn.textContent = '✨ Magic Reply';
  btn._resetTimer = null;
  btn.addEventListener('click', () => handleMagicReplyClick(btn, dialog));
  return btn;
}

function injectButtonNearComposer(dialog) {
  if (dialog.querySelector('.magic-reply-btn')) return false;

  const textarea = dialog.querySelector('div[contenteditable="true"]');
  if (!textarea) return false;

  const btn = createMagicReplyButton(dialog);

  // Try to find the send button to place our button near it
  const sendButton = dialog.querySelector(
    '[data-testid="tweetButtonInline"], [data-testid="tweetButton"], button[aria-label*="Reply"]'
  );

  if (sendButton && sendButton.parentElement) {
    // Insert before the send button in its container
    sendButton.parentElement.insertBefore(btn, sendButton);
  } else {
    // Fallback: insert next to the textarea
    const next = textarea.nextElementSibling;
    if (next) {
      textarea.parentElement.insertBefore(btn, next);
    } else {
      textarea.parentElement.appendChild(btn);
    }
  }

  return true;
}

// ===================================================================
//  MAGIC REPLY HANDLER
// ===================================================================

async function handleMagicReplyClick(btn, dialog) {
  if (!enabled) return;
  // 1. Extract post text. Prefer a tweet body inside the container (reply
  // dialog); otherwise use the tweet that precedes an inline composer. The
  // generic text walker is last because a composer container also contains
  // UI labels ("Reply", counts) that are not post content.
  let postText = '';
  const directText = dialog.querySelector('[data-testid="tweetText"]');
  if (directText) postText = (directText.textContent || '').trim();
  if (!postText) postText = findTweetTextBefore(dialog);
  if (!postText) postText = extractPostText(dialog);

  if (!postText || postText.trim().length === 0) {
    btn.textContent = '✨ No text found';
    btn.classList.add('failed');
    setTimeout(() => {
      btn.textContent = '✨ Magic Reply';
      btn.classList.remove('failed');
    }, 2000);
    return;
  }

  // 2. Update button state
  const originalText = btn.textContent;
  btn.textContent = '✨ Thinking…';
  btn.disabled = true;
  btn.classList.remove('failed');

  try {
    // 3. Call local LLM
    console.log('[X Buddy] Post text for LLM:', postText);
    const reply = await generateReply(postText);

    // The master toggle may have paused the extension while the LLM was working.
    if (!enabled) return;

    if (!reply || reply.trim().length === 0) {
      throw new Error('Empty response from LLM');
    }

    // 4. Find or activate the reply textarea
    let textarea = dialog.querySelector('div[contenteditable="true"]');

    if (!textarea) {
      // Auto-click the reply button to open composer
      const replyBtn = dialog.querySelector('[data-testid="reply"]');
      if (replyBtn) {
        replyBtn.click();
        // Wait briefly for the contenteditable to appear
        textarea = await waitForContentEditable(dialog, 2000);
      }
    }

    if (!textarea) {
      throw new Error('Reply box not found');
    }

    const filled = await insertTextIntoReply(textarea, reply);
    if (!filled) {
      throw new Error('Could not fill reply box');
    }

    // 5. Done — reset button after delay
    btn.textContent = '✨ Reply Injected ✓';
    scheduleReset(btn, originalText, 2000);
  } catch (err) {
    console.warn('[X Buddy] Magic Reply error:', err);
    btn.textContent = `✨ Failed — ${err.message || 'Error'}`;
    btn.classList.add('failed');
    scheduleReset(btn, originalText, 3000);
  } finally {
    btn.disabled = false;
  }
}

function findTweetTextBefore(container) {
  const texts = document.querySelectorAll('[data-testid="tweetText"]');
  let best = '';
  for (const el of texts) {
    if (container.contains(el)) continue;
    // DOCUMENT_POSITION_PRECEDING: el comes before the composer in the page.
    if (container.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_PRECEDING) {
      best = (el.textContent || '').trim();
    }
  }
  return best;
}

function extractPostText(dialog) {
  // Strategy 1: Standard tweet text testid (works in post detail dialogs)
  const postTextEl = dialog.querySelector('[data-testid="tweetText"]');
  if (postTextEl) {
    const text = postTextEl.textContent.trim();
    if (text) return text;
  }

  // Strategy 2: Walk all text nodes in the dialog, skipping the contenteditable
  // textarea subtree. This catches post text rendered in <span>, <div>, <p>, etc.
  const textarea = dialog.querySelector('div[contenteditable="true"]');
  const textParts = [];
  const seen = new Set();

  const walker = document.createTreeWalker(
    dialog,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode: (node) => {
        // Skip text inside the reply textarea
        if (textarea && textarea.contains(node)) return NodeFilter.FILTER_REJECT;
        // Skip empty/whitespace-only nodes
        const text = node.textContent.trim();
        if (!text) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    }
  );

  let node;
  while (node = walker.nextNode()) {
    const text = node.textContent.trim();
    // Deduplicate: parent elements often contain the same text in multiple nodes
    if (!seen.has(text)) {
      seen.add(text);
      textParts.push(text);
    }
  }

  if (textParts.length > 0) return textParts.join(' ').trim();

  return '';
}

async function generateReply(postText) {
  // The request is proxied through background.js. A content script request to
  // http://localhost is blocked by Chrome's Local Network Access policy.
  let response;
  try {
    response = await chrome.runtime.sendMessage({ type: 'xb:generate-reply', postText });
  } catch {
    throw new Error('Background unavailable — reload the extension');
  }
  if (!response || !response.ok) {
    throw new Error(response?.error || 'LLM request failed');
  }
  const reply = String(response.reply || '').trim();
  if (!reply) throw new Error('Empty response from LLM');
  return reply;
}

function waitForContentEditable(parent, timeoutMs) {
  return new Promise((resolve, reject) => {
    const existing = parent.querySelector('div[contenteditable="true"]');
    if (existing) return resolve(existing);

    const startTime = Date.now();
    const poll = setInterval(() => {
      const el = parent.querySelector('div[contenteditable="true"]');
      if (el) {
        clearInterval(poll);
        resolve(el);
      } else if (Date.now() - startTime > timeoutMs) {
        clearInterval(poll);
        resolve(null);  // timed out
      }
    }, 100);
  });
}

function scheduleReset(btn, originalText, delayMs) {
  if (btn._resetTimer) clearTimeout(btn._resetTimer);
  btn._resetTimer = setTimeout(() => {
    btn.textContent = originalText;
    btn.classList.remove('failed');
    btn._resetTimer = null;
  }, delayMs);
}

function placeCaretAtEnd(el) {
  const sel = window.getSelection();
  if (!sel) return;
  const range = document.createRange();
  range.selectNodeContents(el);
  range.collapse(false);
  sel.removeAllRanges();
  sel.addRange(range);
}

function findReactFiber(element) {
  let el = element;
  while (el && el !== document.body) {
    const key = Object.keys(el).find(
      (k) => k.startsWith('__reactFiber$') || k.startsWith('__reactInternalInstance$')
    );
    if (key) return el[key];
    el = el.parentElement;
  }
  return null;
}

async function insertTextIntoReply(textarea, text) {
  // X's composer is Draft.js (React-owned). Dispatching a synthetic paste is
  // the one insertion path that goes through the editor's own handler: Draft
  // updates its EditorState, enables the Reply button, and leaves React's DOM
  // intact. Direct DOM writes / execCommand desync React and were causing
  // "removeChild is not a child of this node" crashes.
  textarea.focus();
  // Draft's onFocus re-applies its internal caret asynchronously. Waiting
  // avoids it overwriting the select-all that follows, which is what lets the
  // paste replace an existing draft instead of appending to it.
  await new Promise((resolve) => setTimeout(resolve, 40));

  const sel = window.getSelection();
  const range = document.createRange();
  range.selectNodeContents(textarea);
  sel.removeAllRanges();
  sel.addRange(range);
  await new Promise((resolve) => setTimeout(resolve, 40));

  try {
    const data = new DataTransfer();
    data.setData('text/plain', text);
    textarea.dispatchEvent(new ClipboardEvent('paste', {
      bubbles: true,
      cancelable: true,
      clipboardData: data,
    }));
  } catch (err) {
    debug('Synthetic paste failed', err);
  }

  // Let the editor commit the paste before reading it back.
  await new Promise((resolve) => setTimeout(resolve, 120));
  let value = (textarea.innerText || textarea.textContent || '').trim();
  const needle = text.slice(0, Math.min(12, text.length));

  if (!value.includes(needle)) {
    // Plain contenteditable fallback (not X's Draft editor).
    try {
      document.execCommand('insertText', false, text);
    } catch (err) {
      debug('execCommand insertText failed', err);
    }
    await new Promise((resolve) => setTimeout(resolve, 80));
    value = (textarea.innerText || textarea.textContent || '').trim();

    // Never write into an editor React owns that we failed to update properly.
    if (!value.includes(needle) && !findReactFiber(textarea)) {
      const target = textarea.querySelector('[data-text="true"]') || textarea;
      target.textContent = text;
      textarea.dispatchEvent(new InputEvent('input', {
        bubbles: true,
        inputType: 'insertText',
        data: text,
      }));
      value = (textarea.innerText || textarea.textContent || '').trim();
    }
  }

  placeCaretAtEnd(textarea);
  return value.includes(needle);
}
