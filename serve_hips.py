#!/usr/bin/env python
"""
Simple HTTP server to serve the HiPS files and Aladin Lite tour
"""
import os
import sys
import http.server
import socketserver
import webbrowser
from urllib.parse import urlparse

PORT = 8000
DIRECTORY = os.getcwd()

class CORSHTTPRequestHandler(http.server.SimpleHTTPRequestHandler):
    """Handler with CORS support"""
    
    def end_headers(self):
        # Add CORS headers
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept')
        super().end_headers()
    
    def do_OPTIONS(self):
        # Handle preflight requests
        self.send_response(200)
        self.end_headers()
    
    def log_message(self, format, *args):
        # Custom logging to show file paths
        if self.path and self.command == 'GET':
            parsed_path = urlparse(self.path)
            filepath = parsed_path.path
            if filepath and filepath != '/':
                sys.stderr.write(f"Serving: {filepath}\n")
        return super().log_message(format, *args)

def start_server(port=PORT, directory=DIRECTORY):
    """Start the HTTP server"""
    handler = CORSHTTPRequestHandler
    
    with socketserver.TCPServer(("", port), handler) as httpd:
        print(f"Serving at http://localhost:{port}")
        print(f"Aladin Lite tour: http://localhost:{port}/aladin_lite_tour.html")
        
        # Open the browser with the tour
        webbrowser.open(f"http://localhost:{port}/aladin_lite_tour.html")
        
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nServer stopped.")
            httpd.server_close()

if __name__ == "__main__":
    # Set the directory to serve
    os.chdir(DIRECTORY)
    
    # Start the server
    start_server() 