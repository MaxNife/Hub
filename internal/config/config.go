package config

import (
	"os"
	"strconv"
)

type Config struct {
	Addr        string
	AppsDir     string
	DataDir     string
	PasswordHash string
	CalendarICS string
	LogLevel    string
}

func Load() Config {
	return Config{
		Addr:         envOr("HUB_ADDR", "127.0.0.1:8080"),
		AppsDir:      envOr("HUB_APPS_DIR", "./apps"),
		DataDir:      envOr("HUB_DATA_DIR", "./data"),
		PasswordHash: os.Getenv("HUB_PASSWORD_HASH"),
		CalendarICS:  os.Getenv("HUB_CALENDAR_ICS"),
		LogLevel:     envOr("HUB_LOG_LEVEL", "info"),
	}
}

func envOr(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}

func envIntOr(key string, def int) int {
	if v := os.Getenv(key); v != "" {
		if n, err := strconv.Atoi(v); err == nil {
			return n
		}
	}
	return def
}
