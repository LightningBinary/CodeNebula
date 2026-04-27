"""
CodeNebula - WebSocket Server
Event-driven real-time communication
"""

import asyncio
import json
import os
import subprocess
import sys
from typing import Set
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse, JSONResponse
import threading


class WebSocketServer:
    """WebSocket server managing all client connections"""
    
    def __init__(self):
        self.active_connections: Set[WebSocket] = set()
        self.app = FastAPI()
        self.last_init_message: dict | None = None  # Cache last INIT message
        self._setup_routes()
    
    def _setup_routes(self):
        """Setup routes"""
        
        # Get frontend path
        project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        frontend_path = os.path.join(project_root, "frontend")
        index_html_path = os.path.join(frontend_path, "index.html")
        
        @self.app.get("/")
        async def get_index():
            """Return main page"""
            with open(index_html_path, 'r', encoding='utf-8') as f:
                content = f.read()
            return HTMLResponse(content)
        
        @self.app.get("/api/scan")
        async def scan_project(path: str):
            """Scan specified path"""
            from pathlib import Path
            import time
            from incremental_scanner import IncrementalScanner
            
            if not Path(path).exists():
                return JSONResponse({'error': 'Path not found'}, status_code=404)
            
            scanner = IncrementalScanner()
            extensions = {'.py', '.js', '.ts', '.jsx', '.tsx'}
            ignore_dirs = {'node_modules', '__pycache__', '.git', 'venv', '.venv'}
            
            stars = []
            for file_path in Path(path).rglob('*'):
                if file_path.is_file() and file_path.suffix in extensions:
                    if not any(ignored in file_path.parts for ignored in ignore_dirs):
                        result = scanner.scan_file(str(file_path))
                        if 'error' not in result:
                            stars.append({
                                'id': f"star_{len(stars) + 1}",
                                'path': str(file_path),
                                'name': file_path.name,
                                'ext': file_path.suffix,
                                'lines': result.get('lines', 0),
                                'functions': result.get('functions', []),
                                'classes': result.get('classes', []),
                                'external_imports': result.get('external_imports', []),
                                'last_modified': time.time()
                            })
            
            return JSONResponse({
                'type': 'INIT',
                'stars': stars,
                'count': len(stars)
            })
        
        @self.app.get("/api/open-folder")
        async def open_folder(path: str):
            """Open file's folder in Windows Explorer"""
            try:
                # Ensure correct path format
                file_path = path.replace('/', '\\')
                # Windows command: explorer /select,"file_path"
                if sys.platform == 'win32':
                    subprocess.Popen(f'explorer /select,"{file_path}"')
                else:
                    # macOS
                    subprocess.Popen(['open', '-R', file_path])
                return JSONResponse({'success': True})
            except Exception as e:
                return JSONResponse({'error': str(e)}, status_code=500)
        
        @self.app.get("/api/file-content")
        async def get_file_content(path: str):
            """Get file content"""
            try:
                # Security check: prevent path traversal attack
                if '..' in path:
                    return JSONResponse({'error': 'Invalid path'}, status_code=400)
                
                file_path = path  # Use path as-is; Python handles both / and \ on Windows
                
                # Read file
                with open(file_path, 'r', encoding='utf-8', errors='replace') as f:
                    content = f.read()
                
                return JSONResponse({
                    'content': content,
                    'name': os.path.basename(file_path),
                    'ext': os.path.splitext(file_path)[1]
                })
            except FileNotFoundError:
                return JSONResponse({'error': 'File not found'}, status_code=404)
            except Exception as e:
                return JSONResponse({'error': str(e)}, status_code=500)
        
        @self.app.websocket("/ws")
        async def websocket_endpoint(websocket: WebSocket):
            await websocket.accept()
            self.active_connections.add(websocket)
            print(f">> Client connected ({len(self.active_connections)})")
            
            try:
                while True:
                    # Receive client message
                    data = await websocket.receive_text()
                    await self._handle_client_message(websocket, data)
            except WebSocketDisconnect:
                self.active_connections.discard(websocket)
                print(f">> Client disconnected ({len(self.active_connections)})")
            except Exception as e:
                self.active_connections.discard(websocket)
                print(f">> Connection error: {e}")
        
        # Static files
        self.app.mount("/static", StaticFiles(directory=frontend_path), name="static")
    
    async def _handle_client_message(self, websocket: WebSocket, data: str):
        """Handle client messages"""
        try:
            msg = json.loads(data)
            msg_type = msg.get('type')

            if msg_type == 'ping':
                await websocket.send_json({'type': 'pong'})
            elif msg_type == 'scan':
                # Client requests scan for specified path
                scan_path = msg.get('path')
                if scan_path:
                    await websocket.send_json({'type': 'SCAN_STARTED', 'path': scan_path})
            elif msg_type == 'get_state':
                # Client requests current state (used after reconnection)
                if self.last_init_message:
                    await websocket.send_json(self.last_init_message)
        except json.JSONDecodeError:
            pass
    
    def broadcast(self, event: dict):
        """Broadcast message to all clients (synchronous)"""
        if not self.active_connections:
            return
            
        disconnected = set()
        
        for connection in self.active_connections:
            try:
                # Directly send JSON string
                connection.send_text(json.dumps(event))
            except Exception as e:
                print(f">> Broadcast error: {e}")
                disconnected.add(connection)
        
        # Clean up disconnected connections
        self.active_connections -= disconnected
    
    def broadcast_to_all(self, event: dict):
        """Thread-safe broadcast (for external callers)"""
        # Cache INIT message
        if event.get('type') == 'INIT':
            self.last_init_message = event

        def _do_broadcast():
            try:
                loop = asyncio.new_event_loop()
                asyncio.set_event_loop(loop)
                
                for conn in self.active_connections.copy():
                    try:
                        loop.run_until_complete(conn.send_text(json.dumps(event)))
                    except Exception as e:
                        print(f">> Broadcast error: {e}")
                
                loop.close()
            except Exception as e:
                print(f">> Broadcast thread error: {e}")

        thread = threading.Thread(target=_do_broadcast)
        thread.daemon = True
        thread.start()
