import { Fragment, useState, type CSSProperties } from 'react'
import type { PredictionSet, TimingRow, TrackStatus } from '../liveTypes'
import { NEUTRALISED } from '../liveTypes'
import { formatPct, STATUS_LABEL } from '../lib/replay'
import { CompoundPill } from './CompoundPill'

interface Props {
  sets: PredictionSet[]
  /** current timing rows, for team colours */
  drivers: TimingRow[]
  totalLaps: number | null
  trackStatus: TrackStatus | null
  follow: string | null
  onFollow: (tla: string | null) => void
}

const tabKey = (s: PredictionSet) => `${s.prediction.lap}${s.source}`

/** 1-based count of earlier tabs with the same label (two questions on one lap -> "L31?", "L31?2"). */
function repeat(sets: PredictionSet[], i: number): number {
  const k = tabKey(sets[i])
  return sets.slice(0, i + 1).filter((s) => tabKey(s) === k).length
}

export function PredictionPanel({ sets, drivers, totalLaps, trackStatus, follow, onFollow }: Props) {
  // null = follow the latest prediction; a new one always jumps back to it.
  const [picked, setPicked] = useState<number | null>(null)
  const [seen, setSeen] = useState(sets.length)
  const [note, setNote] = useState<string | null>(null)
  if (seen !== sets.length) {
    setSeen(sets.length)
    setPicked(null)
  }
  const latest = sets.at(-1)
  const set = sets.find((s) => s.id === picked) ?? latest
  const p = set?.prediction
  const active =
    !!set && set === latest && trackStatus !== null && NEUTRALISED.includes(trackStatus) && NEUTRALISED.includes(p?.status ?? 'UNKNOWN')

  if (!set || !p) {
    return (
      <section className="calls pred calls--empty" id="who-wins" aria-label="Who wins from here">
        <h2 className="live-h">Who wins from here?</h2>
        <p className="muted">
          When a safety car or VSC comes out, simulated finishes from the current order land here: win and podium
          chances, and whether each car's tyres last to the flag. Ask strategy “Who wins from here?” for one any time.
        </p>
      </section>
    )
  }

  const colour = new Map(drivers.map((d) => [d.tla, d.team_colour]))
  const maxWin = Math.max(0.01, ...p.table.map((r) => r.p_win))
  const total = totalLaps ?? (p.lap !== null && p.laps_remaining !== null ? p.lap + p.laps_remaining : null)

  return (
    <section className={`calls pred${active ? ' calls--active' : ''}`} id="who-wins" aria-label="Who wins from here">
      {sets.length > 1 && (
        <div className="calls__tabs" role="tablist" aria-label="Predictions by lap">
          {sets.map((s, i) => (
            <button
              key={s.id}
              type="button"
              role="tab"
              aria-selected={s === set}
              className="calls__tab"
              title={s.source === 'ask' ? 'From a question to strategy' : `Pushed at the ${STATUS_LABEL[s.prediction.status]}`}
              onClick={() => setPicked(s.id)}
            >
              L{s.prediction.lap ?? '?'}
              {s.source === 'ask' && <span className="pred__q">?</span>}
              {repeat(sets, i) > 1 && <span className="pred__n">{repeat(sets, i)}</span>}
            </button>
          ))}
        </div>
      )}
      <div className="calls__body" key={set.id}>
        <header className="calls__head">
          <h2 className="calls__title">Who wins from here?</h2>
          <p className="calls__meta">
            <span>
              LAP <b>{p.lap ?? '?'}</b>
              {total ? `/${total}` : ''} ·{' '}
              <span className={`pred__status pred__status--${p.status.toLowerCase()}`}>{STATUS_LABEL[p.status]}</span>
              {p.sims !== null && <> · {p.sims.toLocaleString('en-US')} sims</>}
            </span>
            {p.laps_remaining !== null && <span>{p.laps_remaining} laps to go</span>}
            {set.source === 'ask' && <span className="pred__src">asked in chat</span>}
          </p>
        </header>
        <div className="calls__scroll">
          <table className="calls__table pred__table">
            <thead>
              <tr>
                <th scope="col">P</th>
                <th scope="col">Driver</th>
                <th scope="col">Tyre</th>
                <th scope="col" title="Has the car made its pit stop?">
                  Stop
                </th>
                <th scope="col">Win</th>
                <th scope="col" className="pred__podium-h">
                  Podium
                </th>
                <th scope="col" title="Will the tyres last to the flag?">
                  Tyre risk
                </th>
              </tr>
            </thead>
            <tbody>
              {p.table.map((r) => {
                const c = colour.get(r.tla)
                const followed = r.tla === follow
                const noteOpen = note === r.tla
                return (
                  <Fragment key={r.tla}>
                    <tr className={`calls__row pred__row${followed ? ' is-followed' : ''}`}>
                      <td className="calls__pos">{r.position ?? '—'}</td>
                      <td className="pred__drv">
                        <span className="tt__colour" aria-hidden="true" style={c ? { background: `#${c}` } : undefined} />
                        <button
                          type="button"
                          className="tt__tla"
                          aria-pressed={followed}
                          title={followed ? `Stop following ${r.tla}` : `Follow ${r.tla}`}
                          onClick={() => onFollow(followed ? null : r.tla)}
                        >
                          {r.tla}
                        </button>
                        {r.expected !== null && (
                          <span className="pred__exp" title="Expected finishing position">
                            →P{r.expected.toFixed(1)}
                          </span>
                        )}
                      </td>
                      <td className="calls__tyre">
                        {r.compound ? (
                          <CompoundPill compound={r.compound} text={r.tyre_age === null ? '—' : String(r.tyre_age)} />
                        ) : (
                          '—'
                        )}
                        {r.compound_c && (
                          <span className="pred__cc" title={`Pirelli ${r.compound_c} this weekend`}>
                            {r.compound_c}
                          </span>
                        )}
                      </td>
                      <td>
                        {r.stopped ? (
                          <span className="badge badge--stopped" title="Has made a pit stop">
                            STOPPED
                          </span>
                        ) : (
                          <span className="badge badge--tostop" title="Still has to make a pit stop">
                            TO STOP
                          </span>
                        )}
                      </td>
                      <td className="pred__win">
                        <span className="pred__bar" aria-hidden="true">
                          <span style={{ '--w': `${(r.p_win / maxWin) * 100}%` } as CSSProperties} />
                        </span>
                        <b>{formatPct(r.p_win)}</b>
                      </td>
                      <td className="pred__podium">{formatPct(r.p_podium)}</td>
                      <td>
                        {r.tyre_risk ? (
                          <button
                            type="button"
                            className={`risk risk--${r.tyre_risk}`}
                            title={r.tyre_note || undefined}
                            aria-expanded={noteOpen}
                            aria-label={`${r.tyre_risk} tyre risk${r.tyre_note ? `: ${r.tyre_note}` : ''}`}
                            onClick={() => setNote(noteOpen ? null : r.tla)}
                          >
                            {r.tyre_risk.toUpperCase()}
                          </button>
                        ) : (
                          '—'
                        )}
                      </td>
                    </tr>
                    {noteOpen && r.tyre_note && (
                      <tr className="pred__note">
                        <td />
                        <td colSpan={6}>
                          <b>{r.tla}</b> {r.tyre_note}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
        {p.notes.length > 0 && (
          <details className="pred__notes">
            <summary>Model notes · {p.notes.length}</summary>
            <ul className="calls__assume">
              {p.notes.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          </details>
        )}
      </div>
    </section>
  )
}
