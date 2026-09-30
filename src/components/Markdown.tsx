import { useMemo, type ReactNode } from 'react'
import ReactMarkdown, { type Components } from 'react-markdown'
import type { TlaHighlight } from './rich'
import { enrich } from './rich'

function makeComponents(tlas?: TlaHighlight): Components {
  const e = (children: ReactNode) => enrich(children, 'r', tlas)
  return {
    p: ({ children }) => <p>{e(children)}</p>,
    li: ({ children }) => <li>{e(children)}</li>,
    strong: ({ children }) => <strong>{e(children)}</strong>,
    em: ({ children }) => <em>{e(children)}</em>,
    td: ({ children }) => <td>{e(children)}</td>,
    a: ({ children, href }) => (
      <a href={href} target="_blank" rel="noreferrer noopener">
        {children}
      </a>
    ),
  }
}

const plain = makeComponents()

/** Markdown with compound pills, article chips and lap times; `tlas` also highlights driver codes. */
export function Markdown({ text, tlas }: { text: string; tlas?: TlaHighlight }) {
  const components = useMemo(() => (tlas ? makeComponents(tlas) : plain), [tlas])
  return (
    <div className="md">
      <ReactMarkdown components={components}>{text}</ReactMarkdown>
    </div>
  )
}
