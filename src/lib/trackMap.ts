/**
 * Track map: state for `track` / `positions` events (kept in a tiny external store so 4 Hz
 * position updates only re-render the map), feed -> SVG coordinates, and dot interpolation.
 */
import type { CarFix, ReplayEvent, TrackShape } from '../liveTypes'

// ---------- state ----------

export interface MapState {
  track: TrackShape | null
  /** latest fix per car, keyed by TLA */
  cars: Record<string, CarFix>
  utc: string | null
}

export const initialMapState: MapState = { track: null, cars: {}, utc: null }

export type MapAction = { type: 'reset' } | { type: 'event'; event: ReplayEvent }

export function mapReducer(state: MapState, action: MapAction): MapState {
  if (action.type === 'reset') return initialMapState
  const e = action.event
  if (e.type === 'track') {
    const { type: _type, ...track } = e
    void _type
    return { ...state, track }
  }
  if (e.type !== 'positions') return state
  const cars = { ...state.cars }
  let changed = false
  for (const c of e.cars) {
    if (c.x === 0 && c.y === 0) continue // no fix yet
    const prev = cars[c.tla]
    if (prev && prev.x === c.x && prev.y === c.y && prev.status === c.status) continue
    cars[c.tla] = c
    changed = true
  }
  return changed ? { ...state, cars, utc: e.utc } : state
}

export interface MapStore {
  getSnapshot: () => MapState
  subscribe: (listener: () => void) => () => void
  dispatch: (action: MapAction) => void
}

/** Minimal external store for useSyncExternalStore. */
export function createMapStore(): MapStore {
  let state = initialMapState
  const listeners = new Set<() => void>()
  return {
    getSnapshot: () => state,
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    dispatch(action) {
      const next = mapReducer(state, action)
      if (next === state) return
      state = next
      for (const l of listeners) l()
    },
  }
}

// ---------- geometry ----------

export type Pt = [number, number]

export interface ViewBox {
  x: number
  y: number
  w: number
  h: number
}

/** Feed coordinates have Y up; SVG has Y down. */
export function toSvg([x, y]: Pt): Pt {
  return [x, -y]
}

/** viewBox (in flipped SVG space) covering `bounds` plus `padFrac` of the larger side on every edge. */
export function viewBoxFor([minX, minY, maxX, maxY]: TrackShape['bounds'], padFrac = 0.06): ViewBox {
  const pad = Math.max(maxX - minX, maxY - minY) * padFrac
  return { x: minX - pad, y: -maxY - pad, w: maxX - minX + 2 * pad, h: maxY - minY + 2 * pad }
}

/** Rotate `p` about `c` by `deg` degrees (counter-clockwise in feed space, Y up). */
export function rotateAbout([x, y]: Pt, [cx, cy]: Pt, deg: number): Pt {
  if (!deg) return [x, y]
  const a = (deg * Math.PI) / 180
  const cos = Math.cos(a)
  const sin = Math.sin(a)
  const dx = x - cx
  const dy = y - cy
  return [cx + dx * cos - dy * sin, cy + dx * sin + dy * cos]
}

export interface Projection {
  /** feed coordinates -> SVG coordinates (rotated about the track centre, Y flipped) */
  project: (p: Pt) => Pt
  vb: ViewBox
  /** larger viewBox side, for sizing strokes, dots and labels */
  size: number
}

export function makeProjection(track: Pick<TrackShape, 'points' | 'bounds' | 'rotation'>, padFrac = 0.06): Projection {
  const [minX, minY, maxX, maxY] = track.bounds
  const centre: Pt = [(minX + maxX) / 2, (minY + maxY) / 2]
  const rot = (p: Pt) => rotateAbout(p, centre, track.rotation)
  const rotated = track.points.map(rot)
  const xs = rotated.map((p) => p[0])
  const ys = rotated.map((p) => p[1])
  const vb = viewBoxFor([Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)], padFrac)
  return { project: (p) => toSvg(rot(p)), vb, size: Math.max(vb.w, vb.h) }
}

export function pathOf(points: Pt[], closed: boolean): string {
  const d = points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${Math.round(x)} ${Math.round(y)}`).join(' ')
  return closed ? `${d} Z` : d
}

export function nearestIndex(points: Pt[], [x, y]: Pt): number {
  let best = 0
  let bestD = Infinity
  points.forEach(([px, py], i) => {
    const d = (px - x) ** 2 + (py - y) ** 2
    if (d < bestD) {
      bestD = d
      best = i
    }
  })
  return best
}

/**
 * Outline segment for each marshal sector: from the point nearest its marker to the point nearest
 * the next sector's marker (wrapping), walking in whichever direction the sector numbers run.
 */
export function sectorSegments(points: Pt[], sectors: TrackShape['marshal_sectors']): Map<number, Pt[]> {
  const out = new Map<number, Pt[]>()
  const n = points.length
  if (n < 3 || sectors.length < 2) return out
  const sorted = [...sectors].sort((a, b) => a.number - b.number)
  const anchors = sorted.map((s) => nearestIndex(points, [s.x, s.y]))
  const fwd = (a: number, b: number) => (b - a + n) % n
  const forwardTotal = anchors.reduce((sum, a, i) => sum + fwd(a, anchors[(i + 1) % anchors.length]), 0)
  const step = forwardTotal <= n * 1.5 ? 1 : -1
  sorted.forEach((s, i) => {
    const from = anchors[i]
    const to = anchors[(i + 1) % anchors.length]
    const seg: Pt[] = [points[from]]
    for (let k = from; k !== to; ) {
      k = (k + step + n) % n
      seg.push(points[k])
    }
    out.set(s.number, seg)
  })
  return out
}

/** Where to draw a corner number: pushed `offset` away from the outline (or the centre, as fallback). */
export function cornerLabelAt(points: Pt[], corner: Pt, offset: number): Pt {
  const near = points[nearestIndex(points, corner)] ?? corner
  let dx = corner[0] - near[0]
  let dy = corner[1] - near[1]
  let len = Math.hypot(dx, dy)
  if (len < 1e-6) {
    const cx = points.reduce((s, p) => s + p[0], 0) / Math.max(1, points.length)
    const cy = points.reduce((s, p) => s + p[1], 0) / Math.max(1, points.length)
    dx = corner[0] - cx
    dy = corner[1] - cy
    len = Math.hypot(dx, dy) || 1
  }
  return [near[0] + (dx / len) * offset, near[1] + (dy / len) * offset]
}

// ---------- interpolation ----------

export const MOVE_MS = 250

export function lerp(a: Pt, b: Pt, t: number): Pt {
  const k = Math.min(1, Math.max(0, t))
  return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k]
}

/** Jumps longer than this (feed units) are snapped, e.g. after fast-forward or a restart. Generous, since
 * at 30x a car covers several km of straight between 4 Hz updates. */
export function snapThreshold(bounds: TrackShape['bounds']): number {
  return Math.hypot(bounds[2] - bounds[0], bounds[3] - bounds[1]) * 0.35
}

export function shouldSnap(from: Pt, to: Pt, threshold: number): boolean {
  return Math.hypot(to[0] - from[0], to[1] - from[1]) > threshold
}
