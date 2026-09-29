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
}

export interface Snapshot {
  lap: number | null
  total_laps: number | null
  status: TrackStatus
  clock: string | null
  drivers: TimingRow[]
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

export type ReplayEvent =
  | ({ type: 'session' } & SessionHeader)
  | ({ type: 'snapshot' } & Snapshot)
  | { type: 'track_status'; status: TrackStatus; lap: number | null }
  | { type: 'race_control'; lap: number | null; category: string; message: string }
  | { type: 'radio'; driver: string; tla: string; utc: string | null; url: string; text: string | null }
  | { type: 'radio_transcript'; url: string; tla: string; text: string }
  | { type: 'pit_calls'; report: PitCallReport }
  | { type: 'end' }
  | { type: 'error'; message: string }

export type ReplayEventName = ReplayEvent['type']

export const REPLAY_EVENT_NAMES: readonly ReplayEventName[] = [
  'session',
  'snapshot',
  'track_status',
  'race_control',
  'radio',
  'radio_transcript',
  'pit_calls',
  'end',
  'error',
]

export interface ReplayParams {
  path: string
  speed: number
  fromLap: number | null
  /** display name of the chosen race, used until the `session` event arrives */
  meeting: string
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
  params: ReplayParams | null
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
  /** id of the radio clip whose non-empty transcript arrived most recently */
  latestTranscriptId: number | null
  seq: number
}

/** Opens a replay stream; returns a function that closes it. Live (EventSource) and mock share this shape. */
export type ReplayTransport = (params: ReplayParams, onEvent: (event: ReplayEvent) => void) => () => void
