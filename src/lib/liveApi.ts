/** LIVE transport: race list (GET /api/live/sessions) and the replay stream (EventSource on /api/live/replay). */
import type { LiveSessionInfo, ReplayParams, ReplayTransport } from '../liveTypes'
import { REPLAY_EVENT_NAMES } from '../liveTypes'
import { API_URL } from './api'
import { parseReplayEvent } from './replay'

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
