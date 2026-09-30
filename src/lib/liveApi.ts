/** LIVE transport: race list (GET /api/live/sessions) and the replay stream (EventSource on /api/live/replay). */
import type { LiveCurrent, LiveSessionInfo, LiveTransport, ReplayParams, ReplayTransport } from '../liveTypes'
import { REPLAY_EVENT_NAMES } from '../liveTypes'
import { API_URL } from './api'
import { parseReplayEvent, trackStatus } from './replay'

export function replayUrl(params: ReplayParams): string {
  const q = new URLSearchParams({ path: params.path, speed: String(params.speed) })
  if (params.fromLap !== null) q.set('from_lap', String(params.fromLap))
  return `${API_URL}/api/live/replay?${q.toString()}`
}

export function parseSessions(body: unknown): LiveSessionInfo[] {
  if (!Array.isArray(body)) throw new Error('Unexpected /api/live/sessions response')
  return body
    .filter(
      (s): s is LiveSessionInfo =>
        typeof s === 'object' && s !== null && typeof (s as LiveSessionInfo).path === 'string',
    )
    .map((s) => ({ path: s.path, meeting: String(s.meeting ?? s.path), date: String(s.date ?? '') }))
    .sort((a, b) => a.date.localeCompare(b.date))
}

export async function fetchSessions(year: number, signal?: AbortSignal): Promise<LiveSessionInfo[]> {
  const res = await fetch(`${API_URL}/api/live/sessions?year=${year}`, { signal })
  if (!res.ok) throw new Error(`API ${res.status} ${res.statusText}`)
  return parseSessions(await res.json())
}

/**
 * Open the replay as an EventSource. EventSource reconnects on its own, which would restart the
 * replay from the beginning, so the source is closed on `end`, on a server `error` event and on the
 * first connection error (reported as an `error` event).
 */
export const openReplay: ReplayTransport = (params, onEvent) => {
  const es = new EventSource(replayUrl(params))
  let closed = false
  const close = () => {
    closed = true
    es.close()
  }

  for (const name of REPLAY_EVENT_NAMES) {
    if (name === 'error') continue
    es.addEventListener(name, (e) => {
      if (closed) return
      const event = parseReplayEvent(name, (e as MessageEvent<string>).data)
      if (!event) return
      if (event.type === 'end') close()
      onEvent(event)
    })
  }

  // Named server `error` events arrive as MessageEvents with data; connection failures are plain Events.
  es.addEventListener('error', (e) => {
    if (closed) return
    close()
    const data = e instanceof MessageEvent && typeof e.data === 'string' ? e.data : null
    onEvent(
      (data !== null && parseReplayEvent('error', data)) || {
        type: 'error',
        message: `Lost the replay stream from ${API_URL}. Is the backend running?`,
      },
    )
  })

  return close
}

// ---------- the real live session ----------

export type CurrentResult =
  | { kind: 'live'; current: LiveCurrent }
  /** 404: no live session on the server */
  | { kind: 'none'; detail: string }
  /** backend unreachable / unexpected response */
  | { kind: 'error'; message: string }

const numOrNull = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const strOrNull = (v: unknown) => (typeof v === 'string' && v ? v : null)

export function parseCurrent(body: unknown): LiveCurrent | null {
  if (typeof body !== 'object' || body === null) return null
  const b = body as Record<string, unknown>
  if (typeof b.live_id !== 'string' || !b.live_id) return null
  return {
    live_id: b.live_id,
    source: b.source === 'replay' ? 'replay' : 'live',
    connected: b.connected === true,
    recording: strOrNull(b.recording),
    meeting: strOrNull(b.meeting),
    session: strOrNull(b.session),
    lap: numOrNull(b.lap),
    total_laps: numOrNull(b.total_laps),
    status: trackStatus(b.status),
  }
}

async function detail(res: Response): Promise<string> {
  try {
    const j = (await res.json()) as { detail?: unknown }
    return typeof j.detail === 'string' ? j.detail : ''
  } catch {
    return ''
  }
}

async function currentFrom(res: Response): Promise<CurrentResult> {
  if (res.status === 404) return { kind: 'none', detail: (await detail(res)) || 'No live session.' }
  if (!res.ok) return { kind: 'error', message: `API ${res.status} ${res.statusText}` }
  try {
    const current = parseCurrent(await res.json())
    return current ? { kind: 'live', current } : { kind: 'error', message: 'Unexpected /api/live/current response' }
  } catch {
    return { kind: 'error', message: 'Unexpected /api/live/current response' }
  }
}

export type CurrentFetcher = (signal?: AbortSignal) => Promise<CurrentResult>

/** GET /api/live/current; `fetchImpl` is injectable for tests. */
export function createFetchCurrent(baseUrl: string, fetchImpl: typeof fetch = (...a) => fetch(...a)): CurrentFetcher {
  return async (signal) => {
    try {
      return await currentFrom(await fetchImpl(`${baseUrl}/api/live/current`, { signal }))
    } catch {
      return { kind: 'error', message: `Backend unreachable at ${baseUrl}` }
    }
  }
}

/** POST /api/live/start: start following the live timing feed (local dev tool). */
export function createStartFeed(baseUrl: string, fetchImpl: typeof fetch = (...a) => fetch(...a)): CurrentFetcher {
  return async (signal) => {
    try {
      return await currentFrom(await fetchImpl(`${baseUrl}/api/live/start`, { method: 'POST', signal }))
    } catch {
      return { kind: 'error', message: `Backend unreachable at ${baseUrl}` }
    }
  }
}

export const fetchCurrent = createFetchCurrent(API_URL)
export const startLiveFeed = createStartFeed(API_URL)

export const CURRENT_POLL_MS = 30_000

/**
 * Ask `fetcher` now and then every `intervalMs` (after each answer, so calls never overlap) until the
 * returned stop function is called. Results after stop are dropped.
 */
export function pollCurrent(fetcher: CurrentFetcher, onResult: (r: CurrentResult) => void, intervalMs = CURRENT_POLL_MS): () => void {
  let stopped = false
  let timer: ReturnType<typeof setTimeout> | undefined
  const ctrl = new AbortController()
  const tick = async () => {
    const r = await fetcher(ctrl.signal)
    if (stopped) return
    onResult(r)
    timer = setTimeout(() => void tick(), intervalMs)
  }
  void tick()
  return () => {
    stopped = true
    clearTimeout(timer)
    ctrl.abort()
  }
}

/** Which live session to subscribe to: the server's current one, while the view is on live (not a test replay). */
export function liveTarget(mode: 'live' | 'replay', current: LiveCurrent | null, following: string | null): string | null {
  if (mode !== 'live' || !current) return null
  if (following === current.live_id) return null // already on it (a failed stream is retried by hand)
  return current.live_id
}

export function liveStreamUrl(liveId: string): string {
  return `${API_URL}/api/live/stream?live_id=${encodeURIComponent(liveId)}`
}

/**
 * Subscribe to the live session. Unlike a replay, EventSource may reconnect: the server replays a
 * catch-up of the current state (the reducer de-duplicates feed items), and the drop / recovery is
 * reported as `connection` events. A stream the server refuses (404: unknown live_id) closes for good.
 */
export const openLiveStream: LiveTransport = (params, onEvent) => {
  const es = new EventSource(liveStreamUrl(params.liveId))
  let closed = false
  const close = () => {
    closed = true
    es.close()
  }
  es.addEventListener('open', () => {
    if (!closed) onEvent({ type: 'connection', connected: true })
  })
  for (const name of REPLAY_EVENT_NAMES) {
    if (name === 'error') continue
    es.addEventListener(name, (e) => {
      if (closed) return
      const event = parseReplayEvent(name, (e as MessageEvent<string>).data)
      if (!event) return
      if (event.type === 'end') close()
      onEvent(event)
    })
  }
  es.addEventListener('error', (e) => {
    if (closed) return
    const data = e instanceof MessageEvent && typeof e.data === 'string' ? e.data : null
    if (data !== null) {
      close()
      onEvent(parseReplayEvent('error', data) || { type: 'error', message: 'Live stream error' })
    } else if (es.readyState === EventSource.CLOSED) {
      close()
      onEvent({ type: 'error', message: 'The live session stream was refused (the session may have ended).' })
    } else {
      onEvent({ type: 'connection', connected: false })
    }
  })
  return close
}
