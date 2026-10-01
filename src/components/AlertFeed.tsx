import { useState } from 'react'
import { useAlertNotifications } from '../hooks/useAlertNotifications'
import type { DirectorPick, StrategyAlert } from '../liveTypes'

interface Props {
  alerts: StrategyAlert[]
  follow: string | null
  director?: DirectorPick | null
}

const pct = (p: number) => `${Math.round(p * 100)}%`

/** The Director's pick: which onboard to watch for the most likely battle (switch it yourself). */
function DirectorCard({ pick }: { pick: DirectorPick }) {
  const w = pick.watch
  if (!w) return null
  return (
    <div className="af__director" aria-live="polite">
      <p className="af__watch">
        Watch <b>{w.chaser}</b>'s onboard
        <span className="af__why">
          {' '}
          — {w.gap.toFixed(1)} s behind {w.ahead}
          {w.position ? ` for P${w.position}` : ''}
          {w.closing > 0.05 ? `, closing ${w.closing.toFixed(1)} s / 3 laps` : ''}
        </span>
      </p>
      <p className="af__odds">
        pass in 5 laps {pct(w.p_pass)} · within 1 s soon {pct(w.p_close)}
      </p>
      {pick.battles.length > 1 && (
        <p className="af__next">
          Next:{' '}
          {pick.battles
            .slice(1)
            .map((b) => `${b.chaser} on ${b.ahead} (${pct(b.p_pass)})`)
            .join(' · ')}
        </p>
      )}
    </div>
  )
}

const KIND_LABEL: Record<string, string> = {
  sc_call: 'SC / VSC',
  battle: 'Battle',
  undercut: 'Undercut',
  pit_stop: 'Pit stops',
  fastest_lap: 'Fastest lap',
  weather: 'Weather',
}

const OUTCOME_LABEL: Record<string, string> = { worked: 'worked', failed: "didn't work", 'not taken': 'not taken' }
const BATTLE_OUTCOME: Record<string, string> = { worked: 'passed', failed: 'no pass' }

/**
 * The strategy alert stream: a short list of calls at the moments that matter (backend
 * alerts.py decides when; nothing here is generated). Newest first; an alert updates in place and
 * shows how it turned out.
 */
export function AlertFeed({ alerts, follow, director }: Props) {
  const [mine, setMine] = useState(false)
  const notify = useAlertNotifications(alerts)
  const shown = mine && follow ? alerts.filter((a) => a.drivers.includes(follow)) : alerts
  return (
    <section className="af" aria-label="Strategy calls">
      <header className="af__head">
        <h2 className="live-h">Strategy calls</h2>
        {notify.supported && (
          <button
            type="button"
            className="btn btn--xs"
            aria-pressed={notify.on}
            title="Browser notifications for battles, safety-car calls and undercuts"
            onClick={() => void notify.toggle()}
          >
            {notify.on ? '🔔 On' : '🔕 Notify'}
          </button>
        )}
        {follow && (
          <button type="button" className="btn btn--xs" aria-pressed={mine} onClick={() => setMine(!mine)}>
            {mine ? `Only ${follow}` : 'All cars'}
          </button>
        )}
      </header>
      {director && <DirectorCard pick={director} />}
      {shown.length === 0 ? (
        <p className="muted af__empty">
          Calls appear here when something matters: a safety car, an undercut that's on, pit stops, rain. Quiet laps
          stay quiet.
        </p>
      ) : (
        <ol className="af__list">
          {shown.map((a) => (
            <li
              key={a.id}
              className={`af__item af__item--${a.kind}${follow && a.drivers.includes(follow) ? ' is-follow' : ''}`}
            >
              <div className="af__meta">
                <span className="af__kind">{KIND_LABEL[a.kind] ?? a.kind}</span>
                {a.lap !== null && <span>L{a.lap}</span>}
                {a.p !== null && <span className="af__p">{Math.round(a.p * 100)}%</span>}
                {a.outcome && (
                  <span className={`af__outcome af__outcome--${a.outcome.replace(' ', '-')}`}>
                    {(a.kind === 'battle' ? BATTLE_OUTCOME : OUTCOME_LABEL)[a.outcome] ?? a.outcome}
                  </span>
                )}
              </div>
              <p className="af__headline">{a.text ?? a.headline}</p>
              {a.text && <p className="af__detail">{a.headline}</p>}
              {a.detail && <p className="af__detail">{a.detail}</p>}
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}
