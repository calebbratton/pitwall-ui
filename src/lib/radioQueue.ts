/**
 * Team radio playback for the one followed driver: a single-player queue (never overlapping).
 * The transcript feed itself is never filtered; only audio auto-play is limited to the followed driver.
 */
import type { ReplayEvent } from '../liveTypes'

export interface QueuedClip {
  url: string
  tla: string
}

export interface RadioQueueState {
  /** the clip loaded in the one audio element, if any */
  current: QueuedClip | null
  /** waiting to play, oldest first */
  queue: QueuedClip[]
  /** the browser refused play() (autoplay policy); needs a click */
  blocked: boolean
}

export const initialRadioQueue: RadioQueueState = { current: null, queue: [], blocked: false }

export type RadioQueueAction =
  | { type: 'enqueue'; clip: QueuedClip }
  | { type: 'play_now'; clip: QueuedClip }
  | { type: 'finished' }
  | { type: 'skip' }
  | { type: 'stop' }
  | { type: 'blocked'; blocked: boolean }

export function radioQueueReducer(state: RadioQueueState, action: RadioQueueAction): RadioQueueState {
  switch (action.type) {
    case 'enqueue': {
      const { clip } = action
      if (state.current?.url === clip.url || state.queue.some((q) => q.url === clip.url)) return state
      return state.current ? { ...state, queue: [...state.queue, clip] } : { ...state, current: clip }
    }
    case 'play_now':
      return { ...state, current: action.clip, queue: state.queue.filter((q) => q.url !== action.clip.url), blocked: false }
    case 'finished':
    case 'skip': {
      const [next = null, ...rest] = state.queue
      return { ...state, current: next, queue: rest }
    }
    case 'stop':
      return { ...initialRadioQueue }
    case 'blocked':
      return state.blocked === action.blocked ? state : { ...state, blocked: action.blocked }
  }
}

/** A new radio clip is auto-queued only when auto-play is on and it is the followed driver's. */
export function shouldAutoQueue(event: ReplayEvent, follow: string | null, autoplay: boolean): boolean {
  return autoplay && follow !== null && event.type === 'radio' && event.tla === follow
}

// ---------- follow persistence (per session path) ----------

const KEY = (path: string) => `pitwall-ui:follow:${path}`

export function loadFollow(path: string): string | null {
  try {
    return window.localStorage.getItem(KEY(path))
  } catch {
    return null
  }
}

export function saveFollow(path: string, tla: string | null): void {
  try {
    if (tla) window.localStorage.setItem(KEY(path), tla)
    else window.localStorage.removeItem(KEY(path))
  } catch {
    /* storage unavailable (private mode, blocked): following still works for this visit */
  }
}
