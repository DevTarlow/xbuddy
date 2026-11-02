// ===== X Buddy — Popup Script =====

const STORAGE_KEY = 'xbBuddyKeywords';

// --- DOM refs ---
const keywordInput = document.getElementById('keyword-input');
const addBtn = document.getElementById('add-btn');
const keywordList = document.getElementById('keyword-list');
const emptyState = document.getElementById('empty-state');
const llmDot = document.getElementById('llm-dot');
const llmLabel = document.getElementById('llm-label');

// --- State ---
let keywords = [];
let toastTimer = null;

// --- Toast ---
function showToast(msg) {
  if (toastTimer) clearTimeout(toastTimer);
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('visible');
  toastTimer = setTimeout(() => {
    el.classList.remove('visible');
    toastTimer = null;
  }, 2500);
}

// --- Storage helpers ---
async function loadKeywords() {
  try {
    const result = await chrome.storage.local.get(STORAGE_KEY);
    keywords = result[STORAGE_KEY] || [];
  } catch (e) {
    console.error('[X Buddy] Failed to load keywords:', e);
    showToast('Failed to load keywords');
    keywords = [];
  }
}

async function saveKeywords() {
  try {
    await chrome.storage.local.set({ [STORAGE_KEY]: keywords });
  } catch (e) {
    console.error('[X Buddy] Failed to save keywords:', e);
    showToast('Failed to save keywords');
  }
}

// --- Rendering ---
function renderKeywords() {
  keywordList.innerHTML = '';

  if (keywords.length === 0) {
    emptyState.style.display = 'block';
    return;
  }

  emptyState.style.display = 'none';

  keywords.forEach((kw, index) => {
    const li = document.createElement('li');
    li.className = 'keyword-item';

    const span = document.createElement('span');
    span.className = 'keyword-text';
    span.textContent = kw;

    const delBtn = document.createElement('button');
    delBtn.className = 'delete-btn';
    delBtn.textContent = '×';
    delBtn.title = `Remove "${kw}"`;
    delBtn.addEventListener('click', async () => {
      keywords.splice(index, 1);
      await saveKeywords();
      renderKeywords();
    });

    li.appendChild(span);
    li.appendChild(delBtn);
    keywordList.appendChild(li);
  });
}

// --- Add keyword ---
async function addKeyword() {
  const raw = keywordInput.value.trim();
  if (!raw) return;

  // Case-insensitive dedup check
  const lowerRaw = raw.toLowerCase();
  const alreadyExists = keywords.some(kw => kw.toLowerCase() === lowerRaw);
  if (alreadyExists) {
    keywordInput.value = '';
    return;
  }

  keywords.push(raw);
  await saveKeywords();
  renderKeywords();
  keywordInput.value = '';
  keywordInput.focus();
}

// --- LLM connection check ---
async function checkLlmStatus() {
  try {
    // Route the health check through the same background path Magic Reply uses,
    // so the popup cannot report "Connected" while replies are blocked.
    const resp = await chrome.runtime.sendMessage({ type: 'xb:llm-status' });
    if (resp && resp.ok) {
      llmDot.className = 'dot connected';
      llmLabel.textContent = '● Connected';
    } else {
      llmDot.className = 'dot offline';
      llmLabel.textContent = '○ Offline';
    }
  } catch {
    llmDot.className = 'dot offline';
    llmLabel.textContent = '○ Offline';
  }
}

// --- Event listeners ---
addBtn.addEventListener('click', addKeyword);

keywordInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') addKeyword();
});

// --- Init ---
(async function init() {
  await loadKeywords();
  renderKeywords();
  checkLlmStatus();
})();
