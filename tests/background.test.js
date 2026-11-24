import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// background.js is a service worker, not a module. Evaluate it with a small
// chrome stub so the recovery guards can be exercised without Chrome.
const source = readFileSync(new URL('../background.js', import.meta.url), 'utf8');

function createBackground({ tab = null, markers = [], draft = false, ping = false } = {}) {
  const listeners = {};
  const calls = {
    executeScript: [],
    insertCSS: [],
    reload: [],
    sendMessage: [],
    query: 0,
    get: 0,
  };
  const timers = [];

  const chrome = {
    storage: {
      local: {
        get: async () => ({}),
        set: async () => {},
      },
    },
    tabs: {
      onUpdated: { addListener: (fn) => { listeners.tabUpdated = fn; } },
      onActivated: { addListener: (fn) => { listeners.tabActivated = fn; } },
      query: async () => {
        calls.query += 1;
        return [];
      },
      get: async (tabId) => {
        calls.get += 1;
        return tab?.id === tabId ? { ...tab } : null;
      },
      sendMessage: async (tabId, message) => {
        calls.sendMessage.push({ tabId, message });
        if (ping) return { ok: true };
        throw new Error('Could not establish connection');
      },
      reload: async (tabId) => {
        calls.reload.push(tabId);
      },
    },
    scripting: {
      executeScript: async (options) => {
        calls.executeScript.push(options);
        if (Array.isArray(options.files)) return [{ result: undefined }];
        if (Array.isArray(options.args)) {
          return [{ result: markers.includes(options.args[0]) }];
        }
        return [{ result: draft }];
      },
      insertCSS: async (options) => {
        calls.insertCSS.push(options);
      },
    },
    permissions: {
      onAdded: { addListener: (fn) => { listeners.permissionAdded = fn; } },
    },
    contextMenus: {
      removeAll: (callback) => callback?.(),
      create: (_properties, callback) => callback?.(),
      onClicked: { addListener: (fn) => { listeners.menuClicked = fn; } },
    },
    runtime: {
      lastError: undefined,
      onInstalled: { addListener: (fn) => { listeners.installed = fn; } },
      onStartup: { addListener: (fn) => { listeners.startup = fn; } },
      onMessage: { addListener: (fn) => { listeners.message = fn; } },
    },
  };

  const context = vm.createContext({
    chrome,
    console: { warn() {}, log() {}, error() {} },
    setTimeout: (fn) => {
      timers.push(fn);
      return timers.length;
    },
    clearTimeout: () => {},
    importScripts: () => {},
    AbortSignal,
    fetch: async () => {
      throw new Error('fetch should not run in these tests');
    },
  });

  vm.runInContext(
    `${source}\nglobalThis.__bg = { ensureTabContent, isXOriginPattern };`,
    context
  );

  return { bg: context.__bg, calls, listeners, timers };
}

// The service worker uses setTimeout for ping retries and injection delays.
// Run those callbacks and let the async chains settle.
async function flushTimers(timers) {
  for (let i = 0; i < 20; i++) {
    const batch = timers.splice(0);
    for (const fn of batch) fn();
    await new Promise((resolve) => setImmediate(resolve));
    if (!timers.length) return;
  }
  throw new Error('recovery timers did not settle');
}

async function runEnsure(env, tab) {
  const run = env.bg.ensureTabContent(tab);
  await flushTimers(env.timers);
  await run;
}

function hasDraftProbe(calls) {
  return calls.executeScript.some((options) => !options.files && !options.args);
}

test('ensureTabContent does not touch a tab that is still loading', async () => {
  const tab = { id: 1, status: 'loading', url: 'https://x.com/home' };
  // A 1.7.1 marker must not force a reload on a document that is mid-load.
  const env = createBackground({ tab, markers: ['data-xb-buddy'], draft: false });

  await env.bg.ensureTabContent(tab);

  assert.deepEqual(env.calls.sendMessage, []);
  assert.deepEqual(env.calls.executeScript, []);
  assert.deepEqual(env.calls.insertCSS, []);
  assert.deepEqual(env.calls.reload, []);
});

test('a 1.7.1 orphan with an unsent draft is not reloaded', async () => {
  const tab = { id: 2, status: 'complete', url: 'https://x.com/home' };
  const env = createBackground({ tab, markers: ['data-xb-buddy'], draft: true });

  await runEnsure(env, tab);

  assert.equal(hasDraftProbe(env.calls), true, 'draft probe should run first');
  assert.deepEqual(env.calls.reload, []);
});

test('a 1.7.1 orphan with an empty composer is reloaded once', async () => {
  const tab = { id: 3, status: 'complete', url: 'https://x.com/home' };
  const env = createBackground({ tab, markers: ['data-xb-buddy'], draft: false });

  await runEnsure(env, tab);

  assert.equal(hasDraftProbe(env.calls), true);
  assert.deepEqual(env.calls.reload, [3]);
});

test('a complete tab with no content scripts gets the programmatic injection', async () => {
  const tab = { id: 4, status: 'complete', url: 'https://x.com/home' };
  const env = createBackground({ tab });

  await runEnsure(env, tab);

  const injectedFiles = env.calls.executeScript
    .filter((options) => Array.isArray(options.files))
    .map((options) => options.files.join(','));

  assert.deepEqual(env.calls.reload, []);
  assert.equal(env.calls.insertCSS.length, 1);
  assert.deepEqual(injectedFiles, ['page-metrics.js', 'shared.js,content.js']);
});

test('only an X or Twitter permission grant schedules tab recovery', async () => {
  const env = createBackground();
  await flushTimers(env.timers); // let the startup recovery run once
  env.calls.query = 0;

  env.listeners.permissionAdded({ origins: ['https://localhost/*'] });
  await flushTimers(env.timers);
  assert.equal(env.calls.query, 0, 'loopback grant must not scan X tabs');

  env.listeners.permissionAdded({ origins: ['https://x.com/*'] });
  await flushTimers(env.timers);
  assert.equal(env.calls.query, 1);

  env.listeners.permissionAdded({ origins: ['https://twitter.com/*'] });
  await flushTimers(env.timers);
  assert.equal(env.calls.query, 2);
});

test('isXOriginPattern matches X hosts, subdomains, and wildcards only', () => {
  const { bg } = createBackground();

  for (const origin of [
    'https://x.com/*',
    'https://twitter.com/*',
    'https://*.x.com/*',
    'https://mobile.twitter.com/*',
    'https://x.com:443/*',
  ]) {
    assert.equal(bg.isXOriginPattern(origin), true, origin);
  }

  for (const origin of [
    'https://localhost/*',
    'https://notx.com/*',
    'https://x.com.evil.example/*',
    'https://example.com/x.com/*',
    '',
  ]) {
    assert.equal(bg.isXOriginPattern(origin), false, origin);
  }
});
