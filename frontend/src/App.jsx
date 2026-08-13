import { useState, useEffect, useCallback, useRef } from 'react'
import './App.css'

const BOB_SECRET = import.meta.env.VITE_BOB_SECRET || ''

/* ── Fleet registry ──────────────────────────────────── */
const GROUPS = [
  {
    id: 'core',
    label: 'Core Agents',
    agents: [
      { id: 'chief',  name: 'CHIEF',      desc: 'Orchestrator / Command agent',    port: 8752 },
      { id: 'scribe', name: 'SCRIBE',     desc: 'Document & memory agent',          port: 8742 },
    ],
  },
  {
    id: 'domain',
    label: 'Domain Agents',
    agents: [
      { id: 'bob',        name: 'BOB',        desc: 'Analytics & reporting agent',   port: 8755 },
      { id: 'susan',      name: 'SUSAN',      desc: 'Customer success agent',        port: 8756 },
      { id: 'cycleforge', name: 'CYCLEFORGE', desc: 'Lifecycle automation agent',    port: 8743 },
      { id: 'coach',      name: 'COACH',      desc: 'Performance coaching agent',    port: 8744 },
      { id: 'iris',       name: 'IRIS',       desc: 'Frontend design agent',         port: 8761 },
      { id: 'ifeoma',     name: 'IFEOMA',     desc: 'Research & insights agent',     port: 8758 },
    ],
  },
  {
    id: 'infra',
    label: 'Infrastructure',
    agents: [
      { id: 'chromadb', name: 'CHROMADB', desc: 'Vector database',                  port: 8200 },
    ],
  },
]

const ALL_AGENTS = GROUPS.flatMap(g => g.agents)

/* ── Status helpers ──────────────────────────────────── */
function classifyStatus(result) {
  if (!result) return 'unknown'
  if (result.error) return 'down'
  const { status, httpStatus } = result
  if (httpStatus && httpStatus >= 500) return 'down'
  if (httpStatus && httpStatus >= 400) return 'degraded'
  if (typeof status === 'string') {
    const s = status.toLowerCase()
    if (s === 'healthy' || s === 'ok' || s === 'up') return 'healthy'
    if (s === 'degraded' || s === 'warn' || s === 'warning') return 'degraded'
    if (s === 'down' || s === 'unhealthy') return 'down'
  }
  if (httpStatus && httpStatus < 400) return 'healthy'
  return 'unknown'
}

const STATUS_COLORS = {
  healthy: '#00ff88',
  degraded: '#ffaa00',
  down: '#ff4444',
  unknown: '#666680',
}

function latencyClass(ms) {
  if (ms == null) return ''
  if (ms < 200) return 'fast'
  if (ms < 800) return 'ok'
  return 'slow'
}

/* ── Ring chart SVG ──────────────────────────────────── */
function RingChart({ pct, healthy, total }) {
  const R = 34, CX = 40, CY = 40
  const circumference = 2 * Math.PI * R
  const filled = circumference * (pct / 100)
  const color = pct >= 80 ? '#00ff88' : pct >= 50 ? '#ffaa00' : '#ff4444'

  return (
    <div className="ring-chart-wrap">
      <svg width="80" height="80" viewBox="0 0 80 80">
        <circle cx={CX} cy={CY} r={R} fill="none" stroke="#1e1e28" strokeWidth="8" />
        <circle
          cx={CX} cy={CY} r={R} fill="none"
          stroke={color} strokeWidth="8"
          strokeDasharray={`${filled} ${circumference}`}
          strokeLinecap="round"
          transform="rotate(-90 40 40)"
          style={{ transition: 'stroke-dasharray 0.6s ease' }}
        />
      </svg>
      <div className="ring-center">
        <span className="ring-pct" style={{ color }}>{pct}%</span>
        <span className="ring-label">HEALTHY</span>
      </div>
    </div>
  )
}

/* ── JSON syntax highlighter ─────────────────────────── */
function JsonHighlight({ data }) {
  const json = JSON.stringify(data, null, 2)
  const highlighted = json
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"([^"]+)":/g, '<span class="json-key">"$1"</span>:')
    .replace(/: "([^"]*)"/g, ': <span class="json-str">"$1"</span>')
    .replace(/: (-?\d+\.?\d*)/g, ': <span class="json-num">$1</span>')
    .replace(/: (true|false)/g, ': <span class="json-bool">$1</span>')
    .replace(/: null/g, ': <span class="json-null">null</span>')

  return (
    <pre
      className="json-block"
      dangerouslySetInnerHTML={{ __html: highlighted }}
    />
  )
}

/* ── Detail Panel ────────────────────────────────────── */
function DetailPanel({ agent, result, onClose }) {
  const status = classifyStatus(result)
  const color = STATUS_COLORS[status]
  const overlayRef = useRef(null)

  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  const handleOverlayClick = (e) => {
    if (e.target === overlayRef.current) onClose()
  }

  return (
    <>
      <div className="detail-overlay" ref={overlayRef} onClick={handleOverlayClick} />
      <div className="detail-panel">
        <div className="detail-header">
          <div className="detail-title-wrap">
            <div className="detail-title">{agent.name}</div>
            <div className="detail-desc">{agent.desc}</div>
          </div>
          <button className="detail-close" onClick={onClose}>✕</button>
        </div>

        <div className="detail-status-row">
          <div className="detail-status-big" style={{ color }}>
            <span style={{
              width: 10, height: 10, borderRadius: '50%',
              background: color, display: 'inline-block',
              ...(status === 'healthy' ? { animation: 'pulse 2s ease-in-out infinite' } : {})
            }} />
            {status.toUpperCase()}
          </div>
          <div className="detail-meta-row">
            <span>PORT {agent.port}</span>
            {result?.latencyMs != null && (
              <span className={`card-latency ${latencyClass(result.latencyMs)}`}>
                {result.latencyMs}ms
              </span>
            )}
          </div>
        </div>

        <div className="detail-body">
          <div className="detail-section-label">Endpoint</div>
          <div className="detail-endpoint">
            GET /api/health/{agent.id}<br />
            → 192.168.1.19:{agent.port}/health
          </div>

          <div className="detail-section-label">Response</div>

          {!result ? (
            <div className="loading-placeholder">
              <div className="spinner" /> Fetching…
            </div>
          ) : result.error ? (
            <>
              <div className="detail-error">
                ✕ {result.error}
              </div>
              {result.httpStatus && (
                <div style={{ marginTop: 8, fontSize: 11, color: 'var(--text-muted)' }}>
                  HTTP {result.httpStatus}
                </div>
              )}
            </>
          ) : (
            <JsonHighlight data={result.raw || result} />
          )}

          {result?.checkedAt && (
            <div style={{ marginTop: 12, fontSize: 10, color: 'var(--text-muted)' }}>
              Checked {new Date(result.checkedAt).toLocaleTimeString()}
            </div>
          )}
        </div>
      </div>
    </>
  )
}

/* ── Agent Card ──────────────────────────────────────── */
function AgentCard({ agent, result, selected, onClick }) {
  const status = classifyStatus(result)
  const color = STATUS_COLORS[status]

  return (
    <div
      className={`agent-card${selected ? ' selected' : ''}`}
      style={{ '--status-color': color }}
      onClick={onClick}
    >
      <div className="card-top">
        <div>
          <div className="card-name">{agent.name}</div>
          <div className="card-desc">{agent.desc}</div>
        </div>
        <div className={`status-badge ${status}`}>
          <span className="status-badge-dot" />
          {status}
        </div>
      </div>
      <div className="card-meta">
        <span className="card-port">:{agent.port}</span>
        {result && !result.error && result.latencyMs != null && (
          <span className={`card-latency ${latencyClass(result.latencyMs)}`}>
            {result.latencyMs}ms
          </span>
        )}
        {result?.error && (
          <span style={{ fontSize: 10, color: 'var(--down)' }}>
            {result.error.length > 40 ? result.error.slice(0, 40) + '…' : result.error}
          </span>
        )}
      </div>
    </div>
  )
}

/* ── Build Queue Panel ───────────────────────────────── */
const QUEUE_REFRESH_MS = 15_000

/** Strip HTML tags and entities from a string (safe, no DOM needed). */
export function stripHtml(str) {
  return String(str ?? '').replace(/<[^>]*>/g, '').replace(/&[^;]+;/g, ' ').trim()
}

/**
 * POST a gate decision to Bob.
 *
 * Returns one of:
 *   { indeterminate: true }           — 5xx or non-JSON body; let the poll resolve
 *   { ok: true, data, accepted }      — 2xx; accepted=true when server returns 202+status:accepted
 *
 * Throws Error with a clean, HTML-stripped message for 4xx with a JSON body.
 *
 * The server now answers immediately (async merge job), so 15s is ample.
 */
export async function postDecision(itemId, decision) {
  const res = await fetch(`/api/bob/queue/${itemId}/decision`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Bob-Secret': BOB_SECRET,
    },
    body: JSON.stringify({ decision }),
    signal: AbortSignal.timeout(15_000),
  })

  let json = null
  try { json = await res.json() } catch { /* non-JSON body */ }

  // 5xx or unparseable body → cannot determine outcome; poll will reconcile
  if (res.status >= 500 || json === null) {
    return { indeterminate: true }
  }

  // 4xx with JSON → clean error, never raw body text
  if (!res.ok) {
    const msg = stripHtml(json.error ?? json.message ?? `HTTP ${res.status}`)
    throw new Error(msg.slice(0, 100))
  }

  return {
    ok: true,
    data: json,
    // 202 {"status":"accepted"}: server enqueued an async merge job
    accepted: res.status === 202 && json?.status === 'accepted',
  }
}

async function postBreakerClear() {
  const res = await fetch('/api/bob/queue/breaker/clear', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Bob-Secret': BOB_SECRET,
    },
    signal: AbortSignal.timeout(20000),
  })
  let json = null
  try { json = await res.json() } catch { /* non-JSON */ }
  if (res.status >= 500 || json === null) {
    throw new Error('status unknown — check breaker manually')
  }
  if (!res.ok) {
    const msg = stripHtml(json.error ?? json.message ?? `HTTP ${res.status}`)
    throw new Error(msg.slice(0, 100))
  }
  return json
}

async function postSeedDebt() {
  const res = await fetch('/api/bob/queue/seed-debt', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Bob-Secret': BOB_SECRET,
    },
    body: JSON.stringify({}),
    signal: AbortSignal.timeout(30000),
  })
  let json = null
  try { json = await res.json() } catch { /* non-JSON */ }
  if (res.status >= 500 || json === null) {
    throw new Error('status unknown — check queue manually')
  }
  if (!res.ok) {
    const msg = stripHtml(json.error ?? json.message ?? `HTTP ${res.status}`)
    throw new Error(msg.slice(0, 100))
  }
  return json
}

async function fetchRecentFailures() {
  try {
    const res = await fetch('/api/bob/queue/list?status=failed&limit=6', {
      signal: AbortSignal.timeout(5000),
    })
    if (!res.ok) return []
    const json = await res.json()
    return json.items || []
  } catch {
    return []
  }
}

function breakerErr(log) {
  if (!log) return ''
  const s = String(log)
  const m = s.match(/ccp_noop|needs_decompose|placeholder_detected|DRIFT|gate_bypass|push_verification_failed|SSH command timed out|DUPLICATE BLOCKED/i)
  return m ? m[0] : s.slice(0, 48)
}

/* ── Toast ───────────────────────────────────────────── */
function Toast({ toasts, onDismiss }) {
  if (!toasts.length) return null
  return (
    <div className="toast-container">
      {toasts.map(t => (
        <div key={t.id} className={`toast toast-${t.type}`} onClick={() => onDismiss(t.id)}>
          {t.message}
        </div>
      ))}
    </div>
  )
}

/* ── Confirm Modal ───────────────────────────────────── */
function ConfirmModal({ title, message, onConfirm, onCancel }) {
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onCancel() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onCancel])

  return (
    <>
      <div className="detail-overlay" onClick={onCancel} />
      <div className="confirm-modal">
        <div className="confirm-title">{title}</div>
        <div className="confirm-message">{message}</div>
        <div className="confirm-actions">
          <button className="btn-confirm-cancel" onClick={onCancel}>Cancel</button>
          <button className="btn-confirm-ok" onClick={onConfirm}>Discard</button>
        </div>
      </div>
    </>
  )
}

function QueueStat({ label, value, tone }) {
  return (
    <div className={`queue-stat queue-stat-${tone || 'neutral'}`}>
      <div className="queue-stat-value">{value}</div>
      <div className="queue-stat-label">{label}</div>
    </div>
  )
}

function QueueItemRow({ item, onDecision, loadingId, pendingIds }) {
  const status = item.status || 'queued'
  const isGated = status === 'gated'
  const isLoading = loadingId === item.id
  // Pending = decision was sent but we haven't yet confirmed via polling
  // (e.g. the request is still in-flight or timed out client-side while server processes)
  const isPending = pendingIds.has(item.id)

  return (
    <div className={`queue-item queue-item-${status}`}>
      <div className="queue-item-id">#{item.id}</div>
      <div className="queue-item-main">
        <div className="queue-item-title">{item.title}</div>
        <div className="queue-item-meta">
          <span className="queue-item-repo">{item.repo}</span>
          <span className="queue-item-sep">·</span>
          <span>{item.task_class}</span>
          <span className="queue-item-sep">·</span>
          <span>p{item.priority}</span>
          {item.target_backend && (
            <>
              <span className="queue-item-sep">·</span>
              <span>{item.target_backend}</span>
            </>
          )}
          {item.gate_required ? (
            <>
              <span className="queue-item-sep">·</span>
              <span className="queue-item-gated">gated</span>
            </>
          ) : (
            <>
              <span className="queue-item-sep">·</span>
              <span className="queue-item-auto">auto-merge</span>
            </>
          )}
        </div>
      </div>
      <div className="queue-item-right">
        {isGated && (
          (isLoading || isPending) ? (
            <div className="queue-decision-loading">
              <span className="spinner-sm" /> {isLoading ? 'processing…' : 'merging…'}
            </div>
          ) : (
            <div className="queue-decision-btns">
              <button
                className="btn-decision btn-merge"
                onClick={() => onDecision(item, 'merge')}
              >Merge</button>
              <button
                className="btn-decision btn-discard"
                onClick={() => onDecision(item, 'discard')}
              >Discard</button>
              <button
                className="btn-decision btn-defer"
                onClick={() => onDecision(item, 'defer')}
              >Defer</button>
            </div>
          )
        )}
        <div className={`queue-item-status badge-${status}`}>{status}</div>
      </div>
    </div>
  )
}

export function QueuePanel() {
  const [summary, setSummary] = useState(null)
  const [items, setItems] = useState(null) // null = unknown, [] = empty, [...]
  const [listSupported, setListSupported] = useState(true)
  const [updatedAt, setUpdatedAt] = useState(null)
  const [polling, setPolling] = useState(false)
  const [loadingId, setLoadingId] = useState(null)
  // Items whose decision was fired but not yet confirmed (fire-then-reconcile pattern).
  // Prevents double-clicks and avoids clearing the spinner when a merge response is slow.
  const [pendingIds, setPendingIds] = useState(new Set())
  // Tracks decisions that need a confirmation toast when the poll resolves them.
  // Map<itemId, decision> — populated for indeterminate (5xx/non-JSON), 202-accepted,
  // and client-abort outcomes where we can't confirm the result immediately.
  const pendingToastRef = useRef(new Map())
  const [confirmPending, setConfirmPending] = useState(null) // {item, decision}
  const [triage, setTriage] = useState(null) // null | {loading, fails}
  const [breakerBusy, setBreakerBusy] = useState(false)
  const [seedBusy, setSeedBusy] = useState(false)
  const [toasts, setToasts] = useState([])
  const toastIdRef = useRef(0)
  const queueIntervalRef = useRef(null)
  const queueAuthRef = useRef(0) // consecutive 401 count — circuit breaker

  const addToast = useCallback((message, type = 'info') => {
    const id = ++toastIdRef.current
    setToasts(prev => [...prev, { id, message, type }])
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4000)
  }, [])

  const dismissToast = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  const fetchQueue = useCallback(async () => {
    setPolling(true)
    try {
      const sumRes = await fetch('/api/bob/queue/summary', {
        signal: AbortSignal.timeout(4000),
      })
      if (sumRes.status === 401) {
        // Circuit breaker: stop polling after 2 consecutive 401s (credential cache gone)
        queueAuthRef.current += 1
        if (queueAuthRef.current >= 2) {
          clearInterval(queueIntervalRef.current)
        }
        setPolling(false)
        return
      }
      queueAuthRef.current = 0
      if (sumRes.ok) {
        const sumJson = await sumRes.json()
        setSummary(sumJson)
      }
    } catch (e) {
      // leave previous summary intact
    }
    // /queue/list may not exist yet (delivered by queue item #144).
    // Probe gracefully — once it's wired up the panel lights up without redeploy.
    if (listSupported) {
      try {
        const listRes = await fetch(
          '/api/bob/queue/list?status=queued,dispatched,running,gated&limit=10',
          { signal: AbortSignal.timeout(4000) }
        )
        if (listRes.status === 404) {
          setListSupported(false)
        } else if (listRes.ok) {
          const listJson = await listRes.json()
          setItems(listJson.items || [])
        }
      } catch (e) {
        // network blip — keep prior items
      }
    }
    setUpdatedAt(new Date())
    setPolling(false)
  }, [listSupported])

  useEffect(() => {
    fetchQueue()
    queueIntervalRef.current = setInterval(fetchQueue, QUEUE_REFRESH_MS)
    return () => clearInterval(queueIntervalRef.current)
  }, [fetchQueue])

  // Reconcile pending decisions: once an item is no longer in the gated list,
  // the merge (or discard/defer) has resolved on the server — clear its pending flag.
  // For outcomes that were indeterminate (5xx/non-JSON) or 202-accepted, also
  // fire a success toast so the operator knows the operation completed.
  useEffect(() => {
    if (!items) return
    const gatedIds = new Set(items.filter(i => i.status === 'gated').map(i => i.id))

    // Find IDs that need a confirmation toast (left gated AND were awaiting poll)
    const toastCandidates = [...pendingToastRef.current.entries()]
      .filter(([id]) => !gatedIds.has(id))
    toastCandidates.forEach(([id, decision]) => {
      pendingToastRef.current.delete(id)
      addToast(`#${id} ${decision} — confirmed`, 'success')
    })

    setPendingIds(prev => {
      if (prev.size === 0) return prev
      const toResolve = [...prev].filter(id => !gatedIds.has(id))
      if (toResolve.length === 0) return prev
      const next = new Set(prev)
      toResolve.forEach(id => next.delete(id))
      return next
    })
  }, [items, addToast])

  const executeDecision = useCallback(async (item, decision) => {
    setLoadingId(item.id)
    // Mark as pending immediately so the row locks while the server processes.
    setPendingIds(prev => { const s = new Set(prev); s.add(item.id); return s })
    try {
      const result = await postDecision(item.id, decision)

      if (result.indeterminate) {
        // 5xx or non-JSON body: outcome unknown — let the 15s poll reconcile.
        // Never show raw body; never clear pending until poll confirms.
        pendingToastRef.current.set(item.id, decision)
        addToast(`#${item.id} ${decision} — status unknown, confirming…`, 'info')
      } else if (result.accepted) {
        // 202 {"status":"accepted"}: server enqueued async merge job.
        // Keep pending until poll sees item leave gated, then toast "confirmed".
        pendingToastRef.current.set(item.id, decision)
        addToast(`#${item.id} ${decision} accepted — merging…`, 'success')
      } else {
        // Synchronous 2xx (defer, discard, or immediate 200 merge).
        // Clear pending explicitly — defer keeps the item gated so the
        // reconciler alone would never clear it.
        addToast(`#${item.id} → ${decision} accepted`, 'success')
        setPendingIds(prev => { const s = new Set(prev); s.delete(item.id); return s })
        fetchQueue()
      }
    } catch (err) {
      const isClientAbort = err.name === 'AbortError' || err.name === 'TimeoutError'
      if (isClientAbort) {
        // Client timeout fires before server answered; the 15s timeout means
        // the server may be slow but not necessarily failed — keep pending.
        pendingToastRef.current.set(item.id, decision)
        addToast(
          `#${item.id} ${decision} — still processing (checking status…)`,
          'info',
        )
      } else {
        // 4xx with JSON body: server rejected the decision (e.g. wrong state).
        // err.message is already clean (HTML-stripped, ≤100 chars).
        setPendingIds(prev => { const s = new Set(prev); s.delete(item.id); return s })
        addToast(`#${item.id} ${decision} failed: ${err.message}`, 'error')
      }
    } finally {
      setLoadingId(null)
    }
  }, [addToast, fetchQueue])

  const handleDecision = useCallback((item, decision) => {
    if (decision === 'discard') {
      setConfirmPending({ item, decision })
      return
    }
    executeDecision(item, decision)
  }, [executeDecision])

  const openTriage = useCallback(async () => {
    setTriage({ loading: true, fails: [] })
    const fails = await fetchRecentFailures()
    setTriage({ loading: false, fails })
  }, [])

  const doClearBreaker = useCallback(async () => {
    setBreakerBusy(true)
    try {
      const res = await postBreakerClear()
      const d = res?.drain?.drain
      const tail = d?.status === 'dispatched'
        ? ` — dispatched #${d.id}`
        : (d?.status === 'idle' ? ' — no eligible item to dispatch' : '')
      addToast(`Breaker cleared${tail}`, 'success')
      setTriage(null)
      fetchQueue()
    } catch (err) {
      addToast(`Clear failed: ${err.message}`, 'error')
    } finally {
      setBreakerBusy(false)
    }
  }, [addToast, fetchQueue])

  const doSeedDebt = useCallback(async () => {
    setSeedBusy(true)
    try {
      const res = await postSeedDebt()
      const n = res?.count ?? 0
      addToast(
        n > 0 ? `Queued ${n} debt item${n === 1 ? '' : 's'}` : 'No new eligible debt to queue',
        n > 0 ? 'success' : 'info',
      )
      fetchQueue()
    } catch (err) {
      addToast(`Queue debt failed: ${err.message}`, 'error')
    } finally {
      setSeedBusy(false)
    }
  }, [addToast, fetchQueue])

  if (!summary) {
    return (
      <section className="queue-panel">
        <div className="queue-panel-header">
          <span className="queue-panel-title">Build Queue</span>
          <span className="queue-panel-status">Loading…</span>
        </div>
      </section>
    )
  }

  const c = summary.counts || {}
  const last24 = summary.last_24h || {}
  const breaker = summary.breaker || 'unknown'
  const active = (c.queued || 0) + (c.dispatched || 0) + (c.running || 0) + (c.gated || 0)

  return (
    <>
      <section className="queue-panel">
        <div className="queue-panel-header">
          <span className="queue-panel-title">Build Queue</span>
          <span className={`queue-breaker breaker-${breaker}`}>
            breaker: {breaker}
          </span>
          {breaker === 'open' && (
            <button
              className="btn-clear-breaker"
              onClick={openTriage}
              disabled={breakerBusy}
              title="Triage recent failures and clear the circuit breaker"
            >
              ⚡ triage &amp; clear
            </button>
          )}
          <button
            className="btn-queue-debt"
            onClick={doSeedDebt}
            disabled={seedBusy}
            title="Queue eligible open high-severity tech debt on demand"
          >
            {seedBusy ? 'queuing…' : '+ queue debt'}
          </button>
          <span className="queue-panel-status">
            {polling ? 'polling…' : updatedAt && `updated ${updatedAt.toLocaleTimeString()}`}
          </span>
        </div>
        <div className="queue-stats-row">
          <QueueStat label="queued" value={c.queued || 0} tone="info" />
          <QueueStat label="dispatched" value={c.dispatched || 0} tone="info" />
          <QueueStat label="running" value={c.running || 0} tone="info" />
          <QueueStat label="gated" value={c.gated || 0} tone="warn" />
          <QueueStat label="done 24h" value={last24.done || 0} tone="good" />
          <QueueStat label="failed 24h" value={last24.failed || 0} tone={last24.failed ? 'bad' : 'neutral'} />
          <QueueStat label="total done" value={c.done || 0} tone="neutral" />
          <QueueStat label="active" value={active} tone={active ? 'info' : 'neutral'} />
        </div>
        {listSupported ? (
          items === null ? (
            <div className="queue-list-empty">Fetching items…</div>
          ) : items.length === 0 ? (
            <div className="queue-list-empty">
              No active items. {active === 0 && 'Queue is drained — auto-seed cron runs every 30 min.'}
            </div>
          ) : (
            <div className="queue-list">
              {items.map(item => (
                <QueueItemRow
                  key={item.id}
                  item={item}
                  onDecision={handleDecision}
                  loadingId={loadingId}
                  pendingIds={pendingIds}
                />
              ))}
            </div>
          )
        ) : (
          <div className="queue-list-empty queue-list-hint">
            Item list endpoint not deployed yet. Queue #144 (pending) adds <code>/queue/list</code> + <code>/debt/list</code> — this panel auto-upgrades once it lands.
          </div>
        )}
      </section>

      {confirmPending && (
        <ConfirmModal
          title="Discard build?"
          message={`Discard #${confirmPending.item.id} "${confirmPending.item.title}"? This cannot be undone.`}
          onConfirm={() => {
            const { item, decision } = confirmPending
            setConfirmPending(null)
            executeDecision(item, decision)
          }}
          onCancel={() => setConfirmPending(null)}
        />
      )}

      {triage && (
        <>
          <div className="detail-overlay" onClick={() => !breakerBusy && setTriage(null)} />
          <div className="confirm-modal breaker-modal">
            <div className="confirm-title">Clear circuit breaker?</div>
            <div className="confirm-message">
              The breaker halts all dispatch after repeated failures. Review what tripped it, then clear to resume — this also kicks one drain cycle.
            </div>
            <div className="breaker-fails">
              {triage.loading ? (
                <div className="breaker-fails-empty">Loading recent failures…</div>
              ) : triage.fails.length === 0 ? (
                <div className="breaker-fails-empty">No recent failures recorded.</div>
              ) : (
                triage.fails.map(f => (
                  <div key={f.id} className="breaker-fail-row">
                    <span className="breaker-fail-id">#{f.id}</span>
                    <span className="breaker-fail-title">{f.title}</span>
                    <span className="breaker-fail-err">{breakerErr(f.error_log)}</span>
                  </div>
                ))
              )}
            </div>
            <div className="confirm-actions">
              <button className="btn-confirm-cancel" onClick={() => setTriage(null)} disabled={breakerBusy}>Cancel</button>
              <button className="btn-confirm-ok btn-breaker-ok" onClick={doClearBreaker} disabled={breakerBusy}>
                {breakerBusy ? 'Clearing…' : 'Clear breaker & drain'}
              </button>
            </div>
          </div>
        </>
      )}

      <Toast toasts={toasts} onDismiss={dismissToast} />
    </>
  )
}

function DebtItemRow({ item }) {
  const sev = item.severity || 'low'
  return (
    <div className={`queue-item queue-item-sev-${sev}`}>
      <div className="queue-item-id">#{item.id}</div>
      <div className="queue-item-main">
        <div className="queue-item-title">{item.title}</div>
        <div className="queue-item-meta">
          <span className="queue-item-repo">{item.repo_id}</span>
          <span className="queue-item-sep">·</span>
          <span>{item.category}</span>
        </div>
      </div>
      <div className={`queue-item-status badge-sev-${sev}`}>{sev}</div>
    </div>
  )
}

function DebtPanel() {
  const [items, setItems] = useState(null)
  const [supported, setSupported] = useState(true)
  const [updatedAt, setUpdatedAt] = useState(null)
  const [polling, setPolling] = useState(false)
  const debtIntervalRef = useRef(null)
  const debtAuthRef = useRef(0) // consecutive 401 count — circuit breaker

  const fetchDebt = useCallback(async () => {
    setPolling(true)
    try {
      const res = await fetch('/api/bob/debt/list?status=open', {
        signal: AbortSignal.timeout(4000),
      })
      if (res.status === 401) {
        debtAuthRef.current += 1
        if (debtAuthRef.current >= 2) {
          clearInterval(debtIntervalRef.current)
        }
        setPolling(false)
        return
      }
      debtAuthRef.current = 0
      if (res.status === 404) {
        setSupported(false)
      } else if (res.ok) {
        const json = await res.json()
        setItems(json.items || [])
        setUpdatedAt(new Date())
      }
    } catch (e) {
      // network blip — keep prior items
    }
    setPolling(false)
  }, [])

  useEffect(() => {
    fetchDebt()
    debtIntervalRef.current = setInterval(fetchDebt, QUEUE_REFRESH_MS)
    return () => clearInterval(debtIntervalRef.current)
  }, [fetchDebt])

  if (!supported) {
    return (
      <section className="queue-panel">
        <div className="queue-panel-header">
          <span className="queue-panel-title">Tech Debt</span>
          <span className="queue-panel-status">/debt/list not deployed yet</span>
        </div>
      </section>
    )
  }
  if (items === null) {
    return (
      <section className="queue-panel">
        <div className="queue-panel-header">
          <span className="queue-panel-title">Tech Debt</span>
          <span className="queue-panel-status">Loading…</span>
        </div>
      </section>
    )
  }

  const order = { critical: 1, high: 2, medium: 3, low: 4 }
  const sev = { critical: 0, high: 0, medium: 0, low: 0 }
  for (const it of items) if (sev[it.severity] !== undefined) sev[it.severity]++
  const top = [...items]
    .sort((a, b) => (order[a.severity] || 9) - (order[b.severity] || 9))
    .slice(0, 12)

  return (
    <section className="queue-panel">
      <div className="queue-panel-header">
        <span className="queue-panel-title">Tech Debt</span>
        <span className="queue-panel-status">
          {polling ? 'polling…' : updatedAt && `updated ${updatedAt.toLocaleTimeString()}`}
        </span>
      </div>
      <div className="queue-stats-row">
        <QueueStat label="open" value={items.length} tone="info" />
        <QueueStat label="critical" value={sev.critical} tone={sev.critical ? 'bad' : 'neutral'} />
        <QueueStat label="high" value={sev.high} tone={sev.high ? 'warn' : 'neutral'} />
        <QueueStat label="medium" value={sev.medium} tone="neutral" />
        <QueueStat label="low" value={sev.low} tone="neutral" />
      </div>
      {items.length === 0 ? (
        <div className="queue-list-empty">No open tech debt. 🎉</div>
      ) : (
        <div className="queue-list">
          {top.map(it => <DebtItemRow key={it.id} item={it} />)}
          {items.length > top.length && (
            <div className="queue-list-empty queue-list-hint">
              +{items.length - top.length} more open items (critical/high shown first)
            </div>
          )}
        </div>
      )}
    </section>
  )
}

/* ── Main App ────────────────────────────────────────── */
const REFRESH_INTERVAL = 30_000

export default function App() {
  const [results, setResults] = useState({})
  const [selectedId, setSelectedId] = useState(null)
  const [lastUpdated, setLastUpdated] = useState(null)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [countdown, setCountdown] = useState(REFRESH_INTERVAL / 1000)
  const [authBlocked, setAuthBlocked] = useState(false)
  const timerRef = useRef(null)
  const countdownRef = useRef(null)
  // Circuit-breaker: counts consecutive sweeps where every agent returned 401.
  // After 2 such sweeps the browser credential cache is confirmed empty — stop
  // polling to avoid a cascade of login dialogs and prompt the user to reload.
  const authBreakerRef = useRef(0)

  const fetchAgent = useCallback(async (agent) => {
    const start = Date.now()
    try {
      const res = await fetch(`/api/health/${agent.id}`, {
        signal: AbortSignal.timeout(4000),
      })
      const latencyMs = Date.now() - start
      let raw = null
      const text = await res.text()
      try { raw = JSON.parse(text) } catch { raw = { body: text } }

      const status = raw?.status || (res.ok ? 'healthy' : 'degraded')
      return {
        httpStatus: res.status,
        status,
        raw,
        latencyMs,
        checkedAt: new Date().toISOString(),
        error: res.ok ? null : `HTTP ${res.status}`,
      }
    } catch (err) {
      return {
        error: err.name === 'TimeoutError' ? 'Timeout (4s)' : err.message,
        latencyMs: Date.now() - start,
        checkedAt: new Date().toISOString(),
      }
    }
  }, [])

  const fetchAll = useCallback(async () => {
    setIsRefreshing(true)
    const entries = await Promise.all(
      ALL_AGENTS.map(async (agent) => {
        const result = await fetchAgent(agent)
        return [agent.id, result]
      })
    )

    // Circuit breaker: if every agent returned 401 twice running, the browser's
    // cached Basic credentials are gone. Stop hammering and tell the user.
    const all401 = entries.every(([, r]) => r.httpStatus === 401)
    if (all401) {
      authBreakerRef.current += 1
      if (authBreakerRef.current >= 2) {
        clearInterval(timerRef.current)
        setAuthBlocked(true)
        setIsRefreshing(false)
        return
      }
    } else {
      authBreakerRef.current = 0
    }

    setResults(Object.fromEntries(entries))
    setLastUpdated(new Date())
    setIsRefreshing(false)
    setCountdown(REFRESH_INTERVAL / 1000)
  }, [fetchAgent])

  // Initial fetch + interval
  useEffect(() => {
    fetchAll()
    timerRef.current = setInterval(fetchAll, REFRESH_INTERVAL)
    return () => clearInterval(timerRef.current)
  }, [fetchAll])

  // Countdown ticker
  useEffect(() => {
    countdownRef.current = setInterval(() => {
      setCountdown(c => Math.max(0, c - 1))
    }, 1000)
    return () => clearInterval(countdownRef.current)
  }, [])

  // Summary stats
  const counts = { healthy: 0, degraded: 0, down: 0, unknown: 0 }
  ALL_AGENTS.forEach(a => {
    counts[classifyStatus(results[a.id])]++
  })
  const total = ALL_AGENTS.length
  const pct = Math.round((counts.healthy / total) * 100)

  const selectedAgent = selectedId ? ALL_AGENTS.find(a => a.id === selectedId) : null

  return (
    <div className="app">
      {/* Header */}
      <header className="header">
        <div className="header-left">
          <div className="logo">SPARTAN <span>//</span> COMMAND</div>
          <div className="header-meta">Fleet Dashboard v2 · {total} services</div>
        </div>
        <div className="header-right">
          <div className="refresh-status">
            <span className={`pulse-dot${countdown === 0 || authBlocked ? ' stale' : ''}`} />
            {authBlocked ? 'Polling stopped' : isRefreshing ? 'Polling…' : `Next refresh in ${countdown}s`}
          </div>
          <button className="btn-refresh" onClick={fetchAll} disabled={isRefreshing || authBlocked}>
            {isRefreshing ? '⟳ Polling…' : '⟳ Refresh'}
          </button>
        </div>
      </header>

      {/* Auth circuit-breaker banner: shown when all /api/health/* return 401 twice running */}
      {authBlocked && (
        <div className="auth-error-banner">
          Session credentials cleared — polling stopped to prevent login-dialog storm.{' '}
          <button className="auth-error-reload" onClick={() => window.location.reload()}>
            Reload to re-authenticate
          </button>
        </div>
      )}

      {/* Summary Banner */}
      <div className="summary-banner">
        <RingChart pct={isNaN(pct) ? 0 : pct} healthy={counts.healthy} total={total} />
        <div className="summary-stats">
          <div className="summary-title">Fleet Health Overview</div>
          <div className="summary-counts">
            <div className="stat-pill">
              <span className="stat-dot healthy" />
              <span className="stat-num healthy">{counts.healthy}</span>
              <span>healthy</span>
            </div>
            <div className="stat-pill">
              <span className="stat-dot degraded" />
              <span className="stat-num degraded">{counts.degraded}</span>
              <span>degraded</span>
            </div>
            <div className="stat-pill">
              <span className="stat-dot down" />
              <span className="stat-num down">{counts.down}</span>
              <span>down</span>
            </div>
            <div className="stat-pill">
              <span className="stat-dot unknown" />
              <span className="stat-num unknown">{counts.unknown}</span>
              <span>unknown</span>
            </div>
          </div>
        </div>
        <div className="last-updated">
          {lastUpdated ? (
            <>
              <div>Last polled</div>
              <div style={{ color: 'var(--text-dim)' }}>{lastUpdated.toLocaleTimeString()}</div>
            </>
          ) : (
            <div style={{ color: 'var(--text-muted)' }}>Loading…</div>
          )}
        </div>
      </div>

      {/* Build Queue */}
      <QueuePanel />

      {/* Tech Debt */}
      <DebtPanel />

      {/* Main grid */}
      <main className="main-content">
        {GROUPS.map(group => (
          <section key={group.id} className="section">
            <div className="section-header">
              <span className="section-title">{group.label}</span>
              <span className="section-line" />
              <span className="section-count">{group.agents.length}</span>
            </div>
            <div className="cards-grid">
              {group.agents.map(agent => (
                <AgentCard
                  key={agent.id}
                  agent={agent}
                  result={results[agent.id]}
                  selected={selectedId === agent.id}
                  onClick={() => setSelectedId(selectedId === agent.id ? null : agent.id)}
                />
              ))}
            </div>
          </section>
        ))}
      </main>

      {/* Detail panel */}
      {selectedAgent && (
        <DetailPanel
          agent={selectedAgent}
          result={results[selectedId]}
          onClose={() => setSelectedId(null)}
        />
      )}
    </div>
  )
}
