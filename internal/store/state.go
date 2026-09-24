package store

import (
	"context"
	"database/sql"
	"time"
)

// AppState is user state for one app. A missing row means "installed",
// so newly dropped apps show up without any clicks; hiding sets installed=0.
type AppState struct {
	Installed   bool
	Pinned      bool
	InstalledAt *time.Time
}

func (s *Store) GetState(ctx context.Context, appID string) (AppState, error) {
	var installed, pinned int
	var installedAt *string
	err := s.DB.QueryRowContext(ctx,
		`SELECT installed, pinned, installed_at FROM app_state WHERE app_id = ?`, appID,
	).Scan(&installed, &pinned, &installedAt)
	if err == sql.ErrNoRows {
		return AppState{Installed: true}, nil
	}
	if err != nil {
		return AppState{}, err
	}
	st := AppState{Installed: installed != 0, Pinned: pinned != 0}
	if installedAt != nil {
		if t, err := time.Parse(time.RFC3339, *installedAt); err == nil {
			st.InstalledAt = &t
		}
	}
	return st, nil
}

func (s *Store) SetInstalled(ctx context.Context, appID string, installed bool) error {
	now := time.Now().UTC().Format(time.RFC3339)
	if installed {
		_, err := s.DB.ExecContext(ctx,
			`INSERT INTO app_state(app_id, installed, installed_at)
			 VALUES (?, 1, ?)
			 ON CONFLICT(app_id) DO UPDATE SET installed = 1, installed_at = COALESCE(installed_at, ?)`,
			appID, now, now)
		return err
	}
	_, err := s.DB.ExecContext(ctx,
		`INSERT INTO app_state(app_id, installed) VALUES (?, 0)
		 ON CONFLICT(app_id) DO UPDATE SET installed = 0`, appID)
	return err
}

func (s *Store) SetPinned(ctx context.Context, appID string, pinned bool) error {
	v := 0
	if pinned {
		v = 1
	}
	_, err := s.DB.ExecContext(ctx,
		`INSERT INTO app_state(app_id, pinned) VALUES (?, ?)
		 ON CONFLICT(app_id) DO UPDATE SET pinned = ?`, appID, v, v)
	return err
}

func (s *Store) RecordOpen(ctx context.Context, appID string) error {
	_, err := s.DB.ExecContext(ctx,
		`INSERT INTO app_opens(app_id, opened_at) VALUES (?, ?)`,
		appID, time.Now().UTC().Format(time.RFC3339))
	return err
}

type RecentApp struct {
	AppID    string `json:"appId"`
	OpenedAt string `json:"openedAt"`
}

func (s *Store) Recent(ctx context.Context, limit int) ([]RecentApp, error) {
	if limit <= 0 || limit > 50 {
		limit = 6
	}
	rows, err := s.DB.QueryContext(ctx,
		`SELECT app_id, MAX(opened_at) AS opened_at FROM app_opens
		 GROUP BY app_id ORDER BY opened_at DESC LIMIT ?`, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []RecentApp
	for rows.Next() {
		var ra RecentApp
		if err := rows.Scan(&ra.AppID, &ra.OpenedAt); err != nil {
			return nil, err
		}
		out = append(out, ra)
	}
	if out == nil {
		out = []RecentApp{}
	}
	return out, rows.Err()
}

type Category struct {
	Name  string `json:"name"`
	Count int    `json:"count"`
}
