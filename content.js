// ===== X Buddy — Content Script =====
// Injects keyword highlighting and Magic Reply into x.com (Twitter)

// Keep these storage keys in sync with popup.js and background.js.
const STORAGE_KEY = 'xbBuddyKeywords';
const NEGATIVE_STORAGE_KEY = 'xbBuddyNegativeKeywords';
const ENABLED_KEY = 'xbBuddyEnabled';
const POSITIVE_ENABLED_KEY = 'xbBuddyPositiveEnabled';
const NEGATIVE_ENABLED_KEY = 'xbBuddyNegativeEnabled';
const GLOW_KEY = 'xbBuddyGlowColor';
const NOTIFICATION_KEY = 'xbBuddyNotification';
const DEFAULT_GLOW_COLOR = '#00ff41';
const PROCESSED_ATTR = 'data-xb-processed';
const MAGIC_REPLY_ATTR = 'data-magic-reply';

// Feed-rule effects use their own classes so rule changes can be reverted
// without touching keyword glow/hide state.
const RULE_GLOW_CLASS = 'xb-rule-glow-post';
const RULE_HIDDEN_CLASS = 'xb-rule-hidden-post';
const METRICS_REQUEST_ATTR = 'data-xb-metrics-req';
const METRICS_RETRIED_ATTR = 'data-xb-rules-retried';
const METRICS_CHANNEL = 'xb-buddy-metrics';
const METRICS_TIMEOUT_MS = 400;
const METRICS_RETRY_MS = 500;

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
let feedRules = [];                    // normalized feed rules
let feedRulesEnabled = true;
let rulesGeneration = 0;               // drops late metrics replies after a reset
let metricsCache = new WeakMap();      // article -> metrics
let metricsPending = new WeakMap();    // article -> in-flight metrics promise
let processedPosts = new WeakSet();    // prevent re-processing
let processedDialogs = new WeakSet();  // prevent re-injecting buttons
let observer = null;
let safetyInterval = null;
let reprocessTimer = null;
let pageToastEl = null;
let pageToastTimer = null;
let activeMenuEl = null;
let activeWrapper = null;
let toneMenuCloseHandler = null;
let toneMenuKeyHandler = null;

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
    await consumePendingNotification();

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

// Expose what the content script loaded and sees. These attributes are used
// by the troubleshooting docs to tell a stale tab from a missing rule.
function syncDebugAttributes() {
  try {
    const root = document.documentElement;
    if (!root) return;
    root.setAttribute('data-xb-buddy', chrome.runtime.getManifest().version);
    root.setAttribute('data-xb-buddy-rules', String(feedRules.length));
    root.setAttribute('data-xb-buddy-rules-enabled', String(feedRulesEnabled));
  } catch (err) {
    debug('Could not sync debug attributes', err);
  }
}

async function loadSettings() {
  enabled = true;
  positiveEnabled = true;
  negativeEnabled = true;
  glowColor = DEFAULT_GLOW_COLOR;
  feedRules = [];
  feedRulesEnabled = true;
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
    ]);
    keywordList = normalizeKeywordList(result[STORAGE_KEY] || []);
    negativeKeywordList = normalizeKeywordList(result[NEGATIVE_STORAGE_KEY] || []);
    enabled = result[ENABLED_KEY] !== false;
    positiveEnabled = result[POSITIVE_ENABLED_KEY] !== false;
    negativeEnabled = result[NEGATIVE_ENABLED_KEY] !== false;
    glowColor = normalizeGlowColor(result[GLOW_KEY]);
    feedRules = normalizeFeedRules(result[FEED_RULES_KEY]);
    feedRulesEnabled = result[FEED_RULES_ENABLED_KEY] !== false;
  } catch (err) {
    console.warn('[X Buddy] Could not load settings:', err);
    keywordList = [];
    negativeKeywordList = [];
    feedRules = [];
  }
  applyGlowColor(glowColor);
  syncDebugAttributes();
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

    if (changes[NOTIFICATION_KEY] !== undefined) {
      consumeNotification(changes[NOTIFICATION_KEY].newValue);
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

    if (changes[FEED_RULES_ENABLED_KEY] !== undefined) {
      feedRulesEnabled = changes[FEED_RULES_ENABLED_KEY].newValue !== false;
      debug('Feed rules', feedRulesEnabled ? 'enabled' : 'disabled');
      syncDebugAttributes();
      scheduleReprocess();
    }

    if (changes[FEED_RULES_KEY] !== undefined) {
      feedRules = normalizeFeedRules(changes[FEED_RULES_KEY].newValue);
      debug('Feed rules updated:', feedRules);
      syncDebugAttributes();
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

  closeToneMenu();
  document.querySelectorAll('.magic-reply-wrapper').forEach((el) => el.remove());
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
//  PAGE TOAST / CONTEXT MENU FEEDBACK
// ===================================================================

function showPageToast(message, type = 'info') {
  if (!document.body) return;
  if (pageToastTimer) {
    clearTimeout(pageToastTimer);
    pageToastTimer = null;
  }
  if (pageToastEl) {
    pageToastEl.remove();
    pageToastEl = null;
  }

  const el = document.createElement('div');
  el.className = `xb-toast ${type}`;
  el.textContent = message;
  el.setAttribute('role', 'status');
  document.body.appendChild(el);
  pageToastEl = el;

  void el.offsetHeight;
  el.classList.add('visible');

  pageToastTimer = setTimeout(() => {
    pageToastTimer = null;
    el.classList.add('fade-out');
    setTimeout(() => {
      if (el.parentNode) el.remove();
      if (pageToastEl === el) pageToastEl = null;
    }, 300);
  }, 2500);
}

function consumeNotification(notification) {
  if (!notification) return;

  if (notification.error) {
    showPageToast(notification.error, 'error');
  } else if (notification.keyword && notification.listType) {
    const label = notification.listType === 'negative' ? 'negative' : 'positive';
    showPageToast(
      notification.duplicate
        ? `"${notification.keyword}" already in ${label} keywords`
        : `✓ Added "${notification.keyword}" to ${label} keywords`,
      notification.duplicate ? 'info' : 'success'
    );
  }

  try {
    const pending = chrome.storage.local.remove(NOTIFICATION_KEY);
    if (pending && typeof pending.catch === 'function') pending.catch(() => {});
  } catch (err) {
    console.warn('[X Buddy] Could not clear notification:', err);
  }
}

async function consumePendingNotification() {
  try {
    const result = await chrome.storage.local.get(NOTIFICATION_KEY);
    consumeNotification(result[NOTIFICATION_KEY]);
  } catch (err) {
    console.warn('[X Buddy] Could not read pending notification:', err);
  }
}

// Right-clicking a hashtag normally leaves selectionText empty. Selecting the
// anchor contents lets the background context menu receive the hashtag text.
document.addEventListener('contextmenu', (e) => {
  let el = e.target;
  if (el.nodeType === Node.TEXT_NODE) el = el.parentElement;
  if (!el || !el.closest) return;

  const anchor = el.closest('a');
  if (!anchor) return;

  const text = (anchor.textContent || '').trim();
  if (!text.startsWith('#') || text.length < 2) return;

  try {
    const range = document.createRange();
    range.selectNodeContents(anchor);
    const selection = window.getSelection();
    if (!selection) return;
    selection.removeAllRanges();
    selection.addRange(range);
  } catch (err) {
    console.warn('[X Buddy] Could not select hashtag:', err);
  }
});

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
  // Invalidate in-flight metrics requests so a late reply cannot apply old rules.
  rulesGeneration++;
  metricsCache = new WeakMap();
  metricsPending = new WeakMap();

  for (const el of document.querySelectorAll(`[${PROCESSED_ATTR}]`)) {
    el.removeAttribute(PROCESSED_ATTR);
  }
  for (const el of document.querySelectorAll('.xb-glow-post')) {
    el.classList.remove('xb-glow-post');
  }
  for (const el of document.querySelectorAll('.xb-hidden-post')) {
    el.classList.remove('xb-hidden-post');
  }
  for (const el of document.querySelectorAll(`.${RULE_GLOW_CLASS}`)) {
    el.classList.remove(RULE_GLOW_CLASS);
  }
  for (const el of document.querySelectorAll(`.${RULE_HIDDEN_CLASS}`)) {
    el.classList.remove(RULE_HIDDEN_CLASS);
  }
  for (const el of document.querySelectorAll(`[${METRICS_REQUEST_ATTR}]`)) {
    el.removeAttribute(METRICS_REQUEST_ATTR);
  }
  for (const el of document.querySelectorAll(`[${METRICS_RETRIED_ATTR}]`)) {
    el.removeAttribute(METRICS_RETRIED_ATTR);
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
    // Do not mark this one: X may still be mounting the tweet text. Feed rules
    // do not need text, so image-only posts can still be filtered.
    debug('processPost: could not extract text from', container);
    scheduleFeedRules(container);
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

  scheduleFeedRules(container);
}

// ===================================================================
//  FEED RULES (follower / following / engagement thresholds)
//  Metrics come from page-metrics.js in the MAIN world. If that bridge does
//  not answer, comments/likes/reposts fall back to page-visible counts and
//  followers/following stay unknown. Unknown counts never match a rule.
// ===================================================================

const ENGAGEMENT_BUTTON_SELECTORS = {
  reply: ['[data-testid="reply"]', '[aria-label*="Reply" i]'],
  retweet: [
    '[data-testid="retweet"]',
    '[data-testid="unretweet"]',
    '[aria-label*="Repost" i]',
    '[aria-label*="Retweet" i]',
  ],
  like: ['[data-testid="like"]', '[data-testid="unlike"]', '[aria-label*="Like" i]'],
};

const ENGAGEMENT_LABEL_PATTERNS = {
  reply: /(\d[\d.,]*\s*[KMB]?)\s+repl(?:y|ies)/i,
  retweet: /(\d[\d.,]*\s*[KMB]?)\s+(?:reposts?|retweets?)/i,
  like: /(\d[\d.,]*\s*[KMB]?)\s+likes?/i,
};

const ENGAGEMENT_ZERO_LABELS = {
  reply: /^(?:reply|replies)$/i,
  retweet: /^(?:repost|retweet|reposts|retweets)$/i,
  like: /^(?:like|likes)$/i,
};

function scheduleFeedRules(container) {
  if (!enabled || !feedRulesEnabled || feedRules.length === 0) return;

  const article = container.closest('article') || container;

  // Quoted/nested articles are judged together with the outer post.
  if (article.parentElement?.closest('article')) return;

  const generation = rulesGeneration;

  getPageMetrics(article).then((metrics) => {
    if (!enabled || !feedRulesEnabled) return;
    if (generation !== rulesGeneration) return;
    if (!container.isConnected || !article.isConnected) return;

    debug('Feed rule metrics', metrics);
    applyRuleResult(container, metrics);

    // X may not have mounted the post data on the first request. Retry once
    // so a rule is not skipped for a post that is still rendering.
    const needsRetry = feedRules.some((rule) => metrics[rule.metric] == null);
    if (!needsRetry || article.hasAttribute(METRICS_RETRIED_ATTR)) return;

    article.setAttribute(METRICS_RETRIED_ATTR, '1');
    setTimeout(() => {
      if (!enabled || !feedRulesEnabled) return;
      if (generation !== rulesGeneration) return;
      if (!container.isConnected) return;
      metricsCache.delete(article);
      metricsPending.delete(article);
      scheduleFeedRules(container);
    }, METRICS_RETRY_MS);
  }).catch((err) => {
    console.warn('[X Buddy] Feed rule evaluation failed:', err);
  });
}

function getPageMetrics(article) {
  const cache = metricsCache;
  const pendingMap = metricsPending;

  const cached = cache.get(article);
  if (cached) return Promise.resolve(cached);

  const pending = pendingMap.get(article);
  if (pending) return pending;

  const promise = requestPageMetrics(article).then((metrics) => {
    // Write through the maps captured at request time so a reset cannot be
    // polluted by a response that belongs to the previous settings generation.
    cache.set(article, metrics);
    pendingMap.delete(article);
    return metrics;
  });

  pendingMap.set(article, promise);
  return promise;
}

function requestPageMetrics(article) {
  return new Promise((resolve) => {
    if (!article || !article.isConnected || typeof window.postMessage !== 'function') {
      resolve(readDomEngagement(article));
      return;
    }

    const token = `xb-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    let settled = false;
    let timer = null;

    const finish = (metrics) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      window.removeEventListener('message', onMessage);
      if (article.isConnected) article.removeAttribute(METRICS_REQUEST_ATTR);

      const normalized = normalizeMetrics(metrics);
      fillMissingMetricsFromDom(article, normalized);
      resolve(normalized);
    };

    const onMessage = (event) => {
      if (event.source && event.source !== window) return;

      const data = event.data;
      if (!data || data.channel !== METRICS_CHANNEL || data.type !== 'result') return;
      if (data.token !== token) return;

      finish(data.metrics);
    };

    timer = setTimeout(() => finish(readDomEngagement(article)), METRICS_TIMEOUT_MS);
    window.addEventListener('message', onMessage);
    article.setAttribute(METRICS_REQUEST_ATTR, token);
    window.postMessage({ channel: METRICS_CHANNEL, type: 'request', token }, location.origin);
  });
}

function normalizeMetrics(raw) {
  const source = raw && typeof raw === 'object' ? raw : {};
  return {
    followers: normalizeMetricValue(source.followers),
    following: normalizeMetricValue(source.following),
    comments: normalizeMetricValue(source.comments),
    likes: normalizeMetricValue(source.likes),
    reposts: normalizeMetricValue(source.reposts),
  };
}

function normalizeMetricValue(value) {
  const num = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(num) || num < 0) return null;
  return Math.round(num);
}

// The page helper may not expose every count (for example, a fiber shape
// without reply_count). Fill gaps from the counts visible on the post so
// comment/like/repost rules still work. Follower and following counts have no
// timeline fallback.
function fillMissingMetricsFromDom(article, metrics) {
  if (metrics.comments != null && metrics.likes != null && metrics.reposts != null) return;

  const dom = readDomEngagement(article);
  if (metrics.comments == null && dom.comments != null) metrics.comments = dom.comments;
  if (metrics.likes == null && dom.likes != null) metrics.likes = dom.likes;
  if (metrics.reposts == null && dom.reposts != null) metrics.reposts = dom.reposts;
}

function readDomEngagement(article) {
  const metrics = {
    followers: null,
    following: null,
    comments: null,
    likes: null,
    reposts: null,
  };
  if (!article || typeof article.querySelector !== 'function') return metrics;

  const group = findEngagementGroup(article);
  const fromGroupLabel = parseEngagementGroupLabel(group?.getAttribute('aria-label') || '');
  if (fromGroupLabel.comments != null) metrics.comments = fromGroupLabel.comments;
  if (fromGroupLabel.reposts != null) metrics.reposts = fromGroupLabel.reposts;
  if (fromGroupLabel.likes != null) metrics.likes = fromGroupLabel.likes;

  if (metrics.comments == null) metrics.comments = readEngagementButton(article, 'reply');
  if (metrics.reposts == null) metrics.reposts = readEngagementButton(article, 'retweet');
  if (metrics.likes == null) metrics.likes = readEngagementButton(article, 'like');

  return metrics;
}

function findEngagementGroup(article) {
  const groups = article.querySelectorAll('[role="group"]');

  for (const group of groups) {
    if (group.querySelector(
      '[data-testid="reply"], [data-testid="like"], [aria-label*="Reply" i], [aria-label*="Like" i]'
    )) {
      return group;
    }
  }

  return article.querySelector('[role="group"]');
}

function parseEngagementGroupLabel(label) {
  const out = { comments: null, likes: null, reposts: null };
  if (!label) return out;

  if (ENGAGEMENT_LABEL_PATTERNS.reply.test(label)) {
    out.comments = parseCountText(label.match(ENGAGEMENT_LABEL_PATTERNS.reply)[1]);
  }
  if (ENGAGEMENT_LABEL_PATTERNS.retweet.test(label)) {
    out.reposts = parseCountText(label.match(ENGAGEMENT_LABEL_PATTERNS.retweet)[1]);
  }
  if (ENGAGEMENT_LABEL_PATTERNS.like.test(label)) {
    out.likes = parseCountText(label.match(ENGAGEMENT_LABEL_PATTERNS.like)[1]);
  }

  return out;
}

function readEngagementButton(scope, kind) {
  for (const selector of ENGAGEMENT_BUTTON_SELECTORS[kind] || []) {
    const button = scope.querySelector(selector);
    if (!button) continue;

    // The visible counter is the least ambiguous signal when present. Fall back
    // to the aria-label only when there is no numeric span (for example zero).
    const visible = readVisibleCount(button);
    if (visible != null) return visible;

    const label = button.getAttribute('aria-label') || '';
    const fromLabel = parseEngagementButtonLabel(label, kind);
    if (fromLabel != null) return fromLabel;
  }

  return null;
}

function parseEngagementButtonLabel(label, kind) {
  const text = String(label || '').trim();
  if (!text) return null;

  const pattern = ENGAGEMENT_LABEL_PATTERNS[kind];
  const match = text.match(pattern);
  if (match) return parseCountText(match[1]);

  if (ENGAGEMENT_ZERO_LABELS[kind].test(text)) return 0;
  return null;
}

function readVisibleCount(button) {
  for (const span of button.querySelectorAll('span')) {
    const text = (span.textContent || '').trim();
    if (!text || !/^\d[\d.,]*\s*[KMB]?$/i.test(text)) continue;
    const value = parseCountText(text);
    if (value != null) return value;
  }

  // Some layouts render the counter in a div rather than a span. The action
  // button itself only contains its icon and this number.
  const text = (button.textContent || '').trim();
  const match = text.match(/(\d[\d.,]*\s*[KMB]?)/i);
  return match ? parseCountText(match[1]) : null;
}

function parseCountText(text) {
  if (typeof text !== 'string') return null;

  const normalized = text.trim().replace(/\s+/g, '').replace(/,/g, '');
  const match = normalized.match(/^(\d+(?:\.\d+)?)([KMB])?$/i);
  if (!match) return null;

  const base = Number(match[1]);
  if (!Number.isFinite(base)) return null;

  const suffix = (match[2] || '').toUpperCase();
  const multiplier = suffix === 'K' ? 1e3 : suffix === 'M' ? 1e6 : suffix === 'B' ? 1e9 : 1;
  return Math.round(base * multiplier);
}

function applyRuleResult(container, metrics) {
  let hideRule = null;
  let highlightRule = null;

  for (const rule of feedRules) {
    const value = metrics[rule.metric];
    if (typeof value !== 'number' || !Number.isFinite(value)) continue;
    if (!matchesFeedRule(rule, value)) continue;

    if (rule.action === 'hide') {
      hideRule = rule;
      break;
    }
    if (!highlightRule) highlightRule = rule;
  }

  const hideTarget = getHideTarget(container);

  container.classList.remove(RULE_GLOW_CLASS);
  if (hideTarget) hideTarget.classList.remove(RULE_HIDDEN_CLASS);
  if (container !== hideTarget) container.classList.remove(RULE_HIDDEN_CLASS);

  if (hideRule && hideTarget) {
    hideTarget.classList.add(RULE_HIDDEN_CLASS);
    debug('Hid post by feed rule', hideRule, metrics);
    return;
  }

  if (highlightRule) {
    container.classList.add(RULE_GLOW_CLASS);
    debug('Highlighted post by feed rule', highlightRule, metrics);
  } else if (!hideRule) {
    debug('No feed rule matched', metrics);
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
      dialog.querySelectorAll('.magic-reply-wrapper').forEach((wrapper) => {
        if (!wrapper.querySelector('.magic-reply-btn')) wrapper.remove();
      });
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
    container.querySelectorAll('.magic-reply-wrapper').forEach((wrapper) => {
      if (!wrapper.querySelector('.magic-reply-btn')) wrapper.remove();
    });
    if (!container.querySelector('.magic-reply-btn')) {
      const wrapper = createMagicReplyWrapper(container);
      const sendBtn = container.querySelector(
        '[data-testid="tweetButtonInline"], [data-testid="tweetButton"]'
      );
      if (sendBtn?.parentElement) {
        sendBtn.parentElement.insertBefore(wrapper, sendBtn);
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

function createMagicReplyWrapper(dialog) {
  const wrapper = document.createElement('div');
  wrapper.className = 'magic-reply-wrapper';

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'magic-reply-btn';
  btn.textContent = '✨ Magic Reply';
  btn.setAttribute('aria-haspopup', 'menu');
  btn.setAttribute('aria-expanded', 'false');
  btn._resetTimer = null;
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleToneMenu(wrapper, dialog, btn);
  });

  wrapper.appendChild(btn);
  return wrapper;
}

function toggleToneMenu(wrapper, dialog, trigger) {
  if (activeWrapper === wrapper && activeMenuEl) {
    closeToneMenu();
  } else {
    openToneMenu(wrapper, dialog, trigger);
  }
}

function openToneMenu(wrapper, dialog, trigger) {
  closeToneMenu();
  activeWrapper = wrapper;
  trigger.setAttribute('aria-expanded', 'true');

  const menu = createToneMenu(dialog, trigger);
  document.body.appendChild(menu);
  activeMenuEl = menu;
  if (menu._reposition) menu._reposition();

  toneMenuCloseHandler = (e) => {
    if (!wrapper.contains(e.target) && !menu.contains(e.target)) {
      closeToneMenu();
    }
  };
  setTimeout(() => {
    if (toneMenuCloseHandler) {
      document.addEventListener('click', toneMenuCloseHandler);
    }
  }, 0);

  toneMenuKeyHandler = (e) => {
    if (e.key === 'Escape') closeToneMenu();
  };
  document.addEventListener('keydown', toneMenuKeyHandler);
}

function closeToneMenu() {
  if (toneMenuCloseHandler) {
    document.removeEventListener('click', toneMenuCloseHandler);
    toneMenuCloseHandler = null;
  }
  if (toneMenuKeyHandler) {
    document.removeEventListener('keydown', toneMenuKeyHandler);
    toneMenuKeyHandler = null;
  }

  if (activeWrapper) {
    const trigger = activeWrapper.querySelector('.magic-reply-btn');
    if (trigger) trigger.setAttribute('aria-expanded', 'false');
  }

  if (activeMenuEl) {
    if (activeMenuEl._reposition) {
      window.removeEventListener('scroll', activeMenuEl._reposition, true);
      window.removeEventListener('resize', activeMenuEl._reposition);
    }
    activeMenuEl.remove();
    activeMenuEl = null;
  }

  activeWrapper = null;
}

function createToneMenu(dialog, trigger) {
  const rect = trigger.getBoundingClientRect();

  const menu = document.createElement('div');
  menu.className = 'magic-reply-dropdown open';
  menu.setAttribute('role', 'menu');
  menu.style.position = 'fixed';
  menu.style.left = `${rect.left}px`;
  menu.style.top = `${rect.bottom + 4}px`;
  menu.style.zIndex = '2147483647';

  for (const tone of TONES) {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'magic-reply-dropdown-item';
    item.textContent = tone.label;
    item.setAttribute('role', 'menuitem');
    item.addEventListener('click', (e) => {
      e.stopPropagation();
      closeToneMenu();
      handleMagicReplyClick(trigger, dialog, tone.id);
    });
    menu.appendChild(item);
  }

  const reposition = () => {
    if (!trigger.isConnected) {
      closeToneMenu();
      return;
    }
    const r = trigger.getBoundingClientRect();
    menu.style.left = `${r.left}px`;
    menu.style.top = `${r.bottom + 4}px`;
    if (r.bottom + menu.offsetHeight + 4 > window.innerHeight) {
      menu.style.top = `${Math.max(8, r.top - menu.offsetHeight - 4)}px`;
    }
  };
  menu._reposition = reposition;
  window.addEventListener('scroll', reposition, true);
  window.addEventListener('resize', reposition);

  return menu;
}

function injectButtonNearComposer(dialog) {
  if (dialog.querySelector('.magic-reply-btn')) return false;
  dialog.querySelectorAll('.magic-reply-wrapper').forEach((wrapper) => {
    if (!wrapper.querySelector('.magic-reply-btn')) wrapper.remove();
  });

  const textarea = dialog.querySelector('div[contenteditable="true"]');
  if (!textarea) return false;

  const wrapper = createMagicReplyWrapper(dialog);

  // Try to find the send button to place our button near it
  const sendButton = dialog.querySelector(
    '[data-testid="tweetButtonInline"], [data-testid="tweetButton"], button[aria-label*="Reply"]'
  );

  if (sendButton && sendButton.parentElement) {
    // Insert before the send button in its container
    sendButton.parentElement.insertBefore(wrapper, sendButton);
  } else {
    // Fallback: insert next to the textarea
    const next = textarea.nextElementSibling;
    if (next) {
      textarea.parentElement.insertBefore(wrapper, next);
    } else {
      textarea.parentElement.appendChild(wrapper);
    }
  }

  return true;
}

// ===================================================================
//  MAGIC REPLY HANDLER
// ===================================================================

async function handleMagicReplyClick(btn, dialog, toneId) {
  if (!enabled) return;
  if (btn._resetTimer) {
    clearTimeout(btn._resetTimer);
    btn._resetTimer = null;
  }

  const tone = TONES.find((t) => t.id === toneId)
    || TONES.find((t) => t.id === DEFAULT_TONE_ID)
    || TONES[0];
  const originalText = btn.textContent;

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
      btn.textContent = originalText;
      btn.classList.remove('failed');
    }, 2000);
    return;
  }

  // 2. Update button state
  btn.textContent = `✨ ${tone.label}…`;
  btn.disabled = true;
  btn.classList.remove('failed');

  try {
    // 3. Call local LLM
    console.log(`[X Buddy] Post text for ${tone.label} reply:`, postText);
    const reply = await generateReply(postText, tone.id);

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

async function generateReply(postText, toneId) {
  // The request is proxied through background.js. A content script request to
  // http://localhost is blocked by Chrome's Local Network Access policy.
  let response;
  try {
    response = await chrome.runtime.sendMessage({ type: 'xb:generate-reply', postText, toneId });
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
