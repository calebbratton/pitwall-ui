import type { TrackStatus } from '../liveTypes'
import { NEUTRALISED } from '../liveTypes'
import { STATUS_LABEL } from '../lib/replay'

interface Props {
  status: TrackStatus | null
  lap: number | null
  totalLaps: number | null
  /** there are pit wall calls for the current neutralisation */
  callsLap: number | null
}

const HINT: Partial<Record<TrackStatus, string>> = {
  YELLOW: 'Local yellow — no overtaking in the sector',
  SAFETY_CAR: 'Field neutralised behind the safety car — cheap pit stop window',
  VSC: 'Virtual safety car — delta time, cheaper pit stop',
  VSC_ENDING: 'VSC ending — racing resumes shortly',
  RED_FLAG: 'Session suspended',
}

export function TrackStatusBanner({ status, lap, totalLaps, callsLap }: Props) {
  const s = status ?? 'UNKNOWN'
  const neutral = NEUTRALISED.includes(s)
  return (
    <div className={`tsb tsb--${s.toLowerCase()}`} role="status" aria-live="polite">
      <span className="tsb__flag" aria-hidden="true" />
      <span className="tsb__label">{status ? STATUS_LABEL[s] : 'NO SESSION'}</span>
      {lap !== null && (
        <span className="tsb__lap">
          LAP {lap}
          {totalLaps ? `/${totalLaps}` : ''}
        </span>
      )}
      {status && HINT[s] && <span className="tsb__hint">{HINT[s]}</span>}
      {neutral && callsLap !== null && (
        <a className="tsb__jump" href="#pit-calls">
          Pit wall calls ↓
        </a>
      )}
    </div>
  )
}
