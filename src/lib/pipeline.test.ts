import { describe, expect, it } from 'vitest'
import { pipelineState } from './pipeline'

const status = (s: ReturnType<typeof pipelineState>) => Object.fromEntries(s.map((n) => [n.node, n.status]))

describe('pipelineState', () => {
  it('marks route running before any step', () => {
    expect(status(pipelineState([], 'streaming')).route).toBe('running')
  })

  it('tracks the fetch/tools loop and counts repeats', () => {
    const s = pipelineState(
      [
        { node: 'route', detail: 'route: mode=race' },
        { node: 'resolve', detail: 'resolve: race=Monaco' },
        { node: 'fetch', detail: 'fetch round 1: [...]' },
        { node: 'tools', detail: 'tools' },
        { node: 'fetch', detail: 'fetch round 2: [...]' },
      ],
      'streaming',
    )
    expect(status(s).tools).toBe('running')
    expect(s.find((n) => n.node === 'fetch')?.count).toBe(2)
  })

  it('takes the rules path after resolve and marks skipped nodes when done', () => {
    const steps = [
      { node: 'route' as const, detail: 'route: mode=rules' },
      { node: 'resolve' as const, detail: 'resolve: race=-' },
    ]
    expect(status(pipelineState(steps, 'streaming')).retrieve).toBe('running')
    const done = status(pipelineState([...steps, { node: 'retrieve', detail: '' }, { node: 'analyze', detail: '' }, { node: 'synthesize', detail: '' }], 'done'))
    expect(done.fetch).toBe('skipped')
    expect(done.synthesize).toBe('done')
  })

  it('flags the running node on error', () => {
    expect(status(pipelineState([{ node: 'route', detail: '' }], 'error')).resolve).toBe('error')
  })
})
