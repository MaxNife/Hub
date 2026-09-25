"""Football service tests against a fake ESPN. Run: python -m unittest apps/football/test_server.py"""

import json
import threading
import unittest
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
    ],
}
LIVE = {"on": False}


class FakeESPN(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def do_GET(self):
        code = self.path.split("/soccer/")[1].split("/")[0]
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
            body = {"events": events}
        raw = json.dumps(body).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(raw)


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
        self.assertEqual(len(f["matches"]), 1)

    def test_clubs_summary(self):
        LIVE["on"] = True
        out = fs.clubs_summary(["Arsenal", "Barcelona", "Nobody FC"], now=NOW)["clubs"]
        ars, bar, nobody = out
        self.assertEqual((ars["team"]["code"], ars["live"]["id"], ars["last"]["id"], ars["next"]["id"]), ("ARS", "9", "1", "2"))
        self.assertEqual((bar["last"], bar["next"]["id"]), (None, "4"))
        self.assertEqual((nobody["team"], nobody["next"]), (None, None))
        self.assertEqual(fs.clubs_summary([], now=NOW), {"clubs": []})

    def test_http_endpoints(self):
        def get(p):
            with urllib.request.urlopen(self.base + p) as r:
                return json.load(r)
        self.assertEqual(get("/health"), {"status": "ok"})
        feed = get("/api/feed?leagues=pl,ucl&clubs=Arsenal&idle=auto&window=2&count=3")
        self.assertIn(feed["mode"], ("results", "fixtures", "live"))
        self.assertEqual(get("/api/clubs?clubs=Arsenal")["clubs"][0]["name"], "Arsenal")
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


if __name__ == "__main__":
    unittest.main()
