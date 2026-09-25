"""Documents: an all-in-one PDF and document tool, as a Hub service app.

Merge, split, compress, organize, rotate, convert (Office ↔ PDF, images ↔
PDF, PDF → Word/text), edit and sign, page numbers, watermarks, passwords.

Your files stay in your browser. This server keeps nothing: each request
brings its files, they are processed in memory, and the results go straight
back in the response. (Office → PDF is the one exception: LibreOffice needs
a file on disk, so it gets a private temporary copy that is deleted as soon
as the conversion finishes.)

    pip install -r apps/documents/requirements.txt
    python apps/documents/server.py

Office → PDF also needs LibreOffice installed (libreoffice.org).

Settings (env vars):
    DOCUMENTS_PORT     default 8103 (must match "upstream" in hub.json)
    DOCUMENTS_MAX_MB   largest request accepted, default 200
"""

from __future__ import annotations

import json
import mimetypes
import os
import re
import sys
import time
import urllib.parse
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import tools  # noqa: E402

HOST = "127.0.0.1"  # only Hub may reach a service app
PORT = int(os.environ.get("DOCUMENTS_PORT", "8103"))
MAX_BYTES = int(os.environ.get("DOCUMENTS_MAX_MB", "200")) * 1024 * 1024
STATIC = Path(__file__).with_name("static")


def parse_multipart(body: bytes, ctype: str) -> list[tuple[str, str | None, bytes]]:
    """multipart/form-data → [(field name, filename or None, bytes)], all in memory."""
    m = re.search(r'boundary="?([^";]+)"?', ctype or "")
    if not m:
        raise ValueError("expected multipart/form-data")
    delim = b"--" + m.group(1).encode("latin-1")
    parts = []
    for chunk in body.split(delim)[1:]:
        if chunk.startswith(b"--"):
            break  # closing delimiter
        head, sep, data = chunk.partition(b"\r\n\r\n")
        if not sep:
            raise ValueError("malformed multipart body")
        if data.endswith(b"\r\n"):
            data = data[:-2]
        headers = head.decode("utf-8", "replace")
        name = re.search(r'\bname="([^"]*)"', headers)
        filename = re.search(r'\bfilename\*?="?([^";\r\n]*)"?', headers)
        fname = urllib.parse.unquote(filename.group(1)) if filename else None  # browsers escape " as %22
        parts.append((name.group(1) if name else "", fname, data))
    return parts


def build_multipart(files: list[tools.File]) -> tuple[bytes, str]:
    boundary = "hubdocs" + uuid.uuid4().hex
    out = []
    for f in files:
        safe = f.name.replace('"', "'").replace("\r", " ").replace("\n", " ")
        ctype = mimetypes.guess_type(f.name)[0] or "application/octet-stream"
        out.append(f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="{safe}"\r\n'
                   f"Content-Type: {ctype}\r\n\r\n".encode("utf-8") + f.data + b"\r\n")
    out.append(f"--{boundary}--\r\n".encode())
    return b"".join(out), f"multipart/form-data; boundary={boundary}"


class Handler(BaseHTTPRequestHandler):
    server_version = "HubDocuments/2.0"
    protocol_version = "HTTP/1.1"

    def log_message(self, fmt: str, *args) -> None:
        sys.stderr.write("documents: " + (fmt % args) + "\n")

    def _send(self, code: int, body: bytes, ctype: str, extra: dict | None = None) -> None:
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        extra = {"Cache-Control": "no-store", **(extra or {})}
        for k, v in extra.items():
            self.send_header(k, v)
        self.end_headers()
        self.wfile.write(body)

    def _json(self, code: int, obj: object) -> None:
        self._send(code, json.dumps(obj).encode(), "application/json")

    def do_GET(self) -> None:  # noqa: N802
        path = urllib.parse.urlsplit(self.path).path
        if path == "/health":
            return self._json(200, {"status": "ok", "engines": tools.engines(), "maxBytes": MAX_BYTES})
        return self._static(path.strip("/"))

    def do_POST(self) -> None:  # noqa: N802
        path = urllib.parse.urlsplit(self.path).path
        if path != "/api/run":
            return self._json(404, {"error": "not found"})
        length = int(self.headers.get("Content-Length") or 0)
        if length > MAX_BYTES:
            self.close_connection = True
            return self._json(413, {"error": f"Files up to {MAX_BYTES // (1024 * 1024)} MB at a time"})
        try:
            parts = parse_multipart(self.rfile.read(length), self.headers.get("Content-Type", ""))
            request = next((json.loads(d) for n, _, d in parts if n == "request"), {})
        except (ValueError, json.JSONDecodeError):
            return self._json(400, {"error": "bad request"})
        files = [tools.File(fn or "file", d) for n, fn, d in parts if n == "file"]
        started = time.monotonic()
        try:
            outputs = tools.run(str(request.get("tool")), files, request.get("options") or {})
        except tools.ToolError as e:
            return self._json(400, {"error": str(e)})
        except Exception as e:  # keep the service up whatever a file does
            self.log_message("tool %s failed: %r", request.get("tool"), e)
            return self._json(500, {"error": "Something went wrong with that file. Try another?"})
        body, ctype = build_multipart(outputs)
        self._send(200, body, ctype, {"X-Seconds": f"{time.monotonic() - started:.2f}"})

    def _static(self, rel: str) -> None:
        target = (STATIC / (rel or "index.html")).resolve()
        if STATIC.resolve() not in target.parents or not target.is_file():
            target = STATIC / "index.html"
        ctype = mimetypes.guess_type(target.name)[0] or "application/octet-stream"
        if target.suffix in (".js", ".mjs"):
            ctype = "text/javascript"
        cache = {"Cache-Control": "public, max-age=86400"} if "vendor" in target.parts else None
        self._send(200, target.read_bytes(), ctype, cache)


class Server(ThreadingHTTPServer):
    daemon_threads = True

    def handle_error(self, request, client_address) -> None:
        # Clients closing keep-alive connections (Hub's health checker does) aren't errors.
        if isinstance(sys.exc_info()[1], (ConnectionResetError, BrokenPipeError)):
            return
        super().handle_error(request, client_address)


def main() -> None:
    srv = Server((HOST, PORT), Handler)
    e = tools.engines()
    print(f"Documents listening on http://{HOST}:{PORT} · keeps no files · Word export {'on' if e['word'] else 'off'} · "
          f"Office import {'on' if e['office'] else 'off (install LibreOffice)'}", flush=True)
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
