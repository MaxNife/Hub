// Package auth is Hub's single-user login: a bcrypt password hash from
// config, 30-day sessions stored as token hashes, middleware over /api and
// /apps, a CSRF header rule and login throttling.
package auth

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"log/slog"
	"net"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"

	"golang.org/x/crypto/bcrypt"

	"hub/internal/proxy"
	"hub/internal/store"
)

const (
	CookieName  = proxy.SessionCookie
	sessionTTL  = 30 * 24 * time.Hour
	maxFailures = 5
	lockout     = time.Minute
)

type Auth struct {
	Hash  string // bcrypt hash; empty means login is off (localhost only)
	Store *store.Store

	mu       sync.Mutex
	failures map[string]*attempts
}

type attempts struct {
	n     int
	until time.Time
}

func New(hash string, st *store.Store) *Auth {
	return &Auth{Hash: hash, Store: st, failures: map[string]*attempts{}}
}

func (a *Auth) Enabled() bool { return a.Hash != "" }

// HashPassword is what `hub hash-password` prints.
func HashPassword(pw string) (string, error) {
	b, err := bcrypt.GenerateFromPassword([]byte(pw), bcrypt.DefaultCost)
	return string(b), err
}

// Middleware guards /api/* and /apps/* (except the open endpoints) and
// requires X-Hub-Request: 1 on every state-changing API call.
func (a *Auth) Middleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		p := r.URL.Path
		isAPI := strings.HasPrefix(p, "/api/")
		isApps := strings.HasPrefix(p, "/apps/")
		if isAPI && r.Method != http.MethodGet && r.Method != http.MethodHead && r.Header.Get("X-Hub-Request") != "1" {
			writeErr(w, http.StatusForbidden, "missing X-Hub-Request header")
			return
		}
		open := p == "/api/login" || p == "/api/session"
		if !a.Enabled() || open || (!isAPI && !isApps) {
			next.ServeHTTP(w, r)
			return
		}
		if !a.valid(r) {
			if isAPI {
				writeErr(w, http.StatusUnauthorized, "Sign in required")
			} else {
				http.Error(w, "Sign in to Hub first.", http.StatusUnauthorized)
			}
			return
		}
		next.ServeHTTP(w, r)
	})
}

func (a *Auth) valid(r *http.Request) bool {
	c, err := r.Cookie(CookieName)
	if err != nil || c.Value == "" {
		return false
	}
	ok, err := a.Store.SessionValid(r.Context(), hashToken(c.Value))
	return err == nil && ok
}

func (a *Auth) Routes(mux *http.ServeMux) {
	mux.HandleFunc("GET /api/session", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, 200, map[string]bool{"authRequired": a.Enabled(), "authenticated": !a.Enabled() || a.valid(r)})
	})

	mux.HandleFunc("POST /api/login", func(w http.ResponseWriter, r *http.Request) {
		if !a.Enabled() {
			writeJSON(w, 200, map[string]bool{"authenticated": true})
			return
		}
		ip := clientIP(r)
		if wait := a.lockedFor(ip); wait > 0 {
			w.Header().Set("Retry-After", strconv.Itoa(int(wait.Seconds())+1))
			writeErr(w, http.StatusTooManyRequests, "Too many attempts. Try again in a minute.")
			return
		}
		var body struct {
			Password string `json:"password"`
		}
		if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 4096)).Decode(&body); err != nil {
			writeErr(w, 400, "bad request")
			return
		}
		if bcrypt.CompareHashAndPassword([]byte(a.Hash), []byte(body.Password)) != nil {
			a.fail(ip)
			slog.Warn("login failed", "ip", ip)
			writeErr(w, http.StatusUnauthorized, "Wrong password")
			return
		}
		a.clear(ip)
		token, err := newToken()
		if err != nil {
			writeErr(w, 500, "could not sign in")
			return
		}
		expires := time.Now().Add(sessionTTL)
		if err := a.Store.CreateSession(r.Context(), hashToken(token), expires); err != nil {
			writeErr(w, 500, "could not sign in")
			return
		}
		http.SetCookie(w, &http.Cookie{
			Name: CookieName, Value: token, Path: "/", Expires: expires, MaxAge: int(sessionTTL.Seconds()),
			HttpOnly: true, SameSite: http.SameSiteLaxMode, Secure: isHTTPS(r),
		})
		slog.Info("login", "ip", ip)
		writeJSON(w, 200, map[string]bool{"authenticated": true})
	})

	mux.HandleFunc("POST /api/logout", func(w http.ResponseWriter, r *http.Request) {
		if c, err := r.Cookie(CookieName); err == nil {
			_ = a.Store.DeleteSession(r.Context(), hashToken(c.Value))
		}
		http.SetCookie(w, &http.Cookie{Name: CookieName, Value: "", Path: "/", MaxAge: -1, HttpOnly: true, SameSite: http.SameSiteLaxMode, Secure: isHTTPS(r)})
		writeJSON(w, 200, map[string]bool{"authenticated": false})
	})
}

func (a *Auth) lockedFor(ip string) time.Duration {
	a.mu.Lock()
	defer a.mu.Unlock()
	if f, ok := a.failures[ip]; ok && time.Now().Before(f.until) {
		return time.Until(f.until)
	}
	return 0
}

func (a *Auth) fail(ip string) {
	a.mu.Lock()
	defer a.mu.Unlock()
	f, ok := a.failures[ip]
	if !ok || (!f.until.IsZero() && time.Now().After(f.until)) {
		f = &attempts{}
		a.failures[ip] = f
	}
	f.n++
	if f.n >= maxFailures {
		f.until = time.Now().Add(lockout)
	}
}

func (a *Auth) clear(ip string) {
	a.mu.Lock()
	defer a.mu.Unlock()
	delete(a.failures, ip)
}

func newToken() (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(b), nil
}

func hashToken(t string) string {
	sum := sha256.Sum256([]byte(t))
	return hex.EncodeToString(sum[:])
}

// clientIP trusts X-Forwarded-For only from a local reverse proxy
// (e.g. `tailscale serve`), which is how remote requests arrive.
func clientIP(r *http.Request) string {
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		host = r.RemoteAddr
	}
	if ip := net.ParseIP(host); ip != nil && ip.IsLoopback() {
		if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
			first, _, _ := strings.Cut(xff, ",")
			return strings.TrimSpace(first)
		}
	}
	return host
}

func isHTTPS(r *http.Request) bool {
	return r.TLS != nil || r.Header.Get("X-Forwarded-Proto") == "https"
}

func writeJSON(w http.ResponseWriter, code int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	_ = json.NewEncoder(w).Encode(v)
}

func writeErr(w http.ResponseWriter, code int, msg string) {
	writeJSON(w, code, map[string]string{"error": msg})
}
