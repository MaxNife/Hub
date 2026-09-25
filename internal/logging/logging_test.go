package logging

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestRotatorKeepsOldFiles(t *testing.T) {
	dir := t.TempDir()
	p := filepath.Join(dir, "hub.log")
	r, err := NewRotator(p, 20, 2)
	if err != nil {
		t.Fatal(err)
	}
	for i := 0; i < 6; i++ {
		if _, err := r.Write([]byte(strings.Repeat("x", 15) + "\n")); err != nil {
			t.Fatal(err)
		}
	}
	r.Close()
	for _, name := range []string{"hub.log", "hub.log.1", "hub.log.2"} {
		if _, err := os.Stat(filepath.Join(dir, name)); err != nil {
			t.Errorf("%s missing: %v", name, err)
		}
	}
	if _, err := os.Stat(filepath.Join(dir, "hub.log.3")); err == nil {
		t.Error("kept more files than asked")
	}
}
