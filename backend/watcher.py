"""
CodeNebula - File Watcher
Monitors file changes using Watchdog and triggers incremental analysis
"""

import time
import threading
import asyncio
from pathlib import Path
from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler


class CodeChangeHandler(FileSystemEventHandler):
    """File change event handler"""
    
    IGNORE_DIRS = {'node_modules', '__pycache__', '.git', 'venv', '.venv', '.idea', '.vscode'}
    IGNORE_EXTENSIONS = {'.pyc', '.pyo', '.pyd', '.so', '.dll', '.exe'}
    
    def __init__(self, callback, loop):
        super().__init__()
        self.callback = callback
        self.loop = loop
        self._debounce_timers = {}  # Debounce timers
        self._lock = threading.Lock()
        
    def _should_ignore(self, path):
        """Check if path should be ignored"""
        path_obj = Path(path)
        
        # Check directories
        if any(ignored in path_obj.parts for ignored in self.IGNORE_DIRS):
            return True
        
        # Check extensions
        if path_obj.suffix in self.IGNORE_EXTENSIONS:
            return True
        
        return False
    
    def _debounce(self, path, event_type, delay=0.3):
        """Debounce handling using Timer"""
        key = f"{path}:{event_type}"
        
        # Cancel previous timer
        with self._lock:
            if key in self._debounce_timers:
                self._debounce_timers[key].cancel()
        
        # Use Timer instead of Thread (Timer has cancel() method)
        def _delayed_emit():
            if self.callback:
                self.callback(path, event_type)
        
        timer = threading.Timer(delay, _delayed_emit)
        with self._lock:
            self._debounce_timers[key] = timer
        timer.start()
        
    def _emit_event(self, path, event_type):
        """Synchronously emit event"""
        if self.callback:
            self.callback(path, event_type)
    
    def on_modified(self, event):
        if event.is_directory or self._should_ignore(event.src_path):
            return
        self._debounce(event.src_path, 'modified')
        
    def on_created(self, event):
        if event.is_directory or self._should_ignore(event.src_path):
            return
        self._emit_event(event.src_path, 'created')
        
    def on_deleted(self, event):
        if event.is_directory or self._should_ignore(event.src_path):
            return
        self._emit_event(event.src_path, 'deleted')


class FileWatcher:
    """File system watcher"""
    
    def __init__(self, watch_path: str, callback):
        self.watch_path = Path(watch_path).resolve()
        self.callback = callback
        self.observer = None
        self.handler = None
        self.loop = None
        
    def start(self):
        """Start watching"""
        try:
            self.loop = asyncio.get_event_loop()
        except RuntimeError:
            # Create new event loop if none exists
            self.loop = asyncio.new_event_loop()
            asyncio.set_event_loop(self.loop)
        self.handler = CodeChangeHandler(self.callback, self.loop)
        self.observer = Observer()
        self.observer.schedule(self.handler, str(self.watch_path), recursive=True)
        self.observer.start()
        print(f">> Watching: {self.watch_path}")
        
    def stop(self):
        """Stop watching"""
        if self.observer:
            self.observer.stop()
            self.observer.join()
        print(">> Watcher stopped")
