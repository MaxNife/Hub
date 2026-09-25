// Package integrations runs the status strip providers. Each refreshes on
// its own timer into an in-memory cache, so /api/status never waits on an
// outside service and a failing provider shows a dash instead of an error.
package integrations

import (
	"context"
	"log/slog"
	"sync"
	"time"
)

type Provider interface {
	Name() string
	Interval() time.Duration
	Fetch(ctx context.Context) (any, error)
}

// Entry is what /api/status returns for one provider.
type Entry struct {
	Value     any        `json:"value"`
	UpdatedAt *time.Time `json:"updatedAt,omitempty"`
	Error     string     `json:"error,omitempty"`
}

type state struct {
	value   any
	okAt    time.Time
	err     string
	refresh chan struct{}
}

type Manager struct {
	providers []Provider
	mu        sync.RWMutex
	states    map[string]*state
}

func NewManager(ps ...Provider) *Manager {
	m := &Manager{providers: ps, states: map[string]*state{}}
	for _, p := range ps {
		m.states[p.Name()] = &state{refresh: make(chan struct{}, 1)}
	}
	return m
}

// Run starts one refresh loop per provider and blocks until ctx ends.
func (m *Manager) Run(ctx context.Context) {
	var wg sync.WaitGroup
	for _, p := range m.providers {
		wg.Add(1)
		go func(p Provider) {
			defer wg.Done()
			m.loop(ctx, p)
		}(p)
	}
	wg.Wait()
}

// retryAfter is how soon a failed fetch is retried (capped by the interval).
const retryAfter = time.Minute

func (m *Manager) loop(ctx context.Context, p Provider) {
	st := m.states[p.Name()]
	for {
		wait := p.Interval()
		if err := m.fetch(ctx, p); err != nil && retryAfter < wait {
			wait = retryAfter
		}
		t := time.NewTimer(wait)
		select {
		case <-ctx.Done():
			t.Stop()
			return
		case <-t.C:
		case <-st.refresh:
			t.Stop()
		}
	}
}

func (m *Manager) fetch(ctx context.Context, p Provider) error {
	ctx, cancel := context.WithTimeout(ctx, 15*time.Second)
	defer cancel()
	v, err := p.Fetch(ctx)
	m.mu.Lock()
	defer m.mu.Unlock()
	st := m.states[p.Name()]
	if err != nil {
		if st.err == "" {
			slog.Warn("provider failed", "provider", p.Name(), "err", err)
		}
		st.err = err.Error()
		return err
	}
	st.value, st.okAt, st.err = v, time.Now().UTC(), ""
	return nil
}

// Refresh asks a provider to fetch now (e.g. after its settings changed).
func (m *Manager) Refresh(name string) {
	m.mu.RLock()
	st, ok := m.states[name]
	m.mu.RUnlock()
	if !ok {
		return
	}
	select {
	case st.refresh <- struct{}{}:
	default:
	}
}

// Get returns the cached value. A value older than two refresh intervals
// is dropped, so a dead network shows a dash rather than stale data.
func (m *Manager) Get(name string) Entry {
	m.mu.RLock()
	defer m.mu.RUnlock()
	st, ok := m.states[name]
	if !ok {
		return Entry{}
	}
	var interval time.Duration
	for _, p := range m.providers {
		if p.Name() == name {
			interval = p.Interval()
		}
	}
	e := Entry{Error: st.err}
	if !st.okAt.IsZero() && time.Since(st.okAt) <= 2*interval {
		at := st.okAt
		e.Value, e.UpdatedAt = st.value, &at
	}
	return e
}
