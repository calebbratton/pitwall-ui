/** "Your call": at a SC/VSC the viewer calls PIT / STAY OUT for their driver before seeing the
 * engine's call, then sees what the team did. Pure logic; the hook keeps it in state. */
import type { PitCallSet, Snapshot } from '../liveTypes'

export type Call = 'PIT' | 'STAY OUT'

export interface Round {
  id: number // the pit-call set it came from
  lap: number | null
  status: string
  tla: string
  /** the engine's call for this driver, and why */
  engine: Call | null
  reason: string
  /** the driver's pit stops when the call was made, to see if the team pitted */
  stopsAtStart: number
  choice: Call | null
  team: Call | null
}

export interface Tally {
  rounds: number
  youMatched: number
  engineMatched: number
}

export const EMPTY_TALLY: Tally = { rounds: 0, youMatched: 0, engineMatched: 0 }

/** A new round for the followed driver from a pit-call set, or null if they have no call. */
export function startRound(set: PitCallSet, tla: string, snapshot: Snapshot | null): Round | null {
  const call = set.report.calls.find((c) => c.tla === tla)
  if (!call || (call.call !== 'PIT' && call.call !== 'STAY OUT')) return null
  const row = snapshot?.drivers.find((d) => d.tla === tla)
  return {
    id: set.id,
    lap: set.report.lap,
    status: set.report.track_status,
    tla,
    engine: call.call,
    reason: call.reason,
    stopsAtStart: row?.pit_stops ?? 0,
    choice: null,
    team: null,
  }
}

/** What the team did: a stop within two laps of the call = PIT, else STAY OUT once two laps pass. */
export function teamDecision(round: Round, snapshot: Snapshot | null): Call | null {
  const row = snapshot?.drivers.find((d) => d.tla === round.tla)
  if (!row || snapshot?.lap == null || round.lap == null) return null
  if (row.pit_stops > round.stopsAtStart || row.in_pit) return 'PIT'
  return snapshot.lap >= round.lap + 2 ? 'STAY OUT' : null
}

export function addToTally(t: Tally, r: Round): Tally {
  if (!r.team) return t
  return {
    rounds: t.rounds + 1,
    youMatched: t.youMatched + (r.choice === r.team ? 1 : 0),
    engineMatched: t.engineMatched + (r.engine === r.team ? 1 : 0),
  }
}
