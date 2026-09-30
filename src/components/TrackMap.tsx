import { useCallback, useLayoutEffect, useMemo, useRef, useSyncExternalStore } from 'react'
import type { TimingRow, TrackStatus } from '../liveTypes'
import type { MapStore, Pt } from '../lib/trackMap'
import {
  cornerLabelAt,
  lerp,
  makeProjection,
  MOVE_MS,
  pathOf,
  sectorSegments,
  shouldSnap,
  snapThreshold,
} from '../lib/trackMap'

interface Props {
  store: MapStore
  drivers: TimingRow[]
  trackStatus: TrackStatus | null
  follow: string | null
  onFollow: (tla: string | null) => void
  /** marshal sectors under yellow: number -> double yellow? */
  yellowSectors: Record<number, boolean>
}

const TINT: Partial<Record<TrackStatus, string>> = {
  SAFETY_CAR: 'sc',
  VSC: 'sc',
  VSC_ENDING: 'sc',
  RED_FLAG: 'red',
}

interface Anim {
  from: Pt
  to: Pt
  start: number
}

/**
 * Moves each car's <g> by writing its transform directly (no React render per frame).
 * New fixes glide over MOVE_MS; big jumps and reduced motion snap.
 */
function useDotMotion(targets: Record<string, Pt>, threshold: number) {
  const nodes = useRef(new Map<string, SVGGElement>())
  const shown = useRef(new Map<string, Pt>())
  const anims = useRef(new Map<string, Anim>())
  const frame = useRef<number | null>(null)

  useLayoutEffect(() => {
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
    const now = performance.now()
    for (const [tla, to] of Object.entries(targets)) {
      const from = shown.current.get(tla)
      if (!from || reduced || shouldSnap(from, to, threshold)) {
        anims.current.delete(tla)
        shown.current.set(tla, to)
        nodes.current.get(tla)?.setAttribute('transform', `translate(${to[0].toFixed(1)} ${to[1].toFixed(1)})`)
      } else if (from[0] !== to[0] || from[1] !== to[1]) {
        anims.current.set(tla, { from, to, start: now })
      }
    }
    // One loop at a time; it only reads refs, so a loop started by an earlier run keeps working.
    const loop = (t: number) => {
      for (const [tla, a] of anims.current) {
        const k = (t - a.start) / MOVE_MS
        const p = lerp(a.from, a.to, k)
        shown.current.set(tla, p)
        nodes.current.get(tla)?.setAttribute('transform', `translate(${p[0].toFixed(1)} ${p[1].toFixed(1)})`)
        if (k >= 1) anims.current.delete(tla)
      }
      frame.current = anims.current.size > 0 ? requestAnimationFrame(loop) : null
    }
    if (anims.current.size > 0 && frame.current === null) frame.current = requestAnimationFrame(loop)
  }, [targets, threshold])

  useLayoutEffect(
    () => () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current)
      frame.current = null
    },
    [],
  )

  /** ref callback per car; places a newly mounted dot at its last known position */
  const bind = useCallback((tla: string) => {
    return (el: SVGGElement | null) => {
      if (!el) {
        nodes.current.delete(tla)
        return
      }
      nodes.current.set(tla, el)
      const p = shown.current.get(tla)
      if (p) el.setAttribute('transform', `translate(${p[0].toFixed(1)} ${p[1].toFixed(1)})`)
    }
  }, [])

  return bind
}

export function TrackMap({ store, drivers, trackStatus, follow, onFollow, yellowSectors }: Props) {
  const { track, cars } = useSyncExternalStore(store.subscribe, store.getSnapshot)
  const geo = useMemo(() => {
    if (!track) return null
    const { project, vb, size } = makeProjection(track)
    const outline = track.points.map(project)
    const corners = track.corners.map((c) => {
      const at = project(cornerLabelAt(track.points, [c.x, c.y], size * 0.03))
      return { number: c.number, x: at[0], y: at[1] }
    })
    const sectors = new Map(
      [...sectorSegments(track.points, track.marshal_sectors)].map(([n, seg]) => [n, pathOf(seg.map(project), false)]),
    )
    return { project, vb, size, d: pathOf(outline, true), corners, sectors, threshold: snapThreshold(track.bounds) }
  }, [track])
  const targets = useMemo(() => {
    const out: Record<string, Pt> = {}
    if (geo) for (const c of Object.values(cars)) out[c.tla] = geo.project([c.x, c.y])
    return out
  }, [cars, geo])
  const bind = useDotMotion(targets, geo?.threshold ?? Infinity)

  if (!geo) {
    return (
      <section className="tm tm--empty" aria-label="Track map">
        <p className="muted">The track map appears when a live session starts.</p>
      </section>
    )
  }

  const byTla = new Map(drivers.map((d) => [d.tla, d]))
  const leader = drivers.find((d) => d.position === 1 && !d.retired)?.tla ?? null
  const order = Object.values(cars)
    .filter((c) => !byTla.get(c.tla)?.retired)
    // followed last so it paints on top; leader just below it
    .sort((a, b) => rank(a.tla) - rank(b.tla) || a.tla.localeCompare(b.tla))
  function rank(tla: string) {
    return tla === follow ? 2 : tla === leader ? 1 : 0
  }

  const { vb, size, d } = geo
  const r = size * 0.011
  const tint = trackStatus ? TINT[trackStatus] : undefined
  const yellows = Object.entries(yellowSectors)
    .map(([n, double]) => ({ n: Number(n), double, d: geo.sectors.get(Number(n)) }))
    .filter((y): y is { n: number; double: boolean; d: string } => !!y.d)
  const source = track?.source === 'multiviewer' ? 'Circuit data: MultiViewer' : 'Outline traced from timing'

  return (
    <section className={`tm${tint ? ` tm--${tint}` : ''}`} aria-label="Track map">
      <header className="tm__head">
        <h2 className="live-h">Track{track?.name ? ` · ${track.name}` : ''}</h2>
        <span className="tm__hint">Click a car to follow</span>
      </header>
      <svg
        className="tm__svg"
        viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`}
        preserveAspectRatio="xMidYMid meet"
        role="group"
        aria-label={`Circuit map with ${order.length} cars`}
      >
        <path className="tm__track-edge" d={d} strokeWidth={size * 0.02} />
        <path className="tm__track" d={d} strokeWidth={size * 0.012} />
        <path className="tm__track-line" d={d} strokeWidth={size * 0.0022} />
        {yellows.map((y) => (
          <path
            key={y.n}
            className={`tm__yellow${y.double ? ' is-double' : ''}`}
            d={y.d}
            strokeWidth={size * 0.012}
          >
            <title>{`${y.double ? 'Double yellow' : 'Yellow'} in marshal sector ${y.n}`}</title>
          </path>
        ))}
        {geo.corners.map((c) => (
          <text key={c.number} className="tm__corner" x={c.x} y={c.y} fontSize={size * 0.018}>
            {c.number}
          </text>
        ))}
        {order.map((c) => {
          const row = byTla.get(c.tla)
          const followed = c.tla === follow
          const dim = c.status !== 'OnTrack' || !!row?.in_pit
          const cls = ['tm__car', followed && 'is-followed', c.tla === leader && 'is-leader', dim && 'is-dim']
            .filter(Boolean)
            .join(' ')
          const rr = followed ? r * 1.45 : r
          const toggle = () => onFollow(followed ? null : c.tla)
          return (
            <g
              key={c.tla}
              ref={bind(c.tla)}
              className={cls}
              role="button"
              tabIndex={0}
              aria-label={`${c.tla}${row?.position ? `, P${row.position}` : ''}${followed ? ', followed' : ''}`}
              aria-pressed={followed}
              onClick={toggle}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  toggle()
                }
              }}
            >
              {followed && <circle className="tm__ring" r={rr * 1.9} strokeWidth={r * 0.35} />}
              {c.tla === leader && !followed && <circle className="tm__lead" r={rr * 1.55} strokeWidth={r * 0.22} />}
              <circle
                className="tm__dot"
                r={rr}
                strokeWidth={r * 0.28}
                style={row?.team_colour ? { fill: `#${row.team_colour}` } : undefined}
              />
              <text className="tm__label" x={rr * 1.35} y={-rr * 1.2} fontSize={size * (followed ? 0.03 : 0.024)}>
                {c.tla}
              </text>
            </g>
          )
        })}
      </svg>
      <p className="tm__source">{source}</p>
    </section>
  )
}
