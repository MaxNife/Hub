"""Engine tests on real files. Run: python -m unittest apps/documents/test_tools.py"""

import importlib.util
import pathlib
import sys
import tempfile
import unittest
import zipfile

import pymupdf

here = pathlib.Path(__file__).parent
sys.path.insert(0, str(here))
spec = importlib.util.spec_from_file_location("doc_tools", here / "tools.py")
tools = importlib.util.module_from_spec(spec)
spec.loader.exec_module(tools)


def make_pdf(path: pathlib.Path, pages: int, label: str = "Page") -> pathlib.Path:
    doc = pymupdf.open()
    for i in range(pages):
        page = doc.new_page()
        page.insert_text((72, 100), f"{label} {i + 1}", fontsize=24)
        page.insert_text((72, 140), "Confidential salary 90000", fontsize=12)
    doc.save(path)
    return path


def text_of(path, i=0):
    with pymupdf.open(path) as d:
        return d[i].get_text()


class ToolsTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.dir = pathlib.Path(self.tmp.name)
        self.out = self.dir / "out"
        self.a = make_pdf(self.dir / "a.pdf", 3, "Alpha")
        self.b = make_pdf(self.dir / "b.pdf", 2, "Beta")

    def tearDown(self):
        self.tmp.cleanup()

    def run_tool(self, tool, files, **opts):
        return tools.run(tool, files, opts, self.out)

    def pages(self, path):
        with pymupdf.open(path) as d:
            return d.page_count

    def test_parse_pages(self):
        self.assertEqual(tools.parse_pages("1-3, 5", 6), [0, 1, 2, 4])
        self.assertEqual(tools.parse_pages("4-", 6), [3, 4, 5])
        self.assertEqual(tools.parse_pages("all", 3), [0, 1, 2])
        with self.assertRaises(tools.ToolError):
            tools.parse_pages("7", 6)
        with self.assertRaises(tools.ToolError):
            tools.parse_pages("x", 6)

    def test_merge_includes_images(self):
        png = self.dir / "pic.png"
        pix = pymupdf.Pixmap(pymupdf.csRGB, pymupdf.IRect(0, 0, 40, 30), 0)
        pix.set_rect(pix.irect, (255, 150, 0))
        pix.save(png)
        [out] = self.run_tool("merge", [self.a, self.b, png])
        self.assertEqual(self.pages(out), 6)
        self.assertIn("Beta 1", text_of(out, 3))

    def test_split_modes(self):
        [z] = self.run_tool("split", [self.a], mode="ranges", ranges="1-2, 3")
        with zipfile.ZipFile(z) as zf:
            self.assertEqual(sorted(zf.namelist()), ["a pages 1-2.pdf", "a pages 3.pdf"])
        [one] = tools.run("split", [self.a], {"mode": "extract", "pages": "2"}, self.dir / "o2")
        self.assertEqual(self.pages(one), 1)
        self.assertIn("Alpha 2", text_of(one))
        [z3] = tools.run("split", [self.a], {"mode": "every", "every": 1}, self.dir / "o3")
        with zipfile.ZipFile(z3) as zf:
            self.assertEqual(len(zf.namelist()), 3)

    def test_remove_organize_rotate(self):
        [out] = self.run_tool("remove", [self.a], pages="2")
        self.assertEqual(self.pages(out), 2)
        self.assertIn("Alpha 3", text_of(out, 1))
        [org] = tools.run("organize", [self.a], {"pages": [{"index": 2, "rotate": 90}, {"index": 0}]}, self.dir / "o2")
        with pymupdf.open(org) as d:
            self.assertEqual((d.page_count, d[0].rotation, d[1].rotation), (2, 90, 0))
            self.assertIn("Alpha 3", d[0].get_text())
        [rot] = tools.run("rotate", [self.a], {"angle": 180, "pages": "1"}, self.dir / "o3")
        with pymupdf.open(rot) as d:
            self.assertEqual([p.rotation for p in d], [180, 0, 0])
        with self.assertRaises(tools.ToolError):
            tools.run("remove", [self.a], {"pages": "1-3"}, self.dir / "o4")

    def test_compress_never_grows(self):
        doc = pymupdf.open()
        page = doc.new_page()
        pix = pymupdf.Pixmap(pymupdf.csRGB, pymupdf.IRect(0, 0, 1600, 1600), 0)
        for y in range(0, 1600, 40):  # noisy stripes so there is something to squeeze
            pix.set_rect(pymupdf.IRect(0, y, 1600, y + 20), ((y * 7) % 255, (y * 3) % 255, 90))
        page.insert_image(pymupdf.Rect(0, 0, 200, 200), pixmap=pix)
        big = self.dir / "big.pdf"
        doc.save(big)
        [out] = self.run_tool("compress", [big], level="extreme")
        self.assertLessEqual(out.stat().st_size, big.stat().st_size)

    def test_images_to_pdf(self):
        png = self.dir / "scan.png"
        pymupdf.Pixmap(pymupdf.csRGB, pymupdf.IRect(0, 0, 300, 400), 0).save(png)
        [out] = self.run_tool("images-to-pdf", [png, png], size="a4", margin="small")
        with pymupdf.open(out) as d:
            self.assertEqual(d.page_count, 2)
            self.assertAlmostEqual(d[0].rect.width, 595, delta=1)

    def test_pdf_to_images_text_word(self):
        [z] = self.run_tool("pdf-to-images", [self.a], format="jpg", dpi=72)
        with zipfile.ZipFile(z) as zf:
            self.assertEqual(len(zf.namelist()), 3)
        [txt] = tools.run("pdf-to-text", [self.a], {}, self.dir / "t")
        self.assertIn("--- Page 2 ---\nAlpha 2", txt.read_text())
        if tools.DocxConverter:
            [docx] = tools.run("pdf-to-word", [self.a], {}, self.dir / "w")
            self.assertEqual(docx.suffix, ".docx")
            with zipfile.ZipFile(docx) as zf:
                self.assertIn("Alpha 1", zf.read("word/document.xml").decode())

    @unittest.skipUnless(tools.soffice(), "LibreOffice not installed")
    def test_office_to_pdf(self):
        from docx import Document  # comes with pdf2docx
        d = Document()
        d.add_heading("Quarterly report", 0)
        d.add_paragraph("Revenue went up.")
        src = self.dir / "report.docx"
        d.save(src)
        [out] = self.run_tool("office-to-pdf", [src])
        self.assertIn("Quarterly report", text_of(out))

    def test_page_numbers_and_watermark(self):
        [out] = self.run_tool("page-numbers", [self.a], style="of", position="bottom-right")
        self.assertIn("Page 3 of 3", text_of(out, 2))
        [wm] = tools.run("watermark", [self.a], {"text": "DRAFT", "opacity": 0.2}, self.dir / "w")
        self.assertIn("DRAFT", text_of(wm, 1))
        with self.assertRaises(tools.ToolError):
            tools.run("watermark", [self.a], {"text": " "}, self.dir / "w2")

    def test_edit_ops_and_redaction(self):
        sig = self.dir / "sig.png"
        pymupdf.Pixmap(pymupdf.csRGB, pymupdf.IRect(0, 0, 60, 20), 0).save(sig)
        import base64
        data = "data:image/png;base64," + base64.b64encode(sig.read_bytes()).decode()
        ops = [
            {"page": 0, "type": "text", "x": 72, "y": 200, "w": 150, "h": 20, "text": "Approved by Hope", "size": 14, "color": "#1e7a48"},
            {"page": 0, "type": "rect", "x": 60, "y": 120, "w": 300, "h": 30, "fill": "#ffffff"},
            {"page": 0, "type": "ink", "points": [[72, 300], [120, 320], [160, 300]], "color": "#000", "width": 2},
            {"page": 1, "type": "image", "x": 72, "y": 400, "w": 120, "h": 40, "data": data},
            {"page": 1, "type": "redact", "x": 60, "y": 125, "w": 300, "h": 20},
        ]
        [out] = self.run_tool("edit", [self.a], ops=ops)
        with pymupdf.open(out) as d:
            self.assertIn("Approved by Hope", d[0].get_text())
            self.assertNotIn("salary", d[1].get_text())  # redaction really removes text
            self.assertIn("salary", d[2].get_text())
            self.assertEqual(len(d[1].get_images()), 1)

    def test_edit_rotated_page_keeps_text_upright(self):
        doc = pymupdf.open(self.a)
        doc[0].set_rotation(90)
        rot = self.dir / "rot.pdf"
        doc.save(rot)
        [out] = self.run_tool("edit", [rot], ops=[{"page": 0, "type": "text", "x": 50, "y": 50, "w": 200, "h": 30, "text": "Hello", "size": 16}])
        with pymupdf.open(out) as d:
            words = d[0].get_text("words")  # unrotated coordinates
            hello = [w for w in words if w[4] == "Hello"][0]
            seen = pymupdf.Rect(hello[:4]) * d[0].rotation_matrix
            self.assertLess(seen.x0, 70)  # where it was placed on the visible page
            self.assertLess(seen.y0, 70)
            self.assertGreater(seen.width, seen.height)  # reads left to right, not sideways

    def test_protect_then_unlock(self):
        [locked] = self.run_tool("protect", [self.a], password="s3cret")
        with pymupdf.open(locked) as d:
            self.assertTrue(d.needs_pass)
        with self.assertRaises(tools.ToolError):
            tools.run("merge", [locked, self.b], {}, self.dir / "m")
        with self.assertRaises(tools.ToolError):
            tools.run("unlock", [locked], {"password": "nope"}, self.dir / "u0")
        [free] = tools.run("unlock", [locked], {"password": "s3cret"}, self.dir / "u")
        with pymupdf.open(free) as d:
            self.assertFalse(d.needs_pass)
            self.assertIn("Alpha 1", d[0].get_text())

    def test_info_and_render(self):
        meta = tools.info(self.a)
        self.assertEqual((meta["pages"], meta["sizes"][0]), (3, [595.0, 842.0]))
        png = tools.render(self.a, 0, 200)
        self.assertTrue(png.startswith(b"\x89PNG"))


if __name__ == "__main__":
    unittest.main()
