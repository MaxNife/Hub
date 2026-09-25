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


def form(tool, files, **options):
    """Build the multipart request the browser sends."""
    b = "testboundary42"
    parts = [f'--{b}\r\nContent-Disposition: form-data; name="request"\r\n\r\n'.encode()
             + json.dumps({"tool": tool, "options": options}).encode() + b"\r\n"]
    for name, data in files:
        parts.append(f'--{b}\r\nContent-Disposition: form-data; name="file"; filename="{name}"\r\n'
                     f"Content-Type: application/pdf\r\n\r\n".encode() + data + b"\r\n")
    parts.append(f"--{b}--\r\n".encode())
    return b"".join(parts), f"multipart/form-data; boundary={b}"


class ServerTest(unittest.TestCase):
    def setUp(self):
        self.srv = ds.Server(("127.0.0.1", 0), ds.Handler)
        threading.Thread(target=self.srv.serve_forever, daemon=True).start()
        self.base = f"http://127.0.0.1:{self.srv.server_port}"

    def tearDown(self):
        self.srv.shutdown()
        self.srv.server_close()

    def call(self, method, path, body=None, ctype=None):
        req = urllib.request.Request(self.base + path, data=body, method=method)
        if ctype:
            req.add_header("Content-Type", ctype)
        with urllib.request.urlopen(req) as r:
            raw = r.read()
            return r.status, r.headers, (json.loads(raw) if r.headers.get_content_type() == "application/json" else raw)

    def run_tool(self, tool, files, **options):
        body, ctype = form(tool, files, **options)
        _, headers, raw = self.call("POST", "/api/run", body, ctype)
        return ds.parse_multipart(raw, headers["Content-Type"])

    def test_run_returns_files_and_keeps_nothing(self):
        before = set(pathlib.Path(tempfile.gettempdir()).iterdir())
        [(field, name, data)] = self.run_tool("merge", [("A.pdf", pdf_bytes(2)), ("B.pdf", pdf_bytes(1))])
        self.assertEqual((field, name), ("file", "merged.pdf"))
        self.assertEqual(pymupdf.open("pdf", data).page_count, 3)
        outs = self.run_tool("split", [("Report.pdf", pdf_bytes(3))], mode="every", every=1)
        self.assertEqual(len(outs), 1)
        self.assertTrue(outs[0][1].endswith(".zip"))
        self.assertEqual(set(pathlib.Path(tempfile.gettempdir()).iterdir()) - before, set())

    def test_errors_are_friendly(self):
        body, ctype = form("merge", [("A.pdf", pdf_bytes(1))])
        with self.assertRaises(urllib.error.HTTPError) as cm:
            self.call("POST", "/api/run", body, ctype)
        self.assertEqual(json.loads(cm.exception.read())["error"], "Add at least two files to merge")
        cm.exception.close()
        with self.assertRaises(urllib.error.HTTPError) as cm:
            self.call("POST", "/api/run", b"{}", "application/json")
        self.assertEqual(cm.exception.code, 400)
        cm.exception.close()
        with self.assertRaises(urllib.error.HTTPError) as cm:
            self.call("POST", "/api/files", b"x")
        self.assertEqual(cm.exception.code, 404)
        cm.exception.close()

    def test_request_limit(self):
        old = ds.MAX_BYTES
        ds.MAX_BYTES = 10
        try:
            body, ctype = form("compress", [("big.pdf", b"x" * 20)])
            with self.assertRaises(urllib.error.HTTPError) as cm:
                self.call("POST", "/api/run", body, ctype)
            self.assertEqual(cm.exception.code, 413)
            cm.exception.close()
        finally:
            ds.MAX_BYTES = old

    def test_health_and_page(self):
        _, _, health = self.call("GET", "/health")
        self.assertTrue(health["engines"]["pdf"])
        _, headers, page = self.call("GET", "/")
        self.assertIn(b"<title>Documents</title>", page)
        _, headers, js = self.call("GET", "/app.js")
        self.assertEqual(headers.get_content_type(), "text/javascript")
        _, _, fallback = self.call("GET", "/../../etc/passwd")
        self.assertIn(b"<title>Documents</title>", fallback)


if __name__ == "__main__":
    unittest.main()
