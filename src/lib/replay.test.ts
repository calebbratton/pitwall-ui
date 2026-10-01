import { describe, expect, it } from 'vitest'
import type { ReplayEvent, ReplayParams, ReplayState, TimingRow } from '../liveTypes'
import {
  applySectorFlag,
  feedFinished,
  filterRaceControl,
  formatGap,
  formatInterval,
  initialReplayState,
  isNoise,
  isTimedSession,
  parseReplayEvent,
  replayReducer,
} from './replay'

const params: ReplayParams = { path: '2026/x/y/', speed: 60, fromLap: 29, meeting: 'Azerbaijan Grand Prix' }

/** Parse (name, object) pairs through the wire parser, then reduce them from a fresh start. */
function run(frames: [string, Record<string, unknown>][], from?: ReplayState): ReplayState {
  let state = from ?? replayReducer(initialReplayState, { type: 'start', params })
  for (const [name, data] of frames) {
    const event = parseReplayEvent(name, JSON.stringify({ type: name, ...data }))
    if (event) state = replayReducer(state, { type: 'event', event })
  }
  return state
}

const driver = (o: Record<string, unknown>) => ({
  position: 1, tla: 'RUS', number: '63', team: 'Mercedes', gap: 0, laps_down: 0, interval: null,
  compound: 'MEDIUM', tyre_age: 30, pit_stops: 0, in_pit: false, retired: false, ...o,
})

const report = (status: string, lap: number, calls: Record<string, unknown>[] = []) => ({
  report: {
    track_status: status, lap, laps_remaining: 51 - lap, green_pit_loss_s: 16.8, pit_loss_now_s: 8.4,
    calls, assumptions: ['Places at risk assumes the cars behind stay out.'],
  },
})

describe('parseReplayEvent', () => {
  it('normalises snapshots and unknown values', () => {
    const e = parseReplayEvent(
      'snapshot',
      JSON.stringify({ lap: 31, total_laps: 51, status: 'WEIRD', clock: null, drivers: [driver({ compound: 'TEST', gap: null })] }),
    )
    expect(e?.type).toBe('snapshot')
    if (e?.type !== 'snapshot') return
    expect(e.status).toBe('UNKNOWN')
    expect(e.drivers[0].compound).toBeNull()
    expect(e.drivers[0].gap).toBeNull()
  })

  it('returns null for malformed frames, but keeps error text', () => {
    expect(parseReplayEvent('snapshot', 'not json')).toBeNull()
    expect(parseReplayEvent('nope', '{}')).toBeNull()
    expect(parseReplayEvent('radio', '{"tla":"NOR"}')).toBeNull()
    expect(parseReplayEvent('error', 'boom')).toEqual({ type: 'error', message: 'boom' })
    expect(parseReplayEvent('end', '{}')).toEqual({ type: 'end' })
  })
})

describe('replayReducer', () => {
  it('builds state from a sequence of events', () => {
    const s = run([
      ['session', { meeting: 'Azerbaijan Grand Prix', session: 'Race', total_laps: 51 }],
      ['snapshot', { lap: 30, total_laps: 51, status: 'GREEN', clock: '1:49:01.380000', drivers: [driver({})] }],
      ['track_status', { status: 'SAFETY_CAR', lap: 31 }],
      ['race_control', { lap: 31, category: 'SafetyCar', message: 'SAFETY CAR DEPLOYED' }],
      ['race_control', { lap: 31, category: 'Other', message: 'PIT EXIT OPEN' }],
      ['radio', { driver: '4', tla: 'NOR', utc: '2026-09-26T12:03:20.168Z', url: 'https://x/NOR.mp3', text: null }],
    ])
    expect(s.phase).toBe('running')
    expect(s.session).toEqual({ meeting: 'Azerbaijan Grand Prix', session: 'Race', total_laps: 51 })
    expect(s.snapshot?.lap).toBe(30)
    expect(s.trackStatus).toBe('SAFETY_CAR')
    expect(s.raceControl.map((m) => m.message)).toEqual(['PIT EXIT OPEN', 'SAFETY CAR DEPLOYED']) // newest first
    expect(s.radio).toHaveLength(1)
    expect(s.radio[0]).toMatchObject({ tla: 'NOR', lap: 30, text: null })
  })

  it('keeps every pit_calls set in arrival order', () => {
    const s = run([
      ['track_status', { status: 'SAFETY_CAR', lap: 31 }],
      ['pit_calls', report('SAFETY_CAR', 31, [{ tla: 'RUS', position: 1, call: 'PIT', reason: 'r', places_at_risk: 0, compound: 'MEDIUM', tyre_age_laps: 32 }])],
      ['track_status', { status: 'GREEN', lap: 35 }],
      ['track_status', { status: 'VSC', lap: 36 }],
      ['pit_calls', report('VSC', 36)],
    ])
    expect(s.pitCalls.map((p) => [p.report.track_status, p.report.lap])).toEqual([
      ['SAFETY_CAR', 31],
      ['VSC', 36],
    ])
    expect(new Set(s.pitCalls.map((p) => p.id)).size).toBe(2)
    expect(s.pitCalls[0].report.calls[0]).toMatchObject({ tla: 'RUS', call: 'PIT', tyre_age_laps: 32 })
    expect(s.trackStatus).toBe('VSC')
  })

  it('handles end and ignores events afterwards', () => {
    const ended = run([['snapshot', { lap: 51, total_laps: 51, status: 'GREEN', drivers: [] }], ['end', {}]])
    expect(ended.phase).toBe('ended')
    const after = run([['race_control', { lap: 51, category: 'Flag', message: 'CHEQUERED FLAG' }]], ended)
    expect(after).toBe(ended)
  })

  it('handles error events and keeps what was shown', () => {
    const s = run([
      ['snapshot', { lap: 12, total_laps: 51, status: 'GREEN', drivers: [driver({})] }],
      ['error', { message: 'FileNotFoundError: no archive' }],
    ])
    expect(s.phase).toBe('error')
    expect(s.error).toBe('FileNotFoundError: no archive')
    expect(s.snapshot?.lap).toBe(12)
  })

  it('stop freezes the run; start resets everything', () => {
    let s = run([['race_control', { lap: 3, category: 'Flag', message: 'GREEN LIGHT' }]])
    s = replayReducer(s, { type: 'stop' })
    expect(s.phase).toBe('stopped')
    const ev: ReplayEvent = { type: 'track_status', status: 'RED_FLAG', lap: 4 }
    expect(replayReducer(s, { type: 'event', event: ev })).toBe(s)
    const restarted = replayReducer(s, { type: 'start', params })
    expect(restarted.phase).toBe('connecting')
    expect(restarted.raceControl).toEqual([])
  })

  it('fills radio transcripts by url and tracks the latest non-empty one', () => {
    const s = run([
      ['radio', { driver: '4', tla: 'NOR', utc: null, url: 'u1', text: null }],
      ['radio', { driver: '63', tla: 'RUS', utc: null, url: 'u2', text: 'Copy, box this lap.' }],
      ['radio', { driver: '63', tla: 'RUS', utc: null, url: 'u2', text: 'duplicate' }],
    ])
    expect(s.radio.map((r) => r.url)).toEqual(['u2', 'u1'])
    const rus = s.radio[0].id
    expect(s.latestTranscriptId).toBe(rus)

    const filled = run([['radio_transcript', { url: 'u1', tla: 'NOR', text: 'Box box, box for hards, safety car.' }]], s)
    const nor = filled.radio.find((r) => r.url === 'u1')
    expect(nor?.text).toBe('Box box, box for hards, safety car.')
    expect(filled.latestTranscriptId).toBe(nor?.id)

    const silent = run([['radio_transcript', { url: 'u2', tla: 'RUS', text: '' }]], filled)
    expect(silent.radio.find((r) => r.url === 'u2')?.text).toBe('')
    expect(silent.latestTranscriptId).toBe(nor?.id) // empty transcript does not take the ticker

    expect(run([['radio_transcript', { url: 'nope', tla: 'X', text: 'hi' }]], silent)).toEqual(silent)
  })
})

describe('marshal sector yellows', () => {
  it('sets yellow / double yellow and clears on CLEAR IN TRACK SECTOR', () => {
    let s = applySectorFlag({}, 'YELLOW IN TRACK SECTOR 7')
    expect(s).toEqual({ 7: false })
    s = applySectorFlag(s, 'DOUBLE YELLOW IN TRACK SECTOR 12')
    expect(s).toEqual({ 7: false, 12: true })
    s = applySectorFlag(s, 'CLEAR IN TRACK SECTOR 7')
    expect(s).toEqual({ 12: true })
    const same = applySectorFlag(s, 'SAFETY CAR DEPLOYED')
    expect(same).toBe(s)
    expect(applySectorFlag(s, 'CLEAR IN TRACK SECTOR 3')).toBe(s)
  })

  it('follows race control through the reducer and resets on a new replay', () => {
    const s = run([
      ['race_control', { lap: 30, category: 'Flag', message: 'YELLOW IN TRACK SECTOR 2' }],
      ['race_control', { lap: 30, category: 'Flag', message: 'DOUBLE YELLOW IN TRACK SECTOR 4' }],
      ['race_control', { lap: 30, category: 'Flag', message: 'CLEAR IN TRACK SECTOR 2' }],
    ])
    expect(s.yellowSectors).toEqual({ 4: true })
    expect(replayReducer(s, { type: 'start', params }).yellowSectors).toEqual({})
  })

  it('leaves the main state untouched on map events (no tower re-render)', () => {
    const s = run([['snapshot', { lap: 3, total_laps: 51, status: 'GREEN', drivers: [] }]])
    const ev = parseReplayEvent('positions', JSON.stringify({ utc: 'u', cars: [{ tla: 'NOR', x: 1, y: 2 }] }))
    if (!ev) throw new Error('parse')
    expect(replayReducer(s, { type: 'event', event: ev })).toBe(s)
  })
})

describe('race control noise filter', () => {
  it('flags routine marshalling messages', () => {
    expect(isNoise('WAVED BLUE FLAG FOR CAR 77 (BOT) TIMED AT 15:55:59')).toBe(true)
    expect(isNoise('CLEAR IN TRACK SECTOR 1')).toBe(true)
    expect(isNoise('YELLOW IN TRACK SECTOR 2')).toBe(true)
    expect(isNoise('CAR 11 (PER) TIME 1:47.311 DELETED - TRACK LIMITS AT TURN 16 LAP 29 15:57:41')).toBe(true)
    expect(isNoise('SAFETY CAR DEPLOYED')).toBe(false)
    expect(isNoise('DOUBLE YELLOW IN TRACK SECTOR 2')).toBe(true)
    expect(isNoise('FIA STEWARDS: 5 SECOND TIME PENALTY FOR CAR 18 (STR)')).toBe(false)
  })

  it('hides noise unless show all', () => {
    const items = [
      { id: 2, lap: 31, category: 'SafetyCar', message: 'SAFETY CAR DEPLOYED' },
      { id: 1, lap: 30, category: 'Flag', message: 'WAVED BLUE FLAG FOR CAR 77 (BOT)' },
    ]
    expect(filterRaceControl(items, false).map((i) => i.id)).toEqual([2])
    expect(filterRaceControl(items, true)).toBe(items)
  })
})

describe('timing formatters', () => {
  const d = (o: Record<string, unknown>) => parseReplayEvent('snapshot', JSON.stringify({ drivers: [driver(o)] }))
  const row = (o: Record<string, unknown>) => {
    const e = d(o)
    if (e?.type !== 'snapshot') throw new Error('bad')
    return e.drivers[0]
  }
  it('formats gap and interval like a timing screen', () => {
    expect(formatGap(row({ position: 1 }))).toBe('LEADER')
    expect(formatInterval(row({ position: 1 }))).toBe('')
    expect(formatGap(row({ position: 2, gap: 10.896 }))).toBe('+10.896')
    expect(formatInterval(row({ position: 2, interval: 1.5 }))).toBe('+1.500')
    expect(formatGap(row({ position: 19, laps_down: 1, gap: 110 }))).toBe('+1L')
    expect(formatGap(row({ position: 21, retired: true }))).toBe('OUT')
    expect(formatGap(row({ position: 5, gap: null }))).toBe('—')
  })
})

const predRow = (o: Record<string, unknown>) => ({
  tla: 'RUS', position: 1, expected: 1.8, p_win: 0.52, p_podium: 0.9, compound: 'MEDIUM', compound_c: 'C4',
  tyre_age: 32, stopped: false, tyre_risk: 'high', tyre_note: '32 laps old; 12 past the longest 2026 medium stint here', ...o,
})
const prediction = (lap: number, status = 'SAFETY_CAR', table = [predRow({})]) => ({
  lap, laps_remaining: 51 - lap, status, sims: 2000, table, notes: ['n1'],
})

describe('live session + predictions', () => {
  it('stores the live_id and source from the first `live` event', () => {
    const s = run([['live', { live_id: 'abc-123', source: 'replay' }]])
    expect(s.liveId).toBe('abc-123')
    expect(s.liveSource).toBe('replay')
    expect(run([['live', { live_id: 'x', source: 'live' }]]).liveSource).toBe('live')
    expect(parseReplayEvent('live', '{"source":"replay"}')).toBeNull() // no id
    expect(replayReducer(s, { type: 'start', params }).liveId).toBeNull() // new run, new session
  })

  it('parses prediction rows defensively', () => {
    const e = parseReplayEvent(
      'prediction',
      JSON.stringify(prediction(31, 'SAFETY_CAR', [
        predRow({}),
        predRow({ tla: 'PIA', position: 2, p_win: 1.7, p_podium: -1, compound: 'X', compound_c: 'nope', tyre_risk: 'EXTREME', stopped: 'yes' }),
      ])),
    )
    expect(e?.type).toBe('prediction')
    if (e?.type !== 'prediction') return
    expect(e).toMatchObject({ lap: 31, laps_remaining: 20, status: 'SAFETY_CAR', sims: 2000, notes: ['n1'] })
    expect(e.table[0]).toMatchObject({ tla: 'RUS', p_win: 0.52, compound: 'MEDIUM', compound_c: 'C4', tyre_risk: 'high', stopped: false })
    expect(e.table[1]).toMatchObject({ p_win: 1, p_podium: 0, compound: null, compound_c: null, tyre_risk: null, stopped: false })
    expect(parseReplayEvent('prediction', '{"lap":3}')).toBeNull() // no table
  })

  it('keeps every prediction (events and chat answers) in order, only for the current live_id', () => {
    let s = run([
      ['live', { live_id: 'L1', source: 'replay' }],
      ['prediction', prediction(31)],
      ['prediction', prediction(36, 'VSC')],
    ])
    expect(s.predictions.map((p) => [p.source, p.prediction.lap, p.prediction.status])).toEqual([
      ['event', 31, 'SAFETY_CAR'],
      ['event', 36, 'VSC'],
    ])
    const asked = { ...prediction(38, 'GREEN'), status: 'GREEN' as const, table: [] }
    s = replayReducer(s, { type: 'prediction', liveId: 'L1', prediction: asked })
    expect(s.predictions.at(-1)).toMatchObject({ source: 'ask', prediction: { lap: 38 } })
    expect(new Set(s.predictions.map((p) => p.id)).size).toBe(3)
    // a late answer for an old session is dropped
    expect(replayReducer(s, { type: 'prediction', liveId: 'OLD', prediction: asked })).toBe(s)
    // and chat predictions still land after the race ended
    const ended = run([['end', {}]], s)
    expect(replayReducer(ended, { type: 'prediction', liveId: 'L1', prediction: asked }).predictions).toHaveLength(4)
    // a new run starts with an empty history
    expect(replayReducer(s, { type: 'start', params }).predictions).toEqual([])
  })
})

describe('live stream catch-up and reconnects', () => {
  const liveParams = { kind: 'live' as const, liveId: 'L1', meeting: 'Azerbaijan Grand Prix · Race' }
  const catchUp: [string, Record<string, unknown>][] = [
    ['live', { live_id: 'L1', source: 'live' }],
    ['session', { meeting: 'Azerbaijan Grand Prix', session: 'Race', total_laps: 51 }],
    ['snapshot', { lap: 31, total_laps: 51, status: 'SAFETY_CAR', drivers: [driver({})] }],
    ['race_control', { lap: 31, category: 'SafetyCar', message: 'SAFETY CAR DEPLOYED' }],
    ['race_control', { lap: 31, category: 'Other', message: 'PIT EXIT OPEN' }],
    ['radio', { driver: '4', tla: 'NOR', utc: null, url: 'u1', text: 'Box box.' }],
    ['pit_calls', report('SAFETY_CAR', 31)],
    ['prediction', prediction(31)],
  ]

  it('a reconnect replaying the catch-up does not duplicate feed items', () => {
    const first = run(catchUp, replayReducer(initialReplayState, { type: 'start', params: liveParams }))
    expect(first.params).toEqual(liveParams)
    const dropped = replayReducer(first, { type: 'event', event: { type: 'connection', connected: false } })
    expect(dropped.connected).toBe(false)
    expect(dropped.phase).toBe('running') // reconnecting is not an error
    const again = run(catchUp, dropped)
    expect(again.connected).toBe(true)
    expect(again.raceControl).toHaveLength(2)
    expect(again.radio).toHaveLength(1)
    expect(again.pitCalls).toHaveLength(1)
    expect(again.predictions).toHaveLength(1)
    // new items after the catch-up still land
    const more = run(
      [
        ['race_control', { lap: 32, category: 'SafetyCar', message: 'SAFETY CAR IN THIS LAP' }],
        ['prediction', prediction(36, 'VSC')],
      ],
      again,
    )
    expect(more.raceControl).toHaveLength(3)
    expect(more.predictions).toHaveLength(2)
  })

  it('an asked prediction on the same lap is not mistaken for a duplicate', () => {
    const s = run(catchUp, replayReducer(initialReplayState, { type: 'start', params: liveParams }))
    const parsed = parseReplayEvent('prediction', JSON.stringify(prediction(31)))
    if (parsed?.type !== 'prediction') throw new Error('parse')
    const { type: _t, ...p } = parsed
    void _t
    expect(replayReducer(s, { type: 'prediction', liveId: 'L1', prediction: p }).predictions).toHaveLength(2)
  })

  it('reset clears the screen; feedFinished spots a finished session', () => {
    const s = run(catchUp)
    expect(replayReducer(s, { type: 'reset' })).toEqual(initialReplayState)
    expect(feedFinished(s)).toBe(false)
    expect(feedFinished(run([['snapshot', { lap: 51, total_laps: 51, status: 'GREEN', drivers: [] }]]))).toBe(true)
    expect(feedFinished(run([['end', {}]]))).toBe(true)
  })
})

describe('weather events', () => {
  it('parses weather and forecast and keeps the latest in state', () => {
    const w = parseReplayEvent(
      'weather',
      JSON.stringify({ air_c: 26.2, track_c: 47.3, humidity: 59, wind_ms: 0.4, wind_dir: 104, raining: true, lap: 12 }),
    )
    expect(w).toMatchObject({ type: 'weather', track_c: 47.3, raining: true })
    const f = parseReplayEvent(
      'forecast',
      JSON.stringify({ location: 'Kuala Lumpur', p_rain: 0.98, mm: 1.5, hourly: [{ utc: '2026-10-04T07:00', p: 75, mm: 0.5 }] }),
    )
    expect(f).toMatchObject({ type: 'forecast', p_rain: 0.98 })
    expect(parseReplayEvent('forecast', JSON.stringify({ p_rain: 'x' }))).toBeNull()
    let state = replayReducer(initialReplayState, { type: 'start', params })
    state = replayReducer(state, { type: 'event', event: w as ReplayEvent })
    state = replayReducer(state, { type: 'event', event: f as ReplayEvent })
    expect(state.weather?.track_c).toBe(47.3)
    expect(state.forecast?.location).toBe('Kuala Lumpur')
  })
})

describe('practice and qualifying snapshots', () => {
  it('parses best laps, knock-outs and the session type', () => {
    const e = parseReplayEvent(
      'snapshot',
      JSON.stringify({
        lap: null,
        total_laps: null,
        status: 'GREEN',
        clock: null,
        session_type: 'Qualifying',
        drivers: [{ position: 12, tla: 'ALO', number: '14', gap: 0.9, best_lap: 103.7, knocked_out: true }],
      }),
    )
    expect(e).toMatchObject({ type: 'snapshot', session_type: 'Qualifying' })
    const d = (e as { drivers: TimingRow[] }).drivers[0]
    expect(d.best_lap).toBe(103.7)
    expect(d.knocked_out).toBe(true)
    expect(isTimedSession(e as { session_type?: string })).toBe(true)
    expect(isTimedSession({ session_type: 'Race' })).toBe(false)
    expect(isTimedSession({ session_type: '' })).toBe(false)
  })
})

describe('strategy alerts', () => {
  it('adds new alerts on top and updates existing ones in place', () => {
    const ev = (id: string, extra: Record<string, unknown> = {}) =>
      parseReplayEvent('alert', JSON.stringify({ id, kind: 'undercut', lap: 20, headline: id, detail: '', drivers: ['LEC', 'HAM'], p: 0.62, status: 'live', ...extra })) as ReplayEvent
    let state = replayReducer(initialReplayState, { type: 'start', params })
    state = replayReducer(state, { type: 'event', event: ev('a') })
    state = replayReducer(state, { type: 'event', event: ev('b') })
    expect(state.alerts.map((a) => a.id)).toEqual(['b', 'a'])
    state = replayReducer(state, { type: 'event', event: ev('a', { status: 'resolved', outcome: 'worked' }) })
    expect(state.alerts.map((a) => a.id)).toEqual(['b', 'a'])
    expect(state.alerts[1].outcome).toBe('worked')
    state = replayReducer(state, { type: 'event', event: ev('b', { text: 'Leclerc can jump Hamilton (62%).' }) })
    state = replayReducer(state, { type: 'event', event: ev('b', { status: 'resolved', outcome: 'failed' }) })
    expect(state.alerts[0].text).toBe('Leclerc can jump Hamilton (62%).') // kept across updates
    expect(parseReplayEvent('alert', JSON.stringify({ kind: 'x' }))).toBeNull()
  })
})

describe('director', () => {
  it('parses the pick and keeps the latest', () => {
    const e = parseReplayEvent(
      'director',
      JSON.stringify({
        lap: 12,
        watch: { chaser: 'HAM', ahead: 'LEC', position: 4, gap: 0.7, closing: 0.4, p_pass: 0.52, p_close: 0.9 },
        battles: [
          { chaser: 'HAM', ahead: 'LEC', position: 4, gap: 0.7, closing: 0.4, p_pass: 0.52, p_close: 0.9 },
          { chaser: 'ALO', ahead: 'GAS', position: 9, gap: 1.2, closing: 0.1, p_pass: 0.2, p_close: 0.6 },
          { nope: true },
        ],
      }),
    ) as ReplayEvent
    let state = replayReducer(initialReplayState, { type: 'start', params })
    state = replayReducer(state, { type: 'event', event: e })
    expect(state.director?.watch?.chaser).toBe('HAM')
    expect(state.director?.battles).toHaveLength(2)
  })
})
