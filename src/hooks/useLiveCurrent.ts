import { useCallback, useEffect, useState } from 'react'
import type { LiveCurrent } from '../liveTypes'
import type { CurrentResult } from '../lib/liveApi'
import { CURRENT_POLL_MS, fetchCurrent, pollCurrent, startLiveFeed } from '../lib/liveApi'
import { fetchMockCurrent, startMockFeed } from '../lib/mockReplay'

export interface LiveCurrentState {
  /** loading: first answer pending; live: a live session exists; none: 404; error: backend unreachable */
  status: 'loading' | 'live' | 'none' | 'error'
  current: LiveCurrent | null
  /** 404 detail or error message */
  message: string | null
  starting: boolean
  /** POST /api/live/start (local dev tool), then use its answer */
  startFeed: () => void
}

function toState(r: CurrentResult): Pick<LiveCurrentState, 'status' | 'current' | 'message'> {
  switch (r.kind) {
    case 'live':
      return { status: 'live', current: r.current, message: null }
    case 'none':
      return { status: 'none', current: null, message: r.detail }
    case 'error':
      return { status: 'error', current: null, message: r.message }
  }
}

/** GET /api/live/current now and every 30 s while `active` (the LIVE tab is on screen). */
export function useLiveCurrent(useMock: boolean, active: boolean): LiveCurrentState {
  const [s, setS] = useState<Pick<LiveCurrentState, 'status' | 'current' | 'message'>>({
    status: 'loading',
    current: null,
    message: null,
  })
  const [starting, setStarting] = useState(false)

  useEffect(() => {
    if (!active) return
    return pollCurrent(useMock ? fetchMockCurrent : fetchCurrent, (r) => setS(toState(r)), CURRENT_POLL_MS)
  }, [active, useMock])

  const startFeed = useCallback(() => {
    setStarting(true)
    void (useMock ? startMockFeed : startLiveFeed)().then((r) => {
      setStarting(false)
      setS(toState(r))
    })
  }, [useMock])

  return { ...s, starting, startFeed }
}
