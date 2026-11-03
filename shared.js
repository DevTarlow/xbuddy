// ===== X Buddy — Shared Tone Presets and LLM Defaults =====
// Tone IDs and prompt keys are stable: stored prompts and exported configs use
// them. Keep this list mirrored by the popup selector and the Magic Reply menu.

const TONE_PROMPT_PREFIX = 'xbBuddyTonePrompt_';
const DEFAULT_TONE_ID = 'generic';

// ===== Local LLM settings =====
// The service worker resolves these per request, so changes apply without an
// extension reload. Keep the API key out of exports and logs.
const LLM_SETTINGS_KEY = 'xbBuddyLlmSettings';

const LLM_DEFAULTS = Object.freeze({
  baseUrl: 'http://localhost:8080',
  model: 'gemma-4-E4B-it-QAT-Q4_0.gguf',
  temperature: 0.7,
  maxTokens: 250,
  timeoutSeconds: 60,
  disableThinking: true,
  apiKey: '',
});

const LLM_LIMITS = Object.freeze({
  temperatureMin: 0,
  temperatureMax: 2,
  maxTokensMin: 32,
  maxTokensMax: 4096,
  timeoutSecondsMin: 5,
  timeoutSecondsMax: 300,
  modelMaxLength: 200,
  apiKeyMaxLength: 500,
});

// Accept a base URL or a full OpenAI endpoint, with or without a scheme.
// Only loopback hosts are allowed so posts stay on this machine.
function normalizeLlmBaseUrl(raw) {
  if (typeof raw !== 'string') return '';
  let value = raw.trim();
  if (!value) return '';

  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) {
    value = `http://${value}`;
  }

  let url;
  try {
    url = new URL(value);
  } catch {
    return '';
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') return '';
  if (url.username || url.password) return '';
  if (!url.hostname) return '';

  const host = url.hostname.toLowerCase();
  if (host !== 'localhost' && host !== '127.0.0.1') return '';

  const path = url.pathname.replace(/\/+$/, '');
  const basePath = path.replace(/\/(?:v1\/chat\/completions|v1\/models|v1)$/i, '');
  return `${url.protocol}//${url.host}${basePath}`;
}

function clampLlmNumber(value, fallback, min, max) {
  const num = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.min(max, Math.max(min, num));
}

function normalizeLlmSettings(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const baseUrl = normalizeLlmBaseUrl(src.baseUrl) || LLM_DEFAULTS.baseUrl;

  const model = typeof src.model === 'string' && src.model.trim()
    ? src.model.trim().slice(0, LLM_LIMITS.modelMaxLength)
    : LLM_DEFAULTS.model;

  const temperature = Math.round(clampLlmNumber(
    src.temperature,
    LLM_DEFAULTS.temperature,
    LLM_LIMITS.temperatureMin,
    LLM_LIMITS.temperatureMax
  ) * 100) / 100;

  const maxTokens = Math.round(clampLlmNumber(
    src.maxTokens,
    LLM_DEFAULTS.maxTokens,
    LLM_LIMITS.maxTokensMin,
    LLM_LIMITS.maxTokensMax
  ));

  const timeoutSeconds = Math.round(clampLlmNumber(
    src.timeoutSeconds,
    LLM_DEFAULTS.timeoutSeconds,
    LLM_LIMITS.timeoutSecondsMin,
    LLM_LIMITS.timeoutSecondsMax
  ));

  const disableThinking = typeof src.disableThinking === 'boolean'
    ? src.disableThinking
    : LLM_DEFAULTS.disableThinking;

  const apiKey = typeof src.apiKey === 'string'
    ? src.apiKey.trim().slice(0, LLM_LIMITS.apiKeyMaxLength)
    : '';

  return {
    baseUrl,
    model,
    temperature,
    maxTokens,
    timeoutSeconds,
    disableThinking,
    apiKey,
  };
}

// ===== Feed rules =====
// Rules compare exact counts with strict < / >. Unknown counts never match.
// A hide rule always wins over a highlight rule.
const FEED_RULES_KEY = 'xbBuddyFeedRules';
const FEED_RULES_ENABLED_KEY = 'xbBuddyFeedRulesEnabled';

const FEED_RULE_METRICS = Object.freeze([
  { id: 'followers', label: 'Followers', noun: 'followers', fromAccounts: true },
  { id: 'comments', label: 'Comments', noun: 'comments', fromAccounts: false },
  { id: 'likes', label: 'Likes', noun: 'likes', fromAccounts: false },
  { id: 'reposts', label: 'Reposts', noun: 'reposts', fromAccounts: false },
]);

const FEED_RULE_OPS = Object.freeze([
  { id: 'lt', label: 'fewer than' },
  { id: 'gt', label: 'more than' },
]);

const FEED_RULE_ACTIONS = Object.freeze([
  { id: 'hide', label: 'Hide' },
  { id: 'highlight', label: 'Highlight' },
]);

const FEED_RULE_LIMITS = Object.freeze({
  maxRules: 20,
  thresholdMin: 0,
  thresholdMax: 1000000000,
});

function getFeedRuleEntry(list, id) {
  return list.find((item) => item.id === id) || null;
}

function normalizeFeedRule(raw) {
  if (!raw || typeof raw !== 'object') return null;

  const metric = getFeedRuleEntry(FEED_RULE_METRICS, raw.metric);
  const op = getFeedRuleEntry(FEED_RULE_OPS, raw.op);
  const action = getFeedRuleEntry(FEED_RULE_ACTIONS, raw.action);
  const num = typeof raw.threshold === 'number' ? raw.threshold : Number(raw.threshold);

  if (!metric || !op || !action || !Number.isFinite(num)) return null;

  const threshold = Math.min(
    FEED_RULE_LIMITS.thresholdMax,
    Math.max(FEED_RULE_LIMITS.thresholdMin, Math.round(num))
  );

  return { metric: metric.id, op: op.id, threshold, action: action.id };
}

function feedRuleKey(rule) {
  return `${rule.metric}|${rule.op}|${rule.threshold}|${rule.action}`;
}

function normalizeFeedRules(raw) {
  if (!Array.isArray(raw)) return [];

  const seen = new Set();
  const out = [];

  for (const item of raw) {
    const rule = normalizeFeedRule(item);
    if (!rule) continue;

    const key = feedRuleKey(rule);
    if (seen.has(key)) continue;

    seen.add(key);
    out.push(rule);
    if (out.length >= FEED_RULE_LIMITS.maxRules) break;
  }

  return out;
}

function matchesFeedRule(rule, value) {
  if (!rule || typeof value !== 'number' || !Number.isFinite(value)) return false;
  return rule.op === 'lt' ? value < rule.threshold : value > rule.threshold;
}

function formatFeedRule(rule) {
  const metric = getFeedRuleEntry(FEED_RULE_METRICS, rule.metric);
  const op = getFeedRuleEntry(FEED_RULE_OPS, rule.op);
  const action = getFeedRuleEntry(FEED_RULE_ACTIONS, rule.action);
  if (!metric || !op || !action) return '';

  const subject = metric.fromAccounts ? 'posts from accounts' : 'posts';
  return `${action.label} ${subject} with ${op.label} ${rule.threshold.toLocaleString('en-US')} ${metric.noun}`;
}

// ===== Reply length =====
// The slider sets a per-request length target. background.js appends it after
// the post in the user message, where the model follows it most reliably.
const REPLY_LENGTH_KEY = 'xbBuddyReplyLength';
const DEFAULT_REPLY_LENGTH = 2;

const REPLY_LENGTH_LEVELS = Object.freeze([
  { level: 1, label: 'One-liner', maxSentences: 1, maxWords: 8, detail: '1 sentence, 8 words max' },
  { level: 2, label: 'Short', maxSentences: 1, maxWords: 15, detail: '1 sentence, 15 words max' },
  { level: 3, label: 'Balanced', maxSentences: 2, maxWords: 25, detail: 'up to 2 sentences, 25 words max' },
  { level: 4, label: 'Detailed', maxSentences: 3, maxWords: 38, detail: 'up to 3 sentences, 38 words max' },
  { level: 5, label: 'Long', maxSentences: 4, maxWords: 50, detail: 'up to 4 sentences, 50 words max' },
  { level: 6, label: 'Auto', auto: true, detail: 'the model chooses based on the post' },
]);

function normalizeReplyLength(raw) {
  if (typeof raw !== 'number' && typeof raw !== 'string') return DEFAULT_REPLY_LENGTH;
  if (typeof raw === 'string' && !raw.trim()) return DEFAULT_REPLY_LENGTH;
  const num = Number(raw);
  if (!Number.isFinite(num)) return DEFAULT_REPLY_LENGTH;
  return Math.min(REPLY_LENGTH_LEVELS.length, Math.max(1, Math.round(num)));
}

function getReplyLengthLevel(level) {
  return REPLY_LENGTH_LEVELS[normalizeReplyLength(level) - 1];
}

function formatReplyLength(level) {
  const spec = getReplyLengthLevel(level);
  return `${spec.label} · ${spec.detail}`;
}

function buildReplyLengthInstruction(level) {
  const spec = getReplyLengthLevel(level);
  if (spec.auto) {
    return 'Length: choose the best length for this post. Keep it brief unless the post needs more. Do not pad, and do not cut a real thought short. This overrides any length limit in the tone instructions. Reply with only the reply text.';
  }

  const sentences = spec.maxSentences === 1 ? '1 sentence' : `${spec.maxSentences} sentences`;
  return `Length: at most ${sentences} and ${spec.maxWords} words. This overrides any length limit in the tone instructions. Reply with only the reply text.`;
}

// ===== Reply tone prompts =====
// The shared core carries the voice rules. Each tone appends only the behavior
// that makes it different, so the defaults cannot drift apart.
const REPLY_VOICE_CORE = [
  'You write short replies on X as an ordinary person, not a brand or an assistant.',
  'Sound like someone typing in the reply box: plain words, contractions, one clear thought. Starting a sentence with And, But, or So is fine, and a short fragment is fine.',
  'Respond to something specific in the post, and add something of your own: a reaction, an opinion, a consequence, or a concrete detail. If the post is short or has no clear point, react to its tone or ask one plain question.',
  'Never summarize, compliment, or restate the post.',
  'Every sentence has to add a new thought. Cut any sentence that only wraps up or repeats the point.',
  'Stay grounded in the post: do not invent facts, numbers, names, dates, quotes, or sources. A clearly exaggerated joke is fine; a made-up fact or personal story presented as real is not.',
  'Do not open with "Great point", "Love this", "So true", "This", "Exactly", "Couldn\'t agree more", "Honestly", or "Look". No em dashes, hashtags, emojis, links, or @mentions.',
  'Avoid AI and corporate words: delve, robust, landscape, tapestry, pivotal, crucial, seamless, leverage, unlock, foster, underscore, showcase, testament.',
  'Never mention being an AI. Output only the reply text: no quotes, labels, options, or explanation.',
].join(' ');

function withReplyVoice(toneInstructions) {
  return `${REPLY_VOICE_CORE} ${toneInstructions}`;
}

const TONES = [
  {
    id: 'generic',
    label: 'Generic',
    defaultPrompt: withReplyVoice(
      'React to the post. You do not have to agree or disagree; say the first honest thing it makes you think. Pick one specific point and respond to it. No clever closer.'
    ),
  },
  {
    id: 'agree',
    label: 'Agree',
    defaultPrompt: withReplyVoice(
      'Match the poster\'s energy and agree with the specific part that gets it right. Add a reason, a consequence, or something you noticed. If they are excited, be excited with them; if they are frustrated, side with them. No gushing and no generic praise.'
    ),
  },
  {
    id: 'connect',
    label: 'Connect',
    defaultPrompt: withReplyVoice(
      'Someone is inviting people to connect or sharing what they build. Open with "I\'d love to connect" or "Would love to connect". Then ask one short question about what they are building or most excited about. Stop there: no second question, no extra detail, no other flattery, no pitch, no growth jargon, and no claims about your own projects, skills, or experience.'
    ),
  },
  {
    id: 'disagree',
    label: 'Disagree',
    defaultPrompt: withReplyVoice(
      'Disagree with the weakest specific claim in the post. Say what you think instead and give one reason. You can concede a small point, but do not turn the reply into agreement. No lectures, no strawman, no mockery, and no "well, actually".'
    ),
  },
  {
    id: 'funny',
    label: 'Funny',
    defaultPrompt: withReplyVoice(
      'Write one deadpan, absurd line about the post\'s actual subject. It has to be a joke, not a complaint or a hot take. Exaggerate the subject or undercut it with a flat observation. Stay on the subject: no unrelated scenes, no puns, no wordplay, no "lol", and do not explain the joke.'
    ),
  },
  {
    id: 'informative',
    label: 'Informative',
    defaultPrompt: withReplyVoice(
      'Add one concrete thing the post leaves out: a mechanism, a number, a name, or a concrete example. Prefer a fact or example over a question. If the post does not give you enough to add something real, give a plain perspective; ask a question only as a last resort. Never invent a fact.'
    ),
  },
];

// The built-ins from 1.5.x. A saved prompt that matches one of these exactly
// was never really customized, so it should pick up the rewritten default.
// When changing a default again, append the previous string to its array.
const LEGACY_TONE_PROMPTS = Object.freeze({
  generic: [
    [
      'You write replies on X (Twitter) as a real person.',
      'Reply to the post below with exactly ONE short, natural reply, under 2 sentences.',
      'Output only the reply text: no options, no numbered lists, no quotation marks, no preamble, no explanation, no hashtags, and no emojis.',
      'Be specific to the post. Never mention being an AI or an assistant.',
    ].join(' '),
  ],
  agree: [
    [
      'You are an authentic, engaging person on X (Twitter).',
      'Write a concise reply that agrees with or supports the post.',
      'Share the enthusiasm or affirm the poster\'s point naturally.',
      'Do not sound like an AI assistant. Avoid emojis, hashtags, and corporate language.',
      'Keep it under 2 sentences. Output only the reply text.',
    ].join(' '),
  ],
  disagree: [
    [
      'You are a thoughtful person on X (Twitter).',
      'Write a concise reply that respectfully disagrees with or offers a counterpoint to the post.',
      'Be polite and constructive; no hostility, name-calling, or sarcasm.',
      'Acknowledge the other side before presenting your view.',
      'Do not sound like an AI assistant. Avoid emojis, hashtags, and corporate language.',
      'Keep it under 3 sentences. Output only the reply text.',
    ].join(' '),
  ],
  funny: [
    [
      'You are a witty person on X (Twitter).',
      'Write a short, funny reply to the post.',
      'Use light humor, wordplay, or a clever observation.',
      'Keep it natural and not forced; no memes, hashtags, or emoji overload.',
      'Avoid sarcasm that could be mistaken for hostility.',
      'Do not sound like an AI assistant. Keep it under 2 sentences.',
      'Output only the reply text.',
    ].join(' '),
  ],
  informative: [
    [
      'You are a knowledgeable person on X (Twitter).',
      'Write a concise reply that adds useful context, facts, or perspective to the post.',
      'Be conversational but precise. If you share a fact, frame it as casual knowledge, not a citation.',
      'Do not sound like an AI assistant or a textbook.',
      'Avoid emojis, hashtags, and corporate jargon.',
      'Keep it under 3 sentences. Output only the reply text.',
    ].join(' '),
  ],
});

function resolveTonePrompt(tone, storedValue) {
  const value = typeof storedValue === 'string' ? storedValue.trim() : '';
  if (!value) return tone.defaultPrompt;

  const legacy = LEGACY_TONE_PROMPTS[tone.id] || [];
  if (legacy.includes(value)) return tone.defaultPrompt;

  return value;
}
