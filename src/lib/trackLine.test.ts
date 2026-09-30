import { describe, expect, it } from 'vitest'
import type { TimingRow } from '../liveTypes'
import { battle, drawGap, labelLevels, linePos, trend } from './trackLine'

const row = (tla: string, position: number, gap: number | null, interval: number | null): TimingRow => ({
  position,
  tla,
  number: '1',
  team: '',
  team_colour: '',
  gap,
  laps_down: 0,
  interval,
  compound: null,
  tyre_age: null,
  pit_stops: 0,
  in_pit: false,
  retired: false,
})

describe('track line', () => {
  it('places the leader at the right and wraps gaps longer than a lap', () => {
    expect(linePos(0, 90)).toBe(1)
    expect(linePos(45, 90)).toBe(0.5)
    expect(linePos(135, 90)).toBe(0.5)
    expect(linePos(null, 90)).toBeNull()
  })

  it('treats the leader as gap 0 and skips lapped cars', () => {
    expect(drawGap(row('NOR', 1, null, null))).toBe(0)
    expect(drawGap({ ...row('SAR', 18, null, null), laps_down: 1 })).toBeNull()
  })

  it('finds the cars ahead and behind with their intervals', () => {
    const drivers = [row('NOR', 1, null, null), row('VER', 2, 1.2, 1.2), row('LEC', 3, 2.0, 0.8)]
    expect(battle(drivers, 'VER')).toEqual({ ahead: { tla: 'NOR', gap: 1.2 }, behind: { tla: 'LEC', gap: 0.8 } })
    expect(battle(drivers, 'NOR')?.ahead).toBeNull()
    expect(battle(drivers, 'XXX')).toBeNull()
  })

  it('measures the trend over the last laps', () => {
    const h = [
      { lap: 10, gap: 2.0 },
      { lap: 11, gap: 1.8 },
      { lap: 12, gap: 1.5 },
      { lap: 13, gap: 1.2 },
    ]
    expect(trend(h)).toBe(-0.8)
    expect(trend(h.slice(0, 1))).toBeNull()
  })
})

describe('label placement', () => {
  it('stacks close labels and drops the ones that do not fit', () => {
    const cars = ['A', 'B', 'C', 'D'].map((tla, i) => ({ tla, pos: 0.5 + i * 0.001, priority: false }))
    const levels = labelLevels(cars, 1000)
    expect([...levels.values()]).toEqual([0, 1, 2, null])
    const spread = labelLevels([{ tla: 'X', pos: 0.1, priority: false }, { tla: 'Y', pos: 0.9, priority: false }], 1000)
    expect([...spread.values()]).toEqual([0, 0])
  })

  it('places priority cars first', () => {
    const cars = ['A', 'B', 'C', 'D'].map((tla) => ({ tla, pos: 0.5, priority: tla === 'D' }))
    expect(labelLevels(cars, 1000).get('D')).toBe(0)
    expect(labelLevels(cars, 1000).get('C')).toBeNull()
  })
})
