// frontend/app.js
// Trie-based autocomplete with Tab-to-accept + citations from backend
// System-wide Researcher / Beginner mode controller
// NO feature removal — fully backward compatible

const BASE_API = 'https://scholarsearch-backend.onrender.com';
const API_ALL = BASE_API + '/api/all';
const API_SEARCH = BASE_API + '/api/search';
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
    .suggestions-panel{
    position:absolute;
    left:50%;
    transform:translateX(-50%);
    width:min(620px,calc(100% - 32px));
    background:(#fff);
    border-radius:14px;
    box-shadow:0 30px 70px rgba(42, 77, 174, 0.22);
    display:none;
    z-index:50;
    max-height:320px;
    overflow:auto;
    margin-top:14px;
    padding:8px 0;
  }

    .suggestion-item{padding:12px 16px;cursor:pointer;font-size:14px}
    .suggestion-item:hover{background:#f3f4f6}
    .primary{font-weight:600}
    .meta{font-size:12px;color:#6b7280;margin-top:4px}
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

/* ================= Load Data ================= */

async function loadAllTermsAndBuildTrie() {
  let papers = [];

  try {
    const res = await fetch(API_ALL);
    if (res.ok) papers = await res.json();
  } catch {}

  if (!papers.length) {
    for (const p of FALLBACK_PAPERS) {
      try {
        const r = await fetch(p);
        if (r.ok) {
          papers = await r.json();
          break;
        }
      } catch {}
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

    if (p.title) {
      p.title.split(/\s+/).forEach(tok => {
        const l = tok.toLowerCase();
        trie.insert(tok);
        displayMap[l] = tok;
        citationsMap[l] = Math.max(citationsMap[l] || 0, cite);
      });
    }
  }
}

/* ================= Suggestions ================= */

function clearSuggestions() {
  if (!suggestionsEl) return;
  suggestionsEl.innerHTML = '';
  suggestionsEl.style.display = 'none';
}

function renderSuggestions(prefix) {
  if (!suggestionsEl) return;

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

  list.forEach(s => {
    const div = document.createElement('div');
    div.className = 'suggestion-item';
    div.innerHTML = `
      <div class="primary">${escapeHtml(s.term)}</div>
      <div class="meta">Citations: ${s.citations}</div>
    `;
    div.onpointerdown = e => {
      e.preventDefault();
      inputEl.value = s.term;
      clearSuggestions();
    };
    suggestionsEl.appendChild(div);
  });
}

/* ================= Search ================= */

function doSearch() {
  const q = inputEl.value.trim();
  if (!q) return;
  window.location.href = '/results.html?q=' + encodeURIComponent(q);
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
  });

  inputEl.addEventListener('blur', () => {
    document.querySelector('.search-card')?.classList.remove('search-active');
    setTimeout(clearSuggestions, 150);
  });

  inputEl.addEventListener('keydown', e => {
    if (e.key === 'Enter') doSearch();
    if (e.key === 'Escape') clearSuggestions();
  });
}

if (searchBtn) {
  searchBtn.addEventListener('click', doSearch);
}

/* ================= Init ================= */

(async function init() {
  await loadAllTermsAndBuildTrie();
})();
