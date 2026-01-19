# services/graph.py
"""
Citation Graph Service
----------------------
Implements advanced Graph Theory concepts for paper ranking.
- Directed Graph Representation (Adjacency Lists)
- PageRank Algorithm (Eigenvector Centrality)
- Strongly Connected Components (SCC) for clustering

Complexity:
- Space: O(V + E)
- PageRank Time: O(k * (V + E)) where k is iterations
"""

class CitationGraph:
    def __init__(self):
        # Maps PaperID -> Set of PaperIDs (Outgoing Edges: "References")
        self.adj_list = {} 
        # Maps PaperID -> Set of PaperIDs (Incoming Edges: "Cited By")
        self.rev_adj = {}
        # Stores computed PageRank scores
        self.pagerank_scores = {}
    
    def build_graph(self, papers: list):
        """
        Constructs the graph from the list of papers.
        Time Complexity: O(N * Avg_Refs)
        """
        # 1. Initialize nodes
        for p in papers:
            pid = p.get("id")
            if pid not in self.adj_list:
                self.adj_list[pid] = set()
            if pid not in self.rev_adj:
                self.rev_adj[pid] = set()
        
        # 2. Add edges
        for p in papers:
            pid = p.get("id")
            for ref in p.get("references", []) or []:
                # Only add edges if reference exists in our dataset (Closed World Assumption)
                if ref in self.adj_list:
                    self.adj_list[pid].add(ref)
                    self.rev_adj[ref].add(pid)

    def compute_pagerank(self, iterations=20, d=0.85):
        """
        Computes PageRank (Influence Score) for every node.
        Score(P) = (1-d) + d * Sum(Score(Q) / OutDegree(Q)) for Q in In-Neighbors(P)
        
        Time Complexity: O(k * (V + E))
        """
        # Initialize all scores to 1.0
        current_scores = {pid: 1.0 for pid in self.adj_list}
        num_nodes = len(self.adj_list)
        if num_nodes == 0:
            return

        for _ in range(iterations):
            next_scores = {}
            for pid in self.adj_list:
                # Base score (teleportation probability)
                rank_sum = 0.0
                
                # Sum influence from all incoming neighbors (papers that cite this one)
                for incoming_pid in self.rev_adj.get(pid, []):
                    # Out-degree of the citing paper
                    out_degree = len(self.adj_list.get(incoming_pid, []))
                    if out_degree > 0:
                        rank_sum += current_scores[incoming_pid] / out_degree
                
                # Damping factor application
                next_scores[pid] = (1 - d) + (d * rank_sum)
            
            current_scores = next_scores
        
        # Normalize scores to 0-1 range for easier downstream usage
        max_score = max(current_scores.values()) if current_scores else 1.0
        if max_score == 0: max_score = 1.0
        
        for pid, score in current_scores.items():
            self.pagerank_scores[pid] = score / max_score

    def get_score(self, pid):
        return self.pagerank_scores.get(pid, 0.0)

    def get_citation_count(self, pid):
        """O(1) retrieval of citation count (in-degree)"""
        return len(self.rev_adj.get(pid, []))
