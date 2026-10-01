import { useState } from 'react'
import type { StrategyAlert } from '../liveTypes'

interface Props {
  alerts: StrategyAlert[]
  follow: string | null
}

const KIND_LABEL: Record<string, string> = {
  sc_call: 'SC / VSC',
  undercut: 'Undercut',
  pit_stop: 'Pit stops',
  fastest_lap: 'Fastest lap',
  weather: 'Weather',
}

const OUTCOME_LABEL: Record<string, string> = { worked: 'worked', failed: "didn't work", 'not taken': 'not taken' }

/**
 * The strategy alert stream: a short list of calls at the moments that matter (backend
 * alerts.py decides when; nothing here is generated). Newest first; an alert updates in place and
 * shows how it turned out.
 */
export function AlertFeed({ alerts, follow }: Props) {
  const [mine, setMine] = useState(false)
  const shown = mine && follow ? alerts.filter((a) => a.drivers.includes(follow)) : alerts
  return (
    <section className="af" aria-label="Strategy calls">
      <header className="af__head">
        <h2 className="live-h">Strategy calls</h2>
        {follow && (
          <button type="button" className="btn btn--xs" aria-pressed={mine} onClick={() => setMine(!mine)}>
            {mine ? `Only ${follow}` : 'All cars'}
          </button>
        )}
      </header>
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
                    {OUTCOME_LABEL[a.outcome]}
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
