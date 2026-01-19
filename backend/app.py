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
DATA_PATH = os.path.join(BASE_DIR, "data", "papers.json")

PAPERS, PAPER_BY_ID = load_papers(DATA_PATH)

# ---- Initialize Advanced Structures (DSA Project Core) ----
print("Initializing Citation Graph (PageRank)...")
GRAPH = CitationGraph()
GRAPH.build_graph(PAPERS)
GRAPH.compute_pagerank(iterations=30)  # High precision
print("Citation Graph built.")

print("Initializing Inverted Index...")
INDEX = SearchIndex()
INDEX.build_index(PAPERS)
print("Inverted Index built.")


# ------------------------------------------------------------------
# API ROUTES
# ------------------------------------------------------------------

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

    # step 1: O(1) retrieval using Inverted Index
    candidate_ids = INDEX.search(query)
    
    # step 2: ranking using Graph Scores + TF-IDF logic
    ranked = rank_papers(candidate_ids, INDEX, GRAPH, query)

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