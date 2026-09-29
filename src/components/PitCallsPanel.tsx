import { useState } from 'react'
import type { PitCallSet, TrackStatus } from '../liveTypes'
import { NEUTRALISED } from '../liveTypes'
import { STATUS_LABEL } from '../lib/replay'
import { CompoundPill } from './CompoundPill'

interface Props {
  sets: PitCallSet[]
  trackStatus: TrackStatus | null
  follow: string | null
}

const SHORT: Partial<Record<TrackStatus, string>> = { SAFETY_CAR: 'SC', VSC: 'VSC', VSC_ENDING: 'VSC' }

export function PitCallsPanel({ sets, trackStatus, follow }: Props) {
  // null = follow the latest set; a new set always jumps back to it.
  const [picked, setPicked] = useState<number | null>(null)
  const [seen, setSeen] = useState(sets.length)
  if (seen !== sets.length) {
    setSeen(sets.length)
    setPicked(null)
  }
  const latest = sets.at(-1)
  const set = sets.find((s) => s.id === picked) ?? latest
  const active = !!set && set === latest && trackStatus !== null && NEUTRALISED.includes(trackStatus)

  if (!set) {
    return (
      <section className="calls calls--empty" id="pit-calls" aria-label="Pit wall calls">
        <h2 className="live-h">Pit wall calls</h2>
        <p className="muted">
          Waiting for a neutralisation. When a safety car or VSC is deployed the pit wall calls PIT or STAY OUT for
          every car here.
        </p>
      </section>
    )
  }

  const r = set.report
  const counts = { PIT: 0, 'STAY OUT': 0 }
  for (const c of r.calls) if (c.call === 'PIT' || c.call === 'STAY OUT') counts[c.call]++

  return (
    <section className={`calls${active ? ' calls--active' : ''}`} id="pit-calls" aria-label="Pit wall calls">
      {sets.length > 1 && (
        <div className="calls__tabs" role="tablist" aria-label="Pit call sets by lap">
          {sets.map((s) => (
            <button
              key={s.id}
              type="button"
              role="tab"
              aria-selected={s === set}
              className="calls__tab"
              onClick={() => setPicked(s.id)}
            >
              {SHORT[s.report.track_status] ?? STATUS_LABEL[s.report.track_status]} · L{s.report.lap ?? '?'}
            </button>
          ))}
        </div>
      )}
      <div className="calls__body" key={set.id}>
        <header className="calls__head">
          <h2 className="calls__title">
            {STATUS_LABEL[r.track_status]} — LAP {r.lap ?? '?'} — PIT WALL CALLS
          </h2>
          <p className="calls__meta">
            {r.laps_remaining !== null && <span>{r.laps_remaining} laps remaining</span>}
            {r.pit_loss_now_s !== null && (
              <span>
                stop costs <b>~{r.pit_loss_now_s}s</b>
                {r.green_pit_loss_s !== null && <> vs ~{r.green_pit_loss_s}s green</>}
              </span>
            )}
            <span className="calls__count">
              <b className="call--pit">{counts.PIT} PIT</b> · {counts['STAY OUT']} STAY OUT
            </span>
          </p>
        </header>
        <div className="calls__scroll">
          <table className="calls__table">
            <thead>
              <tr>
                <th scope="col">P</th>
                <th scope="col">Driver</th>
                <th scope="col">Call</th>
                <th scope="col">Tyre</th>
                <th scope="col" className="calls__risk" title="Cars within the pit loss behind">
                  Risk
                </th>
                <th scope="col">Reason</th>
              </tr>
            </thead>
            <tbody>
              {r.calls.map((c) => (
                <tr
                  key={c.tla}
                  className={`calls__row calls__row--${c.call.replace(' ', '-').toLowerCase()}${c.tla === follow ? ' is-followed' : ''}`}
                >
                  <td className="calls__pos">{c.position ?? '—'}</td>
                  <td className="calls__tla">{c.tla}</td>
                  <td>
                    <span className="call">{c.call}</span>
                  </td>
                  <td className="calls__tyre">
                    {c.compound ? (
                      <CompoundPill
                        compound={c.compound}
                        text={c.tyre_age_laps === null ? '—' : String(c.tyre_age_laps)}
                      />
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="calls__risk">{c.places_at_risk ?? ''}</td>
                  <td className="calls__reason">{c.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {r.assumptions.length > 0 && (
          <ul className="calls__assume" aria-label="Assumptions">
            {r.assumptions.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}
