/** Replay stream: SSE frame -> typed event, event reducer, race-control noise filter, timing formatters. */
import type {
  CallKind,
  PitCall,
  PitCallReport,
  RaceControlItem,
  ReplayEvent,
  ReplayParams,
  ReplayState,
  Snapshot,
  TimingRow,
  TrackStatus,
} from '../liveTypes'
import { TRACK_STATUSES } from '../liveTypes'
import type { Compound } from './format'

// ---------- parsing ----------

const COMPOUNDS: readonly string[] = ['SOFT', 'MEDIUM', 'HARD', 'INTERMEDIATE', 'WET']
const CALLS: readonly string[] = ['PIT', 'STAY OUT', 'IN PIT', 'RETIRED']

type Rec = Record<string, unknown>
const isRecord = (v: unknown): v is Rec => typeof v === 'object' && v !== null && !Array.isArray(v)
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const str = (v: unknown, fallback = ''): string => (typeof v === 'string' ? v : v == null ? fallback : String(v))
const compound = (v: unknown): Compound | null =>
  typeof v === 'string' && COMPOUNDS.includes(v) ? (v as Compound) : null
export const trackStatus = (v: unknown): TrackStatus =>
  typeof v === 'string' && (TRACK_STATUSES as readonly string[]).includes(v) ? (v as TrackStatus) : 'UNKNOWN'

function row(d: Rec): TimingRow {
  return {
    position: num(d.position),
    tla: str(d.tla, '???'),
    number: str(d.number),
    team: str(d.team),
    gap: num(d.gap),
    laps_down: num(d.laps_down) ?? 0,
    interval: num(d.interval),
    compound: compound(d.compound),
    tyre_age: num(d.tyre_age),
    pit_stops: num(d.pit_stops) ?? 0,
    in_pit: d.in_pit === true,
    retired: d.retired === true,
  }
}

function call(c: Rec): PitCall {
  return {
    tla: str(c.tla, '???'),
    position: num(c.position),
    call: typeof c.call === 'string' && CALLS.includes(c.call) ? (c.call as CallKind) : 'STAY OUT',
    reason: str(c.reason),
    places_at_risk: num(c.places_at_risk),
    compound: compound(c.compound),
    tyre_age_laps: num(c.tyre_age_laps),
  }
}

function report(r: Rec): PitCallReport {
  return {
    track_status: trackStatus(r.track_status),
    lap: num(r.lap),
    laps_remaining: num(r.laps_remaining),
    green_pit_loss_s: num(r.green_pit_loss_s),
    pit_loss_now_s: num(r.pit_loss_now_s),
    calls: Array.isArray(r.calls) ? r.calls.filter(isRecord).map(call) : [],
    assumptions: Array.isArray(r.assumptions) ? r.assumptions.map((a) => str(a)) : [],
  }
}

/** Convert one SSE message (event name + data string) into a typed ReplayEvent. Malformed -> null. */
export function parseReplayEvent(name: string, raw: string): ReplayEvent | null {
  let d: unknown
  try {
    d = JSON.parse(raw)
  } catch {
    return name === 'error' ? { type: 'error', message: raw || 'Unknown error' } : null
  }
  if (!isRecord(d)) return name === 'end' ? { type: 'end' } : null
  switch (name) {
    case 'session':
      return { type: 'session', meeting: str(d.meeting), session: str(d.session), total_laps: num(d.total_laps) }
    case 'snapshot':
      return {
        type: 'snapshot',
        lap: num(d.lap),
        total_laps: num(d.total_laps),
        status: trackStatus(d.status),
        clock: typeof d.clock === 'string' ? d.clock : null,
        drivers: Array.isArray(d.drivers) ? d.drivers.filter(isRecord).map(row) : [],
      }
    case 'track_status':
      return { type: 'track_status', status: trackStatus(d.status), lap: num(d.lap) }
    case 'race_control':
      return typeof d.message === 'string'
        ? { type: 'race_control', lap: num(d.lap), category: str(d.category), message: d.message }
        : null
    case 'radio':
      return typeof d.url === 'string'
        ? {
            type: 'radio',
            driver: str(d.driver),
            tla: str(d.tla, str(d.driver)),
            utc: typeof d.utc === 'string' ? d.utc : null,
            url: d.url,
            text: typeof d.text === 'string' ? d.text : null,
          }
        : null
    case 'radio_transcript':
      return typeof d.url === 'string' && typeof d.text === 'string'
        ? { type: 'radio_transcript', url: d.url, tla: str(d.tla), text: d.text }
        : null
    case 'pit_calls':
      return isRecord(d.report) ? { type: 'pit_calls', report: report(d.report) } : null
    case 'end':
      return { type: 'end' }
    case 'error':
      return { type: 'error', message: str(d.message, 'Unknown error') }
    default:
      return null
  }
}

// ---------- reducer ----------

export const RACE_CONTROL_CAP = 300
export const RADIO_CAP = 60

export const initialReplayState: ReplayState = {
  phase: 'idle',
  params: null,
  error: null,
  session: null,
  snapshot: null,
  trackStatus: null,
  raceControl: [],
  radio: [],
  pitCalls: [],
  latestTranscriptId: null,
  seq: 0,
}

export type ReplayAction =
  | { type: 'start'; params: ReplayParams }
  | { type: 'event'; event: ReplayEvent }
  | { type: 'stop' }

/** Pure state machine for one replay run. Events outside connecting/running are ignored. */
export function replayReducer(state: ReplayState, action: ReplayAction): ReplayState {
  switch (action.type) {
    case 'start':
      return { ...initialReplayState, phase: 'connecting', params: action.params }
    case 'stop':
      return state.phase === 'connecting' || state.phase === 'running' ? { ...state, phase: 'stopped' } : state
    case 'event':
      if (state.phase !== 'connecting' && state.phase !== 'running') return state
      return applyEvent({ ...state, phase: 'running' }, action.event)
  }
}

function applyEvent(state: ReplayState, e: ReplayEvent): ReplayState {
  const seq = state.seq + 1
  switch (e.type) {
    case 'session':
      return { ...state, session: { meeting: e.meeting, session: e.session, total_laps: e.total_laps } }
    case 'snapshot': {
      const { type: _type, ...snapshot } = e
      void _type
      return { ...state, snapshot: snapshot satisfies Snapshot, trackStatus: e.status }
    }
    case 'track_status':
      return { ...state, trackStatus: e.status }
    case 'race_control': {
      const item: RaceControlItem = { id: seq, lap: e.lap, category: e.category, message: e.message }
      return { ...state, seq, raceControl: [item, ...state.raceControl].slice(0, RACE_CONTROL_CAP) }
    }
    case 'radio': {
      if (state.radio.some((r) => r.url === e.url)) return state
      const lap = state.snapshot?.lap ?? null
      const item = { id: seq, driver: e.driver, tla: e.tla, utc: e.utc, url: e.url, lap, text: e.text }
      return {
        ...state,
        seq,
        radio: [item, ...state.radio].slice(0, RADIO_CAP),
        latestTranscriptId: e.text?.trim() ? seq : state.latestTranscriptId,
      }
    }
    case 'radio_transcript': {
      const clip = state.radio.find((r) => r.url === e.url)
      if (!clip) return state
      return {
        ...state,
        radio: state.radio.map((r) => (r === clip ? { ...r, text: e.text } : r)),
        latestTranscriptId: e.text.trim() ? clip.id : state.latestTranscriptId,
      }
    }
    case 'pit_calls':
      return {
        ...state,
        seq,
        trackStatus: state.trackStatus ?? e.report.track_status,
        pitCalls: [...state.pitCalls, { id: seq, report: e.report }],
      }
    case 'end':
      return { ...state, phase: 'ended' }
    case 'error':
      return { ...state, phase: 'error', error: e.message }
  }
}

// ---------- race control noise ----------

/** Routine marshalling messages that drown out the ones that matter (same list as the terminal viewer). */
export const RC_NOISE = ['WAVED BLUE FLAG', 'CLEAR IN TRACK SECTOR', 'YELLOW IN TRACK SECTOR', 'TRACK LIMITS'] as const

export function isNoise(message: string): boolean {
  const m = message.toUpperCase()
  return RC_NOISE.some((n) => m.includes(n))
}

export function filterRaceControl(items: RaceControlItem[], showAll: boolean): RaceControlItem[] {
  return showAll ? items : items.filter((i) => !isNoise(i.message))
}

// ---------- formatting ----------

export function formatGap(d: TimingRow): string {
  if (d.retired) return 'OUT'
  if (d.position === 1) return 'LEADER'
  if (d.laps_down > 0) return `+${d.laps_down}L`
  return d.gap === null ? '—' : `+${d.gap.toFixed(3)}`
}

export function formatInterval(d: TimingRow): string {
  if (d.retired || d.position === 1) return ''
  return d.interval === null ? '—' : `+${d.interval.toFixed(3)}`
}

export const STATUS_LABEL: Record<TrackStatus, string> = {
  GREEN: 'GREEN',
  YELLOW: 'YELLOW',
  SAFETY_CAR: 'SAFETY CAR',
  VSC: 'VSC',
  VSC_ENDING: 'VSC ENDING',
  RED_FLAG: 'RED FLAG',
  UNKNOWN: '—',
}

/** "1:49:01.380000" -> "1:49:01" */
export function formatClock(clock: string | null): string {
  if (!clock) return ''
  return clock.replace(/\.\d+$/, '')
}

/** "2026-09-26T12:03:20.168Z" -> "12:03:20" (UTC) */
export function formatUtc(utc: string | null): string {
  const m = utc ? /T(\d{2}:\d{2}:\d{2})/.exec(utc) : null
  return m ? m[1] : ''
}
