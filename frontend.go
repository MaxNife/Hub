// Package hub embeds the built React frontend (web/dist) into the binary.
// Build web/ first (npm run build); see build.ps1.
package hub

import "embed"

//go:embed web/dist
var Dist embed.FS
