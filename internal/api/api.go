package api

import (
	"context"
	"encoding/json"
	"net/http"
	"sort"
	"strconv"
	"strings"

	"hub/internal/health"
	"hub/internal/integrations"
	"hub/internal/registry"
	"hub/internal/store"
)

type Handler struct {
	Store    *store.Store
	Registry *registry.Registry
	AppsDir  string
	Health   *health.Checker

	Status      *integrations.Manager
	Weather     *integrations.Weather
	GeocodeURL  string // https://geocoding-api.open-meteo.com
	CalendarSet bool   // HUB_CALENDAR_ICS configured (the link itself stays secret)
	AuthEnabled bool
}

func writeJSON(w http.ResponseWriter, code int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	_ = json.NewEncoder(w).Encode(v)
}

func writeErr(w http.ResponseWriter, code int, msg string) {
	writeJSON(w, code, map[string]string{"error": msg})
}

// withState merges registry manifests with user state from SQLite.
func (h *Handler) withState(ctx context.Context, apps []registry.App) []registry.App {
	out := make([]registry.App, 0, len(apps))
	for _, a := range apps {
		// A store error must never hide an app; default to installed.
		st, err := h.Store.GetState(ctx, a.ID)
		if err != nil {
			a.Installed = true
			out = append(out, a)
			continue
		}
		a.Installed = st.Installed
		a.Pinned = st.Pinned
		h.addHealth(&a)
		out = append(out, a)
	}
	return out
}

// addHealth copies the latest check onto a service app (nil until checked).
func (h *Handler) addHealth(a *registry.App) {
	if a.Type != "service" || h.Health == nil {
		return
	}
	if res, ok := h.Health.Get(a.ID); ok {
		okv := res.OK
		at := res.CheckedAt
		a.HealthOK = &okv
		a.HealthError = res.Error
		a.HealthLatencyMS = &res.LatencyMS
		a.HealthCheckedAt = &at
	}
}

func (h *Handler) Routes(mux *http.ServeMux) {
	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, 200, map[string]string{"status": "ok"})
	})

	mux.HandleFunc("GET /api/apps", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, 200, h.withState(r.Context(), h.Registry.Apps()))
	})

	mux.HandleFunc("GET /api/apps/{id}", func(w http.ResponseWriter, r *http.Request) {
		a, ok := h.Registry.Get(r.PathValue("id"))
		if !ok {
			writeErr(w, 404, "unknown app")
			return
		}
		writeJSON(w, 200, h.withState(r.Context(), []registry.App{a})[0])
	})

	mux.HandleFunc("POST /api/apps/{id}/install", func(w http.ResponseWriter, r *http.Request) {
		if err := h.requireApp(w, r); err != nil {
			return
		}
		if err := h.Store.SetInstalled(r.Context(), r.PathValue("id"), true); err != nil {
			writeErr(w, 500, "could not install")
			return
		}
		writeJSON(w, 200, map[string]string{"status": "ok"})
	})

	mux.HandleFunc("DELETE /api/apps/{id}/install", func(w http.ResponseWriter, r *http.Request) {
		if err := h.requireApp(w, r); err != nil {
			return
		}
		if err := h.Store.SetInstalled(r.Context(), r.PathValue("id"), false); err != nil {
			writeErr(w, 500, "could not hide")
			return
		}
		writeJSON(w, 200, map[string]string{"status": "ok"})
	})

	mux.HandleFunc("POST /api/apps/{id}/pin", func(w http.ResponseWriter, r *http.Request) {
		if err := h.requireApp(w, r); err != nil {
			return
		}
		if err := h.Store.SetPinned(r.Context(), r.PathValue("id"), true); err != nil {
			writeErr(w, 500, "could not pin")
			return
		}
		writeJSON(w, 200, map[string]string{"status": "ok"})
	})

	mux.HandleFunc("DELETE /api/apps/{id}/pin", func(w http.ResponseWriter, r *http.Request) {
		if err := h.requireApp(w, r); err != nil {
			return
		}
		if err := h.Store.SetPinned(r.Context(), r.PathValue("id"), false); err != nil {
			writeErr(w, 500, "could not unpin")
			return
		}
		writeJSON(w, 200, map[string]string{"status": "ok"})
	})

	mux.HandleFunc("POST /api/apps/{id}/opened", func(w http.ResponseWriter, r *http.Request) {
		if err := h.requireApp(w, r); err != nil {
			return
		}
		// Fire-and-forget from the frontend; never fail the open.
		_ = h.Store.RecordOpen(r.Context(), r.PathValue("id"))
		writeJSON(w, 200, map[string]string{"status": "ok"})
	})

	// Run a service app's health check now (the offline screen's Retry).
	mux.HandleFunc("POST /api/apps/{id}/check", func(w http.ResponseWriter, r *http.Request) {
		if err := h.requireApp(w, r); err != nil {
			return
		}
		a, _ := h.Registry.Get(r.PathValue("id"))
		if a.Type != "service" || h.Health == nil {
			writeJSON(w, 200, map[string]any{"ok": true})
			return
		}
		writeJSON(w, 200, h.Health.Check(r.Context(), a))
	})

	mux.HandleFunc("GET /api/recent", func(w http.ResponseWriter, r *http.Request) {
		limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
		if limit <= 0 {
			limit = 6
		}
		recent, err := h.Store.Recent(r.Context(), limit)
		if err != nil {
			writeErr(w, 500, "could not load recent")
			return
		}
		// Only return apps that are still valid + installed.
		apps := h.withState(r.Context(), h.Registry.Apps())
		byID := map[string]registry.App{}
		for _, a := range apps {
			byID[a.ID] = a
		}
		type recentOut struct {
			registry.App
			OpenedAt string `json:"openedAt"`
		}
		out := []recentOut{}
		for _, rc := range recent {
			if a, ok := byID[rc.AppID]; ok && a.Installed {
				out = append(out, recentOut{App: a, OpenedAt: rc.OpenedAt})
			}
			if len(out) >= limit {
				break
			}
		}
		writeJSON(w, 200, out)
	})

	mux.HandleFunc("GET /api/categories", func(w http.ResponseWriter, r *http.Request) {
		apps := h.withState(r.Context(), h.Registry.Apps())
		counts := map[string]int{}
		for _, a := range apps {
			if a.Installed {
				counts[a.Category]++
			}
		}
		type cat struct {
			Name  string `json:"name"`
			Count int    `json:"count"`
		}
		var out []cat
		for name, n := range counts {
			out = append(out, cat{Name: name, Count: n})
		}
		order := h.categoryOrder(r.Context())
		sort.Slice(out, func(i, j int) bool {
			oi, iok := order[out[i].Name]
			oj, jok := order[out[j].Name]
			switch {
			case iok && jok:
				return oi < oj
			case iok != jok:
				return iok
			}
			return out[i].Name < out[j].Name
		})
		if out == nil {
			out = []cat{}
		}
		writeJSON(w, 200, out)
	})

	mux.HandleFunc("GET /api/status", func(w http.ResponseWriter, r *http.Request) {
		_, weatherSet, _ := h.weatherSettings(r.Context())
		writeJSON(w, 200, map[string]any{
			"weather":   h.entry("weather", weatherSet),
			"nextEvent": h.entry("calendar", h.CalendarSet),
			"health":    h.healthSummary(r.Context()),
		})
	})

	mux.HandleFunc("GET /api/settings", func(w http.ResponseWriter, r *http.Request) {
		ws, ok, _ := h.weatherSettings(r.Context())
		var weather any
		if ok {
			weather = ws
		}
		var order []string
		_, _ = h.Store.GetSetting(r.Context(), "categoryOrder", &order)
		if order == nil {
			order = []string{}
		}
		writeJSON(w, 200, map[string]any{
			"weather":            weather,
			"calendarConfigured": h.CalendarSet,
			"categoryOrder":      order,
			"authEnabled":        h.AuthEnabled,
		})
	})

	mux.HandleFunc("PUT /api/settings/weather", func(w http.ResponseWriter, r *http.Request) {
		var ws integrations.WeatherSettings
		if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 4096)).Decode(&ws); err != nil {
			writeErr(w, 400, "bad weather settings")
			return
		}
		if ws.Latitude < -90 || ws.Latitude > 90 || ws.Longitude < -180 || ws.Longitude > 180 || strings.TrimSpace(ws.Name) == "" {
			writeErr(w, 400, "need a place name and valid coordinates")
			return
		}
		if ws.Units != "fahrenheit" {
			ws.Units = "celsius"
		}
		if err := h.Store.SetSetting(r.Context(), "weather", ws); err != nil {
			writeErr(w, 500, "could not save")
			return
		}
		h.refresh("weather")
		writeJSON(w, 200, ws)
	})

	mux.HandleFunc("DELETE /api/settings/weather", func(w http.ResponseWriter, r *http.Request) {
		if err := h.Store.DeleteSetting(r.Context(), "weather"); err != nil {
			writeErr(w, 500, "could not remove")
			return
		}
		h.refresh("weather")
		writeJSON(w, 200, map[string]string{"status": "ok"})
	})

	mux.HandleFunc("PUT /api/settings/category-order", func(w http.ResponseWriter, r *http.Request) {
		var order []string
		if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 16384)).Decode(&order); err != nil {
			writeErr(w, 400, "expected a list of category names")
			return
		}
		if err := h.Store.SetSetting(r.Context(), "categoryOrder", order); err != nil {
			writeErr(w, 500, "could not save")
			return
		}
		writeJSON(w, 200, order)
	})

	// Place search for the weather location; Hub calls out so the browser
	// never talks to outside services directly.
	mux.HandleFunc("GET /api/geocode", func(w http.ResponseWriter, r *http.Request) {
		q := strings.TrimSpace(r.URL.Query().Get("q"))
		if len(q) < 2 {
			writeJSON(w, 200, []integrations.Place{})
			return
		}
		places, err := integrations.Geocode(r.Context(), nil, h.GeocodeURL, q)
		if err != nil {
			writeErr(w, 502, "place search is unavailable right now")
			return
		}
		writeJSON(w, 200, places)
	})

	mux.HandleFunc("POST /api/registry/rescan", func(w http.ResponseWriter, r *http.Request) {
		if err := h.Registry.Rescan(h.AppsDir); err != nil {
			writeErr(w, 500, "rescan failed")
			return
		}
		writeJSON(w, 200, map[string]string{"status": "ok"})
	})

	mux.HandleFunc("GET /api/registry/errors", func(w http.ResponseWriter, r *http.Request) {
		errs := h.Registry.Errors()
		if errs == nil {
			errs = []registry.RegistryError{}
		}
		writeJSON(w, 200, errs)
	})
}

func (h *Handler) weatherSettings(ctx context.Context) (integrations.WeatherSettings, bool, error) {
	if h.Weather == nil {
		return integrations.WeatherSettings{}, false, nil
	}
	return h.Weather.Settings(ctx)
}

func (h *Handler) refresh(name string) {
	if h.Status != nil {
		h.Status.Refresh(name)
	}
}

type statusEntry struct {
	Configured bool `json:"configured"`
	integrations.Entry
}

func (h *Handler) entry(name string, configured bool) statusEntry {
	if h.Status == nil || !configured {
		return statusEntry{Configured: configured}
	}
	return statusEntry{Configured: true, Entry: h.Status.Get(name)}
}

type downApp struct {
	ID    string `json:"id"`
	Name  string `json:"name"`
	Error string `json:"error,omitempty"`
}

// healthSummary: installed apps, and which service apps failed their check.
func (h *Handler) healthSummary(ctx context.Context) map[string]any {
	total := 0
	down := []downApp{}
	for _, a := range h.withState(ctx, h.Registry.Apps()) {
		if !a.Installed {
			continue
		}
		total++
		if a.HealthOK != nil && !*a.HealthOK {
			down = append(down, downApp{ID: a.ID, Name: a.Name, Error: a.HealthError})
		}
	}
	return map[string]any{"total": total, "running": total - len(down), "down": down}
}

func (h *Handler) categoryOrder(ctx context.Context) map[string]int {
	var order []string
	_, _ = h.Store.GetSetting(ctx, "categoryOrder", &order)
	m := map[string]int{}
	for i, name := range order {
		m[name] = i
	}
	return m
}

func (h *Handler) requireApp(w http.ResponseWriter, r *http.Request) error {
	id := r.PathValue("id")
	if id == "" || strings.Contains(id, "/") {
		writeErr(w, 400, "bad app id")
		return errHandled
	}
	if _, ok := h.Registry.Get(id); !ok {
		writeErr(w, 404, "unknown app")
		return errHandled
	}
	return nil
}

var errHandled = errSentinel{}

type errSentinel struct{}

func (errSentinel) Error() string { return "handled" }
