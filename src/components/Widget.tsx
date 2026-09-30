import type { ReactNode } from 'react'
import type { Direction } from '../lib/layout'

interface Props {
  title: string
  minimized: boolean
  maximized: boolean
  /** directions the panel can move in the current view */
  moves: Direction[]
  onMin: () => void
  onMax: () => void
  onHide: () => void
  onMove: (dir: Direction) => void
  children: ReactNode
}

const ARROW: Record<Direction, string> = {
  up: '↑',
  down: '↓',
  left: '←',
  right: '→',
}

/** A dashboard panel: a slim header (move / minimise / maximise / hide) around a live view. */
export function Widget({ title, minimized, maximized, moves, onMin, onMax, onHide, onMove, children }: Props) {
  return (
    <section className={`widget${minimized ? ' is-min' : ''}${maximized ? ' is-max' : ''}`} aria-label={title}>
      <header className="widget__head">
        <span className="widget__title">{title}</span>
        {!maximized &&
          moves.map((d) => (
            <button
              key={d}
              type="button"
              className="widget__btn widget__btn--move"
              onClick={() => onMove(d)}
              title={`Move ${d}`}
              aria-label={`Move ${title} ${d}`}
            >
              {ARROW[d]}
            </button>
          ))}
        {!maximized && (
          <button
            type="button"
            className="widget__btn"
            onClick={onMin}
            title={minimized ? 'Restore' : 'Minimise'}
            aria-label={`${minimized ? 'Restore' : 'Minimise'} ${title}`}
            aria-expanded={!minimized}
          >
            {minimized ? '▢' : '–'}
          </button>
        )}
        <button
          type="button"
          className="widget__btn"
          onClick={onMax}
          title={maximized ? 'Back to dashboard' : 'Maximise'}
          aria-label={`${maximized ? 'Restore' : 'Maximise'} ${title}`}
        >
          {maximized ? '⤡' : '⤢'}
        </button>
        {!maximized && (
          <button
            type="button"
            className="widget__btn"
            onClick={onHide}
            title="Hide (restore from Panels)"
            aria-label={`Hide ${title}`}
          >
            ×
          </button>
        )}
      </header>
      <div className="widget__body">{children}</div>
    </section>
  )
}
