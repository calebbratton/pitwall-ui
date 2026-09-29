import type { NodeName, StepPayload } from '../types'
import { NODE_ORDER } from '../types'

export type NodeStatus = 'idle' | 'running' | 'done' | 'skipped' | 'error'

export interface NodeState {
  node: NodeName
  status: NodeStatus
  count: number
  detail: string
}

/** Step events arrive when a node completes; guess which node is running now. */
function nextNode(last: StepPayload | undefined, route: StepPayload | undefined): NodeName | null {
  if (!last) return 'route'
  switch (last.node) {
    case 'route':
      return 'resolve'
    case 'resolve':
      if (/\berror\b|not found|no session/i.test(last.detail)) return 'synthesize'
      return route && /mode=rules/.test(route.detail) ? 'retrieve' : 'fetch'
    case 'fetch':
      return /:\s*done\s*$/.test(last.detail) ? 'retrieve' : 'tools'
    case 'tools':
      return 'fetch'
    case 'retrieve':
      return 'analyze'
    case 'analyze':
      return 'synthesize'
    case 'synthesize':
      return null
  }
}

export type RunPhase = 'idle' | 'streaming' | 'done' | 'error'

export function pipelineState(steps: StepPayload[], phase: RunPhase): NodeState[] {
  const seen = new Map<NodeName, { count: number; detail: string }>()
  for (const s of steps) {
    const prev = seen.get(s.node)
    seen.set(s.node, { count: (prev?.count ?? 0) + 1, detail: s.detail })
  }
  const running =
    phase === 'streaming' || phase === 'error'
      ? nextNode(steps.at(-1), steps.find((s) => s.node === 'route'))
      : null
  return NODE_ORDER.map((node) => {
    const info = seen.get(node)
    let status: NodeStatus = info ? 'done' : 'idle'
    if (node === running) status = phase === 'error' ? 'error' : 'running'
    else if (!info && phase === 'done') status = 'skipped'
    return { node, status, count: info?.count ?? 0, detail: info?.detail ?? '' }
  })
}
