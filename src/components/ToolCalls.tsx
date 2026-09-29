import type { ToolCall } from '../types'

function formatArgs(args: Record<string, unknown>): string {
  return Object.entries(args)
    .map(([k, v]) => `${k}=${typeof v === 'string' ? `'${v}'` : JSON.stringify(v)}`)
    .join(', ')
}

export function ToolCalls({ calls }: { calls: ToolCall[] }) {
  return (
    <section className="panel-sec" aria-labelledby="tools-h">
      <h2 id="tools-h" className="panel-sec__h">
        Tool calls <span className="count">{calls.length}</span>
      </h2>
      {calls.length === 0 ? (
        <p className="muted">No telemetry tools called.</p>
      ) : (
        <ol className="tools">
          {calls.map((c, i) => (
            <li key={i}>
              <span className="tools__n">{String(i + 1).padStart(2, '0')}</span>
              <code>
                <span className="tools__fn">{c.tool}</span>({formatArgs(c.args)})
              </code>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}
