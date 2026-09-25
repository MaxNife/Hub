# Hub

Personal app store: one Go binary + React frontend + SQLite. Drop a folder
with a `hub.json` into `apps/` and it shows up. See
`instructions/Hub — System Design.md` and the mockups in
`instructions/mockups/`.

## Layout

- `cmd/hub/` — binary entrypoint (`hub`, `hub hash-password`)
- `internal/config/` — env vars
- `internal/store/` — SQLite, migrations, retention, backups
- `internal/registry/` — scan `apps/`, validate `hub.json`
- `internal/serve/`, `internal/proxy/` — static apps and service-app reverse proxy
- `internal/health/` — 30 s health checks for service apps
- `internal/integrations/` — weather (Open-Meteo) and calendar (ICS) providers
- `internal/auth/` — password, sessions, CSRF header, login throttling
- `internal/api/` — JSON handlers
- `internal/spa/`, `internal/logging/`, `internal/maint/` — shell serving, logs, daily housekeeping
- `web/` — React + TS frontend (embedded in the binary)
- `apps/` — the apps: Converter, Meal picker, Memory, Reaction, Puzzle,
  Random, Name generator (static); Football, Transcribe, Documents (service)
- `appkit/` — theme snippet, the app kit (home header, settings sheet,
  storage) every app uses, and the game kit games add on top
- `data/` — `hub.db`, logs, backups (git-ignored)

## Prerequisites

- Go 1.25+ and Node 20+
- Python 3.10+ for the service apps (Football needs nothing else;
  Transcribe needs `pip install -r apps/transcribe/requirements.txt`;
  Documents needs `pip install -r apps/documents/requirements.txt`, plus
  LibreOffice for Word/Excel/PowerPoint → PDF)

> Windows note: Smart App Control in enforced mode blocks the freshly built
> unsigned `hub.exe`. During development run the server with
> `go run ./cmd/hub`; allow-list the release binary before running it as a
> service.

## Dev

```powershell
# frontend (Vite proxies /api + /apps/ to Go on :8080)
cd web; npm.cmd install; npm.cmd run dev

# backend (needs web/dist once: npm.cmd run build)
go run ./cmd/hub
# open http://127.0.0.1:8080

# service apps, each in its own terminal (or NSSM / systemd in production)
python apps/football/server.py      # :8101
python apps/transcribe/server.py    # :8102
python apps/documents/server.py     # :8103
```

Hub checks service apps every 30 seconds; a stopped one gets a red dot and
an offline screen, and recovers on its own (or with Retry) once it's back.

## Configuration

| Setting | Env var | Default |
| --- | --- | --- |
| Listen address | `HUB_ADDR` | `127.0.0.1:8080` |
| Apps folder | `HUB_APPS_DIR` | `./apps` |
| Data folder | `HUB_DATA_DIR` | `./data` |
| Password hash | `HUB_PASSWORD_HASH` | none; required if not on localhost |
| Calendar ICS link | `HUB_CALENDAR_ICS` | none; the status line hides the event |
| TLS certificate + key | `HUB_TLS_CERT`, `HUB_TLS_KEY` | none |
| Log level | `HUB_LOG_LEVEL` | `info` |

Weather location and units are set in the app: Settings → Weather and calendar.
Football's leagues and clubs: Settings → Football.

## Sign-in and remote access

```powershell
.\hub.exe hash-password            # type a password (8+ characters)
$env:HUB_PASSWORD_HASH = '<hash>'  # single quotes: the hash contains $
```

With a hash set, Hub asks for the password and keeps you signed in for 30
days. Hub refuses to listen beyond localhost without one. For your phone,
prefer a private network over opening a port: for example
`tailscale serve --bg 8080` keeps Hub on `127.0.0.1` and gives you HTTPS on
your tailnet. To serve HTTPS directly instead, set `HUB_TLS_CERT` and
`HUB_TLS_KEY`.

## Tests

```powershell
go test ./...                                   # server packages
python -m unittest apps/football/test_server.py apps/transcribe/test_server.py
python -m unittest discover apps/documents
python appkit/sync.py --check    # apps carry the current app/game kit
node e2e.cjs     # hub must be running on :8080 from the repo root, no password set
cd web; npm.cmd run lint; npx tsc -b
```

## Build

```powershell
.\build.ps1      # frontend, then hub.exe with it embedded
.\hub.exe
```

## Milestones

M0 skeleton → M1 registry + static app → M2 shell → M3 home + launcher →
M4 service apps → M5 status strip → M6 auth → M7 transcribe. All built; see
System Design § Build plan.
