import { useEffect, useRef, useState } from 'react'
import type { StrategyAlert } from '../liveTypes'

const KEY = 'pitwall.notify'
const NOTIFY_KINDS = new Set(['battle', 'sc_call', 'undercut'])

function stored(): boolean {
  try {
    return localStorage.getItem(KEY) === '1'
  } catch {
    return false
  }
}

/**
 * Browser notifications for the alerts worth looking up for (a battle, an SC call, an undercut).
 * Opt-in; each alert notifies once, when it first arrives. localhost is a secure origin, so this
 * works without https.
 */
export function useAlertNotifications(alerts: StrategyAlert[]) {
  const supported = typeof window !== 'undefined' && 'Notification' in window
  const [on, setOn] = useState(() => supported && stored() && Notification.permission === 'granted')
  const seen = useRef<Set<string> | null>(null)

  useEffect(() => {
    // Alerts already on screen when notifications start (catch-up after a reload) stay quiet.
    if (seen.current === null) {
      seen.current = new Set(alerts.map((a) => a.id))
      return
    }
    for (const a of alerts) {
      if (seen.current.has(a.id)) continue
      seen.current.add(a.id)
      if (!on || !NOTIFY_KINDS.has(a.kind)) continue
      try {
        new Notification(a.text ?? a.headline, { body: a.detail, tag: a.id })
      } catch {
        // notification blocked or unsupported in this context
      }
    }
  }, [alerts, on])

  const toggle = async () => {
    if (!supported) return
    let next = !on
    if (next && Notification.permission !== 'granted') {
      next = (await Notification.requestPermission()) === 'granted'
    }
    setOn(next)
    try {
      localStorage.setItem(KEY, next ? '1' : '0')
    } catch {
      // private mode: the choice just isn't remembered
    }
  }

  return { supported, on, toggle }
}
