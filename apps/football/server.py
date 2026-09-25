"""Football: Hub's first service app.

Live scores, results, fixtures and tables from ESPN's public scoreboard
feed (no API key). Standard library only, so it runs anywhere Python 3.10+
does:

    python apps/football/server.py

Hub proxies /apps/football/* here and polls /health every 30 seconds.
Settings (env vars):
    FOOTBALL_PORT        default 8101 (must match "upstream" in hub.json)
    FOOTBALL_ESPN_BASE   default https://site.api.espn.com
"""

from __future__ import annotations

import json
import mimetypes
import os
import sys
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

HOST = "127.0.0.1"  # only Hub may reach a service app
PORT = int(os.environ.get("FOOTBALL_PORT", "8101"))
ESPN = os.environ.get("FOOTBALL_ESPN_BASE", "https://site.api.espn.com").rstrip("/")
STATIC = Path(__file__).with_name("static")

# Hub's league ids (shared with the Football settings page) → ESPN codes.
LEAGUES = {
    "pl": ("eng.1", "Premier League"),
    "ucl": ("uefa.champions", "Champions League"),
    "fa": ("eng.fa", "FA Cup"),
    "liga": ("esp.1", "La Liga"),
    "sa": ("ita.1", "Serie A"),
    "bl": ("ger.1", "Bundesliga"),
}

# How far back and ahead the feed looks for results and fixtures.
PAST_DAYS, AHEAD_DAYS = 10, 28


class UpstreamError(Exception):
    pass


class Cache:
    """Tiny TTL cache so Hub's refreshes don't hammer the data source."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._items: dict[str, tuple[float, object]] = {}

    def get(self, key: str):
        with self._lock:
            item = self._items.get(key)
            if item and item[0] > time.monotonic():
                return item[1]
        return None

    def put(self, key: str, value: object, ttl: float) -> None:
        with self._lock:
            self._items[key] = (time.monotonic() + ttl, value)


cache = Cache()


def fetch_json(url: str, ttl: float) -> dict:
    hit = cache.get(url)
    if hit is not None:
        return hit  # type: ignore[return-value]
    req = urllib.request.Request(url, headers={"User-Agent": "Hub-Football/1.0"})
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.load(resp)
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as e:
        raise UpstreamError(f"football data unavailable: {e}") from e
    cache.put(url, data, ttl)
    return data


def _club(team: dict) -> dict:
    color = (team.get("color") or "6B6457").lstrip("#")
    return {
        "name": team.get("shortDisplayName") or team.get("displayName") or "?",
        "fullName": team.get("displayName") or "",
        "code": team.get("abbreviation") or (team.get("displayName") or "?")[:3].upper(),
        "color": "#" + color,
    }


def normalize(ev: dict, league_id: str) -> dict | None:
    comp = (ev.get("competitions") or [{}])[0]
    sides = {c.get("homeAway"): c for c in comp.get("competitors", [])}
    if "home" not in sides or "away" not in sides:
        return None
    status = comp.get("status") or ev.get("status") or {}
    stype = status.get("type") or {}
    state = stype.get("state", "pre")
    score = None
    if state != "pre":
        score = {"home": str(sides["home"].get("score", "0")), "away": str(sides["away"].get("score", "0"))}
    minute = None
    if state == "in":
        desc = (stype.get("description") or "").lower()
        minute = "HT" if "half" in desc and "time" in desc else (status.get("displayClock") or "").strip() or None
    return {
        "id": ev.get("id"),
        "leagueId": league_id,
        "league": LEAGUES[league_id][1],
        "kickoff": ev.get("date"),
        "state": state,
        "minute": minute,
        "status": stype.get("shortDetail") or stype.get("description") or "",
        "venue": ((comp.get("venue") or {}).get("fullName")) or "",
        "home": _club(sides["home"].get("team") or {}),
        "away": _club(sides["away"].get("team") or {}),
        "score": score,
    }


def scoreboard(league_id: str, start: datetime, end: datetime) -> list[dict]:
    code = LEAGUES[league_id][0]
    q = urllib.parse.urlencode({"dates": f"{start:%Y%m%d}-{end:%Y%m%d}", "limit": "300"})
    url = f"{ESPN}/apis/site/v2/sports/soccer/{code}/scoreboard?{q}"
    # Anything spanning today refreshes every minute; other ranges rarely change.
    today = datetime.now(timezone.utc).date()
    ttl = 60 if start.date() <= today <= end.date() else 900
    data = fetch_json(url, ttl)
    out = []
    for ev in data.get("events", []):
        m = normalize(ev, league_id)
        if m:
            out.append(m)
    return out


def standings(league_id: str) -> list[dict]:
    code = LEAGUES[league_id][0]
    data = fetch_json(f"{ESPN}/apis/v2/sports/soccer/{code}/standings", 1800)
    groups = data.get("children") or [data]
    rows = []
    for g in groups:
        for entry in ((g.get("standings") or {}).get("entries") or []):
            stats = {s.get("name"): s.get("value") for s in entry.get("stats", [])}
            team = entry.get("team") or {}
            rows.append({
                "group": g.get("name") if len(groups) > 1 else None,
                "club": _club(team),
                "played": int(stats.get("gamesPlayed") or 0),
                "won": int(stats.get("wins") or 0),
                "drawn": int(stats.get("ties") or 0),
                "lost": int(stats.get("losses") or 0),
                "gd": int(stats.get("pointDifferential") or 0),
                "points": int(stats.get("points") or 0),
                "rank": int(stats.get("rank") or 0),
            })
    rows.sort(key=lambda r: (r["group"] or "", r["rank"] or 999, -r["points"]))
    return rows


def _parse_time(iso: str | None) -> datetime:
    if not iso:
        return datetime.max.replace(tzinfo=timezone.utc)
    iso = iso.replace("Z", "+00:00")
    if len(iso) == 22 and iso[16] == "+":  # "2026-09-20T14:00+00:00" (no seconds)
        iso = iso[:16] + ":00" + iso[16:]
    return datetime.fromisoformat(iso)


def feed(leagues: list[str], clubs: list[str], idle: str, window: int, count: int, now: datetime | None = None) -> dict:
    """The Home widget's carousel, mirroring the Football settings page."""
    now = now or datetime.now(timezone.utc)
    wanted = [l for l in leagues if l in LEAGUES]
    club_names = {c.strip().lower() for c in clubs if c.strip()}
    # Followed clubs can play in any league, so look everywhere for them.
    scan = list(LEAGUES) if club_names else wanted
    start, end = now - timedelta(days=PAST_DAYS), now + timedelta(days=AHEAD_DAYS)

    def is_club(m: dict) -> bool:
        for side in ("home", "away"):
            c = m[side]
            if {c["name"].lower(), c["fullName"].lower(), c["code"].lower()} & club_names:
                return True
        return False

    matches, errors = [], []
    for lid in scan:
        try:
            for m in scoreboard(lid, start, end):
                club = is_club(m)
                if club or lid in wanted:
                    m["club"] = club
                    matches.append(m)
        except UpstreamError as e:
            errors.append(str(e))
    if errors and not matches:
        raise UpstreamError(errors[0])

    first = lambda m: (not m["club"],)  # followed clubs lead
    live = sorted((m for m in matches if m["state"] == "in"), key=lambda m: (first(m), _parse_time(m["kickoff"])))
    upcoming = sorted((m for m in matches if m["state"] == "pre"), key=lambda m: _parse_time(m["kickoff"]))
    results = sorted((m for m in matches if m["state"] == "post"), key=lambda m: _parse_time(m["kickoff"]), reverse=True)

    next_days = None
    if upcoming:
        next_days = max(0, (_parse_time(upcoming[0]["kickoff"]).date() - now.date()).days)

    def order(ms: list[dict]) -> list[dict]:
        return sorted(ms, key=first)[:count]  # stable: keeps time order within groups

    if live:
        n = len(live)
        return {"mode": "live", "note": f"{n} {'match' if n == 1 else 'matches'} live",
                "matches": live[:count], "nextMatchInDays": next_days}

    mode = idle if idle in ("results", "fixtures") else (
        "fixtures" if next_days is not None and next_days <= window else "results")
    if mode == "fixtures" and not upcoming:
        mode = "results"
    if mode == "results" and not results and upcoming:
        mode = "fixtures"

    if next_days is None:
        note = "No upcoming matches"
    elif next_days == 0:
        note = "Kickoff today"
    elif next_days == 1:
        note = "Kickoff tomorrow" if mode == "fixtures" else "Next match tomorrow"
    else:
        note = f"Kickoff in {next_days} days" if mode == "fixtures" else f"Next match in {next_days} days"
    return {"mode": mode, "note": note, "matches": order(upcoming if mode == "fixtures" else results),
            "nextMatchInDays": next_days}


class Handler(BaseHTTPRequestHandler):
    server_version = "HubFootball/1.0"

    def log_message(self, fmt: str, *args) -> None:  # quieter than the default
        sys.stderr.write("football: " + (fmt % args) + "\n")

    def _json(self, code: int, body: object) -> None:
        raw = json.dumps(body).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def do_GET(self) -> None:  # noqa: N802 (http.server naming)
        url = urllib.parse.urlsplit(self.path)
        q = urllib.parse.parse_qs(url.query)
        arg = lambda k, d="": (q.get(k) or [d])[0]
        try:
            if url.path == "/health":
                return self._json(200, {"status": "ok"})
            if url.path == "/api/feed":
                split = lambda k: [x for x in arg(k).split(",") if x]
                return self._json(200, feed(
                    leagues=split("leagues"), clubs=split("clubs"), idle=arg("idle", "auto"),
                    window=int(arg("window", "2") or 2), count=max(1, min(20, int(arg("count", "5") or 5)))))
            if url.path == "/api/scoreboard":
                lid = arg("league", "pl")
                if lid not in LEAGUES:
                    return self._json(400, {"error": "unknown league"})
                day = datetime.now(timezone.utc)
                back, ahead = int(arg("back", "0") or 0), int(arg("ahead", "0") or 0)
                ms = scoreboard(lid, day - timedelta(days=back), day + timedelta(days=ahead))
                return self._json(200, {"league": LEAGUES[lid][1], "matches": ms})
            if url.path == "/api/table":
                lid = arg("league", "pl")
                if lid not in LEAGUES:
                    return self._json(400, {"error": "unknown league"})
                return self._json(200, {"league": LEAGUES[lid][1], "rows": standings(lid)})
            if url.path == "/api/leagues":
                return self._json(200, [{"id": k, "name": v[1]} for k, v in LEAGUES.items()])
            return self._static(url.path)
        except UpstreamError as e:
            return self._json(502, {"error": str(e)})
        except ValueError:
            return self._json(400, {"error": "bad request"})

    def _static(self, path: str) -> None:
        rel = path.lstrip("/") or "index.html"
        target = (STATIC / rel).resolve()
        if STATIC.resolve() not in target.parents or not target.is_file():
            target = STATIC / "index.html"  # client-side routes
        body = target.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", mimetypes.guess_type(target.name)[0] or "application/octet-stream")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


def main() -> None:
    srv = ThreadingHTTPServer((HOST, PORT), Handler)
    print(f"Football listening on http://{HOST}:{PORT}", flush=True)
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
