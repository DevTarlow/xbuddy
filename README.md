<p align="center">
  <img src="icons/icon128.png" width="96" alt="X Buddy icon" />
</p>

<h1 align="center">X Buddy</h1>

<p align="center">Keyword highlights and AI reply drafts for X, powered by a model running on your own machine.</p>

> **X Buddy is still under development.** It works, but it is rough around the edges and X changes their site a lot. Expect a broken selector now and then. If something stops working, open an issue and include what you see.

## What it does

- **Keyword glow.** Add words you care about and matching posts in your timeline get a green glow. Useful when you want to spot a topic without reading every post.
- **Negative keywords.** Add words you never want to see and matching posts are hidden from the timeline. Turn the whole list off whenever you want it back.
- **Toggles.** A master switch pauses everything without losing your settings, and separate switches control positive highlighting and negative filtering.
- **List controls.** Search either list, page through long lists, and clear a list in one click. Duplicate and over-long keywords are rejected with feedback.
- **Glow color.** Pick any highlight color in Settings instead of the default green.
- **Backup.** Export keywords, toggles, and glow color to a JSON file, and import them on another browser.
- **Right-click capture.** Select a word or hashtag on X and add it to either list from the context menu, with a toast confirming the add.
- **Magic Reply.** Open a reply and click the Magic Reply button. Your local model writes a draft straight into the composer. You can edit it before posting.
- **Stays local.** No accounts, no API keys, no tracking. Your keywords and posts go to the model on your computer and nowhere else.

## What you need

- Chrome or another Chromium browser (tested on Chrome 156)
- A local OpenAI-compatible server running at `http://localhost:8080`
- A model the server can load. The extension is built and tuned around `gemma-4-E4B-it-QAT-Q4_0.gguf`, but other chat models should work.

The model is not bundled. You need to run the server yourself.

### Starting a server

With llama.cpp:

```bash
llama-server -m path/to/gemma-4-E4B-it-QAT-Q4_0.gguf --port 8080
```

With LM Studio, start the local server on port `8080` and load the model there.

If your server uses a different port or model name, edit `LLM_URL` / `LLM_MODEL` in `background.js` for now. A settings page is on the roadmap.

## Install

X Buddy is not on the Chrome Web Store yet, so you load it unpacked.

1. Open `chrome://extensions`
2. Turn on **Developer mode** in the top right
3. Click **Load unpacked**
4. Pick the `x-buddy` folder
5. Open `https://x.com`

Pin the extension to your toolbar so the popup is easy to reach.

## Use it

### Highlight keywords

1. Click the X Buddy icon
2. Type a keyword and press **Add**
3. Matching posts glow green as you scroll

Posts already on the page update too, so you do not need to reload.

### Hide posts you do not want

1. Click the X Buddy icon
2. Under **Negative Keywords**, type a word and press **Add**
3. Posts matching that word disappear from the timeline

The helper text under the section says it plainly: **Posts matching these keywords are hidden.** Remove the word, or flip the negative toggle off, and the posts come back. Positive and negative keywords both match whole words only, so `ai` will not match `rain`.

Each list has its own search box, five-item pages, and a **Clear All** button. Keywords are capped at 100 characters and duplicates are rejected regardless of case.

### Pause everything

The toggle next to the X Buddy title is the master switch. Turning it off removes highlighting, hidden posts, and Magic Reply buttons without deleting any settings. Turn it back on to restore them.

### Pick a glow color

1. Click the X Buddy icon
2. Expand **Settings**
3. Choose a color, then click **Save**

Matching posts use the new color immediately, and the choice survives reloads.

### Back up your settings

1. Click the X Buddy icon and expand **Settings**
2. Click **Export All** to download `xbuddy-config.json`
3. On another browser, click **Import** and pick that file

A full config restore replaces the current keyword lists, toggles, and glow color. Older files that contain only `positive` and/or `negative` arrays are merged into the current lists instead of replacing them.

### Add a keyword from the page

1. Select a word or phrase on X
2. Right-click and choose **Add "..." to Positive Keywords** or **Add "..." to Negative Keywords**
3. A toast confirms the add, and the popup list updates

Right-clicking a hashtag selects it for you. A leading `#` is stripped, so adding `#AI` stores `AI` and matches both hashtag and plain mentions.

### Draft a reply

1. Open a post's reply dialog, or open the post detail page
2. Click **✨ Magic Reply** next to the send button
3. Wait a moment while your model writes
4. Edit the draft if you want, then post it

The reply goes into the composer, not straight to X. You always get the final say.

## Troubleshooting

| What you see | What to try |
|---|---|
| `Failed — Failed to fetch` | Make sure your LLM server is running on port 8080. Then reload the extension in `chrome://extensions` and refresh x.com. |
| `Background unavailable — reload the extension` | The extension was reloaded while the tab stayed open. Refresh x.com. |
| Popup says **Offline** | The server is not reachable at `http://localhost:8080`. Start it, then reopen the popup. |
| No green glow | Check that the keyword is in the positive list and the positive toggle is on. Keywords match whole words only, so `ai` will not match `rain`. |
| A post I want to read is hidden | Check the negative list and the negative toggle. A negative keyword wins over a positive glow. Remove the word, or turn negative filtering off, to bring the post back. |
| A negative keyword is not hiding anything | Check that the negative toggle is on. Matching is whole-word, so `crypto` does not match `cryptocurrency`; add the longer form as its own keyword. A post whose text has not fully loaded, or is still collapsed behind **Show more**, may only be evaluated once. |
| Magic Reply button is missing | X may have switched your account to their new web layout. This version supports the classic layout. See the status below. |
| Right-click menu is missing | Reload the extension at `chrome://extensions`. Chrome creates the menus on install and startup, so a fresh reload or browser restart picks them up. |

## Status

X Buddy is an early build. What is done and what is next:

- [x] Keyword highlighting
- [x] Negative keyword filtering
- [x] Master, positive, and negative toggles
- [x] Keyword search, pagination, and clear-all controls
- [x] Configurable glow color
- [x] Full-config export/import
- [x] Right-click keyword capture
- [x] Magic Reply with a local model
- [ ] Support X's new web layout
- [ ] Settings page for the server URL and model
- [ ] Chrome Web Store release

X started testing a new web layout for logged-in users in late 2026. It removes most of the hooks this extension uses, so the classic layout is the supported one for now. If your X looks different and nothing shows up, that is why.

## Privacy

- The extension asks for `storage` so it can remember your keywords, and `contextMenus` so you can right-click text to add it to a list.
- It can talk to `x.com`, `twitter.com`, and `localhost:8080`. That is it.
- Your keyword list lives in Chrome's local storage.
- Posts are sent to your own model server. Nothing is sent to us, and there is no analytics or remote code.

## Contributing

Issues and pull requests are welcome. If you are changing the extension itself, read `AGENTS.md` first. It covers the project layout, the current selectors, and the development workflow.

Small ask: keep pull requests focused. One fix or feature per PR makes review a lot easier.

## License

MIT. See `LICENSE`.

X Buddy is an unofficial project and is not affiliated with X Corp.
