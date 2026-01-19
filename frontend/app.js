// frontend/app.js
// Trie-based autocomplete with Tab-to-accept + citations from backend
// System-wide Researcher / Beginner mode controller
// NO feature removal — fully backward compatible

const API_ALL = '/api/all';
const API_SEARCH = '/api/search';
const FALLBACK_PAPERS = ['/papers', 'backend/papers.json', 'papers.json'];

/* ================= Utilities ================= */

function debounce(fn, wait = 160) {
  let t;
  return function (...args) {
    clearTimeout(t);
    t = setTimeout(() => fn.apply(this, args), wait);
  };
}

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function getQueryParam(name) {
  return new URLSearchParams(window.location.search).get(name) || '';
}

/* ================= Researcher Mode (GLOBAL) ================= */

function setMode(mode) {
  document.body.setAttribute('data-mode', mode);
  localStorage.setItem('researcher_mode', mode);

  document
    .getElementById('mode-beginner')
    ?.classList.toggle('active', mode === 'beginner');

  document
    .getElementById('mode-researcher')
    ?.classList.toggle('active', mode === 'researcher');

  // ---- Hero subtitle reaction ----
  const subtitle = document.getElementById('hero-subtitle');
  if (subtitle) {
    subtitle.innerText =
      mode === 'researcher'
        ? 'Deterministic ranking using citation influence and reference overlap.'
        : 'Ranked by query relevance and citations — easy to explore.';
  }

  // ---- Search input intent ----
  const input = document.getElementById('query');
  if (input) {
    input.placeholder =
      mode === 'researcher'
        ? 'Search by concept, method, or cited work…'
        : 'Search by keyword (e.g., machine learning, transformers)…';
  }

  // ---- System status micro-feedback ----
  const status = document.getElementById('system-status');
  if (status) {
    status.innerHTML =
      mode === 'researcher'
        ? '<strong>System status:</strong> Citation graph weighted • Reference overlap active • Deterministic ranking enforced'
        : '<strong>System status:</strong> Dataset indexed • Citation counts enabled • Easy relevance ranking';
  }
}

/* ================= Init mode early ================= */

(function initMode() {
  const saved = localStorage.getItem('researcher_mode') || 'beginner';
  setMode(saved);

  document
    .getElementById('mode-beginner')
    ?.addEventListener('click', () => setMode('beginner'));

  document
    .getElementById('mode-researcher')
    ?.addEventListener('click', () => setMode('researcher'));
})();

/* ================= Trie implementation ================= */

class TrieNode {
  constructor() {
    this.children = Object.create(null);
    this.isWord = false;
  }
}

class Trie {
  constructor() {
    this.root = new TrieNode();
  }

  insert(word) {
    if (!word) return;
    let node = this.root;
    for (const ch of word.toLowerCase()) {
      if (!node.children[ch]) node.children[ch] = new TrieNode();
      node = node.children[ch];
    }
    node.isWord = true;
  }

  _getNode(prefix) {
    let node = this.root;
    for (const ch of prefix) {
      if (!node.children[ch]) return null;
      node = node.children[ch];
    }
    return node;
  }

  _collect(node, prefix, results, limit) {
    if (!node || results.length >= limit) return;
    if (node.isWord) results.push(prefix);
    for (const k of Object.keys(node.children).sort()) {
      if (results.length >= limit) break;
      this._collect(node.children[k], prefix + k, results, limit);
    }
  }

  suggestions(prefix, limit = 10) {
    const node = this._getNode(prefix.toLowerCase());
    const out = [];
    if (node) this._collect(node, prefix.toLowerCase(), out, limit);
    return out;
  }
}


/* ================= Autocomplete UI ================= */

function createSuggestionsContainer() {
  const card = document.querySelector('.search-card');
  if (!card) return null;

  let el = document.getElementById('suggestions');
  if (!el) {
    el = document.createElement('div');
    el.id = 'suggestions';
    el.className = 'suggestions-panel';
    // Ensure relative positioning for absolute child
    if (getComputedStyle(card).position === 'static') {
      card.style.position = 'relative';
    }
    card.appendChild(el);
  }
  return el;
}

/* ================= Inject styles (safe) ================= */

(function ensureStyles() {
  if (document.getElementById('autocomplete-styles')) return;
  const style = document.createElement('style');
  style.id = 'autocomplete-styles';
  style.textContent = `
    .suggestions-panel {
      position: absolute;
      left: 0;
      right: 0;
      width: 100%;
      background: var(--paper, #fff);
      border: 2px solid var(--ink, #000); /* Newspaper style */
      border-top: none;
      box-shadow: 4px 4px 0 var(--ink, #000);
      display: none;
      z-index: 999;
      max-height: 320px;
      overflow: auto;
      margin-top: 4px;
      padding: 0;
    }
    .suggestion-item {
      padding: 10px 16px;
      cursor: pointer;
      font-size: 14px;
      font-family: 'Lora', serif;
      border-bottom: 1px dotted var(--muted, #ccc);
      transition: background 0.1s;
    }
    .suggestion-item:last-child { border-bottom: none; }
    .suggestion-item:hover, .suggestion-item.selected {
      background: var(--ink, #000);
      color: var(--bg, #fff);
    }
    .suggestion-item:hover .meta, .suggestion-item.selected .meta {
      color: #ccc;
    }
    .primary { font-weight: 600; }
    .meta { font-size: 11px; color: var(--muted, #666); font-family: 'Oswald', sans-serif; text-transform: uppercase; margin-top: 2px; }
  `;
  document.head.appendChild(style);
})();

/* ================= Main State ================= */

const inputEl = document.getElementById('query');
const searchBtn = document.getElementById('searchBtn');
const suggestionsEl = createSuggestionsContainer();

let trie = new Trie();
const displayMap = {};
const citationsMap = {};
let currentSelectionIndex = -1; // Track keyboard selection

/* ================= Load Data ================= */

async function loadAllTermsAndBuildTrie() {
  let papers = [];

  try {
    const res = await fetch(API_ALL);
    if (res.ok) papers = await res.json();
  } catch { }

  if (!papers.length) {
    for (const p of FALLBACK_PAPERS) {
      try {
        const r = await fetch(p);
        if (r.ok) {
          papers = await r.json();
          break;
        }
      } catch { }
    }
  }

  if (!papers.length) return;

  for (const p of papers) {
    const cite = Number(p.citations_count || 0);

    (p.keywords || []).forEach(k => {
      const t = k?.trim();
      if (!t) return;
      const l = t.toLowerCase();
      trie.insert(t);
      displayMap[l] = t;
      citationsMap[l] = Math.max(citationsMap[l] || 0, cite);
    });

    /* 
    if (p.title) {
       p.title.split(/\s+/).forEach(tok => {
         const l = tok.toLowerCase();
         if (l.length > 3) {
           trie.insert(tok);
           displayMap[l] = tok;
           citationsMap[l] = Math.max(citationsMap[l] || 0, cite);
         }
       });
    }
    */
  }
}

/* ================= Suggestions ================= */

function clearSuggestions() {
  if (!suggestionsEl) return;
  suggestionsEl.innerHTML = '';
  suggestionsEl.style.display = 'none';
  currentSelectionIndex = -1;
}

function renderSuggestions(prefix) {
  if (!suggestionsEl) return;
  currentSelectionIndex = -1;

  const list = trie
    .suggestions(prefix, 8)
    .map(k => ({
      key: k,
      term: displayMap[k] || k,
      citations: citationsMap[k] || 0
    }))
    .sort((a, b) => b.citations - a.citations);

  if (!list.length) return clearSuggestions();

  suggestionsEl.innerHTML = '';
  suggestionsEl.style.display = 'block';

  list.forEach((s, idx) => {
    const div = document.createElement('div');
    div.className = 'suggestion-item';
    div.setAttribute('data-term', s.term); // Store term for keyboard retrieval
    div.setAttribute('data-index', idx);
    div.innerHTML = `
      <div class="primary">${escapeHtml(s.term)}</div>
      <div class="meta">Citations: ${s.citations}</div>
    `;
    div.onpointerdown = e => {
      e.preventDefault();
      inputEl.value = s.term;
      clearSuggestions();
      doSearch(); // Auto search on click? Maybe just fill. Let's strictly just fill as before or better? The user didn't ask to auto search. Let's just fill.
    };
    suggestionsEl.appendChild(div);
  });
}

function updateSelection() {
  const items = suggestionsEl.querySelectorAll('.suggestion-item');
  items.forEach((item, idx) => {
    if (idx === currentSelectionIndex) {
      item.classList.add('selected');
      item.scrollIntoView({ block: 'nearest' });
    } else {
      item.classList.remove('selected');
    }
  });
}

/* ================= Search ================= */

function doSearch() {
  const q = inputEl.value.trim();
  if (!q) return;
  window.location.href = 'results.html?q=' + encodeURIComponent(q);
}

/* ================= Events ================= */

if (inputEl) {
  inputEl.addEventListener(
    'input',
    debounce(() => {
      const q = inputEl.value.trim();
      if (!q) return clearSuggestions();
      renderSuggestions(q);
    }, 120)
  );

  // SEARCH DOMINANCE FEEDBACK
  inputEl.addEventListener('focus', () => {
    document.querySelector('.search-card')?.classList.add('search-active');
    // If there is text, maybe show suggestions again?
    if (inputEl.value.trim().length > 0) renderSuggestions(inputEl.value.trim());
  });

  inputEl.addEventListener('blur', () => {
    document.querySelector('.search-card')?.classList.remove('search-active');
    setTimeout(clearSuggestions, 200); // 200ms to allow click to register
  });

  inputEl.addEventListener('keydown', e => {
    const items = suggestionsEl ? suggestionsEl.querySelectorAll('.suggestion-item') : [];

    if (e.key === 'ArrowDown') {
      if (suggestionsEl.style.display !== 'none' && items.length > 0) {
        e.preventDefault();
        currentSelectionIndex++;
        if (currentSelectionIndex >= items.length) currentSelectionIndex = 0;
        updateSelection();
      }
    } else if (e.key === 'ArrowUp') {
      if (suggestionsEl.style.display !== 'none' && items.length > 0) {
        e.preventDefault();
        currentSelectionIndex--;
        if (currentSelectionIndex < 0) currentSelectionIndex = items.length - 1;
        updateSelection();
      }
    } else if (e.key === 'Enter') {
      if (currentSelectionIndex > -1 && suggestionsEl.style.display !== 'none') {
        e.preventDefault();
        const selectedItem = items[currentSelectionIndex];
        if (selectedItem) {
          inputEl.value = selectedItem.getAttribute('data-term');
          clearSuggestions();
          // Optional: trigger search immediately? User said "select trie keywords", usually implies selection.
          // I'll leave it as just selection to be safe, but usually Enter on a selection means "pick this".
        }
      } else {
        doSearch();
      }
    } else if (e.key === 'Escape') {
      clearSuggestions();
    }
  });
}

if (searchBtn) {
  searchBtn.addEventListener('click', doSearch);
}

/* ================= Init ================= */

(async function init() {
  await loadAllTermsAndBuildTrie();
})();
