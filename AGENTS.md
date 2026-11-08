# X Buddy

Chrome Manifest V3 extension that enhances X/Twitter with keyword highlighting, negative-keyword filtering, count-based feed rules, and AI-powered replies via a local LLM.

## Commands

No build step, no package manager, no tests. Pure vanilla JS.

- `chrome://extensions` → Load unpacked → select this directory

## Development Workflow

We work one task at a time. The flow is:

1. Make the change.
2. Test it manually in Chrome (see the checklist below).
3. Update `README.md` for any user-facing change (feature, setting, permission, setup step, or troubleshooting case), and update `AGENTS.md` when behavior, selectors, architecture, or conventions change.
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

- `README.md` is the user guide. Any feature, setting, permission, setup step, or troubleshooting case a user should know about goes into `README.md` in the same commit as the change.
- Keep the README in its existing voice: short, plain, practical. Explain what the feature does and how to use it. A short "What's new" section for the current release is fine; do not maintain a full changelog or write marketing copy.
- `AGENTS.md` is for contributors. Update it when architecture, selectors, storage keys, or conventions change.
- Internal-only changes (refactors, debug logging, selector hardening that does not change behavior) do not need a README entry, but `AGENTS.md` should reflect anything that affects maintenance.

### Pushing

- `origin` is `https://github.com/DevTarlow/xbuddy.git`.
- Push with `git push` after the user approves. The first push used `git push -u origin main`.
- Never force-push, rewrite history, or amend a commit the user has already seen unless they explicitly ask.
- If the push is rejected, stop and report it. Do not force it.

### Manual test checklist

There is no automated test suite. Before committing a behavior change, check:

- The extension loads at `chrome://extensions` with no errors.
- A matching keyword glows, including when the keyword is added after the page loaded.
- Removing a keyword removes the glow.
- A negative keyword hides matching posts, including posts added after the page loaded.
- Removing a negative keyword, or turning negative filtering off, restores the posts.
- The master toggle pauses and resumes highlighting, filtering, and Magic Reply.
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
- Export All downloads a JSON config; importing it restores the lists, toggles, glow color, feed rules, reply length, and tone prompts.
- Importing a version 1 or 2 config still works and leaves the current feed rules untouched.
- Importing a legacy file with only `positive`/`negative` arrays merges keywords instead of replacing the lists.
- Right-clicking a selection or hashtag offers both keyword lists, saves the keyword, shows a page toast, and the popup reflects the change.
- Magic Reply appears in a reply dialog and on a post detail page, but not in the home "Post" box.
- Magic Reply opens a tone menu with Generic, Agree, Connect, Disagree, Funny, and Informative.
- Choosing a tone sends that tone and fills the composer.
- The Connect tone names a specific detail from the poster's post, offers to connect, and asks one short question about that detail, without inventing the user's project or pitching.
- Every tone except Disagree agrees with or builds on the post; Disagree offers a different view of one claim and stays respectful.
- Replies read like a person: contractions, varied sentence length, no canned opener, no em dash, hashtag, emoji, or AI filler.
- Funny reads as an actual joke; Informative adds a detail or opinion instead of correcting or just praising.
- A saved 1.6.0 built-in prompt upgrades to the new default, while a hand-edited prompt is preserved.
- Editing a tone prompt in Settings changes the generated reply; Restore Default resets it.
- The Reply Length slider shows the saved level after reopening the popup, and level 1 produces a visibly shorter reply than level 5.
- Auto is the far-right level, uses no fixed word cap, and lets the model choose a length that fits the post.
- Reply Length changes the output for a hand-edited tone prompt, not just the built-in prompts.
- A prompt saved as an old built-in default loads the new default; a hand-edited prompt is left alone.
- Magic Reply fills the composer, the send button enables, and an existing draft is replaced rather than appended.
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
shared.js              — Shared tone presets, tone prompt resolution, reply length presets, LLM defaults, feed-rule normalization, and LLM settings normalization
popup.html             — Popup UI (340px, dark theme)
popup.js               — Popup logic: keyword CRUD, feed rules, toggles, tone editor, LLM settings/status
content.js             — Content script: keyword glow/filter, feed-rule evaluation, Magic Reply tone menu
background.js          — Service worker: settings-aware local LLM requests, tone prompt lookup, right-click menus
styles.css             — Content script styles (glow + hidden post + Magic Reply + tone menu)
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
| `xbBuddyTonePrompt_<id>` | `string` | `TONES[*].defaultPrompt` | Per-tone Magic Reply system prompt (`generic`, `agree`, `connect`, `disagree`, `funny`, `informative`) |
| `xbBuddyReplyLength` | `integer` | `2` | Magic Reply length level 1–6 (`One-liner`, `Short`, `Balanced`, `Detailed`, `Long`, `Auto`) |
| `xbBuddyLlmSettings` | `object` | `LLM_DEFAULTS` | Local LLM base URL, model (empty until the user chooses one), temperature, max tokens, timeout, thinking toggle, and optional API key |
| `xbBuddySettingsOpen` | `boolean` | `false` | Popup Settings section open state |
| `xbBuddyNotification` | `object` | absent | Transient context-menu toast (`keyword`, `listType`, `duplicate`, or `error`) |

## Code Conventions

- Use `const` / `let`, never `var`
- Async functions where storage/network is involved
- `DEBUG` flags in `content.js` and `page-metrics.js` toggle verbose console logging
- `shared.js` loads before `content.js` and `popup.js`, and via `importScripts('shared.js')` in the service worker. Tone IDs are stable: stored prompts and exported configs use them. Tone prompt resolution, legacy default handling, and reply length presets live here too. LLM defaults, limits, and URL/settings normalization also live here so the popup and service worker cannot drift. Feed-rule metric/op/action lists, limits, normalization, and labels live here too.
- `page-metrics.js` runs in the page's MAIN world because page-world React expandos are invisible to the isolated content script. It uses no `chrome.*` APIs, returns only counts, and validates the request channel/token.
- Feed-rule effects use their own classes (`xb-rule-glow-post` / `xb-rule-hidden-post`) so rule changes can be undone without touching keyword effects.
- Error states surface via `console.error` + `showToast()` in popup
- DOM dedup uses `WeakSet` + `data-xb-processed` / `data-magic-reply` attributes. The markers are verified against the live button before skipping, because X's React re-renders can remove injected nodes.
- Classic-UI DOM queries use `data-testid` selectors matching X's DOM conventions

## Key Technical Details

- **Tweet discovery**: `article[data-testid="tweet"]` via MutationObserver with 200ms cooldown. Relevance is checked against `MutationRecord.addedNodes` before scanning.
- **Keyword matching**: whole-word, case-insensitive regex with the `iu` flags. Regex special chars are escaped. The boundary is only added on a side that starts/ends with a word character, so `#AI`, `C++`, and `3.5` work while `ai` still does not match `rain`.
- **Negative filtering**: Matching posts get `.xb-hidden-post` (`display: none !important`) on the nearest `div[data-testid="cellInnerDiv"]` timeline row, falling back to the tweet article when the row contains a composer. A negative match wins over a positive glow. Negative matching only uses tweet body text, not the container-wide fallback that can include author names or UI labels.
- **Feed rules**: `shared.js` defines `FEED_RULES_KEY`, `FEED_RULES_ENABLED_KEY`, `FEED_RULE_METRICS`, `FEED_RULE_OPS`, `FEED_RULE_ACTIONS`, `FEED_RULE_LIMITS`, `normalizeFeedRules()`, `matchesFeedRule()`, and `formatFeedRule()`. A rule is `{metric, op, threshold, action}` for `lt`/`gt`, with strict `<` / `>` comparisons, or `{metric, op: 'between', threshold, thresholdMax, action}` with an inclusive range (`threshold <= value <= thresholdMax`). A between rule without a finite maximum, or with `threshold > thresholdMax`, is invalid. Up to 20 rules, deduped by metric, op, both counts, and action. The popup writes both keys; `content.js` reloads them on storage changes, resets, and evaluates each scanned post (including media-only posts). A hide rule wins over a highlight rule, and a metric that is `null` skips the rule. Nested/quoted articles are skipped.
- **Post metrics**: `page-metrics.js` is declared first in `content_scripts` with `world: "MAIN"` (Chrome 111+) and `run_at: "document_start"`. The content script sets `data-xb-metrics-req="<token>"` on the article and posts `{channel: 'xb-buddy-metrics', type: 'request', token}`. The helper walks up to 40 React fiber `return` levels for `memoizedProps.tweet` (unwrapping `TweetWithVisibilityResults` / `tweet_results`), reads `legacy.reply_count`, `legacy.favorite_count`, `legacy.retweet_count`, `core.user_results.result.legacy.followers_count`, and `core.user_results.result.legacy.friends_count`, and replies with the same token. A 400 ms timeout falls back to page-visible engagement counts (group/button `aria-label`s); followers and following stay unknown. One 500 ms retry covers late-mounted data. Rule evaluation is async and guarded by `rulesGeneration` plus `WeakMap` caches.
- **Isolated world**: content scripts cannot see expando properties such as `__reactFiber$` set by the page. The existing `findReactFiber()` in `content.js` therefore cannot reliably detect page React ownership; metrics must go through `page-metrics.js`. Do not add a second fiber reader to the isolated script.
- **Magic Reply injection**: Injects a `div.magic-reply-wrapper` containing `button.magic-reply-btn` near the send button in dialog and inline composers. Clicking the button opens the tone menu. Dialog detection uses `div[role="dialog"]` and `[data-testid="sheetDialog"]`.
- **Reply tones**: `shared.js` defines `TONES` (Generic, Agree, Connect, Disagree, Funny, Informative), `TONE_PROMPT_PREFIX`, `REPLY_VOICE_CORE`, `withReplyVoice()`, `LEGACY_TONE_PROMPTS`, and `resolveTonePrompt()`. Each `defaultPrompt` is the shared voice core plus tone-specific direction. `REPLY_VOICE_CORE` is a warm, friendly voice that keeps replies on the poster's side and only lets the Disagree tone offer a different view; its paragraphs are joined with blank lines so Settings shows readable sections. The Connect prompt requires a specific detail from the post, so it cannot fall back to a generic "what are you building?" question. The popup edits `xbBuddyTonePrompt_<id>`; the content menu sends `toneId` with `xb:generate-reply`; `background.js` resolves that prompt (or the built-in default) per request. `resolveTonePrompt()` treats an exact old built-in (`LEGACY_TONE_PROMPTS`) as unsaved, so default rewrites reach previously saved defaults without overwriting hand-edited prompts. Unknown tone IDs fall back to `generic`.
- **Reply length**: `shared.js` defines `REPLY_LENGTH_KEY`, `DEFAULT_REPLY_LENGTH`, `REPLY_LENGTH_LEVELS`, `normalizeReplyLength()`, `getReplyLengthLevel()`, `formatReplyLength()`, and `buildReplyLengthInstruction()`. The popup writes `xbBuddyReplyLength`; `background.js` reads it per request and appends the instruction after the post in the user message, where the model follows it better than in the system prompt. The instruction explicitly overrides sentence limits written into a tone prompt. Levels 1–5 carry fixed sentence/word caps; level 6 (`Auto`) uses the `auto` flag and a different instruction that lets the model choose the length from the post, with no fixed cap. Length is a prompt target, not a post-processing truncation.
- **Tone menu**: a fixed-position `div.magic-reply-dropdown` is appended to `document.body` with one button per tone. It closes on selection, outside click, or Escape, repositions on scroll/resize, flips above the trigger near the viewport bottom, and is removed when the master toggle pauses.
- **Inline composer edge case**: On tweet detail pages, the composer is inline (not in a dialog). The tweet text lives ABOVE the composer in the DOM — `findTweetTextBefore()` picks the last `[data-testid="tweetText"]` that precedes the composer. The button is only injected on reply surfaces (`/status/`, `/compose/post`, or `in_reply_to=`), not the home timeline's "Post" box.
- **Text insertion**: X's composer is Draft.js, whose DOM is owned by React. `insertTextIntoReply()` dispatches a synthetic `paste` event (after focusing and selecting the draft) so Draft updates its own `EditorState` and enables the Reply button. Do NOT use `textContent`/`execCommand` on the Draft DOM — it desyncs React and throws `removeChild is not a child of this node`.
- **LLM**: `shared.js` defines `LLM_DEFAULTS`, `LLM_LIMITS`, `normalizeLlmBaseUrl()`, and `normalizeLlmSettings()`. `LLM_DEFAULTS.model` is intentionally empty: there is no built-in model name. The popup fills the field from Fetch Models or user input, `normalizeLlmSettings()` keeps an empty model empty, the popup shows No model until one is saved, and `generateReply()` throws a clear error before making a request. The popup writes `xbBuddyLlmSettings`; `background.js` resolves and normalizes it on every request, so changes apply without a reload. Requests go to `${baseUrl}/v1/chat/completions`; model discovery uses `${baseUrl}/v1/models`. Only `localhost` and `127.0.0.1` URLs are accepted. Content-script requests to loopback are blocked by Chrome's Local Network Access policy; the service worker has the loopback host permission and is allowed. Response parsing handles `message.content`, `delta.content`, `reasoning_content`, and fallback fields. `chat_template_kwargs.enable_thinking = false` is sent only when the Disable model thinking setting is on, which is much faster on reasoning models. The optional API key is sent as a Bearer token, kept in local storage, and excluded from exports.
- **Keyword / rule changes**: `resetPostProcessing()` clears `data-xb-processed`, `.xb-glow-post`, `.xb-hidden-post`, `.xb-rule-glow-post`, `.xb-rule-hidden-post`, `data-xb-metrics-req`, and `data-xb-rules-retried`, then bumps `rulesGeneration` and replaces the metrics caches. Newly added keywords and rules apply to already-rendered posts; removed ones stop glowing or hiding. Changes are debounced through `scheduleReprocess()`.
- **Master toggle**: `disableExtension()` stops the observer and safety checks, clears every injected class/marker, closes the tone menu, and removes Magic Reply wrappers. `enableExtension()` reloads settings and rescans. All scan functions are guarded by `enabled`.
- **Popup lists**: five items per page, case-insensitive search, Clear All behind `confirm()`, and a 100-character limit. Duplicate or over-long adds flash feedback on the Add button; successful adds, clears, and toggle changes use the popup toast (`showToast(msg, 'error')` for failures).
- **Glow color**: `applyGlowColor()` converts the stored `#rrggbb` value into `--xb-glow-rgb` on `document.documentElement`. The CSS uses `rgba(var(--xb-glow-rgb, 0, 255, 65), …)`, so existing glowing posts recolor immediately without a rescan. Invalid values fall back to `#00ff41`.
- **Export/import**: version 4 configs are marked `app: 'xbuddy'` and carry both lists, all toggles, glow color, feed rules, `replyLength`, `tonePrompts`, and a non-secret `llm` object (base URL, model, temperature, max tokens, timeout, thinking toggle). Between rules keep their optional `thresholdMax`, so both range endpoints round-trip. The API key is never exported or imported. A versioned import replaces the present keys in one `chrome.storage.local.set`; version 1, 2, and 3 files still import (version 3 leaves `replyLength` untouched), and legacy files containing only `positive`/`negative` arrays merge additively. Imported tone prompts run through `resolveTonePrompt()` so an old built-in in a config also upgrades. Invalid `replyLength` values are ignored, not written. Other app markers, invalid JSON, and over-100-character keywords are rejected or skipped.
- **Context menus**: `background.js` creates positive/negative selection menus for x.com and twitter.com on install/startup. The click handler trims/collapses whitespace, strips leading `#`, rejects over-100 values, dedupes case-insensitively, and writes the list plus `xbBuddyNotification` in one `set`. The content script shows `showPageToast()` and clears the notification key; a pending notification is also consumed on page load.
- **Security**: CSP in manifest restricts to `script-src 'self'`. Only `storage` and `contextMenus` permissions are declared, plus host permissions for x.com/twitter.com and loopback (`http(s)://localhost/*`, `http(s)://127.0.0.1/*`, any port). LLM requests are restricted to loopback, and the optional API key stays in local storage and out of exports. `page-metrics.js` runs in the MAIN world with no extension APIs and returns only counts; the page can spoof its replies, but the only effect is a CSS class on that page's own posts.
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
| `[data-testid="tweetButtonInline"]` | Send/Reply button |
| `div[role="dialog"]` | Modal reply dialog |
| `[data-testid="sheetDialog"]` | Bottom-sheet composer |
| `div[data-testid="cellInnerDiv"]` | Timeline row; negative-filter and hide-rule target |

## Development

1. Open `chrome://extensions`
2. Enable Developer mode
3. Click Load unpacked → select this directory
4. Navigate to `https://x.com`
5. Edit files → refresh extension → reload x.com

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
- Reloading the unpacked extension does **not** re-inject content scripts into tabs that are already open. Refresh x.com after every extension reload, or the tab keeps running the previous script (and a reloaded extension can invalidate its old `chrome.*` context, so storage changes stop arriving).
- `document.documentElement.dataset.xbBuddy` shows the active content-script version, `xbBuddyRules` shows how many feed rules it loaded, and `xbBuddyRulesEnabled` shows its toggle state. If those are missing or still show `0` after adding a rule, the tab is stale — refresh x.com.
- Feed rules not applying: check the Feed Rules toggle and the master toggle, confirm the rule's metric is not `null` for that post (follower and following counts require the page helper), and confirm the page helper is listed before `content.js` in the manifest. The page helper's `DEBUG` logs show the metrics it read.
- Page-world React data is only visible in the **page** console (the default DevTools context). The isolated content-script console cannot see `__reactFiber$`, so use the page context to inspect tweet data.
- X's React re-renders aggressively. `scanAllDialogs()` / `scanInlineComposers()` re-inject a removed button when the marker attribute survived; if the button still disappears, check the composer selectors.
- If the tone menu does not open, confirm `shared.js` is listed before `content.js` in the manifest and reload the extension.
- CSS selectors in `POST_SELECTORS` / `DIALOG_SELECTORS` break when X changes their DOM — most common maint issue. X's new (2026) logged-in UI removes `data-testid` entirely; the classic selectors do not match it.

## Common Tasks

- **Add tweet selector**: Add to `POST_SELECTORS` array in `content.js`
- **Change glow style**: Edit `.xb-glow-post` / `.xb-rule-glow-post` / `@keyframes xb-glow-pulse` in `styles.css`; the user-facing default is `DEFAULT_GLOW_COLOR` in `content.js` and the color input in `popup.html`
- **Change hidden style**: Edit `.xb-hidden-post` / `.xb-rule-hidden-post` in `styles.css`; the hide target is chosen by `getHideTarget()` in `content.js`
- **Add or change a keyword list**: Add the storage key in `content.js`, `popup.js`, and `background.js`, then wire a popup section and a content-script scan branch
- **Add a feed-rule metric**: Add an entry to `FEED_RULE_METRICS` in `shared.js`, then add its extraction in `page-metrics.js` (`readMetrics`) and, for engagement counts, the DOM fallback in `content.js` (`readDomEngagement`). Follower and following counts must come from `readMetrics` because the timeline has no visible fallback. The popup selector is generated from the shared list, so it needs no edit.
- **Change feed-rule wording or limits**: Edit `formatFeedRule()` or `FEED_RULE_LIMITS` in `shared.js`; the popup and content script both read them.
- **Change context menu labels**: Edit the titles in `setupContextMenus()` in `background.js`; menus are recreated on install/startup
- **Change a default tone prompt**: Edit the matching `defaultPrompt` in `TONES` in `shared.js`, or the shared wording in `REPLY_VOICE_CORE`. A change to the core changes every tone, so when replacing a built-in append the previous full default for all six tones to `LEGACY_TONE_PROMPTS[tone.id]` so saved old defaults pick up the new one. Hand-edited prompts still override the default until the user clicks Restore Default.
- **Change reply length levels**: Edit `REPLY_LENGTH_LEVELS` / `DEFAULT_REPLY_LENGTH` in `shared.js`; the popup slider and the background instruction both read them. An `auto: true` entry needs the matching branch in `buildReplyLengthInstruction()` and should not define `maxSentences` / `maxWords`.
- **Add a reply tone**: Add an entry to `TONES` in `shared.js`. The popup selector, tone editor, Magic Reply menu, and background all read from that array; no other list to update. Add a `LEGACY_TONE_PROMPTS` key only when the tone previously shipped with a different default.
- **Change tone menu labels**: Edit the `label` fields in `TONES` in `shared.js`.
- **Change default LLM endpoint and generation defaults**: Edit `LLM_DEFAULTS` in `shared.js`; users override the URL and model in Settings. Leave `model` empty so the user chooses one with Fetch Models or types it. Do not add a built-in model name.
- **Change LLM validation limits**: Edit `LLM_LIMITS` in `shared.js`; the popup and background both read them.
- **Add permission**: Edit `permissions` / `host_permissions` in `manifest.json`
