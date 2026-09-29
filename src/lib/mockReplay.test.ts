import { describe, expect, it } from 'vitest'
import { initialReplayState, parseReplayEvent, replayReducer } from './replay'
import { meetingFromPath, mockReplayScript, mockSessions } from './mockReplay'

describe('mock replay', () => {
  it('lists mock races per season, oldest first', () => {
    const s = mockSessions(2026)
    expect(s.at(-1)?.meeting).toBe('Azerbaijan Grand Prix')
    expect(meetingFromPath(s.at(-1)?.path ?? '')).toBe('Azerbaijan Grand Prix')
  })

  it('scripts a safety car with pit calls, radio + transcript and a clean end', () => {
    const frames = mockReplayScript('Azerbaijan Grand Prix')
    let state = replayReducer(initialReplayState, {
      type: 'start',
      params: { path: 'p', speed: 30, fromLap: null, meeting: 'Azerbaijan Grand Prix' },
    })
    const seenStatus: string[] = []
    for (const f of frames) {
      const e = parseReplayEvent(f.event, JSON.stringify(f.data))
      expect(e, `frame ${f.event} parses`).not.toBeNull()
      if (!e) continue
      state = replayReducer(state, { type: 'event', event: e })
      if (e.type === 'track_status') seenStatus.push(e.status)
    }
    expect(seenStatus).toContain('SAFETY_CAR')
    expect(state.phase).toBe('ended')
    expect(state.pitCalls).toHaveLength(1)
    const calls = state.pitCalls[0].report.calls.map((c) => c.call)
    expect(calls).toContain('PIT')
    expect(calls).toContain('STAY OUT')
    expect(calls).toContain('RETIRED')
    expect(state.radio.find((r) => r.tla === 'NOR')?.text).toBe('Box box, box for hards, safety car.')
    expect(state.raceControl.length).toBeGreaterThanOrEqual(2)
  })
})
