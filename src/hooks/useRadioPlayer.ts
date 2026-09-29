import { useCallback, useEffect, useReducer, useRef } from 'react'
import type { QueuedClip, RadioQueueState } from '../lib/radioQueue'
import { initialRadioQueue, radioQueueReducer } from '../lib/radioQueue'

export interface RadioPlayer {
  state: RadioQueueState
  /** callback ref for the one <audio> element */
  bindAudio: (el: HTMLAudioElement | null) => void
  enqueue: (clip: QueuedClip) => void
  playNow: (clip: QueuedClip) => void
  skip: () => void
  stop: () => void
  /** retry play() from a click after the browser blocked autoplay */
  unblock: () => void
  /** audio element handlers */
  onEnded: () => void
  onError: () => void
}

/** One <audio> element, one clip at a time; queued clips play in order. */
export function useRadioPlayer(): RadioPlayer {
  const [state, dispatch] = useReducer(radioQueueReducer, initialRadioQueue)
  const audioEl = useRef<HTMLAudioElement | null>(null)
  const bindAudio = useCallback((el: HTMLAudioElement | null) => {
    audioEl.current = el
  }, [])
  const url = state.current?.url ?? null

  useEffect(() => {
    const audio = audioEl.current
    if (!audio) return
    if (!url) {
      audio.pause()
      audio.removeAttribute('src')
      audio.load()
      return
    }
    audio.src = url
    audio.play().then(
      () => dispatch({ type: 'blocked', blocked: false }),
      (err: unknown) => {
        if (err instanceof DOMException && err.name === 'NotAllowedError') dispatch({ type: 'blocked', blocked: true })
        else if (!(err instanceof DOMException && err.name === 'AbortError')) dispatch({ type: 'finished' })
      },
    )
  }, [url])

  const enqueue = useCallback((clip: QueuedClip) => dispatch({ type: 'enqueue', clip }), [])
  const playNow = useCallback((clip: QueuedClip) => dispatch({ type: 'play_now', clip }), [])
  const skip = useCallback(() => dispatch({ type: 'skip' }), [])
  const stop = useCallback(() => dispatch({ type: 'stop' }), [])
  const onEnded = useCallback(() => dispatch({ type: 'finished' }), [])
  const onError = useCallback(() => dispatch({ type: 'finished' }), [])
  const unblock = useCallback(() => {
    audioEl.current?.play().then(
      () => dispatch({ type: 'blocked', blocked: false }),
      () => dispatch({ type: 'blocked', blocked: true }),
    )
  }, [])

  return { state, bindAudio, enqueue, playNow, skip, stop, unblock, onEnded, onError }
}
