"""Serve Character Ball Fight on http://localhost:4000."""

from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import os


ROOT = Path(__file__).resolve().parent
os.chdir(ROOT)


class Handler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


if __name__ == "__main__":
    address = ("0.0.0.0", 4000)
    print("Character Ball Fight is ready at http://localhost:4000")
    ThreadingHTTPServer(address, Handler).serve_forever()
