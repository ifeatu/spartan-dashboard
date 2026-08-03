## 2026-08-02 — Fix re-authentication storm (tech debt #497)

### Fixed
- **nginx.conf**: Moved `auth_basic` from server level to only `location /` and `location /assets/`. All `/api/health/*` and `/api/bob/*` proxy locations are now unauthenticated at the nginx layer, so background XHRs never receive a `WWW-Authenticate: Basic` challenge. This eliminates the browser login-dialog storm that occurred when Chrome's credential cache was cleared (browser restart, update, profile clear).
- **App.jsx** (health panel): Added a circuit breaker (`authBreakerRef`) that stops the 30-second poll interval and shows a "reload to re-authenticate" banner after 2 consecutive sweeps where every agent returns HTTP 401. Prevents unbounded prompts if credentials ever lapse under future auth changes.
- **App.jsx** (QueuePanel): Added 401 detection in `fetchQueue`; after 2 consecutive 401 responses on `/api/bob/queue/summary`, clears the interval to stop hammering.
- **App.jsx** (DebtPanel): Same 401 circuit breaker pattern in `fetchDebt` for `/api/bob/debt/list`.
- **App.css**: Added `.auth-error-banner` and `.auth-error-reload` styles for the circuit-breaker UI.
