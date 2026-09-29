import { describe, expect, it, vi } from 'vitest'
import type { ReplayEvent, TrackShape } from '../liveTypes'
import { parseReplayEvent } from './replay'
import type { Pt } from './trackMap'
import {
  cornerLabelAt,
  createMapStore,
  initialMapState,
  lerp,
  makeProjection,
  mapReducer,
  rotateAbout,
  sectorSegments,
  shouldSnap,
  snapThreshold,
  toSvg,
  viewBoxFor,
} from './trackMap'

const square: Pt[] = [
  [0, 0],
  [100, 0],
  [100, 100],
  [0, 100],
]
const track: TrackShape = {
  source: 'traced',
  name: null,
  points: square,
  bounds: [0, 0, 100, 100],
  rotation: 0,
  corners: [],
  marshal_sectors: [],
}
const positions = (cars: [string, number, number, string?][], utc = 'u'): ReplayEvent => ({
  type: 'positions',
  utc,
  cars: cars.map(([tla, x, y, status = 'OnTrack']) => ({ number: tla, tla, x, y, status })),
})
const ev = (event: ReplayEvent) => ({ type: 'event' as const, event })

describe('mapReducer', () => {
  it('stores the track and keeps the latest fix per car', () => {
    let s = mapReducer(initialMapState, ev({ type: 'track', ...track }))
    expect(s.track?.bounds).toEqual([0, 0, 100, 100])
    s = mapReducer(s, ev(positions([['NOR', 10, 20], ['VER', 30, 40]], 't1')))
    s = mapReducer(s, ev(positions([['NOR', 11, 21, 'OffTrack']], 't2')))
    expect(s.cars.NOR).toMatchObject({ x: 11, y: 21, status: 'OffTrack' })
    expect(s.cars.VER).toMatchObject({ x: 30, y: 40 })
    expect(s.utc).toBe('t2')
  })

  it('ignores 0,0 (no fix yet) and keeps the previous position', () => {
    let s = mapReducer(initialMapState, ev(positions([['NOR', 10, 20], ['PIA', 0, 0]])))
    expect(s.cars.PIA).toBeUndefined()
    const before = s
    s = mapReducer(s, ev(positions([['NOR', 0, 0]])))
    expect(s).toBe(before)
    expect(s.cars.NOR).toMatchObject({ x: 10, y: 20 })
  })

  it('resets for a new replay and ignores other events', () => {
    const s = mapReducer(mapReducer(initialMapState, ev({ type: 'track', ...track })), ev(positions([['NOR', 1, 2]])))
    expect(mapReducer(s, ev({ type: 'end' }))).toBe(s)
    expect(mapReducer(s, { type: 'reset' })).toEqual(initialMapState)
  })

  it('store notifies subscribers only on change', () => {
    const store = createMapStore()
    const fn = vi.fn()
    const unsub = store.subscribe(fn)
    store.dispatch(ev(positions([['NOR', 1, 2]])))
    store.dispatch(ev(positions([['NOR', 1, 2]])))
    expect(fn).toHaveBeenCalledTimes(1)
    unsub()
    store.dispatch({ type: 'reset' })
    expect(fn).toHaveBeenCalledTimes(1)
    expect(store.getSnapshot()).toBe(initialMapState)
  })
})

describe('coordinates', () => {
  it('flips Y and builds a padded viewBox from bounds', () => {
    expect(toSvg([5, 7])).toEqual([5, -7])
    const vb = viewBoxFor([-100, -50, 300, 150], 0.1) // 400 x 200, pad 40
    expect(vb).toEqual({ x: -140, y: -190, w: 480, h: 280 })
    // top-left of the viewBox is the feed's (minX, maxY): feed Y goes up, SVG Y goes down
    const [, svgTop] = toSvg([0, 150])
    expect(svgTop).toBeGreaterThan(vb.y)
    expect(toSvg([0, -50])[1]).toBeLessThan(vb.y + vb.h)
  })

  it('rotates about a centre (counter-clockwise, feed space)', () => {
    const [x, y] = rotateAbout([10, 0], [0, 0], 90)
    expect(x).toBeCloseTo(0)
    expect(y).toBeCloseTo(10)
    expect(rotateAbout([3, 4], [1, 1], 0)).toEqual([3, 4])
    const [a, b] = rotateAbout([2, 1], [1, 1], 180)
    expect(a).toBeCloseTo(0)
    expect(b).toBeCloseTo(1)
  })

  it('projection applies rotation then the Y flip, with a viewBox fitting the rotated track', () => {
    const wide: TrackShape = { ...track, points: [[0, 0], [200, 0], [200, 50], [0, 50]], bounds: [0, 0, 200, 50] }
    const flat = makeProjection(wide, 0)
    expect(flat.vb).toEqual({ x: 0, y: -50, w: 200, h: 50 })
    const turned = makeProjection({ ...wide, rotation: 90 }, 0)
    // rotated 90° about (100, 25): now 50 wide and 200 tall
    expect(turned.vb.w).toBeCloseTo(50)
    expect(turned.vb.h).toBeCloseTo(200)
    const [px, py] = turned.project([200, 25]) // right end -> top (feed) -> smallest SVG y
    expect(px).toBeCloseTo(100)
    expect(py).toBeCloseTo(-125)
  })
})

describe('interpolation', () => {
  it('lerps and clamps', () => {
    expect(lerp([0, 0], [10, 20], 0.5)).toEqual([5, 10])
    expect(lerp([0, 0], [10, 20], 2)).toEqual([10, 20])
    expect(lerp([0, 0], [10, 20], -1)).toEqual([0, 0])
  })

  it('snaps on jumps larger than 35% of the track diagonal', () => {
    const t = snapThreshold([0, 0, 300, 400]) // diagonal 500
    expect(t).toBeCloseTo(175)
    expect(shouldSnap([0, 0], [105, 140], t)).toBe(false)
    expect(shouldSnap([0, 0], [106, 141], t)).toBe(true)
  })
})

describe('corners and marshal sectors', () => {
  const ring: Pt[] = Array.from({ length: 12 }, (_, i) => [i * 10, 0])

  it('segments run from each sector marker to the next, wrapping', () => {
    const segs = sectorSegments(ring, [
      { number: 1, x: 0, y: 1 },
      { number: 2, x: 40, y: 1 },
      { number: 3, x: 80, y: 1 },
    ])
    expect(segs.get(1)?.map((p) => p[0])).toEqual([0, 10, 20, 30, 40])
    expect(segs.get(3)?.map((p) => p[0])).toEqual([80, 90, 100, 110, 0])
  })

  it('walks backwards when sector numbers run against the outline order', () => {
    const segs = sectorSegments(ring, [
      { number: 1, x: 80, y: 0 },
      { number: 2, x: 40, y: 0 },
      { number: 3, x: 0, y: 0 },
    ])
    expect(segs.get(1)?.map((p) => p[0])).toEqual([80, 70, 60, 50, 40])
  })

  it('pushes corner labels away from the outline', () => {
    const [x, y] = cornerLabelAt(ring, [50, 3], 10)
    expect(x).toBeCloseTo(50)
    expect(y).toBeCloseTo(10)
  })
})

describe('parse track / positions', () => {
  it('parses a MultiViewer track and falls back for a traced one', () => {
    const mv = parseReplayEvent(
      'track',
      JSON.stringify({
        source: 'multiviewer', name: 'Baku', points: square, bounds: [0, 0, 100, 100], rotation: 357,
        corners: [{ number: 1, x: 5, y: 6 }, { number: 'x' }], marshal_sectors: [{ number: 1, x: 1, y: 2 }],
      }),
    )
    expect(mv).toMatchObject({ type: 'track', source: 'multiviewer', name: 'Baku', rotation: 357 })
    expect(mv?.type === 'track' && mv.corners).toEqual([{ number: 1, x: 5, y: 6 }])
    const traced = parseReplayEvent('track', JSON.stringify({ points: square }))
    expect(traced).toMatchObject({ source: 'traced', rotation: 0, bounds: [0, 0, 100, 100], corners: [] })
    expect(parseReplayEvent('track', JSON.stringify({ points: [[0, 0]] }))).toBeNull()
  })

  it('drops malformed car fixes', () => {
    const e = parseReplayEvent('positions', JSON.stringify({ utc: 'u', cars: [{ tla: 'NOR', x: 1, y: 2 }, { tla: 'BAD' }] }))
    expect(e?.type === 'positions' && e.cars.map((c) => c.tla)).toEqual(['NOR'])
  })
})
