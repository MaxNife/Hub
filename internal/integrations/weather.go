package integrations

import (
	"context"
	"encoding/json"
	"fmt"
	"math"
	"net/http"
	"net/url"
	"strconv"
	"time"

	"hub/internal/store"
)

// WeatherSettings is stored under the "weather" settings key.
type WeatherSettings struct {
	Name      string  `json:"name"`
	Latitude  float64 `json:"latitude"`
	Longitude float64 `json:"longitude"`
	Units     string  `json:"units"` // celsius | fahrenheit
}

type WeatherNow struct {
	Place       string `json:"place"`
	Temperature int    `json:"temperature"`
	High        int    `json:"high"`
	Low         int    `json:"low"`
	Units       string `json:"units"`
	Code        int    `json:"code"`
	Label       string `json:"label"`
	IsDay       bool   `json:"isDay"`
}

// Weather reads the current conditions from Open-Meteo (no API key).
type Weather struct {
	Store   *store.Store
	BaseURL string // https://api.open-meteo.com
	Client  *http.Client
}

func (w *Weather) Name() string            { return "weather" }
func (w *Weather) Interval() time.Duration { return 15 * time.Minute }

func (w *Weather) Settings(ctx context.Context) (WeatherSettings, bool, error) {
	var s WeatherSettings
	ok, err := w.Store.GetSetting(ctx, "weather", &s)
	if s.Units != "fahrenheit" {
		s.Units = "celsius"
	}
	return s, ok, err
}

func (w *Weather) Fetch(ctx context.Context) (any, error) {
	s, ok, err := w.Settings(ctx)
	if err != nil || !ok {
		return nil, err // no location yet: nothing to show, not an error
	}
	q := url.Values{
		"latitude":         {strconv.FormatFloat(s.Latitude, 'f', 4, 64)},
		"longitude":        {strconv.FormatFloat(s.Longitude, 'f', 4, 64)},
		"current":          {"temperature_2m,weather_code,is_day"},
		"daily":            {"temperature_2m_max,temperature_2m_min"},
		"timezone":         {"auto"},
		"forecast_days":    {"1"},
		"temperature_unit": {s.Units},
	}
	var body struct {
		Current struct {
			Temperature float64 `json:"temperature_2m"`
			Code        int     `json:"weather_code"`
			IsDay       int     `json:"is_day"`
		} `json:"current"`
		Daily struct {
			Max []float64 `json:"temperature_2m_max"`
			Min []float64 `json:"temperature_2m_min"`
		} `json:"daily"`
	}
	if err := getJSON(ctx, w.Client, w.BaseURL+"/v1/forecast?"+q.Encode(), &body); err != nil {
		return nil, err
	}
	now := WeatherNow{
		Place:       s.Name,
		Temperature: round(body.Current.Temperature),
		Units:       s.Units,
		Code:        body.Current.Code,
		Label:       WeatherLabel(body.Current.Code),
		IsDay:       body.Current.IsDay == 1,
	}
	if len(body.Daily.Max) > 0 && len(body.Daily.Min) > 0 {
		now.High, now.Low = round(body.Daily.Max[0]), round(body.Daily.Min[0])
	}
	return now, nil
}

type Place struct {
	Name      string  `json:"name"`
	Region    string  `json:"region,omitempty"`
	Country   string  `json:"country,omitempty"`
	Latitude  float64 `json:"latitude"`
	Longitude float64 `json:"longitude"`
}

// Geocode looks up places by name (Open-Meteo geocoding, no API key).
func Geocode(ctx context.Context, client *http.Client, baseURL, name string) ([]Place, error) {
	q := url.Values{"name": {name}, "count": {"6"}, "language": {"en"}, "format": {"json"}}
	var body struct {
		Results []struct {
			Name      string  `json:"name"`
			Admin1    string  `json:"admin1"`
			Country   string  `json:"country"`
			Latitude  float64 `json:"latitude"`
			Longitude float64 `json:"longitude"`
		} `json:"results"`
	}
	if err := getJSON(ctx, client, baseURL+"/v1/search?"+q.Encode(), &body); err != nil {
		return nil, err
	}
	out := []Place{}
	for _, r := range body.Results {
		out = append(out, Place{Name: r.Name, Region: r.Admin1, Country: r.Country, Latitude: r.Latitude, Longitude: r.Longitude})
	}
	return out, nil
}

func getJSON(ctx context.Context, client *http.Client, url string, v any) error {
	if client == nil {
		client = http.DefaultClient
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return err
	}
	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("%s: %s", req.URL.Host, resp.Status)
	}
	return json.NewDecoder(resp.Body).Decode(v)
}

func round(f float64) int { return int(math.Round(f)) }

// WeatherLabel turns a WMO weather code into a short phrase.
func WeatherLabel(code int) string {
	switch {
	case code == 0:
		return "Clear"
	case code == 1:
		return "Mostly clear"
	case code == 2:
		return "Partly cloudy"
	case code == 3:
		return "Cloudy"
	case code == 45 || code == 48:
		return "Fog"
	case code >= 51 && code <= 57:
		return "Drizzle"
	case code >= 61 && code <= 67:
		return "Rain"
	case code >= 71 && code <= 77:
		return "Snow"
	case code >= 80 && code <= 82:
		return "Showers"
	case code == 85 || code == 86:
		return "Snow showers"
	case code >= 95:
		return "Thunderstorms"
	}
	return "—"
}
