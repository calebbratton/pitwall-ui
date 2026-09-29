import { describe, expect, it } from 'vitest'
import type { ReplayEvent } from '../liveTypes'
import type { RadioQueueAction, RadioQueueState } from './radioQueue'
import { initialRadioQueue, radioQueueReducer, shouldAutoQueue } from './radioQueue'

const clip = (n: number, tla = 'NOR') => ({ url: `u${n}`, tla })
const reduce = (actions: RadioQueueAction[], from: RadioQueueState = initialRadioQueue) =>
  actions.reduce(radioQueueReducer, from)
const radio = (tla: string, url: string): ReplayEvent => ({ type: 'radio', driver: '4', tla, utc: null, url, text: null })

describe('radio queue', () => {
  it('plays one clip at a time and the rest in arrival order', () => {
    let s = reduce([
      { type: 'enqueue', clip: clip(1) },
      { type: 'enqueue', clip: clip(2) },
      { type: 'enqueue', clip: clip(3) },
    ])
    expect(s.current).toEqual(clip(1))
    expect(s.queue).toEqual([clip(2), clip(3)])
    const played = [s.current?.url]
    while (s.current) {
      s = radioQueueReducer(s, { type: 'finished' })
      if (s.current) played.push(s.current.url)
    }
    expect(played).toEqual(['u1', 'u2', 'u3'])
  })

  it('never has the same clip twice (no overlap / duplicates)', () => {
    const s = reduce([
      { type: 'enqueue', clip: clip(1) },
      { type: 'enqueue', clip: clip(1) },
      { type: 'enqueue', clip: clip(2) },
      { type: 'enqueue', clip: clip(2) },
    ])
    expect(s.current).toEqual(clip(1))
    expect(s.queue).toEqual([clip(2)])
  })

  it('skip advances, stop clears, play_now interrupts without losing the queue', () => {
    const base = reduce([
      { type: 'enqueue', clip: clip(1) },
      { type: 'enqueue', clip: clip(2) },
      { type: 'enqueue', clip: clip(3) },
    ])
    expect(radioQueueReducer(base, { type: 'skip' }).current).toEqual(clip(2))
    expect(radioQueueReducer(base, { type: 'stop' })).toEqual(initialRadioQueue)
    const manual = radioQueueReducer(base, { type: 'play_now', clip: clip(3) })
    expect(manual.current).toEqual(clip(3))
    expect(manual.queue).toEqual([clip(2)])
  })

  it('tracks the autoplay-blocked hint', () => {
    const s = reduce([{ type: 'enqueue', clip: clip(1) }, { type: 'blocked', blocked: true }])
    expect(s.blocked).toBe(true)
    expect(radioQueueReducer(s, { type: 'play_now', clip: clip(1) }).blocked).toBe(false)
  })
})

describe('shouldAutoQueue', () => {
  it("only queues the followed driver's clips, and only with auto-play on", () => {
    expect(shouldAutoQueue(radio('NOR', 'a'), 'NOR', true)).toBe(true)
    expect(shouldAutoQueue(radio('RUS', 'b'), 'NOR', true)).toBe(false)
    expect(shouldAutoQueue(radio('NOR', 'a'), 'NOR', false)).toBe(false)
    expect(shouldAutoQueue(radio('NOR', 'a'), null, true)).toBe(false)
    expect(shouldAutoQueue({ type: 'end' }, 'NOR', true)).toBe(false)
  })

  it('a mixed stream queues just the followed driver, in order', () => {
    const events = [radio('NOR', 'n1'), radio('RUS', 'r1'), radio('NOR', 'n2'), radio('PIA', 'p1'), radio('NOR', 'n3')]
    let s = initialRadioQueue
    for (const e of events) {
      if (e.type === 'radio' && shouldAutoQueue(e, 'NOR', true)) s = radioQueueReducer(s, { type: 'enqueue', clip: { url: e.url, tla: e.tla } })
    }
    expect([s.current, ...s.queue].map((c) => c?.url)).toEqual(['n1', 'n2', 'n3'])
  })
})
