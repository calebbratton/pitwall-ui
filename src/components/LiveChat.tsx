import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import type { LiveChat as Chat } from '../hooks/useLiveChat'
import type { TimingRow, TrackStatus } from '../liveTypes'
import type { LiveChatMessage } from '../lib/liveChat'
import { SUGGESTIONS } from '../lib/liveChat'
import { formatPct, STATUS_LABEL } from '../lib/replay'
import { Markdown } from './Markdown'
import type { TlaHighlight } from './rich'

interface Props {
  chat: Chat
  /** why the channel is closed, null when a live session is running */
  closedHint: string | null
  lap: number | null
  status: TrackStatus | null
  drivers: TimingRow[]
  follow: string | null
  /** mobile sheet: hide the panel */
  onClose: () => void
}

const clock = (t: number) =>
  new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })

const FAILURE_LABEL = { gone: 'SESSION GONE', early: 'TOO EARLY', network: 'NO SIGNAL', error: 'RED FLAG', aborted: 'CANCELLED' } as const

function RaceAt({ lap, status, nowLap }: { lap: number | null; status: TrackStatus | null; nowLap: number | null }) {
  if (lap === null && !status) return null
  const behind = lap !== null && nowLap !== null ? nowLap - lap : 0
  return (
    <span className="lchat__at">
      <span className={`ts-chip ts-chip--${(status ?? 'unknown').toLowerCase()}`}>
        {lap !== null ? `L${lap}` : 'L?'}
        {status && status !== 'UNKNOWN' ? ` · ${STATUS_LABEL[status]}` : ''}
      </span>
      {behind > 0 && (
        <span className="lchat__ago" title="The race has moved on since">
          {behind} lap{behind === 1 ? '' : 's'} ago
        </span>
      )}
    </span>
  )
}

function Entry({ m, nowLap, tlas }: { m: LiveChatMessage; nowLap: number | null; tlas: TlaHighlight }) {
  if (m.role === 'system') {
    return (
      <li className="lchat__msg lchat__msg--system">
        <p className="msg__error" role="alert">
          <span className="flag" aria-hidden="true" />
          <strong>{m.failure ? FAILURE_LABEL[m.failure] : 'NOTICE'}</strong> {m.text}
        </p>
      </li>
    )
  }
  const user = m.role === 'user'
  const top = m.prediction ? [...m.prediction.table].sort((a, b) => b.p_win - a.p_win).slice(0, 3) : []
  return (
    <li className={`lchat__msg lchat__msg--${m.role}`}>
      <header className="lchat__head">
        <span className={`msg__who lchat__who--${m.role}`}>{user ? 'PIT WALL' : 'STRATEGY'}</span>
        <RaceAt lap={m.lap} status={m.status} nowLap={nowLap} />
        <time className="msg__time" dateTime={new Date(m.at).toISOString()}>
          {clock(m.at)}
        </time>
      </header>
      {user ? (
        <p className="msg__text lchat__q">{m.text}</p>
      ) : (
        <>
          <Markdown text={m.text} tlas={tlas} />
          {top.length > 0 && (
            <a className="lchat__pred" href="#who-wins" title="Full table in WHO WINS FROM HERE?">
              <span className="lchat__pred-label">WIN</span>
              {top.map((r) => (
                <span key={r.tla}>
                  <b>{r.tla}</b> {formatPct(r.p_win)}
                </span>
              ))}
              <span aria-hidden="true">↗</span>
            </a>
          )}
          {m.steps.length > 0 && (
            <details className="steplog">
              <summary>Telemetry log · {m.steps.length} steps</summary>
              <ol>
                {m.steps.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ol>
            </details>
          )}
        </>
      )}
    </li>
  )
}

export function LiveChat({ chat, closedHint, lap, status, drivers, follow, onClose }: Props) {
  const [text, setText] = useState('')
  const listRef = useRef<HTMLOListElement>(null)
  const { messages, pending } = chat.state
  // keyed by the field, not the snapshot object, so answers don't re-render on every timing update
  const fieldKey = drivers.map((d) => `${d.tla}:${d.team_colour}`).join(',')
  const tlas = useMemo<TlaHighlight>(
    () => ({
      colours: Object.fromEntries(fieldKey.split(',').filter(Boolean).map((p) => p.split(':') as [string, string])),
      follow,
    }),
    [fieldKey, follow],
  )

  useEffect(() => {
    const el = listRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages.length, pending])

  const ask = (q: string) => {
    if (!chat.canSend || !q.trim()) return
    chat.send(q, { lap, status })
    setText('')
  }
  const submit = (e: FormEvent) => {
    e.preventDefault()
    ask(text)
  }
  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      ask(text)
    }
  }

  return (
    <section className="lchat" aria-label="Strategy channel">
      <header className="feed__head lchat__bar">
        <h2 className="live-h">
          Strategy channel {messages.length > 0 && <span className="count">{messages.length}</span>}
        </h2>
        <span className={`lchat__tx${pending ? ' is-rx' : ''}`} aria-hidden="true">
          {pending ? 'RX' : closedHint ? 'OFF' : 'TX'}
        </span>
        {messages.length > 0 && !pending && (
          <button type="button" className="btn btn--xs" onClick={chat.clear}>
            Clear
          </button>
        )}
        <button type="button" className="btn btn--xs lchat__close" onClick={onClose} aria-label="Hide strategy channel">
          ▾ Hide
        </button>
      </header>
      <ol className="lchat__list" ref={listRef} aria-live="polite">
        {messages.length === 0 && (
          <li className="lchat__intro">
            Ask about the race <b>as it stands right now</b>: who wins from here, whether a car makes it to the flag on
            its tyres, who should pit. Every answer is stamped with the lap it was worked out on — the race keeps moving.
          </li>
        )}
        {messages.map((m) => (
          <Entry key={m.id} m={m} nowLap={lap} tlas={tlas} />
        ))}
        {pending && (
          <li className="lchat__msg lchat__msg--agent">
            <p className="ticker" role="status">
              <span className="ticker__dot" aria-hidden="true" />
              <span className="ticker__node">STRATEGY</span>
              <span className="ticker__detail">Simulating finishes from the current race state…</span>
            </p>
          </li>
        )}
      </ol>
      {closedHint && (
        <p className="lchat__closed" role="note">
          {closedHint}
        </p>
      )}
      <ul className="lchat__chips" aria-label="Suggested questions">
        {SUGGESTIONS.map((s) => (
          <li key={s}>
            <button type="button" className="lchat__chip" disabled={!chat.canSend} onClick={() => ask(s)}>
              {s}
            </button>
          </li>
        ))}
      </ul>
      <form className="lchat__composer" onSubmit={submit}>
        <label htmlFor="lchat-input" className="sr-only">
          Question to strategy about the live race
        </label>
        <textarea
          id="lchat-input"
          className="composer__input"
          rows={1}
          value={text}
          disabled={!!closedHint}
          placeholder={
            closedHint ? 'Channel closed' : pending ? 'Strategy is working it out…' : 'Radio to strategy… (Enter to send)'
          }
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
          maxLength={1000}
        />
        <button type="submit" className="composer__send" disabled={!chat.canSend || !text.trim()} aria-label="Send question">
          {pending ? 'BOX…' : 'SEND'}
        </button>
      </form>
    </section>
  )
}
