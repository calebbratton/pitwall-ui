import { memo } from 'react'
import { splitAnswer } from '../lib/format'
import type { ChatMessage } from '../types'
import { Markdown } from './Markdown'

const clock = (t: number) =>
  new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })

function AnswerBody({ text }: { text: string }) {
  const s = splitAnswer(text)
  if (!s) return <Markdown text={text} />
  return (
    <>
      {s.verdict && (
        <section className="ans ans--verdict" aria-label="Verdict">
          <h3 className="ans__label">Verdict</h3>
          <Markdown text={s.verdict} />
        </section>
      )}
      {s.findings && (
        <section className="ans ans--findings" aria-label="Findings">
          <h3 className="ans__label">Findings</h3>
          <Markdown text={s.findings} />
        </section>
      )}
      {s.caveats && (
        <section className="ans ans--caveats" aria-label="Caveats">
          <h3 className="ans__label">Caveats</h3>
          <Markdown text={s.caveats} />
        </section>
      )}
      {s.regulations && (
        <section className="ans ans--regs" aria-label="Regulations">
          <h3 className="ans__label">Regulations</h3>
          <Markdown text={s.regulations} />
        </section>
      )}
    </>
  )
}

export const Message = memo(function Message({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user'
  const last = message.steps.at(-1)
  return (
    <article className={`msg msg--${message.role} msg--${message.status}`}>
      <header className="msg__head">
        <span className="msg__who">{isUser ? 'PIT WALL' : 'STRATEGY'}</span>
        <time className="msg__time" dateTime={new Date(message.at).toISOString()}>
          {clock(message.at)}
        </time>
        {!isUser && message.status === 'streaming' && <span className="msg__live">LIVE</span>}
        {!isUser && message.answer?.mode && <span className="msg__mode">{message.answer.mode.toUpperCase()}</span>}
      </header>

      <div className="msg__body">
        {isUser && <p className="msg__text">{message.text}</p>}

        {!isUser && message.status === 'streaming' && (
          <p className="ticker" role="status">
            <span className="ticker__dot" aria-hidden="true" />
            <span className="ticker__node">{last ? last.node.toUpperCase() : 'CONNECTING'}</span>
            <span className="ticker__detail">{last ? last.detail : 'Opening channel to strategy…'}</span>
          </p>
        )}

        {!isUser && message.status === 'done' && <AnswerBody text={message.text} />}

        {!isUser && message.status === 'error' && (
          <p className="msg__error" role="alert">
            <span className="flag" aria-hidden="true" />
            <strong>RED FLAG</strong> {message.error}
          </p>
        )}

        {!isUser && message.status !== 'streaming' && message.steps.length > 0 && (
          <details className="steplog">
            <summary>Telemetry log · {message.steps.length} steps</summary>
            <ol>
              {message.steps.map((s, i) => (
                <li key={i}>
                  <span className="steplog__node">{s.node}</span> {s.detail}
                </li>
              ))}
            </ol>
          </details>
        )}
      </div>
    </article>
  )
})
