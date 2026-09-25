package proxy

import (
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"hub/internal/registry"
)

func TestServeStripsPrefixAndCookie(t *testing.T) {
	var got *http.Request
	up := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		got = r
		io.WriteString(w, "hello from "+r.URL.Path)
	}))
	defer up.Close()

	p := New()
	app := registry.App{ID: "football", Name: "Football", Upstream: up.URL}
	r := httptest.NewRequest("GET", "/apps/football/api/feed?count=3", nil)
	r.AddCookie(&http.Cookie{Name: SessionCookie, Value: "secret"})
	r.AddCookie(&http.Cookie{Name: "app", Value: "keep"})
	w := httptest.NewRecorder()
	p.Serve(w, r, app, "api/feed")

	if w.Body.String() != "hello from /api/feed" {
		t.Fatalf("body = %q", w.Body)
	}
	if got.URL.RawQuery != "count=3" {
		t.Errorf("query = %q", got.URL.RawQuery)
	}
	if got.Header.Get("X-Forwarded-Prefix") != "/apps/football" {
		t.Errorf("prefix = %q", got.Header.Get("X-Forwarded-Prefix"))
	}
	if c := got.Header.Get("Cookie"); strings.Contains(c, "secret") || !strings.Contains(c, "app=keep") {
		t.Errorf("cookies = %q", c)
	}
}

func TestServeOfflinePage(t *testing.T) {
	p := New()
	app := registry.App{ID: "football", Name: "Football", Upstream: "http://127.0.0.1:1"}
	w := httptest.NewRecorder()
	p.Serve(w, httptest.NewRequest("GET", "/apps/football/", nil), app, "")
	if w.Code != http.StatusBadGateway || !strings.Contains(w.Body.String(), "Football isn't answering") {
		t.Fatalf("got %d %s", w.Code, w.Body)
	}
}
