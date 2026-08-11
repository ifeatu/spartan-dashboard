## 2026-07-17 — Add IRIS agent card, repoint ChromaDB health, remove decommissioned COMPLY

### Added
- `frontend/src/App.jsx`, `nginx.conf`: Added IRIS (frontend design agent, port 8761) to the
  Domain Agents group — new fleet card plus `/api/health/iris` proxy location to `192.168.1.19:8761/health`.

### Changed
- `nginx.conf`: `/api/health/chromadb` now proxies to `/api/v2/heartbeat` instead of the removed
  `/api/v1/heartbeat` endpoint.

### Removed
- `frontend/src/App.jsx`, `nginx.conf`, `README.md`: Removed the decommissioned COMPLY agent
  (port 8760) — fleet card, `/api/health/comply` proxy location, and README reference all dropped.
