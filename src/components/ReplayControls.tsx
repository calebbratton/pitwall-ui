import type { LiveSessionInfo, ReplayPhase } from '../liveTypes'
import type { Sessions } from '../hooks/useSessions'

const SEASONS = [2026, 2025, 2024] as const
const SPEEDS = [1, 10, 30, 60, 120] as const

interface Props {
  year: number
  onYear: (year: number) => void
  sessions: Sessions
  path: string | null
  onPath: (path: string) => void
  speed: number
  onSpeed: (speed: number) => void
  fromLap: string
  onFromLap: (v: string) => void
  maxLap: number | null
  phase: ReplayPhase
  onPlay: () => void
  onStop: () => void
  /** "Azerbaijan Grand Prix — Race" once known */
  title: string | null
}

const PHASE_TEXT: Record<ReplayPhase, string> = {
  idle: 'READY',
  connecting: 'LOADING',
  running: 'PLAYING',
  ended: 'FINISHED',
  stopped: 'STOPPED',
  error: 'ERROR',
}

function raceLabel(s: LiveSessionInfo) {
  return `${s.date.slice(5)} · ${s.meeting.replace(/ Grand Prix$/, ' GP')}`
}

export function ReplayControls(p: Props) {
  const active = p.phase === 'connecting' || p.phase === 'running'
  const { sessions, loading, error } = p.sessions
  return (
    <div className="rc-bar">
      <form
        className="rc-bar__form"
        onSubmit={(e) => {
          e.preventDefault()
          if (active) p.onStop()
          else p.onPlay()
        }}
      >
        <label className="field">
          <span className="field__label">Season</span>
          <select value={p.year} onChange={(e) => p.onYear(Number(e.target.value))} disabled={active}>
            {SEASONS.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </label>
        <label className="field field--race">
          <span className="field__label">Race</span>
          <select
            value={p.path ?? ''}
            onChange={(e) => p.onPath(e.target.value)}
            disabled={active || loading || sessions.length === 0}
          >
            {loading && <option value="">Loading…</option>}
            {!loading && sessions.length === 0 && <option value="">{error ? 'Unavailable' : 'No races'}</option>}
            {[...sessions].reverse().map((s) => (
              <option key={s.path} value={s.path}>
                {raceLabel(s)}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span className="field__label">Speed</span>
          <select value={p.speed} onChange={(e) => p.onSpeed(Number(e.target.value))} disabled={active}>
            {SPEEDS.map((s) => (
              <option key={s} value={s}>
                {s}x
              </option>
            ))}
          </select>
        </label>
        <label className="field field--lap">
          <span className="field__label">From lap</span>
          <input
            type="number"
            inputMode="numeric"
            min={1}
            max={p.maxLap ?? 99}
            placeholder="1"
            value={p.fromLap}
            onChange={(e) => p.onFromLap(e.target.value)}
            disabled={active}
          />
        </label>
        <button
          type="submit"
          className={`btn rc-bar__play ${active ? 'is-stop' : 'btn--primary'}`}
          disabled={!active && !p.path}
        >
          {active ? '■ Stop' : '▶ Play'}
        </button>
      </form>
      <div className="rc-bar__now">
        <span className="replay-badge" title="Archived race replayed as if live">
          REPLAY
        </span>
        <span className="rc-bar__title">{p.title ?? 'Pick a race and press play'}</span>
        <span className={`tag tag--phase-${p.phase}`}>{PHASE_TEXT[p.phase]}</span>
      </div>
      {error && (
        <p className="rc-bar__err" role="alert">
          Could not load races: {error}
        </p>
      )}
    </div>
  )
}
