import { describe, expect, it } from 'vitest'
import { initialReplayState, parseReplayEvent, replayReducer } from './replay'
import { meetingFromPath, mockPositions, mockReplayScript, mockSessions } from './mockReplay'
import { initialMapState, mapReducer } from './trackMap'
import { dropMockLive, mockAsk, mockPrediction, registerMockLive, updateMockLive } from './mockAsk'
import type { Snapshot } from '../liveTypes'

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
    expect(state.yellowSectors).toEqual({}) // sector 2 went yellow and was cleared
    expect(frames[0].event).toBe('live')
    expect(state.liveId).toBe('mock-live')
    expect(state.liveSource).toBe('replay')
    expect(state.predictions).toHaveLength(1)
    const p = state.predictions[0].prediction
    expect(p).toMatchObject({ lap: 31, laps_remaining: 20, status: 'SAFETY_CAR', sims: 2000 })
    expect(p.table.map((r) => r.position)).toEqual([...p.table.keys()].map((i) => i + 1)) // running order
    expect(p.table.some((r) => r.tla === 'ALO')).toBe(false) // retired cars are left out
    expect(p.table.reduce((a, r) => a + r.p_win, 0)).toBeCloseTo(1, 2)
    expect(p.table[0].compound_c).toBe('C4')
    expect(new Set(p.table.map((r) => r.tyre_risk))).toEqual(new Set(['high', 'medium', 'low']))
  })

  it('has a track and moving cars (with one no-fix car ignored)', () => {
    const track = mockReplayScript('X').find((f) => f.event === 'track')
    const t = track && parseReplayEvent('track', JSON.stringify(track.data))
    expect(t?.type === 'track' && t.marshal_sectors.length).toBe(10)
    const at = (ms: number) => {
      const e = parseReplayEvent('positions', JSON.stringify(mockPositions(ms, 3500)))
      return e ? mapReducer(initialMapState, { type: 'event', event: e }) : initialMapState
    }
    const a = at(0)
    const b = at(250)
    expect(Object.keys(a.cars)).toHaveLength(20)
    expect(a.cars.NOF).toBeUndefined()
    expect(b.cars.RUS.x !== a.cars.RUS.x || b.cars.RUS.y !== a.cars.RUS.y).toBe(true)
  })
})

describe('mock /api/live/ask', () => {
  const snapshotAt = (lap: number): Snapshot => {
    const f = mockReplayScript('X').find((fr) => fr.event === 'snapshot')
    const e = f && parseReplayEvent('snapshot', JSON.stringify(f.data))
    if (e?.type !== 'snapshot') throw new Error('snapshot')
    const { type: _t, ...snap } = e
    void _t
    return { ...snap, lap }
  }

  it('answers with 404 for unknown sessions and 409 before timing flows', async () => {
    expect(await mockAsk({ live_id: 'nope', message: 'Who wins from here?' })).toMatchObject({ ok: false, kind: 'gone' })
    registerMockLive('T1')
    expect(await mockAsk({ live_id: 'T1', message: 'Who wins from here?' })).toMatchObject({ ok: false, kind: 'early' })
    dropMockLive('T1')
  })

  it('answers the three suggestion shapes from the live state, with a prediction', async () => {
    registerMockLive('T2')
    updateMockLive('T2', { snapshot: snapshotAt(31), status: 'SAFETY_CAR' })
    const win = await mockAsk({ live_id: 'T2', message: 'Who wins from here?' })
    expect(win.ok).toBe(true)
    if (!win.ok) return
    expect(win.data).toMatchObject({ lap: 31, status: 'SAFETY_CAR' })
    expect(win.data.answer).toMatch(/favourite/)
    expect(win.data.prediction?.table.length).toBeGreaterThan(10)
    const tyres = await mockAsk({ live_id: 'T2', message: 'Can LEC make it to the end on these tyres?' })
    expect(tyres.ok && tyres.data.answer).toMatch(/\*\*LEC\*\*/)
    const pit = await mockAsk({ live_id: 'T2', message: 'Who should pit under this safety car?' })
    expect(pit.ok && pit.data.answer).toMatch(/should box/)
    dropMockLive('T2')
  })

  it('is deterministic', () => {
    const rows = snapshotAt(31).drivers
    expect(mockPrediction(rows, 31, 51, 'SAFETY_CAR')).toEqual(mockPrediction(rows, 31, 51, 'SAFETY_CAR'))
  })
})
