# X Buddy

Chrome Manifest V3 extension that enhances X/Twitter with keyword highlighting, negative-keyword filtering, count-based feed rules, and AI-powered replies via a local LLM.

## Commands

No build step and no runtime dependencies. `package.json` only carries the test script.

- `chrome://extensions` → Load unpacked → select this directory
- `npm test` — fast unit tests for shared helpers, prompt assembly, cleanup, generation, and the service-worker recovery guards (`node --test tests/*.test.js`)
- CI (`.github/workflows/ci.yml`) runs `npm test` on every push and pull request. There is nothing to install.

## Development Workflow

We work one task at a time. The flow is:

1. Make the change.
2. Run `npm test`, then test it manually in Chrome (see the checklist below).
3. Update `README.md` for any user-facing change (feature, setting, permission, setup step, or troubleshooting case), and whenever a change affects something the README already covers. Update `AGENTS.md` when behavior, selectors, architecture, or conventions change. Keep both current with the build.
4. Commit when the task is done.
5. **Push only when the user asks.** A finished commit is not a request to push.

### Commits

- Commit after each completed task, even if the next task is related. Small, working commits are easier to review and roll back.
- Before staging, run `git status` and check that only intended files are included.
- Use an imperative subject line, for example `Fix Magic Reply LLM proxy` or `Add keyword re-scan`.
- Add a short body when the reason is not obvious. Explain the "why", not the diff.
- Never commit secrets or local-only files: `.env`, tokens, API keys, browser profiles, Chrome extension signing keys (`.pem`, `.crx`), logs, `node_modules/`, or test scaffolding.
- The repository is `main` only for now. Do not create release branches without being asked.

### Documentation

- `README.md` is the user guide. Any update or change that affects what the README currently says must update the README in the same commit, so it stays accurate and current with the build. Keep the README in its existing voice: short, plain, practical. Weave changes into the existing sections and only change existing content when the build requires it; do not rewrite unrelated passages. Explain what the feature does and how to use it. A short "What's new" section for the current release is fine; do not maintain a full changelog or write marketing copy.
- `AGENTS.md` is for contributors. Apply the same rule: keep it current whenever architecture, selectors, storage keys, behavior, or conventions change. Weave updates into the relevant existing section and follow its voice; do not rewrite unrelated content.
- Internal-only changes (refactors, debug logging, selector hardening that does not change behavior) do not need a README entry, but `AGENTS.md` should reflect anything that affects maintenance.

### Pushing

- `origin` is `https://github.com/DevTarlow/xbuddy.git`.
- Push with `git push` after the user approves. The first push used `git push -u origin main`.
- Never force-push, rewrite history, or amend a commit the user has already seen unless they explicitly ask.
- If the push is rejected, stop and report it. Do not force it.

### Manual test checklist

Run `npm test` first. The unit tests cover the pure shared helpers and the service-worker recovery guards; before committing a behavior change, also check:

- The extension loads at `chrome://extensions` with no errors.
- With X already open, reloading the extension brings the features back without a manual refresh.
- Opening X while the extension is not loaded, then loading it, injects the page script into the already-open tab.
- A stale tab with an unsent composer draft is not reloaded; clearing the draft and switching away and back recovers it.
- A tab that is still loading is never injected into; its declarative content scripts take over when the load completes.
- A live X tab is not reloaded when the service worker wakes or the popup opens.
- With site access withheld, the popup shows the Grant access banner; with access granted, the banner stays hidden.
- Granting access clears the banner immediately; granting an unrelated permission (for example loopback) does not rescan X tabs.
- Clicking Grant access requests x.com and twitter.com, and granting it recovers an already-open X tab without a manual refresh.
- A matching keyword glows, including when the keyword is added after the page loaded.
- Removing a keyword removes the glow.
- A negative keyword hides matching posts, including posts added after the page loaded.
- Removing a negative keyword, or turning negative filtering off, restores the posts.
- The master toggle pauses and resumes highlighting, filtering, Magic Reply, and Draft Post.
- The master, positive, negative, and feed-rule toggles keep their state after reopening the popup.
- Search filters either list, pagination appears past five items, and Clear All empties the list after confirmation.
- Duplicate and over-100-character keywords are rejected with button feedback.
- Changing the glow color updates existing and new glowing posts, and the choice survives a reload.
- A feed rule hides matching posts by followers/following/comments/likes/reposts, including posts loaded after the page loaded and media-only posts, with no empty row left behind.
- A highlight rule glows matching posts in the chosen glow color, and removing it or disabling Feed Rules restores the post.
- A between rule matches both the minimum and maximum counts, and a rule with a minimum greater than the maximum is rejected with feedback.
- A rule with an unavailable metric (for example, followers or following on a post X did not expose) leaves the post alone instead of hiding or highlighting it.
- Duplicate, invalid, and over-limit feed rules are rejected with feedback, and successful rules persist after reopening the popup.
- Exporting and re-importing a between rule preserves both counts.
- Export All downloads a JSON config; importing it restores the lists, toggles, glow color, feed rules, reply length, Persona, style toggles, rules, post and reply examples, custom tones, hidden tone ids, and tone instructions.
- Importing a version 1 or 2 config still works and leaves the current feed rules untouched.
- Importing a legacy file with only `positive`/`negative` arrays merges keywords instead of replacing the lists.
- Right-clicking a selection or hashtag offers both keyword lists, saves the keyword, shows a page toast, and the popup reflects the change.
- Magic Reply appears in a reply dialog and on a post detail page, but not in the home "Post" box.
- Draft Post appears in an open home/profile composer and in the compose modal, but not in a reply composer.
- Magic Reply opens a tone menu with Generic, Agree, Connect, Disagree, Funny, and Informative, plus any custom tones; hidden tones do not appear.
- Choosing a tone sends that tone and fills the composer.
- The Connect tone names a specific detail from the poster's post, offers to connect, asks one short question about that detail, and ends with a question mark, without inventing the user's project or pitching.
- Every tone except Disagree agrees with or builds on the post; Disagree offers a different view of one claim and stays respectful.
- Replies read like a person: contractions, varied sentence length, no canned opener, no em dash, no hashtag, at most one emoji, and no AI filler.
- A sad or frustrated post gets empathy, not advice; a mean-spirited post is not agreed with.
- A Disagree reply starts with a plain different view, not a compliment or agreement.
- Funny reads as an actual joke; Informative adds a detail or opinion instead of correcting or just praising.
- A saved old full tone prompt loads the short tone instruction; a hand-edited prompt keeps its custom wording with the old shared intro removed.
- On a fresh profile, Your Persona, the four style toggles, Post Examples, Reply Examples, and the Advanced rules are populated from defaults; Save applies them, Restore Default resets them, and Import .md/.txt strips frontmatter.
- Editing Your Persona changes the output of every tone, not just the selected one.
- An old 1.7.4 Writing Voice upgrades to the new Persona and rules; a hand-edited old voice is kept as the Persona.
- Hashtags set to Off are removed from Magic Reply and Draft Post output; Allow keeps them. Em/en dashes and Markdown are removed either way.
- A generated draft containing a banned phrase gets exactly one rewrite; a still-dirty rewrite is stripped without a third request.
- Reply Examples are sent as few-shot user/assistant turns; an empty Reply Examples value sends none, and a malformed block is skipped.
- Generate Voice from My Tweets fills the Persona and style toggles, needs a saved model, and changes nothing until Save Voice.
- Advanced rules can be disabled; the next request omits the rules block but still cleans formatting.
- Adding, editing, hiding, showing, and deleting a custom tone updates the popup selector and the Magic Reply menu; the last visible tone cannot be hidden.
- After Magic Reply or Draft Post inserts text, the nudge pills appear; Retry, Shorter, More casual, and Ask a question each replace the draft, and the bar dismisses on ×, Escape, outside click, timeout, or the master toggle.
- Draft Post with an empty composer says Add an idea first and sends no request.
- Draft Post strips a model label, surrounding quotes, code fence, or Markdown wrapper, and warns when the result is over 280 characters without truncating it.
- A composer switched from Post to Reply swaps Draft Post for Magic Reply; removing the composer or send button removes the injected wrapper.
- A quote-post composer gets Draft Post (the send label is Post), while a reply dialog gets Magic Reply.
- Editing a tone instruction in Settings changes the generated reply; Restore Default resets it.
- The Reply Length slider defaults to Balanced on a fresh profile, shows the saved level after reopening the popup, and level 1 produces a visibly shorter reply than level 5.
- Auto is the far-right level, uses no fixed word cap, and lets the model choose a length that fits the post.
- Reply Length changes the output for a hand-edited tone instruction, not just the built-in prompts.
- A saved old built-in instruction is not treated as a custom prompt.
- Magic Reply fills the composer, the send button enables, and an existing draft is replaced rather than appended.
- Draft Post rewrites the composer note into one post in the voice, replaces the composer text, and never posts.
- With no model saved, Draft Post fails with the choose-a-model message and sends no request.
- The master toggle removes Magic Reply, Draft Post, the nudge bar, and the tone menu.
- Export/import version 6 round-trips the Persona, style toggles, rules, post and reply examples, custom tones, hidden tone ids, and tone instructions; a version 5 import maps its voice to the Persona, and a version 4 import still leaves the voice alone.
- The popup shows the real LLM status: Connected, Offline, or No model.
- Settings → Local LLM starts with an empty model field on a fresh profile, and URL/model/generation values persist after reopening the popup.
- Fetch Models lists the server's models and fills the first one when the model field is empty, without overwriting a typed model.
- With no model saved, Magic Reply fails with a clear choose-a-model message instead of sending a request.
- Magic Reply uses the saved endpoint/model, and a previously saved model keeps working.
- An unreachable URL shows Offline and a clear Magic Reply failure; restoring it recovers.
- Export omits the API key and import restores the other LLM settings; a version 1 config still imports.
- Invalid LLM URL or number input shows feedback and does not save.
- No new errors in the x.com console (page and isolated contexts) or the service worker console.

## Architecture

```
manifest.json          — MV3 manifest
package.json           — test script only; no dependencies or build step
.github/workflows/ci.yml — CI: runs `npm test` on every push and pull request
page-metrics.js        — MAIN-world helper: reads tweet metrics from page React data and answers postMessage requests
shared.js              — Shared voice config (persona, style, rules, examples, custom tones), few-shot parsing, prompt composition, output cleanup, banned phrases, nudges, voice-from-samples parsing, reply length presets, LLM defaults, feed-rule normalization, and LLM settings normalization
popup.html             — Popup UI (340px, dark theme)
popup.js               — Popup logic: keyword CRUD, feed rules, toggles, persona/style/rules/examples editor, voice generation, tone editor + custom tone management, LLM settings/status, site access banner
content-start.js       — document_start marker: tells the service worker the declarative content scripts are queued
content.js             — Content script: keyword glow/filter, feed-rule evaluation, Magic Reply tone menu (custom tones), Draft Post, nudge pills
background.js          — Service worker: settings-aware local LLM requests for replies, posts, and voice generation; few-shot prompt assembly; anti-slop retry; right-click menus; open-tab recovery
styles.css             — Content script styles (glow + hidden post + composer action buttons + tone menu + nudge pills)
icons/                 — Extension icons (16, 48, 128 PNG)
tests/shared.test.js   — Node test runner coverage for voice migration, style/rules, example parsing, prompt composition, output cleanup, banned phrases, custom tones, nudges, voice parsing, and surface classification
tests/background.test.js — VM harness coverage for tab-recovery guards, few-shot request assembly, banned retry, nudges, and voice generation
```

### Storage keys

Keep these in sync across `content.js`, `popup.js`, and `background.js`. The feed-rule keys live in `shared.js` and are used by the popup and content script:

| Key | Type | Default | Purpose |
|---|---|---|---|
| `xbBuddyKeywords` | `string[]` | `[]` | Positive keywords (glow) |
| `xbBuddyNegativeKeywords` | `string[]` | `[]` | Negative keywords (hide) |
| `xbBuddyEnabled` | `boolean` | `true` | Master pause/resume |
| `xbBuddyPositiveEnabled` | `boolean` | `true` | Positive highlighting on/off |
| `xbBuddyNegativeEnabled` | `boolean` | `true` | Negative filtering on/off |
| `xbBuddyFeedRules` | `object[]` | `[]` | Feed rules: `{metric, op, threshold, thresholdMax?, action}` (`followers`/`following`/`comments`/`likes`/`reposts`, `lt`/`gt`/`between`, `hide`/`highlight`; `thresholdMax` required for `between`) |
| `xbBuddyFeedRulesEnabled` | `boolean` | `true` | Feed-rule highlighting/filtering on/off |
| `xbBuddyGlowColor` | `string` | `#00ff41` | Highlight color (`#rrggbb`) |
| `xbBuddyVoiceSkill` | `string` | `DEFAULT_VOICE_PERSONA` | Persona text applied to every Magic Reply and Draft Post (the old Writing Voice key; old custom voices stay here) |
| `xbBuddyVoiceStyle` | `object` | `DEFAULT_VOICE_STYLE` | Style toggles: `{casing: 'normal'|'casual', emojis: 'off'|'light'|'expressive', hashtags: 'off'|'allow', exclamations: 'rare'|'natural'}` |
| `xbBuddyVoiceRules` | `string` | `DEFAULT_VOICE_RULES` | Editable anti-slop rules; an empty string omits the rules block |
| `xbBuddyVoiceRulesEnabled` | `boolean` | `true` | Include the rules block in prompts |
| `xbBuddyPostExamples` | `string` | `DEFAULT_POST_EXAMPLES` | Post-only few-shot examples; an empty string disables them |
| `xbBuddyReplyExamples` | `string` | `DEFAULT_REPLY_EXAMPLES` | Reply-only `Post:`/`Reply:` few-shot pairs; an empty string disables them |
| `xbBuddyCustomTones` | `object[]` | `[]` | Custom tones: `{id, label, direction}`; ids are stable and exported |
| `xbBuddyHiddenToneIds` | `string[]` | `[]` | Tone ids hidden from the Magic Reply menu; at least one tone always stays visible |
| `xbBuddyTonePrompt_<id>` | `string` | `TONES[*].direction` / custom direction | Per-tone instruction composed after the persona, style, rules, and cues (built-in and custom ids) |
| `xbBuddyReplyLength` | `integer` | `3` | Magic Reply length level 1–6 (`One-liner`, `Short`, `Balanced`, `Detailed`, `Long`, `Auto`) |
| `xbBuddyLlmSettings` | `object` | `LLM_DEFAULTS` | Local LLM base URL, model (empty until the user chooses one), temperature, max tokens, timeout, thinking toggle, and optional API key |
| `xbBuddySettingsOpen` | `boolean` | `false` | Popup Settings section open state |
| `xbBuddyNotification` | `object` | absent | Transient context-menu toast (`keyword`, `listType`, `duplicate`, or `error`) |

## Code Conventions

- Use `const` / `let`, never `var`
- Async functions where storage/network is involved
- `DEBUG` flags in `content.js` and `page-metrics.js` toggle verbose console logging
- `shared.js` loads before `content.js` and `popup.js`, and via `importScripts('shared.js')` in the service worker. Tone IDs are stable: stored instructions and exported configs use them, including custom tones. The persona, style, rules, post/reply examples, custom tones, prompt composition, few-shot parsers, output cleanup, banned phrase lists, nudges, voice-from-samples parsing, legacy default handling, and reply length presets live here too. LLM defaults, limits, and URL/settings normalization also live here so the popup and service worker cannot drift. Feed-rule metric/op/action lists, limits, normalization, and labels live here too.
- `page-metrics.js` runs in the page's MAIN world because page-world React expandos are invisible to the isolated content script. It uses no `chrome.*` APIs, returns only counts, and validates the request channel/token.
- Feed-rule effects use their own classes (`xb-rule-glow-post` / `xb-rule-hidden-post`) so rule changes can be undone without touching keyword effects.
- Error states surface via `console.error` + `showToast()` in popup
- DOM dedup uses `WeakSet` + `data-xb-processed` / `data-magic-reply` / `data-draft-post` attributes. The composer markers are verified against the live button before skipping, because X's React re-renders can remove injected nodes.
- Classic-UI DOM queries use `data-testid` selectors matching X's DOM conventions

## Key Technical Details

- **Tweet discovery**: `article[data-testid="tweet"]` via MutationObserver with 200ms cooldown. Relevance is checked against `MutationRecord.addedNodes` before scanning.
- **Keyword matching**: whole-word, case-insensitive regex with the `iu` flags. Regex special chars are escaped. The boundary is only added on a side that starts/ends with a word character, so `#AI`, `C++`, and `3.5` work while `ai` still does not match `rain`.
- **Negative filtering**: Matching posts get `.xb-hidden-post` (`display: none !important`) on the nearest `div[data-testid="cellInnerDiv"]` timeline row, falling back to the tweet article when the row contains a composer. A negative match wins over a positive glow. Negative matching only uses tweet body text, not the container-wide fallback that can include author names or UI labels.
- **Feed rules**: `shared.js` defines `FEED_RULES_KEY`, `FEED_RULES_ENABLED_KEY`, `FEED_RULE_METRICS`, `FEED_RULE_OPS`, `FEED_RULE_ACTIONS`, `FEED_RULE_LIMITS`, `normalizeFeedRules()`, `matchesFeedRule()`, and `formatFeedRule()`. A rule is `{metric, op, threshold, action}` for `lt`/`gt`, with strict `<` / `>` comparisons, or `{metric, op: 'between', threshold, thresholdMax, action}` with an inclusive range (`threshold <= value <= thresholdMax`). A between rule without a finite maximum, or with `threshold > thresholdMax`, is invalid. Up to 20 rules, deduped by metric, op, both counts, and action. The popup writes both keys; `content.js` reloads them on storage changes, resets, and evaluates each scanned post (including media-only posts). A hide rule wins over a highlight rule, and a metric that is `null` skips the rule. Nested/quoted articles are skipped.
- **Post metrics**: `page-metrics.js` is declared first in `content_scripts` with `world: "MAIN"` (Chrome 111+) and `run_at: "document_start"`. The content script sets `data-xb-metrics-req="<token>"` on the article and posts `{channel: 'xb-buddy-metrics', type: 'request', token}`. The helper walks up to 40 React fiber `return` levels for `memoizedProps.tweet` (unwrapping `TweetWithVisibilityResults` / `tweet_results`), reads `legacy.reply_count`, `legacy.favorite_count`, `legacy.retweet_count`, `core.user_results.result.legacy.followers_count`, and `core.user_results.result.legacy.friends_count`, and replies with the same token. A 400 ms timeout falls back to page-visible engagement counts (group/button `aria-label`s); followers and following stay unknown. One 500 ms retry covers late-mounted data. Rule evaluation is async and guarded by `rulesGeneration` plus `WeakMap` caches.
- **Tab recovery**: content scripts only run when a document loads. `background.js` uses the `scripting` permission to reattach them to X tabs that were already open when the extension started or survived an extension reload. `content-start.js` sets `data-xb-buddy-scheduled` at `document_start`; `content.js` sets `data-xb-buddy-loaded` synchronously before its async init and answers the service worker's `xb:ping`. `ensureTabContent()` runs from service-worker start, `onInstalled`, `onStartup`, `tabs.onUpdated` (complete), `tabs.onActivated`, and `permissions.onAdded`; the popup can also send `xb:recover-tabs` after a grant. It pings first and leaves a live tab alone. A tab that is not `complete` is skipped entirely so a programmatic injection cannot race a pending declarative document_idle injection; `tabs.onUpdated` retries when the load finishes. With no markers and a complete tab, it injects `page-metrics.js` in the MAIN world, `styles.css`, then `shared.js` + `content.js`; it waits 250 ms and 1 s, re-reads the tab, and rechecks the markers after each wait so it cannot race a declarative injection. A tab with the loaded marker (or the pre-1.7.2 `data-xb-buddy` version marker) but no live ping is an orphan from the previous extension instance and is reloaded, guarded by a 30 s per-tab cooldown. A tab with unsent composer text is never auto-reloaded, including a 1.7.1 tab found only through the legacy marker; the activation check retries after the draft is cleared or posted. Do not inject `content-start.js` programmatically: it only marks documents where the declarative idle scripts are already queued.
- **Site access**: Chrome can withhold host permissions for an unpacked extension (`extensions.settings.<id>.withholding_permissions`), which stops content scripts from running entirely. The popup checks `chrome.permissions.contains({origins: ['https://x.com/*', 'https://twitter.com/*']})` on open and shows `#access-banner` when access is missing; `permissions.onAdded` / `onRemoved` listeners in the popup keep that banner current while it is open. The **Grant access** button calls `chrome.permissions.request()` from the click, clears the banner, then sends `xb:recover-tabs` and rechecks `contains()`; `permissions.onAdded` in `background.js` also schedules recovery when the granted origins include x.com or twitter.com, so the open tab recovers if the popup closes during the prompt. Grants for the loopback LLM hosts never trigger a tab scan. Do not hide this banner when access is missing: without host permission, tab recovery cannot inject anything.
- **Isolated world**: content scripts cannot see expando properties such as `__reactFiber$` set by the page. The existing `findReactFiber()` in `content.js` therefore cannot reliably detect page React ownership; metrics must go through `page-metrics.js`. Do not add a second fiber reader to the isolated script.
- **Composer actions**: `content.js` classifies each composer by the send button's label (`Reply` vs `Post`), falling back to the route (`/status/` or `in_reply_to=` = reply, `/compose/post` = post) and to the dialog's reply/tweet context. Reply surfaces get a `div.magic-reply-wrapper` containing `button.magic-reply-btn` that opens the tone menu; new-post surfaces get a `div.draft-post-wrapper` containing `button.draft-post-btn` that runs Draft Post. Both are inserted before the send button. `getSendButton()` checks the `tweetButtonInline` / `tweetButton` testids first, then walks up from the editor for an aria-label fallback so a quoted tweet's Reply button cannot be mistaken for the send button. Dialog detection uses `div[role="dialog"]` and `[data-testid="sheetDialog"]`. `ensureComposerAction()` removes the other mode's button and marker when a SPA navigation reuses a composer, then re-injects. `classifyComposerSurface()` in `shared.js` makes the label/route/dialog decision pure and unit-tested; `getComposerMode()` supplies the send label, route, and dialog context. `cleanupStaleComposerActions()` drops wrappers whose container no longer classifies as a composer on every observer tick and safety check.
- **Voice configuration**: `shared.js` defines `VOICE_KEY` (persona), `VOICE_STYLE_KEY`, `VOICE_RULES_KEY`, `VOICE_RULES_ENABLED_KEY`, `DEFAULT_VOICE_PERSONA`, `DEFAULT_VOICE_RULES`, `DEFAULT_VOICE_STYLE`, `VOICE_STYLE_OPTIONS`, `VOICE_SKILL_LIMITS`, `VOICE_RULES_LIMITS`, `normalizeVoicePersona()` / `resolveVoicePersona()`, `normalizeVoiceRules()` / `resolveVoiceRules()`, `normalizeVoiceStyle()`, `formatVoiceStyle()`, and `resolveVoiceSettings()`. `VOICE_PROFILE` holds the trimmed persona, `VOICE_RULES` the anti-slop rules (with the banned line built from `VOICE_BANNED_TERMS`), `POST_VOICE_CUES` the post behavior, and `REPLY_VOICE_CUES` the reply behavior. Saved 1.7.x defaults are in `LEGACY_VOICE_SKILLS`, including the exact 5,778-character 1.7.4 default (FNV-1a `15171b54`, tested); an unedited default becomes the new Persona, and a hand-edited voice is kept as the Persona. Keep the default free of em/en dashes and motivational closers. `POST_EXAMPLES_KEY` / `REPLY_EXAMPLES_KEY` hold style examples; a missing value uses the default, and an empty string disables them. `parsePostExamples()` / `parseReplyExamples()` turn them into `{user, assistant}` turns (max 6), and `background.js` sends them as real few-shot messages plus `EXAMPLES_CAVEAT`. The Advanced rules toggle is prompt-level; dashes, Markdown, and hashtags are enforced in code.
- **Reply tones**: `shared.js` defines `TONES` with a `direction` for each built-in tone, `TONE_PROMPT_PREFIX` (still `xbBuddyTonePrompt_` for storage compatibility), `LEGACY_TONE_PROMPTS`, `LEGACY_VOICE_CORES`, `resolveToneInstruction()`, and `composeReplySystemPrompt()`. The system prompt is the persona, style, rules, and reply cues followed by the tone instruction, so editing the voice changes every tone. `resolveToneInstruction()` returns the default direction for an empty or exact old built-in, strips a known old shared-voice prefix from hand-edited prompts, and otherwise preserves the stored instruction. When the legacy core was lightly edited, it also matches a known direction suffix and strips the prefix only if word overlap with a legacy voice is at least 0.85, so a short custom instruction that happens to end with a default line is kept. `resolveTonePrompts(raw, tones)` resolves an imported tone map for built-ins and custom tones. The Connect instruction still requires a specific detail from the post and ends the reply with a question mark using plain punctuation. The Disagree instruction opens with a plain different view and says staying friendly does not mean agreeing. Their previous direction-only defaults are in `LEGACY_TONE_PROMPTS.connect` and `LEGACY_TONE_PROMPTS.disagree`. Custom tones are `{id, label, direction}` in `xbBuddyCustomTones`; `normalizeCustomTones()`, `createCustomToneId()`, `resolveToneList()`, `resolveVisibleTones()`, and `sanitizeHiddenToneIds()` validate them, keep ids stable, and never hide every tone. Hidden ids live in `xbBuddyHiddenToneIds`. The popup edits `xbBuddyTonePrompt_<id>` for built-in and custom tones; the content menu reads the visible list on load and on storage changes; `background.js` resolves the tone per request. Unknown or hidden tone IDs fall back to generic, then the first visible tone.
- **Draft Post**: New-post surfaces get the `✨ Draft Post` button. `handleDraftPostClick()` reads the composer text as the rough note; an empty composer flashes `Add an idea first` and focuses the composer instead of sending a request. The button then calls `xb:generate-post`; `background.js` composes persona + style + rules + `POST_VOICE_CUES`, sends post examples as few-shot turns, and returns one post. `composePostUserPrompt()` puts `POST_USER_INSTRUCTION`, the note, `POST_OUTPUT_INSTRUCTION`, `POST_CLOSER_INSTRUCTION`, and an optional nudge in the user message; the closer stays after the note because the model follows the no-cheer rule there better than in the system prompt. The content script re-resolves the composer after the await, pastes the result with the same Draft.js-safe path as Magic Reply, never posts, and shows nudge pills. Draft Post creates a single post; thread generation is out of scope. `cleanPost()` in `shared.js` removes model labels, wrapping quotes, code fences, Markdown headings/bullets/blockquotes/bold/backticks, em/en dashes, and hashtags (unless allowed); it leaves `*args`, `**kwargs`, and `__init__` alone and never truncates. It shows a page toast when `countPostCharacters(post) > POST_SOFT_LIMIT` (280).
- **Reply length**: `shared.js` defines `REPLY_LENGTH_KEY`, `DEFAULT_REPLY_LENGTH` (3, `Balanced`), `REPLY_LENGTH_LEVELS`, `normalizeReplyLength()`, `getReplyLengthLevel()`, `formatReplyLength()`, and `buildReplyLengthInstruction()`. The popup writes `xbBuddyReplyLength`; `background.js` reads it per request and appends the instruction after the post in the user message, where the model follows it better than in the system prompt. The instruction explicitly overrides sentence limits written into a tone instruction. Levels 1–5 carry fixed sentence/word caps; level 6 (`Auto`) uses the `auto` flag and a different instruction that lets the model choose the length from the post, with no fixed cap. Length is a prompt target, not a post-processing truncation. Draft Post ignores this setting; its length comes from the Persona and `POST_VOICE_CUES`.
- **Tone menu**: a fixed-position `div.magic-reply-dropdown` is appended to `document.body` with one button per visible tone (`activeTones`, resolved from the built-ins plus custom tones minus hidden ids). It closes on selection, outside click, or Escape, repositions on scroll/resize, flips above the trigger near the viewport bottom, and is removed when the master toggle pauses.
- **Nudge pills**: after a successful Magic Reply or Draft Post insert, `content.js` appends a fixed-position `.xb-nudge-bar` to `document.body` with one pill per `NUDGE_INSTRUCTIONS` entry plus a close button. It stores `{mode, toneId, sourceText}` on the bar, so every nudge regenerates from the original post or note rather than the generated draft. A pill sends the same `xb:generate-reply` / `xb:generate-post` message with a `nudge` id; `background.js` allow-lists the id and appends the instruction to the user prompt. The bar dismisses on ×, Escape, outside click, a 30 s timeout, composer removal, a new generation, or the master toggle. `cleanupStaleComposerActions()` drops a bar whose composer no longer classifies, and `disableExtension()` removes it.
- **Voice from samples**: the popup's **Generate Voice from My Tweets** button sends `xb:generate-voice` with up to 8,000 characters of samples. `background.js` asks the local model for the JSON shape in `VOICE_FROM_SAMPLES_SYSTEM`, requests at least 500 max tokens for that one call, and returns `parseGeneratedVoice()`'s normalized `{persona, style}`. Invalid JSON or an empty persona is a clear error; the popup only fills the form and does not save until **Save Voice**.
- **Inline composer edge case**: On tweet detail pages, the reply composer is inline (not in a dialog). The tweet text lives ABOVE the composer in the DOM — `findTweetTextBefore()` picks the last `[data-testid="tweetText"]` that precedes the composer. The home/profile "Post" composer is also inline; it gets Draft Post, not Magic Reply. `/compose/post` is a post surface, not a reply surface. The collapsed home placeholder is not a contenteditable, so the Draft Post button appears after the user opens the composer.
- **Text insertion**: X's composer is Draft.js, whose DOM is owned by React. `insertTextIntoComposer()` dispatches a synthetic `paste` event (after focusing and selecting the draft) so Draft updates its own `EditorState` and enables the send button. Do NOT use `textContent`/`execCommand` on the Draft DOM — it desyncs React and throws `removeChild is not a child of this node`.
- **LLM**: `shared.js` defines `LLM_DEFAULTS`, `LLM_LIMITS`, `normalizeLlmBaseUrl()`, and `normalizeLlmSettings()`. `LLM_DEFAULTS.model` is intentionally empty: there is no built-in model name. The popup fills the field from Fetch Models or user input, `normalizeLlmSettings()` keeps an empty model empty, the popup shows No model until one is saved, and `generateReply()` / `generatePost()` throw a clear error before making a request. `background.js` composes the system prompt from persona + style + rules + the matching cues + tone (reply) or persona + style + rules + post cues (post) on every request, and sends examples as few-shot turns rather than prompt text. The popup writes `xbBuddyLlmSettings`; `background.js` resolves and normalizes it on every request, so changes apply without a reload. Requests go to `${baseUrl}/v1/chat/completions`; model discovery uses `${baseUrl}/v1/models`. Only `localhost` and `127.0.0.1` URLs are accepted. Content-script requests to loopback are blocked by Chrome's Local Network Access policy; the service worker has the loopback host permission and is allowed. Response parsing handles `message.content`, `delta.content`, `reasoning_content`, and fallback fields. `chat_template_kwargs.enable_thinking = false` is sent only when the Disable model thinking setting is on, which is much faster on reasoning models. The optional API key is sent as a Bearer token, kept in local storage, and excluded from exports.
- **Keyword / rule changes**: `resetPostProcessing()` clears `data-xb-processed`, `.xb-glow-post`, `.xb-hidden-post`, `.xb-rule-glow-post`, `.xb-rule-hidden-post`, `data-xb-metrics-req`, and `data-xb-rules-retried`, then bumps `rulesGeneration` and replaces the metrics caches. Newly added keywords and rules apply to already-rendered posts; removed ones stop glowing or hiding. Changes are debounced through `scheduleReprocess()`.
- **Master toggle**: `disableExtension()` stops the observer and safety checks, clears every injected class/marker, closes the tone menu, removes the nudge bar, and removes Magic Reply and Draft Post wrappers. `enableExtension()` reloads settings and rescans. All scan functions are guarded by `enabled`.
- **Popup lists**: five items per page, case-insensitive search, Clear All behind `confirm()`, and a 100-character limit. Duplicate or over-long adds flash feedback on the Add button; successful adds, clears, and toggle changes use the popup toast (`showToast(msg, 'error')` for failures).
- **Glow color**: `applyGlowColor()` converts the stored `#rrggbb` value into `--xb-glow-rgb` on `document.documentElement`. The CSS uses `rgba(var(--xb-glow-rgb, 0, 255, 65), …)`, so existing glowing posts recolor immediately without a rescan. Invalid values fall back to `#00ff41`.
- **Export/import**: version 6 configs are marked `app: 'xbuddy'` and carry both lists, all toggles, glow color, feed rules, `replyLength`, `persona`, `voiceStyle`, `voiceRules`, `voiceRulesEnabled`, `postExamples`, `replyExamples`, `customTones`, `hiddenToneIds`, `tonePrompts`, and a non-secret `llm` object (base URL, model, temperature, max tokens, timeout, thinking toggle). Between rules keep their optional `thresholdMax`, so both range endpoints round-trip. The API key is never exported or imported. A versioned import replaces the present keys in one `chrome.storage.local.set`; version 1, 2, 3, and 4 files still import (version 3 leaves `replyLength` untouched; version 4 leaves the voice alone), version 5 maps its `voice` to the Persona and imports `postExamples`, and legacy files containing only `positive`/`negative` arrays merge additively. Imported tone instructions run through `resolveTonePrompts(data.tonePrompts, tones)` for built-ins and the imported custom tones. Imported persona, rules, and examples go through `resolveVoicePersona()` / `resolveVoiceRules()` / `resolveReplyExamples()` / `resolvePostExamples()`, so a config made by an older build upgrades in the same import. Over-limit voice/rules/examples are skipped with a toast, and hidden ids are sanitized so at least one tone stays visible. Invalid `replyLength` values are ignored, not written. Other app markers, invalid JSON, and over-100-character keywords are rejected or skipped.
- **Context menus**: `background.js` creates positive/negative selection menus for x.com and twitter.com on install/startup. The click handler trims/collapses whitespace, strips leading `#`, rejects over-100 values, dedupes case-insensitively, and writes the list plus `xbBuddyNotification` in one `set`. The content script shows `showPageToast()` and clears the notification key; a pending notification is also consumed on page load.
- **Security**: CSP in manifest restricts to `script-src 'self'`. `storage`, `contextMenus`, and `scripting` permissions are declared, plus host permissions for x.com/twitter.com and loopback (`http(s)://localhost/*`, `http(s)://127.0.0.1/*`, any port). `scripting` is used only against x.com/twitter.com tabs for open-tab recovery; it does not broaden the host permissions. LLM requests are restricted to loopback. The optional API key, the voice settings, and the examples stay in local storage; the voice settings and examples are included in exports, the API key is not. `page-metrics.js` runs in the MAIN world with no extension APIs and returns only counts; the page can spoof its replies, but the only effect is a CSS class on that page's own posts.
- **Error boundary**: Global `error` and `unhandledrejection` listeners catch + log exceptions.

### Key Selectors

| Selector | Purpose |
|---|---|
| `article[data-testid="tweet"]` | Primary tweet container |
| `[data-testid="tweetText"]` | Tweet body text |
| `[data-testid="reply"]` | Reply action button; DOM fallback for comment counts |
| `[data-testid="retweet"]` | Repost action button; DOM fallback for repost counts |
| `[data-testid="like"]` | Like action button; DOM fallback for like counts |
| `[role="group"]` | Tweet engagement bar; DOM fallback container for counts |
| `[data-testid="tweetButtonInline"]` | Inline Send/Reply button |
| `[data-testid="tweetButton"]` | Send/Post button in the compose modal |
| `div[role="dialog"]` | Modal reply dialog |
| `[data-testid="sheetDialog"]` | Bottom-sheet composer |
| `div[data-testid="cellInnerDiv"]` | Timeline row; negative-filter and hide-rule target |

## Development

1. Open `chrome://extensions`
2. Enable Developer mode
3. Click Load unpacked → select this directory
4. Navigate to `https://x.com`
5. Edit files → refresh the extension. Open X tabs recover automatically; a tab with an unsent draft needs a manual refresh.

### Testing in the installed Chrome profile

This Chrome build ignores `--load-extension`, so a fresh temporary profile will not load the unpacked extension. When X Buddy is already installed unpacked in the user's Chrome profile, test against a copy of that profile:

1. Copy `Local State`, `Default/Preferences`, and `Default/Secure Preferences` from the Chrome user data directory into a temporary directory.
2. Launch Chrome with that temporary `--user-data-dir`, `--headless=new`, and a free `--remote-debugging-port`. Add `--no-sandbox` only where the Chrome sandbox is unavailable, such as this container.
3. Read the X Buddy ID from `extensions.settings` in the copied preferences, open `chrome-extension://<id>/popup.html` through the DevTools protocol, and test the popup and service worker. The unpacked extension loads from its absolute path, so it uses the current working tree.
4. Delete the temporary directory when done. Never run Chrome against the live profile and never edit its files.

Other installed extensions may log missing-file errors because their files were not copied; only the X Buddy service worker and popup matter. The live browser window cannot be attached to unless it was started with `--remote-debugging-port`; use this profile copy for repeatable checks and the live browser for content-script checks that need a signed-in x.com session.

### Testing in the logged-in Chrome browser

Chrome 136+ no longer permits `--remote-debugging-port` against the default profile. To let an agent inspect the browser you are already logged into, enable Chrome's remote debugging bridge (Chrome 144+):

1. Open `chrome://inspect/#remote-debugging` in the logged-in Chrome.
2. Turn on **Enable remote debugging** and leave the browser running.
3. When Chrome asks to allow the session, click **Allow**.

Chrome writes the current endpoint to `~/.config/google-chrome/DevToolsActivePort`. The port and browser ID change when Chrome restarts or the toggle is turned off and on, so read them each time:

```sh
P=~/.config/google-chrome
PORT=$(head -1 "$P/DevToolsActivePort")
WSPATH=$(sed -n 2p "$P/DevToolsActivePort" | tr -d '\r')
```

The CLI connects with auto-connect, so it does not need the port. Use it for extension actions and page inspection:

```sh
export XDG_RUNTIME_DIR=/dev/shm   # DSH sandbox only; a normal shell can omit it
CLI=<dsh-checkout>/packages/experimental/browser-use-chrome-devtools-mcp/node_modules/chrome-devtools-mcp/build/src/bin/chrome-devtools.js
node "$CLI" start --auto-connect --channel=stable --categoryExtensions=true --no-usage-statistics
node "$CLI" list_extensions
node "$CLI" reload_extension <id>
node "$CLI" new_page "chrome-extension://<id>/popup.html"
node "$CLI" evaluate_script "() => document.documentElement.dataset.xbBuddy" --pageId <page>
```

The `dsh-chrome-devtools` plugin in the Harness `web` profile attaches to the same browser through `mode: attach` and the websocket endpoint:

```text
endpoint: ws://127.0.0.1:<port><WSPATH>
```

Update `~/.dsh/profiles/web/cordis.patch.yml` when the endpoint changes, then start a new chat. The plugin's per-chat browser tools cover page automation; the CLI covers `install_extension`, `reload_extension`, and extension pages/service workers.

While remote debugging is on, the agent can read every tab, cookie, and login in that profile. Turn it off at `chrome://inspect/#remote-debugging` when you finish testing.

### Debugging

- Set `DEBUG = true` at the top of `content.js` for verbose logging in the isolated-content-script console, and in `page-metrics.js` for logging in the page console. There is no runtime toggle wired up.
- X Buddy does nothing on a tab and the popup shows **Grant access**: Chrome withheld site access. Grant it from the popup or set **Site access** to **On all sites** at `chrome://extensions`. With **On click**, no content script runs until the icon is clicked.
- Reloading the unpacked extension invalidates the old content script's `chrome.*` context. The service worker now detects the orphaned tab and reloads it automatically; a tab with an unsent composer draft is left for a manual refresh. If a tab still looks stale, check `data-xb-buddy-loaded` and `data-xb-buddy-scheduled` on `document.documentElement`, then refresh x.com.
- `document.documentElement.dataset.xbBuddy` shows the active content-script version, `xbBuddyRules` shows how many feed rules it loaded, and `xbBuddyRulesEnabled` shows its toggle state. `data-xb-buddy-loaded` and `data-xb-buddy-scheduled` show whether the content script is live or the declarative copy is still queued. If those are missing or still show `0` after adding a rule, the tab is stale — refresh x.com.
- Feed rules not applying: check the Feed Rules toggle and the master toggle, confirm the rule's metric is not `null` for that post (follower and following counts require the page helper), and confirm the page helper is listed before `content.js` in the manifest. The page helper's `DEBUG` logs show the metrics it read.
- Page-world React data is only visible in the **page** console (the default DevTools context). The isolated content-script console cannot see `__reactFiber$`, so use the page context to inspect tweet data.
- X's React re-renders aggressively. `scanAllDialogs()` / `scanInlineComposers()` re-inject a removed Magic Reply or Draft Post button when the marker attribute survived; if a button still disappears, check the composer selectors and `getComposerMode()`.
- Draft Post button is missing: open the composer first (the collapsed home placeholder is not a contenteditable), confirm the send button's label/text is `Post`, and refresh x.com if the tab still looks stale after an extension reload. If Magic Reply works but Draft Post does not, check the classifier in `getComposerMode()`.
- A Persona or style change is not applying: click Save Voice. `background.js` reads the voice per request, so no extension reload is needed. Check the service worker console for storage errors.
- Hashtags are still in a draft: set **Hashtags** to Off, then generate again. Cleanup runs on new drafts, not on text already in the composer.
- Nudge pills are missing: they appear after a successful insert and dismiss on outside click, ×, Escape, about 30 seconds, or the master toggle. Generate again to bring them back.
- Generate Voice from My Tweets fails: choose a model in Settings → Local LLM. A small model may not return the requested JSON; try again or fill the Persona by hand.
- If the tone menu does not open, confirm `shared.js` is listed before `content.js` in the manifest and reload the extension.
- Draft Post requests go through the same service-worker LLM path as Magic Reply. An empty composer is rejected before the request; a filled composer with no model shows the same choose-a-model error.
- CSS selectors in `POST_SELECTORS` / `DIALOG_SELECTORS` break when X changes their DOM — most common maint issue. X's new (2026) logged-in UI removes `data-testid` entirely; the classic selectors do not match it.

## Common Tasks

- **Add tweet selector**: Add to `POST_SELECTORS` array in `content.js`
- **Change glow style**: Edit `.xb-glow-post` / `.xb-rule-glow-post` / `@keyframes xb-glow-pulse` in `styles.css`; the user-facing default is `DEFAULT_GLOW_COLOR` in `content.js` and the color input in `popup.html`
- **Change hidden style**: Edit `.xb-hidden-post` / `.xb-rule-hidden-post` in `styles.css`; the hide target is chosen by `getHideTarget()` in `content.js`
- **Add or change a keyword list**: Add the storage key in `content.js`, `popup.js`, and `background.js`, then wire a popup section and a content-script scan branch
- **Add a feed-rule metric**: Add an entry to `FEED_RULE_METRICS` in `shared.js`, then add its extraction in `page-metrics.js` (`readMetrics`) and, for engagement counts, the DOM fallback in `content.js` (`readDomEngagement`). Follower and following counts must come from `readMetrics` because the timeline has no visible fallback. The popup selector is generated from the shared list, so it needs no edit.
- **Change feed-rule wording or limits**: Edit `formatFeedRule()` or `FEED_RULE_LIMITS` in `shared.js`; the popup and content script both read them.
- **Change context menu labels**: Edit the titles in `setupContextMenus()` in `background.js`; menus are recreated on install/startup
- **Change the built-in voice**: Edit `VOICE_PROFILE`, `VOICE_RULES`, `POST_VOICE_CUES`, and `REPLY_VOICE_CUES` in `shared.js`. When replacing the complete default, append the previous persona, rules, and cues (and any previous full default string) to `LEGACY_VOICE_SKILLS` so saved unedited defaults pick up the new one; the 1.7.4 default is `LEGACY_VOICE_SKILL_V174` (5,778 chars, FNV-1a `15171b54`). Keep the default free of em/en dashes and motivational closers. Hand-edited voices still override the default until the user clicks Restore Defaults.
- **Change the examples**: Edit `DEFAULT_POST_EXAMPLES` or `DEFAULT_REPLY_EXAMPLES` in `shared.js`; append a previous post-example value to `LEGACY_POST_EXAMPLES`. Reply examples use `Post:`/`Reply:` blocks separated by `---`; both sets are sent as few-shot turns, so keep them short and style-only. The `parsePostExamples()` / `parseReplyExamples()` turn builders are unit-tested.
- **Change a default tone instruction**: Edit the matching `direction` in `TONES` in `shared.js`. When replacing a built-in, append the previous direction (and any previous full prompt that shipped) to `LEGACY_TONE_PROMPTS[tone.id]` so saved defaults pick up the new one. Hand-edited instructions still override the default until the user clicks Restore Default.
- **Change the composer surface rule**: Edit `classifyComposerSurface()` in `shared.js` for the pure decision and update `tests/shared.test.js`; `getComposerMode()` in `content.js` supplies the send label, route, and dialog context.
- **Change Draft Post behavior**: Edit `handleDraftPostClick()` in `content.js`, `cleanPost()`, `POST_USER_INSTRUCTION`, `POST_OUTPUT_INSTRUCTION`, and `POST_CLOSER_INSTRUCTION` in `shared.js`, and the matching tests. Keep the no-cheer instruction after the note in the user message; the model follows it there better than in the system prompt.
- **Change voice or example limits**: Edit `VOICE_SKILL_LIMITS`, `VOICE_RULES_LIMITS`, `POST_EXAMPLES_LIMITS`, or `REPLY_EXAMPLES_LIMITS` in `shared.js`; the popup and background both read them.
- **Change reply length levels**: Edit `REPLY_LENGTH_LEVELS` / `DEFAULT_REPLY_LENGTH` in `shared.js`; the popup slider and the background instruction both read them. An `auto: true` entry needs the matching branch in `buildReplyLengthInstruction()` and should not define `maxSentences` / `maxWords`.
- **Add a built-in reply tone**: Add an entry to `TONES` in `shared.js` with a `direction`, not a full prompt. The popup selector, tone editor, Magic Reply menu, and background all read from that array; no other list to update. Add a `LEGACY_TONE_PROMPTS` key only when the tone previously shipped with a different default. Users can also add their own tones at runtime; those live in `xbBuddyCustomTones` and use the same `xbBuddyTonePrompt_<id>` instruction keys.
- **Change tone menu labels**: Edit the `label` fields in `TONES` in `shared.js`; custom labels are user data.
- **Change the output cleanup**: Edit `normalizeDashes()`, `stripHashtags()`, `stripPostMarkdown()`, `cleanReply()`, or `cleanPost()` in `shared.js`, and the matching tests. Cleanup is deterministic and independent of the prompt rules.
- **Change the banned phrase list**: Edit `VOICE_BANNED_WORDS` / `VOICE_BANNED_PHRASES`; the rules' avoid line is built from them, and `findBannedPhrases()` drives the one-retry path in `background.js`. Keep the list short.
- **Change the nudge pills**: Edit `NUDGE_INSTRUCTIONS` in `shared.js`; `content.js` builds the pills and `background.js` resolves the instruction. Ids are sent in the `nudge` field of `xb:generate-reply` / `xb:generate-post`.
- **Change the voice-from-samples prompt**: Edit `VOICE_FROM_SAMPLES_SYSTEM` / `VOICE_GENERATION_LIMITS` and `parseGeneratedVoice()` in `shared.js`; the popup fills the form and the background handles `xb:generate-voice`.
- **Change default LLM endpoint and generation defaults**: Edit `LLM_DEFAULTS` in `shared.js`; users override the URL and model in Settings. Leave `model` empty so the user chooses one with Fetch Models or types it. Do not add a built-in model name.
- **Change LLM validation limits**: Edit `LLM_LIMITS` in `shared.js`; the popup and background both read them.
- **Add permission**: Edit `permissions` / `host_permissions` in `manifest.json`
