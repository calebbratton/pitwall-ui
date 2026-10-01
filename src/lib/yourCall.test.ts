import { describe, expect, it } from 'vitest'
import type { PitCallSet, Snapshot, TimingRow } from '../liveTypes'
import { addToTally, EMPTY_TALLY, startRound, teamDecision } from './yourCall'

const row = (tla: string, pit_stops: number, in_pit = false): TimingRow => ({
  position: 1, tla, number: '4', team: '', team_colour: '', gap: null, laps_down: 0, interval: null,
  compound: 'MEDIUM', tyre_age: 20, pit_stops, in_pit, retired: false,
})
const snap = (lap: number, rows: TimingRow[]): Snapshot => ({ lap, total_laps: 50, status: 'SAFETY_CAR', clock: null, drivers: rows })
const set: PitCallSet = {
  id: 7,
  report: {
    track_status: 'SAFETY_CAR', lap: 30, laps_remaining: 20, green_pit_loss_s: 22, pit_loss_now_s: 13,
    calls: [{ tla: 'NOR', position: 1, call: 'PIT', reason: 'free stop', places_at_risk: 0, compound: 'MEDIUM', tyre_age_laps: 20 }],
    assumptions: [],
  },
}

describe('your call', () => {
  it('starts a round for the followed driver only', () => {
    const r = startRound(set, 'NOR', snap(30, [row('NOR', 0)]))
    expect(r).toMatchObject({ tla: 'NOR', engine: 'PIT', stopsAtStart: 0, choice: null })
    expect(startRound(set, 'VER', null)).toBeNull()
  })

  it('reads the team decision from the timing', () => {
    const r = startRound(set, 'NOR', snap(30, [row('NOR', 0)]))
    if (!r) throw new Error('no round')
    expect(teamDecision(r, snap(30, [row('NOR', 0)]))).toBeNull()
    expect(teamDecision(r, snap(31, [row('NOR', 0, true)]))).toBe('PIT')
    expect(teamDecision(r, snap(32, [row('NOR', 0)]))).toBe('STAY OUT')
  })

  it('tallies you and the engine against the team', () => {
    const start = startRound(set, 'NOR', null)
    if (!start) throw new Error('no round')
    const r = { ...start, choice: 'STAY OUT' as const, team: 'PIT' as const }
    expect(addToTally(EMPTY_TALLY, r)).toEqual({ rounds: 1, youMatched: 0, engineMatched: 1 })
  })
})
