import { describe, expect, it } from 'vitest'
import { DEFAULT_LAYOUT, fold, move, normalize, setHidden, toggleMax, toggleMin, WIDGETS } from './layout'

const all = (cols: string[][]) => cols.flat().sort()

describe('dashboard layout', () => {
  it('repairs stored layouts', () => {
    const l = normalize({ columns: [['map', 'map', 'bogus'], ['tower']], hidden: ['calls', 'nope'], maximized: 'x' })
    expect(all(l.columns)).toEqual([...WIDGETS].sort())
    expect(l.columns[0]).toEqual(['map'])
    expect(l.hidden).toEqual(['calls'])
    expect(l.maximized).toBeNull()
    expect(normalize('garbage').columns.length).toBe(3)
  })

  it('folds columns for narrow screens without losing panels', () => {
    expect(fold(DEFAULT_LAYOUT.columns, 1)).toEqual([['tower', 'map', 'calls', 'predict', 'side']])
    expect(fold(DEFAULT_LAYOUT.columns, 2)[1]).toEqual(['map', 'calls', 'predict', 'side'])
    expect(fold(DEFAULT_LAYOUT.columns, 3)).toBe(DEFAULT_LAYOUT.columns)
  })

  it('moves panels up, down and across columns', () => {
    let l = move(DEFAULT_LAYOUT, 'calls', 'up')
    expect(l.columns[1]).toEqual(['calls', 'map', 'predict'])
    expect(move(l, 'calls', 'up')).toBe(l) // already at the top
    l = move(l, 'predict', 'left')
    expect(l.columns[0]).toEqual(['tower', 'predict'])
    expect(move(l, 'tower', 'left')).toBe(l)
    expect(all(l.columns)).toEqual([...WIDGETS].sort())
    // on a phone (1 column) up/down reorders the stacked list
    const phone = move(DEFAULT_LAYOUT, 'map', 'up', 1)
    expect(fold(phone.columns, 1)[0].slice(0, 2)).toEqual(['map', 'tower'])
    expect(phone.columns.length).toBe(3)
  })

  it('minimise, maximise and hide', () => {
    let l = toggleMin(DEFAULT_LAYOUT, 'map')
    expect(l.minimized).toEqual(['map'])
    l = toggleMax(l, 'map')
    expect(l.maximized).toBe('map')
    expect(l.minimized).toEqual([]) // maximising restores it
    l = setHidden(l, 'map', true)
    expect(l.hidden).toEqual(['map'])
    expect(l.maximized).toBeNull()
    expect(setHidden(l, 'map', false).hidden).toEqual([])
  })
})
