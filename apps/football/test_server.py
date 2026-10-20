"""Football service tests against a fake ESPN. Run: python -m unittest apps/football/test_server.py"""

import json
import threading
import time
import unittest
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import importlib.util
import pathlib

spec = importlib.util.spec_from_file_location("football_server", pathlib.Path(__file__).with_name("server.py"))
fs = importlib.util.module_from_spec(spec)
spec.loader.exec_module(fs)

NOW = datetime(2026, 9, 25, 19, 30, tzinfo=timezone.utc)


def team(name, code, color, home, score=None):
    return {"homeAway": "home" if home else "away", "score": score,
            "team": {"displayName": name, "shortDisplayName": name, "abbreviation": code, "color": color}}


def event(eid, when, state, home, away, detail="", clock=""):
    return {"id": eid, "date": when.strftime("%Y-%m-%dT%H:%MZ"),
            "competitions": [{"venue": {"fullName": "Emirates Stadium"}, "competitors": [home, away],
                              "status": {"displayClock": clock, "type": {"state": state, "description": detail, "shortDetail": detail}}}]}


EVENTS = {
    "eng.1": [
        event("1", NOW - timedelta(days=3), "post", team("Arsenal", "ARS", "db0007", True, "2"), team("Chelsea", "CHE", "034694", False, "1"), "FT"),
        event("2", NOW + timedelta(days=5), "pre", team("Arsenal", "ARS", "db0007", True), team("Newcastle", "NEW", "241f20", False)),
        event("3", NOW - timedelta(days=1), "post", team("Liverpool", "LIV", "c8102e", True, "1"), team("Everton", "EVE", "003399", False, "1"), "FT"),
    ],
    "esp.1": [
        event("4", NOW + timedelta(days=1), "pre", team("Barcelona", "BAR", "a50044", True), team("Sevilla", "SEV", "d2001f", False)),
        # Next month, so the feed has to fetch more than one month.
        event("5", NOW + timedelta(days=20), "pre", team("Sevilla", "SEV", "d2001f", True), team("Barcelona", "BAR", "a50044", False)),
    ],
}
TEAMS = {
    "eng.1": [{"displayName": "Arsenal", "shortDisplayName": "Arsenal", "abbreviation": "ARS", "color": "db0007"},
              {"displayName": "Manchester United", "shortDisplayName": "Man United", "abbreviation": "MAN", "color": "da291c"},
              {"displayName": "Manchester City", "shortDisplayName": "Man City", "abbreviation": "MNC", "color": "6caddf"}],
    "eng.fa": [{"displayName": "Arsenal", "shortDisplayName": "Arsenal", "abbreviation": "ARS", "color": "db0007"}],
}
LIVE = {"on": False}


def summary(eid):
    return {
        "header": {"competitions": [{
            "date": "2026-09-22T19:00Z",
            "competitors": [
                {"homeAway": "home", "score": "2", "winner": True,
                 "team": {"id": "1", "displayName": "Arsenal", "shortDisplayName": "Arsenal", "abbreviation": "ARS", "color": "db0007"}},
                {"homeAway": "away", "score": "1", "winner": False,
                 "team": {"id": "2", "displayName": "Chelsea", "shortDisplayName": "Chelsea", "abbreviation": "CHE", "color": "034694"}}],
            "status": {"displayClock": "", "type": {"state": "post", "description": "Full Time", "shortDetail": "FT"}},
            "venue": {"fullName": "Emirates Stadium"},
            "details": [
                {"clock": {"displayValue": "45'"}, "addedClock": {"displayValue": "2'"},
                 "scoringPlay": True, "redCard": False, "penaltyKick": False, "ownGoal": False,
                 "team": {"id": "1"},
                 "participants": [{"athlete": {"displayName": "Bukayo Saka", "shortName": "B. Saka"}},
                                  {"athlete": {"displayName": "Martin Odegaard", "shortName": "M. Odegaard"}}]},
                {"clock": {"displayValue": "67'"}, "addedClock": {"displayValue": ""},
                 "scoringPlay": True, "redCard": False, "penaltyKick": False, "ownGoal": True,
                 "team": {"id": "1"},
                 "participants": [{"athlete": {"displayName": "Levi Colwill", "shortName": "L. Colwill"}}]},
                {"clock": {"displayValue": "70'"}, "addedClock": {"displayValue": ""},
                 "scoringPlay": False, "redCard": True, "penaltyKick": False, "ownGoal": False,
                 "team": {"id": "2"}, "participants": []},
            ]}]},
        "gameInfo": {"venue": {"fullName": "Emirates Stadium", "address": {"city": "London", "country": "England"}},
                     "attendance": 60000,
                     "officials": [{"displayName": "Anthony Taylor", "position": {"displayName": "Referee"}}]},
        "keyEvents": [
            {"clock": {"displayValue": "23'"}, "team": {"id": "1"},
             "participants": [{"athlete": {"displayName": "Bukayo Saka"}}],
             "type": {"text": "Goal", "type": "goal"},
             "scoringPlay": True, "shootout": False, "text": "Goal! Arsenal 1, Chelsea 0."},
            {"clock": {"displayValue": "67'"}, "team": {"id": "2"}, "type": {"text": "Yellow Card", "type": "yellow-card"},
             "scoringPlay": False, "shootout": False, "text": "Yellow card to Chelsea."},
        ],
    }


class FakeESPN(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def _send(self, status, body):
        raw = json.dumps(body).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(raw)

    def do_GET(self):
        # Like ESPN: other clients' User-Agents are refused.
        if not self.headers.get("User-Agent", "").startswith("Python-urllib"):
            return self._send(403, {"error": "forbidden"})
        code = self.path.split("/soccer/")[1].split("/")[0]
        if self.path.split("?")[0].endswith("/teams"):
            return self._send(200, {"sports": [{"leagues": [{"teams": [{"team": t} for t in TEAMS.get(code, [])]}]}]})
        if self.path.split("?")[0].endswith("/summary"):
            eid = urllib.parse.parse_qs(urllib.parse.urlsplit(self.path).query).get("event", [""])[0]
            if eid != "1":
                return self._send(404, {"error": "no such event"})
            return self._send(200, summary(eid))
        events = list(EVENTS.get(code, []))
        if LIVE["on"] and code == "eng.1":
            events.append(event("9", NOW - timedelta(minutes=70), "in", team("Arsenal", "ARS", "db0007", True, "2"),
                                team("Chelsea", "CHE", "034694", False, "1"), "Second Half", "67'"))
        if "/standings" in self.path:
            body = {"children": [{"name": "Premier League", "standings": {"entries": [
                {"team": {"displayName": "Arsenal", "abbreviation": "ARS", "color": "db0007"},
                 "stats": [{"name": "rank", "value": 1}, {"name": "points", "value": 16}, {"name": "gamesPlayed", "value": 6},
                           {"name": "wins", "value": 5}, {"name": "ties", "value": 1}, {"name": "losses", "value": 0},
                           {"name": "pointDifferential", "value": 9}]}]}}]}
        else:
            # Like ESPN: a single month (YYYYMM) or day, never a range.
            dates = urllib.parse.parse_qs(urllib.parse.urlsplit(self.path).query).get("dates", [""])[0]
            if not dates.isdigit() or len(dates) not in (6, 8):
                return self._send(400, {"code": 400, "message": "Failed to get events endpoint."})
            body = {"events": [e for e in events if e["date"].replace("-", "").startswith(dates)]}
        self._send(200, body)


class FootballTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.espn = ThreadingHTTPServer(("127.0.0.1", 0), FakeESPN)
        threading.Thread(target=cls.espn.serve_forever, daemon=True).start()
        fs.ESPN = f"http://127.0.0.1:{cls.espn.server_port}"
        cls.app = ThreadingHTTPServer(("127.0.0.1", 0), fs.Handler)
        threading.Thread(target=cls.app.serve_forever, daemon=True).start()
        cls.base = f"http://127.0.0.1:{cls.app.server_port}"

    @classmethod
    def tearDownClass(cls):
        for srv in (cls.espn, cls.app):
            srv.shutdown()
            srv.server_close()

    def setUp(self):
        fs.cache = fs.Cache()
        LIVE["on"] = False

    def test_auto_shows_results_until_the_window(self):
        f = fs.feed(["pl"], [], "auto", 2, 5, now=NOW)
        self.assertEqual(f["mode"], "results")
        self.assertEqual(f["nextMatchInDays"], 5)
        self.assertEqual(f["note"], "Next match in 5 days")
        self.assertEqual([m["id"] for m in f["matches"]], ["3", "1"])  # newest first
        f = fs.feed(["pl"], [], "auto", 5, 5, now=NOW)
        self.assertEqual(f["mode"], "fixtures")

    def test_clubs_come_first_from_any_league(self):
        f = fs.feed(["pl"], ["Barcelona"], "fixtures", 2, 5, now=NOW)
        self.assertEqual(f["matches"][0]["home"]["name"], "Barcelona")
        self.assertTrue(f["matches"][0]["club"])
        self.assertEqual(f["note"], "Kickoff tomorrow")

    def test_live_wins_and_minute_is_passed_through(self):
        LIVE["on"] = True
        f = fs.feed(["pl"], ["Arsenal"], "auto", 2, 5, now=NOW)
        self.assertEqual(f["mode"], "live")
        self.assertEqual(f["note"], "1 match live")
        m = f["matches"][0]
        self.assertEqual((m["minute"], m["score"], m["home"]["color"]), ("67'", {"home": "2", "away": "1"}, "#db0007"))

    def test_unfollowed_leagues_are_ignored(self):
        f = fs.feed(["liga"], [], "results", 2, 5, now=NOW)
        self.assertEqual(f["mode"], "fixtures")  # no La Liga results, so fall back
        self.assertEqual({m["leagueId"] for m in f["matches"]}, {"liga"})

    def test_clubs_summary(self):
        LIVE["on"] = True
        out = fs.clubs_summary(["Arsenal", "Barcelona", "Nobody FC"], now=NOW)["clubs"]
        ars, bar, nobody = out
        self.assertEqual((ars["team"]["code"], ars["live"]["id"], ars["last"]["id"], ars["next"]["id"]), ("ARS", "9", "1", "2"))
        self.assertEqual((bar["last"], bar["next"]["id"]), (None, "4"))
        self.assertEqual((nobody["team"], nobody["next"]), (None, None))
        self.assertEqual(fs.clubs_summary([], now=NOW), {"clubs": []})

    def test_months_are_fetched_and_trimmed(self):
        ids = [m["id"] for m in fs.scoreboard("liga", NOW, NOW + timedelta(days=28))]
        self.assertEqual(ids, ["4", "5"])
        self.assertEqual(fs.scoreboard("liga", NOW, NOW), [])  # nothing today
        self.assertEqual(fs._months(datetime(2026, 12, 20), datetime(2027, 1, 5)), [(2026, 12), (2027, 1)])

    def test_team_search(self):
        names = [t["name"] for t in fs.teams("man")]
        self.assertEqual(names, ["Man City", "Man United"])
        ars = fs.teams("ars")
        self.assertEqual(len(ars), 1)  # the same club in two leagues is listed once
        self.assertEqual((ars[0]["name"], ars[0]["code"], ars[0]["color"]), ("Arsenal", "ARS", "#db0007"))
        self.assertEqual(fs.teams("united")[0]["fullName"], "Manchester United")
        self.assertEqual(fs.teams("  "), [])

    def test_match_detail(self):
        d = fs.match_detail("pl", "1")
        self.assertEqual(d["id"], "1")
        self.assertEqual((d["home"]["name"], d["score"], d["winner"]), ("Arsenal", {"home": "2", "away": "1"}, "home"))
        self.assertEqual((d["venue"], d["city"], d["attendance"]), ("Emirates Stadium", "London", 60000))
        self.assertEqual(d["officials"], [{"name": "Anthony Taylor", "role": "Referee"}])
        self.assertEqual([(e["minute"], e["side"], e["kind"], e["scorer"]) for e in d["events"]],
                         [("23'", "home", "goal", "Bukayo Saka"), ("67'", "away", "card", "")])
        self.assertEqual(d["goals"], [
            {"minute": "45'+2'", "side": "home", "scorer": "B. Saka", "assist": "M. Odegaard",
             "ownGoal": False, "penalty": False},
            {"minute": "67'", "side": "home", "scorer": "L. Colwill", "assist": "",
             "ownGoal": True, "penalty": False},
        ])
        with self.assertRaises(fs.UpstreamError):
            fs.match_detail("pl", "999")

    def test_http_endpoints(self):
        def get(p):
            with urllib.request.urlopen(self.base + p) as r:
                return json.load(r)
        self.assertEqual(get("/health"), {"status": "ok"})
        feed = get("/api/feed?leagues=pl,ucl&clubs=Arsenal&idle=auto&window=2&count=3")
        self.assertIn(feed["mode"], ("results", "fixtures", "live"))
        self.assertEqual(get("/api/clubs?clubs=Arsenal")["clubs"][0]["name"], "Arsenal")
        self.assertEqual(get("/api/teams?q=arsenal")["teams"][0]["code"], "ARS")
        self.assertEqual(get("/api/match?league=pl&id=1")["events"][0]["text"], "Goal! Arsenal 1, Chelsea 0.")
        table = get("/api/table?league=pl")
        self.assertEqual(table["rows"][0]["points"], 16)
        with urllib.request.urlopen(self.base + "/") as r:
            page = r.read().decode()
        self.assertIn("<title>Football</title>", page)

    def test_upstream_down_is_a_502(self):
        fs.ESPN, saved = "http://127.0.0.1:1", fs.ESPN
        try:
            with self.assertRaises(urllib.error.HTTPError) as cm:
                urllib.request.urlopen(self.base + "/api/feed?leagues=pl")
            self.assertEqual(cm.exception.code, 502)
            cm.exception.close()
        finally:
            fs.ESPN = saved

    def test_expired_data_is_served_while_refreshing(self):
        url = f"{fs.ESPN}/apis/v2/sports/soccer/eng.1/standings"
        fs.cache.put(url, {"old": True}, 0.2)
        time.sleep(0.25)  # expired, but young enough to serve
        self.assertEqual(fs.fetch_json(url, 60), {"old": True})
        for _ in range(50):  # the refresh runs in the background
            fresh, value = fs.cache.lookup(url)
            if fresh:
                break
            time.sleep(0.05)
        self.assertTrue(fresh)
        self.assertIn("children", value)


if __name__ == "__main__":
    unittest.main()
