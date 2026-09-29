import type { ChatTransport } from './events'
import { frameToEvent } from './events'
import { readSSE } from './sse'

export const API_URL: string = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') ||
  'http://localhost:8000'

export const MOCK_FORCED: boolean = import.meta.env.VITE_MOCK === '1' || import.meta.env.VITE_MOCK === 'true'

/** GET /api/health with a short timeout. Resolves true only on 200 {"status":"ok"}. */
export async function checkHealth(timeoutMs = 4000): Promise<boolean> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetch(`${API_URL}/api/health`, { signal: ctrl.signal })
    if (!res.ok) return false
    const body: unknown = await res.json()
    return typeof body === 'object' && body !== null && (body as { status?: unknown }).status === 'ok'
  } catch {
    return false
  } finally {
    clearTimeout(timer)
  }
}

/** POST /api/chat and stream the SSE response. */
export const streamChat: ChatTransport = async (req, onEvent, signal) => {
  const res = await fetch(`${API_URL}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
    body: JSON.stringify(req),
    signal,
  })
  if (!res.ok || !res.body) {
    let detail = ''
    try {
      detail = (await res.text()).slice(0, 300)
    } catch {
      /* ignore */
    }
    throw new Error(`API ${res.status} ${res.statusText}${detail ? `: ${detail}` : ''}`)
  }
  await readSSE(res.body, (frame) => {
    const event = frameToEvent(frame)
    if (event) onEvent(event)
  })
}
