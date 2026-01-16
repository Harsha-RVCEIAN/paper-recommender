# utils/loader.py
"""
Dataset loader and normalizer
-----------------------------
Loads papers.json, cleans fields, normalizes links,
and builds lookup indexes.
"""

import json
import os
from urllib.parse import urlparse


def _normalize_url(url: str):
    """
    Normalize and validate external URLs.
    Returns a valid http(s) URL or None.
    """
    if not url or not isinstance(url, str):
        return None

    u = url.strip()
    if not u:
        return None

    if u.startswith("http://") or u.startswith("https://"):
        return u

    parsed = urlparse(u)
    if parsed.scheme and parsed.netloc:
        return u

    if "." in u and " " not in u:
        return "https://" + u

    return None


def load_papers(data_path: str):
    """
    Load and normalize the papers dataset.

    Returns:
        tuple:
          - papers (list of dict)
          - paper_by_id (dict id -> paper)
    """

    if not os.path.exists(data_path):
        raise FileNotFoundError(f"Dataset not found: {data_path}")

    with open(data_path, "r", encoding="utf-8") as f:
        papers = json.load(f)

    paper_by_id = {}

    for p in papers:
        # ensure required fields exist
        p.setdefault("id", None)
        p.setdefault("title", "")
        p.setdefault("authors", [])
        p.setdefault("year", None)
        p.setdefault("keywords", [])
        p.setdefault("abstract", "")
        p.setdefault("references", [])

        # normalize list fields
        if not isinstance(p["authors"], list):
            p["authors"] = []
        if not isinstance(p["keywords"], list):
            p["keywords"] = []
        if not isinstance(p["references"], list):
            p["references"] = []

        # detect possible external link
        candidate = None
        for field in (
            "link", "url", "pdf",
            "paper_url", "source_url", "website"
        ):
            val = p.get(field)
            if val and isinstance(val, str) and val.strip():
                candidate = val
                break

        # DOI fallback
        if not candidate:
            doi = p.get("doi") or p.get("DOI")
            if doi and isinstance(doi, str):
                candidate = "https://doi.org/" + doi.strip()

        # arXiv fallback
        if not candidate:
            arx = p.get("arxiv") or p.get("arxiv_id") or p.get("arXiv")
            if arx and isinstance(arx, str):
                candidate = f"https://arxiv.org/abs/{arx.strip()}"

        # normalize link
        p["link"] = _normalize_url(candidate)

        # index by id
        pid = p.get("id")
        if pid:
            paper_by_id[pid] = p

    return papers, paper_by_id
