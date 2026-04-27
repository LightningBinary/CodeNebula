"""
CodeNebula - Semantic Embedding Engine
Uses Ollama to generate semantic vectors for code files
"""

import json
import hashlib
from typing import Dict, List, Optional


class Embedder:
    """Call Ollama to generate embedding vectors"""
    
    DEFAULT_MODEL = 'nomic-embed-text'
    OLLAMA_URL = 'http://localhost:11434/api/embeddings'
    
    def __init__(self, model: str = None, ollama_url: str = None):
        self.model = model or self.DEFAULT_MODEL
        self.ollama_url = ollama_url or self.OLLAMA_URL
        self._client = None
    
    def _get_client(self):
        """Get Ollama client (lazy load)"""
        if self._client is None:
            try:
                import ollama
                self._client = ollama
            except ImportError:
                raise RuntimeError("Please install ollama package: pip install ollama")
        return self._client
    
    def embed_files(self, stars: List[Dict]) -> Dict[str, List[float]]:
        """Generate embedding vectors for all files"""
        embeddings = {}
        client = self._get_client()
        
        for star in stars:
            try:
                # Build context text
                context_text = self._build_context(star)
                
                # Call Ollama API
                response = client.embeddings(
                    prompt=context_text,
                    model=self.model
                )
                
                embeddings[star['id']] = {
                    'vector': response.get('embedding', []),
                    'model': self.model,
                    'dimension': len(response.get('embedding', []))
                }
                
            except Exception as e:
                # If Ollama unavailable, generate pseudo vectors for demo
                print(f"   [WARN] Embedding failed ({star['name']}): {e}")
                embeddings[star['id']] = self._generate_fallback_vector(star)
        
        return embeddings
    
    def _build_context(self, star: Dict) -> str:
        """Build context text for embedding"""
        parts = [f"File: {star['name']}"]
        
        # Add file path
        if 'path' in star:
            parts.append(f"Path: {star['path']}")
        
        # Add children (classes, functions)
        if 'children' in star and star['children']:
            items = [f"  - {c['type']}: {c['name']}" for c in star['children'][:20]]  # Limit count
            parts.append("Contains:")
            parts.extend(items)
        
        # Add import information
        if 'imports' in star and star['imports']:
            imports = ', '.join(star['imports'][:10])
            parts.append(f"Imports: {imports}")
        
        return '\n'.join(parts)
    
    def _generate_fallback_vector(self, star: Dict) -> Dict:
        """Generate fallback vector (when Ollama is unavailable)"""
        import numpy as np
        
        # Deterministic pseudo-vector based on file features
        seed = int(hashlib.md5(star['id'].encode()).hexdigest(), 16)
        rng = np.random.RandomState(seed % (2**32))
        
        return {
            'vector': rng.randn(768).tolist(),  # 768 dimensions, matching nomic-embed-text
            'model': 'fallback',
            'dimension': 768,
            'fallback': True
        }
    
    def calculate_similarity(self, vec1: List[float], vec2: List[float]) -> float:
        """Calculate cosine similarity between two vectors"""
        import numpy as np
        
        v1 = np.array(vec1)
        v2 = np.array(vec2)
        
        dot_product = np.dot(v1, v2)
        norm1 = np.linalg.norm(v1)
        norm2 = np.linalg.norm(v2)
        
        if norm1 == 0 or norm2 == 0:
            return 0.0
        
        return float(dot_product / (norm1 * norm2))
    
    def build_similarity_matrix(self, embeddings: Dict[str, Dict]) -> Dict[str, Dict[str, float]]:
        """Build similarity matrix between files"""
        ids = list(embeddings.keys())
        matrix = {}
        
        for i, id1 in enumerate(ids):
            matrix[id1] = {}
            for id2 in ids:
                if id1 == id2:
                    matrix[id1][id2] = 1.0
                elif id2 in matrix:
                    # Already calculated
                    matrix[id1][id2] = matrix[id2][id1]
                else:
                    vec1 = embeddings[id1].get('vector', [])
                    vec2 = embeddings[id2].get('vector', [])
                    matrix[id1][id2] = self.calculate_similarity(vec1, vec2)
        
        return matrix
