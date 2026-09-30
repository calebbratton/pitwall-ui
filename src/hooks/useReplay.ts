import { useCallback, useEffect, useReducer, useRef, useState } from 'react'
import type { Prediction, ReplayEvent, ReplayState, StreamParams } from '../liveTypes'
import { openLiveStream, openReplay } from '../lib/liveApi'
import { openMockLive, openMockReplay } from '../lib/mockReplay'
import { initialReplayState, replayReducer } from '../lib/replay'
import type { MapStore } from '../lib/trackMap'
import { createMapStore } from '../lib/trackMap'

/** No event for this long -> the feed counts as idle. */
export const IDLE_AFTER_MS = 120_000

export interface Replay {
  state: ReplayState
  /** track outline + car positions, outside React state so they only re-render the map */
  mapStore: MapStore
  /** follow a live session or play a test replay (closes whatever was open) */
  start: (params: StreamParams) => void
  stop: () => void
  /** close the stream and clear the screen */
  reset: () => void
  /** add a prediction that came with a chat answer (dropped unless `liveId` is still the current session) */
  addPrediction: (liveId: string, prediction: Prediction) => void
  /** no event arrived for IDLE_AFTER_MS while a stream is open */
  quiet: boolean
}

/**
 * One stream at a time: a live session (GET /api/live/stream) or a test replay (GET /api/live/replay).
 * The stream is closed on stop/reset, on a new start, on `end`/`error` and on unmount. `onEvent`
 * (optional) sees every event after it is reduced, e.g. to queue team radio.
 */
export function useReplay(useMock: boolean, onEvent?: (event: ReplayEvent) => void): Replay {
  const [state, dispatch] = useReducer(replayReducer, initialReplayState)
  const [mapStore] = useState(createMapStore)
  const [quiet, setQuiet] = useState(false)
  const closeRef = useRef<(() => void) | null>(null)
  const lastEventRef = useRef(0)
  const onEventRef = useRef(onEvent)
  useEffect(() => {
    onEventRef.current = onEvent
  }, [onEvent])

  const close = useCallback(() => {
    closeRef.current?.()
    closeRef.current = null
  }, [])

  const start = useCallback(
    (params: StreamParams) => {
      close()
      dispatch({ type: 'start', params })
      mapStore.dispatch({ type: 'reset' })
      lastEventRef.current = Date.now()
      setQuiet(false)
      let closeThis: (() => void) | null = null
      const handle = (event: ReplayEvent) => {
        lastEventRef.current = Date.now()
        setQuiet(false)
        if (event.type === 'track' || event.type === 'positions') {
          mapStore.dispatch({ type: 'event', event })
          return
        }
        dispatch({ type: 'event', event })
        onEventRef.current?.(event)
        if ((event.type === 'end' || event.type === 'error') && closeRef.current === closeThis) {
          closeRef.current?.()
          closeRef.current = null
        }
      }
      if (params.kind === 'live') closeThis = (useMock ? openMockLive : openLiveStream)(params, handle)
      else closeThis = (useMock ? openMockReplay : openReplay)(params, handle)
      closeRef.current = closeThis
    },
    [useMock, close, mapStore],
  )

  const stop = useCallback(() => {
    close()
    dispatch({ type: 'stop' })
  }, [close])

  const reset = useCallback(() => {
    close()
    dispatch({ type: 'reset' })
    mapStore.dispatch({ type: 'reset' })
    setQuiet(false)
  }, [close, mapStore])

  const addPrediction = useCallback(
    (liveId: string, prediction: Prediction) => dispatch({ type: 'prediction', liveId, prediction }),
    [],
  )

  // idle watch: only while a stream is open
  useEffect(() => {
    const t = setInterval(() => {
      if (closeRef.current && Date.now() - lastEventRef.current > IDLE_AFTER_MS) setQuiet(true)
    }, 10_000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => close, [close])

  return { state, mapStore, start, stop, reset, addPrediction, quiet }
}
