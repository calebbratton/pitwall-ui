import type { LapCell, TimingRow } from '../liveTypes'
import { classify, fmtLap, recentPace } from '../lib/runTimeline'

interface Props {
  laps: Record<string, Record<number, LapCell>>
  /** running order (from the snapshot) */
  drivers: TimingRow[]
  follow: string | null
  onFollow: (tla: string | null) => void
  rows?: number
}

/**
 * The pit wall's run timeline: a column per car in running order, a row per lap (newest on top),
 * each lap coloured purple (fastest of the race), green (personal best), yellow (pit in/out),
 * grey (SC/VSC), red (over a second off the driver's recent pace).
 */
export function RunTimeline({ laps, drivers, follow, onFollow, rows = 15 }: Props) {
  const order = drivers.filter((d) => laps[d.tla])
  const last = Math.max(0, ...order.flatMap((d) => Object.keys(laps[d.tla]).map(Number)))
  if (!order.length || last < 1) {
    return (
      <section className="rt rt--empty" aria-label="Run timeline">
        <p className="muted">Lap times appear here as cars complete laps.</p>
      </section>
    )
  }
  const lapNumbers = Array.from({ length: Math.min(rows, last) }, (_, i) => last - i)
  return (
    <section className="rt" aria-label="Run timeline: lap times per driver">
      <div className="rt__scroll">
        <table className="rt__table">
          <thead>
            <tr>
              <th className="rt__lap">Lap</th>
              {order.map((d) => (
                <th
                  key={d.tla}
                  className={d.tla === follow ? 'is-follow' : undefined}
                  style={d.team_colour ? { borderBottomColor: `#${d.team_colour}` } : undefined}
                >
                  <button type="button" onClick={() => onFollow(d.tla === follow ? null : d.tla)}>
                    {d.tla}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {lapNumbers.map((n) => (
              <tr key={n}>
                <th className="rt__lap">{n}</th>
                {order.map((d) => {
                  const c = laps[d.tla][n]
                  const kind = classify(c, recentPace(laps[d.tla], n))
                  const text = c?.pit_in ? 'IN' : c?.pit_out ? 'OUT' : fmtLap(c?.time ?? null)
                  return (
                    <td
                      key={d.tla}
                      className={`rt__c rt__c--${kind}${d.tla === follow ? ' is-follow' : ''}`}
                      title={c ? `${d.tla} lap ${n}: ${fmtLap(c.time) || '—'} · ${c.compound ?? '?'} ${c.tyre_age ?? '?'} laps old` : undefined}
                    >
                      {text}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
