import { useCallback, useRef, useState } from 'react'
import type { Snapshot, TrackStatus } from '../liveTypes'
import { battle, DEFAULT_LAP_S, drawGap, labelLevels, linePos, REJOIN_LABEL, trend } from '../lib/trackLine'

interface Props {
  snapshot: Snapshot | null
  trackStatus: TrackStatus | null
  follow: string | null
  onFollow: (tla: string | null) => void
}

interface Sample {
  lap: number
  ahead: number | null
  behind: number | null
}

// 2% margins so the leader's and the last car's labels stay inside the strip
const pct = (pos: number) => `${2 + pos * 96}%`
const fmt = (s: number | null) => (s === null ? '—' : `${s.toFixed(1)}s`)
const signed = (s: number | null) => (s === null ? '' : `${s > 0 ? '+' : ''}${s.toFixed(1)}s`)

/**
 * The pit wall's "track line": every car on one lap-long line by its gap to the leader (cars race
 * to the right), built from timing gaps so it works live without car positions. For the followed
 * car: ghost markers where it would rejoin if it pitted now (green / SC / VSC), and its battle
 * with the cars around it.
 */
export function TrackLine({ snapshot, trackStatus, follow, onFollow }: Props) {
  // per car: interval to the car ahead / from the car behind, by lap (for closing / pulling away)
  const [history, setHistory] = useState<{ lap: number | null; cars: Record<string, Sample[]> }>({ lap: null, cars: {} })
  // Callback ref: the strip only mounts once there is a snapshot, so measure it when it appears.
  const [width, setWidth] = useState(1000)
  const observer = useRef<ResizeObserver | null>(null)
  const lineRef = useCallback((el: HTMLDivElement | null) => {
    observer.current?.disconnect()
    observer.current = null
    if (!el) return
    const ro = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width))
    ro.observe(el)
    observer.current = ro
  }, [])
  const drivers = snapshot?.drivers ?? []
  const lap = snapshot?.lap ?? null
  if (lap !== null && lap !== history.lap) {
    const cars: Record<string, Sample[]> = {}
    for (const d of drivers) {
      const b = battle(drivers, d.tla)
      const prev = (history.cars[d.tla] ?? []).filter((h) => h.lap < lap)
      cars[d.tla] = [...prev, { lap, ahead: b?.ahead?.gap ?? null, behind: b?.behind?.gap ?? null }].slice(-12)
    }
    setHistory({ lap, cars })
  }

  if (!snapshot || drivers.length === 0) return null
  const lapTime = snapshot.lap_time_s ?? DEFAULT_LAP_S
  const cars = drivers.flatMap((d) => {
    const pos = linePos(drawGap(d), lapTime)
    return pos === null || d.in_pit ? [] : [{ d, pos }]
  })
  const me = follow ? drivers.find((d) => d.tla === follow) : undefined
  const myGap = me ? drawGap(me) : null
  const rejoins = follow ? (snapshot.rejoin?.[follow] ?? []) : []
  const fight = follow ? battle(drivers, follow) : null
  const h = follow ? (history.cars[follow] ?? []) : []
  const aheadTrend = trend(h.map((r) => ({ lap: r.lap, gap: r.ahead })))
  const behindTrend = trend(h.map((r) => ({ lap: r.lap, gap: r.behind })))
  const levels = labelLevels(
    cars.map(({ d, pos }) => ({
      tla: d.tla,
      pos: pos * 0.96,
      priority: d.tla === follow || d.tla === fight?.ahead?.tla || d.tla === fight?.behind?.tla,
    })),
    width,
  )
  const ghosts = rejoins.flatMap((r) => {
    const pos = myGap === null ? null : linePos(myGap + r.loss, lapTime)
    return pos === null ? [] : [{ r, pos }]
  })
  const ghostLevels = labelLevels(
    ghosts.map(({ r, pos }) => ({ tla: r.kind, pos: pos * 0.96, priority: false })),
    width,
    58,
  )
  const ghostRows = Math.max(0, ...ghosts.map(({ r }) => ghostLevels.get(r.kind) ?? 0))
  const neutralised = trackStatus === 'SAFETY_CAR' || trackStatus === 'VSC' || trackStatus === 'VSC_ENDING'

  return (
    <section className="tl" aria-label="Track line: the field by gap to the leader">
      <div className="tl__line" ref={lineRef} style={{ height: 66 + 11 * ghostRows }} role="img" aria-label="Cars by gap to the leader; direction of travel to the right">
        <span className="tl__lap" />
        {ghosts.map(({ r, pos }) => (
          <span key={r.kind} className={`tl__ghost tl__ghost--${r.kind}`} style={{ left: pct(pos) }}>
            <span className="tl__ghost-label" style={{ top: 22 + 11 * (ghostLevels.get(r.kind) ?? 0) }}>
              {REJOIN_LABEL[r.kind]} P{r.position}
            </span>
          </span>
        ))}
        {cars.map(({ d, pos }) => {
          const followed = d.tla === follow
          const level = levels.get(d.tla) ?? null
          return (
            <button
              type="button"
              key={d.tla}
              className={`tl__car${followed ? ' is-follow' : ''} tl__car--l${level ?? 'x'}`}
              style={{ left: pct(pos) }}
              title={`P${d.position} ${d.tla} ${d.position === 1 ? 'leader' : `+${fmt(d.gap)}`}`}
              aria-pressed={followed}
              onClick={() => onFollow(followed ? null : d.tla)}
            >
              <span className="tl__dot" style={d.team_colour ? { background: `#${d.team_colour}` } : undefined} />
              <span className="tl__tla">{d.tla}</span>
            </button>
          )
        })}
      </div>
      <div className="tl__info">
        {!follow && <span className="muted">Pick a driver to see where they'd rejoin if they pitted now.</span>}
        {follow && fight && (
          <span className="tl__battle">
            <b>{follow}</b>
            {fight.ahead && (
              <>
                {' '}· ahead {fight.ahead.tla} {fmt(fight.ahead.gap)}
                {aheadTrend !== null && (
                  <span className={aheadTrend < 0 ? 'tl__closing' : 'tl__opening'}> ({signed(aheadTrend)} / 3 laps)</span>
                )}
                {fight.ahead.gap !== null && fight.ahead.gap < 1 && <span className="tl__tag">OVERTAKE RANGE</span>}
              </>
            )}
            {fight.behind && (
              <>
                {' '}· behind {fight.behind.tla} {fmt(fight.behind.gap)}
                {behindTrend !== null && (
                  <span className={behindTrend < 0 ? 'tl__closing' : 'tl__opening'}> ({signed(behindTrend)} / 3 laps)</span>
                )}
              </>
            )}
          </span>
        )}
        {follow && rejoins.length > 0 && (
          <span className="tl__rejoin">
            If {follow} pits now:
            {rejoins
              .filter((r) => !neutralised || r.kind !== 'green')
              .map((r) => (
                <span key={r.kind} className={`tl__rj tl__rj--${r.kind}${r.traffic ? ' is-traffic' : ''}`}>
                  {REJOIN_LABEL[r.kind]} P{r.position}
                  {r.ahead ? ` behind ${r.ahead} (${fmt(r.gap_ahead)})` : ' in the lead'}
                  {r.gap_ahead !== null && r.gap_ahead < 2 ? ' · too close to call' : ''}
                </span>
              ))}
          </span>
        )}
      </div>
    </section>
  )
}
