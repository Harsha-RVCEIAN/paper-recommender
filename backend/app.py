from flask import Flask, request, jsonify, send_from_directory, abort
import json, os
from flask_cors import CORS
from html import escape
from math import log
from urllib.parse import urlparse

app = Flask(__name__, static_folder='../frontend', static_url_path='/')
CORS(app)

DATA_PATH = os.path.join(os.path.dirname(__file__), 'papers.json')
with open(DATA_PATH, 'r', encoding='utf-8') as f:
    PAPERS = json.load(f)

# helper: ensure string looks like an absolute http(s) url, otherwise normalize
def normalize_url(u):
    if not u or not isinstance(u, str):
        return None
    u = u.strip()
    if not u:
        return None
    # simple heuristic: if it already starts with http(s) keep it
    if u.startswith('http://') or u.startswith('https://'):
        return u
    # if it looks like a domain or path, add https://
    # but reject obviously invalid fragments
    parsed = urlparse(u)
    if parsed.scheme and parsed.netloc:
        return u
    # If string contains a dot and no spaces, assume a domain and prefix https
    if '.' in u and ' ' not in u:
        return 'https://' + u
    return None

# index by id for quick lookups (we'll rebuild after normalizing)
PAPER_BY_ID = {}

# populate PAPER_BY_ID, ensure safe 'link' detection and other defaults
for p in PAPERS:
    # ensure list/string defaults
    if 'references' not in p or p['references'] is None:
        p['references'] = []
    if 'abstract' not in p or p['abstract'] is None:
        p['abstract'] = ""

    # 1) prefer explicit link-like fields
    candidate = None
    for field in ('link', 'url', 'pdf', 'paper_url', 'source_url', 'website'):
        v = p.get(field)
        if v and isinstance(v, str) and v.strip():
            candidate = v.strip()
            break

    # 2) try DOI
    if not candidate:
        doi = p.get('doi') or p.get('DOI') or p.get('paper_doi')
        if doi and isinstance(doi, str) and doi.strip():
            candidate = 'https://doi.org/' + doi.strip()

    # 3) try arXiv id
    if not candidate:
        arx = p.get('arxiv') or p.get('arxiv_id') or p.get('arXiv') or p.get('arxivId')
        if arx and isinstance(arx, str) and arx.strip():
            aid = arx.strip()
            # choose the abstract page as default
            candidate = f'https://arxiv.org/abs/{aid}'

    # normalize candidate url and only keep it if valid
    normalized = normalize_url(candidate) if candidate else None

    # IMPORTANT: if no valid normalized url, leave p['link'] as empty string or None
    p['link'] = normalized or None

    # add to index
    pid = p.get('id')
    if pid:
        PAPER_BY_ID[pid] = p

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
    Authors excluded from matching.
    Field weights: title=0.45, keywords=0.35, abstract=0.20
    Citation score uses log-scaling normalized across matched candidates.
    Final score = 0.5 * keyword_score + 0.5 * citation_score
    """
    q = (request.args.get('q') or '').strip()
    tokens = [t for t in q.lower().split() if t]
    if not tokens:
        return jsonify([])

    w_title = 0.45
    w_keywords = 0.35
    w_abstract = 0.20
    assert abs((w_title + w_keywords + w_abstract) - 1.0) < 1e-9

    citation_map = compute_citation_counts()

    candidates = []
    for p in PAPERS:
        title_text = (p.get('title','') or '').lower()
        abstract_text = (p.get('abstract','') or '').lower()
        keywords_list = p.get('keywords', []) or []

        total_token_score = 0.0
        for tok in tokens:
            tok = tok.strip()
            if not tok:
                continue
            in_title = tok in title_text
            in_abstract = tok in abstract_text
            in_keywords = any(tok in (kw or '').lower() for kw in keywords_list)

            token_score = 0.0
            if in_title:
                token_score += w_title
            if in_keywords:
                token_score += w_keywords
            if in_abstract:
                token_score += w_abstract

            total_token_score += token_score

        if total_token_score <= 0:
            continue

        keyword_score = total_token_score / len(tokens)
        raw_citations = int(citation_map.get(p.get('id'), 0))

        enriched = _paper_with_dynamic_cites(p, citation_map)
        enriched['_internal_keyword_score'] = keyword_score
        enriched['_internal_raw_citations'] = raw_citations

        candidates.append(enriched)

    if not candidates:
        return jsonify([])

    # log-scale citation normalization across candidates
    log_values = [log(1 + c['_internal_raw_citations']) for c in candidates]
    max_log_val = max(log_values) if log_values else 0.0

    if max_log_val <= 0:
        for c in candidates:
            citation_score = 0.0
            final_score = 0.5 * c['_internal_keyword_score'] + 0.5 * citation_score
            c['keyword_score'] = round(float(c['_internal_keyword_score']), 6)
            c['citation_score'] = round(float(citation_score), 6)
            c['score'] = round(float(final_score), 6)
            c.pop('_internal_keyword_score', None)
            c.pop('_internal_raw_citations', None)
        candidates.sort(key=lambda x: x['score'], reverse=True)
        return jsonify(candidates)

    for c in candidates:
        raw = c['_internal_raw_citations']
        log_scaled = log(1 + raw) / max_log_val
        final_score = 0.5 * c['_internal_keyword_score'] + 0.5 * log_scaled
        c['keyword_score'] = round(float(c['_internal_keyword_score']), 6)
        c['citation_score'] = round(float(log_scaled), 6)
        c['score'] = round(float(final_score), 6)
        c.pop('_internal_keyword_score', None)
        c.pop('_internal_raw_citations', None)

    candidates.sort(key=lambda x: x['score'], reverse=True)
    return jsonify(candidates)

@app.route('/api/all')
def all_papers():
    citation_map = compute_citation_counts()
    return jsonify([_paper_with_dynamic_cites(p, citation_map) for p in PAPERS])

@app.route('/api/keywords')
def api_keywords():
    citation_map = compute_citation_counts()
    term_map = {}
    for p in PAPERS:
        cite = int(citation_map.get(p.get('id'), 0))
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
    link = p.get('link') or None

    # Render references
    refs = []
    for rid in p.get('references', []) or []:
        rp = PAPER_BY_ID.get(rid)
        if rp:
            rtitle = escape(rp.get('title') or rid)
            refs.append(f'<li><a href="/paper/{rid}" target="_blank" rel="noopener">{rtitle} ({rid})</a></li>')
        else:
            refs.append(f'<li>{escape(rid)} (not in dataset)</li>')
    refs_html = '<ul>' + ''.join(refs) + '</ul>' if refs else '<p><em>No references</em></p>'

    # Only show external Open button if link is valid (non-empty)
    link_button = ''
    if link:
        esc_link = escape(link)
        link_button = f'<p><a href="{esc_link}" target="_blank" rel="noopener" style="display:inline-block;padding:10px 14px;background:#6c63ff;color:#fff;border-radius:8px;text-decoration:none;">Open paper (external)</a></p>'
    else:
        # optionally show a small hint that no external link is available
        link_button = '<p class="small" style="color:#6b7280;"><em>No external link available for this paper.</em></p>'

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

if __name__ == "__main__":
    import os
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port)

