// Command hub is the Hub server: one binary serving the React shell, the
// JSON API, static apps from disk and service apps through a reverse proxy.
//
//	hub                  run the server (config from HUB_* env vars)
//	hub hash-password    print a bcrypt hash for HUB_PASSWORD_HASH
package main

import (
	"bufio"
	"context"
	"errors"
	"fmt"
	"io/fs"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"
	_ "time/tzdata" // calendar TZIDs resolve on Windows too

	"hub"
	"hub/internal/api"
	"hub/internal/auth"
	"hub/internal/config"
	"hub/internal/health"
	"hub/internal/integrations"
	"hub/internal/logging"
	"hub/internal/maint"
	"hub/internal/proxy"
	"hub/internal/registry"
	"hub/internal/serve"
	"hub/internal/spa"
	"hub/internal/store"
)

func main() {
	if len(os.Args) > 1 && os.Args[1] == "hash-password" {
		if err := hashPassword(); err != nil {
			fmt.Fprintln(os.Stderr, err)
			os.Exit(1)
		}
		return
	}
	if err := run(); err != nil {
		slog.Error("hub stopped", "err", err)
		os.Exit(1)
	}
}

func run() error {
	cfg := config.Load()
	if err := cfg.Validate(); err != nil {
		return err
	}
	if err := os.MkdirAll(cfg.DataDir, 0o755); err != nil {
		return err
	}
	logFile, err := logging.Setup(cfg.DataDir, cfg.LogLevel)
	if err != nil {
		return err
	}
	defer logFile.Close()

	st, err := store.Open(cfg.DataDir)
	if err != nil {
		return err
	}
	defer st.Close()

	reg := registry.New()
	if err := reg.Rescan(cfg.AppsDir); err != nil {
		slog.Warn("initial scan failed", "err", err)
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	checker := health.New(reg, st)
	go checker.Run(ctx)

	weather := &integrations.Weather{Store: st, BaseURL: cfg.WeatherURL}
	providers := []integrations.Provider{weather}
	if cfg.CalendarICS != "" {
		providers = append(providers, &integrations.Calendar{URL: cfg.CalendarICS})
	}
	status := integrations.NewManager(providers...)
	go status.Run(ctx)

	go maint.Run(ctx, st, cfg.DataDir)

	authn := auth.New(cfg.PasswordHash, st)
	mux := http.NewServeMux()
	authn.Routes(mux)
	(&api.Handler{
		Store: st, Registry: reg, AppsDir: cfg.AppsDir, Health: checker,
		Status: status, Weather: weather, GeocodeURL: cfg.GeocodeURL,
		CalendarSet: cfg.CalendarICS != "", AuthEnabled: authn.Enabled(),
	}).Routes(mux)
	mux.Handle("/apps/", (&serve.Server{Registry: reg, Store: st, Proxy: proxy.New()}).Handler())

	dist, err := fs.Sub(hub.Dist, "web/dist")
	if err != nil {
		return err
	}
	mux.Handle("/", spa.Handler(dist))

	srv := &http.Server{
		Addr:              cfg.Addr,
		Handler:           logRequests(authn.Middleware(mux)),
		ReadHeaderTimeout: 10 * time.Second,
	}
	errc := make(chan error, 1)
	go func() {
		slog.Info("hub listening", "addr", cfg.Addr, "tls", cfg.TLSCert != "", "auth", authn.Enabled(), "apps", len(reg.Apps()))
		if cfg.TLSCert != "" {
			errc <- srv.ListenAndServeTLS(cfg.TLSCert, cfg.TLSKey)
		} else {
			errc <- srv.ListenAndServe()
		}
	}()

	select {
	case err := <-errc:
		if !errors.Is(err, http.ErrServerClosed) {
			return err
		}
	case <-ctx.Done():
		slog.Info("shutting down")
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		return srv.Shutdown(shutdownCtx)
	}
	return nil
}

// logRequests writes one line per request: method, path, status, duration.
func logRequests(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		rec := &statusRecorder{ResponseWriter: w, status: 200}
		next.ServeHTTP(rec, r)
		slog.Info("request", "method", r.Method, "path", r.URL.Path, "status", rec.status, "ms", time.Since(start).Milliseconds())
	})
}

type statusRecorder struct {
	http.ResponseWriter
	status int
}

func (s *statusRecorder) WriteHeader(code int) {
	s.status = code
	s.ResponseWriter.WriteHeader(code)
}

// Unwrap lets http.ResponseController reach Flush/Hijack (proxied
// WebSockets and streaming responses need them).
func (s *statusRecorder) Unwrap() http.ResponseWriter { return s.ResponseWriter }

func hashPassword() error {
	fmt.Fprint(os.Stderr, "Password: ")
	line, err := bufio.NewReader(os.Stdin).ReadString('\n')
	if err != nil && line == "" {
		return err
	}
	pw := strings.TrimRight(line, "\r\n")
	if len(pw) < 8 {
		return errors.New("use at least 8 characters")
	}
	hash, err := auth.HashPassword(pw)
	if err != nil {
		return err
	}
	fmt.Println(hash)
	fmt.Fprintln(os.Stderr, "Set it as HUB_PASSWORD_HASH (quote it: it contains $ signs).")
	return nil
}
