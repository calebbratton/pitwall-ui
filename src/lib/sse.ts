/**
 * Minimal Server-Sent Events parser for streams consumed via fetch().
 * EventSource can't POST, so we parse the wire format ourselves.
 * Follows the WHATWG event-stream rules that matter here: CRLF/LF/CR line
 * endings, multi-line `data:`, comment lines, and blank-line dispatch.
 */

export interface SSEFrame {
  event: string
  data: string
  id?: string
}

export interface SSEParser {
  /** Feed a decoded text chunk; returns every frame completed by it. */
  push(chunk: string): SSEFrame[]
  /** Signal end of stream; returns a trailing frame if one was left undispatched. */
  flush(): SSEFrame[]
}

export function createSSEParser(): SSEParser {
  let buffer = ''
  let event = ''
  let dataLines: string[] = []
  let id: string | undefined
  let hasData = false

  const dispatch = (out: SSEFrame[]) => {
    if (hasData) {
      const frame: SSEFrame = { event: event || 'message', data: dataLines.join('\n') }
      if (id !== undefined) frame.id = id
      out.push(frame)
    }
    event = ''
    dataLines = []
    hasData = false
  }

  const processLine = (line: string, out: SSEFrame[]) => {
    if (line === '') {
      dispatch(out)
      return
    }
    if (line.startsWith(':')) return // comment / keep-alive
    const colon = line.indexOf(':')
    const field = colon === -1 ? line : line.slice(0, colon)
    let value = colon === -1 ? '' : line.slice(colon + 1)
    if (value.startsWith(' ')) value = value.slice(1)
    switch (field) {
      case 'event':
        event = value
        break
      case 'data':
        dataLines.push(value)
        hasData = true
        break
      case 'id':
        id = value
        break
      default:
        break // `retry` and unknown fields are ignored
    }
  }

  const drain = (final: boolean): SSEFrame[] => {
    const out: SSEFrame[] = []
    let start = 0
    for (let i = 0; i < buffer.length; i++) {
      const ch = buffer[i]
      if (ch !== '\n' && ch !== '\r') continue
      // A trailing CR might be the first half of a CRLF split across chunks.
      if (ch === '\r' && i === buffer.length - 1 && !final) break
      processLine(buffer.slice(start, i), out)
      if (ch === '\r' && buffer[i + 1] === '\n') i++
      start = i + 1
    }
    buffer = buffer.slice(start)
    return out
  }

  return {
    push(chunk) {
      buffer += chunk
      return drain(false)
    },
    flush() {
      const out = drain(true)
      if (buffer !== '') {
        processLine(buffer, out)
        buffer = ''
      }
      // Be lenient: dispatch a final frame even without the terminating blank line.
      dispatch(out)
      return out
    },
  }
}

/** Read a byte stream as SSE, invoking onFrame for each complete frame. */
export async function readSSE(
  stream: ReadableStream<Uint8Array>,
  onFrame: (frame: SSEFrame) => void,
): Promise<void> {
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  const parser = createSSEParser()
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      for (const frame of parser.push(decoder.decode(value, { stream: true }))) onFrame(frame)
    }
    const tail = decoder.decode()
    if (tail) for (const frame of parser.push(tail)) onFrame(frame)
    for (const frame of parser.flush()) onFrame(frame)
  } finally {
    reader.releaseLock()
  }
}
