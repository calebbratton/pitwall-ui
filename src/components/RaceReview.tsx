import { useEffect, useState } from 'react'
import { API_URL } from '../lib/api'

interface Verdict {
  driver: string
  lap: number
  label: 'right call' | 'better option' | 'unlucky' | 'unavailable' | string
  summary: string
  tyres?: string
  status?: string
  context?: string | null
}

interface RaceRow {
  place: string
  date: string
}

const LABEL: Record<string, string> = {
  'right call': 'Right call',
  'better option': 'Better option existed',
  unlucky: 'Unlucky',
  unavailable: 'No verdict',
}

/**
 * Post-race strategy verdicts: every pit stop of the luck-adjusted top 10, reviewed by the pit
 * review engine (measured tyre and pit numbers, alternatives simulated). First load of a race
 * replays it on the server and can take a few minutes; then it's cached.
 */
export function RaceReview() {
  const [year, setYear] = useState(2026)
  const [races, setRaces] = useState<RaceRow[]>([])
  const [place, setPlace] = useState<string | null>(null)
  const [verdicts, setVerdicts] = useState<Verdict[] | null>(null)
  const [state, setState] = useState<'idle' | 'loading' | 'error'>('idle')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch(`${API_URL}/api/race/list?year=${year}`)
      .then((r) => r.json())
      .then((d: { races: RaceRow[] }) => {
        if (!cancelled) setRaces(d.races ?? [])
      })
      .catch(() => {
        if (!cancelled) setRaces([])
      })
    return () => {
      cancelled = true
    }
  }, [year])

  const load = (p: string) => {
    setPlace(p)
    setVerdicts(null)
    setState('loading')
    setError(null)
    fetch(`${API_URL}/api/race/verdicts?year=${year}&place=${encodeURIComponent(p)}`)
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json()).detail ?? r.statusText)
        return r.json()
      })
      .then((d: { verdicts: Verdict[] }) => {
        setVerdicts(d.verdicts)
        setState('idle')
      })
      .catch((e: Error) => {
        setError(e.message)
        setState('error')
      })
  }

  return (
    <main className="review">
      <header className="review__head">
        <h1 className="live-h">Strategy verdicts</h1>
        <select value={year} onChange={(e) => setYear(Number(e.target.value))} aria-label="Season">
          {[2026, 2025].map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
        <select value={place ?? ''} onChange={(e) => e.target.value && load(e.target.value)} aria-label="Race">
          <option value="">Pick a race…</option>
          {races.map((r) => (
            <option key={r.date} value={r.place}>
              {r.place} ({r.date})
            </option>
          ))}
        </select>
      </header>
      <p className="muted review__about">
        Every pit stop of the top ten (luck-adjusted), replayed and compared with staying out 1-5 more laps, using the
        tyre wear, fresh-tyre gain and pit loss measured in that race. Rivals stop when they really did.
      </p>
      {state === 'loading' && <p className="muted">Reviewing {place}… the first time takes a few minutes.</p>}
      {state === 'error' && <p className="review__error">{error}</p>}
      {verdicts && (
        <ol className="review__list">
          {verdicts.map((v) => (
            <li key={`${v.driver}-${v.lap}`} className={`review__card review__card--${v.label.replace(' ', '-')}`}>
              <div className="review__meta">
                <b>{v.driver}</b> · lap {v.lap}
                {v.tyres && <> · {v.tyres}</>}
                {v.status && v.status !== 'GREEN' && <> · {v.status.replace('_', ' ')}</>}
              </div>
              <p className="review__label">{LABEL[v.label] ?? v.label}</p>
              <p className="review__summary">{v.summary}</p>
              {v.context && <p className="review__context">{v.context}</p>}
            </li>
          ))}
        </ol>
      )}
    </main>
  )
}
