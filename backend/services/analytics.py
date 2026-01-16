# services/analytics.py
"""
Analytics service
-----------------
Provides dataset-level analytics such as citation counts,
keyword statistics, and publication trends.
"""

from collections import defaultdict


def compute_citation_map(papers: list):
    """
    Compute citation counts for each paper based on references.

    Returns:
        dict: {paper_id: citation_count}
    """
    citation_counts = {}

    # initialize
    for p in papers:
        pid = p.get("id")
        if pid:
            citation_counts[pid] = 0

    # count incoming references
    for p in papers:
        for ref in p.get("references", []) or []:
            if ref in citation_counts:
                citation_counts[ref] += 1

    return citation_counts


def get_overview_stats(papers: list):
    """
    Compute high-level dataset statistics.

    Returns:
        dict with total papers, total references, unique keywords
    """
    total_papers = len(papers)
    total_references = 0
    keyword_set = set()

    for p in papers:
        # references
        refs = p.get("references", []) or []
        total_references += len(refs)

        # keywords
        for kw in p.get("keywords", []) or []:
            if kw and isinstance(kw, str):
                keyword_set.add(kw.strip().lower())

    return {
        "total_papers": total_papers,
        "total_references": total_references,
        "unique_keywords": len(keyword_set)
    }


def get_top_cited_papers(papers: list, citation_map: dict, limit: int = 10):
    """
    Get top cited papers.

    Returns:
        list of dicts: {id, title, citations}
    """
    ranked = []

    for p in papers:
        pid = p.get("id")
        ranked.append({
            "id": pid,
            "title": p.get("title", ""),
            "citations": int(citation_map.get(pid, 0))
        })

    ranked.sort(key=lambda x: x["citations"], reverse=True)
    return ranked[:limit]


def get_keyword_statistics(papers: list, citation_map: dict):
    """
    Compute keyword popularity with max citation impact.

    Returns:
        list of dicts: {term, citations}
    """
    keyword_stats = defaultdict(int)

    for p in papers:
        pid = p.get("id")
        cite = int(citation_map.get(pid, 0))

        for kw in p.get("keywords", []) or []:
            if not kw:
                continue
            key = kw.strip().lower()
            keyword_stats[key] = max(keyword_stats[key], cite)

    results = [
        {"term": k, "citations": v}
        for k, v in keyword_stats.items()
    ]

    results.sort(key=lambda x: (-x["citations"], x["term"]))
    return results


def get_year_distribution(papers: list):
    """
    Count number of papers per publication year.

    Returns:
        dict: {year: count}
    """
    year_counts = defaultdict(int)

    for p in papers:
        year = p.get("year")
        if year:
            year_counts[int(year)] += 1

    return dict(sorted(year_counts.items()))
