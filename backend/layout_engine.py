"""
CodeNebula - Layout Engine
Uses t-SNE and force-directed algorithms to calculate 3D coordinates
"""

import json
import math
import random
from typing import Dict, List, Tuple

try:
    import numpy as np
    from sklearn.manifold import TSNE
    HAS_SKLEARN = True
except ImportError:
    HAS_SKLEARN = False

try:
    import networkx as nx
    HAS_NETWORKX = True
except ImportError:
    HAS_NETWORKX = False


class LayoutEngine:
    """Calculate 3D layout for nebula"""
    
    # Force-directed parameters
    REPULSION_STRENGTH = 1000
    ATTRACTION_STRENGTH = 0.01
    DAMPING = 0.9
    MIN_DISTANCE = 5
    MAX_DISTANCE = 50
    
    def __init__(self):
        self.positions = {}
    
    def calculate(self, code_map: Dict) -> Dict[str, Dict]:
        """Calculate 3D coordinates for all nodes"""
        stars = code_map.get('stars', [])
        planets = code_map.get('planets', [])
        embeddings = code_map.get('embeddings', {})
        
        if not stars:
            return {'stars': {}, 'planets': {}}
        
        # Stage 1: Use t-SNE to reduce high-dimensional vectors to 3D
        if embeddings and HAS_SKLEARN:
            star_positions = self._tsne_layout(stars, embeddings)
        else:
            star_positions = self._random_layout(stars)
        
        # Stage 2: Force-directed optimization
        if len(stars) > 2:
            star_positions = self._force_directed_layout(stars, star_positions, embeddings)
        
        # Stage 3: Calculate planet positions
        planet_positions = self._calculate_planet_positions(stars, planets, star_positions)
        
        return {
            'stars': star_positions,
            'planets': planet_positions
        }
    
    def _tsne_layout(self, stars: List[Dict], embeddings: Dict) -> Dict[str, Tuple[float, float, float]]:
        """Calculate initial layout using t-SNE"""
        ids = [s['id'] for s in stars]
        vectors = []
        
        for star_id in ids:
            vec_data = embeddings.get(star_id, {})
            vec = vec_data.get('vector', None)
            if vec is None:
                # Use random vector
                vec = [0.0] * 768
            vectors.append(vec)
        
        # t-SNE dimensionality reduction to 3D
        vectors_array = np.array(vectors)
        
        # Normalize
        vectors_array = (vectors_array - vectors_array.mean(axis=0)) / (vectors_array.std(axis=0) + 1e-8)
        
        # t-SNE reduction
        perplexity = min(30, len(stars) - 1)
        tsne = TSNE(n_components=3, perplexity=perplexity, random_state=42, n_iter=1000)
        coords = tsne.fit_transform(vectors_array)
        
        # Normalize to reasonable range
        positions = {}
        for i, star_id in enumerate(ids):
            positions[star_id] = (
                float(coords[i, 0] * 10),  # Scale
                float(coords[i, 1] * 10),
                float(coords[i, 2] * 10)
            )
        
        return positions
    
    def _random_layout(self, stars: List[Dict]) -> Dict[str, Tuple[float, float, float]]:
        """Generate random layout (fallback)"""
        positions = {}
        for star in stars:
            positions[star['id']] = (
                random.uniform(-50, 50),
                random.uniform(-50, 50),
                random.uniform(-50, 50)
            )
        return positions
    
    def _force_directed_layout(
        self, 
        stars: List[Dict], 
        initial_positions: Dict[str, Tuple[float, float, float]],
        embeddings: Dict
    ) -> Dict[str, Tuple[float, float, float]]:
        """Force-directed layout optimization"""
        if not HAS_NETWORKX:
            return initial_positions
        
        # Build similarity graph
        G = nx.Graph()
        for star in stars:
            G.add_node(star['id'])
        
        # Add edges (similarity > threshold)
        THRESHOLD = 0.3
        for i, star1 in enumerate(stars):
            for star2 in stars[i+1:]:
                emb1 = embeddings.get(star1['id'], {}).get('vector', [])
                emb2 = embeddings.get(star2['id'], {}).get('vector', [])
                
                if emb1 and emb2:
                    sim = self._cosine_similarity(emb1, emb2)
                    if sim > THRESHOLD:
                        G.add_edge(star1['id'], star2['id'], weight=sim)
        
        # Use NetworkX force-directed layout
        try:
            pos = nx.spring_layout(
                G,
                k=2,  # Node spacing
                iterations=100,
                seed=42,
                pos=initial_positions
            )
            return pos
        except:
            return initial_positions
    
    def _calculate_planet_positions(
        self, 
        stars: List[Dict], 
        planets: List[Dict],
        star_positions: Dict
    ) -> Dict[str, Tuple[float, float, float]]:
        """Calculate positions for planets (functions/classes)"""
        planet_positions = {}
        
        for planet in planets:
            parent_id = planet.get('parent_id')
            parent_pos = star_positions.get(parent_id)
            
            if parent_pos is None:
                continue
            
            # Determine orbit radius based on function complexity
            lines = planet.get('lines', 10)
            orbit_radius = min(3 + lines * 0.1, 10)  # Max 10
            
            # Orbit parameters based on type
            if planet.get('type') == 'class':
                orbit_radius += 2
            elif planet.get('type') == 'method':
                orbit_radius += 1
            
            # Calculate planet position (orbiting the star)
            # Use deterministic pseudo-random for consistent layout
            seed = hash(planet['id']) % 360
            angle = math.radians(seed * 137.5)  # Golden angle
            
            # Add some z-axis variation
            height = (seed % 20 - 10) / 5
            
            planet_positions[planet['id']] = (
                parent_pos[0] + math.cos(angle) * orbit_radius,
                parent_pos[1] + math.sin(angle) * orbit_radius,
                parent_pos[2] + height
            )
        
        return planet_positions
    
    def _cosine_similarity(self, vec1: List[float], vec2: List[float]) -> float:
        """Calculate cosine similarity"""
        v1 = np.array(vec1)
        v2 = np.array(vec2)
        
        dot = np.dot(v1, v2)
        norm = np.linalg.norm(v1) * np.linalg.norm(v2)
        
        if norm == 0:
            return 0.0
        return float(dot / norm)
    
    def export_for_threejs(self, layout: Dict) -> Dict:
        """Export in Three.js-friendly format"""
        nodes = []
        
        for star_id, pos in layout['stars'].items():
            nodes.append({
                'id': star_id,
                'type': 'star',
                'position': {'x': pos[0], 'y': pos[1], 'z': pos[2]}
            })
        
        for planet_id, pos in layout['planets'].items():
            nodes.append({
                'id': planet_id,
                'type': 'planet',
                'position': {'x': pos[0], 'y': pos[1], 'z': pos[2]}
            })
        
        return {'nodes': nodes}
