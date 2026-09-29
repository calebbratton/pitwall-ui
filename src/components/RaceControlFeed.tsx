import { useState } from 'react'
import type { RaceControlItem } from '../liveTypes'
import { filterRaceControl } from '../lib/replay'

function tone(m: string): string {
  const u = m.toUpperCase()
  if (u.includes('RED FLAG')) return 'red'
  if (/SAFETY CAR|\bVSC\b|VIRTUAL SAFETY/.test(u)) return 'yellow'
  if (/PENALTY|INVESTIGAT|NOTED|DECISION/.test(u)) return 'purple'
  if (/GREEN|CLEAR|PIT EXIT OPEN/.test(u)) return 'green'
  return 'plain'
}

export function RaceControlFeed({ items }: { items: RaceControlItem[] }) {
  const [showAll, setShowAll] = useState(false)
  const shown = filterRaceControl(items, showAll)
  const hidden = items.length - shown.length
  return (
    <section className="feed feed--rc" aria-label="Race control messages">
      <header className="feed__head">
        <h2 className="live-h">
          Race control <span className="count">{shown.length}</span>
        </h2>
        <label className="switch" title="Include blue flags, sector yellows/clears and track limits">
          <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} />
          <span className="switch__track" aria-hidden="true" />
          <span className="feed__switch-label">Show all{!showAll && hidden > 0 ? ` (+${hidden})` : ''}</span>
        </label>
      </header>
      <ol className="feed__list" aria-live="polite" aria-relevant="additions">
        {shown.length === 0 && <li className="feed__empty">No messages yet.</li>}
        {shown.map((m) => (
          <li key={m.id} className={`rcm rcm--${tone(m.message)}`}>
            <span className="rcm__lap">{m.lap !== null ? `L${m.lap}` : '—'}</span>
            <span className="rcm__msg">{m.message}</span>
          </li>
        ))}
      </ol>
    </section>
  )
}
