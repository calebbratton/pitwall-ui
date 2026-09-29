import { useCallback, useRef, useState } from 'react'
import { streamChat } from '../lib/api'
import type { ChatTransport } from '../lib/events'
import { mockStreamChat } from '../lib/mock'
import type { RunPhase } from '../lib/pipeline'
import type { AnswerPayload, ChatMessage, RaceInfo, RegsInfo, StepPayload } from '../types'

export interface SessionInfo {
  race: RaceInfo | null
  regs: RegsInfo | null
  mode: AnswerPayload['mode']
  steps: StepPayload[]
  phase: RunPhase
  answer: AnswerPayload | null
}

const EMPTY_SESSION: SessionInfo = { race: null, regs: null, mode: null, steps: [], phase: 'idle', answer: null }

let counter = 0
const uid = (p: string) => `${p}-${Date.now().toString(36)}-${(counter++).toString(36)}`

export interface Chat {
  messages: ChatMessage[]
  threadId: string | null
  streaming: boolean
  session: SessionInfo
  send: (text: string) => void
  reset: () => void
}

export function useChat(useMock: boolean, onNetworkError?: () => void): Chat {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [threadId, setThreadId] = useState<string | null>(null)
  const [streaming, setStreaming] = useState(false)
  const [session, setSession] = useState<SessionInfo>(EMPTY_SESSION)
  const threadRef = useRef<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const patch = useCallback((id: string, fn: (m: ChatMessage) => ChatMessage) => {
    setMessages((ms) => ms.map((m) => (m.id === id ? fn(m) : m)))
  }, [])

  const send = useCallback(
    (raw: string) => {
      const text = raw.trim()
      if (!text || abortRef.current) return
      const transport: ChatTransport = useMock ? mockStreamChat : streamChat
      const ctrl = new AbortController()
      abortRef.current = ctrl
      const agentId = uid('agent')
      const now = Date.now()
      setMessages((ms) => [
        ...ms,
        { id: uid('user'), role: 'user', text, status: 'done', steps: [], at: now },
        { id: agentId, role: 'agent', text: '', status: 'streaming', steps: [], at: now },
      ])
      setStreaming(true)
      setSession((s) => ({ ...s, steps: [], phase: 'streaming', answer: null }))

      let finished = false
      const fail = (message: string) => {
        finished = true
        patch(agentId, (m) => ({ ...m, status: 'error', error: message }))
        setSession((s) => ({ ...s, phase: 'error' }))
      }

      transport(
        { thread_id: threadRef.current, message: text },
        (ev) => {
          if (ctrl.signal.aborted) return
          switch (ev.type) {
            case 'thread':
              threadRef.current = ev.thread_id
              setThreadId(ev.thread_id)
              break
            case 'step': {
              const step = { node: ev.node, detail: ev.detail }
              patch(agentId, (m) => ({ ...m, steps: [...m.steps, step] }))
              setSession((s) => ({ ...s, steps: [...s.steps, step] }))
              break
            }
            case 'answer': {
              finished = true
              const a = ev.payload
              patch(agentId, (m) => ({ ...m, status: 'done', text: a.answer, answer: a }))
              setSession((s) => ({
                race: a.race ?? (a.mode === 'rules' ? s.race : null),
                regs: a.regs ?? s.regs,
                mode: a.mode,
                steps: s.steps,
                phase: 'done',
                answer: a,
              }))
              break
            }
            case 'error':
              fail(ev.message)
              break
          }
        },
        ctrl.signal,
      )
        .then(() => {
          if (!finished && !ctrl.signal.aborted) fail('Stream ended before an answer arrived.')
        })
        .catch((err: unknown) => {
          if (ctrl.signal.aborted) return
          const network = err instanceof TypeError
          if (network) onNetworkError?.()
          const msg = err instanceof Error ? err.message : String(err)
          fail(network ? `Could not reach the API (${msg}). Switch to mock mode or start the backend.` : msg)
        })
        .finally(() => {
          if (abortRef.current === ctrl) abortRef.current = null
          if (!ctrl.signal.aborted) setStreaming(false)
        })
    },
    [useMock, onNetworkError, patch],
  )

  const reset = useCallback(() => {
    abortRef.current?.abort()
    abortRef.current = null
    threadRef.current = null
    setThreadId(null)
    setMessages([])
    setStreaming(false)
    setSession(EMPTY_SESSION)
  }, [])

  return { messages, threadId, streaming, session, send, reset }
}
