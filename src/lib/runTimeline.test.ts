import { describe, expect, it } from 'vitest'
import type { LapCell } from '../liveTypes'
import { classify, fmtLap, recentPace } from './runTimeline'

const cell = (lap: number, time: number | null, extra: Partial<LapCell> = {}): LapCell => ({
  lap,
  time,
  compound: 'MEDIUM',
  tyre_age: lap,
  pit_in: false,
  pit_out: false,
  neutralised: false,
  personal_best: false,
  overall_best: false,
  ...extra,
})

describe('run timeline', () => {
  it('uses the median of recent green laps, skipping pit and SC laps', () => {
    const laps = {
      1: cell(1, 100),
      2: cell(2, 101),
      3: cell(3, 130, { neutralised: true }),
      4: cell(4, 120, { pit_in: true }),
      5: cell(5, 102),
    }
    expect(recentPace(laps, 6)).toBe(101)
    expect(recentPace(laps, 2)).toBeNull()
  })

  it('classifies laps like the pit wall', () => {
    expect(classify(cell(5, 100, { overall_best: true, personal_best: true }), 101)).toBe('best')
    expect(classify(cell(5, 100, { personal_best: true }), 101)).toBe('pb')
    expect(classify(cell(5, 120, { pit_out: true }), 101)).toBe('pit')
    expect(classify(cell(5, 130, { neutralised: true }), 101)).toBe('sc')
    expect(classify(cell(5, 102.5), 101)).toBe('slow')
    expect(classify(cell(5, 101.5), 101)).toBe('normal')
    expect(classify(undefined, 101)).toBe('none')
  })

  it('formats lap times compactly', () => {
    expect(fmtLap(104.916)).toBe('1:44.9')
    expect(fmtLap(59.04)).toBe('59.0')
    expect(fmtLap(61.05)).toBe('1:01.0')
    expect(fmtLap(null)).toBe('')
  })
})
