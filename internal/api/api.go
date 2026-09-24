package api

import (
	"context"
	"encoding/json"
	"net/http"
	"sort"
	"strconv"
	"strings"

	"hub/internal/registry"
	"hub/internal/store"
)

type Handler struct {
	Store    *store.Store
	Registry *registry.Registry
	AppsDir  string
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
		out = append(out, a)
	}
	return out
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
		sort.Slice(out, func(i, j int) bool { return out[i].Name < out[j].Name })
		if out == nil {
			out = []cat{}
		}
		writeJSON(w, 200, out)
	})

	mux.HandleFunc("GET /api/status", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, 200, map[string]any{"time": nil, "weather": nil, "nextEvent": nil, "health": nil})
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
