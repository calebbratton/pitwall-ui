import { describe, expect, it } from 'vitest'
import { createSSEParser, readSSE, type SSEFrame } from './sse'

function parseAll(chunks: string[]): SSEFrame[] {
  const p = createSSEParser()
  const out: SSEFrame[] = []
  for (const c of chunks) out.push(...p.push(c))
  out.push(...p.flush())
  return out
}

describe('createSSEParser', () => {
  it('parses a single complete frame', () => {
    expect(parseAll(['event: thread\ndata: {"thread_id":"abc"}\n\n'])).toEqual([
      { event: 'thread', data: '{"thread_id":"abc"}' },
    ])
  })

  it('handles multiple events in one chunk', () => {
    const frames = parseAll([
      'event: thread\ndata: {"thread_id":"t"}\n\nevent: step\ndata: {"node":"route"}\n\nevent: step\ndata: {"node":"resolve"}\n\n',
    ])
    expect(frames.map((f) => f.event)).toEqual(['thread', 'step', 'step'])
    expect(JSON.parse(frames[2].data)).toEqual({ node: 'resolve' })
  })

  it('reassembles frames split across chunks at arbitrary points', () => {
    const wire = 'event: step\ndata: {"node":"fetch","detail":"fetch round 1"}\n\nevent: answer\ndata: {"answer":"ok"}\n\n'
    const expected = parseAll([wire])
    // Every possible single split point, plus one-char-at-a-time.
    for (let i = 1; i < wire.length; i++) {
      expect(parseAll([wire.slice(0, i), wire.slice(i)])).toEqual(expected)
    }
    expect(parseAll(wire.split(''))).toEqual(expected)
  })

  it('does not emit a frame until the blank line arrives', () => {
    const p = createSSEParser()
    expect(p.push('event: step\ndata: {"node":"route"}\n')).toEqual([])
    expect(p.push('\n')).toEqual([{ event: 'step', data: '{"node":"route"}' }])
  })

  it('joins multi-line data with newlines', () => {
    expect(parseAll(['event: answer\ndata: line one\ndata: line two\ndata:\ndata: line four\n\n'])).toEqual([
      { event: 'answer', data: 'line one\nline two\n\nline four' },
    ])
  })

  it('supports CRLF and CR line endings, including CRLF split across chunks', () => {
    expect(parseAll(['event: a\r\ndata: 1\r\n\r\n', 'event: b\rdata: 2\r\r'])).toEqual([
      { event: 'a', data: '1' },
      { event: 'b', data: '2' },
    ])
    expect(parseAll(['event: a\r', '\ndata: 1\r', '\n\r', '\n'])).toEqual([{ event: 'a', data: '1' }])
  })

  it('ignores comments, unknown fields and data-less frames; defaults event to message', () => {
    expect(parseAll([': keep-alive\n\nretry: 1000\nfoo: bar\n\nevent: ping\n\ndata: hi\n\n'])).toEqual([
      { event: 'message', data: 'hi' },
    ])
  })

  it('strips exactly one leading space after the colon and keeps colons in values', () => {
    expect(parseAll(['data:  two spaces: yes\n\n'])).toEqual([{ event: 'message', data: ' two spaces: yes' }])
  })

  it('carries the id field', () => {
    expect(parseAll(['id: 7\nevent: step\ndata: x\n\n'])).toEqual([{ event: 'step', data: 'x', id: '7' }])
  })

  it('flushes a trailing frame without a terminating blank line', () => {
    expect(parseAll(['event: error\ndata: {"message":"boom"}'])).toEqual([
      { event: 'error', data: '{"message":"boom"}' },
    ])
  })
})

describe('readSSE', () => {
  it('decodes a byte stream with multi-byte UTF-8 split across chunks', async () => {
    const bytes = new TextEncoder().encode('event: answer\ndata: {"answer":"Norris — 78.403 s"}\n\n')
    const dash = bytes.indexOf(0xe2) // first byte of the em dash
    const chunks = [bytes.slice(0, dash + 1), bytes.slice(dash + 1)]
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        for (const c of chunks) controller.enqueue(c)
        controller.close()
      },
    })
    const frames: SSEFrame[] = []
    await readSSE(stream, (f) => frames.push(f))
    expect(frames).toEqual([{ event: 'answer', data: '{"answer":"Norris — 78.403 s"}' }])
  })
})
