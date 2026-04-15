import { useState, useEffect, useCallback, useRef } from 'react'
import './App.css'

/* ── Fleet registry ──────────────────────────────────── */
const GROUPS = [
  {
    id: 'core',
    label: 'Core Agents',
    agents: [
      { id: 'chief',  name: 'CHIEF',      desc: 'Orchestrator / Command agent',    port: 8752 },
      { id: 'scribe', name: 'SCRIBE',     desc: 'Document & memory agent',          port: 8742 },
      { id: 'forge',  name: 'FORGE',      desc: 'Build & deployment agent',         port: 8768 },
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
      { id: 'ifeoma',     name: 'IFEOMA',     desc: 'Research & insights agent',     port: 8758 },
      { id: 'comply',     name: 'COMPLY',     desc: 'Compliance & audit agent',      port: 8760 },
      { id: 'erlai',      name: 'ERLAI',      desc: 'ERLAI agent interface',         port: 8771 },
    ],
  },
  {
    id: 'erlai',
    label: 'ERLAI CCI Platform',
    agents: [
      { id: 'erlai-gw',        name: 'GW',        desc: 'API gateway',               port: 8800 },
      { id: 'erlai-ingest',    name: 'INGEST',    desc: 'Data ingestion service',    port: 8801 },
      { id: 'erlai-score',     name: 'SCORE',     desc: 'Scoring engine',            port: 8802 },
      { id: 'erlai-orch',      name: 'ORCH',      desc: 'Orchestration service',     port: 8803 },
      { id: 'erlai-transform', name: 'TRANSFORM', desc: 'Data transform pipeline',   port: 8804 },
      { id: 'erlai-web',       name: 'WEB',       desc: 'Frontend application',      port: 3100 },
      { id: 'erlai-grafana',   name: 'GRAFANA',   desc: 'Metrics & dashboards',      port: 3002 },
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

/* ── Main App ────────────────────────────────────────── */
const REFRESH_INTERVAL = 30_000

export default function App() {
  const [results, setResults] = useState({})
  const [selectedId, setSelectedId] = useState(null)
  const [lastUpdated, setLastUpdated] = useState(null)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [countdown, setCountdown] = useState(REFRESH_INTERVAL / 1000)
  const timerRef = useRef(null)
  const countdownRef = useRef(null)

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
            <span className={`pulse-dot${countdown === 0 ? ' stale' : ''}`} />
            {isRefreshing ? 'Polling…' : `Next refresh in ${countdown}s`}
          </div>
          <button className="btn-refresh" onClick={fetchAll} disabled={isRefreshing}>
            {isRefreshing ? '⟳ Polling…' : '⟳ Refresh'}
          </button>
        </div>
      </header>

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
