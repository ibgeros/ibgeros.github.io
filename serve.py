#!/usr/bin/env python3
"""Servidor local do Há homem ou mulher pra mim no Brasil?.

Uso:
    python3 serve.py            # http://127.0.0.1:8765
    python3 serve.py 9000       # outra porta

O site precisa de HTTP (não de file://) para carregar data/population.bin.
"""
import os
import sys
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "site")


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
    server = ThreadingHTTPServer(("127.0.0.1", port), Handler)
    print(f"Há homem ou mulher pra mim no Brasil? em http://127.0.0.1:{port}/")
    print("Ctrl+C para encerrar.")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\naté mais.")


if __name__ == "__main__":
    main()
