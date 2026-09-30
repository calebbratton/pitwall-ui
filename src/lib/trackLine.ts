/** Track line: the field on one lap-long line by gap to the leader, and battle trends. */
import type { RejoinRow, TimingRow } from '../liveTypes'

/** Fallback lap time before the backend has a clean green lap to measure. */
export const DEFAULT_LAP_S = 90

/**
 * Position along the line, 0..1, with the leader at 1 (cars race to the right).
 * A car `gap` seconds behind the leader is `gap / lapTime` of a lap back, wrapping for gaps
 * longer than a lap. Null when the gap is unknown (lapped or no timing yet).
 */
export function linePos(gap: number | null, lapTime: number): number | null {
  if (gap === null || !(lapTime > 0)) return null
  const frac = (gap % lapTime) / lapTime
  return 1 - frac
}

/** Gap to the leader for drawing: the leader has no gap in the feed. */
export function drawGap(d: TimingRow): number | null {
  if (d.retired || d.laps_down > 0) return null
  if (d.position === 1) return 0
  return d.gap
}

export interface Battle {
  ahead: { tla: string; gap: number | null } | null
  behind: { tla: string; gap: number | null } | null
}

/** The followed car's neighbours in the running order, with the intervals between them. */
export function battle(drivers: TimingRow[], tla: string): Battle | null {
  const running = drivers
    .flatMap((d) => (d.retired || d.position === null ? [] : [{ ...d, position: d.position }]))
    .sort((a, b) => a.position - b.position)
  const i = running.findIndex((d) => d.tla === tla)
  if (i < 0) return null
  const me = running[i]
  const next = running[i + 1]
  return {
    ahead: i > 0 ? { tla: running[i - 1].tla, gap: me.interval } : null,
    behind: next ? { tla: next.tla, gap: next.interval } : null,
  }
}

/** Change in an interval over the laps recorded (negative = closing). Null without two samples. */
export function trend(history: { lap: number; gap: number | null }[], laps = 3): number | null {
  const valid = history.flatMap((h) => (h.gap === null ? [] : [{ lap: h.lap, gap: h.gap }]))
  if (valid.length < 2) return null
  const last = valid[valid.length - 1]
  const first = valid.find((h) => h.lap >= last.lap - laps) ?? valid[0]
  if (first === last) return null
  return Math.round((last.gap - first.gap) * 10) / 10
}

export const REJOIN_LABEL: Record<RejoinRow['kind'], string> = { green: 'Green', sc: 'SC', vsc: 'VSC' }
