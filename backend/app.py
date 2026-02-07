from flask import Flask, request, jsonify, send_from_directory, abort
from flask_cors import CORS
from html import escape
import os

# ---- internal modules ----
from utils.loader import load_papers
# from services.search import search_papers # Deprecated
from services.ranking import rank_papers
from services.graph import CitationGraph
from services.index import SearchIndex
from services.analytics import (
    get_overview_stats,
    get_top_cited_papers,
    get_keyword_statistics,
)

# ---- Flask setup ----
app = Flask(__name__, static_folder="../frontend", static_url_path="/")
CORS(app)

# ---- Load dataset once at startup ----
BASE_DIR = os.path.dirname(__file__)
DATA_PATH = os.path.join(BASE_DIR, "papers.json")

PAPERS, PAPER_BY_ID = load_papers(DATA_PATH)

# ---- Initialize Advanced Structures (DSA Project Core) ----
print("\n" + "="*70)
print("🔧 DATA STRUCTURE #1: CITATION GRAPH (Directed Graph)")
print("="*70)
print("📊 Structure: Adjacency List representation using Python dictionaries")
print("🎯 Purpose: Model citation relationships between papers")
print("⚡ Algorithm: PageRank (iterative graph traversal)")
print("📈 Complexity:")
print("   - Build: O(N + E) where N=papers, E=citation edges")
print("   - PageRank: O(K * N) where K=iterations (30)")
print("   - Query: O(1) for retrieving influence score")
print("="*70)
GRAPH = CitationGraph()
GRAPH.build_graph(PAPERS)
GRAPH.compute_pagerank(iterations=30)  # High precision
print(f"✅ Graph built: {len(PAPERS)} nodes, PageRank computed")
print("="*70 + "\n")

#-----its like building indexing the data for faster search like hashmaps of sets----
#-----fro every keyword we are mapping related papers to it for faster search ----
print("="*70)
print("🔧 DATA STRUCTURE #2: INVERTED INDEX (HashMap)")
print("="*70)
print("📊 Structure: HashMap<Token, List<PaperID>> using Python defaultdict")
print("🎯 Purpose: Fast keyword-to-papers lookup for search queries")
print("⚡ Algorithm: Tokenization + Hash-based indexing")
print("📈 Complexity:")
print("   - Build: O(N * M) where N=papers, M=avg tokens per paper")
print("   - Search: O(1) average case for keyword lookup")
print("   - TF-IDF: O(1) for document frequency retrieval")
print("="*70)
INDEX = SearchIndex()
INDEX.build_index(PAPERS)
print(f"✅ Index built: {len(INDEX.inverted_index)} unique tokens indexed")
print(f"📚 Total documents: {INDEX.total_docs}")
print("="*70 + "\n")


def reload_data():
    """Re-load papers from disk and rebuild all DSA structures (Graph, Index)."""
    global PAPERS, PAPER_BY_ID, GRAPH, INDEX
    print("🔄 Hot-reloading dataset and rebuilding indices...")
    PAPERS, PAPER_BY_ID = load_papers(DATA_PATH)
    
    # Rebuild Graph
    GRAPH = CitationGraph()
    GRAPH.build_graph(PAPERS)
    GRAPH.compute_pagerank(iterations=30)
    
    # Rebuild Index
    INDEX = SearchIndex()
    INDEX.build_index(PAPERS)
    print(f"✅ Reload complete: {len(PAPERS)} papers indexed.")
    return len(PAPERS)


# ------------------------------------------------------------------
# API ROUTES
# ------------------------------------------------------------------

@app.route("/api/reload", methods=["POST"])
def api_reload():
    """Endpoint to trigger data reload."""
    count = reload_data()
    return jsonify({"status": "success", "papers_count": count})

@app.route("/api/search")
def api_search():
    """
    Search pipeline (Refactored for Advanced DSA):
      1. INDEX: O(1) keyword lookup (Inverted Index)
      2. RANKING: Composite Score (Graph Authority + Keywords)
    """
    query = (request.args.get("q") or "").strip()
    if not query:
        return jsonify([])

    # Print initialization status before each search
    print('\n' + '='*70)
    print('📦 STATUS: DATA STRUCTURES READY & INITIALIZED')
    print('='*70)
    print('1️⃣  TRIE (Prefix Tree): 🟢 Ready (Preprocessing & Term mapping)')
    print('2️⃣  CITATION GRAPH: 🟢 Ready (' + str(len(PAPERS)) + ' nodes, PageRank cached)')
    print('3️⃣  INVERTED INDEX: 🟢 Ready (' + str(len(INDEX.inverted_index)) + ' unique tokens)')
    print('='*70)

    print('\n' + '='*70)
    print('🔍 SEARCH REQUEST: "' + query + '"')
    print('='*70)
    print('')
    
    print('📊 PIPELINE DATA STRUCTURES IN USE:')
    print('─'*70)
    
    # step 1: O(1) retrieval using Inverted Index
    print('1️⃣  INVERTED INDEX (HashMap)')
    print('    ├─ Operation: HashMap<Token, List<PaperID>> lookup')
    print('    └─ Complexity: O(T) where T = query tokens')
    candidate_ids = INDEX.search(query)
    print(f'    ✅ Retrieved {len(candidate_ids)} candidates')
    print('')
    
    print('2️⃣  SET (Candidate IDs)')
    print('    ├─ Operation: Unique ID management')
    print(f'    └─ Size: {len(candidate_ids)} unique papers')
    print('')
    
    # step 2: ranking using Graph Scores + TF-IDF logic
    print('⚡ RANKING PHASE (Advanced DSA Scoring)')
    print('─'*70)
    ranked = rank_papers(candidate_ids, INDEX, GRAPH, query)
    
    print('')
    print('3️⃣  LIST (Results)')
    print('    ├─ Operation: Timsort O(N log N)')
    print(f'    └─ Final count: {len(ranked)} ranked papers')
    print('')
    
    print(f'✅ COMPLETE: Returning {len(ranked)} results')
    print('='*70 + '\n')

    return jsonify(ranked)


@app.route("/api/all")
def api_all_papers():
    """Return all papers with dynamic citation counts from Graph."""
    out = []
    for p in PAPERS:
        pid = p.get("id")
        item = dict(p)
        item["citations_count"] = GRAPH.get_citation_count(pid)
        out.append(item)
    return jsonify(out)


@app.route("/api/analytics/overview")
def api_analytics_overview():
    """High-level dataset statistics."""
    return jsonify(get_overview_stats(PAPERS))


@app.route("/api/analytics/top-cited")
def api_analytics_top_cited():
    # Pass graph citation counts instead of recomputing
    # We can create a temporary map for the analytics function, 
    # or refactor analytics. For now, we simulate the map.
    citation_map = {p['id']: GRAPH.get_citation_count(p['id']) for p in PAPERS}
    return jsonify(get_top_cited_papers(PAPERS, citation_map, limit=10))


@app.route("/api/analytics/keywords")
def api_analytics_keywords():
    citation_map = {p['id']: GRAPH.get_citation_count(p['id']) for p in PAPERS}
    return jsonify(get_keyword_statistics(PAPERS, citation_map))


# ------------------------------------------------------------------
# PAPER DETAIL PAGE
# ------------------------------------------------------------------

@app.route("/paper/<paper_id>")
def paper_page(paper_id):
    p = PAPER_BY_ID.get(paper_id)
    if not p:
        abort(404)

    # Use Graph Service for counts
    cites = GRAPH.get_citation_count(paper_id)
    pagerank = GRAPH.get_score(paper_id)

    title = escape(p.get("title") or "Untitled")
    authors = escape(", ".join(p.get("authors", [])))
    year = escape(str(p.get("year") or ""))
    abstract = escape(p.get("abstract") or "")
    link = p.get("link")

    references_list = []
    for rid in p.get("references", []) or []:
        rp = PAPER_BY_ID.get(rid)
        if rp:
            rtitle = escape(rp.get("title") or rid)
            r_cites = GRAPH.get_citation_count(rid)
            # Match the .paper style from results.html for consistency/cleanliness
            references_list.append(
                f'<div class="paper" style="margin-bottom:12px; padding:12px; cursor:pointer;" onclick="window.location.href=\'/paper/{rid}\'">'
                f'<div class="title" style="font-size:1.1rem">{rtitle}</div>'
                f'<div class="meta">{rid} • {r_cites} Citations</div>'
                f'</div>'
            )
        else:
            references_list.append(f'<div class="paper" style="padding:12px; color:var(--muted)">{escape(rid)} (Not indexed)</div>')
    
    refs_html = "".join(references_list) if references_list else "<p><em>No references recorded.</em></p>"

    link_button = ""
    if link:
        esc_link = escape(link)
        link_button = (
            f'<a href="{esc_link}" target="_blank" rel="noopener" class="primary-btn">'
            f'READ PAPER (EXTERNAL)</a>'
        )
    else:
        link_button = '<span style="font-style:italic">No external link.</span>'

    html = f"""
    <!doctype html>
    <html lang="en">
      <head>
        <meta charset="utf-8"/>
        <title>{title}</title>
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        <link rel="stylesheet" href="/style.css">
      </head>
      <body>
        <header class="topbar">
          <div class="brand"><span>ScholarSearch</span></div>
          <nav class="nav">
             <a class="navlink" href="/">← Back to Search</a>
          </nav>
        </header>

        <main class="hero" style="text-align:left; margin-top:40px;">
          <!-- Article Header -->
          <div class="meta" style="border-bottom:none; margin-bottom:4px;">
            {year} • {cites} Citations • Influence Score: {round(pagerank * 100, 4)}
          </div>
          <h1>{title}</h1>
          <div class="meta" style="font-size:14px; margin-bottom:24px;">By {authors}</div>
          
          <div style="margin-bottom:32px;">
            {link_button}
          </div>

          <!-- Body -->
          <div class="paper" style="border:none; padding:0; background:transparent;">
             <h3>Abstract</h3>
             <p class="abstract" style="display:block; -webkit-line-clamp:unset;">{abstract}</p>
          </div>

          <div style="margin-top:40px;">
            <h3>References</h3>
             <div style="display:grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap:12px;">
               {refs_html}
             </div>
          </div>
        </main>
      </body>
    </html>
    """
    return html


# ------------------------------------------------------------------
# FRONTEND SERVING
# ------------------------------------------------------------------

@app.route("/", defaults={"path": ""})
@app.route("/<path:path>")
def serve_frontend(path):
    full_path = os.path.join(app.static_folder, path)
    if path and os.path.exists(full_path):
        return send_from_directory(app.static_folder, path)
    return send_from_directory(app.static_folder, "index.html")


# ------------------------------------------------------------------

if __name__ == "__main__":
    app.run(debug=True, port=8000)