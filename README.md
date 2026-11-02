<p align="center">
  <img src="icons/icon128.png" width="96" alt="X Buddy icon" />
</p>

<h1 align="center">X Buddy</h1>

<p align="center">Keyword highlights and AI reply drafts for X, powered by a model running on your own machine.</p>

> **X Buddy is still under development.** It works, but it is rough around the edges and X changes their site a lot. Expect a broken selector now and then. If something stops working, open an issue and include what you see.

## What it does

- **Keyword glow.** Add words you care about and matching posts in your timeline get a green glow. Useful when you want to spot a topic without reading every post.
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
| No green glow | Check that the keyword is in the popup list. Keywords match whole words only, so `ai` will not match `rain`. |
| Magic Reply button is missing | X may have switched your account to their new web layout. This version supports the classic layout. See the status below. |

## Status

X Buddy is an early build. What is done and what is next:

- [x] Keyword highlighting
- [x] Magic Reply with a local model
- [ ] Support X's new web layout
- [ ] Settings page for the server URL and model
- [ ] Chrome Web Store release

X started testing a new web layout for logged-in users in late 2026. It removes most of the hooks this extension uses, so the classic layout is the supported one for now. If your X looks different and nothing shows up, that is why.

## Privacy

- The extension asks for `storage` so it can remember your keywords.
- It can talk to `x.com`, `twitter.com`, and `localhost:8080`. That is it.
- Your keyword list lives in Chrome's local storage.
- Posts are sent to your own model server. Nothing is sent to us, and there is no analytics or remote code.

## Contributing

Issues and pull requests are welcome. If you are changing the extension itself, read `AGENTS.md` first. It covers the project layout, the current selectors, and the development workflow.

Small ask: keep pull requests focused. One fix or feature per PR makes review a lot easier.

## License

MIT. See `LICENSE`.

X Buddy is an unofficial project and is not affiliated with X Corp.
