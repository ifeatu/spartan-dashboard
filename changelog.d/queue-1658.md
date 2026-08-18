## 2026-08-18 — Add Direct CCPs panel for queue_id=0 dispatches (debt #705)

### Added
- `frontend/src/App.jsx`: New `DirectCcpPanel` component rendering non-terminal
  `bob_run_ccp(queue_id=0)` direct/exploratory dispatches. These jobs never get
  a `build_queue` row, so the existing Build Queue panel can never show them —
  an operator was reading a job bob_ccp_reap confirmed alive (`pid_alive=true`)
  as "not running" because the dashboard showed nothing for it. The panel
  polls `/api/bob/ccp/direct?terminal=false&limit=10` every 15s and renders
  each job's worktree, repo, age, and a liveness badge (`alive` / `zombie` /
  `unknown`), mirroring the same `pid_alive` + `terminal` + `age` fields
  `bob_ccp_reap` already computes.
- `nginx.conf`: New `/api/bob/ccp/direct` location proxying to bob-mcp's
  `/ccp/direct` (not deployed yet — companion bob-mcp change), guarded by the
  same `bob-auth.conf` include as every other `/api/bob/` route.
- `frontend/src/App.css`: `badge-direct-*` / `queue-item-direct-*` styles for
  the new panel's liveness states.

### Note
`/ccp/direct` does not exist on bob-mcp yet — this panel 404-probes it the
same way the existing Debt panel probes `/debt/list`, so it renders a
"not deployed yet" placeholder until the companion bob-mcp endpoint (backed by
`ccp_runner.list_ccp_jobs()`, the same enumeration `bob_ccp_reap` uses) ships
and auto-upgrades without a dashboard redeploy.
