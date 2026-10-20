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

import gzip
import http.client
import json
import mimetypes
import os
import ssl
import sys
import threading
import time
from concurrent.futures import ThreadPoolExecutor
import urllib.parse
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
    """Tiny TTL cache so Hub's refreshes don't hammer the data source.

    An expired entry is still served for up to STALE × its TTL while a
    background refresh fetches the new one, so pages never wait on ESPN
    for data they've already seen."""

    STALE = 10

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._items: dict[str, tuple[float, float, object]] = {}

    def lookup(self, key: str) -> tuple[bool, object]:
        """(fresh, value); value is None when missing or too old to serve."""
        with self._lock:
            item = self._items.get(key)
        if not item:
            return False, None
        expires, ttl, value = item
        now = time.monotonic()
        if now < expires:
            return True, value
        return False, value if now < expires + ttl * (self.STALE - 1) else None

    def put(self, key: str, value: object, ttl: float) -> None:
        with self._lock:
            self._items[key] = (time.monotonic() + ttl, ttl, value)


cache = Cache()

# Python's TLS handshake with ESPN takes seconds here, so connections are
# kept alive and reused rather than opened per request.
_ssl = ssl.create_default_context()
_pool: dict[tuple[str, str], list[http.client.HTTPConnection]] = {}
_pool_lock = threading.Lock()
# ESPN answers urllib's User-Agent but refuses others (403).
_HEADERS = {
    "User-Agent": f"Python-urllib/{sys.version_info[0]}.{sys.version_info[1]}",
    "Accept-Encoding": "gzip",
}


def _get(url: str) -> bytes:
    parts = urllib.parse.urlsplit(url)
    key = (parts.scheme, parts.netloc)
    path = parts.path + ("?" + parts.query if parts.query else "")
    for attempt in (0, 1):
        with _pool_lock:
            idle = _pool.setdefault(key, [])
            conn = idle.pop() if idle else None
        reused = conn is not None
        if conn is None:
            if parts.scheme == "https":
                conn = http.client.HTTPSConnection(parts.netloc, timeout=10, context=_ssl)
            else:
                conn = http.client.HTTPConnection(parts.netloc, timeout=10)
        try:
            conn.request("GET", path, headers=_HEADERS)
            resp = conn.getresponse()
            body = resp.read()
        except (OSError, http.client.HTTPException) as e:
            conn.close()
            if reused and attempt == 0:
                continue  # the idle connection was dropped; try a fresh one
            raise UpstreamError(f"football data unavailable: {e}") from e
        if resp.will_close:
            conn.close()
        else:
            with _pool_lock:
                if len(_pool[key]) < 16:
                    _pool[key].append(conn)
                else:
                    conn.close()
        if resp.status != 200:
            raise UpstreamError(f"football data unavailable: HTTP {resp.status}")
        if resp.getheader("Content-Encoding") == "gzip":
            body = gzip.decompress(body)
        return body
    raise AssertionError("unreachable")


_loading: dict[str, threading.Lock] = {}
_loading_lock = threading.Lock()


def _load(url: str, ttl: float) -> dict:
    """Fetch url into the cache; concurrent callers share one request."""
    with _loading_lock:
        lock = _loading.setdefault(url, threading.Lock())
    with lock:
        fresh, value = cache.lookup(url)
        if fresh:
            return value  # type: ignore[return-value]
        try:
            data = json.loads(_get(url))
        except ValueError as e:
            raise UpstreamError(f"football data unavailable: {e}") from e
        cache.put(url, data, ttl)
        return data


def _refresh(url: str, ttl: float) -> None:
    with _loading_lock:
        busy = url in _loading and _loading[url].locked()
    if busy:
        return

    def run() -> None:
        try:
            _load(url, ttl)
        except UpstreamError:
            pass  # keep serving the stale copy; the next request retries
    threading.Thread(target=run, daemon=True).start()


def fetch_json(url: str, ttl: float) -> dict:
    fresh, value = cache.lookup(url)
    if value is not None:
        if not fresh:
            _refresh(url, ttl)
        return value  # type: ignore[return-value]
    return _load(url, ttl)


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


def _months(start: datetime, end: datetime) -> list[tuple[int, int]]:
    y, m, out = start.year, start.month, []
    while (y, m) <= (end.year, end.month):
        out.append((y, m))
        y, m = (y + 1, 1) if m == 12 else (y, m + 1)
    return out


def scoreboard(league_id: str, start: datetime, end: datetime) -> list[dict]:
    """Matches kicking off between start and end (UTC days, inclusive).

    ESPN refuses day ranges but takes whole months, so fetch each month
    the range touches and keep the days asked for."""
    code = LEAGUES[league_id][0]
    today = datetime.now(timezone.utc)
    first, last = start.date(), end.date()
    out, seen = [], set()
    for y, mo in _months(start, end):
        q = urllib.parse.urlencode({"dates": f"{y:04d}{mo:02d}", "limit": "300"})
        # This month refreshes every minute; other months rarely change.
        ttl = 60 if (y, mo) == (today.year, today.month) else 900
        data = fetch_json(f"{ESPN}/apis/site/v2/sports/soccer/{code}/scoreboard?{q}", ttl)
        for ev in data.get("events", []):
            m = normalize(ev, league_id)
            if m and m["id"] not in seen and first <= _parse_time(m["kickoff"]).date() <= last:
                seen.add(m["id"])
                out.append(m)
    return out


def scan(league_ids: list[str], start: datetime, end: datetime) -> tuple[list[dict], list[str]]:
    """Scoreboards for several leagues at once, with any errors."""
    def one(lid: str):
        try:
            return scoreboard(lid, start, end), None
        except UpstreamError as e:
            return [], str(e)
    matches, errors = [], []
    with ThreadPoolExecutor(max_workers=max(1, len(league_ids))) as pool:
        for ms, err in pool.map(one, league_ids):
            matches.extend(ms)
            if err:
                errors.append(err)
    return matches, errors


def teams(query: str, limit: int = 10) -> list[dict]:
    """Clubs in the supported leagues whose name or code matches query,
    so the settings save exactly the names the scoreboard uses."""
    def one(lid: str):
        code = LEAGUES[lid][0]
        try:
            data = fetch_json(f"{ESPN}/apis/site/v2/sports/soccer/{code}/teams", 86400)
        except UpstreamError:
            return lid, []
        found = []
        for sport in data.get("sports", []):
            for league in sport.get("leagues", []):
                found += [t.get("team") or {} for t in league.get("teams", [])]
        return lid, found
    q = query.strip().lower()
    if not q:
        return []
    with ThreadPoolExecutor(max_workers=len(LEAGUES)) as pool:
        results = list(pool.map(one, LEAGUES))
    if not any(found for _, found in results):
        raise UpstreamError("club list unavailable")
    ranked, seen = [], set()
    for lid, found in results:
        for t in found:
            c = _club(t)
            key = c["fullName"] or c["name"]
            if key in seen:
                continue
            words = " ".join((c["name"], c["fullName"])).lower()
            if c["code"].lower() == q or words.startswith(q):
                rank = 0
            elif any(w.startswith(q) for w in words.split()):
                rank = 1
            elif q in words:
                rank = 2
            else:
                continue
            seen.add(key)
            # The FA Cup lists 100+ lower-league sides; top-flight clubs first.
            ranked.append((rank, lid == "fa", c["name"].lower(), {**c, "league": LEAGUES[lid][1]}))
    ranked.sort(key=lambda r: r[:3])
    return [r[3] for r in ranked[:limit]]


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
    leagues_to_scan = list(LEAGUES) if club_names else wanted
    start, end = now - timedelta(days=PAST_DAYS), now + timedelta(days=AHEAD_DAYS)

    def is_club(m: dict) -> bool:
        for side in ("home", "away"):
            c = m[side]
            if {c["name"].lower(), c["fullName"].lower(), c["code"].lower()} & club_names:
                return True
        return False

    found, errors = scan(leagues_to_scan, start, end)
    matches = []
    for m in found:
        club = is_club(m)
        if club or m["leagueId"] in wanted:
            m["club"] = club
            matches.append(m)
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


def clubs_summary(clubs: list[str], now: datetime | None = None) -> dict:
    """For the Football app's home: each followed club's live, last and next match."""
    now = now or datetime.now(timezone.utc)
    names = [c.strip() for c in clubs if c.strip()]
    start, end = now - timedelta(days=PAST_DAYS), now + timedelta(days=AHEAD_DAYS)
    found, errors = scan(list(LEAGUES) if names else [], start, end)
    matches, seen = [], set()
    for m in found:
        if m["id"] not in seen:
            seen.add(m["id"])
            matches.append(m)
    if errors and not matches:
        raise UpstreamError(errors[0])
    matches.sort(key=lambda m: _parse_time(m["kickoff"]))
    out = []
    for name in names:
        key = name.lower()
        plays = lambda t: key in (t["name"].lower(), t["fullName"].lower(), t["code"].lower())
        mine = [m for m in matches if plays(m["home"]) or plays(m["away"])]
        team = next((m[s] for m in mine for s in ("home", "away") if plays(m[s])), None)
        out.append({
            "name": name,
            "team": team,
            "live": next((m for m in mine if m["state"] == "in"), None),
            "last": next((m for m in reversed(mine) if m["state"] == "post"), None),
            "next": next((m for m in mine if m["state"] == "pre"), None),
        })
    return {"clubs": out}


def _minute(clock: dict, added: dict) -> str:
    """6' normally, 45'+2' in stoppage time."""
    m = (clock or {}).get("displayValue") or ""
    a = (added or {}).get("displayValue") or ""
    if a and a not in m and "+" not in m:
        base = m.rstrip("′'")
        a = a.lstrip("+").rstrip("′'")
        m = f"{base}'+{a}'" if base else f"+{a}'"
    return m


def match_detail(league_id: str, event_id: str) -> dict:
    """Full info for one match: score, goals/cards/subs, venue, referee.

    ESPN's summary endpoint carries key events (with a sentence each),
    the venue, attendance and officials, so this is everything the
    match page needs in one call."""
    code = LEAGUES[league_id][0]
    data = fetch_json(f"{ESPN}/apis/site/v2/sports/soccer/{code}/summary?event={event_id}", 60)
    comp = ((data.get("header") or {}).get("competitions") or [{}])[0]
    sides = {c.get("homeAway"): c for c in comp.get("competitors", [])}
    if "home" not in sides or "away" not in sides:
        raise UpstreamError("match unavailable")
    status = comp.get("status") or {}
    stype = status.get("type") or {}
    state = stype.get("state", "pre")
    home, away = sides["home"], sides["away"]
    hwinner, awinner = home.get("winner"), away.get("winner")
    team_side = {}
    for side, c in (("home", home), ("away", away)):
        tid = (c.get("team") or {}).get("id")
        if tid:
            team_side[str(tid)] = side
    events = []
    for ev in data.get("keyEvents") or comp.get("details") or []:
        clock = ev.get("clock") or {}
        t = ev.get("type") or {}
        slug = str(t.get("type") or "")
        if ev.get("scoringPlay") or slug.startswith("goal"):
            kind = "shootout" if ev.get("shootout") else "goal"
        elif "card" in slug or ev.get("redCard"):
            kind = "card"
        elif "substitut" in slug:
            kind = "sub"
        else:
            kind = "info"
        side = team_side.get(str((ev.get("team") or {}).get("id") or ""))
        participants = ev.get("participants") or []
        scorer = ""
        if kind in ("goal", "shootout"):
            for participant in participants:
                athlete = participant.get("athlete") or {}
                scorer = athlete.get("displayName") or athlete.get("fullName") or ""
                if scorer:
                    break
        events.append({
            "minute": clock.get("displayValue") or "",
            "side": side,
            "kind": kind,
            "scorer": scorer,
            "text": ev.get("text") or t.get("text") or "",
        })
    info = data.get("gameInfo") or {}
    venue = (info.get("venue") or comp.get("venue") or {})
    # Scorers for the under-the-score lines: the detail feed names the
    # scorer first and the assister second. An own goal counts for the
    # other side but keeps the scorer's name, marked (og).
    goals = []
    for d in comp.get("details") or []:
        if not d.get("scoringPlay"):
            continue
        parts = [p.get("athlete") or {} for p in d.get("participants") or []]
        if not parts:
            continue
        scorer = parts[0].get("shortName") or parts[0].get("displayName") or ""
        assist = parts[1].get("shortName") or parts[1].get("displayName") or "" if len(parts) > 1 else ""
        goals.append({
            "minute": _minute(d.get("clock"), d.get("addedClock")),
            "side": team_side.get(str((d.get("team") or {}).get("id") or "")),
            "scorer": scorer,
            "assist": assist,
            "ownGoal": bool(d.get("ownGoal")),
            "penalty": bool(d.get("penaltyKick")),
        })
    return {
        "id": str(event_id),
        "leagueId": league_id,
        "league": LEAGUES[league_id][1],
        "kickoff": comp.get("date"),
        "state": state,
        "minute": (status.get("displayClock") or "").strip() or None if state == "in" else None,
        "status": stype.get("shortDetail") or stype.get("description") or "",
        "home": _club(home.get("team") or {}),
        "away": _club(away.get("team") or {}),
        "score": None if state == "pre" else {"home": str(home.get("score", "0")), "away": str(away.get("score", "0"))},
        "winner": "home" if hwinner else "away" if awinner else ("draw" if state == "post" else None),
        "venue": venue.get("fullName") or "",
        "city": ((venue.get("address") or {}).get("city")) or "",
        "attendance": info.get("attendance"),
        "officials": [{"name": o.get("displayName") or o.get("fullName") or "",
                       "role": ((o.get("position") or {}).get("displayName")) or ""}
                      for o in info.get("officials") or []],
        "events": events,
        "goals": goals,
    }


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
            if url.path == "/api/clubs":
                return self._json(200, clubs_summary([x for x in arg("clubs").split(",") if x]))
            if url.path == "/api/teams":
                return self._json(200, {"teams": teams(arg("q"))})
            if url.path == "/api/match":
                lid, eid = arg("league", "pl"), arg("id")
                if lid not in LEAGUES or not eid.isdigit():
                    return self._json(400, {"error": "bad request"})
                return self._json(200, match_detail(lid, eid))
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


def warm() -> None:
    """Fetch what the pages ask for first, so the first visit is quick."""
    now = datetime.now(timezone.utc)
    scan(list(LEAGUES), now - timedelta(days=PAST_DAYS), now + timedelta(days=AHEAD_DAYS))
    with ThreadPoolExecutor(max_workers=len(LEAGUES)) as pool:
        list(pool.map(lambda lid: _quiet(standings, lid), LEAGUES))


def _quiet(fn, *args):
    try:
        return fn(*args)
    except UpstreamError:
        return None


def main() -> None:
    srv = ThreadingHTTPServer((HOST, PORT), Handler)
    threading.Thread(target=warm, daemon=True).start()
    print(f"Football listening on http://{HOST}:{PORT}", flush=True)
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
