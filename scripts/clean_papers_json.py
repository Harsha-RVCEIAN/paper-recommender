#!/usr/bin/env python3
"""
clean_papers_json.py

Purpose:
- Backup backend/papers.json
- Enforce a clean, minimal schema compatible with current ScholarSearch system
- Remove runtime-only fields
- Ensure required keys exist with safe defaults

Safe to run multiple times.
"""

import json
import time
from pathlib import Path

# -------- Paths --------
PROJECT_ROOT = Path('.')  # run from project root
PAPERS_PATH = PROJECT_ROOT / 'backend' / 'papers.json'

if not PAPERS_PATH.exists():
    raise SystemExit(
        f"Error: {PAPERS_PATH} not found. "
        "Run this script from project root."
    )

# -------- Backup --------
timestamp = time.strftime('%Y%m%dT%H%M%S')
backup_path = PAPERS_PATH.with_suffix(f'.json.bak.{timestamp}')
backup_path.write_bytes(PAPERS_PATH.read_bytes())
print(f"Backup created: {backup_path}")

# -------- Load --------
with PAPERS_PATH.open('r', encoding='utf-8') as f:
    papers = json.load(f)

if not isinstance(papers, list):
    raise SystemExit("Error: papers.json must be a JSON array.")

# -------- Cleaning --------
changed = False

REQUIRED_LIST_FIELDS = ['authors', 'keywords', 'references']
REQUIRED_STRING_FIELDS = ['abstract', 'title', 'id']

for idx, p in enumerate(papers):
    if not isinstance(p, dict):
        raise SystemExit(f"Error: paper at index {idx} is not an object")

    # Remove runtime-only fields
    if 'citations_count' in p:
        del p['citations_count']
        changed = True

    # Ensure required string fields
    for field in REQUIRED_STRING_FIELDS:
        if field not in p or p[field] is None:
            p[field] = ""
            changed = True

    # Ensure required list fields
    for field in REQUIRED_LIST_FIELDS:
        if field not in p or p[field] is None:
            p[field] = []
            changed = True

    # Normalize types defensively
    if not isinstance(p['authors'], list):
        p['authors'] = []
        changed = True

    if not isinstance(p['keywords'], list):
        p['keywords'] = []
        changed = True

    if not isinstance(p['references'], list):
        p['references'] = []
        changed = True

    # Strip whitespace from strings
    for key, value in p.items():
        if isinstance(value, str):
            p[key] = value.strip()

# -------- Save --------
if changed:
    with PAPERS_PATH.open('w', encoding='utf-8') as f:
        json.dump(papers, f, indent=2, ensure_ascii=False)
    print("papers.json cleaned and updated successfully.")
else:
    print("No changes needed. Dataset already clean.")

print("Done.")
