"""Documents HTTP tests. Run: python -m unittest apps/documents/test_server.py"""

import importlib.util
import json
import pathlib
import sys
import tempfile
import threading
import unittest
import urllib.error
import urllib.request

import pymupdf

here = pathlib.Path(__file__).parent
sys.path.insert(0, str(here))
spec = importlib.util.spec_from_file_location("documents_server", here / "server.py")
ds = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ds)


def pdf_bytes(pages=2):
    doc = pymupdf.open()
    for i in range(pages):
        doc.new_page().insert_text((72, 90), f"Page {i + 1}", fontsize=20)
    return doc.tobytes()


class ServerTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        ds.DATA = pathlib.Path(self.tmp.name)
        ds.store = ds.Store(ds.DATA)
        self.srv = ds.Server(("127.0.0.1", 0), ds.Handler)
        threading.Thread(target=self.srv.serve_forever, daemon=True).start()
        self.base = f"http://127.0.0.1:{self.srv.server_port}"

    def tearDown(self):
        self.srv.shutdown()
        self.srv.server_close()
        self.tmp.cleanup()

    def call(self, method, path, body=None, ctype=None):
        req = urllib.request.Request(self.base + path, data=body, method=method)
        if ctype:
            req.add_header("Content-Type", ctype)
        with urllib.request.urlopen(req) as r:
            raw = r.read()
            return r.status, r.headers, (json.loads(raw) if r.headers.get_content_type() == "application/json" else raw)

    def upload(self, name, data):
        return self.call("POST", "/api/files?name=" + urllib.parse.quote(name), data)[2]

    def test_upload_info_render_run_download(self):
        a = self.upload("A.pdf", pdf_bytes(2))
        b = self.upload("B.pdf", pdf_bytes(1))
        self.assertEqual((a["pdf"], a["pages"], a["name"]), (True, 2, "A.pdf"))
        _, headers, png = self.call("GET", f"/api/files/{a['id']}/pages/1.png?w=120")
        self.assertTrue(png.startswith(b"\x89PNG"))
        _, _, out = self.call("POST", "/api/run", json.dumps({"tool": "merge", "files": [a["id"], b["id"]]}).encode(), "application/json")
        merged = out["outputs"][0]
        self.assertEqual((merged["name"], merged["pages"]), ("merged.pdf", 3))
        _, headers, raw = self.call("GET", f"/api/files/{merged['id']}")
        self.assertIn("attachment", headers["Content-Disposition"])
        self.assertEqual(pymupdf.open("pdf", raw).page_count, 3)

    def test_errors_are_friendly(self):
        a = self.upload("A.pdf", pdf_bytes(1))
        with self.assertRaises(urllib.error.HTTPError) as cm:
            self.call("POST", "/api/run", json.dumps({"tool": "merge", "files": [a["id"]]}).encode())
        self.assertEqual(json.loads(cm.exception.read())["error"], "Add at least two files to merge")
        cm.exception.close()
        with self.assertRaises(urllib.error.HTTPError) as cm:
            self.call("GET", "/api/files/0123456789abcdef")
        self.assertEqual(cm.exception.code, 404)
        cm.exception.close()
        with self.assertRaises(urllib.error.HTTPError) as cm:
            self.call("GET", "/api/files/../../etc/passwd")
        self.assertEqual(cm.exception.code, 404)
        cm.exception.close()

    def test_upload_limit_and_sweep(self):
        old = ds.MAX_BYTES
        ds.MAX_BYTES = 10
        try:
            with self.assertRaises(urllib.error.HTTPError) as cm:
                self.upload("big.pdf", b"x" * 20)
            self.assertEqual(cm.exception.code, 413)
            cm.exception.close()
        finally:
            ds.MAX_BYTES = old
        a = self.upload("A.pdf", pdf_bytes(1))
        import os, time
        folder = ds.store.root / a["id"]
        os.utime(folder, (time.time() - 3 * 3600,) * 2)
        ds.store.sweep()
        self.assertFalse(folder.exists())

    def test_health_and_page(self):
        _, _, health = self.call("GET", "/health")
        self.assertTrue(health["engines"]["pdf"])
        _, headers, page = self.call("GET", "/")
        self.assertIn(b"<title>Documents</title>", page)
        _, headers, js = self.call("GET", "/app.js")
        self.assertEqual(headers.get_content_type(), "text/javascript")


if __name__ == "__main__":
    unittest.main()
