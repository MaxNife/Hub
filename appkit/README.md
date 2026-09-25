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

## App kit

A widget on Hub's Home only has settings. An app or game needs its own
home screen and settings, as it would if it were installed on its own.
`app-kit.js` and `app-kit.css` give every app the same building blocks:

- `kit.header({ tagline })`: greeting ("Good evening · welcome back"),
  the app's title and a Settings button;
- a Settings sheet built from `fields` (heading, toggle, choice, select,
  range, text, action, custom), saved in `<id>:settings` (or
  `settingsKey`, for an app whose widget already uses that key);
- `kit.store` for namespaced storage, `kit.toast()`, `kit.modal()`,
  `kit.ago()`, and home-screen styles (`.ak-section`, `.ak-chip`,
  `.ak-empty`).

## Game kit

Built on the app kit: games load `app-kit.js`, then `game-kit.js`.
`game-kit.js` and `game-kit.css` give every game the same home screen:
Continue (when a game is saved), difficulty, New game, stats, Settings
(sound effects, music, volume, the game's own options, reset stats) and
How to play. Sound and music are synthesised with Web Audio, so there is
nothing to download. A game calls `GameKit.create({...})` with its
difficulties, options, `stats()`, `saved()`, `onNew`, `onContinue` and
`onPause`, and puts `kit.menuButton()` in its top bar. Hub can open a
game at `#continue` or `#new`.

## Keeping copies in sync

Apps load their own copy of each kit file their `index.html` references,
so after editing anything here run:

    python appkit/sync.py          # copy into every app that uses it
    python appkit/sync.py --check  # exit 1 if a copy is stale
