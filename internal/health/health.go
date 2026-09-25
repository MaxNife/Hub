// Package health polls every service app's health path on a timer and keeps
// the latest result in memory; each result is also written to health_checks.
package health

import (
	"context"
	"log/slog"
	"net/http"
	"strings"
	"sync"
	"time"

	"hub/internal/registry"
	"hub/internal/store"
)

type Result struct {
	OK        bool      `json:"ok"`
	Status    int       `json:"status,omitempty"`
	LatencyMS int64     `json:"latencyMs"`
	Error     string    `json:"error,omitempty"`
	CheckedAt time.Time `json:"checkedAt"`
}

type Checker struct {
	Registry *registry.Registry
	Store    *store.Store
	Interval time.Duration
	Timeout  time.Duration
	Client   *http.Client

	mu      sync.RWMutex
	results map[string]Result
}

func New(reg *registry.Registry, st *store.Store) *Checker {
	return &Checker{
		Registry: reg,
		Store:    st,
		Interval: 30 * time.Second,
		Timeout:  3 * time.Second,
		// Never follow redirects: a health path answers directly or fails.
		Client:  &http.Client{CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }},
		results: map[string]Result{},
	}
}

// Run checks immediately, then every Interval until ctx ends.
func (c *Checker) Run(ctx context.Context) {
	c.CheckAll(ctx)
	t := time.NewTicker(c.Interval)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
			c.CheckAll(ctx)
		}
	}
}

// CheckAll checks every service app in parallel.
func (c *Checker) CheckAll(ctx context.Context) {
	var wg sync.WaitGroup
	for _, a := range c.Registry.Apps() {
		if a.Type != "service" {
			continue
		}
		wg.Add(1)
		go func(a registry.App) {
			defer wg.Done()
			c.Check(ctx, a)
		}(a)
	}
	wg.Wait()
}

// Check runs one health check now, records it, and returns the result.
func (c *Checker) Check(ctx context.Context, a registry.App) Result {
	path := a.Health
	if path == "" {
		path = "/health"
	}
	url := strings.TrimRight(a.Upstream, "/") + "/" + strings.TrimLeft(path, "/")
	ctx, cancel := context.WithTimeout(ctx, c.Timeout)
	defer cancel()

	start := time.Now()
	res := Result{CheckedAt: start.UTC()}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err == nil {
		var resp *http.Response
		resp, err = c.Client.Do(req)
		if err == nil {
			resp.Body.Close()
			res.Status = resp.StatusCode
			res.OK = resp.StatusCode >= 200 && resp.StatusCode < 300
			if !res.OK {
				res.Error = resp.Status
			}
		}
	}
	res.LatencyMS = time.Since(start).Milliseconds()
	if err != nil {
		res.Error = shortErr(err)
	}

	c.mu.Lock()
	prev, had := c.results[a.ID]
	c.results[a.ID] = res
	c.mu.Unlock()
	if !had || prev.OK != res.OK {
		slog.Info("app health", "app", a.ID, "ok", res.OK, "error", res.Error)
	}
	if c.Store != nil {
		if err := c.Store.RecordHealth(context.Background(), a.ID, res.OK, res.Status, res.LatencyMS, res.Error, res.CheckedAt); err != nil {
			slog.Warn("record health", "app", a.ID, "err", err)
		}
	}
	return res
}

func (c *Checker) Get(id string) (Result, bool) {
	c.mu.RLock()
	defer c.mu.RUnlock()
	r, ok := c.results[id]
	return r, ok
}

func shortErr(err error) string {
	s := err.Error()
	switch {
	case strings.Contains(s, "deadline exceeded"), strings.Contains(s, "Timeout"):
		return "timed out"
	case strings.Contains(s, "connection refused"), strings.Contains(s, "actively refused"):
		return "not running"
	}
	return s
}
