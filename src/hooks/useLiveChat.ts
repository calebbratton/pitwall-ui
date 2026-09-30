import { useCallback, useEffect, useReducer, useRef } from 'react'
import type { Prediction, TrackStatus } from '../liveTypes'
import type { AskTransport } from '../lib/liveAsk'
import { askLive } from '../lib/liveAsk'
import type { LiveChatState } from '../lib/liveChat'
import { chatFor, initialLiveChat, liveChatReducer } from '../lib/liveChat'
import { mockAsk } from '../lib/mockAsk'

export interface LiveChat {
  state: LiveChatState
  /** a question can be sent now (a live session is open and nothing is pending) */
  canSend: boolean
  send: (text: string, at: { lap: number | null; status: TrackStatus | null }) => void
  clear: () => void
}

/**
 * Strategy chat for the live session `liveId`. `enabled` is false when no session is running.
 * Predictions that come back with an answer are handed to `onPrediction` (for the WHO WINS panel).
 */
export function useLiveChat(
  liveId: string | null,
  enabled: boolean,
  useMock: boolean,
  onPrediction: (liveId: string, prediction: Prediction) => void,
): LiveChat {
  const [raw, dispatch] = useReducer(liveChatReducer, initialLiveChat)
  const state = chatFor(raw, liveId)
  const ctrlRef = useRef<AbortController | null>(null)
  const onPredictionRef = useRef(onPrediction)
  useEffect(() => {
    onPredictionRef.current = onPrediction
  }, [onPrediction])

  // A new live session (or unmount) cancels the question in flight.
  useEffect(
    () => () => {
      ctrlRef.current?.abort()
      ctrlRef.current = null
    },
    [liveId],
  )

  const canSend = enabled && liveId !== null && !state.pending

  const send = useCallback(
    (text: string, at: { lap: number | null; status: TrackStatus | null }) => {
      const message = text.trim()
      if (!message || !canSend || !liveId || ctrlRef.current) return
      dispatch({ type: 'send', liveId, text: message, at: Date.now(), lap: at.lap, status: at.status })
      const ctrl = new AbortController()
      ctrlRef.current = ctrl
      const transport: AskTransport = useMock ? mockAsk : askLive
      void transport({ live_id: liveId, message }, ctrl.signal).then((res) => {
        if (ctrlRef.current === ctrl) ctrlRef.current = null
        if (res.ok) {
          dispatch({ type: 'answer', liveId, data: res.data, at: Date.now() })
          if (res.data.prediction) onPredictionRef.current(liveId, res.data.prediction)
        } else {
          dispatch({ type: 'fail', liveId, kind: res.kind, message: res.message, at: Date.now() })
        }
      })
    },
    [canSend, liveId, useMock],
  )

  const clear = useCallback(() => dispatch({ type: 'clear' }), [])

  return { state, canSend, send, clear }
}
