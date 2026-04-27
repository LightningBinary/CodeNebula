"""
CodeNebula - Git Diff Analyzer
Analyzes file changes and extracts new imports and function calls
"""

import re
from pathlib import Path
from typing import Dict, List, Optional


class DiffAnalyzer:
    """Analyzes Git diff to extract change information"""
    
    def __init__(self, repo_path: Path):
        self.repo_path = repo_path
        self.git_available = self._check_git()
        
    def _check_git(self) -> bool:
        try:
            import git
            git.Repo(self.repo_path)
            return True
        except:
            return False
    
    def get_file_diff(self, file_path: str) -> Optional[Dict]:
        """Get diff for a single file"""
        if not self.git_available:
            return None
            
        try:
            import git
            repo = git.Repo(self.repo_path)
            file_path = str(Path(file_path).relative_to(self.repo_path))
            
            # Get diff between HEAD and working tree
            diff = repo.git.diff('HEAD', '--', file_path)
            
            if not diff:
                return None
                
            # Parse change stats
            stats = repo.git.diff_stat('--', file_path).split('\n')[-1]
            
            return {
                'file': file_path,
                'diff': diff,
                'stats': stats,
                'has_changes': True
            }
        except Exception as e:
            print(f"Diff analysis failed: {e}")
            return None
    
    def analyze_changes(self, file_path: str) -> Dict:
        """Analyze change content"""
        result = {
            'file': file_path,
            'new_imports': [],
            'new_functions': [],
            'new_classes': [],
            'removed_imports': [],
            'removed_functions': []
        }
        
        diff_info = self.get_file_diff(file_path)
        
        if not diff_info:
            # Fallback to simple text analysis if no Git
            return self._simple_analysis(file_path)
        
        diff = diff_info.get('diff', '')
        
        # Analyze new imports
        import_pattern = r'^\+.*(?:import|from)\s+(\w+)'
        for match in re.finditer(import_pattern, diff, re.MULTILINE):
            result['new_imports'].append(match.group(1))
        
        # Analyze new functions
        func_pattern = r'^\+.*(?:def|async\s+def)\s+(\w+)'
        for match in re.finditer(func_pattern, diff, re.MULTILINE):
            result['new_functions'].append(match.group(1))
        
        # Analyze new classes
        class_pattern = r'^\+.*class\s+(\w+)'
        for match in re.finditer(class_pattern, diff, re.MULTILINE):
            result['new_classes'].append(match.group(1))
        
        # Analyze removed imports
        for line in diff.split('\n'):
            if line.startswith('-') and ('import' in line or 'from' in line):
                match = re.search(r'(?:import|from)\s+(\w+)', line)
                if match:
                    result['removed_imports'].append(match.group(1))
        
        return result
    
    def _simple_analysis(self, file_path: str) -> Dict:
        """Simple file analysis (when Git is not available)"""
        result = {
            'file': file_path,
            'new_imports': [],
            'new_functions': [],
            'new_classes': [],
            'removed_imports': [],
            'removed_functions': []
        }
        
        try:
            path = Path(file_path)
            if path.exists():
                content = path.read_text(encoding='utf-8', errors='ignore')
                
                # Extract imports
                import_pattern = r'(?:import|from)\s+([\w.]+)'
                result['new_imports'] = re.findall(import_pattern, content)[:10]
                
                # Extract functions
                func_pattern = r'(?:def|async\s+def)\s+(\w+)'
                result['new_functions'] = re.findall(func_pattern, content)[:20]
                
                # Extract classes
                class_pattern = r'class\s+(\w+)'
                result['new_classes'] = re.findall(class_pattern, content)[:10]
        except Exception as e:
            print(f"Simple analysis failed: {e}")
        
        return result
