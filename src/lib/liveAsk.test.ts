import { describe, expect, it } from 'vitest'
import { createAsk, parseAskResponse } from './liveAsk'

const body = {
  answer: '**RUS** is favourite.',
  lap: 31,
  status: 'SAFETY_CAR',
  prediction: {
    lap: 31, laps_remaining: 20, status: 'SAFETY_CAR', sims: 2000, notes: [],
    table: [{ tla: 'RUS', position: 1, expected: 1.8, p_win: 0.52, p_podium: 0.9, compound: 'MEDIUM', compound_c: 'C4', tyre_age: 32, stopped: false, tyre_risk: 'high', tyre_note: 'old' }],
  },
  steps: ['race state', 'simulate'],
}

type Call = { url: string; init: RequestInit | undefined }

function fakeFetch(status: number, payload: unknown, calls: Call[] = []): typeof fetch {
  return (async (url: string, init?: RequestInit) => {
    calls.push({ url, init })
    const text = typeof payload === 'string' ? payload : JSON.stringify(payload)
    return new Response(text, { status, headers: { 'Content-Type': 'application/json' } })
  }) as typeof fetch
}

describe('ask client (POST /api/live/ask)', () => {
  it('posts live_id + message and parses the answer', async () => {
    const calls: Call[] = []
    const ask = createAsk('http://api', fakeFetch(200, body, calls))
    const res = await ask({ live_id: 'L1', message: 'Who wins from here?' })
    expect(calls[0].url).toBe('http://api/api/live/ask')
    expect(calls[0].init?.method).toBe('POST')
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({ live_id: 'L1', message: 'Who wins from here?' })
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.data).toMatchObject({ answer: '**RUS** is favourite.', lap: 31, status: 'SAFETY_CAR', steps: ['race state', 'simulate'] })
    expect(res.data.prediction?.table[0]).toMatchObject({ tla: 'RUS', p_win: 0.52, compound_c: 'C4' })
  })

  it('maps 404 to "gone" with the server detail, and a bare route 404 to a missing endpoint', async () => {
    const gone = await createAsk('http://api', fakeFetch(404, { detail: 'Live session L1 is not running.' }))({ live_id: 'L1', message: 'q' })
    expect(gone).toEqual({ ok: false, kind: 'gone', message: 'Live session L1 is not running.' })
    const noRoute = await createAsk('http://api', fakeFetch(404, { detail: 'Not Found' }))({ live_id: 'L1', message: 'q' })
    expect(noRoute).toMatchObject({ ok: false, kind: 'gone' })
    if (!noRoute.ok) expect(noRoute.message).toMatch(/no \/api\/live\/ask endpoint/)
  })

  it('maps 409 to "early"', async () => {
    const res = await createAsk('http://api', fakeFetch(409, { detail: 'Not enough race data yet (lap 2).' }))({ live_id: 'L1', message: 'q' })
    expect(res).toEqual({ ok: false, kind: 'early', message: 'Not enough race data yet (lap 2).' })
  })

  it('reports network errors, aborts, server errors and bad bodies', async () => {
    const down = createAsk('http://api', (async () => {
      throw new TypeError('Failed to fetch')
    }) as typeof fetch)
    expect(await down({ live_id: 'L1', message: 'q' })).toMatchObject({ ok: false, kind: 'network' })

    const ctrl = new AbortController()
    ctrl.abort()
    const aborting = createAsk('http://api', (async () => {
      throw new DOMException('aborted', 'AbortError')
    }) as typeof fetch)
    expect(await aborting({ live_id: 'L1', message: 'q' }, ctrl.signal)).toMatchObject({ ok: false, kind: 'aborted' })

    expect(await createAsk('http://api', fakeFetch(500, 'boom'))({ live_id: 'L1', message: 'q' })).toEqual({
      ok: false, kind: 'error', message: 'API 500: boom',
    })
    expect(await createAsk('http://api', fakeFetch(200, 'not json'))({ live_id: 'L1', message: 'q' })).toMatchObject({ ok: false, kind: 'error' })
    expect(await createAsk('http://api', fakeFetch(200, { lap: 3 }))({ live_id: 'L1', message: 'q' })).toMatchObject({ ok: false, kind: 'error' })
  })

  it('tolerates a missing prediction and odd fields', () => {
    expect(parseAskResponse({ answer: 'x', lap: 'n/a', status: 'NOPE' })).toEqual({
      answer: 'x', lap: null, status: 'UNKNOWN', prediction: null, steps: [],
    })
  })
})
