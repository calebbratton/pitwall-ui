import { useEffect, useMemo } from 'react'
import type { SessionInfo } from '../hooks/useChat'
import { tokenize } from '../lib/format'
import { Citations } from './Citations'
import { Pipeline } from './Pipeline'
import { RaceCard } from './RaceCard'
import { ToolCalls } from './ToolCalls'

interface Props {
  session: SessionInfo
  open: boolean
  onClose: () => void
  focusArticle: { article: string; nonce: number } | null
}

export function SessionPanel({ session, open, onClose, focusArticle }: Props) {
  const answer = session.answer

  const cited = useMemo(() => {
    const s = new Set<string>()
    if (answer) for (const t of tokenize(answer.answer)) if (t.kind === 'refs') t.articles.forEach((a) => s.add(a))
    return s
  }, [answer])

  useEffect(() => {
    if (!focusArticle) return
    const el = document.getElementById(`cite-${focusArticle.article}`)
    if (el instanceof HTMLDetailsElement) {
      el.open = true
      el.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
      el.querySelector('summary')?.focus()
    }
  }, [focusArticle])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  return (
    <aside id="session-panel" className={`panel ${open ? 'is-open' : ''}`} aria-label="Session telemetry">
      <div className="panel__mobilehead">
        <span>SESSION TELEMETRY</span>
        <button type="button" className="btn" onClick={onClose}>
          Close
        </button>
      </div>
      <RaceCard session={session} />
      <Pipeline session={session} />
      <ToolCalls calls={answer?.tool_calls ?? []} />
      <Citations citations={answer?.citations ?? []} cited={cited} />
    </aside>
  )
}
