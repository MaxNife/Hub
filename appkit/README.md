# App kit

Each app is served only from its own folder (`/apps/{id}/`), so apps can't
load shared files at runtime. New static apps copy `theme-head.html` into
their `<head>`. It:

- follows Hub's light/dark choice (the `hub:theme` key, readable because
  apps share Hub's origin), including live changes;
- defines Hub's colour tokens (`--paper`, `--surface`, `--ink`, `--muted`,
  `--line`, `--dash`, `--live`, `--focus`, `--bad`) and fonts;
- adds the common pieces: `h1`, `.sub`, `.ink-btn`, `.pill-btn`, `.seg`.

App rules still apply: relative URLs only, and prefix `localStorage` keys
with the app id.

## Game kit

`game-kit.js` and `game-kit.css` give every game the same home screen:
Continue (when a game is saved), difficulty, New game, stats, Settings
(sound effects, music, volume, the game's own options, reset stats) and
How to play. Sound and music are synthesised with Web Audio, so there is
nothing to download. A game calls `GameKit.create({...})` with its
difficulties, options, `stats()`, `saved()`, `onNew`, `onContinue` and
`onPause`, and puts `kit.menuButton()` in its top bar. Settings live in
`<id>:settings`. Hub can open a game at `#continue` or `#new`.

Games load their own copy, so after editing run:

    python appkit/sync.py          # copy into every game that uses it
    python appkit/sync.py --check  # exit 1 if a copy is stale
