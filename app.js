// frontend/app.js
// Trie-based autocomplete with Tab-to-accept + citations from backend
// Updated: runs search and renders on results page or redirects to results.html

const API_ALL = '/api/all';    // endpoint returning full array of papers
const API_SEARCH = '/api/search';
const FALLBACK_PAPERS = ['/papers', 'backend/papers.json', 'papers.json'];

// ----------------- Utilities -----------------
function debounce(fn, wait = 160) {
  let t;
  return function (...args) {
    clearTimeout(t);
    t = setTimeout(() => fn.apply(this, args), wait);
  };
}

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

function getQueryParam(name) {
  const params = new URLSearchParams(window.location.search);
  return params.get(name) || '';
}

// ----------------- Trie implementation -----------------
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
    const s = word.toLowerCase();
    let node = this.root;
    for (const ch of s) {
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
    const keys = Object.keys(node.children).sort();
    for (const k of keys) {
      if (results.length >= limit) break;
      this._collect(node.children[k], prefix + k, results, limit);
    }
  }
  suggestions(prefix, limit = 10) {
    if (!prefix) return [];
    const p = prefix.toLowerCase();
    const node = this._getNode(p);
    const out = [];
    if (!node) return out;
    this._collect(node, p, out, limit);
    return out;
  }
}

// ----------------- UI helpers -----------------
function createSuggestionsContainer() {
  const searchCard = document.querySelector('.search-card');
  if (!searchCard) return null;
  let suggestionsEl = document.getElementById('suggestions');
  if (!suggestionsEl) {
    suggestionsEl = document.createElement('div');
    suggestionsEl.id = 'suggestions';
    suggestionsEl.className = 'suggestions-panel';
    // ensure search-card is positioned so absolute suggestions align
    const style = window.getComputedStyle(searchCard).position;
    if (style === 'static' || !style) searchCard.style.position = 'relative';
    searchCard.appendChild(suggestionsEl);
  }
  return suggestionsEl;
}

// ----------------- Small CSS injection (only if not already present) -----------------
(function ensureStyles() {
  if (document.getElementById('autocomplete-styles')) return;
  const css = `
  .suggestions-panel {
    position: absolute;
    left: 50%;
    transform: translateX(-50%);
    width: min(560px, calc(100% - 32px));
    background: white;
    border-radius: 10px;
    box-shadow: 0 8px 24px rgba(12,18,35,0.08);
    display: none;
    z-index: 999;
    max-height: 320px;
    overflow: auto;
    margin-top: 8px;
    padding: 6px 0;
  }
  .suggestion-item {
    padding: 10px 14px;
    cursor: pointer;
    font-size: 14px;
    color: #111827;
    outline: none;
  }
  .suggestion-item .primary { font-weight:600; }
  .suggestion-item .meta { font-size:12px; color:#6b7280; margin-top:4px; }
  .suggestion-item.active, .suggestion-item:hover { background:#f3f4f6; }
  `;
  const style = document.createElement('style');
  style.id = 'autocomplete-styles';
  style.appendChild(document.createTextNode(css));
  document.head.appendChild(style);
})();

// ----------------- Main logic -----------------
const inputEl = document.getElementById('query');
const searchBtn = document.getElementById('searchBtn');
const suggestionsEl = createSuggestionsContainer();
let trie = new Trie();
const displayMap = Object.create(null);     // lower -> display
const citationsMap = Object.create(null);   // lower -> best citation count
const termPapersMap = Object.create(null);  // lower -> Set(ids)

if (!inputEl) {
  console.warn('No input element with id="query" found. Autocomplete will not initialize.');
}

// ----------------- Load papers and build trie -----------------
// ----------------- Load papers and build trie (authors EXCLUDED) -----------------
async function loadAllTermsAndBuildTrie() {
  let papers = [];
  try {
    const res = await fetch(API_ALL);
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data)) papers = data;
    }
  } catch (err) {
    // ignore and try fallbacks
  }

  if (!papers.length) {
    // try fallbacks
    for (const p of FALLBACK_PAPERS) {
      try {
        const r = await fetch(p);
        if (!r.ok) continue;
        const d = await r.json();
        if (Array.isArray(d)) {
          papers = d;
          break;
        }
      } catch (err) {
        // continue
      }
    }
  }

  if (!papers.length) {
    console.warn('Could not load papers for autocomplete. Using fallback terms.');
    const fallback = ['deep learning', 'transformers', 'neural networks', 'graph algorithms', 'distributed systems'];
    fallback.forEach(t => {
      trie.insert(t);
      const k = t.toLowerCase();
      displayMap[k] = t;
      citationsMap[k] = citationsMap[k] || 0;
      termPapersMap[k] = termPapersMap[k] || new Set();
    });
    return;
  }

  for (const p of papers) {
    const cite = Number(p.citations_count || p.citations || 0) || 0;

    // ---- ONLY keywords and title (authors excluded) ----

    // keywords
    if (Array.isArray(p.keywords)) {
      for (const k of p.keywords) {
        const t = (k || '').trim();
        if (!t) continue;
        const keyLower = t.toLowerCase();
        trie.insert(t);
        displayMap[keyLower] = t;
        if (!(keyLower in citationsMap) || citationsMap[keyLower] < cite) citationsMap[keyLower] = cite;
        termPapersMap[keyLower] = termPapersMap[keyLower] || new Set();
        if (p.id) termPapersMap[keyLower].add(p.id);
      }
    }

    // title (full)
    if (p.title) {
      const full = p.title.trim();
      const fullLower = full.toLowerCase();
      trie.insert(full);
      displayMap[fullLower] = full;
      if (!(fullLower in citationsMap) || citationsMap[fullLower] < cite) citationsMap[fullLower] = cite;
      termPapersMap[fullLower] = termPapersMap[fullLower] || new Set();
      if (p.id) termPapersMap[fullLower].add(p.id);

      // title tokens
      const tokens = full.split(/\s+/).map(t => t.trim()).filter(Boolean);
      for (const tk of tokens) {
        const tkl = tk.toLowerCase();
        trie.insert(tk);
        displayMap[tkl] = tk;
        if (!(tkl in citationsMap) || citationsMap[tkl] < cite) citationsMap[tkl] = cite;
        termPapersMap[tkl] = termPapersMap[tkl] || new Set();
        if (p.id) termPapersMap[tkl].add(p.id);
      }
    }

    // ---- intentionally skip authors completely ----
  }
}


// ----------------- Suggestions helpers -----------------
function buildSuggestionObjects(prefix, limit = 8) {
  const raw = trie.suggestions(prefix, limit * 3);
  const out = [];
  const seen = new Set();
  for (const r of raw) {
    const key = r.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const display = displayMap[key] || r;
    const citations = citationsMap[key] || 0;
    out.push({ term: display, citations, key });
    if (out.length >= limit) break;
  }
  out.sort((a, b) => {
    if (b.citations !== a.citations) return b.citations - a.citations;
    return a.term.localeCompare(b.term);
  });
  return out;
}

function clearSuggestions() {
  if (suggestionsEl) {
    suggestionsEl.innerHTML = '';
    suggestionsEl.style.display = 'none';
    navIndex = -1;
  }
}
function clearActiveSuggestion() {
  if (!suggestionsEl) return;
  const items = suggestionsEl.querySelectorAll('.suggestion-item');
  items.forEach(i => i.classList.remove('active'));
}

function renderSuggestionsFromTrie(suggObjs) {
  if (!suggestionsEl) return;
  suggestionsEl.innerHTML = '';
  if (!suggObjs.length) {
    suggestionsEl.style.display = 'none';
    return;
  }
  suggestionsEl.style.display = 'block';
  for (const s of suggObjs) {
    const item = document.createElement('div');
    item.className = 'suggestion-item';
    item.dataset.key = s.key;
    item.tabIndex = 0;
    const primary = `<div class="primary">${escapeHtml(s.term)}</div>`;
    const meta = `<div class="meta">Citations: ${escapeHtml(String(s.citations))}</div>`;
    item.innerHTML = primary + meta;

    // Use pointerdown so it fires BEFORE the input's blur event (prevents race)
    item.addEventListener('pointerdown', (ev) => {
      // keep default navigation behavior from stealing focus (especially on touch)
      ev.preventDefault();
      if (!inputEl) return;
      // set input value exactly as suggestion
      inputEl.value = s.term;
      // focus the input again (optional)
      inputEl.focus();
      // dispatch input event so other listeners are aware of the change
      inputEl.dispatchEvent(new Event('input', { bubbles: true }));
      // hide suggestions immediately
      clearSuggestions();
      // run search if desired — by default we do NOT auto-search on click/pointerdown.
      // Uncomment if you want selection to immediately trigger search:
      // doSearch();
    });

    // For keyboard acceptance (Enter/Space) keep the existing behavior
    item.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter' || ev.key === ' ') {
        ev.preventDefault();
        if (!inputEl) return;
        inputEl.value = s.term;
        inputEl.focus();
        inputEl.dispatchEvent(new Event('input', { bubbles: true }));
        clearSuggestions();
        // doSearch(); // optional
      }
    });

    item.addEventListener('mouseover', () => {
      clearActiveSuggestion();
      item.classList.add('active');
    });
    item.addEventListener('mouseout', () => {
      item.classList.remove('active');
    });

    suggestionsEl.appendChild(item);
  }
}

// ----------------- Render search results (used on results page or inline) -----------------
function renderSearchResults(data, q) {
  // finds #results container and populates it
  const resultsEl = document.getElementById('results');
  if (!resultsEl) {
    // no container to render to (caller should have redirected), return false
    return false;
  }

  resultsEl.innerHTML = '';
  if (!Array.isArray(data) || data.length === 0) {
    resultsEl.innerHTML = '<div class="noresults">No papers matched your search.</div>';
    return true;
  }

  for (const p of data) {
    const div = document.createElement('div');
    div.className = 'paper';

    // open link: prefer p.link else backend /paper/<id>
    const openLink = p.link ? p.link : `/paper/${p.id}`;
    const openBtn = `<a href="${escapeHtml(openLink)}" target="_blank" rel="noopener" style="display:inline-block;margin-top:10px;padding:8px 12px;border-radius:8px;background:linear-gradient(90deg,#6c63ff,#8b5cf6);color:#fff;text-decoration:none;">Open paper</a>`;

    // references: if titles available in p.references (strings), show label; otherwise use id
    let refsHTML = '';
    if (p.references && p.references.length) {
      refsHTML = '<div style="margin-top:10px;"><strong>References:</strong><div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:8px;">';
      for (const rid of p.references) {
        // show the id as label; user can improve by mapping id->title with /api/all if desired
        const label = escapeHtml(rid);
        refsHTML += `<button class="ref-btn" data-rid="${escapeHtml(rid)}" style="padding:6px 10px;border-radius:8px;border:1px solid #e6e9ef;background:#fff;cursor:pointer;">${label}</button>`;
      }
      refsHTML += '</div></div>';
    }

    // meta: authors, year, citations, score if present
    const metaParts = [];
    if (p.authors) metaParts.push(escapeHtml((p.authors || []).join(', ')));
    if (p.year) metaParts.push(escapeHtml(String(p.year)));
    metaParts.push('Citations: ' + escapeHtml(String(p.citations_count || p.citations || 0)));
    if (typeof p.score !== 'undefined') metaParts.push('Score: ' + (Number(p.score) * 100).toFixed(2) + '%');

    div.innerHTML = `
      <div class="title">${escapeHtml(p.title)}</div>
      <div class="meta">${metaParts.join(' · ')}</div>
      <div class="abstract">${escapeHtml(p.abstract || '').slice(0, 600)}${(p.abstract && p.abstract.length > 600) ? '...' : ''}</div>
      <div class="keywords">${(p.keywords || []).map(k => '<span class="kpill">' + escapeHtml(k) + '</span>').join('')}</div>
      <div style="margin-top:10px;">${openBtn}</div>
      ${refsHTML}
    `;
    resultsEl.appendChild(div);
  }

  // attach click handlers for reference buttons
  document.querySelectorAll('.ref-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const rid = btn.getAttribute('data-rid');
      if (!rid) return;
      window.open(`/paper/${encodeURIComponent(rid)}`, '_blank', 'noopener');
    });
  });

  return true;
}

// ----------------- Search function (redirect or render inline) -----------------
// frontend/app.js (only the doSearch / search hookup portion — replace existing doSearch and event hookup)

// Redirect-based search: move to results page with query param
function doSearch(){
  const q = (document.getElementById('query').value || '').trim();
  if(!q){
    // if you want to show inline message on main page, you can do so; for now we'll show a small alert
    // (keeps main page simple)
    alert('Please enter a keyword to search.');
    return;
  }
  // redirect to results page (frontend route)
  const url = '/results.html?q=' + encodeURIComponent(q);
  window.location.href = url;
}

// attach search button + Enter -> redirect
document.getElementById('searchBtn').addEventListener('click', doSearch);
document.getElementById('query').addEventListener('keydown', (e)=>{
  if(e.key === 'Enter'){
    // use same doSearch redirect
    doSearch();
  }
});


// ----------------- Event hookups -----------------
if (searchBtn) {
  searchBtn.addEventListener('click', doSearch);
}

if (inputEl) {
  // Enter triggers search unless suggestion active
  inputEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      setTimeout(() => {
        const active = suggestionsEl && suggestionsEl.querySelector('.suggestion-item.active');
        if (!active) doSearch();
      }, 0);
    }
  });
}

// ----------------- Autocomplete interaction -----------------
let navIndex = -1;

const onType = debounce(function (e) {
  if (!inputEl) return;
  const q = (inputEl.value || '').trim();
  if (!q) {
    clearSuggestions();
    return;
  }
  const sugObjs = buildSuggestionObjects(q, 8);
  renderSuggestionsFromTrie(sugObjs);
}, 120);

if (inputEl) {
  inputEl.addEventListener('input', onType);

  inputEl.addEventListener('keydown', function (e) {
    const items = suggestionsEl ? Array.from(suggestionsEl.querySelectorAll('.suggestion-item')) : [];

    if (e.key === 'ArrowDown') {
      if (!items.length) return;
      e.preventDefault();
      navIndex = Math.min(navIndex + 1, items.length - 1);
      clearActiveSuggestion();
      const cur = items[navIndex];
      if (cur) cur.classList.add('active');
      cur && cur.scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'ArrowUp') {
      if (!items.length) return;
      e.preventDefault();
      navIndex = Math.max(navIndex - 1, 0);
      clearActiveSuggestion();
      const cur = items[navIndex];
      if (cur) cur.classList.add('active');
      cur && cur.scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'Tab') {
      // If there is a top suggestion, accept it and run search (Google-like)
      const top = items[0];
      if (top) {
        e.preventDefault();
        const primary = top.querySelector('.primary');
        const val = primary ? primary.innerText : top.innerText;
        inputEl.value = val;
        inputEl.dispatchEvent(new Event('input', { bubbles: true }));
        clearSuggestions();
        doSearch(); // immediate search on tab accept
      }
    } else if (e.key === 'Enter') {
      // If an active suggestion exists accept it and search
      const active = suggestionsEl && suggestionsEl.querySelector('.suggestion-item.active');
      if (active) {
        e.preventDefault();
        const primary = active.querySelector('.primary');
        const val = primary ? primary.innerText : active.innerText;
        inputEl.value = val;
        inputEl.dispatchEvent(new Event('input', { bubbles: true }));
        clearSuggestions();
        doSearch();
      }
    } else if (e.key === 'Escape') {
      clearSuggestions();
    } else {
      navIndex = -1;
    }
  });

  inputEl.addEventListener('blur', () => {
    setTimeout(() => clearSuggestions(), 250);
  });
  inputEl.addEventListener('focus', () => {
    if (suggestionsEl && suggestionsEl.children.length) suggestionsEl.style.display = 'block';
  });
}

document.addEventListener('click', (e) => {
  if (!suggestionsEl) return;
  if (!suggestionsEl.contains(e.target) && e.target !== inputEl) {
    clearSuggestions();
  }
});

// ----------------- init -----------------
(async function init() {
  await loadAllTermsAndBuildTrie();
  if (inputEl && inputEl.value && inputEl.value.trim()) {
    const ob = buildSuggestionObjects(inputEl.value.trim(), 8);
    renderSuggestionsFromTrie(ob);
  }

  // If this page contains #results and a query param q, run the search automatically
  const resultsContainer = document.getElementById('results');
  const qparam = getQueryParam('q').trim();
  if (resultsContainer && qparam) {
    // set a small delay so UI is ready
    setTimeout(() => {
      inputEl && (inputEl.value = qparam);
      doSearch();
    }, 50);
  }
})();

// ----------------- Nav links behaviour (Search / Analytics / Results) -----------------
(function initNavLinks() {
  const navLinks = document.querySelectorAll('.navlink');
  if (!navLinks || !navLinks.length) return;

  navLinks.forEach(link => {
    link.addEventListener('click', (ev) => {
      const txt = (link.textContent || '').trim().toLowerCase();
      if (txt === 'analytics') {
        window.location.href = 'analytics.html';
      } else if (txt === 'search') {
        window.location.href = 'index.html';
      } else if (txt === 'results') {
        window.location.href = 'results.html';
      }
    });
  });

  // set active class based on current file
  const path = window.location.pathname.split('/').pop();
  navLinks.forEach(link => link.classList.remove('active'));
  navLinks.forEach(link => {
    const txt = (link.textContent || '').trim().toLowerCase();
    if ((path === '' || path === 'index.html') && txt === 'search') link.classList.add('active');
    if (path === 'analytics.html' && txt === 'analytics') link.classList.add('active');
    if (path === 'results.html' && txt === 'results') link.classList.add('active');
  });
})();
