"""Documents: an all-in-one PDF and document tool, as a Hub service app.

Merge, split, compress, organize, rotate, convert (Office ↔ PDF, images ↔
PDF, PDF → Word/text), edit and sign, page numbers, watermarks, passwords.
Everything runs on the Hub machine; files are deleted after two hours.

    pip install -r apps/documents/requirements.txt
    python apps/documents/server.py

Office → PDF also needs LibreOffice installed (libreoffice.org).

Settings (env vars):
    DOCUMENTS_PORT     default 8103 (must match "upstream" in hub.json)
    DOCUMENTS_DATA     default apps/documents/data
    DOCUMENTS_MAX_MB   largest upload accepted, default 200
"""

from __future__ import annotations

import json
import mimetypes
import os
import re
import shutil
import sys
import threading
import time
import urllib.parse
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import tools  # noqa: E402

HOST = "127.0.0.1"  # only Hub may reach a service app
PORT = int(os.environ.get("DOCUMENTS_PORT", "8103"))
DATA = Path(os.environ.get("DOCUMENTS_DATA", Path(__file__).with_name("data")))
MAX_BYTES = int(os.environ.get("DOCUMENTS_MAX_MB", "200")) * 1024 * 1024
KEEP_SECONDS = 2 * 60 * 60
STATIC = Path(__file__).with_name("static")


class Store:
    """Uploads and results live in data/files/<id>/<name>, swept after two hours."""

    def __init__(self, root: Path) -> None:
        self.root = root / "files"
        self.root.mkdir(parents=True, exist_ok=True)

    def path(self, fid: str) -> Path | None:
        if not re.fullmatch(r"[a-f0-9]{16}", fid or ""):
            return None
        d = self.root / fid
        files = [p for p in d.iterdir()] if d.is_dir() else []
        return files[0] if files else None

    def add(self, name: str, body, length: int) -> Path:
        fid = uuid.uuid4().hex[:16]
        d = self.root / fid
        d.mkdir()
        safe = re.sub(r"[\\/:*?\"<>|\x00-\x1f]+", "_", name).strip(" .") or "file"
        target = d / safe[:150]
        remaining = length
        with open(target, "wb") as f:
            while remaining > 0:
                chunk = body.read(min(1 << 20, remaining))
                if not chunk:
                    break
                f.write(chunk)
                remaining -= len(chunk)
        if remaining:
            shutil.rmtree(d, ignore_errors=True)
            raise ValueError("upload was cut short")
        return target

    def adopt(self, produced: Path) -> Path:
        """Move a tool's output into the store under a fresh id."""
        fid = uuid.uuid4().hex[:16]
        d = self.root / fid
        d.mkdir()
        target = d / produced.name
        shutil.move(str(produced), target)
        return target

    def describe(self, p: Path) -> dict:
        meta = {"id": p.parent.name, "name": p.name, "size": p.stat().st_size, "ext": p.suffix.lower().lstrip(".")}
        meta.update(tools.info(p))
        return meta

    def sweep(self) -> None:
        cutoff = time.time() - KEEP_SECONDS
        for d in self.root.iterdir():
            try:
                if d.stat().st_mtime < cutoff:
                    shutil.rmtree(d, ignore_errors=True)
            except FileNotFoundError:
                pass


store: Store  # set in main() / tests


def sweeper() -> None:
    while True:
        store.sweep()
        time.sleep(600)


class Handler(BaseHTTPRequestHandler):
    server_version = "HubDocuments/1.0"
    protocol_version = "HTTP/1.1"

    def log_message(self, fmt: str, *args) -> None:
        sys.stderr.write("documents: " + (fmt % args) + "\n")

    def _send(self, code: int, body: bytes, ctype: str, extra: dict | None = None) -> None:
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        for k, v in (extra or {}).items():
            self.send_header(k, v)
        self.end_headers()
        self.wfile.write(body)

    def _json(self, code: int, obj: object) -> None:
        self._send(code, json.dumps(obj).encode(), "application/json")

    def _parts(self):
        url = urllib.parse.urlsplit(self.path)
        return [p for p in url.path.split("/") if p], urllib.parse.parse_qs(url.query)

    def do_GET(self) -> None:  # noqa: N802
        parts, q = self._parts()
        if parts == ["health"]:
            return self._json(200, {"status": "ok", "engines": tools.engines()})
        if len(parts) >= 3 and parts[:2] == ["api", "files"]:
            p = store.path(parts[2])
            if not p:
                return self._json(404, {"error": "That file has expired. Add it again."})
            if len(parts) == 3:  # download
                quoted = urllib.parse.quote(p.name)
                disp = "inline" if (q.get("inline") or [""])[0] == "1" else "attachment"
                return self._send(200, p.read_bytes(), mimetypes.guess_type(p.name)[0] or "application/octet-stream",
                                  {"Content-Disposition": f"{disp}; filename*=UTF-8''{quoted}"})
            if parts[3] == "info":
                return self._json(200, store.describe(p))
            if parts[3] == "pages" and len(parts) == 5:
                try:
                    index = int(parts[4].split(".")[0]) - 1
                    width = int((q.get("w") or ["300"])[0])
                    return self._send(200, tools.render(p, index, max(60, min(2400, width))), "image/png",
                                      {"Cache-Control": "private, max-age=3600"})
                except (ValueError, tools.ToolError) as e:
                    return self._json(400, {"error": str(e)})
            return self._json(404, {"error": "not found"})
        return self._static("/".join(parts))

    def do_POST(self) -> None:  # noqa: N802
        parts, q = self._parts()
        length = int(self.headers.get("Content-Length") or 0)
        if parts == ["api", "files"]:
            if length <= 0:
                return self._json(400, {"error": "send the file as the request body"})
            if length > MAX_BYTES:
                self.close_connection = True
                return self._json(413, {"error": f"Files up to {MAX_BYTES // (1024 * 1024)} MB"})
            try:
                p = store.add((q.get("name") or ["file"])[0], self.rfile, length)
            except ValueError as e:
                return self._json(400, {"error": str(e)})
            return self._json(201, store.describe(p))
        if parts == ["api", "run"]:
            try:
                body = json.loads(self.rfile.read(length) or b"{}")
            except json.JSONDecodeError:
                return self._json(400, {"error": "bad request"})
            inputs = [store.path(i) for i in body.get("files") or []]
            if any(p is None for p in inputs):
                return self._json(404, {"error": "A file has expired. Add it again."})
            work = DATA / "work" / uuid.uuid4().hex
            started = time.monotonic()
            try:
                produced = tools.run(str(body.get("tool")), inputs, body.get("options") or {}, work)
                outputs = [store.describe(store.adopt(p)) for p in produced]
            except tools.ToolError as e:
                return self._json(400, {"error": str(e)})
            except Exception as e:  # keep the service up whatever a file does
                self.log_message("tool %s failed: %r", body.get("tool"), e)
                return self._json(500, {"error": "Something went wrong with that file. Try another?"})
            finally:
                shutil.rmtree(work, ignore_errors=True)
            return self._json(200, {"outputs": outputs, "inputSize": sum(p.stat().st_size for p in inputs),
                                    "seconds": round(time.monotonic() - started, 2)})
        return self._json(404, {"error": "not found"})

    def do_DELETE(self) -> None:  # noqa: N802
        parts, _ = self._parts()
        if len(parts) == 3 and parts[:2] == ["api", "files"]:
            p = store.path(parts[2])
            if p:
                shutil.rmtree(p.parent, ignore_errors=True)
            return self._json(200, {"status": "deleted"})
        return self._json(404, {"error": "not found"})

    def _static(self, rel: str) -> None:
        target = (STATIC / (rel or "index.html")).resolve()
        if STATIC.resolve() not in target.parents or not target.is_file():
            target = STATIC / "index.html"
        ctype = mimetypes.guess_type(target.name)[0] or "application/octet-stream"
        if target.suffix == ".js":
            ctype = "text/javascript"
        self._send(200, target.read_bytes(), ctype)


class Server(ThreadingHTTPServer):
    daemon_threads = True

    def handle_error(self, request, client_address) -> None:
        # Clients closing keep-alive connections (Hub's health checker does) aren't errors.
        if isinstance(sys.exc_info()[1], (ConnectionResetError, BrokenPipeError)):
            return
        super().handle_error(request, client_address)


def main() -> None:
    global store
    store = Store(DATA)
    threading.Thread(target=sweeper, daemon=True).start()
    srv = Server((HOST, PORT), Handler)
    e = tools.engines()
    print(f"Documents listening on http://{HOST}:{PORT} · Word export {'on' if e['word'] else 'off'} · "
          f"Office import {'on' if e['office'] else 'off (install LibreOffice)'}", flush=True)
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
