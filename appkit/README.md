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
