// frontend/results.js
// Citation-aware result rendering with transparent ranking
// Researcher / Beginner mode supported
// FINAL 10/10 VERSION

(function () {
  const API_ALL = '/api/all';
  const API_SEARCH = '/api/search';

  /* ---------------- Utilities ---------------- */

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

  function pct(val) {
    return Math.max(0, Math.min(100, Math.round(val * 100)));
  }

  /* ---------------- Researcher Mode ---------------- */

  function setMode(mode) {
    document.body.setAttribute('data-mode', mode);
    localStorage.setItem('researcher_mode', mode);

    document.getElementById('mode-beginner')
      ?.classList.toggle('active', mode === 'beginner');

    document.getElementById('mode-researcher')
      ?.classList.toggle('active', mode === 'researcher');
  }

  /* ---------------- ID → Title cache ---------------- */

  let ID_TITLE_MAP = null;

  async function getIdTitleMap() {
    if (ID_TITLE_MAP) return ID_TITLE_MAP;
    try {
      const resp = await fetch(API_ALL);
      if (!resp.ok) return {};
      const data = await resp.json();
      const map = {};
      for (const p of data) {
        if (p?.id) map[p.id] = p.title || p.id;
      }
      ID_TITLE_MAP = map;
      return map;
    } catch {
      return {};
    }
  }

  /* ---------------- Query Insight ---------------- */

  function ensureQueryInsightContainer() {
    let el = document.getElementById('query-insight');
    if (!el) {
      el = document.createElement('div');
      el.id = 'query-insight';
      el.className = 'query-insight';
      const hero = document.querySelector('.hero');
      hero?.insertBefore(el, hero.firstChild.nextSibling);
    }
    return el;
  }

  function renderQueryInsight(query, results) {
    if (!results.length) return;

    const el = ensureQueryInsightContainer();
    const top = results[0];
    const cites = Number(top.citations_count || top.citations || 0);
    const refs = (top.references || []).length;

    el.innerHTML = `
      <div class="query-insight-inner">
        <div><strong>Query interpretation</strong></div>
        <div>• Searching titles, abstracts, and references</div>
        <div>• Ranking weighted by relevance and citation influence</div>
        <div>• Top result: ${cites} citations, ${refs} references</div>
      </div>
    `;
  }

  /* ---------------- Main renderer ---------------- */

  async function runSearch(q) {
    const resultsEl = document.getElementById('results');
    if (!resultsEl) return;

    resultsEl.innerHTML = '<div class="noresults">Loading results…</div>';

    try {
      const resp = await fetch(API_SEARCH + '?q=' + encodeURIComponent(q));
      if (!resp.ok) {
        resultsEl.innerHTML = '<div class="noresults">Search failed.</div>';
        return;
      }

      const data = await resp.json();
      if (!Array.isArray(data) || !data.length) {
        resultsEl.innerHTML = '<div class="noresults">No papers matched.</div>';
        return;
      }

      renderQueryInsight(q, data);

      const idTitleMap = await getIdTitleMap();
      resultsEl.innerHTML = '';

      data.forEach((p, idx) => {
        const div = document.createElement('div');
        div.className = 'paper';

        if (idx === 0) {
          // CSS handles nth-child(1) styling
          div.classList.add('featured-article');
        }

        const citations = Number(p.citations_count || p.citations || 0);
        const openLink = p.link ? p.link : `/paper/${p.id}`;

        let scoreOverall, scoreQuery, scoreCite, scoreRefs;

        if (p.score_breakdown) {
          // New DSA Backend Logic
          // Backend score is raw weighted sum. Normalize roughly to 0-100 for display.
          // Max expected score is ~30 (Keyword ~15, PR ~10, CiteLog ~5).
          scoreOverall = Math.min(100, (p.score || 0) * 3);

          scoreQuery = Math.min(100, (p.score_breakdown.relevance || 0) * 5);
          scoreCite = p.score_breakdown.influence || 0;
          scoreRefs = Math.min(100, (p.references || []).length * 10);
        } else {
          // Fallback / Old Logic
          scoreOverall = typeof p.score === 'number' ? pct(p.score) : 0;
          scoreQuery = typeof p.keyword_score === 'number' ? pct(p.keyword_score) : 0;
          scoreCite = Math.min(100, citations * 8);
          scoreRefs = Math.min(100, (p.references || []).length * 20);
        }

        const keywordsHTML = (p.keywords || []).map(k => `
          <span class="kpill"
            onclick="window.location.href='results.html?q=${encodeURIComponent(k)}'">
            ${escapeHtml(k)}
          </span>`).join('');

        const refsHTML = (p.references || []).length ? `
          <div class="references researcher-only">
            <strong>References:</strong>
            <div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:8px;">
              ${(p.references || []).map(rid => `
                <button class="ref-btn" data-rid="${escapeHtml(rid)}">
                  ${escapeHtml(idTitleMap[rid] || rid)}
                </button>`).join('')}
            </div>
          </div>` : '';

        div.innerHTML = `
          <div class="rank-badge">#${idx + 1}</div>

          <div class="title">
            <a href="/paper/${p.id}" style="color:inherit; text-decoration:none;">${escapeHtml(p.title)}</a>
          </div>
          <div class="meta">
            ${p.year || ''} • ${citations} citations • Score ${scoreOverall}%
          </div>

          <!-- SCORE BARS -->
          <div class="score-wrap">
            <div class="score-label">Overall relevance</div>
            <div style="display: flex; align-items: center; gap: 12px;">
              <div class="score-bar" style="flex: 1;">
                <div class="score-fill" data-fill="${scoreOverall}"></div>
              </div>
              <div class="score-percentage">${scoreOverall}%</div>
            </div>

            <div class="score-breakdown researcher-only">
              <div class="score-row">
                <span>Query relevance</span>
                <div style="display: flex; align-items: center; gap: 8px; flex: 1;">
                  <div class="score-bar small" style="flex: 1;">
                    <div class="score-fill" data-fill="${scoreQuery}"></div>
                  </div>
                  <div class="score-percentage">${scoreQuery}%</div>
                </div>
              </div>
              <div class="score-row">
                <span>Citation influence</span>
                <div style="display: flex; align-items: center; gap: 8px; flex: 1;">
                  <div class="score-bar small" style="flex: 1;">
                    <div class="score-fill" data-fill="${scoreCite}"></div>
                  </div>
                  <div class="score-percentage">${scoreCite}%</div>
                </div>
              </div>
              <div class="score-row">
                <span>Reference overlap</span>
                <div style="display: flex; align-items: center; gap: 8px; flex: 1;">
                  <div class="score-bar small" style="flex: 1;">
                    <div class="score-fill" data-fill="${scoreRefs}"></div>
                  </div>
                  <div class="score-percentage">${scoreRefs}%</div>
                </div>
              </div>
            </div>
          </div>

          <div class="abstract">${escapeHtml(p.abstract || '')}</div>
          <div class="expand-abstract">
            Expand abstract →
          </div>

          <div class="keywords">${keywordsHTML}</div>

          <div class="why-box researcher-only">
            <strong>Why ranked #${idx + 1}</strong>
            <ul>
              <li>Query relevance: <b>${scoreQuery}%</b></li>
              <li>Citation influence: <b>${scoreCite}%</b></li>
              <li>Reference overlap: <b>${scoreRefs}%</b></li>
            </ul>
          </div>

          <div style="margin-top:12px">
            <a href="${escapeHtml(openLink)}" target="_blank"
               class="primary-btn">Read paper</a>
          </div>

          ${refsHTML}
        `;

        resultsEl.appendChild(div);
      });

      /* Animate score bars AFTER DOM paint */
      requestAnimationFrame(() => {
        document.querySelectorAll('.score-fill').forEach(el => {
          el.style.width = el.dataset.fill + '%';
        });
      });


      /* Expand Abstract Logic - Event Delegation */
      document.querySelectorAll('.paper').forEach(paperCard => {
        const expandBtn = paperCard.querySelector('.expand-abstract');
        const abstractEl = paperCard.querySelector('.abstract');
        if (expandBtn && abstractEl) {
          expandBtn.onclick = (e) => {
            e.stopPropagation();
            const isExpanded = abstractEl.classList.toggle('expanded');
            expandBtn.innerText = isExpanded ? 'Show less' : 'Expand abstract →';
          };
        }
      });


      document.querySelectorAll('.ref-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const rid = btn.dataset.rid;
          if (rid) window.open(`/paper/${encodeURIComponent(rid)}`, '_blank');
        });
      });

    } catch (e) {
      console.error(e);
      resultsEl.innerHTML = '<div class="noresults">Error loading results.</div>';
    }
  }

  /* ---------------- Init ---------------- */

  const q = getQueryParam('q').trim();
  if (!q) return;

  const savedMode = localStorage.getItem('researcher_mode') || 'beginner';
  setMode(savedMode);

  document.getElementById('mode-beginner')
    ?.addEventListener('click', () => setMode('beginner'));

  document.getElementById('mode-researcher')
    ?.addEventListener('click', () => setMode('researcher'));

  runSearch(q);
})();
