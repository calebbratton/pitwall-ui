import ReactMarkdown, { type Components } from 'react-markdown'
import { enrich } from './rich'

const components: Components = {
  p: ({ children }) => <p>{enrich(children)}</p>,
  li: ({ children }) => <li>{enrich(children)}</li>,
  strong: ({ children }) => <strong>{enrich(children)}</strong>,
  em: ({ children }) => <em>{enrich(children)}</em>,
  td: ({ children }) => <td>{enrich(children)}</td>,
  a: ({ children, href }) => (
    <a href={href} target="_blank" rel="noreferrer noopener">
      {children}
    </a>
  ),
}

export function Markdown({ text }: { text: string }) {
  return (
    <div className="md">
      <ReactMarkdown components={components}>{text}</ReactMarkdown>
    </div>
  )
}
