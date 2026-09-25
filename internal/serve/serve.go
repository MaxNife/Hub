// Package serve routes /apps/{id}/* to static files or, for service apps,
// through the reverse proxy. Unknown or uninstalled ids are 404.
package serve

import (
	"net/http"
	"os"
	"path"
	"path/filepath"
	"strings"

	"hub/internal/proxy"
	"hub/internal/registry"
	"hub/internal/store"
)

type Server struct {
	Registry *registry.Registry
	Store    *store.Store
	Proxy    *proxy.Proxy
}

func (s *Server) Handler() http.Handler {
	return http.HandlerFunc(s.serve)
}

func (s *Server) serve(w http.ResponseWriter, r *http.Request) {
	rest := strings.TrimPrefix(r.URL.Path, "/apps/")
	id, sub, _ := strings.Cut(rest, "/")

	app, ok := s.Registry.Get(id)
	if !ok || id == "" {
		http.NotFound(w, r)
		return
	}
	st, err := s.Store.GetState(r.Context(), id)
	if err != nil || !st.Installed {
		http.NotFound(w, r)
		return
	}

	// /apps/{id} -> /apps/{id}/ so relative asset URLs resolve.
	if !strings.HasSuffix(r.URL.Path, "/") && sub == "" {
		http.Redirect(w, r, r.URL.Path+"/", http.StatusFound)
		return
	}

	if app.Type == "service" {
		// The manifest icon lives in Hub's apps/ folder, not on the service.
		if sub == filepath.ToSlash(app.Icon) {
			http.ServeFile(w, r, filepath.Join(app.Dir, filepath.FromSlash(app.Icon)))
			return
		}
		s.Proxy.Serve(w, r, app, sub)
		return
	}

	root := filepath.Join(app.Dir, filepath.FromSlash(app.Entry))
	clean := path.Clean("/" + sub)
	rel := strings.TrimPrefix(clean, "/")
	full := filepath.Join(root, filepath.FromSlash(rel))
	// Contain within root (defense against .. escapes).
	if rel, err := filepath.Rel(root, full); err != nil || strings.HasPrefix(rel, "..") {
		http.NotFound(w, r)
		return
	}

	info, err := os.Stat(full)
	if err == nil && info.IsDir() {
		full = filepath.Join(full, "index.html")
		if _, err := os.Stat(full); err != nil {
			http.NotFound(w, r)
			return
		}
	}
	if _, err := os.Stat(full); err != nil {
		// The manifest icon lives at the app root, outside entry.
		// Serve it so shells can render <img src="/apps/{id}/{icon}">,
		// but keep everything else (hub.json included) private.
		if sub == filepath.ToSlash(app.Icon) {
			http.ServeFile(w, r, filepath.Join(app.Dir, filepath.FromSlash(app.Icon)))
			return
		}
		// SPA fallback: apps with client-side routing.
		if strings.Contains(r.Header.Get("Accept"), "text/html") {
			http.ServeFile(w, r, filepath.Join(root, "index.html"))
			return
		}
		http.NotFound(w, r)
		return
	}
	http.ServeFile(w, r, full)
}
