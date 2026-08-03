## 2026-08-03 — Add Cache-Control: no-store to all /api/ proxy locations

### Fixed
- Added `add_header Cache-Control "no-store" always;` to all 25 `/api/` location blocks
  in `nginx.conf`. RFC 9111 lists 410 (and other 4xx/5xx) as heuristically cacheable;
  without explicit freshness metadata, browsers can pin transient errors indefinitely.
  The `always` flag ensures the header is emitted even when the upstream returns an
  error response — the exact path that caused Pierre's browser to cache a 410 from the
  stale chromadb `/api/v1/heartbeat` endpoint and replay it from disk for days.
