export type NodeName = 'route' | 'resolve' | 'fetch' | 'tools' | 'retrieve' | 'analyze' | 'synthesize'

export const NODE_ORDER: readonly NodeName[] = [
  'route',
  'resolve',
  'fetch',
  'tools',
  'retrieve',
  'analyze',
  'synthesize',
]

export interface RaceInfo {
  year: number
  place: string
  session_key: number
  race_date: string
}

export interface RegsInfo {
  season: number
  issue: number
}

export interface Citation {
  article: string
  citation: string
  text: string
}

export interface ToolCall {
  tool: string
  args: Record<string, unknown>
}

export interface AnswerPayload {
  answer: string
  mode: 'race' | 'rules' | null
  race: RaceInfo | null
  regs: RegsInfo | null
  citations: Citation[]
  tool_calls: ToolCall[]
  steps: string[]
}

export interface StepPayload {
  node: NodeName
  detail: string
}

export type ChatEvent =
  | { type: 'thread'; thread_id: string }
  | { type: 'step'; node: NodeName; detail: string }
  | { type: 'answer'; payload: AnswerPayload }
  | { type: 'error'; message: string }

export interface ChatRequest {
  thread_id: string | null
  message: string
}

export type Role = 'user' | 'agent'

export interface ChatMessage {
  id: string
  role: Role
  text: string
  status: 'streaming' | 'done' | 'error'
  steps: StepPayload[]
  answer?: AnswerPayload
  error?: string
  at: number
}

export type ConnectionState = 'checking' | 'online' | 'mock' | 'offline'
