import { describe, expect, it } from 'vitest'
import type { AskAnswer } from './liveAsk'
import { chatFor, initialLiveChat, liveChatReducer, type LiveChatAction, type LiveChatState } from './liveChat'

const answer: AskAnswer = { answer: 'RUS wins.', lap: 31, status: 'SAFETY_CAR', prediction: null, steps: ['sim'] }
const reduce = (actions: LiveChatAction[], from: LiveChatState = initialLiveChat) => actions.reduce(liveChatReducer, from)
const send = (liveId: string, text = 'Who wins from here?'): LiveChatAction => ({ type: 'send', liveId, text, at: 1, lap: 31, status: 'SAFETY_CAR' })

describe('live chat state', () => {
  it('is pending between a question and its answer, one question at a time', () => {
    const s = reduce([send('L1')])
    expect(s.pending).toBe(true)
    expect(s.messages).toHaveLength(1)
    expect(s.messages[0]).toMatchObject({ role: 'user', text: 'Who wins from here?', lap: 31, status: 'SAFETY_CAR' })
    expect(reduce([send('L1', 'again')], s)).toBe(s) // ignored while pending
    const done = reduce([{ type: 'answer', liveId: 'L1', data: answer, at: 2 }], s)
    expect(done.pending).toBe(false)
    expect(done.messages.map((m) => m.role)).toEqual(['user', 'agent'])
    expect(done.messages[1]).toMatchObject({ text: 'RUS wins.', lap: 31, status: 'SAFETY_CAR', steps: ['sim'] })
    expect(reduce([send('L1', '   ')], done)).toBe(done) // blank
  })

  it('shows failures as system messages and clears pending', () => {
    const s = reduce([send('L1'), { type: 'fail', liveId: 'L1', kind: 'early', message: 'Not enough race data yet.', at: 2 }])
    expect(s.pending).toBe(false)
    expect(s.messages[1]).toMatchObject({ role: 'system', failure: 'early', text: 'Not enough race data yet.' })
    const aborted = reduce([send('L1'), { type: 'fail', liveId: 'L1', kind: 'aborted', message: 'x', at: 2 }])
    expect(aborted.pending).toBe(false)
    expect(aborted.messages).toHaveLength(1) // no notice for our own cancel
  })

  it('clears the history on a new live_id, keeps it on a reconnect to the same one', () => {
    const s = reduce([send('L1'), { type: 'answer', liveId: 'L1', data: answer, at: 2 }])
    expect(reduce([{ type: 'session', liveId: 'L1' }], s)).toBe(s)
    expect(reduce([{ type: 'session', liveId: null }], s)).toBe(s) // connecting: keep
    const fresh = reduce([{ type: 'session', liveId: 'L2' }], s)
    expect(fresh.messages).toEqual([])
    expect(fresh.liveId).toBe('L2')
    // the view hides another session's history before any action lands
    expect(chatFor(s, 'L2').messages).toEqual([])
    expect(chatFor(s, 'L1')).toBe(s)
    expect(chatFor(s, null)).toBe(s)
    // sending on a new session starts a new history
    const next = reduce([send('L2', 'Should NOR pit?')], s)
    expect(next.messages.map((m) => m.text)).toEqual(['Should NOR pit?'])
    // ids stay unique across sessions (React keys)
    expect(next.messages[0].id).toBeGreaterThan(s.messages[1].id)
  })

  it('drops a late answer from the previous live session', () => {
    const s = reduce([send('L1'), { type: 'session', liveId: 'L2' }])
    expect(s.pending).toBe(false)
    expect(reduce([{ type: 'answer', liveId: 'L1', data: answer, at: 3 }], s)).toBe(s)
    expect(reduce([{ type: 'fail', liveId: 'L1', kind: 'gone', message: 'x', at: 3 }], s)).toBe(s)
  })

  it('clear empties the history', () => {
    const s = reduce([send('L1'), { type: 'answer', liveId: 'L1', data: answer, at: 2 }, { type: 'clear' }])
    expect(s.messages).toEqual([])
    expect(s.liveId).toBe('L1')
  })
})

describe('chat history per live session', () => {
  it('coming back to a live session restores its history', () => {
    const live = reduce([send('LIVE'), { type: 'answer', liveId: 'LIVE', data: answer, at: 2 }])
    const replay = reduce([send('REPLAY', 'Should NOR pit?')], live)
    expect(replay.messages.map((m) => m.text)).toEqual(['Should NOR pit?'])
    expect(chatFor(replay, 'LIVE').messages.map((m) => m.role)).toEqual(['user', 'agent'])
    const back = reduce([{ type: 'session', liveId: 'LIVE' }], replay)
    expect(back.messages.map((m) => m.text)).toEqual(['Who wins from here?', 'RUS wins.'])
    expect(back.archive.REPLAY).toHaveLength(1)
  })
})
