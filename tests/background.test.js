import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// background.js is a service worker, not a module. Evaluate shared.js and then
// background.js with a small chrome stub so recovery and generation can be
// exercised without Chrome.
const sharedSource = readFileSync(new URL('../shared.js', import.meta.url), 'utf8');
const source = readFileSync(new URL('../background.js', import.meta.url), 'utf8');

const LLM_SETTINGS = {
  baseUrl: 'http://localhost:8080',
  model: 'test-model',
  temperature: 0.7,
  maxTokens: 250,
  timeoutSeconds: 60,
  disableThinking: true,
  apiKey: '',
};

function defaultStorage(overrides = {}) {
  return {
    xbBuddyLlmSettings: { ...LLM_SETTINGS },
    xbBuddyReplyLength: 3,
    ...overrides,
  };
}

function createBackground({
  tab = null,
  markers = [],
  draft = false,
  ping = false,
  storage = {},
  responses = [],
} = {}) {
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
  const requests = [];
  const queue = [...responses];

  const chrome = {
    storage: {
      local: {
        get: async (keys) => {
          const list = typeof keys === 'string'
            ? [keys]
            : Array.isArray(keys)
              ? keys
              : Object.keys(keys || {});
          const out = {};
          for (const key of list) {
            if (key in storage) out[key] = storage[key];
          }
          return out;
        },
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
    URL,
    fetch: async (url, options) => {
      requests.push({ url: String(url), body: JSON.parse(options.body) });
      const content = queue.length ? queue.shift() : 'Clean output.';
      return {
        ok: true,
        status: 200,
        json: async () => ({ choices: [{ message: { content } }] }),
      };
    },
  });

  vm.runInContext(`${sharedSource}\nglobalThis.__shared = {
    REPLY_VOICE_CUES,
    POST_VOICE_CUES,
    DEFAULT_VOICE_PERSONA,
    DEFAULT_VOICE_RULES,
    EXAMPLES_CAVEAT,
    POST_OUTPUT_INSTRUCTION,
    POST_CLOSER_INSTRUCTION,
    NUDGE_INSTRUCTIONS,
  };`, context);

  vm.runInContext(
    `${source}\nglobalThis.__bg = {
      ensureTabContent,
      isXOriginPattern,
      generateReply,
      generatePost,
      generateVoice,
    };`,
    context
  );

  return {
    bg: context.__bg,
    shared: context.__shared,
    calls,
    listeners,
    timers,
    requests,
  };
}

function sendMessage(env, message) {
  return new Promise((resolve) => {
    env.listeners.message(message, null, resolve);
  });
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

test('generateReply sends reply examples as user/assistant turns', async () => {
  const env = createBackground({
    storage: defaultStorage({
      xbBuddyReplyExamples: 'Post: A post.\nReply: A reply.\n\n---\n\nPost: Another.\nReply: Another reply.',
    }),
    responses: ['Clean reply.'],
  });

  const reply = await env.bg.generateReply('Source post', 'generic');

  assert.equal(reply, 'Clean reply.');
  const body = env.requests[0].body;
  assert.equal(body.messages[0].role, 'system');
  assert.ok(body.messages[0].content.includes(env.shared.DEFAULT_VOICE_PERSONA));
  assert.ok(body.messages[0].content.includes(env.shared.REPLY_VOICE_CUES));
  assert.ok(!body.messages[0].content.includes(env.shared.POST_VOICE_CUES));
  assert.ok(body.messages[0].content.includes(env.shared.EXAMPLES_CAVEAT));

  assert.equal(body.messages.length, 6);
  assert.deepEqual(
    body.messages.slice(1, 5).map((message) => message.role),
    ['user', 'assistant', 'user', 'assistant']
  );
  assert.equal(body.messages[1].content, 'Write a reply to this post:\n\nA post.');
  assert.equal(body.messages[2].content, 'A reply.');
  assert.ok(body.messages[5].content.includes('Source post'));
  assert.ok(body.messages[5].content.includes('Length:'));
});

test('an empty Reply Examples value sends no example turns', async () => {
  const env = createBackground({
    storage: defaultStorage({ xbBuddyReplyExamples: '' }),
    responses: ['Clean reply.'],
  });

  await env.bg.generateReply('Source post', 'generic');

  const body = env.requests[0].body;
  assert.equal(body.messages.length, 2);
  assert.ok(!body.messages[0].content.includes(env.shared.EXAMPLES_CAVEAT));
});

test('generatePost sends post examples as turns and uses only the post cues', async () => {
  const env = createBackground({
    storage: defaultStorage({
      xbBuddyPostExamples: 'Example one.\n\n---\n\nExample two.',
    }),
    responses: ['Clean post.'],
  });

  const post = await env.bg.generatePost('A rough note');

  assert.equal(post, 'Clean post.');
  const body = env.requests[0].body;
  assert.ok(body.messages[0].content.includes(env.shared.POST_VOICE_CUES));
  assert.ok(!body.messages[0].content.includes(env.shared.REPLY_VOICE_CUES));
  assert.ok(body.messages[0].content.includes(env.shared.EXAMPLES_CAVEAT));
  assert.ok(!body.messages[0].content.includes('Example one.'));
  assert.equal(body.messages.length, 6);
  assert.equal(body.messages[2].content, 'Example one.');
  assert.equal(body.messages[4].content, 'Example two.');

  const finalUser = body.messages[5].content;
  assert.ok(finalUser.includes('A rough note'));
  assert.ok(finalUser.includes(env.shared.POST_OUTPUT_INSTRUCTION));
  assert.ok(finalUser.includes(env.shared.POST_CLOSER_INSTRUCTION));
});

test('a banned phrase triggers exactly one retry and returns the clean rewrite', async () => {
  const env = createBackground({
    storage: defaultStorage({ xbBuddyReplyExamples: '' }),
    responses: ['A robust tool.', 'A solid tool.'],
  });

  const reply = await env.bg.generateReply('Source', 'generic');

  assert.equal(reply, 'A solid tool.');
  assert.equal(env.requests.length, 2);
  assert.ok(env.requests[1].body.messages.at(-1).content.includes('robust'));
});

test('a still-dirty rewrite is stripped without a third request', async () => {
  const env = createBackground({
    storage: defaultStorage({ xbBuddyReplyExamples: '' }),
    responses: ['A robust tool.', 'Still robust.'],
  });

  const reply = await env.bg.generateReply('Source', 'generic');

  assert.equal(reply, 'Still.');
  assert.equal(env.requests.length, 2);
  assert.equal(reply.includes('robust'), false);
});

test('a clean first response makes only one request', async () => {
  const env = createBackground({
    storage: defaultStorage({ xbBuddyReplyExamples: '' }),
    responses: ['A clean reply.'],
  });

  await env.bg.generateReply('Source', 'generic');

  assert.equal(env.requests.length, 1);
});

test('nudges are appended to the user prompt and unknown ids are ignored', async () => {
  const env = createBackground({
    storage: defaultStorage({ xbBuddyReplyExamples: '' }),
    responses: ['Clean reply.', 'Clean reply.'],
  });

  await env.bg.generateReply('Source', 'generic', 'shorter');
  assert.ok(
    env.requests[0].body.messages.at(-1).content.includes('Make it noticeably shorter.')
  );

  await env.bg.generateReply('Source', 'generic', 'not-a-nudge');
  assert.ok(
    !env.requests[1].body.messages.at(-1).content.includes('Make it noticeably shorter.')
  );
});

test('xb:generate-voice returns the normalized persona and style', async () => {
  const env = createBackground({
    storage: defaultStorage(),
    responses: [
      '{"persona":"You write on X as a tester.","style":{"casing":"lowercase","emojis":"none"}}',
    ],
  });

  const response = await sendMessage(env, {
    type: 'xb:generate-voice',
    samples: 'sample one\n\nsample two',
  });

  assert.equal(response.ok, true);
  assert.equal(response.voice.persona, 'You write on X as a tester.');
  assert.equal(response.voice.style.casing, 'casual');
  assert.equal(response.voice.style.emojis, 'off');
  assert.equal(env.requests[0].body.max_tokens, 500);
});

test('xb:generate-voice reports unreadable JSON and a missing model', async () => {
  const badJson = createBackground({
    storage: defaultStorage(),
    responses: ['not json'],
  });
  const badResponse = await sendMessage(badJson, {
    type: 'xb:generate-voice',
    samples: 'samples',
  });
  assert.equal(badResponse.ok, false);
  assert.match(badResponse.error, /Could not read a voice/);

  const noModel = createBackground({
    storage: defaultStorage({
      xbBuddyLlmSettings: { ...LLM_SETTINGS, model: '' },
    }),
  });
  const noModelResponse = await sendMessage(noModel, {
    type: 'xb:generate-voice',
    samples: 'samples',
  });
  assert.equal(noModelResponse.ok, false);
  assert.match(noModelResponse.error, /No model selected/);
  assert.equal(noModel.requests.length, 0);
});
