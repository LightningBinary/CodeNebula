"""
CodeNebula - Code Scanner
Uses AST parsing to extract file, class, and function structures from Python code
"""

import ast
import hashlib
from pathlib import Path
from typing import Dict, List, Set


class CodeScanner:
    """Scan code repositories and extract AST structures"""
    
    def __init__(self, extensions: List[str] = None):
        self.extensions = extensions or ['.py', '.js', '.ts', '.jsx', '.tsx']
        self.ignore_dirs = {'node_modules', '__pycache__', '.git', 'venv', 'env', '.venv'}
    
    def scan(self, root_path: Path) -> Dict:
        """Scan entire code repository"""
        files = self._find_files(root_path)
        
        stars = []  # Files (stars)
        planets = []  # Functions/classes (planets)
        
        for file_path in files:
            star = self._parse_file(file_path, root_path)
            if star:
                stars.append(star)
                planets.extend(star.get('children', []))
        
        return {
            'stars': stars,
            'planets': planets,
            'metadata': {
                'root_path': str(root_path),
                'file_count': len(stars),
                'scan_time': None
            }
        }
    
    def _find_files(self, root_path: Path) -> List[Path]:
        """Recursively find all target files"""
        files = []
        for path in root_path.rglob('*'):
            if path.is_file() and path.suffix in self.extensions:
                # Check if in ignored directory
                if not any(ignored in path.parts for ignored in self.ignore_dirs):
                    files.append(path)
        return files
    
    def _parse_file(self, file_path: Path, root_path: Path) -> Dict:
        """Parse a single file"""
        try:
            content = file_path.read_text(encoding='utf-8', errors='ignore')
        except Exception as e:
            return None
        
        star = {
            'id': self._generate_id(str(file_path)),
            'name': file_path.name,
            'path': str(file_path.relative_to(root_path)),
            'full_path': str(file_path),
            'lines': len(content.splitlines()),
            'size': len(content),
            'type': 'file',
            'children': []
        }
        
        # Try AST parsing (Python files only)
        if file_path.suffix == '.py':
            ast_info = self._parse_python_ast(content, star['id'], file_path.name)
            star['children'] = ast_info['children']
            star['imports'] = ast_info.get('imports', [])
            star['ast_valid'] = True
        else:
            # Simple parsing for JS/TS files
            star['children'] = self._parse_js_functions(content, star['id'])
            star['ast_valid'] = False
        
        return star
    
    def _parse_python_ast(self, content: str, parent_id: str, file_name: str) -> Dict:
        """Parse Python code using AST"""
        children = []
        imports = []
        
        try:
            tree = ast.parse(content)
        except SyntaxError:
            return {'children': [], 'imports': []}
        
        for node in ast.walk(tree):
            # Parse functions
            if isinstance(node, ast.FunctionDef):
                func_id = f"{parent_id}_func_{node.lineno}"
                children.append({
                    'id': func_id,
                    'name': node.name,
                    'type': 'function',
                    'parent_id': parent_id,
                    'line_start': node.lineno,
                    'lines': self._get_node_lines(node, content),
                    'args': [arg.arg for arg in node.args.args],
                    'decorators': [self._get_decorator_name(d) for d in node.decorator_list],
                    'is_async': isinstance(node, ast.AsyncFunctionDef)
                })
            
            # Parse classes
            elif isinstance(node, ast.ClassDef):
                class_id = f"{parent_id}_class_{node.lineno}"
                children.append({
                    'id': class_id,
                    'name': node.name,
                    'type': 'class',
                    'parent_id': parent_id,
                    'line_start': node.lineno,
                    'lines': self._get_node_lines(node, content),
                    'bases': [self._get_base_name(base) for base in node.bases],
                    'methods': []  # Will be filled in next step
                })
                
                # Extract class methods
                for item in node.body:
                    if isinstance(item, ast.FunctionDef):
                        method_id = f"{class_id}_method_{item.lineno}"
                        children.append({
                            'id': method_id,
                            'name': item.name,
                            'type': 'method',
                            'parent_id': class_id,
                            'line_start': item.lineno,
                            'lines': self._get_node_lines(item, content),
                            'args': [arg.arg for arg in item.args.args if arg.arg != 'self'],
                            'class_name': node.name
                        })
            
            # Parse imports
            elif isinstance(node, ast.Import):
                for alias in node.names:
                    imports.append(alias.name)
            elif isinstance(node, ast.ImportFrom):
                if node.module:
                    imports.append(node.module)
        
        return {'children': children, 'imports': imports}
    
    def _parse_js_functions(self, content: str, parent_id: str) -> List[Dict]:
        """Simple JS/TS function parsing"""
        import re
        children = []
        
        # Match function declarations
        patterns = [
            r'function\s+(\w+)\s*\([^)]*\)',  # function name()
            r'(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s*)?\([^)]*\)\s*=>',  # const name = () =>
            r'(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s*)?function',  # const name = function
            r'class\s+(\w+)',  # class Name
        ]
        
        for i, pattern in enumerate(patterns):
            matches = re.finditer(pattern, content)
            for match in matches:
                line_num = content[:match.start()].count('\n') + 1
                children.append({
                    'id': f"{parent_id}_js_{i}_{line_num}",
                    'name': match.group(1),
                    'type': 'function' if 'class' not in pattern else 'class',
                    'parent_id': parent_id,
                    'line_start': line_num
                })
        
        return children
    
    def _get_node_lines(self, node: ast.AST, content: str) -> int:
        """Estimate lines occupied by node"""
        lines = set()
        for n in ast.walk(node):
            if hasattr(n, 'lineno'):
                lines.add(n.lineno)
        return len(lines)
    
    def _get_decorator_name(self, node: ast.expr) -> str:
        """Get decorator name"""
        if isinstance(node, ast.Name):
            return node.id
        elif isinstance(node, ast.Attribute):
            return node.attr
        return 'unknown'
    
    def _get_base_name(self, node: ast.expr) -> str:
        """Get base class name"""
        if isinstance(node, ast.Name):
            return node.id
        elif isinstance(node, ast.Attribute):
            return node.attr
        return 'unknown'
    
    def _generate_id(self, path: str) -> str:
        """Generate unique ID"""
        return hashlib.md5(path.encode()).hexdigest()[:12]
