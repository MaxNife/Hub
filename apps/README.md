# Apps

Each app is a folder with `hub.json` + an icon. Hub never imports app code;
it only reads the manifest (see System Design § The app contract).

| App | Type | Notes |
| --- | --- | --- |
| converter, meal-picker, memory, reaction, puzzle, random, names | static | Files in `dist/`, served by Hub |
| football | service, :8101 | `python apps/football/server.py` — ESPN scoreboard feed, no key |
| transcribe | service, :8102 | `pip install -r apps/transcribe/requirements.txt`, then `python apps/transcribe/server.py` |
| documents | service, :8103 | `pip install -r apps/documents/requirements.txt`, then `python apps/documents/server.py`; Office → PDF also needs LibreOffice |

New static apps: copy `appkit/theme-head.html` into `<head>` so they share
Hub's colours and follow its light/dark choice. Use relative URLs only, and
prefix `localStorage` keys with the app id. Service apps bind to
`127.0.0.1`, answer `GET /health`, and keep their own data in
`apps/<id>/data/` (git-ignored).

Every app and game opens on its own home screen with its own settings,
built with `appkit/app-kit.js` (games add `game-kit.js`). Widgets on Hub's
Home only have settings. Edit the kit in `appkit/`, then run
`python appkit/sync.py` to update each app's copy.

Documents keeps files on the user's device: its server is stateless and
never stores uploads or results.
