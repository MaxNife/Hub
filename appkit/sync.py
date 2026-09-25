"""Copy the app kit and game kit into every app that uses them.

Apps are served only from their own folder, so each app carries a copy of
the kit files its index.html references (`./app-kit.js`, `./game-kit.css`,
…). Run after editing anything in appkit/:

    python appkit/sync.py          # copy
    python appkit/sync.py --check  # exit 1 if any copy is stale (for tests)
"""
import pathlib
import sys

KIT = pathlib.Path(__file__).parent
APPS = KIT.parent / "apps"
FILES = ["app-kit.js", "app-kit.css", "game-kit.js", "game-kit.css"]


def pages():
    """(folder the page is served from, the files it references) for each app."""
    for index in sorted(list(APPS.glob("*/dist/index.html")) + list(APPS.glob("*/static/index.html"))):
        html = index.read_text(encoding="utf-8")
        used = [name for name in FILES if f"./{name}" in html]
        if used:
            yield index.parent, used


def main() -> int:
    check = "--check" in sys.argv
    stale, problems = [], []
    for folder, used in pages():
        if "game-kit.js" in used and "app-kit.js" not in used:
            problems.append(f"{folder.relative_to(APPS)}: game-kit.js needs app-kit.js loaded first")
        for name in used:
            src, dst = (KIT / name).read_bytes(), folder / name
            if not dst.exists() or dst.read_bytes() != src:
                stale.append(str(dst.relative_to(KIT.parent)))
                if not check:
                    dst.write_bytes(src)
    for p in problems:
        print("problem:", p)
    if check and stale:
        print("stale kit copies (run python appkit/sync.py):", *stale, sep="\n  ")
        return 1
    names = sorted({folder.relative_to(APPS).parts[0] for folder, _ in pages()})
    print(("up to date" if check else "synced") + f": {', '.join(names)}")
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
