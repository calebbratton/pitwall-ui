/** POST /api/live/ask: a question about the live session as it stands right now (JSON, not a stream). */
import type { Prediction, TrackStatus } from '../liveTypes'
import { API_URL } from './api'
import { parsePrediction, trackStatus } from './replay'

export interface AskRequest {
  live_id: string
  message: string
}

export interface AskAnswer {
  /** markdown */
  answer: string
  /** race state the answer was computed from */
  lap: number | null
  status: TrackStatus
  prediction: Prediction | null
  steps: string[]
}

/**
 * `gone`: 404, the live session isn't running any more (finished long ago / server restarted);
 * `early`: 409, not enough race data yet; `network`: backend unreachable; `aborted`: cancelled by us.
 */
export type AskFailure = 'gone' | 'early' | 'network' | 'error' | 'aborted'

export type AskResult = { ok: true; data: AskAnswer } | { ok: false; kind: AskFailure; message: string }

export type AskTransport = (req: AskRequest, signal?: AbortSignal) => Promise<AskResult>

export function parseAskResponse(body: unknown): AskAnswer | null {
  if (typeof body !== 'object' || body === null) return null
  const b = body as Record<string, unknown>
  if (typeof b.answer !== 'string') return null
  return {
    answer: b.answer,
    lap: typeof b.lap === 'number' && Number.isFinite(b.lap) ? b.lap : null,
    status: trackStatus(b.status),
    prediction: parsePrediction(b.prediction),
    steps: Array.isArray(b.steps) ? b.steps.map(String) : [],
  }
}

async function detailOf(res: Response): Promise<string> {
  try {
    const text = await res.text()
    try {
      const j: unknown = JSON.parse(text)
      if (typeof j === 'object' && j !== null) {
        const d = (j as { detail?: unknown }).detail
        if (typeof d === 'string') return d
        if (d !== undefined) return JSON.stringify(d).slice(0, 300)
      }
    } catch {
      /* not JSON */
    }
    return text.slice(0, 300)
  } catch {
    return ''
  }
}

/** Build the ask client for a base URL; `fetchImpl` is injectable for tests. */
export function createAsk(baseUrl: string, fetchImpl: typeof fetch = (...a) => fetch(...a)): AskTransport {
  return async (req, signal) => {
    let res: Response
    try {
      res = await fetchImpl(`${baseUrl}/api/live/ask`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(req),
        signal,
      })
    } catch (e) {
      if (signal?.aborted || (e instanceof DOMException && e.name === 'AbortError')) {
        return { ok: false, kind: 'aborted', message: 'Cancelled.' }
      }
      return { ok: false, kind: 'network', message: `No signal from strategy at ${baseUrl}. Is the backend running?` }
    }
    if (res.status === 404) {
      const detail = await detailOf(res)
      // FastAPI's generic 404 means the route itself is missing (backend without /api/live/ask).
      const message =
        detail === 'Not Found' || detail === ''
          ? 'This backend has no /api/live/ask endpoint yet (404).'
          : detail
      return { ok: false, kind: 'gone', message }
    }
    if (res.status === 409) {
      return { ok: false, kind: 'early', message: (await detailOf(res)) || 'Not enough race data yet.' }
    }
    if (!res.ok) {
      const detail = await detailOf(res)
      return { ok: false, kind: 'error', message: `API ${res.status}${detail ? `: ${detail}` : ''}` }
    }
    let body: unknown
    try {
      body = await res.json()
    } catch {
      return { ok: false, kind: 'error', message: 'Strategy sent an unreadable answer (not JSON).' }
    }
    const data = parseAskResponse(body)
    return data ? { ok: true, data } : { ok: false, kind: 'error', message: 'Strategy sent an answer without text.' }
  }
}

export const askLive: AskTransport = createAsk(API_URL)
