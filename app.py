from flask import Flask, request, jsonify, send_from_directory, abort
import json, os
from flask_cors import CORS
from html import escape

app = Flask(__name__, static_folder='../frontend', static_url_path='/')
CORS(app)

DATA_PATH = os.path.join(os.path.dirname(__file__), 'papers.json')
with open(DATA_PATH, 'r', encoding='utf-8') as f:
    PAPERS = json.load(f)

# index by id for quick lookups
PAPER_BY_ID = { p.get('id'): p for p in PAPERS if p.get('id') }

# ensure references and abstracts exist and generate placeholder link if missing
for p in PAPERS:
    if 'references' not in p or p['references'] is None:
        p['references'] = []
    if 'abstract' not in p or p['abstract'] is None:
        p['abstract'] = ""
    if 'link' not in p or not p['link']:
        p['link'] = f"https://example.com/papers/{p.get('id','unknown')}"
    PAPER_BY_ID[p.get('id')] = p

def compute_citation_counts():
    counts = { pid: 0 for pid in PAPER_BY_ID.keys() }
    for p in PAPERS:
        for ref in p.get('references', []) or []:
            if ref in counts:
                counts[ref] += 1
    return counts

def _paper_with_dynamic_cites(p, citation_map):
    out = dict(p)  # shallow copy
    out['citations_count'] = int(citation_map.get(p.get('id'), 0))
    return out

@app.route('/api/search')
def search():
    """
    Search endpoint with weighted + normalized scoring.
    Authors are NOT used for matching/scoring (excluded per request).
    Field weights:
      title = 0.45
      keywords = 0.35
      abstract = 0.20
    """
    q = (request.args.get('q') or '').strip()
    tokens = [t for t in q.lower().split() if t]
    if not tokens:
        return jsonify([])

    # weights (authors excluded)
    w_title = 0.45
    w_keywords = 0.35
    w_abstract = 0.20
    # ensure they sum to 1.0
    assert abs((w_title + w_keywords + w_abstract) - 1.0) < 1e-9

    citation_map = compute_citation_counts()
    # compute max citations for normalization (if you later normalize)
    max_cites = max(citation_map.values()) if citation_map else 0.0

    results = []

    for p in PAPERS:
        # prepare searchable fields (lowercased) — ***authors intentionally excluded***
        title_text = (p.get('title','') or '').lower()
        abstract_text = (p.get('abstract','') or '').lower()
        keywords_list = p.get('keywords',[]) or []
        keywords_text = ' '.join(keywords_list).lower()

        # compute weighted token matches
        total_token_score = 0.0
        for tok in tokens:
            tok = tok.strip()
            if not tok:
                continue
            in_title = (tok in title_text)
            in_abstract = (tok in abstract_text)
            # keywords: check token presence inside any single keyword
            in_keywords = any(tok in (kw or '').lower() for kw in keywords_list)

            token_score = 0.0
            if in_title:
                token_score += w_title
            if in_keywords:
                token_score += w_keywords
            if in_abstract:
                token_score += w_abstract

            total_token_score += token_score

        # skip if no match
        if total_token_score <= 0:
            continue

        # normalize keyword score: average token score (range 0..1)
        keyword_score = total_token_score / len(tokens)

        # citation score normalized 0..1
        citations = int(citation_map.get(p.get('id'), 0))
        citation_score = (citations / max_cites) if max_cites > 0 else 0.0

        # final combined score (0.5 weight each as before)
        final_score = 0.5 * keyword_score + 0.5 * citation_score

        enriched = _paper_with_dynamic_cites(p, citation_map)
        enriched['keyword_match_raw'] = round(total_token_score, 6)
        enriched['keyword_score'] = round(keyword_score, 6)
        enriched['citation_score'] = round(citation_score, 6)
        enriched['score'] = round(final_score, 6)

        results.append(enriched)

    # Sort by score descending
    results.sort(key=lambda x: x['score'], reverse=True)
    return jsonify(results)

@app.route('/api/all')
def all_papers():
    citation_map = compute_citation_counts()
    return jsonify([_paper_with_dynamic_cites(p, citation_map) for p in PAPERS])

@app.route('/api/keywords')
def api_keywords():
    """
    Return compact list of suggestion terms built from:
      - paper keywords
      - short title snippets (first 6 words)
      - individual title tokens
    Authors are intentionally excluded from suggestion terms.
    Each item: {"term": <string>, "citations": <int>}
    """
    citation_map = compute_citation_counts()
    term_map = {}
    for p in PAPERS:
        cite = int(citation_map.get(p.get('id'), 0))
        # keywords
        for kw in p.get('keywords', []) or []:
            t = (kw or '').strip()
            if not t:
                continue
            k = t.lower()
            entry = term_map.get(k)
            if entry:
                if cite > entry['citations']:
                    entry['citations'] = cite
            else:
                term_map[k] = {"term": t, "citations": cite}

        # short title (first 6 words)
        title = (p.get('title') or '').strip()
        if title:
            short = ' '.join(title.split()[:6])
            k = short.lower()
            entry = term_map.get(k)
            if entry:
                if cite > entry['citations']:
                    entry['citations'] = cite
            else:
                term_map[k] = {"term": short, "citations": cite}

            # individual title words (single tokens)
            for tk in title.split():
                tk = tk.strip()
                if not tk:
                    continue
                kk = tk.lower()
                entry2 = term_map.get(kk)
                if entry2:
                    if cite > entry2['citations']:
                        entry2['citations'] = cite
                else:
                    term_map[kk] = {"term": tk, "citations": cite}

    out = [{"term": v["term"], "citations": v["citations"]} for k, v in term_map.items()]
    out.sort(key=lambda x: (-x["citations"], x["term"].lower()))
    return jsonify(out)

@app.route('/paper/<paper_id>')
def serve_paper_page(paper_id):
    p = PAPER_BY_ID.get(paper_id)
    if not p:
        return abort(404)
    citation_map = compute_citation_counts()
    cites = int(citation_map.get(paper_id, 0))
    title = escape(p.get('title') or 'Untitled')
    authors = escape(', '.join(p.get('authors', [])))
    year = escape(str(p.get('year') or ''))
    abstract = escape(p.get('abstract') or '')
    link = p.get('link') or ''
    refs = []
    for rid in p.get('references', []) or []:
        rp = PAPER_BY_ID.get(rid)
        if rp:
            rtitle = escape(rp.get('title') or rid)
            refs.append(f'<li><a href="/paper/{rid}" target="_blank" rel="noopener">{rtitle} ({rid})</a></li>')
        else:
            refs.append(f'<li>{escape(rid)} (not in dataset)</li>')
    refs_html = '<ul>' + ''.join(refs) + '</ul>' if refs else '<p><em>No references</em></p>'
    link_button = ''
    if link:
        esc_link = escape(link)
        link_button = f'<p><a href="{esc_link}" target="_blank" rel="noopener" style="display:inline-block;padding:10px 14px;background:#6c63ff;color:#fff;border-radius:8px;text-decoration:none;">Open paper (external)</a></p>'
    html = f"""
    <!doctype html>
    <html>
      <head><meta charset="utf-8"/><title>{title}</title><meta name="viewport" content="width=device-width,initial-scale=1" /></head>
      <body style="font-family:Inter, Arial, sans-serif; padding:24px; color:#111827;">
        <a href="/" style="color:#6c63ff; text-decoration:none;">← Back</a>
        <h1>{title}</h1>
        <div style="color:#6b7280;margin-bottom:12px;">{authors} · {year} · Citations: {cites}</div>
        {link_button}
        <h3>Abstract</h3>
        <p style="max-width:760px;">{abstract}</p>
        <h3>References</h3>
        {refs_html}
      </body>
    </html>
    """
    return html

@app.route('/', defaults={'path': ''})
@app.route('/<path:path>')
def serve_frontend(path):
    if path != "" and os.path.exists(os.path.join(app.static_folder, path)):
        return send_from_directory(app.static_folder, path)
    else:
        return send_from_directory(app.static_folder, 'index.html')

if __name__ == '__main__':
    app.run(debug=True, port=5000)
