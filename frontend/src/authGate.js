/* ── Auth circuit breaker ──────────────────────────────────────────────
 *
 * Every /api/* route is behind nginx `auth_basic`. When the browser's cached
 * Basic credential goes away — browser restart, cleared site data, a Chrome
 * update — each request comes back 401 carrying `WWW-Authenticate: Basic`, and
 * the browser renders a native login prompt for *each* challenged request.
 *
 * The fleet view fans out to every agent in parallel every 30s, and the queue
 * and debt panels poll every 15s on top of that. So a single credential drop
 * does not produce one prompt, it produces a prompt storm that re-arms on every
 * tick — the "keeps re-authenticating over and over" failure.
 *
 * Treat the first 401 as terminal: trip the breaker, let every poller stop, and
 * surface one banner asking for a reload. A full page load re-challenges on the
 * SPA shell exactly once, which is the interaction the browser handles well.
 */

let authLost = false
const listeners = new Set()

export class AuthLostError extends Error {
  constructor() {
    super('Authentication lost — dashboard polling halted')
    this.name = 'AuthLostError'
  }
}

export function isAuthLost() {
  return authLost
}

/** Subscribe to the breaker tripping. Returns an unsubscribe function. */
export function subscribeAuthLost(fn) {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

export function tripAuthLost() {
  if (authLost) return
  authLost = true
  // Copy first: a listener may unsubscribe during iteration.
  for (const fn of [...listeners]) fn()
}

/** Test-only. Restores module state between cases. */
export function __resetAuthGate() {
  authLost = false
  listeners.clear()
}

/**
 * fetch() wrapper for /api/* calls.
 *
 * Once the breaker is tripped this refuses to hit the network at all, so a
 * poller that is mid-flight when auth drops cannot queue up another challenge.
 * Callers already wrap their fetches in try/catch to survive network blips, so
 * throwing here degrades to their existing "keep prior state" behaviour.
 */
export async function apiFetch(input, init) {
  if (authLost) throw new AuthLostError()
  const res = await fetch(input, init)
  if (res.status === 401) {
    tripAuthLost()
    throw new AuthLostError()
  }
  return res
}
