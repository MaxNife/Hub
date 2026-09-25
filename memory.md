# Hub — build progress (memory)

Updated 25 Sep 2026. Stack: Go backend + React/TS frontend + SQLite, Python service apps. Status: **M0–M7 built**, plus the four extra static apps, Documents and the game kit. Server on `http://127.0.0.1:8080`.

## Built

- **Server** (`cmd/hub`): config from `HUB_*` env, SQLite with embedded migrations (WAL), registry scan + validation, static serving, reverse proxy for service apps (`X-Forwarded-Prefix`, Hub's session cookie stripped, styled offline page on 502), SPA fallback, request logging, graceful shutdown, `hub hash-password`.
- **Operations**: slog JSON to stdout + `data/hub.log` (10 MB × 3, built-in rotator); daily pruning (opens 90 d, health 7 d, expired sessions) and `VACUUM INTO` backups to `data/backups/` (keeps 7).
- **M4 service apps**: health checker every 30 s (3 s timeout, parallel, results in `health_checks`), `POST /api/apps/{id}/check` for Retry; health dots on tiles, offline screen. **Football** (`apps/football`, Python stdlib, :8101): ESPN public scoreboard/standings, `/api/feed` drives Home's carousel from the Football settings (leagues, clubs first, auto/results/fixtures, window, count); its own page has Live & today / Results / Fixtures / Table.
- **M5 status line**: provider framework (per-provider timers, 1-minute retry after a failure, values older than 2 intervals become a dash); Open-Meteo weather (location via Settings → Weather and calendar, place search proxied through `/api/geocode`); ICS calendar next event (RRULE daily/weekly/monthly/yearly, EXDATE, moved instances, TZID incl. common Windows names); health summary.
- **M6 auth**: bcrypt hash in `HUB_PASSWORD_HASH`, 30-day sessions (SHA-256 of token stored), middleware on `/api` + `/apps`, `X-Hub-Request: 1` required on every API write (even without a password), 5 failures → 1-minute lockout, refuses non-loopback `HUB_ADDR` without a hash, optional `HUB_TLS_CERT/KEY`. Login screen in the shell; Sign out in Settings.
- **M7 Transcribe** (`apps/transcribe`, Python, :8102): raw-body upload, SQLite job table, one worker thread, faster-whisper with progress from segment timestamps, restart re-queues running jobs, jobs wait if the engine isn't installed. Audio is deleted when transcription ends; the browser collects each transcript into IndexedDB (`transcribe` db) and deletes it from the server; downloads (.txt/.srt/.vtt) are made in the browser. Uncollected jobs are swept after `TRANSCRIBE_KEEP_HOURS` (168).
- **Frontend**: design from `instructions/mockups/` (paper/ink tokens, Instrument Sans + Bricolage, light sidebar, 104 px greeting, search box, Today rows, Your apps, Football settings, Weather and calendar settings, login). `web/src/api.ts` adds the CSRF header and turns a 401 into the login screen. Memory saves `memory:progress` so Resume restores a game.
- **Documents** (`apps/documents`, Python, :8103): files stay on the user's device. Browser keeps them (Recent files + editor drafts in IndexedDB, 1 day–1 month, 500 MB cap) and renders previews with vendored pdf.js (`static/vendor/pdfjs`, legacy build). Server is stateless: `POST /api/run` multipart in → multipart out, all in memory (`tools.File`); only LibreOffice gets a temp copy (in /dev/shm when available), deleted at once. PyMuPDF engine in `tools.py`; home has unsaved edits, recent files, your tools; settings for keep, auto-download, compression, page size, saved signature.
- **App kit** (`appkit/app-kit.*`): every app has its own home screen + settings (widgets only have settings). Greeting header, settings sheet from `fields`, `kit.store`. Football app settings in `football:app` (seeded from the widget's `football:settings`); `/api/clubs` gives each club's live/last/next.
- **Game kit** (`appkit/game-kit.*`, built on the app kit, synced with `python appkit/sync.py`): home screen with Continue/New game/difficulty/stats, settings (sound, music, volume, options), Web Audio SFX and music, `#continue`/`#new` deep links. Memory: 6/8/12 pairs, face sets; Reaction: relaxed/classic/hard (amber decoys), 3/5/10 tries; Puzzle: 3×3/4×4/5×5, numbers or colours. Hub's `launch(id, from, hash)` passes the hash through to the iframe.
- **Static apps**: Converter, Meal picker, Memory, Reaction, Puzzle, Random, Name generator — all use `appkit/theme-head.html` (Hub tokens, follows `hub:theme`).
- **Tests**: `go test ./...`; `python -m unittest apps/football/test_server.py apps/transcribe/test_server.py` (fake ESPN, fake speech engine); `python -m unittest discover apps/documents` (17, real files); `python appkit/sync.py --check`; `node e2e.cjs` (adds service proxy/health/offline, CSRF, status/settings, all static apps, game kit).

## Not verifiable in the cloud sandbox

ESPN, Open-Meteo and Hugging Face were blocked there, so live football data, real weather/place search and real speech recognition were tested only against local fakes. Check them on the dev machine.

## How to run

- Backend: `go run ./cmd/hub` (needs `web/dist`: `cd web; npm.cmd run build`). Frontend dev: `cd web; npm.cmd run dev`. Build: `.\build.ps1`. Tests: see README.
- Service apps: `python apps/football/server.py`, `python apps/documents/server.py`, `python apps/transcribe/server.py` (after `pip install -r apps/transcribe/requirements.txt`; first run downloads the Whisper model, `TRANSCRIBE_MODEL` defaults to `small`).
- Go toolchain: system Go at `C:\Program Files\Go\bin\go.exe`; `.tools/` holds only `GO_LOCATION.md` — **do not re-download a local toolchain**.

## Environment gotchas

- `cmd/hub/main.go` is now in git. If an older, untracked copy exists locally, move it aside before pulling (git won't overwrite untracked files).
- Smart App Control (enforced) blocks unsigned `hub.exe` (CodeIntegrity 3077/3118) → dev via `go run`; release binary needs allow-listing.
- PowerShell 5.1 non-interactive: no `&&`, no `echo`/`head`; use `;`, `Write-Host`, `Select-Object`. `Invoke-WebRequest` prompts fail → use `curl.exe`. Complex `node -e` quoting breaks → write `.cjs` files instead.
- `go run` binaries are named `hub.exe` — `taskkill /IM hub.exe` kills the dev server too.
- The password hash contains `$`: quote it with single quotes in PowerShell.

## Next

- Widgets and quick actions from manifests (System Design § Later); per-app key-value API; file watching instead of rescan.
- Service apps as Windows services (NSSM) or a Compose file.
