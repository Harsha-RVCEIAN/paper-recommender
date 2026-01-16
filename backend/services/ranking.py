# services/ranking.py
"""
Ranking service
---------------
Responsible for scoring and ordering candidate papers.
Uses deterministic, explainable logic (no AI).
"""

from math import log


def compute_citation_map(papers: list):
    """
    Compute citation count for each paper based on references.

    Returns:
        dict: {paper_id: citation_count}
    """
    citation_counts = {}

    # initialize counts
    for p in papers:
        pid = p.get("id")
        if pid:
            citation_counts[pid] = 0

    # count references
    for p in papers:
        for ref in p.get("references", []) or []:
            if ref in citation_counts:
                citation_counts[ref] += 1

    return citation_counts


def normalize_citation_scores(candidates: list, citation_map: dict):
    """
    Apply log-normalized citation score to candidate papers.

    Adds:
        paper["citation_score"]
    """

    # collect raw citation values
    raw_values = []
    for p in candidates:
        pid = p.get("id")
        raw_values.append(int(citation_map.get(pid, 0)))

    if not raw_values:
        return

    # log-scale
    log_values = [log(1 + v) for v in raw_values]
    max_log = max(log_values)

    # avoid division by zero
    if max_log <= 0:
        for p in candidates:
            p["citation_score"] = 0.0
        return

    # normalize
    for p in candidates:
        raw = int(citation_map.get(p.get("id"), 0))
        p["citation_score"] = round(log(1 + raw) / max_log, 6)


def rank_papers(candidates: list, all_papers: list):
    """
    Rank candidate papers using keyword relevance + citation impact.

    Inputs:
        candidates  : output of search.search_papers()
        all_papers  : full dataset (for citation graph)

    Returns:
        Sorted list of ranked papers
    """

    if not candidates:
        return []

    # build citation graph from full dataset
    citation_map = compute_citation_map(all_papers)

    # compute citation_score for candidates
    normalize_citation_scores(candidates, citation_map)

    # final score weights
    W_KEYWORD = 0.5
    W_CITATION = 0.5

    for p in candidates:
        kw = float(p.get("keyword_score", 0.0))
        cit = float(p.get("citation_score", 0.0))
        final_score = (W_KEYWORD * kw) + (W_CITATION * cit)
        p["score"] = round(final_score, 6)
        p["citations_count"] = int(citation_map.get(p.get("id"), 0))

    # sort by final score (descending)
    candidates.sort(key=lambda x: x.get("score", 0.0), reverse=True)

    return candidates
