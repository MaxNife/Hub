"""Copy the game kit into every game that uses it.

Apps are served only from their own folder, so each game carries a copy.
Run after editing appkit/game-kit.js or game-kit.css:

    python appkit/sync.py          # copy
    python appkit/sync.py --check  # exit 1 if any copy is stale (for tests)
"""
import pathlib
import sys

KIT = pathlib.Path(__file__).parent
APPS = KIT.parent / "apps"
FILES = ["game-kit.js", "game-kit.css"]


def games():
    for index in sorted(APPS.glob("*/dist/index.html")):
        if "game-kit.js" in index.read_text(encoding="utf-8"):
            yield index.parent


def main() -> int:
    check = "--check" in sys.argv
    stale = []
    for dist in games():
        for name in FILES:
            src, dst = (KIT / name).read_bytes(), dist / name
            if not dst.exists() or dst.read_bytes() != src:
                stale.append(str(dst.relative_to(KIT.parent)))
                if not check:
                    dst.write_bytes(src)
    if check and stale:
        print("stale game kit copies:", *stale, sep="\n  ")
        return 1
    print(("up to date" if check else "synced") + f": {', '.join(d.parent.name for d in games())}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
