package store

import (
	"context"
	"database/sql"
	"embed"
	"fmt"
	"io/fs"
	"log/slog"
	"os"
	"path/filepath"
	"sort"
	"time"

	_ "modernc.org/sqlite"
)

//go:embed migrations/*.sql
var migrationFS embed.FS

type Store struct {
	DB *sql.DB
}

func Open(dataDir string) (*Store, error) {
	path := filepath.Join(dataDir, "hub.db")
	db, err := sql.Open("sqlite", path+"?_pragma=journal_mode(WAL)&_pragma=busy_timeout(5000)")
	if err != nil {
		return nil, fmt.Errorf("open sqlite: %w", err)
	}
	s := &Store{DB: db}
	if err := s.migrate(context.Background()); err != nil {
		db.Close()
		return nil, err
	}
	_ = s.Prune(context.Background())
	return s, nil
}

func (s *Store) migrate(ctx context.Context) error {
	entries, err := fs.Glob(migrationFS, "migrations/*.sql")
	if err != nil {
		return err
	}
	sort.Strings(entries)
	var version int
	_ = s.DB.QueryRowContext(ctx, `SELECT version FROM schema_version LIMIT 1`).Scan(&version)
	if version == 0 {
		if _, err := s.DB.ExecContext(ctx, `CREATE TABLE IF NOT EXISTS schema_version (version INTEGER NOT NULL)`); err != nil {
			return err
		}
	}
	for i, name := range entries {
		want := i + 1
		if want <= version {
			continue
		}
		b, err := migrationFS.ReadFile(name)
		if err != nil {
			return err
		}
		if _, err := s.DB.ExecContext(ctx, string(b)); err != nil {
			return fmt.Errorf("migration %s: %w", name, err)
		}
		if _, err := s.DB.ExecContext(ctx, `DELETE FROM schema_version; INSERT INTO schema_version(version) VALUES (?)`, want); err != nil {
			return err
		}
		slog.Info("applied migration", "file", name, "version", want)
	}
	return nil
}

func (s *Store) Close() error { return s.DB.Close() }

// Prune applies the retention rules: opens 90 days, health checks 7 days,
// expired sessions. Timestamps are RFC 3339 UTC, which sort as text.
func (s *Store) Prune(ctx context.Context) error {
	now := time.Now().UTC()
	stmts := []struct {
		q   string
		arg string
	}{
		{`DELETE FROM app_opens WHERE opened_at < ?`, now.AddDate(0, 0, -90).Format(time.RFC3339)},
		{`DELETE FROM health_checks WHERE checked_at < ?`, now.AddDate(0, 0, -7).Format(time.RFC3339)},
		{`DELETE FROM sessions WHERE expires_at < ?`, now.Format(time.RFC3339)},
	}
	for _, st := range stmts {
		if _, err := s.DB.ExecContext(ctx, st.q, st.arg); err != nil {
			return err
		}
	}
	return nil
}

// Backup writes a consistent copy of the database while Hub runs.
func (s *Store) Backup(ctx context.Context, path string) error {
	_ = os.Remove(path) // VACUUM INTO refuses to overwrite
	_, err := s.DB.ExecContext(ctx, `VACUUM INTO ?`, path)
	return err
}
