import { useCallback, useState } from 'react'
import { loadFollow, saveFollow } from '../lib/radioQueue'

/** The followed driver (TLA) for a session path, persisted per path in localStorage. */
export function useFollow(path: string | null): [string | null, (tla: string | null) => void] {
  const [state, setState] = useState<{ path: string | null; tla: string | null }>(() => ({
    path,
    tla: path ? loadFollow(path) : null,
  }))
  let current = state
  if (state.path !== path) {
    current = { path, tla: path ? loadFollow(path) : null }
    setState(current)
  }
  const set = useCallback(
    (tla: string | null) => {
      if (path) saveFollow(path, tla)
      setState({ path, tla })
    },
    [path],
  )
  return [current.tla, set]
}
