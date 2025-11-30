// frontend/analytics.js
// Fetch /api/all and render simple analytics (top-cited, popular keywords, overview)

(async function(){
  const API_ALL = '/api/all';

  function esc(s){ return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

  const els = {
    totalPapers: document.getElementById('stat-total-papers'),
    uniqueKeywords: document.getElementById('stat-unique-keywords'),
    totalReferences: document.getElementById('stat-total-references'),
    topCitedList: document.getElementById('top-cited-list'),
    popularKeywordsList: document.getElementById('popular-keywords-list'),
  };

  function renderList(container, items, max=10){
    container.innerHTML = '';
    const list = document.createElement('div');
    list.style.display = 'flex';
    list.style.flexDirection = 'column';
    for(let i=0;i<Math.min(items.length, max);++i){
      const it = items[i];
      const row = document.createElement('div');
      row.style.display = 'flex';
      row.style.justifyContent = 'space-between';
      row.style.padding = '10px 0';
      row.style.borderBottom = '1px solid #f1f5f9';
      row.innerHTML = `<div style="max-width:75%;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${esc(it.label)}</div><div style="color:#6c63ff;font-weight:600">${esc(String(it.value))}</div>`;
      list.appendChild(row);
    }
    container.appendChild(list);
  }

  try {
    const resp = await fetch(API_ALL);
    if(!resp.ok) {
      console.error('Failed to fetch /api/all', resp.status);
      if(els.topCitedList) els.topCitedList.innerHTML = '<div class="noresults">Analytics unavailable (backend error)</div>';
      return;
    }
    const data = await resp.json();
    if(!Array.isArray(data)) {
      console.error('Unexpected /api/all response', data);
      return;
    }

    // Overview stats
    const totalPapers = data.length;
    const keywordsFreq = Object.create(null); // keyword -> count of papers containing it
    let totalReferences = 0;

    for(const p of data){
      // count references
      if(Array.isArray(p.references)) totalReferences += p.references.length;

      // keywords: ensure each keyword counted once per paper
      if(Array.isArray(p.keywords)){
        const seen = new Set();
        for(const kw of p.keywords){
          if(!kw) continue;
          const k = String(kw).trim().toLowerCase();
          if(!k) continue;
          if(seen.has(k)) continue;
          seen.add(k);
          keywordsFreq[k] = (keywordsFreq[k] || 0) + 1;
        }
      }
    }

    // unique keywords
    const uniqueKeywords = Object.keys(keywordsFreq).length;

    // top cited papers (backend includes citations_count)
    const byCitation = data.slice().sort((a,b)=> {
      const ca = Number(a.citations_count || a.citations || 0);
      const cb = Number(b.citations_count || b.citations || 0);
      return cb - ca;
    });
    const topCited = byCitation.map(p => ({ label: `${p.title} ${p.id ? '': ''}`, value: Number(p.citations_count || p.citations || 0) }));

    // popular keywords sorted by freq desc
    const kwSorted = Object.keys(keywordsFreq).map(k => ({ label: k, value: keywordsFreq[k] })).sort((a,b)=> b.value - a.value);

    // render
    if(els.totalPapers) els.totalPapers.textContent = totalPapers;
    if(els.uniqueKeywords) els.uniqueKeywords.textContent = uniqueKeywords;
    if(els.totalReferences) els.totalReferences.textContent = totalReferences;

    if(els.topCitedList) renderList(els.topCitedList, topCited, 6);
    if(els.popularKeywordsList) renderList(els.popularKeywordsList, kwSorted, 12);

  } catch (err){
    console.error('Error in analytics.js', err);
  }
})();
