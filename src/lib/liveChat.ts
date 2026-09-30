/**
 * Strategy chat about the live session: history, one question at a time. The history belongs to one
 * live_id: a reconnect to the same live session keeps it, a new live_id clears it.
 */
import type { Prediction, TrackStatus } from '../liveTypes'
import type { AskAnswer, AskFailure } from './liveAsk'

export type LiveChatRole = 'user' | 'agent' | 'system'

export interface LiveChatMessage {
  id: number
  role: LiveChatRole
  /** question, markdown answer, or system notice */
  text: string
  at: number
  /** race state: when asked (user) or the state the answer was computed from (agent) */
  lap: number | null
  status: TrackStatus | null
  prediction: Prediction | null
  steps: string[]
  /** system messages only */
  failure: AskFailure | null
}

export interface LiveChatState {
  liveId: string | null
  messages: LiveChatMessage[]
  pending: boolean
  seq: number
}

export const initialLiveChat: LiveChatState = { liveId: null, messages: [], pending: false, seq: 0 }

export type LiveChatAction =
  /** the live session on screen; a different non-null id clears the history */
  | { type: 'session'; liveId: string | null }
  | { type: 'send'; liveId: string; text: string; at: number; lap: number | null; status: TrackStatus | null }
  | { type: 'answer'; liveId: string; data: AskAnswer; at: number }
  | { type: 'fail'; liveId: string; kind: AskFailure; message: string; at: number }
  | { type: 'clear' }

function forSession(state: LiveChatState, liveId: string | null): LiveChatState {
  if (liveId === null || liveId === state.liveId) return state
  return { ...initialLiveChat, liveId, seq: state.seq }
}

function push(state: LiveChatState, m: Omit<LiveChatMessage, 'id'>, pending: boolean): LiveChatState {
  const seq = state.seq + 1
  return { ...state, seq, pending, messages: [...state.messages, { id: seq, ...m }] }
}

const blank: Pick<LiveChatMessage, 'prediction' | 'steps' | 'failure'> = { prediction: null, steps: [], failure: null }

export function liveChatReducer(state: LiveChatState, action: LiveChatAction): LiveChatState {
  switch (action.type) {
    case 'session':
      return forSession(state, action.liveId)
    case 'clear':
      return { ...state, messages: [], pending: false }
    case 'send': {
      const s = forSession(state, action.liveId)
      const text = action.text.trim()
      if (s.pending || !text) return s
      return push(s, { ...blank, role: 'user', text, at: action.at, lap: action.lap, status: action.status }, true)
    }
    case 'answer': {
      // a late answer for a previous live session must not land in this one
      if (action.liveId !== state.liveId || !state.pending) return state
      const d = action.data
      return push(
        state,
        { ...blank, role: 'agent', text: d.answer, at: action.at, lap: d.lap, status: d.status, prediction: d.prediction, steps: d.steps },
        false,
      )
    }
    case 'fail': {
      if (action.liveId !== state.liveId || !state.pending) return state
      if (action.kind === 'aborted') return { ...state, pending: false }
      return push(
        state,
        { ...blank, role: 'system', text: action.message, at: action.at, lap: null, status: null, failure: action.kind },
        false,
      )
    }
  }
}

/** The history to show for `liveId`: nothing from another live session. */
export function chatFor(state: LiveChatState, liveId: string | null): LiveChatState {
  if (liveId === null || state.liveId === null || state.liveId === liveId) return state
  return { ...initialLiveChat, liveId }
}

export const SUGGESTIONS = [
  'Who wins from here?',
  'Can the leader make it to the end on these tyres?',
  'Who should pit under this safety car?',
] as const
