## 2026-08-14 — Add regression tests for bob auth wiring and decommissioned agents

### Added
- `frontend/src/infra-wiring.test.js`: New vitest suite that reads repo config
  files directly (no server, no network, no Docker) and fails loudly if the
  2026-08-13 incident regresses — the bob service-token wiring
  (`nginx.conf`'s `include /etc/nginx/bob-auth.conf;` on every `/api/bob/`
  location, and `docker-compose.yml`'s `./bob-auth.conf:/etc/nginx/bob-auth.conf:ro`
  mount on `spartan-dashboard`) was hand-added on the NAS and never committed,
  so a redeploy silently reverted it and the queue/debt panels rendered empty.
  Also asserts `frontend/src/App.jsx`'s `GROUPS` registry never re-introduces
  the decommissioned `forge`, `erlai`, `comply`, or any `erlai-*` agent id,
  and that `.gitignore` still lists `bob-auth.conf` so the secret-bearing file
  is never committed. The `/api/bob/` location list is derived by parsing
  `nginx.conf`, not hardcoded, so a newly added route without the auth
  include also fails the test.
