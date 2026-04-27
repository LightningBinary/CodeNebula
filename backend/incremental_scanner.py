"""
CodeNebula - Incremental AST Scanner
Performs AST parsing only on changed files
"""

import ast
import hashlib
from pathlib import Path
from typing import Dict, List, Optional


class IncrementalScanner:
    """Incremental code scanner with caching"""
    
    def __init__(self):
        self.cache = {}  # File path -> AST cache
        
    def scan_file(self, file_path: str) -> Dict:
        """Scan a single file and return structured data"""
        path = Path(file_path)
        
        if not path.exists():
            return {'error': 'file_not_found', 'path': file_path}
        
        try:
            content = path.read_text(encoding='utf-8', errors='ignore')
        except Exception as e:
            return {'error': str(e), 'path': file_path}
        
        # Calculate file hash
        file_hash = hashlib.md5(content.encode()).hexdigest()[:12]
        
        # Check cache
        if file_path in self.cache and self.cache[file_path].get('hash') == file_hash:
            return self.cache[file_path]
        
        # AST parsing
        result = {
            'path': file_path,
            'name': path.name,
            'hash': file_hash,
            'lines': len(content.splitlines()),
            'size': len(content),
            'imports': [],
            'external_imports': [],  # External references (npm packages, builtins)
            'functions': [],
            'classes': []
        }
        
        if path.suffix == '.py':
            self._parse_python(content, result)
        elif path.suffix in {'.js', '.ts', '.jsx', '.tsx'}:
            self._parse_js(content, result)
        
        # Classify external imports
        self._classify_external_imports(result)
        
        # Update cache
        self.cache[file_path] = result
        
        return result
    
    def _parse_python(self, content: str, result: Dict):
        """Parse Python AST"""
        try:
            tree = ast.parse(content)
        except SyntaxError:
            result['parse_error'] = True
            return
        
        # Extract imports
        for node in ast.walk(tree):
            if isinstance(node, ast.Import):
                for alias in node.names:
                    result['imports'].append(alias.name)
            elif isinstance(node, ast.ImportFrom) and node.module:
                result['imports'].append(node.module)
        
        # Extract classes and functions
        for node in ast.iter_child_nodes(tree):
            if isinstance(node, ast.ClassDef):
                methods = [n.name for n in ast.iter_child_nodes(node) 
                          if isinstance(n, ast.FunctionDef)]
                result['classes'].append({
                    'name': node.name,
                    'line': node.lineno,
                    'methods': methods,
                    'bases': [self._get_base_name(b) for b in node.bases]
                })
            elif isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
                result['functions'].append({
                    'name': node.name,
                    'line': node.lineno,
                    'args': [a.arg for a in node.args.args if a.arg != 'self'],
                    'is_async': isinstance(node, ast.AsyncFunctionDef)
                })
    
    def _parse_js(self, content: str, result: Dict):
        """Simple JS/TS parsing using regex"""
        import re
        
        # Extract imports
        import_pattern = r'(?:import|from)\s+["\']([^"\']+)["\']'
        result['imports'] = re.findall(import_pattern, content)
        
        # Extract functions
        func_patterns = [
            r'function\s+(\w+)',
            r'(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s*)?\([^)]*\)\s*=>',
        ]
        for pattern in func_patterns:
            result['functions'].extend(re.findall(pattern, content))
        
        # Extract classes
        class_pattern = r'class\s+(\w+)'
        result['classes'] = [{'name': n, 'methods': []} 
                           for n in re.findall(class_pattern, content)]
    
    def _get_base_name(self, node: ast.expr) -> str:
        """Get base class name"""
        if isinstance(node, ast.Name):
            return node.id
        elif isinstance(node, ast.Attribute):
            return node.attr
        return 'object'
    
    def invalidate(self, file_path: str):
        """Clear cache for a file"""
        if file_path in self.cache:
            del self.cache[file_path]
    
    def _classify_external_imports(self, result: Dict):
        """Classify external imports vs relative paths"""
        imports = result.get('imports', [])
        path = result.get('path', '')
        ext = Path(path).suffix if path else ''
        
        # Python built-in modules
        python_builtins = {
            'os', 'sys', 'json', 're', 'math', 'time', 'datetime', 'collections',
            'itertools', 'functools', 'random', 'uuid', 'hashlib', 'pathlib',
            'typing', 'abc', 'copy', 'io', 'warnings', 'traceback', 'logging',
            'threading', 'multiprocessing', 'asyncio', 'queue', 'socket',
            'http', 'urllib', 'html', 'xml', 'csv', 'configparser', 'argparse',
            'subprocess', 'pickle', 'shelve', 'sqlite3', 'zipfile', 'tarfile',
            'gzip', 'bz2', 'base64', 'struct', 'array', 'bisect', 'heapq',
            'decimal', 'fractions', 'numbers', 'operator', 'types', 'inspect',
            'ast', 'dis', 'compiler', 'code', 'compile', 'eval', 'exec',
            'platform', 'errno', 'ctypes', 'signal', 'mmap', 'resource',
            'grp', 'pwd', 'spwd', 'crypt', 'termios', 'tty', 'fcntl', 'pwd',
            'select', 'tempfile', 'shutil', 'glob', 'fnmatch', 'linecache',
            'tokenize', 'keyword', 'token', 'parser', 'imp', 'importlib',
            'builtins', '__future__', 'atexit', 'gc', 'sysconfig',
            'test', 'unittest', 'doctest', 'pdb', 'profile', 'cProfile',
            'pstats', 'tabnanny', 'pyclbr', 'py_compile', 'compileall',
            'distutils', 'ensurepip', 'packaging', 'site', 'sitecustomize',
            'codeop', 'cmd', 'shlex', 'pipes', 'errno', 'dataclasses'
        }
        
        # JS/TS built-in/common third-party modules
        js_builtins = {
            'fs', 'path', 'os', 'http', 'https', 'url', 'querystring', 'crypto',
            'buffer', 'stream', 'events', 'util', 'assert', 'tty', 'zlib',
            'net', 'dgram', 'dns', 'domain', 'child_process', 'cluster',
            'readline', 'repl', 'module', 'constants', 'process', 'events',
            'timers', 'console', 'global', 'sys', 'perf_hooks', 'v8', 'worker_threads',
            'async_hooks', 'v8', 'inspector', 'trace_events', 'bootstrap_node',
            'nodedisabled', 'smalloc', 'context_apis', 'experimental', 'deprecations',
            'eslint', 'jest', 'mocha', 'chai', 'webpack', 'babel', 'typescript',
            'react', 'react-dom', 'vue', 'angular', 'next', 'nuxt',
            'lodash', 'underscore', 'moment', 'dayjs', 'date-fns',
            'axios', 'fetch', 'node-fetch', 'got', 'request',
            'express', 'koa', 'fastify', 'hapi', 'nestjs',
            'mongoose', 'sequelize', 'typeorm', 'prisma',
            'dotenv', 'yargs', 'commander', 'inquirer',
            'chalk', 'ora', 'cli-progress', 'boxen', 'log-symbols',
            'minimist', 'meow', 'caporal', 'vorpal'
        }
        
        # Select corresponding built-in module set
        builtins = python_builtins if ext == '.py' else js_builtins
        
        external_imports = []
        for imp in imports:
            if not imp:
                continue
            
            # Skip relative paths (project-internal imports)
            if imp.startswith('./') or imp.startswith('../') or imp.startswith('.'):
                continue
            
            # Get top-level module name
            top_module = imp.split('.')[0].split('/')[0]
            
            # Skip npm scoped packages but keep package name
            if imp.startswith('@'):
                external_imports.append(imp)
                continue
            
            # Skip built-in modules
            if top_module in builtins:
                continue
            
            # Skip known relative path remnants
            if top_module in {'..', '.'}:
                continue
            
            external_imports.append(imp)
        
        result['external_imports'] = external_imports
