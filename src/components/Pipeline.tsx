import { pipelineState, type NodeStatus } from '../lib/pipeline'
import type { SessionInfo } from '../hooks/useChat'

const LABELS: Record<string, string> = {
  route: 'Route',
  resolve: 'Resolve',
  fetch: 'Fetch',
  tools: 'Tools',
  retrieve: 'Retrieve',
  analyze: 'Analyze',
  synthesize: 'Synthesize',
}

const STATUS_TEXT: Record<NodeStatus, string> = {
  idle: 'waiting',
  running: 'running',
  done: 'complete',
  skipped: 'skipped',
  error: 'failed',
}

export function Pipeline({ session }: { session: SessionInfo }) {
  const nodes = pipelineState(session.steps, session.phase)
  return (
    <section className="panel-sec" aria-labelledby="pipeline-h">
      <h2 id="pipeline-h" className="panel-sec__h">
        Pipeline
        <span className={`tag tag--phase-${session.phase}`}>{session.phase}</span>
      </h2>
      <ol className="pipeline">
        {nodes.map((n, i) => (
          <li key={n.node} className={`pipe pipe--${n.status}`}>
            <span className="pipe__light" aria-hidden="true" />
            <span className="pipe__idx" aria-hidden="true">
              S{i + 1}
            </span>
            <span className="pipe__name">{LABELS[n.node]}</span>
            {n.count > 1 && <span className="pipe__count">×{n.count}</span>}
            <span className="sr-only">{STATUS_TEXT[n.status]}</span>
            {n.detail && (
              <span className="pipe__detail" title={n.detail}>
                {n.detail}
              </span>
            )}
          </li>
        ))}
      </ol>
    </section>
  )
}
