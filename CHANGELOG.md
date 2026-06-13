## 2026-06-13 — Fix false "merge failed" toast caused by client-side AbortController timeout

### Fixed
- `frontend/src/App.jsx` (`postDecision`): Raised gate-decision fetch timeout from 8 s to 60 s.
  A squash-merge + Bob's post-merge verification legitimately takes 20-40 s; the previous 8 s abort was firing before the backend responded, painting a false "merge failed: Fetch is aborted" error.
- `frontend/src/App.jsx` (`executeDecision`): Added fire-then-reconcile pattern.
  On click the row is immediately marked `pending` (spinner, no re-click). If the backend responds before the timeout the pending flag is cleared normally. If a client-side `AbortError`/`TimeoutError` fires first, the row stays in "merging…" state and the existing 15 s polling loop reconciles the outcome — the item disappears from the gated list once the server finishes.
- `frontend/src/App.jsx` (`executeDecision`): "merge failed" toast is now only shown when the backend returns an actual HTTP error (4xx/5xx). Client-side aborts produce an informational "still processing" toast instead of a scary error.
