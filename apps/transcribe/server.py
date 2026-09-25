"""Transcribe: audio and video to text, as a Hub service app.

Uploads are queued and transcribed one at a time on a background thread,
so a long recording never blocks a request; the page polls for progress.
Speech recognition uses faster-whisper (local, no API key):

    pip install -r apps/transcribe/requirements.txt
    python apps/transcribe/server.py

Settings (env vars):
    TRANSCRIBE_PORT     default 8102 (must match "upstream" in hub.json)
    TRANSCRIBE_DATA     default apps/transcribe/data (uploads, transcripts, jobs.db)
    TRANSCRIBE_MODEL    faster-whisper model size, default "small"
    TRANSCRIBE_MAX_MB   largest upload accepted, default 2048
"""

from __future__ import annotations

import json
from contextlib import contextmanager
import mimetypes
import os
import queue
import sqlite3
import sys
import threading
import time
import urllib.parse
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

HOST = "127.0.0.1"  # only Hub may reach a service app
PORT = int(os.environ.get("TRANSCRIBE_PORT", "8102"))
DATA = Path(os.environ.get("TRANSCRIBE_DATA", Path(__file__).with_name("data")))
MODEL = os.environ.get("TRANSCRIBE_MODEL", "small")
MAX_BYTES = int(os.environ.get("TRANSCRIBE_MAX_MB", "2048")) * 1024 * 1024
STATIC = Path(__file__).with_name("static")
LANGUAGES = {"auto", "en", "fr", "es", "de", "pt", "it", "nl", "yo", "ig", "ha", "sw", "ar", "zh", "ja"}


class EngineMissing(Exception):
    pass


class Cancelled(Exception):
    pass


class WhisperEngine:
    """faster-whisper, loaded on first use (the model download happens then)."""

    name = "faster-whisper"

    def __init__(self, model: str) -> None:
        self.model_name = model
        self._model = None

    def available(self) -> bool:
        try:
            import faster_whisper  # noqa: F401
            return True
        except ImportError:
            return False

    def transcribe(self, path: Path, language: str | None, progress, stop):
        """Yield (start, end, text) segments, reporting progress 0..1."""
        try:
            from faster_whisper import WhisperModel
        except ImportError as e:
            raise EngineMissing("Speech engine not installed. Run: pip install -r apps/transcribe/requirements.txt") from e
        if self._model is None:
            self._model = WhisperModel(self.model_name, device="auto", compute_type="default")
        segments, info = self._model.transcribe(str(path), language=language, vad_filter=True, beam_size=5)
        duration = max(info.duration or 0.0, 0.001)
        progress(0.0, duration, info.language)
        for seg in segments:
            if stop():
                raise Cancelled()
            progress(min(seg.end / duration, 1.0), duration, info.language)
            yield seg.start, seg.end, seg.text.strip()


class Jobs:
    """Job rows in SQLite, files on disk, one worker thread."""

    def __init__(self, data: Path, engine) -> None:
        self.data = data
        self.engine = engine
        (data / "uploads").mkdir(parents=True, exist_ok=True)
        (data / "transcripts").mkdir(parents=True, exist_ok=True)
        self.db_path = data / "jobs.db"
        self.lock = threading.Lock()
        self.queue: queue.Queue[str] = queue.Queue()
        self.cancelled: set[str] = set()
        with self._db() as db:
            db.execute("""CREATE TABLE IF NOT EXISTS jobs (
                id TEXT PRIMARY KEY, name TEXT NOT NULL, size INTEGER NOT NULL, file TEXT NOT NULL,
                language TEXT NOT NULL DEFAULT 'auto', status TEXT NOT NULL, progress REAL NOT NULL DEFAULT 0,
                duration REAL, detected TEXT, error TEXT,
                created_at REAL NOT NULL, started_at REAL, finished_at REAL)""")
            # A job interrupted by a restart simply runs again.
            db.execute("UPDATE jobs SET status = 'queued', progress = 0 WHERE status = 'running'")
            for (jid,) in db.execute("SELECT id FROM jobs WHERE status = 'queued' ORDER BY created_at"):
                self.queue.put(jid)
        threading.Thread(target=self._work, daemon=True).start()

    @contextmanager
    def _db(self):
        db = sqlite3.connect(self.db_path, timeout=10, isolation_level=None)
        db.row_factory = sqlite3.Row
        try:
            yield db
        finally:
            db.close()

    def _update(self, jid: str, **fields) -> None:
        cols = ", ".join(f"{k} = ?" for k in fields)
        with self.lock, self._db() as db:
            db.execute(f"UPDATE jobs SET {cols} WHERE id = ?", (*fields.values(), jid))

    def create(self, name: str, language: str, body, length: int) -> dict:
        jid = uuid.uuid4().hex[:12]
        ext = Path(name).suffix.lower()[:8] or ".bin"
        path = self.data / "uploads" / f"{jid}{ext}"
        remaining = length
        with open(path, "wb") as f:
            while remaining > 0:
                chunk = body.read(min(1 << 20, remaining))
                if not chunk:
                    break
                f.write(chunk)
                remaining -= len(chunk)
        if remaining:
            path.unlink(missing_ok=True)
            raise ValueError("upload was cut short")
        with self.lock, self._db() as db:
            db.execute("INSERT INTO jobs (id, name, size, file, language, status, created_at) VALUES (?, ?, ?, ?, ?, 'queued', ?)",
                       (jid, name, length, path.name, language, time.time()))
        self.queue.put(jid)
        return self.get(jid)

    def get(self, jid: str, with_text: bool = False) -> dict | None:
        with self._db() as db:
            row = db.execute("SELECT * FROM jobs WHERE id = ?", (jid,)).fetchone()
        if not row:
            return None
        job = {k: row[k] for k in row.keys() if k != "file"}
        job["queuePosition"] = self._position(jid) if job["status"] == "queued" else None
        if with_text and job["status"] == "done":
            job["segments"] = self.segments(jid)
            job["text"] = " ".join(s["text"] for s in job["segments"]).strip()
        return job

    def _position(self, jid: str) -> int:
        with self._db() as db:
            ids = [r[0] for r in db.execute("SELECT id FROM jobs WHERE status IN ('queued', 'running') ORDER BY created_at")]
        return ids.index(jid) if jid in ids else 0

    def list(self) -> list[dict]:
        with self._db() as db:
            ids = [r[0] for r in db.execute("SELECT id FROM jobs ORDER BY created_at DESC LIMIT 100")]
        return [j for j in (self.get(i) for i in ids) if j]

    def segments(self, jid: str) -> list[dict]:
        p = self.data / "transcripts" / f"{jid}.json"
        return json.loads(p.read_text()) if p.exists() else []

    def delete(self, jid: str) -> bool:
        with self._db() as db:
            row = db.execute("SELECT file, status FROM jobs WHERE id = ?", (jid,)).fetchone()
        if not row:
            return False
        if row["status"] in ("queued", "running"):
            self.cancelled.add(jid)
        with self.lock, self._db() as db:
            db.execute("DELETE FROM jobs WHERE id = ?", (jid,))
        (self.data / "uploads" / row["file"]).unlink(missing_ok=True)
        (self.data / "transcripts" / f"{jid}.json").unlink(missing_ok=True)
        return True

    def _work(self) -> None:
        while True:
            jid = self.queue.get()
            if jid in self.cancelled:
                continue
            # No engine yet: keep the job queued until faster-whisper is installed.
            while not self.engine.available():
                time.sleep(15)
            with self._db() as db:
                row = db.execute("SELECT * FROM jobs WHERE id = ?", (jid,)).fetchone()
            if not row or row["status"] != "queued":
                continue
            self._run(jid, row)

    def _run(self, jid: str, row: sqlite3.Row) -> None:
        self._update(jid, status="running", started_at=time.time(), progress=0.0, error=None)
        last = [0.0]

        def progress(fraction: float, duration: float, detected: str | None) -> None:
            now = time.monotonic()
            if now - last[0] >= 0.5 or fraction >= 1.0:  # keep writes cheap
                last[0] = now
                self._update(jid, progress=round(fraction, 4), duration=duration, detected=detected)

        lang = None if row["language"] == "auto" else row["language"]
        try:
            segs = []
            for start, end, text in self.engine.transcribe(self.data / "uploads" / row["file"], lang, progress,
                                                           lambda: jid in self.cancelled):
                segs.append({"start": round(start, 2), "end": round(end, 2), "text": text})
            if jid in self.cancelled:
                raise Cancelled()
            (self.data / "transcripts" / f"{jid}.json").write_text(json.dumps(segs))
            self._update(jid, status="done", progress=1.0, finished_at=time.time())
        except Cancelled:
            pass  # the row is already gone
        except EngineMissing as e:
            self._update(jid, status="error", error=str(e), finished_at=time.time())
        except Exception as e:  # a bad file must not stop the worker
            self._update(jid, status="error", error=f"Couldn't transcribe this file: {e}", finished_at=time.time())


def stamp(t: float, sep: str) -> str:
    ms = int(round(t * 1000))
    h, ms = divmod(ms, 3_600_000)
    m, ms = divmod(ms, 60_000)
    s, ms = divmod(ms, 1000)
    return f"{h:02}:{m:02}:{s:02}{sep}{ms:03}"


def to_srt(segs: list[dict]) -> str:
    return "\n".join(f"{i}\n{stamp(s['start'], ',')} --> {stamp(s['end'], ',')}\n{s['text']}\n"
                     for i, s in enumerate(segs, 1))


def to_vtt(segs: list[dict]) -> str:
    return "WEBVTT\n\n" + "\n".join(f"{stamp(s['start'], '.')} --> {stamp(s['end'], '.')}\n{s['text']}\n" for s in segs)


jobs: Jobs  # set in main() / tests


class Handler(BaseHTTPRequestHandler):
    server_version = "HubTranscribe/1.0"

    def log_message(self, fmt: str, *args) -> None:
        sys.stderr.write("transcribe: " + (fmt % args) + "\n")

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

    def _route(self):
        url = urllib.parse.urlsplit(self.path)
        return url.path, urllib.parse.parse_qs(url.query)

    def do_GET(self) -> None:  # noqa: N802
        path, _ = self._route()
        if path == "/health":
            return self._json(200, {"status": "ok", "engine": jobs.engine.name if jobs.engine.available() else "missing",
                                    "model": MODEL, "queued": jobs.queue.qsize()})
        if path == "/api/jobs":
            return self._json(200, jobs.list())
        if path.startswith("/api/jobs/"):
            parts = path.split("/")[3:]
            job = jobs.get(parts[0], with_text=True)
            if not job:
                return self._json(404, {"error": "no such job"})
            if len(parts) == 1:
                return self._json(200, job)
            if job["status"] != "done":
                return self._json(409, {"error": "not finished yet"})
            fmt = parts[1].rsplit(".", 1)[-1]
            base = Path(job["name"]).stem or "transcript"
            segs = job["segments"]
            body = {"txt": job["text"] + "\n", "srt": to_srt(segs), "vtt": to_vtt(segs)}.get(fmt)
            if body is None:
                return self._json(404, {"error": "unknown format"})
            quoted = urllib.parse.quote(f"{base}.{fmt}")
            return self._send(200, body.encode(), "text/plain; charset=utf-8",
                              {"Content-Disposition": f"attachment; filename*=UTF-8''{quoted}"})
        return self._static(path)

    def do_POST(self) -> None:  # noqa: N802
        path, q = self._route()
        if path != "/api/jobs":
            return self._json(404, {"error": "not found"})
        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            length = 0
        if length <= 0:
            return self._json(400, {"error": "send the file as the request body"})
        if length > MAX_BYTES:
            return self._json(413, {"error": f"files up to {MAX_BYTES // (1024 * 1024)} MB"})
        name = (q.get("name") or ["recording"])[0][:200]
        language = (q.get("language") or ["auto"])[0]
        if language not in LANGUAGES:
            language = "auto"
        try:
            return self._json(201, jobs.create(name, language, self.rfile, length))
        except ValueError as e:
            return self._json(400, {"error": str(e)})

    def do_DELETE(self) -> None:  # noqa: N802
        path, _ = self._route()
        if path.startswith("/api/jobs/") and jobs.delete(path.split("/")[3]):
            return self._json(200, {"status": "deleted"})
        return self._json(404, {"error": "no such job"})

    def _static(self, path: str) -> None:
        rel = path.lstrip("/") or "index.html"
        target = (STATIC / rel).resolve()
        if STATIC.resolve() not in target.parents or not target.is_file():
            target = STATIC / "index.html"
        self._send(200, target.read_bytes(), mimetypes.guess_type(target.name)[0] or "application/octet-stream")


def main() -> None:
    global jobs
    jobs = Jobs(DATA, WhisperEngine(MODEL))
    srv = ThreadingHTTPServer((HOST, PORT), Handler)
    engine = "faster-whisper" if jobs.engine.available() else "missing (pip install -r requirements.txt)"
    print(f"Transcribe listening on http://{HOST}:{PORT} · engine {engine} · model {MODEL}", flush=True)
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
