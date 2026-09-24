# Hub — build progress (memory)

Date: 24 Sep 2026. Stack: Go backend + React+TS frontend + SQLite. Status: M0–M3 done, verified end to end. Server runs on `http://127.0.0.1:8080`.

## Done

- **M0 skeleton**: Go binary (`cmd/hub/main.go`), config (`internal/config`, env vars per System Design), SQLite + migrations (`internal/store`, `001_init.sql`, WAL), `/healthz`, React build embedded via root `frontend.go` (`//go:embed web/dist` — embed lives at module root because `go:embed` forbids `..`), SPA fallback for client routes, request logging.
- **M1 registry + static apps**: `internal/registry` validates `hub.json` (version 1, id↔folder, name 1–20 chars, category, in-folder icon, static→`entry/index.html`, service→localhost-only `upstream`, unknown fields ignored). Bad manifests → skipped + logged + `GET /api/registry/errors`. `internal/serve` serves `/apps/{id}/*` (installed-only, traversal guard, trailing-slash redirect, SPA fallback, icon served from app root, `hub.json` stays private; service → 501 until M4).
- **Full JSON API** (`internal/api`): apps list/detail, install/hide, pin/unpin, opened→recent, categories with counts, rescan, status stub. Missing `app_state` row = installed (new apps appear, hide sets 0).
- **M2 shell** (`web/`): sidebar + categories + All apps (Install/Hide/Pin) + Favorites + Recent pages + Settings (rescan, manifest errors) + Ctrl+K palette over live apps. Mock data fallback when backend down; honest empty states when up.
- **App-mode launch UX**: opening an app goes full-bleed (no sidebar/padding), splash screen (icon + name + shimmer, min 850ms + iframe onLoad, then fade), slim blurred chrome (menu drawer · home · name · pop-out), sidebar as overlay drawer. Esc-to-home was tried and **removed** (accidental navigation).
- **M3 apps**: Converter (length/weight/volume/temp + **live currency** via `open.er-api.com`, frankfurter fallback, 24h cache, offline note, ↻ refresh), Memory (8-pair flip game, fits viewport exactly, best in `memory:best`), Meal picker (shuffle pick, editable list, `meal-picker:meals/last`). Home Recently-used orders by real `opened_at` with relative times; widgets read apps' shared localStorage (Memory best, tonight's pick).
- **E2E**: `e2e.cjs`, 13/13 passing (health, shell, SPA fallback, CRUD state, pin, hide-gates-iframe, static/icon/redirect/traversal/privacy 404s, broken-manifest isolation, all 3 apps serving).

## How to run

- Backend: `& 'C:\Program Files\Go\bin\go.exe' run ./cmd/hub` (system Go 1.27.0; plain `go` not on PATH in non-interactive shells — re-login may fix). `HUB_ADDR`/`HUB_APPS_DIR`/`HUB_DATA_DIR` envs, defaults `127.0.0.1:8080`/`./apps`/`./data`. Frontend dev: `cd web; npm.cmd run dev` (proxies `/api`+`/apps` → :8080). Build: `.\build.ps1`. Tests: `node e2e.cjs` (needs server on :8080).
- Go toolchain: user installed system-wide; `.tools/` holds only `GO_LOCATION.md` — **do not re-download a local toolchain**.

## Environment gotchas

- Smart App Control (enforced) blocks unsigned `hub.exe` (CodeIntegrity 3077/3118) → dev via `go run`; release binary needs allow-listing (noted in README).
- PowerShell 5.1 non-interactive: no `&&`, no `echo`/`head`; use `;`, `Write-Host`, `Select-Object`. `Invoke-WebRequest` prompts fail → use `curl.exe`. Complex `node -e` quoting breaks → write `.cjs` files instead.
- No desktop browser connected → verify via `curl.exe` + served-bundle string checks, not screenshots.
- `go run` binaries are named `hub.exe` — `taskkill /IM hub.exe` kills the dev server too.

## Next (per System Design build plan)

- **M4 service apps**: reverse proxy + 30s health checker + health dots + offline state; Football as first service app.
- **M5 status strip**: provider framework, Open-Meteo weather, calendar ICS, health summary (strip currently static pills).
- **M6 auth**: password login, sessions, middleware, HTTPS.
- **M7 transcribe**: Python service with background jobs.
- Later: Reaction/Puzzle/Random/Names static apps; widgets/actions/AI hooks (manifest already forward-compatible).
