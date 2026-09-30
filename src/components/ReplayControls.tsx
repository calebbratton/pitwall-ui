import { useState, type ReactNode } from 'react'
import type { LiveSessionInfo } from '../liveTypes'
import type { Sessions } from '../hooks/useSessions'

// Pit Wall covers the current season and the one before (rolling; matches the backend's
// GET /api/seasons).
const CURRENT_YEAR = new Date().getFullYear()
const SEASONS = [CURRENT_YEAR, CURRENT_YEAR - 1] as const
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
  /** a test replay is loading or playing (Play turns into Stop) */
  replayActive: boolean
  onPlay: () => void
  onStop: () => void
  /** left side: what's on screen (live session / test replay) and its state */
  now: ReactNode
  /** extra actions before the test replay group (Back to live, Start following live feed) */
  actions?: ReactNode
}

function raceLabel(s: LiveSessionInfo) {
  return `${s.date.slice(5)} · ${s.meeting.replace(/ Grand Prix$/, ' GP')}`
}

/**
 * Session bar: what's on screen and its state (from the caller), live actions, and the test replay group.
 * Test replays (an archived race played as if live)
 * are a dev/testing affordance between race weekends, so their options sit in a collapsed group.
 */
export function ReplayControls(p: Props) {
  const [open, setOpen] = useState(false)
  const active = p.replayActive
  const { sessions, loading, error } = p.sessions
  const selected = sessions.find((s) => s.path === p.path)
  return (
    <div className={`rc-bar${open ? ' is-open' : ''}`}>
      <div className="rc-bar__now">{p.now}</div>
      <div className="rc-bar__test">
        {p.actions}
        {!open && (
          <button
            type="button"
            className={`btn btn--xs rc-bar__quick ${active ? 'is-stop' : ''}`}
            disabled={!active && !p.path}
            title={active ? 'Stop the test replay' : selected ? `Test replay: ${raceLabel(selected)}, ${p.speed}x` : undefined}
            onClick={active ? p.onStop : p.onPlay}
          >
            {active ? '■ Stop' : '▶ Test replay'}
          </button>
        )}
        <button
          type="button"
          className="btn btn--xs rc-bar__toggle"
          aria-expanded={open}
          aria-controls="test-replay"
          onClick={() => setOpen(!open)}
        >
          {open ? 'Test replay ▴' : 'Options ▾'}
        </button>
      </div>
      <form
        id="test-replay"
        hidden={!open}
        aria-label="Test replay"
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
          {active ? '■ Stop' : '▶ Play test replay'}
        </button>
      </form>
      {error && (
        <p className="rc-bar__err" role="alert">
          Could not load races: {error}
        </p>
      )}
    </div>
  )
}
