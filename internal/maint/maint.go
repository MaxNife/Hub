// Package maint runs Hub's daily housekeeping: retention pruning and a
// consistent database backup (keeps the last 7).
package maint

import (
	"context"
	"log/slog"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"hub/internal/store"
)

const keepBackups = 7

func Run(ctx context.Context, st *store.Store, dataDir string) {
	daily(ctx, st, dataDir)
	t := time.NewTicker(24 * time.Hour)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
			daily(ctx, st, dataDir)
		}
	}
}

func daily(ctx context.Context, st *store.Store, dataDir string) {
	if err := st.Prune(ctx); err != nil {
		slog.Warn("prune failed", "err", err)
	}
	dir := filepath.Join(dataDir, "backups")
	if err := os.MkdirAll(dir, 0o755); err != nil {
		slog.Warn("backup dir", "err", err)
		return
	}
	path := filepath.Join(dir, "hub-"+time.Now().Format("20060102")+".db")
	if err := st.Backup(ctx, path); err != nil {
		slog.Warn("backup failed", "err", err)
		return
	}
	slog.Info("backup written", "path", path)
	trim(dir)
}

// trim deletes all but the newest keepBackups backups (names sort by date).
func trim(dir string) {
	entries, err := os.ReadDir(dir)
	if err != nil {
		return
	}
	var names []string
	for _, e := range entries {
		if strings.HasPrefix(e.Name(), "hub-") && strings.HasSuffix(e.Name(), ".db") {
			names = append(names, e.Name())
		}
	}
	sort.Strings(names)
	for len(names) > keepBackups {
		_ = os.Remove(filepath.Join(dir, names[0]))
		names = names[1:]
	}
}
