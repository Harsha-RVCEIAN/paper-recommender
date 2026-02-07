# services/ranking.py
"""
Ranking Service
---------------
Implements deterministic scoring using:
1. TF-IDF Relevance (Keyword weighting using math/stats)
2. Graph Centrality (PageRank from CitationGraph)
3. Raw Impact (Log-scaled Citation Counts)

Complexity:
- Scoring: O(M * T) where M = candidates, T = query tokens.
- Sorting: O(M log M).
"""

import math

def calculate_tfidf_score(paper, tokens, index_service):
    """
    Computes a weighted TF-IDF score for the paper.
    - Title matches get higher TF weight.
    - IDF ensures rare words contribute more to the rank than common words.
    
    Time Complexity: O(T * D) where T = tokens, D = doc size.
    """
    title_text = (paper.get("title") or "").lower()
    abstract_text = (paper.get("abstract") or "").lower()
    keywords = [k.lower() for k in paper.get("keywords") or []]
    
    total_score = 0.0
    for t in tokens:
        # 1. Term Frequency (TF) with field importance weights
        tf = 0.0
        if t in title_text: 
            tf += 5.0 # Title is primary
        if any(t in k for k in keywords): 
            tf += 3.0 # Keywords are metadata
        if t in abstract_text: 
            tf += 1.0 # Abstract is context
            
        # 2. Inverse Document Frequency (IDF)
        # Fetched from our precomputed Inverted Index stats
        idf = index_service.get_idf(t)
        
        # TF-IDF calculation
        total_score += (tf * idf)
        
    return total_score

def rank_papers(candidate_ids: set, index_service, graph_service, query: str):
    """
    Ranks papers using a composite score based on IR and Graph Theory.
    Final Score = TF-IDF + PageRank + log(Citations)
    """
    if not candidate_ids:
        return []

    print("    📋 RANKING PROCESS - Data Structures:")
    print("    " + "─"*66)
    
    print("    ├─ INPUT: Set of candidate paper IDs")
    print(f"    │  └─ Size: {len(candidate_ids)} papers to rank")
    print("    │")
    
    tokens = index_service.tokenize(query)
    print("    ├─ LIST (Query Tokens)")
    print(f"    │  ├─ Tokenized query into {len(tokens)} tokens")
    print(f"    │  └─ Tokens: {tokens}")
    print("    │")
    
    print("    ├─ HASHMAP (Paper Lookup)")
    print("    │  ├─ Structure: doc_map in SearchIndex")
    print("    │  ├─ Operation: O(1) paper retrieval by ID")
    print("    │  └─ Purpose: Get paper details for scoring")
    print("    │")

    ranked_results = []

    # Final Rank Component Weights (Tuning)
    W_TFIDF = 1.0
    W_PAGERANK = 15.0  # Graph-based authority is a strong signal
    W_POPULARITY = 2.0 # Raw citation count is a minor signal
    
    print("    ├─ SCORING ALGORITHMS & DATA STRUCTURES (The 'How'):")
    print("    │")
    print("    │  ├─ 1. QUERY RELEVANCE:")
    print("    │  │  ├─ LOGIC: Matches in Fields / Word Rarity (TF-IDF)")
    print("    │  │  └─ STRUCTURE: HashMap (Inverted Index) + HashMap (Document Frequencies)")
    print("    │")
    print("    │  ├─ 2. CITATION INFLUENCE:")
    print("    │  │  ├─ LOGIC: Recursive Authority Score (PageRank)")
    print("    │  │  └─ STRUCTURE: Directed Graph (Adjacency List) + Hash Table mapping")
    print("    │")
    print("    │  ├─ 3. REFERENCE OVERLAP:")
    print("    │  │  ├─ LOGIC: Bibliographic Density based on In-Degree")
    print("    │  │  └─ STRUCTURE: Adjacency Set intersection + Node mapping")
    print("    │")
    print("    │  └─ 4. TRIE (PRE-SEARCH):")
    print("    │     ├─ LOGIC: Prefix-based selection matching characters to terms")
    print("    │     └─ STRUCTURE: Tree-based Prefixes (Front-end only)")
    print("    │")
    print("    ├─ WEIGHTS (Tuning parameters):")
    print(f"    │  ├─ Relevance Weight: {W_TFIDF}")
    print(f"    │  ├─ Influence Weight: {W_PAGERANK}")
    print(f"    │  └─ Popularity Weight: {W_POPULARITY}")
    print("    │")

    for pid in candidate_ids:
        paper = index_service.get_paper(pid)
        if not paper: continue

        # 1. TF-IDF Calculation (Deterministic IR)
        tfidf_score = calculate_tfidf_score(paper, tokens, index_service)

        # 2. PageRank (Search Engine Authority)
        pagerank = graph_service.get_score(pid)

        # 3. Citation Popularity (Log-normalized)
        citations = graph_service.get_citation_count(pid)
        popularity_score = math.log10(1 + citations)

        # Unified Composite Score
        final_score = (tfidf_score * W_TFIDF) + (pagerank * W_PAGERANK) + (popularity_score * W_POPULARITY)

        p_copy = paper.copy()
        p_copy['score'] = round(final_score, 4)
        p_copy['pagerank'] = round(pagerank, 6)
        p_copy['citations_count'] = citations
        
        # Explanation for the frontend
        p_copy['score_breakdown'] = {
             'relevance': round(tfidf_score, 2),
             'influence': round(pagerank * 100, 2),
             'popularity': citations
        }

        ranked_results.append(p_copy)

    # Sort Results by the calculated composite score
    print("    └─ SORTING (Timsort)")
    print("       ├─ Algorithm: Python's built-in sort (Timsort)")
    print(f"       ├─ Input size: {len(ranked_results)} papers")
    print("       ├─ Sort key: Composite score (descending)")
    print(f"       └─ Complexity: O(N log N) where N={len(ranked_results)}")
    
    ranked_results.sort(key=lambda x: x['score'], reverse=True)

    return ranked_results
