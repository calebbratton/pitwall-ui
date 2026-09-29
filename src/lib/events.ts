import type { AnswerPayload, ChatEvent, ChatRequest, NodeName } from '../types'
import { NODE_ORDER } from '../types'
import type { SSEFrame } from './sse'

/** A chat transport streams ChatEvents for one request. Real API and mock share this shape. */
export type ChatTransport = (
  req: ChatRequest,
  onEvent: (event: ChatEvent) => void,
  signal?: AbortSignal,
) => Promise<void>

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function isNode(v: unknown): v is NodeName {
  return typeof v === 'string' && (NODE_ORDER as readonly string[]).includes(v)
}

/** Convert a raw SSE frame into a typed ChatEvent. Unknown/malformed frames return null. */
export function frameToEvent(frame: SSEFrame): ChatEvent | null {
  let data: unknown
  try {
    data = JSON.parse(frame.data)
  } catch {
    return frame.event === 'error' ? { type: 'error', message: frame.data } : null
  }
  if (!isRecord(data)) return null
  switch (frame.event) {
    case 'thread':
      return typeof data.thread_id === 'string' ? { type: 'thread', thread_id: data.thread_id } : null
    case 'step':
      return isNode(data.node)
        ? { type: 'step', node: data.node, detail: typeof data.detail === 'string' ? data.detail : '' }
        : null
    case 'answer':
      return typeof data.answer === 'string' ? { type: 'answer', payload: normalizeAnswer(data) } : null
    case 'error':
      return { type: 'error', message: typeof data.message === 'string' ? data.message : 'Unknown error' }
    default:
      return null
  }
}

function normalizeAnswer(d: Record<string, unknown>): AnswerPayload {
  const raw = d as Partial<AnswerPayload>
  return {
    answer: String(d.answer ?? ''),
    mode: raw.mode === 'race' || raw.mode === 'rules' ? raw.mode : null,
    race: isRecord(d.race) ? (d.race as unknown as AnswerPayload['race']) : null,
    regs: isRecord(d.regs) ? (d.regs as unknown as AnswerPayload['regs']) : null,
    citations: Array.isArray(d.citations) ? (d.citations as AnswerPayload['citations']) : [],
    tool_calls: Array.isArray(d.tool_calls) ? (d.tool_calls as AnswerPayload['tool_calls']) : [],
    steps: Array.isArray(d.steps) ? (d.steps as string[]) : [],
  }
}
