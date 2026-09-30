/** Run timeline (the pit wall's lap × driver grid): how to colour each lap. */
import type { LapCell } from '../liveTypes'

export type CellKind = 'best' | 'pb' | 'pit' | 'sc' | 'slow' | 'normal' | 'none'

/** A lap this far off the driver's recent green pace is flagged (traffic, a mistake, a problem). */
export const SLOW_S = 1.0

const green = (c: LapCell) => c.time !== null && !c.pit_in && !c.pit_out && !c.neutralised

/** Median of the driver's last `n` green laps before `lap`. */
export function recentPace(laps: Record<number, LapCell>, lap: number, n = 5): number | null {
  const prev = Object.values(laps)
    .filter((c) => c.lap < lap && green(c))
    .sort((a, b) => b.lap - a.lap)
    .slice(0, n)
    .map((c) => c.time as number)
    .sort((a, b) => a - b)
  if (prev.length < 2) return null
  const mid = prev.length >> 1
  return prev.length % 2 ? prev[mid] : (prev[mid - 1] + prev[mid]) / 2
}

export function classify(cell: LapCell | undefined, pace: number | null): CellKind {
  if (!cell || cell.time === null) return cell && (cell.pit_in || cell.pit_out) ? 'pit' : 'none'
  if (cell.pit_in || cell.pit_out) return 'pit'
  if (cell.neutralised) return 'sc'
  if (cell.overall_best) return 'best'
  if (cell.personal_best) return 'pb'
  if (pace !== null && cell.time > pace + SLOW_S) return 'slow'
  return 'normal'
}

/** 104.916 -> "1:44.9" */
export function fmtLap(s: number | null): string {
  if (s === null) return ''
  const m = Math.floor(s / 60)
  const rest = (s - m * 60).toFixed(1).padStart(4, '0')
  return m ? `${m}:${rest}` : rest
}
