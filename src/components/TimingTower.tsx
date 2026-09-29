import type { RadioItem, Snapshot, TimingRow, TrackStatus } from '../liveTypes'
import { formatClock, formatGap, formatInterval, STATUS_LABEL } from '../lib/replay'
import { CompoundPill } from './CompoundPill'

interface Props {
  snapshot: Snapshot | null
  trackStatus: TrackStatus | null
  follow: string | null
  onFollow: (tla: string | null) => void
  /** most recent clip with a transcript, shown in a strip under the header */
  latestTranscript: RadioItem | null
  loading: boolean
}

function Row({ d, followed, onFollow }: { d: TimingRow; followed: boolean; onFollow: Props['onFollow'] }) {
  const cls = ['tt__row', d.retired && 'is-out', d.in_pit && !d.retired && 'is-pit', followed && 'is-followed'].filter(Boolean).join(' ')
  return (
    <tr className={cls}>
      <td className="tt__pos">{d.retired ? '—' : (d.position ?? '')}</td>
      <td className="tt__drv">
        <span
          className="tt__colour"
          aria-hidden="true"
          style={d.team_colour ? { background: `#${d.team_colour}` } : undefined}
        />
        <button
          type="button"
          className="tt__tla"
          aria-pressed={followed}
          title={followed ? `Stop following ${d.tla}` : `Follow ${d.tla} (hear their team radio)`}
          onClick={() => onFollow(followed ? null : d.tla)}
        >
          {d.tla}
        </button>
        <span className="tt__team">{d.team}</span>
      </td>
      <td className={`tt__gap${d.position === 1 && !d.retired ? ' is-leader' : ''}`}>{formatGap(d)}</td>
      <td className="tt__int">{formatInterval(d)}</td>
      <td className="tt__tyre">
        {d.compound ? <CompoundPill compound={d.compound} text={d.tyre_age === null ? '—' : String(d.tyre_age)} /> : '—'}
      </td>
      <td className="tt__pits">{d.pit_stops}</td>
      <td className="tt__flag">
        {d.in_pit && !d.retired && <span className="badge badge--pit">PIT</span>}
        {d.retired && <span className="badge badge--out">OUT</span>}
      </td>
    </tr>
  )
}

export function TimingTower({ snapshot, trackStatus, follow, onFollow, latestTranscript, loading }: Props) {
  const status = trackStatus ?? snapshot?.status ?? null
  return (
    <section className="tt" aria-label="Timing tower">
      <header className="tt__head">
        <span className="tt__lap">
          LAP <b>{snapshot?.lap ?? '–'}</b>
          <span className="tt__total">/{snapshot?.total_laps ?? '–'}</span>
        </span>
        {status && <span className={`ts-chip ts-chip--${status.toLowerCase()}`}>{STATUS_LABEL[status]}</span>}
        {snapshot?.clock && <span className="tt__clock">{formatClock(snapshot.clock)}</span>}
      </header>
      {latestTranscript && latestTranscript.text && (
        <p className="tt__radio" key={latestTranscript.id} aria-live="polite">
          <span className="tt__radio-who">
            <span aria-hidden="true">📻</span> {latestTranscript.tla}
          </span>
          <q>{latestTranscript.text}</q>
        </p>
      )}
      <div className="tt__scroll">
        {snapshot && snapshot.drivers.length > 0 ? (
          <table className="tt__table">
            <thead>
              <tr>
                <th scope="col">P</th>
                <th scope="col">Driver</th>
                <th scope="col">Gap</th>
                <th scope="col">Int</th>
                <th scope="col">Tyre</th>
                <th scope="col" title="Pit stops">
                  Stops
                </th>
                <th scope="col">
                  <span className="sr-only">Status</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {snapshot.drivers.map((d) => (
                <Row key={d.tla} d={d} followed={d.tla === follow} onFollow={onFollow} />
              ))}
            </tbody>
          </table>
        ) : (
          <p className="tt__empty">
            {loading
              ? 'Loading the archive… the first replay of a race downloads it (a few seconds).'
              : 'Timing appears here once the replay starts.'}
          </p>
        )}
      </div>
    </section>
  )
}
