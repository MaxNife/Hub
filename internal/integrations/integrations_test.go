package integrations

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"hub/internal/store"
)

const ics = "BEGIN:VCALENDAR\r\n" +
	"BEGIN:VEVENT\r\nUID:standup\r\nSUMMARY:Standup\r\n" +
	"DTSTART;TZID=Africa/Lagos:20260901T150000\r\nDTEND;TZID=Africa/Lagos:20260901T151500\r\n" +
	"RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR\r\nEXDATE;TZID=Africa/Lagos:20260925T150000\r\nEND:VEVENT\r\n" +
	"BEGIN:VEVENT\r\nUID:lunch\r\nSUMMARY:Lunch with\r\n  Ada\\, Tolu\r\nLOCATION:Café\r\n" +
	"DTSTART:20260925T113000Z\r\nDURATION:PT1H\r\nEND:VEVENT\r\n" +
	"BEGIN:VEVENT\r\nUID:gone\r\nSUMMARY:Cancelled\r\nSTATUS:CANCELLED\r\nDTSTART:20260925T100000Z\r\nEND:VEVENT\r\n" +
	"BEGIN:VEVENT\r\nUID:bday\r\nSUMMARY:Birthday\r\nDTSTART;VALUE=DATE:20260926\r\nRRULE:FREQ=YEARLY\r\nEND:VEVENT\r\n" +
	"BEGIN:VEVENT\r\nUID:old\r\nSUMMARY:Daily check-in\r\nDTSTART:20150101T080000Z\r\nRRULE:FREQ=DAILY\r\nEND:VEVENT\r\n" +
	"END:VCALENDAR\r\n"

func TestParseICSExpandsAndSkips(t *testing.T) {
	lagos, _ := time.LoadLocation("Africa/Lagos")
	// All-day dates are floating: they belong to the machine's local zone.
	defer func(l *time.Location) { time.Local = l }(time.Local)
	time.Local = lagos
	from := time.Date(2026, 9, 25, 9, 0, 0, 0, lagos)
	events, err := ParseICS(strings.NewReader(ics), from, from.Add(48*time.Hour))
	if err != nil {
		t.Fatal(err)
	}
	var titles []string
	for _, e := range events {
		titles = append(titles, e.Title+"@"+e.Start.In(lagos).Format("Mon 15:04"))
	}
	got := strings.Join(titles, ", ")
	// Friday's standup is excluded, the weekend has none, lunch is unfolded
	// and unescaped, the cancelled event is gone, the 2015 daily still shows.
	for _, want := range []string{"Lunch with Ada, Tolu@Fri 12:30", "Birthday@Sat 00:00", "Daily check-in@Sat 09:00"} {
		if !strings.Contains(got, want) {
			t.Errorf("missing %q in %s", want, got)
		}
	}
	for _, bad := range []string{"Standup@Fri", "Cancelled", "Standup@Sat"} {
		if strings.Contains(got, bad) {
			t.Errorf("unexpected %q in %s", bad, got)
		}
	}
	next := NextEvent(events, from)
	if next == nil || next.Title != "Lunch with Ada, Tolu" {
		t.Fatalf("next = %+v", next)
	}
	monday := time.Date(2026, 9, 28, 14, 0, 0, 0, lagos)
	events, _ = ParseICS(strings.NewReader(ics), monday, monday.Add(24*time.Hour))
	if next := NextEvent(events, monday); next == nil || next.Title != "Standup" {
		t.Fatalf("monday next = %+v", next)
	}
}

func TestParseDuration(t *testing.T) {
	cases := map[string]time.Duration{"PT1H30M": 90 * time.Minute, "P1D": 24 * time.Hour, "P1W": 7 * 24 * time.Hour, "-PT15M": -15 * time.Minute}
	for in, want := range cases {
		if got := parseDuration(in); got != want {
			t.Errorf("%s = %v, want %v", in, got, want)
		}
	}
}

func TestWeatherFetchAndDash(t *testing.T) {
	var fail bool
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if fail {
			http.Error(w, "down", 503)
			return
		}
		if r.URL.Query().Get("temperature_unit") != "celsius" {
			t.Errorf("units = %s", r.URL.Query().Get("temperature_unit"))
		}
		w.Write([]byte(`{"current":{"temperature_2m":28.6,"weather_code":2,"is_day":1},"daily":{"temperature_2m_max":[31.2],"temperature_2m_min":[24.4]}}`))
	}))
	defer srv.Close()
	st, err := store.Open(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	defer st.Close()
	w := &Weather{Store: st, BaseURL: srv.URL}
	if v, err := w.Fetch(context.Background()); v != nil || err != nil {
		t.Fatalf("unconfigured: %v %v", v, err)
	}
	st.SetSetting(context.Background(), "weather", WeatherSettings{Name: "Lagos", Latitude: 6.45, Longitude: 3.39})
	v, err := w.Fetch(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	now := v.(WeatherNow)
	if now.Temperature != 29 || now.Label != "Partly cloudy" || now.High != 31 || now.Place != "Lagos" {
		t.Fatalf("got %+v", now)
	}

	m := NewManager(w)
	m.fetch(context.Background(), w)
	if e := m.Get("weather"); e.Value == nil {
		t.Fatal("expected cached value")
	}
	fail = true
	m.fetch(context.Background(), w)
	if e := m.Get("weather"); e.Value == nil || e.Error == "" {
		t.Fatalf("recent value should survive one failure: %+v", e)
	}
	m.states["weather"].okAt = time.Now().Add(-time.Hour)
	if e := m.Get("weather"); e.Value != nil {
		t.Fatalf("stale value should become a dash: %+v", e)
	}
}
