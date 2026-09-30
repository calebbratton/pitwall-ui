import { afterEach, describe, expect, it, vi } from 'vitest'
import type { LiveCurrent } from '../liveTypes'
import type { CurrentResult } from './liveApi'
import { createFetchCurrent, createStartFeed, liveTarget, parseCurrent, pollCurrent } from './liveApi'
import { fetchMockCurrent, MOCK_LIVE_ID, setMockFeed, startMockFeed } from './mockReplay'

const body = {
  live_id: '39ec94d77572', source: 'live', connected: true, recording: 'data/x', meeting: 'Azerbaijan Grand Prix',
  session: 'Race', lap: 51, total_laps: 51, status: 'YELLOW',
}
const current = parseCurrent(body) as LiveCurrent

const respond = (status: number, payload: unknown): typeof fetch =>
  (async () => new Response(JSON.stringify(payload), { status, headers: { 'Content-Type': 'application/json' } })) as typeof fetch

describe('GET /api/live/current', () => {
  it('parses a live session', async () => {
    expect(current).toMatchObject({ live_id: '39ec94d77572', source: 'live', connected: true, lap: 51, status: 'YELLOW' })
    expect(await createFetchCurrent('http://api', respond(200, body))()).toEqual({ kind: 'live', current })
  })

  it('maps 404 to "no live session", other failures to errors', async () => {
    expect(await createFetchCurrent('http://api', respond(404, { detail: 'No live session.' }))()).toEqual({
      kind: 'none', detail: 'No live session.',
    })
    expect(await createFetchCurrent('http://api', respond(500, {}))()).toMatchObject({ kind: 'error' })
    expect(await createFetchCurrent('http://api', respond(200, { nope: 1 }))()).toMatchObject({ kind: 'error' })
    const down = createFetchCurrent('http://api', (async () => {
      throw new TypeError('Failed to fetch')
    }) as typeof fetch)
    expect(await down()).toMatchObject({ kind: 'error', message: 'Backend unreachable at http://api' })
  })

  it('POST /api/live/start answers like /current', async () => {
    const calls: [string, RequestInit | undefined][] = []
    const f = (async (url: string, init?: RequestInit) => {
      calls.push([url, init])
      return new Response(JSON.stringify(body), { status: 200 })
    }) as typeof fetch
    expect(await createStartFeed('http://api', f)()).toMatchObject({ kind: 'live' })
    expect(calls[0][0]).toBe('http://api/api/live/start')
    expect(calls[0][1]?.method).toBe('POST')
  })
})

describe('polling /current', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('asks now, then every interval, and stops cleanly', async () => {
    vi.useFakeTimers()
    const answers: CurrentResult[] = [
      { kind: 'none', detail: 'No live session.' },
      { kind: 'none', detail: 'No live session.' },
      { kind: 'live', current },
    ]
    let calls = 0
    const seen: CurrentResult['kind'][] = []
    const stop = pollCurrent(async () => answers[Math.min(calls++, answers.length - 1)], (r) => seen.push(r.kind), 30_000)
    await vi.advanceTimersByTimeAsync(0)
    expect(seen).toEqual(['none'])
    await vi.advanceTimersByTimeAsync(29_000)
    expect(seen).toEqual(['none'])
    await vi.advanceTimersByTimeAsync(1_000)
    expect(seen).toEqual(['none', 'none'])
    await vi.advanceTimersByTimeAsync(30_000)
    expect(seen).toEqual(['none', 'none', 'live']) // a session that appears later is picked up
    stop()
    await vi.advanceTimersByTimeAsync(120_000)
    expect(calls).toBe(3)
  })

  it('drops an answer that lands after stop', async () => {
    let resolve: (r: CurrentResult) => void = () => {}
    const seen: CurrentResult[] = []
    const stop = pollCurrent(() => new Promise((r) => (resolve = r)), (r) => seen.push(r))
    stop()
    resolve({ kind: 'live', current })
    await Promise.resolve()
    expect(seen).toEqual([])
  })
})

describe('live vs test replay source switching', () => {
  it('subscribes to the current live session only in live mode, once', () => {
    expect(liveTarget('live', current, null)).toBe('39ec94d77572')
    expect(liveTarget('live', current, '39ec94d77572')).toBeNull() // already following
    expect(liveTarget('replay', current, null)).toBeNull() // a test replay is on screen
    expect(liveTarget('live', null, null)).toBeNull() // 404: nothing to follow
    expect(liveTarget('live', null, '39ec94d77572')).toBeNull() // session gone: keep what is shown
  })

  it('switches when the server starts a new live session', () => {
    const next = { ...current, live_id: '99b2abcd1c8f' }
    expect(liveTarget('live', next, '39ec94d77572')).toBe('99b2abcd1c8f')
  })
})

describe('mock live feed', () => {
  it('serves /current, 404 when the feed is off, and start turns it on', async () => {
    const on = await fetchMockCurrent()
    expect(on.kind === 'live' && on.current.live_id).toBe(MOCK_LIVE_ID)
    setMockFeed(false)
    expect((await fetchMockCurrent()).kind).toBe('none')
    expect((await startMockFeed()).kind).toBe('live')
  })
})
