/**
 * Scripted mock of the LIVE replay (GET /api/live/sessions + /api/live/replay). Frames are
 * JSON-encoded and decoded with the same parser the EventSource path uses.
 *
 * Script: green running on laps 29-30, a crash brings out the safety car on lap 31, the pit wall
 * calls and a "who wins from here" prediction arrive, most of the field pits, the safety car comes in
 * and racing resumes, then `end`. The first frame is `live` (the live session id the chat asks about).
 */
import type { LiveCurrent, LiveSessionInfo, LiveSource, LiveTransport, ReplayEvent, ReplayParams, ReplayTransport } from '../liveTypes'
import type { CurrentFetcher } from './liveApi'
import type { Compound } from './format'
import { dropMockLive, mockLiveState, mockPrediction, registerMockLive, updateMockLive } from './mockAsk'
import { parseReplayEvent } from './replay'

const MOCK_SESSIONS: Record<number, [string, string][]> = {
  2024: [
    ['2024-05-05', 'Miami Grand Prix'],
    ['2024-05-26', 'Monaco Grand Prix'],
    ['2024-09-15', 'Azerbaijan Grand Prix'],
    ['2024-12-08', 'Abu Dhabi Grand Prix'],
  ],
  2025: [
    ['2025-03-16', 'Australian Grand Prix'],
    ['2025-06-15', 'Canadian Grand Prix'],
    ['2025-09-21', 'Azerbaijan Grand Prix'],
    ['2025-12-07', 'Abu Dhabi Grand Prix'],
  ],
  2026: [
    ['2026-03-08', 'Australian Grand Prix'],
    ['2026-05-03', 'Miami Grand Prix'],
    ['2026-09-13', 'Madrid Grand Prix'],
    ['2026-09-26', 'Azerbaijan Grand Prix'],
  ],
}

export function mockSessions(year: number): LiveSessionInfo[] {
  return (MOCK_SESSIONS[year] ?? []).map(([date, meeting]) => {
    const folder = `${date}_${meeting.replace(/ /g, '_')}`
    return { path: `${year}/${folder}/${date}_Race/`, meeting, date }
  })
}

export async function fetchMockSessions(year: number): Promise<LiveSessionInfo[]> {
  await new Promise((r) => setTimeout(r, 150))
  return mockSessions(year)
}

/** "2026/2026-09-26_Azerbaijan_Grand_Prix/2026-09-26_Race/" -> "Azerbaijan Grand Prix" */
export function meetingFromPath(path: string): string {
  const m = /\d{4}-\d{2}-\d{2}_([^/]+)\//.exec(path)
  return m ? m[1].replace(/_/g, ' ') : 'Mock Grand Prix'
}

// ---------- script ----------

interface Car {
  tla: string
  number: string
  team: string
  gap: number
  compound: Compound
  age: number
  retired?: boolean
}

const GRID: Car[] = [
  { tla: 'RUS', number: '63', team: 'Mercedes', gap: 0, compound: 'MEDIUM', age: 30 },
  { tla: 'PIA', number: '81', team: 'McLaren', gap: 10.9, compound: 'SOFT', age: 28 },
  { tla: 'VER', number: '3', team: 'Red Bull Racing', gap: 12.4, compound: 'MEDIUM', age: 28 },
  { tla: 'HAD', number: '6', team: 'Red Bull Racing', gap: 13.3, compound: 'SOFT', age: 28 },
  { tla: 'LEC', number: '16', team: 'Ferrari', gap: 17.8, compound: 'SOFT', age: 28 },
  { tla: 'HAM', number: '44', team: 'Ferrari', gap: 19.1, compound: 'SOFT', age: 27 },
  { tla: 'GAS', number: '10', team: 'Alpine', gap: 24.6, compound: 'MEDIUM', age: 27 },
  { tla: 'ANT', number: '12', team: 'Mercedes', gap: 25.9, compound: 'MEDIUM', age: 29 },
  { tla: 'NOR', number: '4', team: 'McLaren', gap: 27.2, compound: 'MEDIUM', age: 27 },
  { tla: 'COL', number: '43', team: 'Alpine', gap: 31.0, compound: 'MEDIUM', age: 27 },
  { tla: 'BEA', number: '87', team: 'Haas F1 Team', gap: 33.4, compound: 'SOFT', age: 27 },
  { tla: 'LAW', number: '30', team: 'Racing Bulls', gap: 34.2, compound: 'MEDIUM', age: 27 },
  { tla: 'OCO', number: '31', team: 'Haas F1 Team', gap: 36.8, compound: 'HARD', age: 27 },
  { tla: 'HUL', number: '27', team: 'Audi', gap: 38.5, compound: 'HARD', age: 27 },
  { tla: 'SAI', number: '55', team: 'Williams', gap: 44.9, compound: 'HARD', age: 27 },
  { tla: 'ALB', number: '23', team: 'Williams', gap: 46.3, compound: 'HARD', age: 27 },
  { tla: 'BOR', number: '5', team: 'Audi', gap: 52.7, compound: 'MEDIUM', age: 27 },
  { tla: 'LIN', number: '41', team: 'Racing Bulls', gap: 58.1, compound: 'MEDIUM', age: 27 },
  { tla: 'BOT', number: '77', team: 'Cadillac', gap: 88.4, compound: 'SOFT', age: 1 },
  { tla: 'PER', number: '11', team: 'Cadillac', gap: 104.0, compound: 'HARD', age: 20 },
  { tla: 'ALO', number: '14', team: 'Aston Martin', gap: 0, compound: 'SOFT', age: 18, retired: true },
  { tla: 'STR', number: '18', team: 'Aston Martin', gap: 0, compound: 'SOFT', age: 5, retired: true },
]

const TEAM_COLOUR: Record<string, string> = {
  Mercedes: '00D7B6',
  McLaren: 'FF8000',
  'Red Bull Racing': '4781D7',
  Ferrari: 'ED1131',
  Alpine: '00A1E8',
  'Haas F1 Team': '9C9FA2',
  'Racing Bulls': '6C98FF',
  Audi: 'F50537',
  Williams: '1868DB',
  Cadillac: 'AAAAAD',
  'Aston Martin': '229971',
}

const LAP_TIME = 105 // Baku-ish, for "laps down"

interface CarState {
  gap: number
  compound: Compound
  age: number
  stops: number
  inPit: boolean
  retired: boolean
}

function driverRows(order: Car[], state: Map<string, CarState>) {
  let prevGap: number | null = null
  return order.map((c, i) => {
    const s = state.get(c.tla) as CarState
    const lapsDown = s.retired ? 0 : Math.floor(s.gap / LAP_TIME)
    const row = {
      position: i + 1,
      tla: c.tla,
      number: c.number,
      team: c.team,
      team_colour: TEAM_COLOUR[c.team] ?? '',
      gap: s.retired ? null : Number(s.gap.toFixed(3)),
      laps_down: lapsDown,
      interval: s.retired || prevGap === null ? null : Number((s.gap - prevGap).toFixed(3)),
      compound: s.compound,
      tyre_age: s.age,
      pit_stops: s.stops,
      in_pit: s.inPit,
      retired: s.retired,
    }
    if (!s.retired) prevGap = s.gap
    return row
  })
}

export interface MockFrame {
  /** delay before this frame, in ms at 30x */
  delay: number
  event: ReplayEvent['type']
  data: Record<string, unknown>
}

// HAD and RUS clips are real published clips (audio plays when online); the NOR clip is invented
// for the transcript demo and does not exist, so playing it fails and the player moves on.
const RADIO_BASE = 'https://livetiming.formula1.com/static/2026/2026-09-26_Azerbaijan_Grand_Prix/2026-09-26_Race/TeamRadio/'

/** The mock replay as a list of frames (exported for tests). */
export function mockReplayScript(meeting: string, totalLaps = 51, liveId = 'mock-live', source: LiveSource = 'replay'): MockFrame[] {
  const state = new Map<string, CarState>(
    GRID.map((c) => [
      c.tla,
      { gap: c.gap, compound: c.compound, age: c.age, stops: c.retired ? 1 : c.tla === 'BOT' ? 1 : 0, inPit: false, retired: !!c.retired },
    ]),
  )
  const frames: MockFrame[] = []
  const push = (delay: number, event: ReplayEvent['type'], data: Record<string, unknown> = {}) =>
    frames.push({ delay, event, data: { type: event, ...data } })
  let clockS = 6541
  const snap = (lap: number, status: string, order: Car[] = GRID) => {
    clockS += 35
    const h = Math.floor(clockS / 3600)
    const m = Math.floor((clockS % 3600) / 60)
    const s = clockS % 60
    push(900, 'snapshot', {
      lap,
      total_laps: totalLaps,
      status,
      clock: `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.000000`,
      drivers: driverRows(order, state),
    })
  }
  const tick = (spread = 1) => {
    for (const s of state.values()) {
      if (s.retired) continue
      s.age += 1
      s.gap *= spread
    }
  }

  push(0, 'live', { live_id: liveId, source })
  push(400, 'session', { meeting, session: 'Race', total_laps: totalLaps })
  push(50, 'track', mockTrack())
  snap(29, 'GREEN')
  push(500, 'race_control', { lap: 29, category: 'Flag', message: 'WAVED BLUE FLAG FOR CAR 77 (BOT) TIMED AT 15:55:59' })
  push(400, 'radio', {
    driver: '6',
    tla: 'HAD',
    utc: '2026-09-26T12:03:20.168Z',
    url: `${RADIO_BASE}HAD_6_20260926_160250.mp3`,
    text: 'Tyres are going off, I have no rear grip in sector three.',
  })
  tick(1.01)
  snap(30, 'GREEN')
  push(600, 'race_control', { lap: 30, category: 'Other', message: 'CAR 11 (PER) TIME 1:47.311 DELETED - TRACK LIMITS AT TURN 16 LAP 29 15:57:41' })
  tick(1.005)
  snap(31, 'GREEN')
  push(700, 'track_status', { status: 'YELLOW', lap: 31 })
  push(200, 'race_control', { lap: 31, category: 'Flag', message: 'YELLOW IN TRACK SECTOR 2' })
  push(500, 'race_control', { lap: 31, category: 'Other', message: 'INCIDENT INVOLVING CAR 18 (STR) NOTED - CAUSING A COLLISION' })
  push(600, 'track_status', { status: 'SAFETY_CAR', lap: 31 })
  push(100, 'race_control', { lap: 31, category: 'SafetyCar', message: 'SAFETY CAR DEPLOYED' })

  const pitLoss = 8.4
  const calls = GRID.map((c, i) => {
    const s = state.get(c.tla) as CarState
    const behind = GRID.slice(i + 1).filter((o) => {
      const os = state.get(o.tla) as CarState
      return !os.retired && os.gap - s.gap <= pitLoss
    }).length
    const base = { tla: c.tla, position: i + 1, compound: s.compound, tyre_age_laps: s.age }
    if (s.retired) return { ...base, call: 'RETIRED', reason: 'Out of the race.', places_at_risk: null }
    if (s.age <= 5) return { ...base, call: 'STAY OUT', reason: `Tyres only ${s.age} laps old.`, places_at_risk: null }
    if (s.stops === 0) {
      return {
        ...base,
        call: 'PIT',
        reason: `Still needs a second dry compound. A stop now costs ~${pitLoss}s instead of ~16.8s under green (${behind} car(s) within ${pitLoss}s behind).`,
        places_at_risk: behind,
      }
    }
    return { ...base, call: 'PIT', reason: `Tyres ${s.age} laps old; a cheap stop for fresh rubber.`, places_at_risk: behind }
  })
  push(100, 'pit_calls', {
    report: {
      track_status: 'SAFETY_CAR',
      lap: 31,
      laps_remaining: totalLaps - 31,
      green_pit_loss_s: 16.8,
      pit_loss_now_s: pitLoss,
      calls,
      assumptions: [
        'Pit lane time 21.8s (median of 2 pit-lane times this session) minus 5.0s bypass = 16.8s loss under green.',
        'SAFETY_CAR multiplies the loss by 0.5 -> 8.4s.',
        'Places at risk assumes the cars behind stay out.',
        'Fresh tyres: <= 5 laps; old tyres: >= 15 laps.',
      ],
    },
  })
  push(300, 'prediction', { ...mockPrediction(driverRows(GRID, state), 31, totalLaps, 'SAFETY_CAR') })
  // field bunches up behind the safety car; the leaders dive in
  for (const s of state.values()) s.gap *= 0.35
  for (const tla of ['RUS', 'PIA', 'VER', 'HAD', 'LEC', 'NOR']) (state.get(tla) as CarState).inPit = true
  snap(31, 'SAFETY_CAR')
  push(300, 'radio', {
    driver: '4',
    tla: 'NOR',
    utc: '2026-09-26T12:07:02.004Z',
    url: `${RADIO_BASE}NOR_4_20260926_160702.mp3`,
    text: null,
  })
  push(900, 'race_control', { lap: 31, category: 'Other', message: 'PIT EXIT OPEN' })
  push(900, 'radio_transcript', {
    url: `${RADIO_BASE}NOR_4_20260926_160702.mp3`,
    tla: 'NOR',
    text: 'Box box, box for hards, safety car.',
  })
  for (const tla of ['RUS', 'PIA', 'VER', 'HAD', 'LEC', 'NOR', 'HAM', 'GAS', 'ANT', 'COL']) {
    const s = state.get(tla) as CarState
    s.inPit = false
    s.stops += 1
    s.age = 0
    s.compound = s.compound === 'MEDIUM' ? 'SOFT' : 'HARD'
    s.gap += 3
  }
  tick()
  const reordered = [...GRID]
  const oco = reordered.findIndex((c) => c.tla === 'OCO')
  reordered.splice(3, 0, ...reordered.splice(oco, 1))
  snap(32, 'SAFETY_CAR', reordered)
  push(500, 'radio', {
    driver: '63',
    tla: 'RUS',
    utc: '2026-09-26T12:08:40.512Z',
    url: `${RADIO_BASE}RUS_63_20260926_163007.mp3`,
    text: null,
  })
  push(700, 'race_control', { lap: 32, category: 'SafetyCar', message: 'SAFETY CAR IN THIS LAP' })
  push(600, 'radio_transcript', { url: `${RADIO_BASE}RUS_63_20260926_163007.mp3`, tla: 'RUS', text: '' })
  tick()
  snap(33, 'SAFETY_CAR', reordered)
  push(800, 'track_status', { status: 'GREEN', lap: 34 })
  push(100, 'race_control', { lap: 34, category: 'Flag', message: 'GREEN LIGHT - PIT EXIT OPEN' })
  tick(1.8)
  snap(34, 'GREEN', reordered)
  push(400, 'race_control', { lap: 34, category: 'Flag', message: 'CLEAR IN TRACK SECTOR 2' })
  tick(1.3)
  snap(35, 'GREEN', reordered)
  push(600, 'end')
  return frames
}

// ---------- track + positions ----------

const TRACK_STEPS = 240

/** A closed, vaguely street-circuit-like loop: long straight, a kink and a tight hairpin end. */
function trackPoint(u: number): [number, number] {
  const t = u * 2 * Math.PI
  return [Math.round(8000 * Math.cos(t) + 900 * Math.cos(3 * t)), Math.round(3200 * Math.sin(t) + 1300 * Math.sin(2 * t))]
}

export function mockTrack() {
  const points = Array.from({ length: TRACK_STEPS }, (_, i) => trackPoint(i / TRACK_STEPS))
  const xs = points.map((p) => p[0])
  const ys = points.map((p) => p[1])
  const at = (n: number, u: number) => {
    const [x, y] = trackPoint(u)
    return { number: n, x, y }
  }
  return {
    source: 'traced',
    name: 'Mock Street Circuit',
    points,
    bounds: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)],
    rotation: 0,
    corners: [0.12, 0.23, 0.31, 0.45, 0.52, 0.64, 0.77, 0.88].map((u, i) => at(i + 1, u)),
    marshal_sectors: Array.from({ length: 10 }, (_, i) => at(i + 1, i / 10)),
  }
}

/** Car fixes `elapsedMs` into the mock replay; the field circulates at one lap per `lapMs`. */
export function mockPositions(elapsedMs: number, lapMs: number) {
  const cars = GRID.filter((c) => !c.retired).map((c) => {
    const u = (((elapsedMs / lapMs - c.gap / LAP_TIME) % 1) + 1) % 1
    const [x, y] = trackPoint(u)
    return { number: c.number, tla: c.tla, x, y, status: 'OnTrack' }
  })
  // one car has no fix yet (the UI must ignore 0,0)
  cars.push({ number: '99', tla: 'NOF', x: 0, y: 0, status: 'OnTrack' })
  return { utc: new Date(Date.UTC(2026, 8, 26, 12) + elapsedMs).toISOString(), cars }
}

/** Plays scripted frames on timers, keeping the mock server's race state in step (for the mock ask). */
function playMock(frames: MockFrame[], liveId: string, speed: number, onEvent: (e: ReplayEvent) => void, dropOnStop: boolean) {
  const scale = Math.min(3, Math.max(0.2, 30 / speed))
  let i = 0
  let timer: ReturnType<typeof setTimeout> | undefined
  let ticker: ReturnType<typeof setInterval> | undefined
  const emit = (name: string, data: unknown) => {
    const event = parseReplayEvent(name, JSON.stringify(data))
    if (!event) return
    if (event.type === 'snapshot') {
      const { type: _type, ...snapshot } = event
      void _type
      updateMockLive(liveId, { snapshot, status: event.status })
    } else if (event.type === 'track_status') updateMockLive(liveId, { status: event.status })
    onEvent(event)
  }
  const startPositions = () => {
    const t0 = Date.now()
    const lapMs = (LAP_TIME * 1000) / speed
    ticker = setInterval(() => emit('positions', { type: 'positions', ...mockPositions(Date.now() - t0, lapMs) }), 250)
  }
  const next = () => {
    if (i >= frames.length) return
    const frame = frames[i++]
    timer = setTimeout(() => {
      if (frame.event === 'end') clearInterval(ticker)
      emit(frame.event, frame.data)
      if (frame.event === 'track') startPositions()
      next()
    }, frame.delay * scale)
  }
  next()
  return () => {
    // Stopping a replay ends its live session on the (mock) server; after a normal `end` it stays askable.
    if (dropOnStop && i < frames.length) dropMockLive(liveId)
    i = frames.length
    clearTimeout(timer)
    clearInterval(ticker)
  }
}

/** Replays the scripted frames on timers. Delays scale with the chosen speed (30x = as written). */
export const openMockReplay: ReplayTransport = (params: ReplayParams, onEvent) => {
  const liveId = newLiveId()
  registerMockLive(liveId, 'replay')
  const frames = mockReplayScript(meetingFromPath(params.path) || params.meeting, 51, liveId)
  return playMock(frames, liveId, params.speed, onEvent, true)
}

// ---------- mock live feed (GET /api/live/current, /api/live/stream, POST /api/live/start) ----------

export const MOCK_LIVE_ID = 'mock-live-feed'
const MOCK_LIVE_MEETING = 'Azerbaijan Grand Prix'

let mockFeedOn = true

/** Tests / demo: switch the mock server's live feed off (then /current is 404 until "start"). */
export function setMockFeed(on: boolean): void {
  mockFeedOn = on
}

function mockCurrentBody(): LiveCurrent {
  const s = mockLiveState(MOCK_LIVE_ID)
  return {
    live_id: MOCK_LIVE_ID,
    source: 'live',
    connected: true,
    recording: null,
    meeting: MOCK_LIVE_MEETING,
    session: 'Race',
    lap: s?.snapshot?.lap ?? null,
    total_laps: s?.snapshot?.total_laps ?? 51,
    status: s?.status ?? 'UNKNOWN',
  }
}

export const fetchMockCurrent: CurrentFetcher = async () => {
  await new Promise((r) => setTimeout(r, 120))
  return mockFeedOn ? { kind: 'live', current: mockCurrentBody() } : { kind: 'none', detail: 'No live session (mock).' }
}

export const startMockFeed: CurrentFetcher = async () => {
  mockFeedOn = true
  return fetchMockCurrent()
}

/** The mock live stream: the scripted race at 30x, reported as a live session. */
export const openMockLive: LiveTransport = (params, onEvent) => {
  if (!mockLiveState(params.liveId)) registerMockLive(params.liveId, 'live')
  const frames = mockReplayScript(MOCK_LIVE_MEETING, 51, params.liveId, 'live')
  return playMock(frames, params.liveId, 30, onEvent, false)
}

function newLiveId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `mock-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}
