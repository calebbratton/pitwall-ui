import { describe, expect, it } from 'vitest'
import { splitAnswer, tokenize } from './format'

describe('tokenize', () => {
  it('finds compounds, refs and lap times', () => {
    const t = tokenize('Both ran HARD tyres (NOR lap 30: 78.403 s) [30.5, 57.4] then hards and a soft tyre.')
    expect(t.filter((x) => x.kind !== 'text')).toEqual([
      { kind: 'compound', text: 'HARD', compound: 'HARD' },
      { kind: 'time', text: '78.403 s' },
      { kind: 'refs', text: '[30.5, 57.4]', articles: ['30.5', '57.4'] },
      { kind: 'compound', text: 'hards', compound: 'HARD' },
      { kind: 'compound', text: 'soft', compound: 'SOFT' },
    ])
    expect(t.map((x) => x.text).join('')).toBe(
      'Both ran HARD tyres (NOR lap 30: 78.403 s) [30.5, 57.4] then hards and a soft tyre.',
    )
  })

  it('ignores ordinary prose uses of compound words', () => {
    expect(tokenize('It was hard to say; wet-weather running; a medium risk.').every((x) => x.kind === 'text')).toBe(
      true,
    )
  })

  it('parses 2026-style article refs', () => {
    expect(tokenize('[B6.3.6]')).toEqual([{ kind: 'refs', text: '[B6.3.6]', articles: ['B6.3.6'] }])
  })
})

describe('splitAnswer', () => {
  it('splits verdict, findings, caveats and regulations', () => {
    const s = splitAnswer('Verdict here.\n\n- one\n- two\n\nCaveats:\n- c1\n\nRegulations:\n- 2024 ..., Article 30.5')
    expect(s).toEqual({
      verdict: 'Verdict here.',
      findings: '- one\n- two',
      caveats: '- c1',
      regulations: '- 2024 ..., Article 30.5',
    })
  })

  it('returns null for free prose', () => {
    expect(splitAnswer('Could not find that race.')).toBeNull()
  })
})
