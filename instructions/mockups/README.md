# Hub mockups — design reference

Design mockups exported from a visual design tool. Treat them as
reference: the inline styles carry the exact values (colours, sizes,
spacing, radii, shadows) that the React app replicates in
`web/src/index.css`, not code to copy.

| File | Screen | Built as |
| --- | --- | --- |
| `Main.dc.html` | Home, desktop (1440 × 1040), light and dark | `web/src/pages/Home.tsx`, `Sidebar.tsx` |
| `Mobile.dc.html` | Home, mobile (390 × 844) | same components, `@media (max-width: 640px)` |
| `FootballSettings.dc.html` | Football settings (760 wide) | `web/src/pages/FootballSettings.tsx` |

`support.js` and `vendor/` are only the runtime that renders the mockups.

## Viewing

Serve this folder (e.g. `python3 -m http.server`) and open a `.dc.html`
file; browsers block the scripts over `file://`. The Home mockup's props
(`theme`, `football`) switch light/dark and the live/results/fixtures states.
