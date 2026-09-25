package health

import (
	"context"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"

	"hub/internal/registry"
	"hub/internal/store"
)

func TestCheckRecordsUpAndDown(t *testing.T) {
	up := true
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/health" || !up {
			http.Error(w, "no", 503)
		}
	}))
	defer srv.Close()

	apps := t.TempDir()
	dir := filepath.Join(apps, "football")
	os.MkdirAll(dir, 0o755)
	os.WriteFile(filepath.Join(dir, "icon.svg"), []byte("<svg/>"), 0o644)
	os.WriteFile(filepath.Join(dir, "hub.json"), []byte(`{"manifestVersion":1,"id":"football","name":"Football","category":"Info","icon":"icon.svg","type":"service","upstream":"`+srv.URL+`"}`), 0o644)
	reg := registry.New()
	if err := reg.Rescan(apps); err != nil || len(reg.Apps()) != 1 {
		t.Fatalf("rescan: %v %v", err, reg.Errors())
	}
	st, _ := store.Open(t.TempDir())
	defer st.Close()

	c := New(reg, st)
	c.CheckAll(context.Background())
	if r, _ := c.Get("football"); !r.OK {
		t.Fatalf("expected up: %+v", r)
	}
	up = false
	c.CheckAll(context.Background())
	if r, _ := c.Get("football"); r.OK || r.Status != 503 {
		t.Fatalf("expected down: %+v", r)
	}
	srv.Close()
	a, _ := reg.Get("football")
	if r := c.Check(context.Background(), a); r.OK || r.Error != "not running" {
		t.Fatalf("expected not running: %+v", r)
	}
	var n int
	st.DB.QueryRow(`SELECT COUNT(*) FROM health_checks WHERE app_id = 'football'`).Scan(&n)
	if n != 3 {
		t.Fatalf("recorded %d checks", n)
	}
}
