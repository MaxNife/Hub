// Package proxy forwards /apps/{id}/* to a service app's upstream, stripping
// the prefix and telling the app where it lives via X-Forwarded-Prefix.
package proxy

import (
	"context"
	"html/template"
	"log/slog"
	"net/http"
	"net/http/httputil"
	"net/url"
	"strings"
	"sync"

	"hub/internal/registry"
)

// SessionCookie is Hub's own cookie; service apps never see it.
const SessionCookie = "hub_session"

type Proxy struct {
	mu    sync.Mutex
	cache map[string]cached
}

type cached struct {
	upstream string
	rp       *httputil.ReverseProxy
}

type subKey struct{}

func New() *Proxy { return &Proxy{cache: map[string]cached{}} }

// Serve proxies one request; sub is the path after /apps/{id}/.
func (p *Proxy) Serve(w http.ResponseWriter, r *http.Request, app registry.App, sub string) {
	rp, err := p.get(app)
	if err != nil {
		slog.Error("bad upstream", "app", app.ID, "err", err)
		http.Error(w, "bad upstream", http.StatusBadGateway)
		return
	}
	rp.ServeHTTP(w, r.WithContext(context.WithValue(r.Context(), subKey{}, "/"+sub)))
}

func (p *Proxy) get(app registry.App) (*httputil.ReverseProxy, error) {
	p.mu.Lock()
	defer p.mu.Unlock()
	if c, ok := p.cache[app.ID]; ok && c.upstream == app.Upstream {
		return c.rp, nil
	}
	target, err := url.Parse(app.Upstream)
	if err != nil {
		return nil, err
	}
	prefix := "/apps/" + app.ID
	rp := &httputil.ReverseProxy{
		Rewrite: func(pr *httputil.ProxyRequest) {
			sub, _ := pr.In.Context().Value(subKey{}).(string)
			pr.SetURL(target)
			pr.Out.URL.Path = strings.TrimRight(target.Path, "/") + sub
			pr.Out.URL.RawPath = ""
			pr.SetXForwarded()
			pr.Out.Header.Set("X-Forwarded-Prefix", prefix)
			stripCookie(pr.Out, SessionCookie)
		},
		ErrorHandler: func(w http.ResponseWriter, r *http.Request, err error) {
			slog.Warn("proxy error", "app", app.ID, "err", err)
			w.Header().Set("Content-Type", "text/html; charset=utf-8")
			w.WriteHeader(http.StatusBadGateway)
			_ = offlinePage.Execute(w, app.Name)
		},
	}
	p.cache[app.ID] = cached{upstream: app.Upstream, rp: rp}
	return rp, nil
}

func stripCookie(r *http.Request, name string) {
	cookies := r.Cookies()
	r.Header.Del("Cookie")
	for _, c := range cookies {
		if c.Name != name {
			r.AddCookie(c)
		}
	}
}

// Shown inside the app frame when the upstream doesn't answer.
var offlinePage = template.Must(template.New("offline").Parse(`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>{{.}} is offline</title>
<style>
:root{--paper:#eee9df;--ink:#1c1a16;--muted:#625b4f;--line:#d9d1c2}
@media (prefers-color-scheme:dark){:root{--paper:#17150f;--ink:#f2ede3;--muted:#a69e8f;--line:#35302a}}
body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:var(--paper);color:var(--ink);font-family:'Instrument Sans',system-ui,sans-serif;text-align:center;padding:24px}
h1{margin:0;font-family:'Bricolage Grotesque',system-ui,sans-serif;font-size:32px;letter-spacing:-.02em}
p{margin:10px 0 0;color:var(--muted);font-size:15px}
</style></head>
<body><div><h1>{{.}} isn't answering</h1><p>Its service didn't respond. Start it, then reload.</p></div></body></html>`))
