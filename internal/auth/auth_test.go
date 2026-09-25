package auth

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"hub/internal/store"
)

func setup(t *testing.T) (*Auth, http.Handler) {
	t.Helper()
	st, err := store.Open(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { st.Close() })
	hash, _ := HashPassword("correct horse")
	a := New(hash, st)
	mux := http.NewServeMux()
	a.Routes(mux)
	mux.HandleFunc("/api/apps", func(w http.ResponseWriter, r *http.Request) { w.Write([]byte("apps")) })
	mux.HandleFunc("/apps/memory/", func(w http.ResponseWriter, r *http.Request) { w.Write([]byte("memory")) })
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) { w.Write([]byte("shell")) })
	return a, a.Middleware(mux)
}

func do(h http.Handler, method, path, body string, cookie *http.Cookie, csrf bool) *httptest.ResponseRecorder {
	r := httptest.NewRequest(method, path, strings.NewReader(body))
	r.RemoteAddr = "10.0.0.7:5555"
	if csrf {
		r.Header.Set("X-Hub-Request", "1")
	}
	if cookie != nil {
		r.AddCookie(cookie)
	}
	w := httptest.NewRecorder()
	h.ServeHTTP(w, r)
	return w
}

func TestLoginFlow(t *testing.T) {
	_, h := setup(t)
	if w := do(h, "GET", "/", "", nil, false); w.Code != 200 {
		t.Fatalf("shell should be open, got %d", w.Code)
	}
	if w := do(h, "GET", "/api/apps", "", nil, false); w.Code != 401 {
		t.Fatalf("api should need login, got %d", w.Code)
	}
	if w := do(h, "GET", "/apps/memory/", "", nil, false); w.Code != 401 {
		t.Fatalf("apps should need login, got %d", w.Code)
	}
	if w := do(h, "POST", "/api/login", `{"password":"correct horse"}`, nil, false); w.Code != 403 {
		t.Fatalf("login without CSRF header should be refused, got %d", w.Code)
	}
	w := do(h, "POST", "/api/login", `{"password":"correct horse"}`, nil, true)
	if w.Code != 200 {
		t.Fatalf("login = %d %s", w.Code, w.Body)
	}
	c := w.Result().Cookies()[0]
	if !c.HttpOnly || c.SameSite != http.SameSiteLaxMode || c.Name != CookieName {
		t.Fatalf("cookie flags: %+v", c)
	}
	if w := do(h, "GET", "/api/apps", "", c, false); w.Code != 200 {
		t.Fatalf("signed-in api = %d", w.Code)
	}
	if w := do(h, "GET", "/api/session", "", c, false); !strings.Contains(w.Body.String(), `"authenticated":true`) {
		t.Fatalf("session = %s", w.Body)
	}
	do(h, "POST", "/api/logout", "", c, true)
	if w := do(h, "GET", "/api/apps", "", c, false); w.Code != 401 {
		t.Fatalf("after logout = %d", w.Code)
	}
}

func TestThrottle(t *testing.T) {
	_, h := setup(t)
	for i := 0; i < maxFailures; i++ {
		if w := do(h, "POST", "/api/login", `{"password":"nope"}`, nil, true); w.Code != 401 {
			t.Fatalf("attempt %d = %d", i, w.Code)
		}
	}
	w := do(h, "POST", "/api/login", `{"password":"correct horse"}`, nil, true)
	if w.Code != 429 || w.Header().Get("Retry-After") == "" {
		t.Fatalf("expected lockout, got %d", w.Code)
	}
}

func TestDisabledStillNeedsCSRF(t *testing.T) {
	st, _ := store.Open(t.TempDir())
	defer st.Close()
	a := New("", st)
	h := a.Middleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {}))
	if w := do(h, "GET", "/api/apps", "", nil, false); w.Code != 200 {
		t.Fatalf("open read = %d", w.Code)
	}
	if w := do(h, "DELETE", "/api/apps/x/pin", "", nil, false); w.Code != 403 {
		t.Fatalf("write without header = %d", w.Code)
	}
}
