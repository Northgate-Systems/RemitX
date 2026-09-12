# Bundle-size analysis

`npm run analyze` runs a production build with `@next/bundle-analyzer`
enabled and opens the client/server/edge treemap reports for the app's
webpack build (`ANALYZE=true next build --webpack`). Turbopack builds
(the default `next build`) are not supported by the analyzer yet — Next
will print a reminder and skip the report if `ANALYZE=true` is set
without `--webpack`.

## Current bundle composition (2026-09-12 snapshot)

Largest client chunks, by parsed size:

| Size | Chunk |
| --- | --- |
| 598.5 KB | `react-dom-client.production.js` (Next's vendored copy, RSC chunk) |
| 523.5 KB | `react-dom-client.production.js` (framework chunk) |
| 98.5 KB | Next.js router segment cache internals |
| 83.2 KB | Next.js router |
| 53.1 KB | `/rates` page (largest app route — rate-alert UI + polling logic, no chart library) |
| 45.2 KB | `landing-client.tsx` (marketing landing page) |
| 37.7 KB | `/dashboard` page |
| 27.8 KB | `/send` page |
| 25.7 KB | `/review` page |

The rest of the per-route chunks (`/anchors`, `/login`, `/routes`,
`/activity`, `/activity/[id]`) are all under 20 KB.

## Findings

- No oversized third-party dependency is being pulled into the client
  bundle. The two largest chunks are React/Next's own framework code
  (present on every Next.js app and already code-split into a shared
  chunk cached across routes), not app-added libraries.
- The heaviest per-route app code is `/rates` (~53 KB) — this is a
  self-contained page (rate-alert CRUD, polling, sorting) with no
  charting or heavy visualization library, despite the name; nothing
  here is a bundle-size red flag.
- `lucide-react` icons are imported per-icon (`import { X } from
  "lucide-react"`) rather than as a barrel import, so tree-shaking
  already applies — no action needed.

Re-run `npm run analyze` after adding a new dependency to confirm it
doesn't regress this baseline.
