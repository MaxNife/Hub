"""Transcribe tests with a fake speech engine. Run: python -m unittest apps/transcribe/test_server.py"""

import importlib.util
import json
import pathlib
import tempfile
import threading
import time
import unittest
import urllib.error
import urllib.request
from http.server import ThreadingHTTPServer

spec = importlib.util.spec_from_file_location("transcribe_server", pathlib.Path(__file__).with_name("server.py"))
ts = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ts)


class FakeEngine:
    """Three segments over a 90-second 'recording'; slow enough to observe."""
    name = "fake"
    gate = threading.Event()

    def available(self):
        return True

    def transcribe(self, path, language, progress, stop):
        if path.read_bytes() == b"broken":
            raise RuntimeError("invalid data found when processing input")
        progress(0.0, 90.0, language or "en")
        for i, (a, b, text) in enumerate([(0, 30, "Hello and welcome."), (30, 61.5, "This is Hub."), (61.5, 90, "Goodbye.")]):
            self.gate.wait(5)
            if stop():
                raise ts.Cancelled()
            progress(b / 90.0, 90.0, language or "en")
            yield a, b, text


class TranscribeTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        FakeEngine.gate.set()
        ts.jobs = ts.Jobs(pathlib.Path(self.tmp.name), FakeEngine())
        self.srv = ThreadingHTTPServer(("127.0.0.1", 0), ts.Handler)
        threading.Thread(target=self.srv.serve_forever, daemon=True).start()
        self.base = f"http://127.0.0.1:{self.srv.server_port}"

    def tearDown(self):
        self.srv.shutdown()
        self.srv.server_close()
        self.tmp.cleanup()

    def req(self, method, path, body=None):
        r = urllib.request.Request(self.base + path, data=body, method=method)
        with urllib.request.urlopen(r) as resp:
            raw = resp.read()
            return resp.status, (json.loads(raw) if resp.headers.get_content_type() == "application/json" else raw.decode())

    def wait(self, jid, status, ready=lambda job: True):
        for _ in range(100):
            _, job = self.req("GET", f"/api/jobs/{jid}")
            if job["status"] == status and ready(job):
                return job
            time.sleep(0.05)
        self.fail(f"job never reached {status}: {job}")

    def test_upload_transcribe_download(self):
        code, job = self.req("POST", "/api/jobs?name=Standup%20notes.m4a&language=en", b"\x00" * 2048)
        self.assertEqual((code, job["status"], job["size"], job["language"]), (201, job["status"], 2048, "en"))
        done = self.wait(job["id"], "done")
        self.assertEqual(done["text"], "Hello and welcome. This is Hub. Goodbye.")
        self.assertEqual((done["progress"], done["duration"]), (1.0, 90.0))
        _, srt = self.req("GET", f"/api/jobs/{job['id']}/transcript.srt")
        self.assertIn("2\n00:00:30,000 --> 00:01:01,500\nThis is Hub.", srt)
        _, txt = self.req("GET", f"/api/jobs/{job['id']}/transcript.txt")
        self.assertEqual(txt, "Hello and welcome. This is Hub. Goodbye.\n")

    def test_progress_is_visible_while_running(self):
        FakeEngine.gate.clear()
        _, job = self.req("POST", "/api/jobs?name=long.wav", b"\x00" * 10)
        running = self.wait(job["id"], "running", lambda j: j["duration"])
        self.assertEqual((running["duration"], running["progress"]), (90.0, 0.0))
        _, second = self.req("POST", "/api/jobs?name=next.wav", b"\x00" * 10)
        self.assertEqual(self.req("GET", f"/api/jobs/{second['id']}")[1]["queuePosition"], 1)
        FakeEngine.gate.set()
        self.wait(job["id"], "done")
        self.wait(second["id"], "done")

    def test_cancel_and_bad_file(self):
        FakeEngine.gate.clear()
        _, job = self.req("POST", "/api/jobs?name=a.wav", b"\x00" * 10)
        self.wait(job["id"], "running")
        self.assertEqual(self.req("DELETE", f"/api/jobs/{job['id']}")[0], 200)
        FakeEngine.gate.set()
        with self.assertRaises(urllib.error.HTTPError) as cm:
            self.req("GET", f"/api/jobs/{job['id']}")
        self.assertEqual(cm.exception.code, 404)
        _, bad = self.req("POST", "/api/jobs?name=bad.mp3", b"broken")
        err = self.wait(bad["id"], "error")
        self.assertIn("Couldn't transcribe", err["error"])

    def test_restart_requeues_running_jobs(self):
        FakeEngine.gate.clear()
        _, job = self.req("POST", "/api/jobs?name=a.wav", b"\x00" * 10)
        self.wait(job["id"], "running")
        again = ts.Jobs(pathlib.Path(self.tmp.name), FakeEngine())  # simulates a restart
        self.assertEqual(again.get(job["id"])["status"], "queued")
        FakeEngine.gate.set()

    def test_health_and_page(self):
        code, health = self.req("GET", "/health")
        self.assertEqual((code, health["engine"]), (200, "fake"))
        self.assertIn("<title>Transcribe</title>", self.req("GET", "/")[1])


if __name__ == "__main__":
    unittest.main()
