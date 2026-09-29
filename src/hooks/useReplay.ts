import { useCallback, useEffect, useReducer, useRef } from 'react'
import type { ReplayEvent, ReplayParams, ReplayState, ReplayTransport } from '../liveTypes'
import { openReplay } from '../lib/liveApi'
import { openMockReplay } from '../lib/mockReplay'
import { initialReplayState, replayReducer } from '../lib/replay'

export interface Replay {
  state: ReplayState
  start: (params: ReplayParams) => void
  stop: () => void
}

/**
 * One replay run at a time. The stream is closed on stop, on a new start, on `end`/`error` and on
 * unmount. `onEvent` (optional) sees every event after it is reduced, e.g. to queue team radio.
 */
export function useReplay(useMock: boolean, onEvent?: (event: ReplayEvent) => void): Replay {
  const [state, dispatch] = useReducer(replayReducer, initialReplayState)
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
      const transport: ReplayTransport = useMock ? openMockReplay : openReplay
      let closeThis: (() => void) | null = null
      closeThis = transport(params, (event) => {
        dispatch({ type: 'event', event })
        onEventRef.current?.(event)
        if ((event.type === 'end' || event.type === 'error') && closeRef.current === closeThis) {
          closeRef.current?.()
          closeRef.current = null
        }
      })
      closeRef.current = closeThis
    },
    [useMock, close],
  )

  const stop = useCallback(() => {
    close()
    dispatch({ type: 'stop' })
  }, [close])

  useEffect(() => close, [close])

  return { state, start, stop }
}
