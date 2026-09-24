# Hub

Personal app store: one Go binary + React frontend + SQLite. See `Hub — System Design.md`.

## Layout

- `cmd/hub/` — binary entrypoint
- `internal/config/` — env vars
- `internal/store/` — SQLite + migrations
- `internal/registry/` — scan `apps/`, validate `hub.json`
- `internal/proxy/` — reverse proxy per service app (M4)
- `internal/health/` — poll service apps (M4)
- `internal/integrations/` — weather, calendar providers (M5)
- `internal/auth/` — password, sessions (M6)
- `internal/api/` — JSON handlers
- `web/` — React + TS + Tailwind frontend (embedded in binary)
- `apps/` — app folders, each with `hub.json` + icon
- `data/` — `hub.db`, logs (git-ignored)

## Prerequisites

- Go 1.22+ — a local copy lives in `.tools/go` (downloaded, git-ignored);
  `build.ps1` uses it when `go` isn't on PATH
- Node 20+

> Windows note: Smart App Control in enforced mode blocks the freshly built
> unsigned `hub.exe`. During development run the server with
> `go run ./cmd/hub` (works fine); allow-list the release binary before
> running it as a service.

## Dev

```powershell
# frontend (Vite proxies /api + /apps to Go on :8080)
cd web; npm.cmd install; npm.cmd run dev

# backend
$env:Path = "$pwd\.tools\go\bin;" + $env:Path
go run ./cmd/hub
# open http://127.0.0.1:8080
```

## End-to-end tests

```powershell
node e2e.cjs   # hub.exe must be up on :8080; 12 checks across every route
```

## Build

```powershell
.\build.ps1
.\data\hub.exe  # or .\hub.exe depending on output
```

## Milestones

M0 skeleton → M1 registry + static app → M2 shell → M3 home+launcher → M4 service apps → M5 status strip → M6 auth → M7 transcribe. See System Design § Build plan.
