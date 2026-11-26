import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../shared.js', import.meta.url), 'utf8');
const context = vm.createContext({});

const EXPORTS = [
  'TONE_PROMPT_PREFIX',
  'DEFAULT_TONE_ID',
  'TONES',
  'DEFAULT_VOICE_PERSONA',
  'DEFAULT_VOICE_RULES',
  'DEFAULT_VOICE_STYLE',
  'VOICE_STYLE_OPTIONS',
  'LEGACY_VOICE_SKILLS',
  'DEFAULT_POST_EXAMPLES',
  'DEFAULT_REPLY_EXAMPLES',
  'LEGACY_POST_EXAMPLES',
  'LEGACY_VOICE_CORES',
  'LEGACY_TONE_PROMPTS',
  'VOICE_BANNED_WORDS',
  'VOICE_BANNED_PHRASES',
  'VOICE_BANNED_TERMS',
  'VOICE_SKILL_LIMITS',
  'VOICE_RULES_LIMITS',
  'POST_EXAMPLES_LIMITS',
  'REPLY_EXAMPLES_LIMITS',
  'POST_USER_INSTRUCTION',
  'POST_OUTPUT_INSTRUCTION',
  'POST_CLOSER_INSTRUCTION',
  'POST_EXAMPLE_USER_PROMPT',
  'EXAMPLES_CAVEAT',
  'POST_SOFT_LIMIT',
  'VOICE_GENERATION_LIMITS',
  'VOICE_FROM_SAMPLES_SYSTEM',
  'VOICE_FROM_SAMPLES_USER',
  'NUDGE_INSTRUCTIONS',
  'CUSTOM_TONE_LIMITS',
  'POST_VOICE_CUES',
  'REPLY_VOICE_CUES',
  'normalizeVoicePersona',
  'resolveVoicePersona',
  'normalizeVoiceRules',
  'resolveVoiceRules',
  'normalizeVoiceStyle',
  'formatVoiceStyle',
  'resolveVoiceSettings',
  'normalizePostExamples',
  'resolvePostExamples',
  'normalizeReplyExamples',
  'resolveReplyExamples',
  'parsePostExamples',
  'parseReplyExamples',
  'composeReplySystemPrompt',
  'composePostSystemPrompt',
  'composeReplyUserPrompt',
  'composePostUserPrompt',
  'cleanReply',
  'cleanPost',
  'normalizeDashes',
  'stripHashtags',
  'findBannedPhrases',
  'stripBannedPhrases',
  'buildBannedRetryPrompt',
  'normalizeNudgeId',
  'buildNudgeInstruction',
  'normalizeToneId',
  'createCustomToneId',
  'normalizeCustomTones',
  'normalizeHiddenToneIds',
  'resolveToneList',
  'sanitizeHiddenToneIds',
  'resolveVisibleTones',
  'resolveToneInstruction',
  'resolveTonePrompts',
  'parseGeneratedVoice',
  'countPostCharacters',
  'classifyComposerSurface',
];

vm.runInContext(`${source}\nglobalThis.__xb = { ${EXPORTS.join(', ')} };`, context);
const S = context.__xb;
const tone = (id) => S.TONES.find((item) => item.id === id);

function fnv1a(str) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

const dashFree = (text) => !/[\u2013\u2014]/.test(text);

test('resolveVoicePersona upgrades saved legacy defaults but keeps custom voices', () => {
  assert.equal(S.resolveVoicePersona(S.DEFAULT_VOICE_PERSONA), S.DEFAULT_VOICE_PERSONA);
  assert.ok(S.LEGACY_VOICE_SKILLS.length >= 3, 'old base, old full defaults are tracked');
  for (const legacy of S.LEGACY_VOICE_SKILLS) {
    assert.equal(S.resolveVoicePersona(legacy), S.DEFAULT_VOICE_PERSONA);
  }
  assert.equal(S.resolveVoicePersona('A custom voice.'), 'A custom voice.');
  assert.equal(S.resolveVoicePersona(''), S.DEFAULT_VOICE_PERSONA);
  assert.equal(S.resolveVoicePersona(undefined), S.DEFAULT_VOICE_PERSONA);
});

test('the 1.7.4 default is captured exactly for migration', () => {
  const v174 = S.LEGACY_VOICE_SKILLS.find((value) => value.length === 5778);
  assert.ok(v174, 'the 1.7.4 default is in the legacy list');
  assert.equal(fnv1a(v174), '15171b54');
});

test('resolvePostExamples keeps an empty list empty and upgrades legacy examples', () => {
  assert.equal(S.resolvePostExamples(undefined), S.DEFAULT_POST_EXAMPLES);
  assert.equal(S.resolvePostExamples(''), '');
  assert.equal(S.resolvePostExamples('Custom examples.'), 'Custom examples.');
  for (const legacy of S.LEGACY_POST_EXAMPLES) {
    assert.equal(S.resolvePostExamples(legacy), S.DEFAULT_POST_EXAMPLES);
  }
});

test('resolveReplyExamples defaults when missing and treats an empty string as off', () => {
  assert.equal(S.resolveReplyExamples(undefined), S.DEFAULT_REPLY_EXAMPLES);
  assert.equal(S.resolveReplyExamples(''), '');
  assert.equal(S.resolveReplyExamples('Custom examples.'), 'Custom examples.');
  assert.ok(S.DEFAULT_REPLY_EXAMPLES.includes('Post:'));
  assert.ok(S.DEFAULT_REPLY_EXAMPLES.includes('Reply:'));
});

test('the new default text avoids em and en dashes', () => {
  const texts = [
    S.DEFAULT_VOICE_PERSONA,
    S.DEFAULT_VOICE_RULES,
    S.POST_VOICE_CUES,
    S.REPLY_VOICE_CUES,
    S.DEFAULT_POST_EXAMPLES,
    S.DEFAULT_REPLY_EXAMPLES,
    S.POST_USER_INSTRUCTION,
    S.POST_OUTPUT_INSTRUCTION,
    S.POST_CLOSER_INSTRUCTION,
    S.EXAMPLES_CAVEAT,
    S.VOICE_FROM_SAMPLES_SYSTEM,
    S.VOICE_FROM_SAMPLES_USER,
    S.formatVoiceStyle({}),
    S.formatVoiceStyle({
      casing: 'casual',
      emojis: 'expressive',
      hashtags: 'allow',
      exclamations: 'natural',
    }),
    ...S.NUDGE_INSTRUCTIONS.map((nudge) => nudge.instruction),
    ...S.TONES.map((item) => item.direction),
  ];

  for (const text of texts) {
    assert.ok(dashFree(text), text.slice(0, 60));
  }
});

test('the default persona and examples avoid banned terms and output markers', () => {
  const escape = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const checked = [S.DEFAULT_VOICE_PERSONA, S.DEFAULT_POST_EXAMPLES, S.DEFAULT_REPLY_EXAMPLES];

  for (const text of checked) {
    for (const term of S.VOICE_BANNED_WORDS) {
      assert.equal(
        new RegExp(`\\b${escape(term)}\\b`, 'i').test(text),
        false,
        `default uses banned word: ${term}`
      );
    }
    for (const phrase of S.VOICE_BANNED_PHRASES) {
      assert.equal(text.toLowerCase().includes(phrase.toLowerCase()), false, phrase);
    }
    assert.equal(/#[\p{L}\p{N}_]/u.test(text), false, 'default has a hashtag');
    assert.equal(/(^|[^\w])@[\w.]+/.test(text), false, 'default has a mention');
    assert.equal(/https?:\/\/\S+/.test(text), false, 'default has a URL');
  }
});

test('the default text fits the editable limits', () => {
  assert.ok(S.DEFAULT_VOICE_PERSONA.length <= S.VOICE_SKILL_LIMITS.maxLength);
  assert.ok(S.DEFAULT_VOICE_RULES.length <= S.VOICE_RULES_LIMITS.maxLength);
  assert.ok(S.DEFAULT_POST_EXAMPLES.length <= S.POST_EXAMPLES_LIMITS.maxLength);
  assert.ok(S.DEFAULT_REPLY_EXAMPLES.length <= S.REPLY_EXAMPLES_LIMITS.maxLength);
  assert.ok(S.DEFAULT_VOICE_RULES.length < 4000, 'the default rules stay short');
});

test('the refreshed defaults carry the handoff wording', () => {
  assert.ok(!S.DEFAULT_VOICE_PERSONA.includes('MossAIStudio'));
  assert.ok(S.DEFAULT_VOICE_PERSONA.includes('indie developer and builder'));
  assert.ok(S.DEFAULT_VOICE_PERSONA.includes('casual, practical, and conversational'));
  assert.ok(S.DEFAULT_VOICE_RULES.includes('1 to 3 short sentences'));
  assert.ok(S.DEFAULT_VOICE_RULES.includes('Avoid these words/phrases:'));
  assert.ok(S.DEFAULT_VOICE_RULES.includes('Treat the post or note as material'));
  assert.ok(S.POST_VOICE_CUES.includes('Emojis: 0 to 2 max'));
  assert.ok(S.REPLY_VOICE_CUES.includes('Emojis: 0 or 1 max'));
  assert.ok(!S.DEFAULT_POST_EXAMPLES.includes('Keep building builders'));
  assert.equal(S.parseReplyExamples(S.DEFAULT_REPLY_EXAMPLES).length, 4);
});

test('resolveVoiceRules defaults, clears, and obeys the toggle', () => {
  assert.equal(S.resolveVoiceRules(undefined), S.DEFAULT_VOICE_RULES);
  assert.equal(S.normalizeVoiceRules(undefined), S.DEFAULT_VOICE_RULES);
  assert.equal(S.resolveVoiceRules(''), '');
  assert.equal(S.resolveVoiceRules('Custom rules.'), 'Custom rules.');
  assert.equal(S.resolveVoiceRules('Custom rules.', false), '');
  assert.equal(S.resolveVoiceRules('', true), '');
  assert.equal(S.resolveVoiceRules(S.DEFAULT_VOICE_RULES, true), S.DEFAULT_VOICE_RULES);
});

test('normalizeVoiceStyle accepts the UI values and common aliases', () => {
  assert.deepEqual({ ...S.normalizeVoiceStyle({}) }, { ...S.DEFAULT_VOICE_STYLE });
  assert.deepEqual(
    {
      ...S.normalizeVoiceStyle({
        casing: 'lowercase',
        emojis: 'none',
        hashtags: 'allowed',
        exclamations: 'often',
      }),
    },
    { casing: 'casual', emojis: 'off', hashtags: 'allow', exclamations: 'natural' }
  );
  assert.deepEqual(
    { ...S.normalizeVoiceStyle({ casing: 'weird', emojis: 'loud', hashtags: 42 }) },
    { ...S.DEFAULT_VOICE_STYLE }
  );

  for (const [key, options] of Object.entries(S.VOICE_STYLE_OPTIONS)) {
    assert.ok(options.some((option) => option.value === S.DEFAULT_VOICE_STYLE[key]), key);
  }
});

test('formatVoiceStyle writes one clear line and variants', () => {
  assert.equal(
    S.formatVoiceStyle({}),
    'Style: normal sentence case; emojis sparingly; no hashtags; exclamation marks only when genuinely excited.'
  );
  assert.equal(
    S.formatVoiceStyle({
      casing: 'casual',
      emojis: 'off',
      hashtags: 'allow',
      exclamations: 'natural',
    }),
    'Style: casual lowercase; no emojis; hashtags only if they were in the source; exclamation marks fine when the tone calls for one.'
  );
});

test('resolveVoiceSettings handles defaults, toggles, and a legacy string', () => {
  const defaults = S.resolveVoiceSettings({});
  assert.equal(defaults.persona, S.DEFAULT_VOICE_PERSONA);
  assert.deepEqual({ ...defaults.style }, { ...S.DEFAULT_VOICE_STYLE });
  assert.equal(defaults.rules, S.DEFAULT_VOICE_RULES);

  assert.equal(S.resolveVoiceSettings({ rules: 'Custom rules.', rulesEnabled: false }).rules, '');
  assert.equal(S.resolveVoiceSettings('A custom voice.').persona, 'A custom voice.');
  assert.equal(S.resolveVoiceSettings(S.LEGACY_VOICE_SKILLS[0]).persona, S.DEFAULT_VOICE_PERSONA);
});

test('parseReplyExamples builds user/assistant pairs and skips malformed blocks', () => {
  const defaults = S.parseReplyExamples(S.DEFAULT_REPLY_EXAMPLES);
  assert.equal(defaults.length, 4);
  assert.ok(defaults[0].user.startsWith('Write a reply to this post:'));
  assert.ok(defaults[0].user.includes('CORS error'));
  assert.equal(defaults[0].assistant, 'The worst part is how confident you feel during hour three when you start blaming the browser. Glad you caught it.');

  const custom = [
    '**Post:** A post.',
    '**Reply:** A reply.',
    '',
    '---',
    '',
    'No labels here.',
    '',
    '---',
    '',
    'Post: Another post.',
    'Reply: Another reply.',
  ].join('\n');
  const turns = S.parseReplyExamples(custom);
  assert.equal(turns.length, 2);
  assert.equal(turns[0].assistant, 'A reply.');
  assert.equal(turns[1].user, 'Write a reply to this post:\n\nAnother post.');

  const many = Array.from({ length: 9 }, (_, i) => `Post: p${i}\nReply: r${i}`).join('\n\n---\n\n');
  assert.equal(S.parseReplyExamples(many).length, 6);
  assert.equal(S.parseReplyExamples('').length, 0);
});

test('parsePostExamples builds assistant style turns and caps the count', () => {
  const defaults = S.parsePostExamples(S.DEFAULT_POST_EXAMPLES);
  assert.equal(defaults.length, 4);
  assert.equal(defaults[0].user, S.POST_EXAMPLE_USER_PROMPT);
  assert.ok(defaults[0].assistant.includes('Qwen3.6'));

  const many = Array.from({ length: 9 }, (_, i) => `post ${i}`).join('\n\n---\n\n');
  assert.equal(S.parsePostExamples(many).length, 6);
  assert.equal(S.parsePostExamples('').length, 0);
});

test('composeReplySystemPrompt orders persona, style, rules, cues, and tone once', () => {
  const generic = tone('generic');
  const prompt = S.composeReplySystemPrompt({}, generic.direction);
  const styleLine = S.formatVoiceStyle({});

  assert.ok(prompt.startsWith(S.DEFAULT_VOICE_PERSONA));
  assert.ok(prompt.includes(styleLine));
  assert.ok(prompt.includes(S.DEFAULT_VOICE_RULES));
  assert.ok(prompt.includes(S.REPLY_VOICE_CUES));
  assert.ok(!prompt.includes(S.POST_VOICE_CUES));
  assert.ok(prompt.endsWith(generic.direction));
  assert.equal(prompt.split(S.DEFAULT_VOICE_PERSONA).length - 1, 1);

  const order = [
    prompt.indexOf(S.DEFAULT_VOICE_PERSONA),
    prompt.indexOf(styleLine),
    prompt.indexOf(S.DEFAULT_VOICE_RULES),
    prompt.indexOf(S.REPLY_VOICE_CUES),
    prompt.indexOf(generic.direction),
  ];
  for (let i = 1; i < order.length; i++) {
    assert.ok(order[i - 1] < order[i], `block ${i} is out of order`);
  }
});

test('composeReplySystemPrompt omits disabled rules and reflects style toggles', () => {
  const generic = tone('generic');
  const noRules = S.composeReplySystemPrompt(
    { rules: '', rulesEnabled: false },
    generic.direction
  );
  assert.ok(!noRules.includes(S.DEFAULT_VOICE_RULES));
  assert.ok(noRules.includes(S.REPLY_VOICE_CUES));

  const casual = S.composeReplySystemPrompt(
    { style: { casing: 'casual', emojis: 'off', hashtags: 'allow', exclamations: 'natural' } },
    generic.direction
  );
  assert.ok(casual.includes('casual lowercase'));
  assert.ok(casual.includes('no emojis'));
  assert.ok(casual.includes('hashtags only if they were in the source'));
});

test('composePostSystemPrompt contains only the post blocks', () => {
  const postPrompt = S.composePostSystemPrompt({});
  assert.ok(postPrompt.startsWith(S.DEFAULT_VOICE_PERSONA));
  assert.ok(postPrompt.includes(S.formatVoiceStyle({})));
  assert.ok(postPrompt.includes(S.DEFAULT_VOICE_RULES));
  assert.ok(postPrompt.includes(S.POST_VOICE_CUES));
  assert.ok(!postPrompt.includes(S.REPLY_VOICE_CUES));
  assert.ok(!postPrompt.includes(S.DEFAULT_POST_EXAMPLES));
  assert.ok(!postPrompt.includes(S.EXAMPLES_CAVEAT));
  assert.ok(!postPrompt.includes(tone('generic').direction));

  const noRules = S.composePostSystemPrompt({ rules: '', rulesEnabled: false });
  assert.ok(!noRules.includes(S.DEFAULT_VOICE_RULES));
  assert.ok(noRules.includes(S.POST_VOICE_CUES));
});

test('composeReplyUserPrompt and composePostUserPrompt append nudges last', () => {
  const reply = S.composeReplyUserPrompt('A post.', 3, 'question');
  assert.ok(reply.startsWith('Write a reply to this post:'));
  assert.ok(reply.includes('A post.'));
  assert.ok(reply.includes('Length: at most 2 sentences and 25 words.'));
  assert.ok(reply.trim().endsWith('End with one plain, specific question.'));

  const post = S.composePostUserPrompt('A note.', 'shorter');
  assert.ok(post.includes('A note.'));
  assert.ok(post.includes(S.POST_OUTPUT_INSTRUCTION));
  assert.ok(post.includes(S.POST_CLOSER_INSTRUCTION));
  assert.ok(post.trim().endsWith('Make it noticeably shorter. Cut filler and keep only the sharpest detail.'));

  const plainPost = S.composePostUserPrompt('A note.');
  assert.ok(plainPost.trim().endsWith(S.POST_CLOSER_INSTRUCTION));

  const invalid = S.composeReplyUserPrompt('A post.', 3, 'not-a-nudge');
  assert.ok(!invalid.includes('Write a different version'));
});

test('cleanPost strips labels, quote wrappers, fences, and Markdown noise', () => {
  assert.equal(
    S.cleanPost('```\n**Post:** "Hello world"\n```'),
    'Hello world'
  );
  assert.equal(
    S.cleanPost('Here is your post:\n\n"Hello **world**"'),
    'Hello world'
  );
  assert.equal(
    S.cleanPost('# Heading\n> quote\n- one\n- two'),
    'Heading\nquote\none\ntwo'
  );
  assert.equal(S.cleanPost('`inline code` and **bold**'), 'inline code and bold');
});

test('cleanPost preserves legitimate code-shaped text and over-limit posts', () => {
  assert.equal(
    S.cleanPost('Use *args and **kwargs with __init__.'),
    'Use *args and **kwargs with __init__.'
  );

  const long = 'a'.repeat(S.POST_SOFT_LIMIT + 20);
  assert.equal(S.cleanPost(long), long);
  assert.equal(S.countPostCharacters(long), long.length);
  assert.equal(S.countPostCharacters('a🦾'), 2);
});

test('cleanPost normalizes spacing without losing paragraph breaks', () => {
  assert.equal(S.cleanPost('one   \n\n\n\ntwo'), 'one\n\ntwo');
  assert.equal(S.cleanPost('   '), '');
});

test('cleanReply and cleanPost normalize em and en dashes deterministically', () => {
  assert.equal(S.cleanPost('One — two'), 'One, two');
  assert.equal(S.cleanPost('One—two'), 'One, two');
  assert.equal(S.cleanPost('2020–2021'), '2020-2021');
  assert.equal(S.cleanPost('— first\n— second'), '- first\n- second');
  assert.equal(S.cleanReply('Wait—really?'), 'Wait, really?');
  assert.equal(S.normalizeDashes('a – b'), 'a, b');
  assert.equal(S.normalizeDashes('1—5'), '1-5');
});

test('cleanReply strips Markdown and hashtags, and keeps hashtags when allowed', () => {
  assert.equal(S.cleanReply('**Great** point #AI'), 'Great point');
  assert.equal(S.cleanReply('**Great** point #AI', { allowHashtags: true }), 'Great point #AI');
  assert.equal(S.cleanReply('# Heading\n#tag'), 'Heading');
  assert.equal(S.cleanReply('Reply: "Hello"'), 'Hello');
  assert.equal(S.cleanReply('```\nHi there\n```'), 'Hi there');
});

test('cleanPost strips hashtags but preserves code, numeric, and URL fragments', () => {
  assert.equal(
    S.cleanPost('Built with C# and #dotnet, see https://x.com/#anchor #1 #AI'),
    'Built with C# and, see https://x.com/#anchor #1'
  );
  assert.equal(
    S.cleanPost('Built with #dotnet and C#', { allowHashtags: true }),
    'Built with #dotnet and C#'
  );
  assert.equal(S.cleanPost('Ship it #AI #buildinpublic'), 'Ship it');
  assert.equal(S.stripHashtags('C# #1 https://x.com/#a #tag'), 'C# #1 https://x.com/#a');
});

test('findBannedPhrases and stripBannedPhrases catch the trimmed list', () => {
  assert.deepEqual(
    [...S.findBannedPhrases('A robust, seamless game-changer.')],
    ['robust', 'seamless', 'game-changer']
  );
  assert.equal(S.findBannedPhrases('A delved tester.').length, 0);
  assert.deepEqual([...S.findBannedPhrases('You’ve got this.')], ["you've got this"]);

  const stripped = S.stripBannedPhrases('A robust and seamless tool, a game-changer.');
  assert.equal(S.findBannedPhrases(stripped).length, 0);
  assert.equal(stripped.includes('robust'), false);

  assert.ok(S.VOICE_BANNED_TERMS.length <= 20);
  for (const term of S.VOICE_BANNED_TERMS) {
    assert.ok(
      S.DEFAULT_VOICE_RULES.toLowerCase().includes(term.toLowerCase()),
      `rules mention ${term}`
    );
  }
});

test('buildBannedRetryPrompt names the terms and leaves a clean prompt alone', () => {
  assert.equal(S.buildBannedRetryPrompt('Prompt', []), 'Prompt');
  const retry = S.buildBannedRetryPrompt('Prompt', ['robust', 'seamless']);
  assert.ok(retry.startsWith('Prompt'));
  assert.ok(retry.includes('robust, seamless'));
});

test('NUDGE_INSTRUCTIONS exposes the four pill actions', () => {
  assert.deepEqual([...S.NUDGE_INSTRUCTIONS.map((nudge) => nudge.id)], [
    'retry',
    'shorter',
    'casual',
    'question',
  ]);
  assert.deepEqual([...S.NUDGE_INSTRUCTIONS.map((nudge) => nudge.label)], [
    'Retry',
    'Shorter',
    'More casual',
    'Ask a question',
  ]);
  assert.equal(S.normalizeNudgeId('SHORTER'), 'shorter');
  assert.equal(S.normalizeNudgeId('not-a-nudge'), '');
  assert.equal(S.buildNudgeInstruction('not-a-nudge'), '');
  assert.ok(S.buildNudgeInstruction('retry').length > 0);
});

test('normalizeCustomTones validates, dedupes, and caps entries', () => {
  const normalized = S.normalizeCustomTones([
    { id: 'custom-x', label: ' X ', direction: 'Do X.' },
    { id: 'generic', label: 'Bad', direction: 'x' },
    { id: 'BAD ID', label: 'bad', direction: 'x' },
    { id: 'custom-y', label: '', direction: 'x' },
    { id: 'custom-z', label: 'Z', direction: '' },
    { id: 'custom-x', label: 'Dup', direction: 'x' },
  ]);
  assert.equal(normalized.length, 1);
  assert.deepEqual({ ...normalized[0] }, { id: 'custom-x', label: 'X', direction: 'Do X.' });
  assert.equal(S.normalizeToneId('Custom-X'), 'custom-x');
  assert.equal(S.createCustomToneId('Skeptical Take', ['custom-skeptical-take']), 'custom-skeptical-take-2');
});

test('hidden tone ids are sanitized and at least one tone stays visible', () => {
  const allIds = [...S.TONES.map((item) => item.id)];
  assert.equal(S.sanitizeHiddenToneIds(['nope'], []).length, 0);
  assert.deepEqual([...S.sanitizeHiddenToneIds(allIds, [])], [...allIds.filter((id) => id !== 'generic')]);

  const visible = S.resolveVisibleTones([], allIds);
  assert.deepEqual([...visible.map((item) => item.id)], ['generic']);

  const custom = [{ id: 'custom-x', label: 'X', direction: 'Do X.' }];
  assert.ok(S.resolveVisibleTones(custom, []).some((item) => item.id === 'custom-x'));
  assert.ok(!S.resolveVisibleTones(custom, ['custom-x']).some((item) => item.id === 'custom-x'));
});

test('resolveTonePrompts resolves built-in and custom instructions', () => {
  const custom = [{ id: 'custom-test', label: 'Test', direction: 'Do the test thing.' }];
  const all = S.resolveToneList(custom);
  const resolved = S.resolveTonePrompts(
    {
      'custom-test': 'A custom instruction.',
      generic: 'A generic instruction.',
    },
    all
  );
  assert.equal(resolved['custom-test'], 'A custom instruction.');
  assert.equal(resolved.generic, 'A generic instruction.');
  assert.equal(Object.keys(S.resolveTonePrompts({ generic: '', agree: 42 })).length, 0);
});

test('parseGeneratedVoice reads fenced and nested JSON', () => {
  const fenced = S.parseGeneratedVoice(
    '```json\n{"persona":"You write on X as a tester.","style":{"casing":"lowercase","emojis":"none"}}\n```'
  );
  assert.equal(fenced.persona, 'You write on X as a tester.');
  assert.equal(fenced.style.casing, 'casual');
  assert.equal(fenced.style.emojis, 'off');

  const nested = S.parseGeneratedVoice(
    'Sure: {"voice":{"persona":"Persona: You write on X as a builder.","style":{"hashtags":"allowed"}}}'
  );
  assert.equal(nested.persona, 'You write on X as a builder.');
  assert.equal(nested.style.hashtags, 'allow');

  assert.equal(S.parseGeneratedVoice('not json'), null);
  assert.equal(S.parseGeneratedVoice('{"persona":""}'), null);
});

test('config version 5 fields migrate through the shared resolvers', () => {
  const config = {
    version: 5,
    voice: S.LEGACY_VOICE_SKILLS[0],
    postExamples: 'Legacy examples.',
  };

  assert.equal(S.resolveVoicePersona(config.voice), S.DEFAULT_VOICE_PERSONA);
  assert.equal(S.resolvePostExamples(config.postExamples), 'Legacy examples.');
});

test('resolveToneInstruction upgrades every exact legacy tone prompt', () => {
  for (const item of S.TONES) {
    assert.equal(S.resolveToneInstruction(item, ''), item.direction);
    for (const legacy of S.LEGACY_TONE_PROMPTS[item.id] || []) {
      assert.equal(S.resolveToneInstruction(item, legacy), item.direction);
    }
  }
});

test('resolveToneInstruction strips an exact legacy voice prefix', () => {
  const generic = tone('generic');
  for (const core of S.LEGACY_VOICE_CORES) {
    assert.equal(
      S.resolveToneInstruction(generic, `${core}\n\n${generic.direction}`),
      generic.direction
    );
  }
});

test('resolveToneInstruction strips an edited legacy intro when the instruction is intact', () => {
  const generic = tone('generic');
  const editedCore = S.LEGACY_VOICE_CORES[0].replace('friendly person', 'friendly pal');
  assert.equal(
    S.resolveToneInstruction(generic, `${editedCore}\n\n${generic.direction}`),
    generic.direction
  );
});

test('resolveToneInstruction keeps a legacy direction-only instruction after an edited intro', () => {
  const connect = tone('connect');
  const legacyDirection = S.LEGACY_TONE_PROMPTS.connect[0];
  const editedCore = S.LEGACY_VOICE_CORES[0].replace('friendly person', 'friendly pal');
  assert.equal(
    S.resolveToneInstruction(connect, `${editedCore}\n\n${legacyDirection}`),
    legacyDirection
  );
});

test('resolveToneInstruction keeps real custom instructions', () => {
  const generic = tone('generic');
  assert.equal(
    S.resolveToneInstruction(generic, 'Be very brief and ask one question.'),
    'Be very brief and ask one question.'
  );

  // A short custom instruction that happens to end with the default direction
  // must not be mistaken for a legacy wrapper.
  const custom = `Be very brief. ${generic.direction}`;
  assert.equal(S.resolveToneInstruction(generic, custom), custom);
});

test('resolveTonePrompts resolves a version 5 tone map', () => {
  const raw = {};
  for (const item of S.TONES) {
    raw[item.id] = S.LEGACY_TONE_PROMPTS[item.id][0];
  }
  raw.agree = 'A hand-written Agree instruction.';

  const resolved = S.resolveTonePrompts(raw);
  for (const item of S.TONES) {
    if (item.id === 'agree') {
      assert.equal(resolved.agree, 'A hand-written Agree instruction.');
    } else {
      assert.equal(resolved[item.id], item.direction);
    }
  }
});

test('classifyComposerSurface follows the send label before route or dialog', () => {
  const base = { pathname: '/home', search: '', isDialog: true, hasReplyContext: true };

  assert.equal(S.classifyComposerSurface({ ...base, label: 'Reply' }), 'reply');
  assert.equal(S.classifyComposerSurface({ ...base, label: 'Post' }), 'post');
  // A quote post opened from a status page is still a new post.
  assert.equal(
    S.classifyComposerSurface({ ...base, label: 'Post', pathname: '/status/123' }),
    'post'
  );
});

test('classifyComposerSurface falls back to route and dialog context', () => {
  assert.equal(S.classifyComposerSurface({ pathname: '/compose/post' }), 'post');
  assert.equal(S.classifyComposerSurface({ pathname: '/status/123' }), 'reply');
  assert.equal(S.classifyComposerSurface({ pathname: '/home', search: '?in_reply_to=1' }), 'reply');
  assert.equal(
    S.classifyComposerSurface({ pathname: '/home', isDialog: true, hasReplyContext: true }),
    'reply'
  );
  assert.equal(
    S.classifyComposerSurface({ pathname: '/home', isDialog: true, hasReplyContext: false }),
    'post'
  );
  assert.equal(S.classifyComposerSurface({ pathname: '/home' }), 'post');
});
