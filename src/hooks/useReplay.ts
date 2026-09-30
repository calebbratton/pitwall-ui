import { useCallback, useEffect, useReducer, useRef, useState } from 'react'
import type { Prediction, ReplayEvent, ReplayParams, ReplayState, ReplayTransport } from '../liveTypes'
import { openReplay } from '../lib/liveApi'
import { openMockReplay } from '../lib/mockReplay'
import { initialReplayState, replayReducer } from '../lib/replay'
import type { MapStore } from '../lib/trackMap'
import { createMapStore } from '../lib/trackMap'

export interface Replay {
  state: ReplayState
  /** track outline + car positions, outside React state so they only re-render the map */
  mapStore: MapStore
  start: (params: ReplayParams) => void
  stop: () => void
  /** add a prediction that came with a chat answer (dropped unless `liveId` is still the current session) */
  addPrediction: (liveId: string, prediction: Prediction) => void
}

/**
 * One replay run at a time. The stream is closed on stop, on a new start, on `end`/`error` and on
 * unmount. `onEvent` (optional) sees every event after it is reduced, e.g. to queue team radio.
 */
export function useReplay(useMock: boolean, onEvent?: (event: ReplayEvent) => void): Replay {
  const [state, dispatch] = useReducer(replayReducer, initialReplayState)
  const [mapStore] = useState(createMapStore)
  const closeRef = useRef<(() => void) | null>(null)
  const onEventRef = useRef(onEvent)
  useEffect(() => {
    onEventRef.current = onEvent
  }, [onEvent])

  const close = useCallback(() => {
    closeRef.current?.()
    closeRef.current = null
  }, [])

  const start = useCallback(
    (params: ReplayParams) => {
      close()
      dispatch({ type: 'start', params })
      mapStore.dispatch({ type: 'reset' })
      const transport: ReplayTransport = useMock ? openMockReplay : openReplay
      let closeThis: (() => void) | null = null
      closeThis = transport(params, (event) => {
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
      })
      closeRef.current = closeThis
    },
    [useMock, close, mapStore],
  )

  const stop = useCallback(() => {
    close()
    dispatch({ type: 'stop' })
  }, [close])

  const addPrediction = useCallback(
    (liveId: string, prediction: Prediction) => dispatch({ type: 'prediction', liveId, prediction }),
    [],
  )

  useEffect(() => close, [close])

  return { state, mapStore, start, stop, addPrediction }
}
