# X Buddy

Chrome Manifest V3 extension that enhances X/Twitter with keyword highlighting, negative-keyword filtering, and AI-powered replies via a local LLM.

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
- The master, positive, and negative toggles keep their state after reopening the popup.
- Search filters either list, pagination appears past five items, and Clear All empties the list after confirmation.
- Duplicate and over-100-character keywords are rejected with button feedback.
- Changing the glow color updates existing and new glowing posts, and the choice survives a reload.
- Export All downloads a JSON config; importing it restores the lists, toggles, glow color, and tone prompts.
- Importing a legacy file with only `positive`/`negative` arrays merges keywords instead of replacing the lists.
- Right-clicking a selection or hashtag offers both keyword lists, saves the keyword, shows a page toast, and the popup reflects the change.
- Magic Reply appears in a reply dialog and on a post detail page, but not in the home "Post" box.
- Magic Reply opens a tone menu with Generic, Agree, Disagree, Funny, and Informative.
- Choosing a tone sends that tone and fills the composer.
- Editing a tone prompt in Settings changes the generated reply; Restore Default resets it.
- Magic Reply fills the composer, the send button enables, and an existing draft is replaced rather than appended.
- The popup shows the real LLM status.
- Settings → Local LLM shows the defaults, and URL/model/generation values persist after reopening the popup.
- Fetch Models lists the server's models, and Magic Reply uses the saved endpoint/model.
- An unreachable URL shows Offline and a clear Magic Reply failure; restoring it recovers.
- Export omits the API key and import restores the other LLM settings; a version 1 config still imports.
- Invalid LLM URL or number input shows feedback and does not save.
- No new errors in the x.com console or the service worker console.

## Architecture

```
manifest.json          — MV3 manifest
shared.js              — Shared reply-tone presets, LLM defaults, and LLM settings normalization
popup.html             — Popup UI (340px, dark theme)
popup.js               — Popup logic: keyword CRUD, toggles, tone editor, LLM settings/status
content.js             — Content script: keyword glow/filter, Magic Reply tone menu
background.js          — Service worker: settings-aware local LLM requests, tone prompt lookup, right-click menus
styles.css             — Content script styles (glow + hidden post + Magic Reply + tone menu)
icons/                 — Extension icons (16, 48, 128 PNG)
```

### Storage keys

Keep these in sync across `content.js`, `popup.js`, and `background.js`:

| Key | Type | Default | Purpose |
|---|---|---|---|
| `xbBuddyKeywords` | `string[]` | `[]` | Positive keywords (glow) |
| `xbBuddyNegativeKeywords` | `string[]` | `[]` | Negative keywords (hide) |
| `xbBuddyEnabled` | `boolean` | `true` | Master pause/resume |
| `xbBuddyPositiveEnabled` | `boolean` | `true` | Positive highlighting on/off |
| `xbBuddyNegativeEnabled` | `boolean` | `true` | Negative filtering on/off |
| `xbBuddyGlowColor` | `string` | `#00ff41` | Highlight color (`#rrggbb`) |
| `xbBuddyTonePrompt_<id>` | `string` | `TONES[*].defaultPrompt` | Per-tone Magic Reply system prompt (`generic`, `agree`, `disagree`, `funny`, `informative`) |
| `xbBuddyLlmSettings` | `object` | `LLM_DEFAULTS` | Local LLM base URL, model, temperature, max tokens, timeout, thinking toggle, and optional API key |
| `xbBuddySettingsOpen` | `boolean` | `false` | Popup Settings section open state |
| `xbBuddyNotification` | `object` | absent | Transient context-menu toast (`keyword`, `listType`, `duplicate`, or `error`) |

## Code Conventions

- Use `const` / `let`, never `var`
- Async functions where storage/network is involved
- `DEBUG` flag in `content.js` toggles verbose console logging
- `shared.js` loads before `content.js` and `popup.js`, and via `importScripts('shared.js')` in the service worker. Tone IDs are stable: stored prompts and exported configs use them. LLM defaults, limits, and URL/settings normalization also live here so the popup and service worker cannot drift.
- Error states surface via `console.error` + `showToast()` in popup
- DOM dedup uses `WeakSet` + `data-xb-processed` / `data-magic-reply` attributes. The markers are verified against the live button before skipping, because X's React re-renders can remove injected nodes.
- Classic-UI DOM queries use `data-testid` selectors matching X's DOM conventions

## Key Technical Details

- **Tweet discovery**: `article[data-testid="tweet"]` via MutationObserver with 200ms cooldown. Relevance is checked against `MutationRecord.addedNodes` before scanning.
- **Keyword matching**: whole-word, case-insensitive regex with the `iu` flags. Regex special chars are escaped. The boundary is only added on a side that starts/ends with a word character, so `#AI`, `C++`, and `3.5` work while `ai` still does not match `rain`.
- **Negative filtering**: Matching posts get `.xb-hidden-post` (`display: none !important`) on the nearest `div[data-testid="cellInnerDiv"]` timeline row, falling back to the tweet article when the row contains a composer. A negative match wins over a positive glow. Negative matching only uses tweet body text, not the container-wide fallback that can include author names or UI labels.
- **Magic Reply injection**: Injects a `div.magic-reply-wrapper` containing `button.magic-reply-btn` near the send button in dialog and inline composers. Clicking the button opens the tone menu. Dialog detection uses `div[role="dialog"]` and `[data-testid="sheetDialog"]`.
- **Reply tones**: `shared.js` defines `TONES` (Generic, Agree, Disagree, Funny, Informative) and `TONE_PROMPT_PREFIX`. The popup edits `xbBuddyTonePrompt_<id>`; the content menu sends `toneId` with `xb:generate-reply`; `background.js` loads that prompt (or the built-in default) per request. Unknown tone IDs fall back to `generic`.
- **Tone menu**: a fixed-position `div.magic-reply-dropdown` is appended to `document.body` with one button per tone. It closes on selection, outside click, or Escape, repositions on scroll/resize, flips above the trigger near the viewport bottom, and is removed when the master toggle pauses.
- **Inline composer edge case**: On tweet detail pages, the composer is inline (not in a dialog). The tweet text lives ABOVE the composer in the DOM — `findTweetTextBefore()` picks the last `[data-testid="tweetText"]` that precedes the composer. The button is only injected on reply surfaces (`/status/`, `/compose/post`, or `in_reply_to=`), not the home timeline's "Post" box.
- **Text insertion**: X's composer is Draft.js, whose DOM is owned by React. `insertTextIntoReply()` dispatches a synthetic `paste` event (after focusing and selecting the draft) so Draft updates its own `EditorState` and enables the Reply button. Do NOT use `textContent`/`execCommand` on the Draft DOM — it desyncs React and throws `removeChild is not a child of this node`.
- **LLM**: `shared.js` defines `LLM_DEFAULTS`, `LLM_LIMITS`, `normalizeLlmBaseUrl()`, and `normalizeLlmSettings()`. The popup writes `xbBuddyLlmSettings`; `background.js` resolves and normalizes it on every request, so changes apply without a reload. Requests go to `${baseUrl}/v1/chat/completions`; model discovery uses `${baseUrl}/v1/models`. Only `localhost` and `127.0.0.1` URLs are accepted. Content-script requests to loopback are blocked by Chrome's Local Network Access policy; the service worker has the loopback host permission and is allowed. Response parsing handles `message.content`, `delta.content`, `reasoning_content`, and fallback fields. `chat_template_kwargs.enable_thinking = false` is sent only when the Disable model thinking setting is on (~10x faster replies on Gemma). The optional API key is sent as a Bearer token, kept in local storage, and excluded from exports.
- **Keyword changes**: `resetPostProcessing()` clears `data-xb-processed`, `.xb-glow-post`, and `.xb-hidden-post` before a rescan, so newly added keywords apply to already-rendered posts and removed keywords stop glowing or hiding. Changes are debounced through `scheduleReprocess()`.
- **Master toggle**: `disableExtension()` stops the observer and safety checks, clears every injected class/marker, closes the tone menu, and removes Magic Reply wrappers. `enableExtension()` reloads settings and rescans. All scan functions are guarded by `enabled`.
- **Popup lists**: five items per page, case-insensitive search, Clear All behind `confirm()`, and a 100-character limit. Duplicate or over-long adds flash feedback on the Add button; successful adds, clears, and toggle changes use the popup toast (`showToast(msg, 'error')` for failures).
- **Glow color**: `applyGlowColor()` converts the stored `#rrggbb` value into `--xb-glow-rgb` on `document.documentElement`. The CSS uses `rgba(var(--xb-glow-rgb, 0, 255, 65), …)`, so existing glowing posts recolor immediately without a rescan. Invalid values fall back to `#00ff41`.
- **Export/import**: version 2 configs are marked `app: 'xbuddy'` and carry both lists, all toggles, glow color, `tonePrompts`, and a non-secret `llm` object (base URL, model, temperature, max tokens, timeout, thinking toggle). The API key is never exported or imported. A versioned import replaces the present keys in one `chrome.storage.local.set`; version 1 files still import, and legacy files containing only `positive`/`negative` arrays merge additively. Other app markers, invalid JSON, and over-100-character keywords are rejected or skipped.
- **Context menus**: `background.js` creates positive/negative selection menus for x.com and twitter.com on install/startup. The click handler trims/collapses whitespace, strips leading `#`, rejects over-100 values, dedupes case-insensitively, and writes the list plus `xbBuddyNotification` in one `set`. The content script shows `showPageToast()` and clears the notification key; a pending notification is also consumed on page load.
- **Security**: CSP in manifest restricts to `script-src 'self'`. Only `storage` and `contextMenus` permissions are declared, plus host permissions for x.com/twitter.com and loopback (`http(s)://localhost/*`, `http(s)://127.0.0.1/*`, any port). LLM requests are restricted to loopback, and the optional API key stays in local storage and out of exports.
- **Error boundary**: Global `error` and `unhandledrejection` listeners catch + log exceptions.

### Key Selectors

| Selector | Purpose |
|---|---|
| `article[data-testid="tweet"]` | Primary tweet container |
| `[data-testid="tweetText"]` | Tweet body text |
| `[data-testid="reply"]` | Reply action button |
| `[data-testid="tweetButtonInline"]` | Send/Reply button |
| `div[role="dialog"]` | Modal reply dialog |
| `[data-testid="sheetDialog"]` | Bottom-sheet composer |
| `div[data-testid="cellInnerDiv"]` | Timeline row; negative-filter hide target |

## Development

1. Open `chrome://extensions`
2. Enable Developer mode
3. Click Load unpacked → select this directory
4. Navigate to `https://x.com`
5. Edit files → refresh extension → reload x.com

### Debugging

- Set `DEBUG = true` at the top of `content.js` for verbose console logging, then reload the extension. There is no runtime toggle wired up.
- X's React re-renders aggressively. `scanAllDialogs()` / `scanInlineComposers()` re-inject a removed button when the marker attribute survived; if the button still disappears, check the composer selectors.
- If the tone menu does not open, confirm `shared.js` is listed before `content.js` in the manifest and reload the extension.
- CSS selectors in `POST_SELECTORS` / `DIALOG_SELECTORS` break when X changes their DOM — most common maint issue. X's new (2026) logged-in UI removes `data-testid` entirely; the classic selectors do not match it.

## Common Tasks

- **Add tweet selector**: Add to `POST_SELECTORS` array in `content.js`
- **Change glow style**: Edit `.xb-glow-post` / `@keyframes xb-glow-pulse` in `styles.css`; the user-facing default is `DEFAULT_GLOW_COLOR` in `content.js` and the color input in `popup.html`
- **Change hidden style**: Edit `.xb-hidden-post` in `styles.css`; the hide target is chosen by `getHideTarget()` in `content.js`
- **Add or change a keyword list**: Add the storage key in `content.js`, `popup.js`, and `background.js`, then wire a popup section and a content-script scan branch
- **Change context menu labels**: Edit the titles in `setupContextMenus()` in `background.js`; menus are recreated on install/startup
- **Change a default tone prompt**: Edit the matching `defaultPrompt` in `TONES` in `shared.js`. Saved prompts override the default until the user clicks Restore Default.
- **Add a reply tone**: Add an entry to `TONES` in `shared.js`. The popup selector, tone editor, Magic Reply menu, and background all read from that array; no other list to update.
- **Change tone menu labels**: Edit the `label` fields in `TONES` in `shared.js`.
- **Change default LLM endpoint/model**: Edit `LLM_DEFAULTS` in `shared.js`; users override the URL and model in Settings.
- **Change LLM validation limits**: Edit `LLM_LIMITS` in `shared.js`; the popup and background both read them.
- **Add permission**: Edit `permissions` / `host_permissions` in `manifest.json`
