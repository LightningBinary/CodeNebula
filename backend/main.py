"""
CodeNebula - Main Entry Point
Event-driven real-time code visualization
"""

import asyncio
import json
import sys
import webbrowser
from pathlib import Path
import threading
import time

from watcher import FileWatcher
from diff_analyzer import DiffAnalyzer
from incremental_scanner import IncrementalScanner
from websocket_server import WebSocketServer


class CodeNebula:
    """CodeNebula main controller"""
    
    def __init__(self, watch_path: str):
        self.watch_path = Path(watch_path).resolve()
        
        # Components
        self.watcher = None
        self.diff_analyzer = DiffAnalyzer(self.watch_path)
        self.scanner = IncrementalScanner()
        self.ws_server = WebSocketServer()
        
        # State
        self.stars = {}  # File ID -> Star data
        self.next_star_id = 1
        
    def start(self):
        """Start CodeNebula"""
        print(">> CodeNebula starting...")
        
        # Start file watcher (but don't scan yet)
        self.watcher = FileWatcher(str(self.watch_path), self._on_file_change)
        
        # Start WebSocket server
        import uvicorn
        server_thread = threading.Thread(target=lambda: uvicorn.run(self.ws_server.app, host="127.0.0.1", port=8000, log_level="warning"))
        server_thread.daemon = True
        server_thread.start()
        
        print(">> Server starting...")
        
        # Wait for server to start
        time.sleep(2)
        
        # Perform initial scan (WebSocket is ready now)
        self._initial_scan()
        
        # Start file watcher
        self.watcher.start()
        
        print(">> CodeNebula ready!")
        print(f"   Watch path: {self.watch_path}")
        print(f"   WebSocket: ws://localhost:8000/ws")
        print()
        print(">> Open http://localhost:8000 to view")
        
        # Open browser
        time.sleep(0.5)
        webbrowser.open("http://localhost:8000")
        
        # Keep running
        try:
            while True:
                time.sleep(1)
        except KeyboardInterrupt:
            self.stop()
    
    def _initial_scan(self):
        """Initial scan of all files"""
        print(">> Initial scan...")
        
        extensions = {'.py', '.js', '.ts', '.jsx', '.tsx'}
        ignore_dirs = {'node_modules', '__pycache__', '.git', 'venv', '.venv'}
        
        for path in self.watch_path.rglob('*'):
            if path.is_file() and path.suffix in extensions:
                if not any(ignored in path.parts for ignored in ignore_dirs):
                    self._process_file(str(path), event_type='initial')
        
        print(f"   Scan complete: {len(self.stars)} files")

        # Wait a bit to ensure frontend WebSocket is connected
        time.sleep(0.5)

        # Broadcast initial state
        self._broadcast({
            'type': 'INIT',
            'stars': list(self.stars.values()),
            'count': len(self.stars)
        })
    
    def _on_file_change(self, file_path: str, event_type: str):
        """File change callback"""
        import traceback
        print(f">> [{event_type}] {Path(file_path).name}")
        print(f"   Called from: {''.join(traceback.format_stack()[-5:-1])}")
        
        if event_type == 'deleted':
            self._handle_deleted(file_path)
        else:
            self._process_file(file_path, event_type)
    
    def _process_file(self, file_path: str, event_type: str):
        """Process a single file"""
        path = Path(file_path)

        # Scan file
        scan_result = self.scanner.scan_file(file_path)

        if 'error' in scan_result:
            return

        # Get or create star ID
        star_id = self._get_star_id(file_path)

        # Check if content actually changed (via hash comparison)
        old_star = self.stars.get(star_id)
        old_hash = old_star.get('content_hash') if old_star else None
        new_hash = scan_result.get('hash')
        content_changed = old_hash is None or old_hash != new_hash

        # Debug log: show hash comparison result
        if event_type != 'initial' and old_hash is not None:
            print(f"   >> Hash check for {path.name}:")
            print(f"      old_hash: {old_hash}")
            print(f"      new_hash: {new_hash}")
            print(f"      content_changed: {content_changed}")

        # Update star data
        star = {
            'id': star_id,
            'path': str(path),
            'name': path.name,
            'ext': path.suffix,
            'lines': scan_result.get('lines', 0),
            'size': scan_result.get('size', 0),
            'imports': scan_result.get('imports', []),
            'external_imports': scan_result.get('external_imports', []),
            'functions': scan_result.get('functions', []),
            'classes': scan_result.get('classes', []),
            'last_modified': time.time(),
            'content_hash': new_hash
        }

        self.stars[star_id] = star

        # Analyze changes (only for incremental events, not initial scan, and if content actually changed)
        if event_type != 'initial' and content_changed:
            diff_result = self.diff_analyzer.analyze_changes(file_path)

            # Broadcast event
            event = {
                'type': event_type.upper(),
                'star': star,
                'changes': diff_result
            }

            self._broadcast(event)
    
    def _handle_deleted(self, file_path: str):
        """Handle file deletion"""
        star_id = self._get_star_id(file_path)
        
        if star_id in self.stars:
            del self.stars[star_id]
            self.scanner.invalidate(file_path)
            
            self._broadcast({
                'type': 'DELETED',
                'star_id': star_id,
                'path': file_path
            })
    
    def _get_star_id(self, file_path: str) -> str:
        """Get or create star ID"""
        # Find existing
        for star_id, star in self.stars.items():
            if star.get('path') == file_path:
                return star_id
        
        # Create new
        star_id = f"star_{self.next_star_id}"
        self.next_star_id += 1
        return star_id
    
    def _broadcast(self, event: dict):
        """Broadcast event"""
        print(f"   >> Broadcast: {event.get('type')}")
        self.ws_server.broadcast_to_all(event)
    
    def stop(self):
        """Stop CodeNebula"""
        if self.watcher:
            self.watcher.stop()
        print(">> CodeNebula stopped")


def main():
    import argparse
    
    parser = argparse.ArgumentParser(description='CodeNebula - Real-time Code Visualization')
    parser.add_argument('--path', '-p', type=str, required=True,
                        help='Path to the code directory to watch')
    
    args = parser.parse_args()
    
    if not Path(args.path).exists():
        print(f"Error: Path not found: {args.path}")
        return 1
    
    app = CodeNebula(args.path)
    app.start()
    
    return 0


if __name__ == '__main__':
    sys.exit(main())
