package integrations

import (
	"bufio"
	"context"
	"fmt"
	"io"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"time"
)

// Event is one occurrence of a calendar event.
type Event struct {
	Title    string    `json:"title"`
	Start    time.Time `json:"start"`
	End      time.Time `json:"end"`
	AllDay   bool      `json:"allDay"`
	Location string    `json:"location,omitempty"`
}

// Calendar reads a private iCal (ICS) link and reports the next event in
// the coming 24 hours. The link is a secret, so it comes from config.
type Calendar struct {
	URL    string
	Client *http.Client
	Now    func() time.Time // for tests
}

func (c *Calendar) Name() string            { return "calendar" }
func (c *Calendar) Interval() time.Duration { return 10 * time.Minute }

func (c *Calendar) Fetch(ctx context.Context) (any, error) {
	url := c.URL
	if strings.HasPrefix(url, "webcal://") {
		url = "https://" + strings.TrimPrefix(url, "webcal://")
	}
	client := c.Client
	if client == nil {
		client = http.DefaultClient
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, err
	}
	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("calendar: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("calendar: %s", resp.Status)
	}
	now := time.Now()
	if c.Now != nil {
		now = c.Now()
	}
	events, err := ParseICS(resp.Body, now, now.Add(24*time.Hour))
	if err != nil {
		return nil, err
	}
	next := NextEvent(events, now)
	if next == nil {
		return nil, nil
	}
	return next, nil
}

// NextEvent picks the next timed event starting after now; an all-day
// event only if nothing timed is coming.
func NextEvent(events []Event, now time.Time) *Event {
	var timed, allDay []Event
	for _, e := range events {
		switch {
		case e.AllDay && e.End.After(now):
			allDay = append(allDay, e)
		case !e.AllDay && !e.Start.Before(now):
			timed = append(timed, e)
		}
	}
	for _, list := range [][]Event{timed, allDay} {
		if len(list) > 0 {
			sort.Slice(list, func(i, j int) bool { return list[i].Start.Before(list[j].Start) })
			e := list[0]
			return &e
		}
	}
	return nil
}

type prop struct {
	name   string
	params map[string]string
	value  string
}

type vevent struct {
	uid, summary, location, status string
	start, end                     time.Time
	allDay                         bool
	duration                       time.Duration
	hasEnd                         bool
	rrule                          string
	exdates                        []time.Time
	recurrenceID                   time.Time
}

// ParseICS returns the occurrences that overlap [from, to), expanding the
// common RRULE forms (DAILY, WEEKLY with BYDAY, MONTHLY, YEARLY with
// INTERVAL, COUNT and UNTIL), EXDATE and moved instances (RECURRENCE-ID).
func ParseICS(r io.Reader, from, to time.Time) ([]Event, error) {
	props, err := unfold(r)
	if err != nil {
		return nil, err
	}
	var events []*vevent
	var cur *vevent
	for _, p := range props {
		switch {
		case p.name == "BEGIN" && p.value == "VEVENT":
			cur = &vevent{}
		case p.name == "END" && p.value == "VEVENT":
			if cur != nil && !cur.start.IsZero() {
				events = append(events, cur)
			}
			cur = nil
		case cur == nil:
			continue
		case p.name == "UID":
			cur.uid = p.value
		case p.name == "SUMMARY":
			cur.summary = unescape(p.value)
		case p.name == "LOCATION":
			cur.location = unescape(p.value)
		case p.name == "STATUS":
			cur.status = strings.ToUpper(p.value)
		case p.name == "DTSTART":
			cur.start, cur.allDay = parseTime(p)
		case p.name == "DTEND":
			cur.end, _ = parseTime(p)
			cur.hasEnd = true
		case p.name == "DURATION":
			cur.duration = parseDuration(p.value)
		case p.name == "RRULE":
			cur.rrule = p.value
		case p.name == "EXDATE":
			for _, v := range strings.Split(p.value, ",") {
				t, _ := parseTime(prop{params: p.params, value: v})
				cur.exdates = append(cur.exdates, t)
			}
		case p.name == "RECURRENCE-ID":
			cur.recurrenceID, _ = parseTime(p)
		}
	}

	// Instances moved or cancelled individually override the series.
	overridden := map[string]bool{}
	for _, e := range events {
		if !e.recurrenceID.IsZero() {
			overridden[e.uid+"|"+e.recurrenceID.UTC().Format(time.RFC3339)] = true
		}
	}

	var out []Event
	for _, e := range events {
		length := e.duration
		if e.hasEnd {
			length = e.end.Sub(e.start)
		} else if length == 0 && e.allDay {
			length = 24 * time.Hour
		}
		for _, start := range occurrences(e, from.Add(-length), to) {
			if e.recurrenceID.IsZero() && overridden[e.uid+"|"+start.UTC().Format(time.RFC3339)] {
				continue
			}
			if e.status == "CANCELLED" || excluded(e, start) {
				continue
			}
			end := start.Add(length)
			if e.allDay {
				// Keep all-day spans on calendar-day boundaries across DST.
				end = start.AddDate(0, 0, max(1, int(length.Hours()/24+0.5)))
			}
			if end.After(from) && start.Before(to) {
				out = append(out, Event{Title: e.summary, Start: start, End: end, AllDay: e.allDay, Location: e.location})
			}
		}
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Start.Before(out[j].Start) })
	return out, nil
}

func excluded(e *vevent, t time.Time) bool {
	for _, x := range e.exdates {
		if x.Equal(t) {
			return true
		}
	}
	return false
}

// occurrences lists start times up to `to` (just the start for one-offs).
// Open-ended daily and weekly rules skip ahead to `from`, so an old
// recurring meeting doesn't burn the iteration limit before today.
func occurrences(e *vevent, from, to time.Time) []time.Time {
	if e.rrule == "" {
		return []time.Time{e.start}
	}
	rule := map[string]string{}
	for _, part := range strings.Split(e.rrule, ";") {
		k, v, _ := strings.Cut(part, "=")
		rule[strings.ToUpper(k)] = v
	}
	interval, _ := strconv.Atoi(rule["INTERVAL"])
	if interval < 1 {
		interval = 1
	}
	count, _ := strconv.Atoi(rule["COUNT"])
	var until time.Time
	if u := rule["UNTIL"]; u != "" {
		until, _ = parseTime(prop{value: u, params: map[string]string{}})
		if e.allDay || len(u) == 8 {
			until = until.Add(24*time.Hour - time.Second)
		}
	}
	stop := func(t time.Time, n int) bool {
		return t.After(to) || (!until.IsZero() && t.After(until)) || (count > 0 && n >= count)
	}

	var out []time.Time
	n := 0
	emit := func(t time.Time) bool {
		if stop(t, n) {
			return false
		}
		n++
		out = append(out, t)
		return true
	}
	s := e.start
	const limit = 5000
	skip := func(period time.Duration) int {
		if count > 0 || !from.After(s) {
			return 0
		}
		return max(0, int(from.Sub(s)/(period*time.Duration(interval)))-1)
	}
	switch rule["FREQ"] {
	case "DAILY":
		for i := skip(24 * time.Hour); i < limit+skip(24*time.Hour); i++ {
			if !emit(s.AddDate(0, 0, i*interval)) {
				break
			}
		}
	case "WEEKLY":
		days := weekdays(rule["BYDAY"])
		if len(days) == 0 {
			days = []time.Weekday{s.Weekday()}
		}
		weekStart := s.AddDate(0, 0, -int(s.Weekday()))
		first := skip(7 * 24 * time.Hour)
	weeks:
		for w := first; w < first+limit; w++ {
			base := weekStart.AddDate(0, 0, 7*w*interval)
			for _, d := range days {
				t := base.AddDate(0, 0, int(d))
				if t.Before(s) {
					continue
				}
				if !emit(t) {
					break weeks
				}
			}
		}
	case "MONTHLY":
		for i := 0; i < limit; i++ {
			t := s.AddDate(0, i*interval, 0)
			if t.Day() != s.Day() { // e.g. the 31st in a 30-day month: skip
				if t.After(to) {
					break
				}
				continue
			}
			if !emit(t) {
				break
			}
		}
	case "YEARLY":
		for i := 0; i < limit; i++ {
			if !emit(s.AddDate(i*interval, 0, 0)) {
				break
			}
		}
	default:
		out = append(out, s)
	}
	return out
}

func weekdays(byday string) []time.Weekday {
	names := map[string]time.Weekday{"SU": 0, "MO": 1, "TU": 2, "WE": 3, "TH": 4, "FR": 5, "SA": 6}
	var out []time.Weekday
	for _, d := range strings.Split(byday, ",") {
		d = strings.TrimLeft(d, "+-0123456789") // "1MO" forms: keep the day
		if wd, ok := names[strings.ToUpper(d)]; ok {
			out = append(out, wd)
		}
	}
	sort.Slice(out, func(i, j int) bool { return out[i] < out[j] })
	return out
}

func parseTime(p prop) (time.Time, bool) {
	v := strings.TrimSpace(p.value)
	if p.params["VALUE"] == "DATE" || len(v) == 8 {
		t, err := time.ParseInLocation("20060102", v, time.Local)
		if err != nil {
			return time.Time{}, true
		}
		return t, true
	}
	if strings.HasSuffix(v, "Z") {
		t, _ := time.Parse("20060102T150405Z", v)
		return t, false
	}
	loc := time.Local
	if tz := p.params["TZID"]; tz != "" {
		if l, err := time.LoadLocation(strings.Trim(tz, `"`)); err == nil {
			loc = l
		} else if l, ok := windowsZones[strings.Trim(tz, `"`)]; ok {
			loc = l
		}
	}
	t, _ := time.ParseInLocation("20060102T150405", v, loc)
	return t, false
}

// A few Windows zone names Outlook writes into TZID.
var windowsZones = func() map[string]*time.Location {
	names := map[string]string{
		"GMT Standard Time":               "Europe/London",
		"W. Europe Standard Time":         "Europe/Berlin",
		"Romance Standard Time":           "Europe/Paris",
		"W. Central Africa Standard Time": "Africa/Lagos",
		"Eastern Standard Time":           "America/New_York",
		"Central Standard Time":           "America/Chicago",
		"Pacific Standard Time":           "America/Los_Angeles",
		"UTC":                             "UTC",
	}
	out := map[string]*time.Location{}
	for win, iana := range names {
		if l, err := time.LoadLocation(iana); err == nil {
			out[win] = l
		}
	}
	return out
}()

// parseDuration handles the RFC 5545 form, e.g. PT1H30M or P1D.
func parseDuration(v string) time.Duration {
	v = strings.TrimPrefix(strings.ToUpper(v), "+")
	neg := strings.HasPrefix(v, "-")
	v = strings.TrimPrefix(strings.TrimPrefix(v, "-"), "P")
	var d time.Duration
	num := ""
	inTime := false
	for _, r := range v {
		switch {
		case r >= '0' && r <= '9':
			num += string(r)
		case r == 'T':
			inTime = true
		default:
			n, _ := strconv.Atoi(num)
			num = ""
			switch {
			case r == 'W':
				d += time.Duration(n) * 7 * 24 * time.Hour
			case r == 'D':
				d += time.Duration(n) * 24 * time.Hour
			case r == 'H' && inTime:
				d += time.Duration(n) * time.Hour
			case r == 'M' && inTime:
				d += time.Duration(n) * time.Minute
			case r == 'S' && inTime:
				d += time.Duration(n) * time.Second
			}
		}
	}
	if neg {
		return -d
	}
	return d
}

// unfold joins folded lines and splits each into name, params and value.
func unfold(r io.Reader) ([]prop, error) {
	sc := bufio.NewScanner(r)
	sc.Buffer(make([]byte, 64*1024), 4<<20)
	var lines []string
	for sc.Scan() {
		line := strings.TrimRight(sc.Text(), "\r")
		if (strings.HasPrefix(line, " ") || strings.HasPrefix(line, "\t")) && len(lines) > 0 {
			lines[len(lines)-1] += line[1:]
			continue
		}
		lines = append(lines, line)
	}
	if err := sc.Err(); err != nil {
		return nil, err
	}
	var props []prop
	for _, line := range lines {
		head, value, ok := cutUnquoted(line, ':')
		if !ok {
			continue
		}
		parts := strings.Split(head, ";")
		p := prop{name: strings.ToUpper(parts[0]), params: map[string]string{}, value: value}
		for _, kv := range parts[1:] {
			k, v, _ := strings.Cut(kv, "=")
			p.params[strings.ToUpper(k)] = v
		}
		props = append(props, p)
	}
	return props, nil
}

func cutUnquoted(s string, sep byte) (string, string, bool) {
	quoted := false
	for i := 0; i < len(s); i++ {
		switch s[i] {
		case '"':
			quoted = !quoted
		case sep:
			if !quoted {
				return s[:i], s[i+1:], true
			}
		}
	}
	return s, "", false
}

func unescape(s string) string {
	r := strings.NewReplacer(`\n`, " ", `\N`, " ", `\,`, ",", `\;`, ";", `\\`, `\`)
	return strings.TrimSpace(r.Replace(s))
}
