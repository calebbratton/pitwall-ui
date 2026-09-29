import { useEffect, useRef } from 'react'
import type { ChatMessage } from '../types'
import { SUGGESTIONS } from '../lib/suggestions'
import { Message } from './Message'


interface Props {
  messages: ChatMessage[]
  onSuggest: (text: string) => void
  disabled: boolean
}

export function Transcript({ messages, onSuggest, disabled }: Props) {
  const endRef = useRef<HTMLDivElement>(null)
  const lastSteps = messages.at(-1)?.steps.length ?? 0
  const lastStatus = messages.at(-1)?.status

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages.length, lastSteps, lastStatus])

  return (
    <section className="transcript" aria-label="Team radio transcript">
      <div className="transcript__scroll" aria-live="polite" aria-relevant="additions">
        {messages.length === 0 ? (
          <div className="empty">
            <p className="empty__kicker">RADIO CHECK</p>
            <h1 className="empty__title">Post-race strategy review</h1>
            <p className="empty__lede">
              Ask about a race from the OpenF1 era, or about the FIA Sporting Regulations. Answers cite the
              articles and telemetry they rely on.
            </p>
            <ul className="chips" aria-label="Suggested questions">
              {SUGGESTIONS.map((s) => (
                <li key={s}>
                  <button type="button" className="chip" onClick={() => onSuggest(s)} disabled={disabled}>
                    {s}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          messages.map((m) => <Message key={m.id} message={m} />)
        )}
        <div ref={endRef} />
      </div>
    </section>
  )
}
