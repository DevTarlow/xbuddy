# X Buddy

Chrome Manifest V3 extension that enhances X/Twitter with keyword highlighting and AI-powered replies via a local LLM.

## Commands

No build step, no package manager, no tests. Pure vanilla JS.

- `chrome://extensions` → Load unpacked → select this directory

## Development Workflow

We work one task at a time. The flow is:

1. Make the change.
2. Test it manually in Chrome (see the checklist below).
3. Update the docs if behavior, setup, or selectors changed.
4. Commit when the task is done.
5. **Push only when the user asks.** A finished commit is not a request to push.

### Commits

- Commit after each completed task, even if the next task is related. Small, working commits are easier to review and roll back.
- Before staging, run `git status` and check that only intended files are included.
- Use an imperative subject line, for example `Fix Magic Reply LLM proxy` or `Add keyword re-scan`.
- Add a short body when the reason is not obvious. Explain the "why", not the diff.
- Never commit secrets or local-only files: `.env`, tokens, API keys, browser profiles, Chrome extension signing keys (`.pem`, `.crx`), logs, `node_modules/`, or test scaffolding.
- The repository is `main` only for now. Do not create release branches without being asked.

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
- Magic Reply appears in a reply dialog and on a post detail page, but not in the home "Post" box.
- Magic Reply fills the composer, the send button enables, and an existing draft is replaced rather than appended.
- The popup shows the real LLM status.
- No new errors in the x.com console or the service worker console.

## Architecture

```
manifest.json          — MV3 manifest
popup.html             — Popup UI (320px, dark theme)
popup.js               — Popup logic: keyword CRUD, LLM connection check
content.js             — Content script injected into x.com
background.js          — Service worker: local LLM request + health check
styles.css             — Content script styles (glow + magic reply button)
icons/                 — Extension icons (16, 48, 128 PNG)
```

## Code Conventions

- Use `const` / `let`, never `var`
- Async functions where storage/network is involved
- `DEBUG` flag in `content.js` toggles verbose console logging
- Error states surface via `console.error` + `showToast()` in popup
- DOM dedup uses `WeakSet` + `data-xb-processed` / `data-magic-reply` attributes. The markers are verified against the live button before skipping, because X's React re-renders can remove injected nodes.
- Classic-UI DOM queries use `data-testid` selectors matching X's DOM conventions

## Key Technical Details

- **Tweet discovery**: `article[data-testid="tweet"]` via MutationObserver with 200ms cooldown. Relevance is checked against `MutationRecord.addedNodes` before scanning.
- **Keyword matching**: `\b...\b` regex with `iu` flag — whole-word, case-insensitive, Unicode-aware. Regex special chars escaped.
- **Magic Reply injection**: Injects a `button.magic-reply-btn` near the send button in dialog and inline composers. Dialog detection uses `div[role="dialog"]` and `[data-testid="sheetDialog"]`.
- **Inline composer edge case**: On tweet detail pages, the composer is inline (not in a dialog). The tweet text lives ABOVE the composer in the DOM — `findTweetTextBefore()` picks the last `[data-testid="tweetText"]` that precedes the composer. The button is only injected on reply surfaces (`/status/`, `/compose/post`, or `in_reply_to=`), not the home timeline's "Post" box.
- **Text insertion**: X's composer is Draft.js, whose DOM is owned by React. `insertTextIntoReply()` dispatches a synthetic `paste` event (after focusing and selecting the draft) so Draft updates its own `EditorState` and enables the Reply button. Do NOT use `textContent`/`execCommand` on the Draft DOM — it desyncs React and throws `removeChild is not a child of this node`.
- **LLM**: OpenAI-compatible endpoint at `http://localhost:8080` (model `gemma-4-E4B-it-QAT-Q4_0.gguf`), called from `background.js`. Content-script requests to loopback are blocked by Chrome's Local Network Access policy; the service worker has the `localhost` host permission and is allowed. Response parsing handles `message.content`, `delta.content`, `reasoning_content`, and fallback fields. `chat_template_kwargs.enable_thinking = false` disables Gemma's reasoning tokens (~10x faster replies).
- **Keyword changes**: `resetPostProcessing()` clears `data-xb-processed` and `.xb-glow-post` before a rescan, so newly added keywords apply to already-rendered posts and removed keywords stop glowing.
- **Security**: CSP in manifest restricts to `script-src 'self'`. Only `storage` permission is declared, plus host permissions for x.com/twitter.com and `localhost:8080`.
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

## Development

1. Open `chrome://extensions`
2. Enable Developer mode
3. Click Load unpacked → select this directory
4. Navigate to `https://x.com`
5. Edit files → refresh extension → reload x.com

### Debugging

- `localStorage.setItem('xbDebug', 'true')` at runtime or set `DEBUG = true` in `content.js`
- X's React re-renders aggressively. `scanAllDialogs()` / `scanInlineComposers()` re-inject a removed button when the marker attribute survived; if the button still disappears, check the composer selectors.
- CSS selectors in `POST_SELECTORS` / `DIALOG_SELECTORS` break when X changes their DOM — most common maint issue. X's new (2026) logged-in UI removes `data-testid` entirely; the classic selectors do not match it.

## Common Tasks

- **Add tweet selector**: Add to `POST_SELECTORS` array in `content.js`
- **Change glow style**: Edit `.xb-glow-post` / `@keyframes xb-glow-pulse` in `styles.css`
- **Change LLM prompt**: Edit `SYSTEM_PROMPT` in `background.js`
- **Change LLM endpoint/model**: Update `LLM_URL` / `LLM_MODELS_URL` / `LLM_MODEL` in `background.js`
- **Add permission**: Edit `permissions` / `host_permissions` in `manifest.json`
