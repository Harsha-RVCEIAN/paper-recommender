// frontend/analytics.js
// Analytics dashboard renderer
// Uses backend analytics endpoints with safe fallback to /api/all
// Adds citation-influence visualization without removing existing features

(async function () {

  const API_ALL = '/api/all';
  const API_SEARCH = '/api/search';
  const API_OVERVIEW = '/api/analytics/overview';
  const API_TOP_CITED = '/api/analytics/top-cited';
  const API_KEYWORDS = '/api/analytics/keywords';

  function esc(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  const els = {
    totalPapers: document.getElementById('stat-total-papers'),
    uniqueKeywords: document.getElementById('stat-unique-keywords'),
    totalReferences: document.getElementById('stat-total-references'),
    topCitedList: document.getElementById('top-cited-list'),
    popularKeywordsList: document.getElementById('popular-keywords-list'),
    extraAnalytics: document.getElementById('extra-analytics'),
  };

  /* ---------------- Utility renderers ---------------- */

  function renderList(container, items, max = 10) {
    if (!container) return;
    container.innerHTML = '';

    for (let i = 0; i < Math.min(items.length, max); i++) {
      const it = items[i];
      const row = document.createElement('div');
      row.style.display = 'flex';
      row.style.justifyContent = 'space-between';
      row.style.padding = '10px 0';
      row.style.borderBottom = '1px solid #f1f5f9';
      row.innerHTML = `
        <div style="max-width:75%;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
          ${esc(it.label)}
        </div>
        <div style="color:#6c63ff;font-weight:600">
          ${esc(String(it.value))}
        </div>
      `;
      container.appendChild(row);
    }
  }

  function renderCitationInfluenceChart(topicMap) {
    if (!els.extraAnalytics) return;

    const sorted = Object.entries(topicMap)
      .map(([k, v]) => ({ topic: k, citations: v }))
      .sort((a, b) => b.citations - a.citations)
      .slice(0, 7);

    if (!sorted.length) return;

    const maxVal = sorted[0].citations || 1;

    const wrapper = document.createElement('div');
    wrapper.innerHTML = `
      <h3 style="margin-bottom:6px;color:#6c63ff;">
        Citation influence by topic
      </h3>
      <p class="small" style="margin-bottom:14px;">
        Topics ranked by cumulative citation impact — not paper count
      </p>
    `;

    sorted.forEach(item => {
      const row = document.createElement('div');
      row.style.marginBottom = '10px';
      row.innerHTML = `
        <div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:4px;">
          <span>${esc(item.topic)}</span>
          <span style="color:#6b7280;">${item.citations}</span>
        </div>
        <div style="height:8px;background:#eef2ff;border-radius:6px;overflow:hidden;">
          <div style="
            height:100%;
            width:${Math.max(6, (item.citations / maxVal) * 100)}%;
            background:linear-gradient(90deg,#6c63ff,#8b5cf6);
            border-radius:6px;">
          </div>
        </div>
      `;
      wrapper.appendChild(row);
    });

    els.extraAnalytics.innerHTML = '';
    els.extraAnalytics.appendChild(wrapper);
  }

  /* ---------------- Preferred: backend analytics ---------------- */

  async function loadFromAnalyticsAPI() {
    try {
      const [overviewRes, topRes, kwRes] = await Promise.all([
        fetch(API_OVERVIEW),
        fetch(API_TOP_CITED),
        fetch(API_KEYWORDS),
      ]);

      if (!overviewRes.ok || !topRes.ok || !kwRes.ok) {
        throw new Error('Analytics API not available');
      }

      const overview = await overviewRes.json();
      const topCited = await topRes.json();
      const keywords = await kwRes.json();

      if (els.totalPapers) els.totalPapers.textContent = overview.total_papers;
      if (els.uniqueKeywords) els.uniqueKeywords.textContent = overview.unique_keywords;
      if (els.totalReferences) els.totalReferences.textContent = overview.total_references;

      renderList(
        els.topCitedList,
        topCited.map(p => ({ label: p.title, value: p.citations })),
        6
      );

      renderList(
        els.popularKeywordsList,
        keywords.map(k => ({ label: k.term, value: k.citations })),
        12
      );

      const topicMap = {};
      keywords.forEach(k => {
        topicMap[k.term] = (topicMap[k.term] || 0) + k.citations;
      });

      renderCitationInfluenceChart(topicMap);
      return true;

    } catch (err) {
      console.warn('Backend analytics not available, falling back.', err);
      return false;
    }
  }

  /* ---------------- Fallback: compute from /api/all ---------------- */

  async function loadFromAllEndpoint() {
    const resp = await fetch(API_ALL);
    if (!resp.ok) {
      if (els.topCitedList) {
        els.topCitedList.innerHTML =
          '<div class="noresults">Analytics unavailable</div>';
      }
      return;
    }

    const data = await resp.json();
    if (!Array.isArray(data)) return;

    let totalReferences = 0;
    const keywordFreq = {};
    const keywordCitations = {};

    for (const p of data) {
      const cites = Number(p.citations_count || 0);

      if (Array.isArray(p.references)) {
        totalReferences += p.references.length;
      }

      if (Array.isArray(p.keywords)) {
        const seen = new Set();
        for (const kw of p.keywords) {
          const k = kw?.trim().toLowerCase();
          if (!k || seen.has(k)) continue;
          seen.add(k);
          keywordFreq[k] = (keywordFreq[k] || 0) + 1;
          keywordCitations[k] = (keywordCitations[k] || 0) + cites;
        }
      }
    }

    if (els.totalPapers) els.totalPapers.textContent = data.length;
    if (els.uniqueKeywords) els.uniqueKeywords.textContent = Object.keys(keywordFreq).length;
    if (els.totalReferences) els.totalReferences.textContent = totalReferences;

    const topCited = data
      .slice()
      .sort((a, b) => (b.citations_count || 0) - (a.citations_count || 0))
      .map(p => ({
        label: p.title,
        value: p.citations_count || 0
      }));

    const kwSorted = Object.keys(keywordFreq)
      .map(k => ({ label: k, value: keywordFreq[k] }))
      .sort((a, b) => b.value - a.value);

    renderList(els.topCitedList, topCited, 6);
    renderList(els.popularKeywordsList, kwSorted, 12);
    renderCitationInfluenceChart(keywordCitations);
  }

  /* ---------------- Init ---------------- */
  const btnReload = document.getElementById('btn-reload');
  const spanStatus = document.getElementById('reload-status');

  if (btnReload) {
    btnReload.onclick = async () => {
      btnReload.disabled = true;
      btnReload.textContent = 'Syncing...';
      spanStatus.textContent = 'Rebuilding Graph & Index...';

      try {
        const res = await fetch('/api/reload', { method: 'POST' });
        if (res.ok) {
          const syncData = await res.json();
          spanStatus.textContent = `Success! ${syncData.papers_count} papers synced.`;
          // Refresh view
          const ok = await loadFromAnalyticsAPI();
          if (!ok) await loadFromAllEndpoint();
        } else {
          spanStatus.textContent = 'Error during sync.';
        }
      } catch (e) {
        spanStatus.textContent = 'Connection failed.';
      } finally {
        btnReload.disabled = false;
        btnReload.textContent = '🔄 Sync & Refresh Data';
        setTimeout(() => { spanStatus.textContent = ''; }, 5000);
      }
    };
  }

  const ok = await loadFromAnalyticsAPI();
  if (!ok) {
    await loadFromAllEndpoint();
  }

})();
