import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../shared.js', import.meta.url), 'utf8');
const context = vm.createContext({});

const EXPORTS = [
  'TONES',
  'DEFAULT_VOICE_SKILL',
  'LEGACY_VOICE_SKILLS',
  'DEFAULT_POST_EXAMPLES',
  'LEGACY_POST_EXAMPLES',
  'LEGACY_VOICE_CORES',
  'LEGACY_TONE_PROMPTS',
  'POST_DRAFT_INSTRUCTIONS',
  'POST_EXAMPLES_INSTRUCTION',
  'POST_SOFT_LIMIT',
  'resolveVoiceSkill',
  'resolvePostExamples',
  'resolveToneInstruction',
  'resolveTonePrompts',
  'composeReplySystemPrompt',
  'composePostSystemPrompt',
  'composePostUserPrompt',
  'cleanReply',
  'cleanPost',
  'countPostCharacters',
  'classifyComposerSurface',
];

vm.runInContext(`${source}\nglobalThis.__xb = { ${EXPORTS.join(', ')} };`, context);
const S = context.__xb;
const tone = (id) => S.TONES.find((item) => item.id === id);

test('resolveVoiceSkill upgrades saved legacy defaults but keeps custom voices', () => {
  assert.equal(S.resolveVoiceSkill(S.DEFAULT_VOICE_SKILL), S.DEFAULT_VOICE_SKILL);
  for (const legacy of S.LEGACY_VOICE_SKILLS) {
    assert.equal(S.resolveVoiceSkill(legacy), S.DEFAULT_VOICE_SKILL);
  }
  assert.equal(S.resolveVoiceSkill('A custom voice.'), 'A custom voice.');
  assert.equal(S.resolveVoiceSkill(''), S.DEFAULT_VOICE_SKILL);
});

test('resolvePostExamples keeps an empty list empty and upgrades legacy examples', () => {
  assert.equal(S.resolvePostExamples(undefined), S.DEFAULT_POST_EXAMPLES);
  assert.equal(S.resolvePostExamples(''), '');
  assert.equal(S.resolvePostExamples('Custom examples.'), 'Custom examples.');
  for (const legacy of S.LEGACY_POST_EXAMPLES) {
    assert.equal(S.resolvePostExamples(legacy), S.DEFAULT_POST_EXAMPLES);
  }
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
  assert.deepEqual(Object.keys(S.resolveTonePrompts({ generic: '', agree: 42 })), []);
});

test('config version 5 fields migrate through the shared resolvers', () => {
  const config = {
    version: 5,
    voice: S.LEGACY_VOICE_SKILLS[0],
    postExamples: 'Legacy examples.',
    tonePrompts: Object.fromEntries(
      S.TONES.map((item) => [item.id, S.LEGACY_TONE_PROMPTS[item.id][0]])
    ),
  };

  assert.equal(S.resolveVoiceSkill(config.voice), S.DEFAULT_VOICE_SKILL);
  assert.equal(S.resolvePostExamples(config.postExamples), 'Legacy examples.');
  const migrated = S.resolveTonePrompts(config.tonePrompts);
  for (const item of S.TONES) {
    assert.equal(migrated[item.id], item.direction);
  }
});

test('composeReplySystemPrompt puts the voice before the tone exactly once', () => {
  const generic = tone('generic');
  const prompt = S.composeReplySystemPrompt(S.DEFAULT_VOICE_SKILL, generic.direction);
  assert.ok(prompt.startsWith(S.DEFAULT_VOICE_SKILL));
  assert.ok(prompt.endsWith(generic.direction));
  assert.equal(prompt.split(S.DEFAULT_VOICE_SKILL).length - 1, 1);
});

test('composeReplySystemPrompt does not duplicate the voice after migration', () => {
  const generic = tone('generic');
  const editedCore = S.LEGACY_VOICE_CORES[0].replace('friendly person', 'friendly pal');
  const instruction = S.resolveToneInstruction(
    generic,
    `${editedCore}\n\n${generic.direction}`
  );
  const prompt = S.composeReplySystemPrompt(S.DEFAULT_VOICE_SKILL, instruction);
  assert.equal(prompt, `${S.DEFAULT_VOICE_SKILL}\n\n${generic.direction}`);
  assert.equal(prompt.split(S.DEFAULT_VOICE_SKILL).length - 1, 1);
});

test('composePostSystemPrompt includes instructions and examples only when present', () => {
  const withExamples = S.composePostSystemPrompt(S.DEFAULT_VOICE_SKILL, S.DEFAULT_POST_EXAMPLES);
  assert.ok(withExamples.startsWith(S.DEFAULT_VOICE_SKILL));
  assert.ok(withExamples.includes(S.POST_DRAFT_INSTRUCTIONS));
  assert.ok(withExamples.includes(S.POST_EXAMPLES_INSTRUCTION));
  assert.ok(withExamples.includes(S.DEFAULT_POST_EXAMPLES));
  assert.equal(withExamples.split(S.DEFAULT_VOICE_SKILL).length - 1, 1);

  const withoutExamples = S.composePostSystemPrompt(S.DEFAULT_VOICE_SKILL, '');
  assert.ok(withoutExamples.includes(S.POST_DRAFT_INSTRUCTIONS));
  assert.ok(!withoutExamples.includes(S.POST_EXAMPLES_INSTRUCTION));
});

test('composePostUserPrompt keeps the note as the source text', () => {
  assert.ok(S.composePostUserPrompt('  a rough idea  ').includes('a rough idea'));
  assert.ok(!S.composePostUserPrompt('  a rough idea  ').includes('  a rough idea  '));
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

test('cleanReply still removes labels and wrappers', () => {
  assert.equal(S.cleanReply('Reply: "Hello"'), 'Hello');
  assert.equal(S.cleanReply('```\nHi there\n```'), 'Hi there');
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
