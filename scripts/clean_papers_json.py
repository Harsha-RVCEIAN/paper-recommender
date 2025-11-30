#!/usr/bin/env python3
"""
clean_papers_json.py

- Makes a backup of backend/papers.json -> backend/papers.json.bak.TIMESTAMP
- Removes 'citations_count' key from each paper object if present
- Ensures each paper has an 'abstract' key (if missing, inserts empty string)
- Writes cleaned JSON back to backend/papers.json
"""

import json
import os
import time
from pathlib import Path

PROJECT_ROOT = Path('.')      # run script from project root (adjust if needed)
PAPERS_PATH = PROJECT_ROOT / 'backend' / 'papers.json'

if not PAPERS_PATH.exists():
    raise SystemExit(f"Error: {PAPERS_PATH} not found. Run this from your project root or adjust path.")

# backup
ts = time.strftime('%Y%m%dT%H%M%S')
backup_path = PAPERS_PATH.with_suffix(f".json.bak.{ts}")
print(f"Backing up {PAPERS_PATH} -> {backup_path}")
backup_path.write_bytes(PAPERS_PATH.read_bytes())

# load
with PAPERS_PATH.open('r', encoding='utf-8') as f:
    papers = json.load(f)

if not isinstance(papers, list):
    raise SystemExit("Error: papers.json must contain a JSON array at top level.")

changed = False
for p in papers:
    if 'citations_count' in p:
        del p['citations_count']
        changed = True
    # ensure abstract exists
    if 'abstract' not in p or p['abstract'] is None:
        p['abstract'] = ""
        changed = True

if changed:
    with PAPERS_PATH.open('w', encoding='utf-8') as f:
        json.dump(papers, f, indent=2, ensure_ascii=False)
    print(f"Updated {PAPERS_PATH} (removed citations_count and ensured abstract fields).")
else:
    print("No changes needed: no 'citations_count' keys found and all papers already have 'abstract'.")

print("Done.")
