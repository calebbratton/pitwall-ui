import type { Citation } from '../types'
import { enrich } from './rich'

interface Props {
  citations: Citation[]
  cited: Set<string>
}

export function Citations({ citations, cited }: Props) {
  return (
    <section className="panel-sec" aria-labelledby="cites-h">
      <h2 id="cites-h" className="panel-sec__h">
        Regulations <span className="count">{citations.length}</span>
      </h2>
      {citations.length === 0 ? (
        <p className="muted">No clauses retrieved yet.</p>
      ) : (
        <ul className="cites">
          {citations.map((c, i) => (
            <li key={`${c.article}-${i}`}>
              <details
                id={`cite-${c.article}`}
                className={`cite ${cited.has(c.article) ? 'cite--used' : ''}`}
              >
                <summary>
                  <span className="cite__art">{c.article}</span>
                  <span className="cite__src">{c.citation}</span>
                  {cited.has(c.article) ? (
                    <span className="cite__flag">CITED</span>
                  ) : (
                    <span className="cite__flag cite__flag--ctx">CONTEXT</span>
                  )}
                </summary>
                <div className="cite__text">
                  {c.text.split('\n').map((line, j) => (
                    <p key={j}>{enrich(line)}</p>
                  ))}
                </div>
              </details>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
