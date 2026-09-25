# Apps

Each app is a folder with `hub.json` + an icon. Hub never imports app code;
it only reads the manifest (see System Design § The app contract).

| App | Type | Notes |
| --- | --- | --- |
| converter, meal-picker, memory, reaction, puzzle, random, names | static | Files in `dist/`, served by Hub |
| football | service, :8101 | `python apps/football/server.py` — ESPN scoreboard feed, no key |
| transcribe | service, :8102 | `pip install -r apps/transcribe/requirements.txt`, then `python apps/transcribe/server.py` |

New static apps: copy `appkit/theme-head.html` into `<head>` so they share
Hub's colours and follow its light/dark choice. Use relative URLs only, and
prefix `localStorage` keys with the app id. Service apps bind to
`127.0.0.1`, answer `GET /health`, and keep their own data in
`apps/<id>/data/` (git-ignored).
