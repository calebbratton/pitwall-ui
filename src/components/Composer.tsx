import { useState, type FormEvent, type KeyboardEvent } from 'react'

interface Props {
  onSend: (text: string) => void
  streaming: boolean
  threadId: string | null
}

export function Composer({ onSend, streaming, threadId }: Props) {
  const [text, setText] = useState('')
  const canSend = !streaming && text.trim().length > 0

  const submit = (e?: FormEvent) => {
    e?.preventDefault()
    if (!canSend) return
    onSend(text)
    setText('')
  }

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      submit()
    }
  }

  return (
    <form className="composer" onSubmit={submit}>
      <div className="composer__meta" aria-hidden="true">
        <span className={`composer__tx ${streaming ? 'is-rx' : ''}`}>{streaming ? 'RX' : 'TX'}</span>
        <span className="composer__thread">{threadId ? `CH ${threadId.slice(0, 8)}` : 'NEW CHANNEL'}</span>
      </div>
      <label htmlFor="composer-input" className="sr-only">
        Message to strategy
      </label>
      <textarea
        id="composer-input"
        className="composer__input"
        rows={1}
        value={text}
        placeholder={streaming ? 'Strategy is responding…' : 'Radio to strategy… (Enter to send, Shift+Enter for newline)'}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={onKeyDown}
        maxLength={4000}
      />
      <button type="submit" className="composer__send" disabled={!canSend} aria-label="Send message">
        {streaming ? 'BOX…' : 'SEND'}
      </button>
    </form>
  )
}
