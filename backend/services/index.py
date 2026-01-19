# services/index.py
"""
Search Index Service
--------------------
Implements Inverted Index for O(1) keyword lookup and Tries for prefix search.
NOW ENHANCED WITH TF-IDF STATS (Pure DSA).

Data Structures:
1. Inverted Index: HashMap<Token, List<PaperID>>
2. Document Frequency: HashMap<Token, Integer> (Number of papers containing word)

Complexity:
- Index Build: O(N * Avg_Words)
- Query: O(L) where L is number of matching docs.
"""

import math
import re
from collections import defaultdict

class SearchIndex:
    def __init__(self):
        self.inverted_index = defaultdict(list)
        self.doc_frequency = defaultdict(int) # df(t)
        self.doc_map = {} # ID -> Paper Object
        self.total_docs = 0

    def tokenize(self, text):
        if not text: return []
        return [t for t in re.split(r'\W+', text.lower()) if t.strip()]

    def build_index(self, papers: list):
        self.doc_map = {p['id']: p for p in papers}
        self.total_docs = len(papers)
        
        for p in papers:
            pid = p['id']
            seen_in_paper = set()

            # Process different fields
            title_tokens = self.tokenize(p.get('title', ''))
            kw_tokens = []
            for k in p.get('keywords', []):
                kw_tokens.extend(self.tokenize(k))
            abs_tokens = self.tokenize(p.get('abstract', ''))

            # Combine all for indexing
            all_tokens = title_tokens + kw_tokens + abs_tokens
            
            for t in all_tokens:
                self.inverted_index[t].append(pid)
                if t not in seen_in_paper:
                    self.doc_frequency[t] += 1
                    seen_in_paper.add(t)

    def get_idf(self, token):
        """
        Pure Mathematical Formula: log(N/df)
        O(1) lookup.
        """
        df = self.doc_frequency.get(token, 0)
        if df == 0: return 0.0
        # Smoothing with +1
        return math.log((self.total_docs + 1) / (df + 1)) + 1.0

    def search(self, query):
        tokens = self.tokenize(query)
        if not tokens: return set()
        result_ids = set()
        for t in tokens:
            if t in self.inverted_index:
                result_ids.update(self.inverted_index[t])
        return result_ids

    def get_paper(self, pid):
        return self.doc_map.get(pid)
