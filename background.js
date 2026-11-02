// ===== X Buddy — Background Service Worker =====
// The LLM request must happen here, not in the content script.
// Chrome now blocks page-origin requests from x.com to loopback (localhost)
// via Local Network Access. Extension pages/service workers with the
// localhost host permission are allowed to make the request.

const LLM_URL = 'http://localhost:8080/v1/chat/completions';
const LLM_MODELS_URL = 'http://localhost:8080/v1/models';
const LLM_MODEL = 'gemma-4-E4B-it-QAT-Q4_0.gguf';
const REQUEST_TIMEOUT_MS = 60000;

const SYSTEM_PROMPT = [
  'You write replies on X (Twitter) as a real person.',
  'Reply to the post below with exactly ONE short, natural reply, under 2 sentences.',
  'Output only the reply text: no options, no numbered lists, no quotation marks, no preamble, no explanation, no hashtags, and no emojis.',
  'Be specific to the post. Never mention being an AI or an assistant.',
].join(' ');

function cleanReply(text) {
  let out = String(text || '').trim();
  out = out.replace(/^```[a-z]*\s*/i, '').replace(/```\s*$/i, '').trim();
  out = out.replace(/^(?:reply|response)\s*:\s*/i, '').trim();
  out = out.replace(/^["“”'](.*)["“”']$/s, '$1').trim();
  return out;
}

async function generateReply(postText) {
  const post = String(postText || '').trim().slice(0, 6000);
  if (!post) throw new Error('No post text to reply to');

  const body = JSON.stringify({
    model: LLM_MODEL,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: `Write a reply to this post:\n\n${post}` },
    ],
    temperature: 0.7,
    max_tokens: 250,
    // Gemma 4 is a reasoning model. Thinking tokens add ~5s of latency and
    // occasionally leave the model with a reasoning-only completion; this
    // server (llama.cpp) honours the standard chat-template switch.
    chat_template_kwargs: { enable_thinking: false },
  });

  const resp = await fetch(LLM_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!resp.ok) throw new Error(`LLM returned HTTP ${resp.status}`);

  const data = await resp.json();
  const choice = data?.choices?.[0];

  // OpenAI-compatible response format
  const content = choice?.message?.content ?? choice?.delta?.content ?? data?.content ?? data?.response;
  if (typeof content === 'string' && content.trim()) {
    const reply = cleanReply(content);
    if (reply) return reply;
  }

  // Reasoning-only completion — never inject chain-of-thought into the composer.
  if (choice?.message?.reasoning_content) {
    throw new Error('Model returned reasoning only — try again');
  }

  throw new Error('Unexpected LLM response');
}

async function checkLlmStatus() {
  const resp = await fetch(LLM_MODELS_URL, {
    method: 'GET',
    signal: AbortSignal.timeout(4000),
  });
  return resp.ok;
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'xb:generate-reply') {
    generateReply(message.postText)
      .then((reply) => sendResponse({ ok: true, reply }))
      .catch((err) => sendResponse({ ok: false, error: err?.message || 'LLM request failed' }));
    return true; // async response
  }

  if (message?.type === 'xb:llm-status') {
    checkLlmStatus()
      .then((ok) => sendResponse({ ok }))
      .catch(() => sendResponse({ ok: false }));
    return true;
  }

  return false;
});
