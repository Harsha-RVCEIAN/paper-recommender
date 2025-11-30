// frontend/results.js
// Fetches /api/search?q=... and /api/all for id->title mapping, renders results page.

(function(){
  const API = '/api/search';
  const API_ALL = '/api/all';

  function escapeHtml(str){
    return String(str || '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
  }

  function getQueryParam(name){
    const params = new URLSearchParams(window.location.search);
    return params.get(name) || '';
  }

  async function fetchIdTitleMap(){
    try {
      const resp = await fetch(API_ALL);
      if(!resp.ok) return {};
      const data = await resp.json();
      const map = {};
      for(const p of data){
        if(p && p.id) map[p.id] = p.title || p.id;
      }
      return map;
    } catch(e){
      console.warn('Could not fetch /api/all', e);
      return {};
    }
  }

  async function runSearch(q){
    const resultsEl = document.getElementById('results');
    resultsEl.innerHTML = '<div class="noresults">Loading results…</div>';
    try {
      const resp = await fetch(API + '?q=' + encodeURIComponent(q));
      if(!resp.ok){
        resultsEl.innerHTML = '<div class="noresults">Search failed. Is the backend running?</div>';
        return;
      }
      const data = await resp.json();
      if(!Array.isArray(data) || data.length === 0){
        resultsEl.innerHTML = '<div class="noresults">No papers matched your search.</div>';
        return;
      }

      const idTitleMap = await fetchIdTitleMap();

      resultsEl.innerHTML = '';
      for(const p of data){
        const div = document.createElement('div');
        div.className = 'paper';

        const openLink = p.link ? p.link : `/paper/${p.id}`;
        const openBtn = `<a href="${escapeHtml(openLink)}" target="_blank" rel="noopener" style="display:inline-block;margin-top:10px;padding:8px 12px;border-radius:8px;background:linear-gradient(90deg,#6c63ff,#8b5cf6);color:#fff;text-decoration:none;">Open paper</a>`;

        let refsHTML = '';
        if(p.references && p.references.length){
          refsHTML = '<div style="margin-top:10px;"><strong>References:</strong><div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:8px;">';
          for(const rid of p.references){
            const label = idTitleMap[rid] ? idTitleMap[rid] : rid;
            refsHTML += `<button class="ref-btn" data-rid="${escapeHtml(rid)}" style="padding:6px 10px;border-radius:8px;border:1px solid #e6e9ef;background:#fff;cursor:pointer;">${escapeHtml(label)}</button>`;
          }
          refsHTML += '</div></div>';
        }

        const metaParts = [];
        if(p.authors) metaParts.push(escapeHtml((p.authors || []).join(', ')));
        if(p.year) metaParts.push(escapeHtml(String(p.year)));
        metaParts.push('Citations: ' + escapeHtml(String(p.citations_count || p.citations || 0)));
        if(typeof p.score !== 'undefined') metaParts.push('Score: ' + (Number(p.score) * 100).toFixed(2) + '%');

        div.innerHTML = `
          <div class="title">${escapeHtml(p.title)}</div>
          <div class="meta">${metaParts.join(' · ')}</div>
          <div class="abstract">${escapeHtml(p.abstract || '').slice(0, 600)}${(p.abstract && p.abstract.length>600)?'...':''}</div>
          <div class="keywords">${(p.keywords || []).map(k=>'<span class="kpill">'+escapeHtml(k)+'</span>').join('')}</div>
          <div style="margin-top:10px;">${openBtn}</div>
          ${refsHTML}
        `;
        resultsEl.appendChild(div);
      }

      // attach ref button handlers
      document.querySelectorAll('.ref-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          const rid = btn.getAttribute('data-rid');
          if(!rid) return;
          window.open(`/paper/${encodeURIComponent(rid)}`, '_blank', 'noopener');
        });
      });

    } catch(err){
      console.error(err);
      resultsEl.innerHTML = '<div class="noresults">An error occurred while searching.</div>';
    }
  }

  const q = getQueryParam('q').trim();
  const titleEl = document.getElementById('results-title');
  const subEl = document.getElementById('results-sub');
  if(!q){
    titleEl.innerText = 'No query provided';
    subEl.innerText = 'Please go back and enter a search query.';
    return;
  }
  titleEl.innerText = `Search results for “${q}”`;
  subEl.innerText = 'Showing results from the dataset. Click Open paper or References to view the paper page or external link.';
  runSearch(q);
})();
