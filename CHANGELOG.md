## 2026-07-15 — Fix gate-decision toast hygiene and defer pending-leak (spec D-F)

### Fixed
- `frontend/src/App.jsx` (`postDecision`): 5xx responses and non-JSON bodies (e.g. Cloudflare 504 HTML pages) now return `{ indeterminate: true }` instead of throwing an error with raw body text. Raw response text no longer reaches any toast.
- `frontend/src/App.jsx` (`postDecision`): Client timeout reduced from 60 s to 15 s — the server now enqueues an async merge job and answers immediately; a slow response is itself an indeterminate signal.
- `frontend/src/App.jsx` (`postDecision`): 4xx responses with a JSON body surface only the `error` field (HTML-stripped, ≤ 100 chars). No more `text.slice(0,120)` bleed-through.
- `frontend/src/App.jsx` (`postBreakerClear`, `postSeedDebt`): Same JSON-only, 5xx-indeterminate treatment applied to sibling fast endpoints that shared the same `text.slice` throw pattern.
- `frontend/src/App.jsx` (`executeDecision`): 202 `{"status":"accepted"}` (new async merge path) is handled: toasts "#<id> merge accepted — merging…" and keeps the row in pending state until the poll sees the item leave gated.
- `frontend/src/App.jsx` (`executeDecision`): defer 2xx now explicitly clears pending immediately rather than relying on the reconciler — the reconciler only clears IDs that *left* the gated list, so a defer (item stays gated) would leave the row spinning forever without the explicit delete.
- `frontend/src/App.jsx` (reconciler `useEffect`): Items that were in the "needs poll confirmation" set (indeterminate, 202-accepted, client-abort) now receive a `#<id> <decision> — confirmed` success toast when the poll sees them leave the gated list.

### Added
- `frontend/src/App.jsx`: exported `stripHtml`, `postDecision`, and `QueuePanel` for testing.
- `frontend/src/App.test.jsx`: 15 tests covering `stripHtml` unit, `postDecision` unit (504+HTML, 400+JSON, 202+accepted, defer 200), and three integration scenarios from spec section F.
- `frontend/src/test-setup.js`: `@testing-library/jest-dom` import for vitest.
- `frontend/vite.config.js`: vitest configuration (jsdom environment).
- `frontend/package.json`: added `vitest`, `@testing-library/react`, `@testing-library/user-event`, `@testing-library/jest-dom`, `jsdom` as dev dependencies; added `test` and `test:watch` scripts.

## 2026-06-19 — Add deploy.sh for repeatable NAS deployments

### Added
- `deploy.sh`: self-contained deploy script following `spartan-deploy.sh` patterns
  (git preflight → rsync → `docker compose up -d --build` → health check → git tag).
  Replaces the ad-hoc manual `scp` + ssh commands in the README. Required because
  spartan-dashboard is a baked-image agent (Vite output is compiled into the Docker
  image) and was not registered in the spartan-ops registry; this gives the operator
  a single-command deploy path that enforces clean-git, push-verified state and posts
  a health check before tagging.
- `README.md`: updated Deploy section to document `./deploy.sh` usage.

## 2026-06-13 — Fix false "merge failed" toast caused by client-side AbortController timeout

### Fixed
- `frontend/src/App.jsx` (`postDecision`): Raised gate-decision fetch timeout from 8 s to 60 s.
  A squash-merge + Bob's post-merge verification legitimately takes 20-40 s; the previous 8 s abort was firing before the backend responded, painting a false "merge failed: Fetch is aborted" error.
- `frontend/src/App.jsx` (`executeDecision`): Added fire-then-reconcile pattern.
  On click the row is immediately marked `pending` (spinner, no re-click). If the backend responds before the timeout the pending flag is cleared normally. If a client-side `AbortError`/`TimeoutError` fires first, the row stays in "merging…" state and the existing 15 s polling loop reconciles the outcome — the item disappears from the gated list once the server finishes.
- `frontend/src/App.jsx` (`executeDecision`): "merge failed" toast is now only shown when the backend returns an actual HTTP error (4xx/5xx). Client-side aborts produce an informational "still processing" toast instead of a scary error.
