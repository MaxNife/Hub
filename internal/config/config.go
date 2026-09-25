package config

import (
	"fmt"
	"net"
	"os"
)

type Config struct {
	Addr         string
	AppsDir      string
	DataDir      string
	PasswordHash string
	CalendarICS  string
	LogLevel     string
	TLSCert      string
	TLSKey       string
	WeatherURL   string
	GeocodeURL   string
}

func Load() Config {
	return Config{
		Addr:         envOr("HUB_ADDR", "127.0.0.1:8080"),
		AppsDir:      envOr("HUB_APPS_DIR", "./apps"),
		DataDir:      envOr("HUB_DATA_DIR", "./data"),
		PasswordHash: os.Getenv("HUB_PASSWORD_HASH"),
		CalendarICS:  os.Getenv("HUB_CALENDAR_ICS"),
		LogLevel:     envOr("HUB_LOG_LEVEL", "info"),
		TLSCert:      os.Getenv("HUB_TLS_CERT"),
		TLSKey:       os.Getenv("HUB_TLS_KEY"),
		WeatherURL:   envOr("HUB_WEATHER_URL", "https://api.open-meteo.com"),
		GeocodeURL:   envOr("HUB_GEOCODE_URL", "https://geocoding-api.open-meteo.com"),
	}
}

// Validate enforces the security rule: anything wider than localhost
// requires a password.
func (c Config) Validate() error {
	if !c.Loopback() && c.PasswordHash == "" {
		return fmt.Errorf("HUB_ADDR %q is reachable from other machines: set HUB_PASSWORD_HASH (run `hub hash-password`)", c.Addr)
	}
	if (c.TLSCert == "") != (c.TLSKey == "") {
		return fmt.Errorf("set both HUB_TLS_CERT and HUB_TLS_KEY, or neither")
	}
	return nil
}

// Loopback reports whether Addr only listens on this machine.
func (c Config) Loopback() bool {
	host, _, err := net.SplitHostPort(c.Addr)
	if err != nil {
		return false
	}
	if host == "localhost" {
		return true
	}
	ip := net.ParseIP(host)
	return ip != nil && ip.IsLoopback()
}

func envOr(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}
