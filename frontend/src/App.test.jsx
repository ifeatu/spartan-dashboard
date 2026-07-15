/**
 * Tests for sections D-F of gate-async-decision.md:
 *  D. postDecision / executeDecision toast + pending hygiene
 *  E. postBreakerClear / postSeedDebt never put raw body in toasts
 *  F. Spec test scenarios:
 *     F1. 504 + HTML body → no raw body in DOM, row stays pending, poll → success toast
 *     F2. 400 JSON → one-line error toast with `error` field only
 *     F3. defer → pending clears on 2xx even though item remains gated
 */
import { render, screen, waitFor, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

import { stripHtml, postDecision, QueuePanel } from './App.jsx'

/* ── Response helpers ────────────────────────────────────── */

function jsonResp(body, status = 200) {
  return {
    status,
    ok: status >= 200 && status < 300,
    json: async () => body,
    text: async () => JSON.stringify(body),
  }
}

/** Simulates a non-JSON (e.g. Cloudflare HTML) error response. */
function htmlResp(html, status = 504) {
  return {
    status,
    ok: false,
    json: async () => { throw new SyntaxError('Unexpected token < in JSON at position 0') },
    text: async () => html,
  }
}

/* ── Queue fixture data ──────────────────────────────────── */

const SUMMARY = {
  counts: { queued: 0, dispatched: 0, running: 0, gated: 1, done: 5 },
  last_24h: { done: 3, failed: 0 },
  breaker: 'closed',
}
const GATED_ITEM = {
  id: 850, status: 'gated', title: 'Test PR #850', repo: 'test-repo',
  task_class: 'feat', priority: 1, gate_required: true,
}
const GATED_LIST = { items: [GATED_ITEM] }
const EMPTY_LIST = { items: [] }

function makeFetch(decisionResp) {
  return vi.fn(async (url) => {
    if (url.includes('/queue/summary')) return jsonResp(SUMMARY)
    if (url.includes('/queue/list') && url.includes('status=failed')) return jsonResp({ items: [] })
    if (url.includes('/queue/list')) return jsonResp(GATED_LIST)
    if (url.includes('/decision')) return decisionResp
    return jsonResp({})
  })
}

/* ── Unit: stripHtml ─────────────────────────────────────── */

describe('stripHtml', () => {
  it('removes HTML tags', () => {
    expect(stripHtml('<html><body>error</body></html>')).toBe('error')
  })

  it('replaces HTML entities with a space', () => {
    // &nbsp; becomes one space replacing the entity token
    expect(stripHtml('item&nbsp;not found')).toBe('item not found')
  })

  it('passes plain text unchanged', () => {
    expect(stripHtml('not awaiting a gate decision')).toBe('not awaiting a gate decision')
  })

  it('handles null/undefined gracefully', () => {
    expect(stripHtml(null)).toBe('')
    expect(stripHtml(undefined)).toBe('')
  })
})

/* ── Unit: postDecision ──────────────────────────────────── */

describe('postDecision', () => {
  afterEach(() => { vi.unstubAllGlobals() })

  it('returns { indeterminate: true } on 504 + HTML body', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => htmlResp(
      '<html><body>Cloudflare 504 Gateway Timeout</body></html>',
      504,
    )))
    const result = await postDecision(850, 'merge')
    expect(result).toEqual({ indeterminate: true })
  })

  it('returns { indeterminate: true } on 500 + HTML body', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => htmlResp('<html>Server Error</html>', 500)))
    const result = await postDecision(850, 'merge')
    expect(result).toEqual({ indeterminate: true })
  })

  it('returns { indeterminate: true } on 200 + non-JSON body', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => htmlResp('OK', 200)))
    const result = await postDecision(850, 'merge')
    expect(result).toEqual({ indeterminate: true })
  })

  it('throws clean error on 400 + JSON body', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResp(
      { error: "not awaiting a gate decision (status='done')" },
      400,
    )))
    await expect(postDecision(850, 'merge')).rejects.toThrow(
      "not awaiting a gate decision (status='done')",
    )
  })

  it('strips HTML from 4xx JSON error field', async () => {
    // <b>Bad</b> → 'Bad'; &amp; → ' '; spaces between tokens preserved
    vi.stubGlobal('fetch', vi.fn(async () => jsonResp(
      { error: '<b>Bad</b> request &amp; error' },
      422,
    )))
    await expect(postDecision(850, 'merge')).rejects.toThrow('Bad request   error')
  })

  it('caps 4xx error message at 100 chars', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResp({ error: 'x'.repeat(150) }, 400)))
    await expect(postDecision(850, 'merge')).rejects.toThrow('x'.repeat(100))
    // The thrown error must NOT contain more than 100 x's
    try {
      await postDecision(850, 'merge')
    } catch (e) {
      expect(e.message.length).toBeLessThanOrEqual(100)
    }
  })

  it('returns { ok: true, accepted: true } on 202 status:accepted', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResp(
      { id: 850, decision: 'merge', status: 'accepted', job: 'gate-42' },
      202,
    )))
    const result = await postDecision(850, 'merge')
    expect(result.ok).toBe(true)
    expect(result.accepted).toBe(true)
  })

  it('returns { ok: true, accepted: false } on plain 200', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResp({ status: 'gated' }, 200)))
    const result = await postDecision(850, 'defer')
    expect(result.ok).toBe(true)
    expect(result.accepted).toBe(false)
  })
})

/* ── Integration: QueuePanel ─────────────────────────────── */
//
// Uses real timers (no vi.useFakeTimers). RTL's waitFor/findBy* work normally.
// To simulate the 15s reconcile poll without waiting 15 real seconds, we spy
// on setInterval to capture the fetchQueue callback, then call it manually.

describe('QueuePanel — F spec scenarios', () => {
  // Captured reference to the queue poll callback (fetchQueue inside QueuePanel).
  // Set by the setInterval spy during component mount.
  let pollTrigger = null

  beforeEach(() => {
    pollTrigger = null
    const origSetInterval = globalThis.setInterval
    vi.spyOn(globalThis, 'setInterval').mockImplementation((fn, delay, ...args) => {
      if (delay === 15_000) pollTrigger = fn   // capture fetchQueue
      return origSetInterval.call(globalThis, fn, delay, ...args)
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  async function renderAndWaitForMergeBtn(decisionResp) {
    const fetchMock = makeFetch(decisionResp)
    vi.stubGlobal('fetch', fetchMock)
    render(<QueuePanel />)
    return {
      fetchMock,
      mergeBtn: await screen.findByRole('button', { name: /^merge$/i }),
    }
  }

  /**
   * F1. Mock fetch returning 504 + HTML body:
   *   - no raw body text in DOM
   *   - row stays pending (spinner, no Merge button)
   *   - subsequent poll with item gone from gated list yields "#<id> confirmed" toast
   */
  it('F1: 504 + HTML body → no raw body in DOM, row stays pending, poll yields confirmed toast', async () => {
    const HTML_BODY = '<html><body><h1>Cloudflare 504 Gateway Timeout</h1></body></html>'
    const { fetchMock, mergeBtn } = await renderAndWaitForMergeBtn(htmlResp(HTML_BODY, 504))

    await userEvent.click(mergeBtn)

    // Info toast must appear
    await waitFor(() => {
      expect(screen.getByText(/status unknown, confirming/i)).toBeInTheDocument()
    })

    // Raw HTML body must NOT appear anywhere in the DOM
    expect(document.body.textContent).not.toContain('Gateway Timeout')
    expect(document.body.textContent).not.toContain('<html>')
    expect(document.body.textContent).not.toContain('<body>')

    // Row still pending — Merge button hidden (spinner shown instead)
    expect(screen.queryByRole('button', { name: /^merge$/i })).not.toBeInTheDocument()

    // ---- Simulate poll: item is gone from gated list (merge completed on server) ----
    fetchMock.mockImplementation(async (url) => {
      if (url.includes('/queue/summary'))
        return jsonResp({ ...SUMMARY, counts: { ...SUMMARY.counts, gated: 0 } })
      if (url.includes('/queue/list') && url.includes('status=failed')) return jsonResp({ items: [] })
      if (url.includes('/queue/list')) return jsonResp(EMPTY_LIST)
      return jsonResp({})
    })

    // Trigger the reconcile poll manually (captured from the component's setInterval)
    await act(async () => { await pollTrigger() })

    // Reconciler clears pending and shows confirmed toast
    await waitFor(() => {
      expect(screen.getByText(/#850.*confirmed/i)).toBeInTheDocument()
    })
  })

  /**
   * F2. Mock 400 JSON → one-line error toast with `error` field only,
   *     no raw status text; pending clears so Merge button reappears.
   */
  it('F2: 400 JSON → one-line error toast with error field, pending cleared', async () => {
    const ERR_MSG = "not awaiting a gate decision (status='done')"
    const { mergeBtn } = await renderAndWaitForMergeBtn(jsonResp({ error: ERR_MSG }, 400))

    await userEvent.click(mergeBtn)

    // Error toast should contain the cleaned error field text
    await waitFor(() => {
      expect(screen.getByText(/not awaiting a gate decision/i)).toBeInTheDocument()
    })

    // Toast must NOT contain raw "HTTP 400" status string
    const errorToast = document.querySelector('.toast-error')
    expect(errorToast?.textContent).not.toMatch(/HTTP 400/)

    // Pending cleared → Merge button re-appears (can retry)
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /^merge$/i })).toBeInTheDocument()
    })
  })

  /**
   * F3. Defer → pending flag clears on 2xx even though item stays gated.
   *     (Without the fix, the reconciler alone would never clear pending because
   *     the item never leaves the gated list; the explicit setPendingIds delete is required.)
   */
  it('F3: defer 2xx clears pending even though item remains gated', async () => {
    // Server returns 200 {"status":"gated"} for defer — item stays gated on next poll
    const { mergeBtn } = await renderAndWaitForMergeBtn(jsonResp({ status: 'gated' }, 200))

    const deferBtn = screen.getByRole('button', { name: /^defer$/i })
    await userEvent.click(deferBtn)

    // Accepted toast appears
    await waitFor(() => {
      expect(screen.getByText(/defer accepted/i)).toBeInTheDocument()
    })

    // Pending cleared explicitly → decision buttons reappear even though item is still gated
    // (fetchQueue is called after synchronous 2xx, item stays in GATED_LIST mock)
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /^merge$/i })).toBeInTheDocument()
    })
  })
})
