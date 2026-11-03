// ===== X Buddy — Page-Context Metrics Helper =====
// Runs in the page's MAIN world (see manifest.json). React's fiber properties
// live on the page-world wrappers of DOM nodes and are not visible from the
// isolated content-script world, so content.js cannot read them directly.
//
// This helper answers window.postMessage requests from content.js with the
// follower / following / comment / like / repost counts X already loaded for a
// post. It never uses chrome.* APIs, storage, or the network, and it only ever
// sends numbers back. The page can observe or spoof these replies; the only
// effect is a CSS class on the page's own posts, so no privileged data is
// exposed.

(function () {
  'use strict';

  const CHANNEL = 'xb-buddy-metrics';
  const REQUEST_ATTR = 'data-xb-metrics-req';
  const TOKEN_PATTERN = /^[a-z0-9-]{8,64}$/i;
  const MAX_FIBER_DEPTH = 40;
  const MAX_UNWRAP_DEPTH = 3;
  const DEBUG = false;

  function debug(...args) {
    if (DEBUG) console.log('[X Buddy page]', ...args);
  }

  function toCount(value) {
    const num = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(num) || num < 0) return null;
    return Math.round(num);
  }

  // Timeline items can wrap the tweet in TweetWithVisibilityResults, and some
  // components pass tweet_results / result wrappers instead of the tweet.
  function unwrapTweet(value) {
    let tweet = value;

    for (let i = 0; i < MAX_UNWRAP_DEPTH && tweet && typeof tweet === 'object'; i++) {
      if (tweet.__typename === 'TweetWithVisibilityResults' && tweet.tweet) {
        tweet = tweet.tweet;
        continue;
      }
      if (tweet.legacy && typeof tweet.legacy === 'object') return tweet;
      if (tweet.tweet && typeof tweet.tweet === 'object') {
        tweet = tweet.tweet;
        continue;
      }
      if (tweet.result && typeof tweet.result === 'object') {
        tweet = tweet.result;
        continue;
      }
      break;
    }

    return null;
  }

  function findTweetFromProps(props) {
    if (!props || typeof props !== 'object') return null;

    const candidates = [
      props.tweet,
      props.tweetResults,
      props.entry?.content?.itemContent?.tweet_results?.result,
      props.itemContent?.tweet_results?.result,
    ];

    for (const candidate of candidates) {
      const tweet = unwrapTweet(candidate);
      if (tweet) return tweet;
    }

    return null;
  }

  function readMetrics(node) {
    if (!node) return null;

    try {
      const fiberKey = Object.keys(node).find(
        (key) => key.startsWith('__reactFiber$') || key.startsWith('__reactInternalInstance$')
      );
      let fiber = fiberKey ? node[fiberKey] : null;

      for (let depth = 0; fiber && depth < MAX_FIBER_DEPTH; depth++, fiber = fiber.return) {
        const tweet = findTweetFromProps(fiber.memoizedProps)
          || findTweetFromProps(fiber.pendingProps);
        if (!tweet) continue;

        const legacy = tweet.legacy || {};
        const user = tweet.core?.user_results?.result;
        const userLegacy = user?.legacy || user?.result?.legacy || {};

        return {
          followers: toCount(userLegacy.followers_count),
          following: toCount(userLegacy.friends_count),
          comments: toCount(legacy.reply_count),
          likes: toCount(legacy.favorite_count),
          reposts: toCount(legacy.retweet_count),
        };
      }
    } catch (err) {
      debug('Could not read tweet metrics', err);
    }

    return null;
  }

  function onMessage(event) {
    if (event.source && event.source !== window) return;

    const data = event.data;
    if (!data || data.channel !== CHANNEL || data.type !== 'request') return;

    const token = typeof data.token === 'string' ? data.token : '';
    if (!TOKEN_PATTERN.test(token)) return;

    const node = document.querySelector(`[${REQUEST_ATTR}="${token}"]`);
    if (!node) {
      debug('No element for token', token);
      return;
    }

    const article = node.closest('article') || node;
    const metrics = readMetrics(article);
    debug('Metrics', token, metrics);

    window.postMessage(
      { channel: CHANNEL, type: 'result', token, metrics },
      window.location.origin
    );
  }

  window.addEventListener('message', onMessage);
})();
