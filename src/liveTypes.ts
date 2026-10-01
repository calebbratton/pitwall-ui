/** Types for the LIVE view: an archived race replayed as if live (GET /api/live/replay, SSE). */
import type { Compound } from './lib/format'

export type TrackStatus = 'GREEN' | 'YELLOW' | 'SAFETY_CAR' | 'VSC' | 'VSC_ENDING' | 'RED_FLAG' | 'UNKNOWN'

export const TRACK_STATUSES: readonly TrackStatus[] = [
  'GREEN',
  'YELLOW',
  'SAFETY_CAR',
  'VSC',
  'VSC_ENDING',
  'RED_FLAG',
  'UNKNOWN',
]

/** Track statuses under which the backend computes pit wall calls. */
export const NEUTRALISED: readonly TrackStatus[] = ['SAFETY_CAR', 'VSC', 'VSC_ENDING']

/** One entry of GET /api/live/sessions. */
export interface LiveSessionInfo {
  path: string
  meeting: string
  date: string
}

export interface TimingRow {
  position: number | null
  tla: string
  number: string
  team: string
  /** team colour hex without "#", "" when unknown */
  team_colour: string
  /** seconds to the leader */
  gap: number | null
  laps_down: number
  /** seconds to the car ahead */
  interval: number | null
  compound: Compound | null
  tyre_age: number | null
  pit_stops: number
  in_pit: boolean
  retired: boolean
  /** best lap (s): practice / qualifying (current segment) */
  best_lap?: number | null
  /** qualifying: out of the session */
  knocked_out?: boolean
}

export type RejoinKind = 'green' | 'sc' | 'vsc'

/** Where a car would come out if it pitted now (backend `rejoin`, measured circuit pit loss). */
export interface RejoinRow {
  kind: RejoinKind
  /** seconds lost by this kind of stop */
  loss: number
  /** running position after the stop */
  position: number
  ahead: string | null
  gap_ahead: number | null
  behind: string | null
  gap_behind: number | null
  /** rejoins within 1.5 s of the car ahead (dirty air) */
  traffic: boolean
}

export interface Snapshot {
  lap: number | null
  total_laps: number | null
  status: TrackStatus
  clock: string | null
  drivers: TimingRow[]
  /** SessionInfo Type: 'Race' (incl. sprints) | 'Qualifying' | 'Practice'; '' when unknown */
  session_type?: string
  /** typical current green lap (s), for drawing the field on one line by gap */
  lap_time_s?: number | null
  pit_loss?: Record<RejoinKind, number> | null
  /** per running car (TLA) */
  rejoin?: Record<string, RejoinRow[]>
}

export type CallKind = 'PIT' | 'STAY OUT' | 'IN PIT' | 'RETIRED'

export interface PitCall {
  tla: string
  position: number | null
  call: CallKind
  reason: string
  places_at_risk: number | null
  compound: Compound | null
  tyre_age_laps: number | null
}

export interface PitCallReport {
  track_status: TrackStatus
  lap: number | null
  laps_remaining: number | null
  green_pit_loss_s: number | null
  pit_loss_now_s: number | null
  calls: PitCall[]
  assumptions: string[]
}

export interface SessionHeader {
  meeting: string
  session: string
  total_laps: number | null
}

export interface TrackMarker {
  number: number
  x: number
  y: number
}

/** One lap of the circuit in feed units (Y up). */
export interface TrackShape {
  /** "multiviewer" (circuit data) | "traced" (outline traced from timing) */
  source: string
  name: string | null
  points: [number, number][]
  /** [minX, minY, maxX, maxY] */
  bounds: [number, number, number, number]
  /** degrees to rotate about the centre so the map is oriented like TV graphics */
  rotation: number
  corners: TrackMarker[]
  marshal_sectors: TrackMarker[]
}

export interface CarFix {
  number: string
  tla: string
  x: number
  y: number
  /** "OnTrack" | "OffTrack" | … */
  status: string
}

export type TyreRisk = 'low' | 'medium' | 'high'

/** One car of a "who wins from here" prediction. */
export interface PredictionRow {
  tla: string
  /** current running position */
  position: number | null
  /** expected finishing position (mean over the simulations) */
  expected: number | null
  /** 0..1 */
  p_win: number
  /** 0..1 */
  p_podium: number
  compound: Compound | null
  /** Pirelli's actual compound this weekend ("C1" hardest .. "C5"/"C6" softest); SOFT/MEDIUM/HARD are relative */
  compound_c: string | null
  tyre_age: number | null
  /** has already made a pit stop (the mandatory one) */
  stopped: boolean
  tyre_risk: TyreRisk | null
  tyre_note: string
}

/** "Who wins from here": simulated finishes from the current race state (SSE `prediction` or /api/live/ask). */
export interface Prediction {
  lap: number | null
  laps_remaining: number | null
  status: TrackStatus
  sims: number | null
  /** ordered by current running position */
  table: PredictionRow[]
  notes: string[]
}

export type PredictionSource = 'event' | 'ask'

export interface PredictionSet {
  id: number
  /** `event`: pushed at a SC/VSC deployment; `ask`: came with a chat answer */
  source: PredictionSource
  prediction: Prediction
}

/** Where the live session's data comes from: the real live timing feed, or an archived race (testing). */
export type LiveSource = 'live' | 'replay'

/** One completed lap of one car (backend `lap` event), for the run timeline. */
export interface LapCell {
  lap: number
  /** seconds; null when the feed had no time (e.g. lap 1) */
  time: number | null
  compound: Compound | null
  tyre_age: number | null
  pit_in: boolean
  pit_out: boolean
  /** an SC / VSC / red flag was out during the lap */
  neutralised: boolean
  personal_best: boolean
  overall_best: boolean
}

/** A strategy alert (backend alerts.py): fires once, updates in place by id, resolved later. */
export interface StrategyAlert {
  id: string
  kind: 'sc_call' | 'undercut' | 'pit_stop' | 'fastest_lap' | 'weather' | string
  lap: number | null
  headline: string
  detail: string
  drivers: string[]
  /** model probability, when the alert is a prediction */
  p: number | null
  status: 'live' | 'resolved'
  outcome: 'worked' | 'failed' | 'not taken' | null
  /** strategist-style line from the LLM (arrives as an update; facts-only, may be absent) */
  text?: string | null
}

/** A close pair scored by the backend Director (battles.py models). */
export interface Battle {
  chaser: string
  ahead: string
  position: number | null
  gap: number
  /** gap change over the last 3 laps (+ = chaser closing) */
  closing: number
  p_pass: number
  p_close: number
}

/** The Director's pick each lap: which onboard to watch (the viewer switches themselves). */
export interface DirectorPick {
  lap: number | null
  watch: Battle | null
  battles: Battle[]
}

/** Latest WeatherData from the feed (about once a minute). */
export interface Weather {
  air_c: number | null
  track_c: number | null
  humidity: number | null
  wind_ms: number | null
  wind_dir: number | null
  raining: boolean
  lap: number | null
}

/** Open-Meteo rain chance over the session window (live sessions only). */
export interface Forecast {
  location: string
  /** 0..1, peak hourly probability */
  p_rain: number
  mm: number
  hourly: { utc: string; p: number; mm: number }[]
}

export type ReplayEvent =
  | { type: 'live'; live_id: string; source: LiveSource }
  | ({ type: 'prediction' } & Prediction)
  | ({ type: 'session' } & SessionHeader)
  | ({ type: 'snapshot' } & Snapshot)
  | { type: 'track_status'; status: TrackStatus; lap: number | null }
  | { type: 'race_control'; lap: number | null; category: string; message: string }
  | { type: 'radio'; driver: string; tla: string; utc: string | null; url: string; text: string | null }
  | { type: 'radio_transcript'; url: string; tla: string; text: string }
  | { type: 'pit_calls'; report: PitCallReport }
  | ({ type: 'lap'; tla: string; number: string } & LapCell)
  | ({ type: 'alert' } & StrategyAlert)
  | ({ type: 'director' } & DirectorPick)
  | ({ type: 'weather' } & Weather)
  | ({ type: 'forecast' } & Forecast)
  | ({ type: 'track' } & TrackShape)
  | { type: 'positions'; utc: string | null; cars: CarFix[] }
  | { type: 'end' }
  | { type: 'error'; message: string }
  /** client-side only: the live stream dropped (EventSource is reconnecting) or came back */
  | { type: 'connection'; connected: boolean }

export type ReplayEventName = ReplayEvent['type']

/** Event names sent by the server (`connection` is generated by the client). */
export const REPLAY_EVENT_NAMES: readonly Exclude<ReplayEventName, 'connection'>[] = [
  'live',
  'prediction',
  'session',
  'snapshot',
  'track_status',
  'race_control',
  'radio',
  'radio_transcript',
  'pit_calls',
  'lap',
  'alert',
  'director',
  'weather',
  'forecast',
  'track',
  'positions',
  'end',
  'error',
]

export interface ReplayParams {
  kind?: 'replay'
  path: string
  speed: number
  fromLap: number | null
  /** display name of the chosen race, used until the `session` event arrives */
  meeting: string
}

/** Follow the real live session (GET /api/live/stream?live_id=…). */
export interface LiveParams {
  kind: 'live'
  liveId: string
  /** "Azerbaijan Grand Prix · Race" from /api/live/current, used until the `session` event arrives */
  meeting: string
}

export type StreamParams = ReplayParams | LiveParams

/** GET /api/live/current */
export interface LiveCurrent {
  live_id: string
  source: LiveSource
  connected: boolean
  recording: string | null
  meeting: string | null
  session: string | null
  lap: number | null
  total_laps: number | null
  status: TrackStatus
}

export interface RaceControlItem {
  id: number
  lap: number | null
  category: string
  message: string
}

export interface RadioItem {
  id: number
  driver: string
  tla: string
  utc: string | null
  url: string
  /** race lap when the clip arrived (from the latest snapshot) */
  lap: number | null
  /** machine transcript; null while transcribing, "" when no speech was detected */
  text: string | null
}

export interface PitCallSet {
  id: number
  report: PitCallReport
}

export type ReplayPhase = 'idle' | 'connecting' | 'running' | 'ended' | 'stopped' | 'error'

export interface ReplayState {
  phase: ReplayPhase
  params: StreamParams | null
  /** live stream connection: false while EventSource reconnects, null before the first event */
  connected: boolean | null
  error: string | null
  session: SessionHeader | null
  snapshot: Snapshot | null
  trackStatus: TrackStatus | null
  /** newest first */
  raceControl: RaceControlItem[]
  /** newest first */
  radio: RadioItem[]
  /** in arrival order (oldest first) */
  pitCalls: PitCallSet[]
  /** server-side live session id (first SSE event `live`); keys /api/live/ask and the chat history */
  liveId: string | null
  liveSource: LiveSource | null
  /** "who wins from here" history, in arrival order (oldest first) */
  predictions: PredictionSet[]
  /** marshal sectors under yellow (from race control), sector number -> double yellow? */
  yellowSectors: Record<number, boolean>
  /** id of the radio clip whose non-empty transcript arrived most recently */
  latestTranscriptId: number | null
  weather: Weather | null
  forecast: Forecast | null
  director: DirectorPick | null
  /** strategy alerts, newest first (updated in place by id) */
  alerts: StrategyAlert[]
  /** run timeline: TLA -> lap number -> lap */
  laps: Record<string, Record<number, LapCell>>
  seq: number
}

/** Opens a replay stream; returns a function that closes it. Live (EventSource) and mock share this shape. */
export type ReplayTransport = (params: ReplayParams, onEvent: (event: ReplayEvent) => void) => () => void
/** Subscribes to a live session; the stream reconnects on its own and reports `connection` events. */
export type LiveTransport = (params: LiveParams, onEvent: (event: ReplayEvent) => void) => () => void
