# X Buddy

Chrome Manifest V3 extension that enhances X/Twitter with keyword highlighting, negative-keyword filtering, count-based feed rules, and AI-powered replies via a local LLM.

## Commands

No build step, no package manager, no tests. Pure vanilla JS.

- `chrome://extensions` → Load unpacked → select this directory

## Development Workflow

We work one task at a time. The flow is:

1. Make the change.
2. Test it manually in Chrome (see the checklist below).
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

There is no automated test suite. Before committing a behavior change, check:

- The extension loads at `chrome://extensions` with no errors.
- With X already open, reloading the extension brings the features back without a manual refresh.
- Opening X while the extension is not loaded, then loading it, injects the page script into the already-open tab.
- A stale tab with an unsent composer draft is not reloaded; clearing the draft and switching away and back recovers it.
- A live X tab is not reloaded when the service worker wakes or the popup opens.
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
- Export All downloads a JSON config; importing it restores the lists, toggles, glow color, feed rules, reply length, writing voice, post examples, and tone instructions.
- Importing a version 1 or 2 config still works and leaves the current feed rules untouched.
- Importing a legacy file with only `positive`/`negative` arrays merges keywords instead of replacing the lists.
- Right-clicking a selection or hashtag offers both keyword lists, saves the keyword, shows a page toast, and the popup reflects the change.
- Magic Reply appears in a reply dialog and on a post detail page, but not in the home "Post" box.
- Draft Post appears in an open home/profile composer and in the compose modal, but not in a reply composer.
- Magic Reply opens a tone menu with Generic, Agree, Connect, Disagree, Funny, and Informative.
- Choosing a tone sends that tone and fills the composer.
- The Connect tone names a specific detail from the poster's post, offers to connect, asks one short question about that detail, and ends with a question mark, without inventing the user's project or pitching.
- Every tone except Disagree agrees with or builds on the post; Disagree offers a different view of one claim and stays respectful.
- Replies read like a person: contractions, varied sentence length, no canned opener, no em dash, no hashtag, at most one emoji, and no AI filler.
- A sad or frustrated post gets empathy, not advice; a mean-spirited post is not agreed with.
- A Disagree reply starts with a plain different view, not a compliment or agreement.
- Funny reads as an actual joke; Informative adds a detail or opinion instead of correcting or just praising.
- A saved old full tone prompt loads the short tone instruction; a hand-edited prompt keeps its custom wording with the old shared intro removed.
- Writing Voice and Post Examples are populated on a fresh profile, Save applies them, Restore Default resets them, and Import .md strips frontmatter.
- Editing the Writing Voice changes the output of every tone, not just the selected one.
- Draft Post with an empty composer says Add an idea first and sends no request.
- Editing a tone instruction in Settings changes the generated reply; Restore Default resets it.
- The Reply Length slider defaults to Balanced on a fresh profile, shows the saved level after reopening the popup, and level 1 produces a visibly shorter reply than level 5.
- Auto is the far-right level, uses no fixed word cap, and lets the model choose a length that fits the post.
- Reply Length changes the output for a hand-edited tone instruction, not just the built-in prompts.
- A saved old built-in instruction is not treated as a custom prompt.
- Magic Reply fills the composer, the send button enables, and an existing draft is replaced rather than appended.
- Draft Post rewrites the composer note into one post in the voice, replaces the composer text, and never posts.
- With no model saved, Draft Post fails with the choose-a-model message and sends no request.
- The master toggle removes both Magic Reply and Draft Post.
- Export/import version 5 round-trips the writing voice, post examples, and tone instructions; a version 4 import still works and leaves the voice alone.
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
page-metrics.js        — MAIN-world helper: reads tweet metrics from page React data and answers postMessage requests
shared.js              — Shared writing voice, post examples, tone instructions, prompt composition, reply length presets, LLM defaults, feed-rule normalization, and LLM settings normalization
popup.html             — Popup UI (340px, dark theme)
popup.js               — Popup logic: keyword CRUD, feed rules, toggles, writing voice/post examples editor, tone instruction editor, LLM settings/status
content-start.js       — document_start marker: tells the service worker the declarative content scripts are queued
content.js             — Content script: keyword glow/filter, feed-rule evaluation, Magic Reply tone menu, Draft Post
background.js          — Service worker: settings-aware local LLM requests for replies and posts, prompt composition, right-click menus, open-tab recovery
styles.css             — Content script styles (glow + hidden post + composer action buttons + tone menu)
icons/                 — Extension icons (16, 48, 128 PNG)
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
| `xbBuddyVoiceSkill` | `string` | `DEFAULT_VOICE_SKILL` | Editable writing voice applied to every Magic Reply and Draft Post |
| `xbBuddyPostExamples` | `string` | `DEFAULT_POST_EXAMPLES` | Post-only style examples; an empty string disables the examples block |
| `xbBuddyTonePrompt_<id>` | `string` | `TONES[*].direction` | Per-tone instruction composed after the writing voice (`generic`, `agree`, `connect`, `disagree`, `funny`, `informative`) |
| `xbBuddyReplyLength` | `integer` | `3` | Magic Reply length level 1–6 (`One-liner`, `Short`, `Balanced`, `Detailed`, `Long`, `Auto`) |
| `xbBuddyLlmSettings` | `object` | `LLM_DEFAULTS` | Local LLM base URL, model (empty until the user chooses one), temperature, max tokens, timeout, thinking toggle, and optional API key |
| `xbBuddySettingsOpen` | `boolean` | `false` | Popup Settings section open state |
| `xbBuddyNotification` | `object` | absent | Transient context-menu toast (`keyword`, `listType`, `duplicate`, or `error`) |

## Code Conventions

- Use `const` / `let`, never `var`
- Async functions where storage/network is involved
- `DEBUG` flags in `content.js` and `page-metrics.js` toggle verbose console logging
- `shared.js` loads before `content.js` and `popup.js`, and via `importScripts('shared.js')` in the service worker. Tone IDs are stable: stored instructions and exported configs use them. The writing voice, post examples, tone instructions, prompt composition, legacy default handling, and reply length presets live here too. LLM defaults, limits, and URL/settings normalization also live here so the popup and service worker cannot drift. Feed-rule metric/op/action lists, limits, normalization, and labels live here too.
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
- **Tab recovery**: content scripts only run when a document loads. `background.js` uses the `scripting` permission to reattach them to X tabs that were already open when the extension started or survived an extension reload. `content-start.js` sets `data-xb-buddy-scheduled` at `document_start`; `content.js` sets `data-xb-buddy-loaded` synchronously before its async init and answers the service worker's `xb:ping`. `ensureTabContent()` runs from service-worker start, `onInstalled`, `onStartup`, `tabs.onUpdated` (complete), and `tabs.onActivated`. It pings first and leaves a live tab alone. With no markers and a complete tab, it injects `page-metrics.js` in the MAIN world, `styles.css`, then `shared.js` + `content.js`; it waits 250 ms and 1 s and rechecks so it cannot race a declarative injection. A tab with the loaded marker (or the pre-1.7.2 `data-xb-buddy` version marker) but no live ping is an orphan from the previous extension instance and is reloaded, guarded by a 30 s per-tab cooldown. A tab with unsent composer text is never auto-reloaded; the activation check retries after the draft is cleared or posted. Do not inject `content-start.js` programmatically: it only marks documents where the declarative idle scripts are already queued.
- **Isolated world**: content scripts cannot see expando properties such as `__reactFiber$` set by the page. The existing `findReactFiber()` in `content.js` therefore cannot reliably detect page React ownership; metrics must go through `page-metrics.js`. Do not add a second fiber reader to the isolated script.
- **Composer actions**: `content.js` classifies each composer by the send button's label (`Reply` vs `Post`), falling back to the route (`/status/` or `in_reply_to=` = reply, `/compose/post` = post) and to the dialog's reply/tweet context. Reply surfaces get a `div.magic-reply-wrapper` containing `button.magic-reply-btn` that opens the tone menu; new-post surfaces get a `div.draft-post-wrapper` containing `button.draft-post-btn` that runs Draft Post. Both are inserted before the send button. `getSendButton()` checks the `tweetButtonInline` / `tweetButton` testids first, then aria-label fallbacks. Dialog detection uses `div[role="dialog"]` and `[data-testid="sheetDialog"]`. `ensureComposerAction()` removes the other mode's button and marker when a SPA navigation reuses a composer, then re-injects.
- **Writing voice**: `shared.js` defines `VOICE_KEY`, `DEFAULT_VOICE_SKILL`, `VOICE_SKILL_LIMITS`, `normalizeVoiceSkill()`, and `resolveVoiceSkill()`, plus `POST_EXAMPLES_KEY`, `DEFAULT_POST_EXAMPLES`, `POST_EXAMPLES_LIMITS`, `normalizePostExamples()`, and `resolvePostExamples()`. The default voice is a distilled adaptation of the moss-tweet-voice skill; it is inlined in `shared.js`, so the extension has no external skill-file dependency. `VOICE_SKILL_BASE` carries the persona/rhythm/rules, and `REPLY_VOICE_CUES` adds the reply behavior for quick reactions, sad or frustrated posts, mean-spirited posts, and avoiding claims about the user's own setup. The popup edits both values and imports a `.md`/`.txt` file with the YAML frontmatter stripped. `LEGACY_VOICE_SKILLS` holds the pre-cues base, and `LEGACY_POST_EXAMPLES` handles old example defaults, so saved unedited defaults upgrade. Post examples are read only by the post path; an empty stored string disables them.
- **Reply tones**: `shared.js` defines `TONES` with a `direction` for each tone, `TONE_PROMPT_PREFIX` (still `xbBuddyTonePrompt_` for storage compatibility), `LEGACY_TONE_PROMPTS`, `LEGACY_VOICE_CORES`, `resolveToneInstruction()`, and `composeReplySystemPrompt()`. The system prompt is the writing voice followed by the tone instruction, so editing the voice changes every tone. `resolveToneInstruction()` returns the default direction for an empty or exact old built-in, strips a known old shared-voice prefix from hand-edited prompts, and otherwise preserves the stored instruction. The Connect instruction still requires a specific detail from the post and now ends the reply with a question mark using plain punctuation. The Disagree instruction opens with a plain different view and says staying friendly does not mean agreeing. Their previous direction-only defaults are in `LEGACY_TONE_PROMPTS.connect` and `LEGACY_TONE_PROMPTS.disagree`. The popup edits `xbBuddyTonePrompt_<id>`; the content menu sends `toneId` with `xb:generate-reply`; `background.js` resolves the voice and instruction per request. Unknown tone IDs fall back to `generic`.
- **Draft Post**: New-post surfaces get the `✨ Draft Post` button. `handleDraftPostClick()` reads the composer text as the rough note; an empty composer flashes `Add an idea first` and focuses the composer instead of sending a request. The button then calls `xb:generate-post`; `background.js` composes the writing voice + `POST_DRAFT_INSTRUCTIONS` + post examples and returns one post. The content script re-resolves the composer after the await, pastes the result with the same Draft.js-safe path as Magic Reply, and never posts. It replaces the existing composer text. Draft Post creates a single post; thread generation is out of scope.
- **Reply length**: `shared.js` defines `REPLY_LENGTH_KEY`, `DEFAULT_REPLY_LENGTH` (3, `Balanced`), `REPLY_LENGTH_LEVELS`, `normalizeReplyLength()`, `getReplyLengthLevel()`, `formatReplyLength()`, and `buildReplyLengthInstruction()`. The popup writes `xbBuddyReplyLength`; `background.js` reads it per request and appends the instruction after the post in the user message, where the model follows it better than in the system prompt. The instruction explicitly overrides sentence limits written into a tone instruction. Levels 1–5 carry fixed sentence/word caps; level 6 (`Auto`) uses the `auto` flag and a different instruction that lets the model choose the length from the post, with no fixed cap. Length is a prompt target, not a post-processing truncation. Draft Post ignores this setting; its length comes from the writing voice and `POST_DRAFT_INSTRUCTIONS`.
- **Tone menu**: a fixed-position `div.magic-reply-dropdown` is appended to `document.body` with one button per tone. It closes on selection, outside click, or Escape, repositions on scroll/resize, flips above the trigger near the viewport bottom, and is removed when the master toggle pauses.
- **Inline composer edge case**: On tweet detail pages, the reply composer is inline (not in a dialog). The tweet text lives ABOVE the composer in the DOM — `findTweetTextBefore()` picks the last `[data-testid="tweetText"]` that precedes the composer. The home/profile "Post" composer is also inline; it gets Draft Post, not Magic Reply. `/compose/post` is a post surface, not a reply surface. The collapsed home placeholder is not a contenteditable, so the Draft Post button appears after the user opens the composer.
- **Text insertion**: X's composer is Draft.js, whose DOM is owned by React. `insertTextIntoComposer()` dispatches a synthetic `paste` event (after focusing and selecting the draft) so Draft updates its own `EditorState` and enables the send button. Do NOT use `textContent`/`execCommand` on the Draft DOM — it desyncs React and throws `removeChild is not a child of this node`.
- **LLM**: `shared.js` defines `LLM_DEFAULTS`, `LLM_LIMITS`, `normalizeLlmBaseUrl()`, and `normalizeLlmSettings()`. `LLM_DEFAULTS.model` is intentionally empty: there is no built-in model name. The popup fills the field from Fetch Models or user input, `normalizeLlmSettings()` keeps an empty model empty, the popup shows No model until one is saved, and `generateReply()` / `generatePost()` throw a clear error before making a request. `background.js` composes the system prompt from the writing voice plus the tone instruction (reply) or the post instructions and examples (post) on every request. The popup writes `xbBuddyLlmSettings`; `background.js` resolves and normalizes it on every request, so changes apply without a reload. Requests go to `${baseUrl}/v1/chat/completions`; model discovery uses `${baseUrl}/v1/models`. Only `localhost` and `127.0.0.1` URLs are accepted. Content-script requests to loopback are blocked by Chrome's Local Network Access policy; the service worker has the loopback host permission and is allowed. Response parsing handles `message.content`, `delta.content`, `reasoning_content`, and fallback fields. `chat_template_kwargs.enable_thinking = false` is sent only when the Disable model thinking setting is on, which is much faster on reasoning models. The optional API key is sent as a Bearer token, kept in local storage, and excluded from exports.
- **Keyword / rule changes**: `resetPostProcessing()` clears `data-xb-processed`, `.xb-glow-post`, `.xb-hidden-post`, `.xb-rule-glow-post`, `.xb-rule-hidden-post`, `data-xb-metrics-req`, and `data-xb-rules-retried`, then bumps `rulesGeneration` and replaces the metrics caches. Newly added keywords and rules apply to already-rendered posts; removed ones stop glowing or hiding. Changes are debounced through `scheduleReprocess()`.
- **Master toggle**: `disableExtension()` stops the observer and safety checks, clears every injected class/marker, closes the tone menu, and removes Magic Reply and Draft Post wrappers. `enableExtension()` reloads settings and rescans. All scan functions are guarded by `enabled`.
- **Popup lists**: five items per page, case-insensitive search, Clear All behind `confirm()`, and a 100-character limit. Duplicate or over-long adds flash feedback on the Add button; successful adds, clears, and toggle changes use the popup toast (`showToast(msg, 'error')` for failures).
- **Glow color**: `applyGlowColor()` converts the stored `#rrggbb` value into `--xb-glow-rgb` on `document.documentElement`. The CSS uses `rgba(var(--xb-glow-rgb, 0, 255, 65), …)`, so existing glowing posts recolor immediately without a rescan. Invalid values fall back to `#00ff41`.
- **Export/import**: version 5 configs are marked `app: 'xbuddy'` and carry both lists, all toggles, glow color, feed rules, `replyLength`, `voice`, `postExamples`, `tonePrompts`, and a non-secret `llm` object (base URL, model, temperature, max tokens, timeout, thinking toggle). Between rules keep their optional `thresholdMax`, so both range endpoints round-trip. The API key is never exported or imported. A versioned import replaces the present keys in one `chrome.storage.local.set`; version 1, 2, 3, and 4 files still import (version 3 leaves `replyLength` untouched; version 4 leaves `voice`/`postExamples` untouched), and legacy files containing only `positive`/`negative` arrays merge additively. Imported tone instructions run through `resolveToneInstruction()` so an old built-in in a config becomes a short instruction. Imported voice/examples over the limits are skipped with a toast. Invalid `replyLength` values are ignored, not written. Other app markers, invalid JSON, and over-100-character keywords are rejected or skipped.
- **Context menus**: `background.js` creates positive/negative selection menus for x.com and twitter.com on install/startup. The click handler trims/collapses whitespace, strips leading `#`, rejects over-100 values, dedupes case-insensitively, and writes the list plus `xbBuddyNotification` in one `set`. The content script shows `showPageToast()` and clears the notification key; a pending notification is also consumed on page load.
- **Security**: CSP in manifest restricts to `script-src 'self'`. `storage`, `contextMenus`, and `scripting` permissions are declared, plus host permissions for x.com/twitter.com and loopback (`http(s)://localhost/*`, `http(s)://127.0.0.1/*`, any port). `scripting` is used only against x.com/twitter.com tabs for open-tab recovery; it does not broaden the host permissions. LLM requests are restricted to loopback. The optional API key, the writing voice, and the post examples stay in local storage; the voice and examples are included in exports, the API key is not. `page-metrics.js` runs in the MAIN world with no extension APIs and returns only counts; the page can spoof its replies, but the only effect is a CSS class on that page's own posts.
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
- Reloading the unpacked extension invalidates the old content script's `chrome.*` context. The service worker now detects the orphaned tab and reloads it automatically; a tab with an unsent composer draft is left for a manual refresh. If a tab still looks stale, check `data-xb-buddy-loaded` and `data-xb-buddy-scheduled` on `document.documentElement`, then refresh x.com.
- `document.documentElement.dataset.xbBuddy` shows the active content-script version, `xbBuddyRules` shows how many feed rules it loaded, and `xbBuddyRulesEnabled` shows its toggle state. `data-xb-buddy-loaded` and `data-xb-buddy-scheduled` show whether the content script is live or the declarative copy is still queued. If those are missing or still show `0` after adding a rule, the tab is stale — refresh x.com.
- Feed rules not applying: check the Feed Rules toggle and the master toggle, confirm the rule's metric is not `null` for that post (follower and following counts require the page helper), and confirm the page helper is listed before `content.js` in the manifest. The page helper's `DEBUG` logs show the metrics it read.
- Page-world React data is only visible in the **page** console (the default DevTools context). The isolated content-script console cannot see `__reactFiber$`, so use the page context to inspect tweet data.
- X's React re-renders aggressively. `scanAllDialogs()` / `scanInlineComposers()` re-inject a removed Magic Reply or Draft Post button when the marker attribute survived; if a button still disappears, check the composer selectors and `getComposerMode()`.
- Draft Post button is missing: open the composer first (the collapsed home placeholder is not a contenteditable), confirm the send button's label/text is `Post`, and refresh x.com if the tab still looks stale after an extension reload. If Magic Reply works but Draft Post does not, check the classifier in `getComposerMode()`.
- A Writing Voice change is not applying: click Save Voice. `background.js` reads the voice per request, so no extension reload is needed. Check the service worker console for storage errors.
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
- **Change the built-in writing voice**: Edit `DEFAULT_VOICE_SKILL` in `shared.js`, and append the previous default to `LEGACY_VOICE_SKILLS` so saved unedited defaults pick up the new one. Keep `DEFAULT_VOICE_SKILL` in `shared.js` as the source of truth; the original skill file is not part of the extension. Hand-edited voices still override the default until the user clicks Restore Default.
- **Change the post examples**: Edit `DEFAULT_POST_EXAMPLES` in `shared.js`; append the previous value to `LEGACY_POST_EXAMPLES`. These examples are sent only on the Draft Post path.
- **Change a default tone instruction**: Edit the matching `direction` in `TONES` in `shared.js`. When replacing a built-in, append the previous direction (and any previous full prompt that shipped) to `LEGACY_TONE_PROMPTS[tone.id]` so saved defaults pick up the new one. Hand-edited instructions still override the default until the user clicks Restore Default.
- **Change the composer surface rule**: Edit `getComposerMode()` in `content.js`; it checks the send button label first, then the route and dialog context.
- **Change Draft Post behavior**: Edit `handleDraftPostClick()` in `content.js` and `POST_DRAFT_INSTRUCTIONS` / the prompt builders in `shared.js`.
- **Change writing voice or post example limits**: Edit `VOICE_SKILL_LIMITS` / `POST_EXAMPLES_LIMITS` in `shared.js`; the popup and background both read them.
- **Change reply length levels**: Edit `REPLY_LENGTH_LEVELS` / `DEFAULT_REPLY_LENGTH` in `shared.js`; the popup slider and the background instruction both read them. An `auto: true` entry needs the matching branch in `buildReplyLengthInstruction()` and should not define `maxSentences` / `maxWords`.
- **Add a reply tone**: Add an entry to `TONES` in `shared.js` with a `direction`, not a full prompt. The popup selector, tone editor, Magic Reply menu, and background all read from that array; no other list to update. Add a `LEGACY_TONE_PROMPTS` key only when the tone previously shipped with a different default.
- **Change tone menu labels**: Edit the `label` fields in `TONES` in `shared.js`.
- **Change default LLM endpoint and generation defaults**: Edit `LLM_DEFAULTS` in `shared.js`; users override the URL and model in Settings. Leave `model` empty so the user chooses one with Fetch Models or types it. Do not add a built-in model name.
- **Change LLM validation limits**: Edit `LLM_LIMITS` in `shared.js`; the popup and background both read them.
- **Add permission**: Edit `permissions` / `host_permissions` in `manifest.json`
