"""Document tools: the engine behind the Documents app.

Every tool takes input file paths plus an options dict and writes its
results into `out` (a directory), returning the output paths. PDF work uses
PyMuPDF; PDF → Word uses pdf2docx; Office → PDF uses LibreOffice.
"""

from __future__ import annotations

import base64
import io
import os
import re
import shutil
import subprocess
import tempfile
import threading
import zipfile
from pathlib import Path

import pymupdf

try:  # optional: PDF → Word (pdf2docx still imports PyMuPDF's old name; hush that notice)
    pymupdf.set_messages(stream=io.StringIO())
    from pdf2docx import Converter as DocxConverter
except ImportError:  # pragma: no cover
    DocxConverter = None
finally:
    pymupdf.set_messages(fd=1)


class ToolError(Exception):
    """A problem the person can fix (wrong password, bad page range, …)."""


OFFICE_EXT = {".doc", ".docx", ".odt", ".rtf", ".txt", ".ppt", ".pptx", ".odp", ".xls", ".xlsx", ".ods", ".csv", ".html", ".htm"}
IMAGE_EXT = {".png", ".jpg", ".jpeg", ".gif", ".bmp", ".tif", ".tiff", ".webp"}


def soffice() -> str | None:
    for name in ("soffice", "libreoffice"):
        path = shutil.which(name)
        if path:
            return path
    for path in (r"C:\Program Files\LibreOffice\program\soffice.exe", r"C:\Program Files (x86)\LibreOffice\program\soffice.exe",
                 "/Applications/LibreOffice.app/Contents/MacOS/soffice"):
        if os.path.exists(path):
            return path
    return None


def engines() -> dict:
    return {"pdf": True, "word": DocxConverter is not None, "office": soffice() is not None}


# ─── helpers ────────────────────────────────────────────────────────────

def open_pdf(path: Path, password: str | None = None) -> pymupdf.Document:
    try:
        doc = pymupdf.open(path)
    except Exception as e:
        raise ToolError(f"{path.name} isn't a readable PDF") from e
    if not doc.is_pdf:
        doc.close()
        raise ToolError(f"{path.name} isn't a PDF")
    if doc.needs_pass and not doc.authenticate(password or ""):
        doc.close()
        raise ToolError(f"{path.name} is password protected. Unlock it first.")
    return doc


def parse_pages(spec: str | None, count: int) -> list[int]:
    """'1-3, 5, 8-' (1-based, inclusive) → 0-based indexes in order."""
    spec = (spec or "").strip().lower()
    if spec in ("", "all"):
        return list(range(count))
    out: list[int] = []
    for part in re.split(r"[,\s]+", spec):
        if not part:
            continue
        m = re.fullmatch(r"(\d*)\s*-\s*(\d*)|(\d+)", part)
        if not m:
            raise ToolError(f"'{part}' isn't a page or range like 3 or 2-5")
        if m.group(3):
            a = b = int(m.group(3))
        else:
            a = int(m.group(1) or 1)
            b = int(m.group(2) or count)
        if a < 1 or b > count or a > b:
            raise ToolError(f"Pages {part} don't exist; this file has {count}")
        out.extend(range(a - 1, b))
    return out


def stem(path: Path) -> str:
    return re.sub(r"[^\w\- ]+", "", path.stem).strip() or "document"


def save(doc: pymupdf.Document, path: Path, **kw) -> Path:
    doc.save(path, garbage=3, deflate=True, **kw)
    return path


def zip_outputs(paths: list[Path], out: Path, name: str) -> list[Path]:
    """One file stays one file; several go into a zip."""
    if len(paths) == 1:
        return paths
    z = out / f"{name}.zip"
    with zipfile.ZipFile(z, "w", zipfile.ZIP_DEFLATED) as zf:
        for p in paths:
            zf.write(p, p.name)
    return [z]


def to_pdf_doc(path: Path) -> pymupdf.Document:
    """Open a PDF, or turn an image into a one-page PDF (for merge)."""
    if path.suffix.lower() in IMAGE_EXT:
        img = pymupdf.open(path)
        pdf = pymupdf.open("pdf", img.convert_to_pdf())
        img.close()
        return pdf
    return open_pdf(path)


def color(hex_color: str | None, default=(0, 0, 0)) -> tuple:
    if not hex_color:
        return default
    h = hex_color.lstrip("#")
    if len(h) == 3:
        h = "".join(c * 2 for c in h)
    try:
        return tuple(int(h[i:i + 2], 16) / 255 for i in (0, 2, 4))
    except ValueError:
        return default


# ─── organize ───────────────────────────────────────────────────────────

def merge(files: list[Path], opts: dict, out: Path) -> list[Path]:
    if len(files) < 2:
        raise ToolError("Add at least two files to merge")
    result = pymupdf.open()
    for f in files:
        with to_pdf_doc(f) as doc:
            result.insert_pdf(doc)
    return [save(result, out / "merged.pdf")]


def split(files: list[Path], opts: dict, out: Path) -> list[Path]:
    src = files[0]
    doc = open_pdf(src)
    n = doc.page_count
    mode = opts.get("mode", "ranges")
    groups: list[list[int]] = []
    if mode == "every":
        size = max(1, int(opts.get("every") or 1))
        groups = [list(range(i, min(i + size, n))) for i in range(0, n, size)]
    elif mode == "extract":
        groups = [parse_pages(opts.get("pages"), n)]
    else:
        ranges = [r for r in re.split(r"[;,]\s*", opts.get("ranges") or "") if r.strip()]
        if not ranges:
            raise ToolError("Give at least one range, e.g. 1-3, 4-6")
        groups = [parse_pages(r, n) for r in ranges]
    paths = []
    for i, pages in enumerate(groups, 1):
        part = pymupdf.open()
        for p in pages:
            part.insert_pdf(doc, from_page=p, to_page=p)
        label = f"{pages[0] + 1}-{pages[-1] + 1}" if len(pages) > 1 else f"{pages[0] + 1}"
        paths.append(save(part, out / f"{stem(src)} pages {label}.pdf"))
    return zip_outputs(paths, out, f"{stem(src)} split")


def remove_pages(files: list[Path], opts: dict, out: Path) -> list[Path]:
    doc = open_pdf(files[0])
    drop = set(parse_pages(opts.get("pages"), doc.page_count))
    if len(drop) >= doc.page_count:
        raise ToolError("That would remove every page")
    doc.select([i for i in range(doc.page_count) if i not in drop])
    return [save(doc, out / f"{stem(files[0])}.pdf")]


def organize(files: list[Path], opts: dict, out: Path) -> list[Path]:
    """opts.pages: [{"index": 0-based source page, "rotate": 0|90|180|270}] in the new order."""
    doc = open_pdf(files[0])
    pages = opts.get("pages") or []
    if not pages:
        raise ToolError("Keep at least one page")
    order = [int(p["index"]) for p in pages]
    if any(i < 0 or i >= doc.page_count for i in order):
        raise ToolError("Unknown page in the new order")
    doc.select(order)
    for new_i, p in enumerate(pages):
        extra = int(p.get("rotate") or 0) % 360
        if extra:
            page = doc[new_i]
            page.set_rotation((page.rotation + extra) % 360)
    return [save(doc, out / f"{stem(files[0])}.pdf")]


def rotate(files: list[Path], opts: dict, out: Path) -> list[Path]:
    angle = int(opts.get("angle") or 90) % 360
    if angle not in (90, 180, 270):
        raise ToolError("Rotate by 90, 180 or 270 degrees")
    results = []
    for f in files:
        doc = open_pdf(f)
        for i in parse_pages(opts.get("pages"), doc.page_count):
            doc[i].set_rotation((doc[i].rotation + angle) % 360)
        results.append(save(doc, out / f"{stem(f)}.pdf"))
    return zip_outputs(results, out, "rotated")


# ─── optimize ───────────────────────────────────────────────────────────

COMPRESSION = {  # (images above this dpi..., are resampled to this dpi, at this JPEG quality)
    "low": (200, 150, 85),
    "recommended": (150, 110, 70),
    "extreme": (100, 72, 50),
}


def compress(files: list[Path], opts: dict, out: Path) -> list[Path]:
    threshold, target, quality = COMPRESSION.get(opts.get("level") or "recommended", COMPRESSION["recommended"])
    results = []
    for f in files:
        doc = open_pdf(f)
        doc.rewrite_images(dpi_threshold=threshold, dpi_target=target, quality=quality)
        try:
            doc.subset_fonts()
        except Exception:
            pass  # fonts we can't subset are kept whole
        path = out / f"{stem(f)} compressed.pdf"
        doc.save(path, garbage=4, deflate=True, deflate_images=True, deflate_fonts=True, clean=True, use_objstms=1)
        # Never hand back something bigger than what came in.
        if path.stat().st_size >= f.stat().st_size:
            shutil.copyfile(f, path)
        results.append(path)
    return zip_outputs(results, out, "compressed")


# ─── convert to PDF ─────────────────────────────────────────────────────

PAGE_SIZES = {"a4": pymupdf.paper_rect("a4"), "letter": pymupdf.paper_rect("letter")}


def images_to_pdf(files: list[Path], opts: dict, out: Path) -> list[Path]:
    size = opts.get("size") or "fit"
    margin = {"none": 0, "small": 18, "big": 42}.get(opts.get("margin") or "none", 0)
    landscape = opts.get("orientation") == "landscape"
    doc = pymupdf.open()
    for f in files:
        if f.suffix.lower() not in IMAGE_EXT:
            raise ToolError(f"{f.name} isn't an image")
        try:
            img = pymupdf.open(f)
            rect = img[0].rect
            img.close()
        except Exception as e:
            raise ToolError(f"{f.name} isn't a readable image") from e
        if size == "fit":
            page = doc.new_page(width=rect.width + 2 * margin, height=rect.height + 2 * margin)
        else:
            paper = PAGE_SIZES[size]
            w, h = (paper.height, paper.width) if landscape else (paper.width, paper.height)
            page = doc.new_page(width=w, height=h)
        area = page.rect + (margin, margin, -margin, -margin)
        page.insert_image(area, filename=str(f), keep_proportion=True)
    name = stem(files[0]) if len(files) == 1 else "images"
    return [save(doc, out / f"{name}.pdf")]


_office_lock = threading.Lock()  # LibreOffice runs one conversion at a time


def office_to_pdf(files: list[Path], opts: dict, out: Path) -> list[Path]:
    exe = soffice()
    if not exe:
        raise ToolError("Office conversion needs LibreOffice. Install it on the Hub machine (libreoffice.org), then try again.")
    results = []
    for f in files:
        if f.suffix.lower() not in OFFICE_EXT:
            raise ToolError(f"{f.name}: use Word, PowerPoint, Excel, OpenDocument, RTF, text or HTML files")
        with _office_lock, tempfile.TemporaryDirectory() as tmp:
            profile = Path(tmp) / "profile"
            cmd = [exe, f"-env:UserInstallation={profile.as_uri()}", "--headless", "--norestore",
                   "--convert-to", "pdf", "--outdir", tmp, str(f)]
            try:
                subprocess.run(cmd, capture_output=True, timeout=180, check=False)
            except subprocess.TimeoutExpired as e:
                raise ToolError(f"{f.name} took too long to convert") from e
            made = Path(tmp) / (f.stem + ".pdf")
            if not made.exists():
                raise ToolError(f"LibreOffice couldn't open {f.name}. Check the file, and that LibreOffice's "
                                "Writer, Calc and Impress parts are installed.")
            target = out / f"{stem(f)}.pdf"
            shutil.move(str(made), target)
            results.append(target)
    return zip_outputs(results, out, "converted")


# ─── convert from PDF ───────────────────────────────────────────────────

def pdf_to_images(files: list[Path], opts: dict, out: Path) -> list[Path]:
    fmt = "jpg" if opts.get("format") == "jpg" else "png"
    dpi = max(50, min(300, int(opts.get("dpi") or 150)))
    doc = open_pdf(files[0])
    paths = []
    for i in parse_pages(opts.get("pages"), doc.page_count):
        pix = doc[i].get_pixmap(dpi=dpi, alpha=False)
        p = out / f"{stem(files[0])} page {i + 1}.{fmt}"
        if fmt == "jpg":
            pix.save(p, jpg_quality=88)
        else:
            pix.save(p)
        paths.append(p)
    return zip_outputs(paths, out, f"{stem(files[0])} images")


def pdf_to_word(files: list[Path], opts: dict, out: Path) -> list[Path]:
    if DocxConverter is None:
        raise ToolError("PDF to Word needs pdf2docx: pip install -r apps/documents/requirements.txt")
    open_pdf(files[0]).close()  # friendly errors for bad or locked files
    target = out / f"{stem(files[0])}.docx"
    cv = DocxConverter(str(files[0]))
    try:
        cv.convert(str(target))
    finally:
        cv.close()
    return [target]


def pdf_to_text(files: list[Path], opts: dict, out: Path) -> list[Path]:
    doc = open_pdf(files[0])
    parts = [f"--- Page {i + 1} ---\n{doc[i].get_text('text').strip()}\n" for i in range(doc.page_count)]
    target = out / f"{stem(files[0])}.txt"
    target.write_text("\n".join(parts), encoding="utf-8")
    return [target]


# ─── edit ───────────────────────────────────────────────────────────────

POSITIONS = {
    "bottom-center": ("bottom", 1), "bottom-right": ("bottom", 2), "bottom-left": ("bottom", 0),
    "top-center": ("top", 1), "top-right": ("top", 2), "top-left": ("top", 0),
}


def page_numbers(files: list[Path], opts: dict, out: Path) -> list[Path]:
    doc = open_pdf(files[0])
    where, align = POSITIONS.get(opts.get("position") or "bottom-center", ("bottom", 1))
    start = int(opts.get("start") or 1)
    style = opts.get("style") or "n"
    size = float(opts.get("size") or 11)
    pages = parse_pages(opts.get("pages"), doc.page_count)
    total = len(pages)
    for k, i in enumerate(pages):
        page = doc[i]
        n = start + k
        text = {"n": f"{n}", "page": f"Page {n}", "of": f"Page {n} of {start + total - 1}"}.get(style, f"{n}")
        r = page.rect  # visible page; convert to unrotated space for drawing
        box = pymupdf.Rect(36, r.height - 36 - size * 1.6, r.width - 36, r.height - 30) if where == "bottom" \
            else pymupdf.Rect(36, 26, r.width - 36, 30 + size * 1.6)
        page.insert_textbox(box * page.derotation_matrix, text, fontsize=size, fontname="helv", align=align,
                            color=color(opts.get("color"), (0.2, 0.2, 0.2)), rotate=page.rotation)
    return [save(doc, out / f"{stem(files[0])}.pdf")]


def watermark(files: list[Path], opts: dict, out: Path) -> list[Path]:
    text = (opts.get("text") or "").strip()
    if not text:
        raise ToolError("Type the watermark text")
    size = float(opts.get("size") or 54)
    opacity = max(0.05, min(1.0, float(opts.get("opacity") or 0.18)))
    angle = float(opts.get("angle") if opts.get("angle") not in (None, "") else 45)
    fill = color(opts.get("color"), (0.75, 0.1, 0.1))
    results = []
    for f in files:
        doc = open_pdf(f)
        for i in parse_pages(opts.get("pages"), doc.page_count):
            page = doc[i]
            width = pymupdf.get_text_length(text, fontname="helv", fontsize=size)
            center = pymupdf.Point(page.rect.width / 2, page.rect.height / 2) * page.derotation_matrix
            start = pymupdf.Point(center.x - width / 2, center.y + size / 3)
            page.insert_text(start, text, fontsize=size, fontname="helv", color=fill, fill_opacity=opacity,
                             stroke_opacity=opacity, morph=(center, pymupdf.Matrix(-angle - page.rotation)))
        results.append(save(doc, out / f"{stem(f)}.pdf"))
    return zip_outputs(results, out, "watermarked")


def edit(files: list[Path], opts: dict, out: Path) -> list[Path]:
    """Apply editor operations. Coordinates are PDF points on the page as
    seen (rotation applied), origin top-left:
      text   {page, x, y, w, h, text, size, color}
      rect   {page, x, y, w, h, fill, opacity}        whiteout / highlight / box
      ink    {page, points: [[x, y], …], color, width}
      image  {page, x, y, w, h, data: data-URL PNG/JPEG}  image / signature
      redact {page, x, y, w, h}                        removes what's underneath
    """
    doc = open_pdf(files[0])
    redacted = set()
    for op in opts.get("ops") or []:
        try:
            page = doc[int(op["page"])]
        except (KeyError, IndexError, ValueError) as e:
            raise ToolError("An edit points at a page that doesn't exist") from e
        m = page.derotation_matrix
        kind = op.get("type")
        if kind in ("text", "rect", "image", "redact"):
            x, y, w, h = (float(op.get(k) or 0) for k in ("x", "y", "w", "h"))
            rect = pymupdf.Rect(x, y, x + max(w, 1), y + max(h, 1)) * m
        if kind == "text":
            size = float(op.get("size") or 14)
            body = str(op.get("text") or "")
            # Grow the box until the text fits (insert_textbox returns < 0 on overflow).
            for _ in range(20):
                shape = page.new_shape()
                left = shape.insert_textbox(rect, body, fontsize=size, fontname="helv",
                                            color=color(op.get("color")), rotate=page.rotation)
                if left >= 0:
                    shape.commit()
                    break
                rect = pymupdf.Rect(rect.x0, rect.y0, rect.x1 + size, rect.y1 + size)
        elif kind == "rect":
            opacity = float(op.get("opacity") if op.get("opacity") not in (None, "") else 1)
            page.draw_rect(rect, color=None, fill=color(op.get("fill"), (1, 1, 1)), fill_opacity=opacity, overlay=True)
        elif kind == "ink":
            pts = [pymupdf.Point(float(a), float(b)) * m for a, b in op.get("points") or []]
            if len(pts) >= 2:
                page.draw_polyline(pts, color=color(op.get("color")), width=float(op.get("width") or 2),
                                   lineCap=1, lineJoin=1, closePath=False)
        elif kind == "image":
            data = str(op.get("data") or "")
            raw = base64.b64decode(data.split(",", 1)[-1]) if data else b""
            if not raw:
                raise ToolError("An image edit has no picture")
            page.insert_image(rect, stream=raw, keep_proportion=True, rotate=(360 - page.rotation) % 360)
        elif kind == "redact":
            page.add_redact_annot(rect, fill=(0, 0, 0))
            redacted.add(page.number)
        else:
            raise ToolError(f"Unknown edit '{kind}'")
    for n in redacted:
        doc[n].apply_redactions()
    return [save(doc, out / f"{stem(files[0])}.pdf")]


# ─── security ───────────────────────────────────────────────────────────

def protect(files: list[Path], opts: dict, out: Path) -> list[Path]:
    pw = opts.get("password") or ""
    if len(pw) < 4:
        raise ToolError("Use a password of at least 4 characters")
    results = []
    for f in files:
        doc = open_pdf(f)
        perm = pymupdf.PDF_PERM_ACCESSIBILITY | pymupdf.PDF_PERM_PRINT | pymupdf.PDF_PERM_COPY
        results.append(save(doc, out / f"{stem(f)} protected.pdf", encryption=pymupdf.PDF_ENCRYPT_AES_256,
                            owner_pw=pw, user_pw=pw, permissions=perm))
    return zip_outputs(results, out, "protected")


def unlock(files: list[Path], opts: dict, out: Path) -> list[Path]:
    results = []
    for f in files:
        try:
            doc = pymupdf.open(f)
        except Exception as e:
            raise ToolError(f"{f.name} isn't a readable PDF") from e
        if doc.needs_pass and not doc.authenticate(opts.get("password") or ""):
            raise ToolError(f"Wrong password for {f.name}")
        results.append(save(doc, out / f"{stem(f)} unlocked.pdf", encryption=pymupdf.PDF_ENCRYPT_NONE))
    return zip_outputs(results, out, "unlocked")


# ─── registry + previews ────────────────────────────────────────────────

TOOLS = {
    "merge": merge, "split": split, "remove": remove_pages, "organize": organize, "rotate": rotate,
    "compress": compress, "images-to-pdf": images_to_pdf, "office-to-pdf": office_to_pdf,
    "pdf-to-images": pdf_to_images, "pdf-to-word": pdf_to_word, "pdf-to-text": pdf_to_text,
    "page-numbers": page_numbers, "watermark": watermark, "edit": edit, "protect": protect, "unlock": unlock,
}


def run(tool: str, files: list[Path], opts: dict, out: Path) -> list[Path]:
    fn = TOOLS.get(tool)
    if not fn:
        raise ToolError(f"Unknown tool '{tool}'")
    if not files:
        raise ToolError("Add a file first")
    out.mkdir(parents=True, exist_ok=True)
    return fn(files, opts or {}, out)


def info(path: Path) -> dict:
    if path.suffix.lower() != ".pdf":
        return {"pdf": False}
    try:
        doc = pymupdf.open(path)
    except Exception:
        return {"pdf": False}
    if doc.needs_pass:
        return {"pdf": True, "encrypted": True, "pages": None}
    return {"pdf": True, "encrypted": False, "pages": doc.page_count,
            "sizes": [[round(p.rect.width, 2), round(p.rect.height, 2)] for p in doc],
            "title": (doc.metadata or {}).get("title") or ""}


def render(path: Path, index: int, width: int) -> bytes:
    doc = open_pdf(path)
    if index < 0 or index >= doc.page_count:
        raise ToolError("No such page")
    page = doc[index]
    zoom = max(0.1, min(4.0, width / page.rect.width))
    pix = page.get_pixmap(matrix=pymupdf.Matrix(zoom, zoom), alpha=False)
    return pix.tobytes("png")
