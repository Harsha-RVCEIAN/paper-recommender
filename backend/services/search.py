# services/search.py
"""
Search service
---------------
Responsible for keyword-based filtering and relevance scoring.
No ranking, no sorting by final score, no Flask code here.
"""

def tokenize_query(query: str):
    """Lowercase and split query into tokens."""
    if not query or not isinstance(query, str):
        return []
    return [t for t in query.lower().split() if t.strip()]


def keyword_relevance_score(paper: dict, tokens: list):
    """
    Compute keyword relevance score for a paper.

    Field weights:
    - title:    0.45
    - keywords: 0.35
    - abstract: 0.20
    """

    if not tokens:
        return 0.0

    # weights (must sum to 1.0)
    W_TITLE = 0.45
    W_KEYWORDS = 0.35
    W_ABSTRACT = 0.20

    title = (paper.get("title") or "").lower()
    abstract = (paper.get("abstract") or "").lower()
    keywords = paper.get("keywords") or []

    total_score = 0.0

    for tok in tokens:
        tok_score = 0.0

        if tok in title:
            tok_score += W_TITLE

        if any(tok in (kw or "").lower() for kw in keywords):
            tok_score += W_KEYWORDS

        if tok in abstract:
            tok_score += W_ABSTRACT

        total_score += tok_score

    # normalize by number of tokens
    return total_score / len(tokens)


def search_papers(papers: list, query: str):
    """
    Filter papers matching the query and attach keyword_score.

    Returns:
        List of dicts:
        {
          ...paper fields...,
          "keyword_score": float
        }
    """

    tokens = tokenize_query(query)
    if not tokens:
        return []

    results = []

    for paper in papers:
        score = keyword_relevance_score(paper, tokens)

        # discard non-matching papers
        if score <= 0:
            continue

        enriched = dict(paper)  # shallow copy
        enriched["keyword_score"] = round(score, 6)

        results.append(enriched)

    return results
