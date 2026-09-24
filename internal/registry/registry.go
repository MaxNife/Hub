// Package registry scans apps/ and validates hub.json manifests.
package registry

import (
	"encoding/json"
	"fmt"
	"log/slog"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"sync"
	"unicode/utf8"
)

type App struct {
	ID          string   `json:"id"`
	Name        string   `json:"name"`
	Description string   `json:"description,omitempty"`
	Category    string   `json:"category"`
	Tags        []string `json:"tags,omitempty"`
	Icon        string   `json:"icon"`
	Type        string   `json:"type"` // static | service
	Entry       string   `json:"entry,omitempty"`
	Upstream    string   `json:"upstream,omitempty"`
	Health      string   `json:"health,omitempty"`
	Dir         string   `json:"-"` // on-disk folder, never serialized
	Installed   bool     `json:"installed"`
	Pinned      bool     `json:"pinned"`
	HealthOK    *bool    `json:"healthOk,omitempty"`
}

// manifest mirrors hub.json. Unknown fields are ignored by encoding/json,
// which is how widget/actions can be added later without a version bump.
type manifest struct {
	ManifestVersion int      `json:"manifestVersion"`
	ID              string   `json:"id"`
	Name            string   `json:"name"`
	Description     string   `json:"description"`
	Category        string   `json:"category"`
	Tags            []string `json:"tags"`
	Icon            string   `json:"icon"`
	Type            string   `json:"type"`
	Entry           string   `json:"entry"`
	Upstream        string   `json:"upstream"`
	Health          string   `json:"health"`
}

type Registry struct {
	mu     sync.RWMutex
	apps   []App
	errors []RegistryError
}

type RegistryError struct {
	ID     string `json:"id"`
	Reason string `json:"reason"`
}

func New() *Registry { return &Registry{} }

var validID = regexp.MustCompile(`^[a-z0-9-]+$`)

// Rescan re-reads appsDir. Invalid manifests are skipped, logged, and
// recorded for GET /api/registry/errors — they never break the home screen.
func (r *Registry) Rescan(appsDir string) error {
	entries, err := os.ReadDir(appsDir)
	if err != nil {
		if os.IsNotExist(err) {
			r.mu.Lock()
			r.apps, r.errors = nil, nil
			r.mu.Unlock()
			return nil
		}
		return fmt.Errorf("read apps dir: %w", err)
	}
	var apps []App
	var errs []RegistryError
	for _, e := range entries {
		if !e.IsDir() || strings.HasPrefix(e.Name(), ".") {
			continue
		}
		app, reason := loadOne(appsDir, e.Name())
		if reason != "" {
			slog.Warn("skip app", "dir", e.Name(), "reason", reason)
			errs = append(errs, RegistryError{ID: e.Name(), Reason: reason})
			continue
		}
		apps = append(apps, app)
	}
	r.mu.Lock()
	r.apps, r.errors = apps, errs
	r.mu.Unlock()
	slog.Info("registry rescan", "apps", len(apps), "errors", len(errs))
	return nil
}

func loadOne(appsDir, dir string) (App, string) {
	var none App
	raw, err := os.ReadFile(filepath.Join(appsDir, dir, "hub.json"))
	if err != nil {
		return none, "missing hub.json"
	}
	var m manifest
	if err := json.Unmarshal(raw, &m); err != nil {
		return none, "hub.json is not valid JSON: "+err.Error()
	}
	if m.ManifestVersion != 1 {
		return none, "manifestVersion must be 1"
	}
	if !validID.MatchString(m.ID) {
		return none, "id must match [a-z0-9-]+"
	}
	if m.ID != dir {
		return none, "id must match the folder name"
	}
	if n := utf8.RuneCountInString(m.Name); n == 0 || n > 20 {
		return none, "name must be 1-20 characters"
	}
	if strings.TrimSpace(m.Category) == "" {
		return none, "category is required"
	}
	if strings.TrimSpace(m.Icon) == "" {
		return none, "icon is required"
	}
	iconRel := filepath.Clean(filepath.FromSlash(m.Icon))
	if filepath.IsAbs(iconRel) || strings.HasPrefix(iconRel, "..") {
		return none, "icon must be a path inside the folder"
	}
	if _, err := os.Stat(filepath.Join(appsDir, dir, iconRel)); err != nil {
		return none, "icon file not found: " + m.Icon
	}
	app := App{
		ID:          m.ID,
		Name:        m.Name,
		Description: m.Description,
		Category:    m.Category,
		Tags:        m.Tags,
		Icon:        filepath.ToSlash(iconRel),
		Type:        m.Type,
		Dir:         filepath.Join(appsDir, dir),
	}
	switch m.Type {
	case "static":
		if strings.TrimSpace(m.Entry) == "" {
			return none, "static apps require entry"
		}
		entryRel := filepath.Clean(filepath.FromSlash(m.Entry))
		if filepath.IsAbs(entryRel) || strings.HasPrefix(entryRel, "..") {
			return none, "entry must be a folder inside the app"
		}
		idx := filepath.Join(appsDir, dir, entryRel, "index.html")
		if _, err := os.Stat(idx); err != nil {
			return none, "entry/index.html not found: " + m.Entry
		}
		app.Entry = filepath.ToSlash(entryRel)
	case "service":
		if strings.TrimSpace(m.Upstream) == "" {
			return none, "service apps require upstream"
		}
		u, err := url.Parse(m.Upstream)
		if err != nil || (u.Scheme != "http" && u.Scheme != "https") {
			return none, "upstream must be an http(s) URL"
		}
		host := u.Hostname()
		if host != "127.0.0.1" && host != "localhost" && host != "::1" {
			return none, "upstream must be localhost (127.0.0.1)"
		}
		app.Upstream = strings.TrimSuffix(m.Upstream, "/")
		app.Health = m.Health
		if app.Health == "" {
			app.Health = "/health"
		}
		if !strings.HasPrefix(app.Health, "/") {
			return none, "health must be a path starting with /"
		}
	default:
		return none, `type must be "static" or "service"`
	}
	return app, ""
}

func (r *Registry) Apps() []App {
	r.mu.RLock()
	defer r.mu.RUnlock()
	out := make([]App, len(r.apps))
	copy(out, r.apps)
	return out
}

// Get returns the app with id, if its manifest is valid.
func (r *Registry) Get(id string) (App, bool) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	for _, a := range r.apps {
		if a.ID == id {
			return a, true
		}
	}
	return App{}, false
}

func (r *Registry) Errors() []RegistryError {
	r.mu.RLock()
	defer r.mu.RUnlock()
	out := make([]RegistryError, len(r.errors))
	copy(out, r.errors)
	return out
}
