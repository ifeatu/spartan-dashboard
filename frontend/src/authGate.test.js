import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  apiFetch,
  isAuthLost,
  tripAuthLost,
  subscribeAuthLost,
  AuthLostError,
  __resetAuthGate,
} from './authGate'

function res(status) {
  return { status, ok: status >= 200 && status < 300 }
}

describe('authGate', () => {
  beforeEach(() => {
    __resetAuthGate()
    vi.restoreAllMocks()
  })

  it('passes successful responses straight through', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(res(200))
    await expect(apiFetch('/api/health/bob')).resolves.toMatchObject({ status: 200 })
    expect(isAuthLost()).toBe(false)
  })

  it('does not trip on non-401 failures — a 502 is a service blip, not lost auth', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(res(502))
    await expect(apiFetch('/api/health/bob')).resolves.toMatchObject({ status: 502 })
    expect(isAuthLost()).toBe(false)
  })

  it('trips the breaker and throws on 401', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(res(401))
    await expect(apiFetch('/api/health/bob')).rejects.toBeInstanceOf(AuthLostError)
    expect(isAuthLost()).toBe(true)
  })

  it('refuses to hit the network once tripped — this is what stops the prompt storm', async () => {
    const spy = vi.fn().mockResolvedValue(res(401))
    globalThis.fetch = spy

    await expect(apiFetch('/api/health/bob')).rejects.toBeInstanceOf(AuthLostError)
    expect(spy).toHaveBeenCalledTimes(1)

    // The fleet view fans out to every agent; none of them may re-challenge.
    for (let i = 0; i < 29; i++) {
      await expect(apiFetch('/api/health/scribe')).rejects.toBeInstanceOf(AuthLostError)
    }
    expect(spy).toHaveBeenCalledTimes(1)
  })

  it('notifies subscribers exactly once, even on repeated 401s', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(res(401))
    const seen = vi.fn()
    subscribeAuthLost(seen)

    await expect(apiFetch('/api/a')).rejects.toThrow()
    tripAuthLost()
    tripAuthLost()

    expect(seen).toHaveBeenCalledTimes(1)
  })

  it('unsubscribe stops delivery', () => {
    const seen = vi.fn()
    const off = subscribeAuthLost(seen)
    off()
    tripAuthLost()
    expect(seen).not.toHaveBeenCalled()
  })
})
