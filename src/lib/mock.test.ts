import { describe, expect, it } from 'vitest'
import type { ChatEvent } from '../types'
import { mockStreamChat, pickScript } from './mock'

describe('mock transport', () => {
  it('picks scripts by keyword', () => {
    const last = (m: string) => pickScript(m).at(-1)
    const race = last("Analyze McLaren's hard tyre degradation at Monaco 2024 — was an undercut on lap 30 possible?")
    expect(race?.event === 'answer' && race.payload.mode).toBe('race')
    const rules = last("What happens to the two-compound rule if a race is red-flagged and can't restart?")
    expect(rules?.event === 'answer' && rules.payload.citations[0].article).toBe('B6.3.6')
    const work = last('What work can teams do on cars during a red flag?')
    expect(work?.event === 'answer' && work.payload.citations[0].article).toBe('B5.14.4')
    expect(last('/error')?.event).toBe('error')
  })

  it('streams thread, steps and answer through the SSE parser', async () => {
    const events: ChatEvent[] = []
    await mockStreamChat({ thread_id: 'fixed', message: 'what is the two-compound rule?' }, (e) => events.push(e))
    expect(events[0]).toEqual({ type: 'thread', thread_id: 'fixed' })
    expect(events.filter((e) => e.type === 'step').map((e) => e.type === 'step' && e.node)).toEqual([
      'route',
      'resolve',
      'retrieve',
      'analyze',
      'synthesize',
    ])
    const answer = events.at(-1)
    expect(answer?.type).toBe('answer')
    expect(answer?.type === 'answer' && answer.payload.regs).toEqual({ season: 2026, issue: 8 })
  }, 15000)
})
