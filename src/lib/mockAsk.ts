/**
 * Mock of the backend's live race state and POST /api/live/ask. The mock replay registers each live
 * session here (like the server does) and updates it as frames go out; the mock ask simulates finishes
 * from that state and answers a few question shapes with canned, state-driven text.
 */
import type { LiveSource, Snapshot, TimingRow, TrackStatus, TyreRisk } from '../liveTypes'
import type { Compound } from './format'
import type { AskAnswer, AskResult, AskTransport } from './liveAsk'
import { parseAskResponse } from './liveAsk'
import { STATUS_LABEL } from './replay'

// ---------- server-side live sessions (mock) ----------

interface MockLive {
  source: LiveSource
  snapshot: Snapshot | null
  status: TrackStatus | null
}

const sessions = new Map<string, MockLive>()

export function registerMockLive(id: string, source: LiveSource = 'replay'): void {
  sessions.set(id, { source, snapshot: null, status: null })
}

export function updateMockLive(id: string, patch: Partial<MockLive>): void {
  const s = sessions.get(id)
  if (s) sessions.set(id, { ...s, ...patch })
}

/** The server forgets a live session (stopped / restarted) -> asks get 404. */
export function dropMockLive(id: string): void {
  sessions.delete(id)
}

// ---------- prediction ----------

/** Longest stint per compound at the mock circuit (plays the role of the backend's 2026 stint data). */
export const MAX_STINT: Record<Compound, number> = { SOFT: 30, MEDIUM: 46, HARD: 48, INTERMEDIATE: 30, WET: 30 }
/** Pirelli allocation at the mock circuit (the relative names map to C-numbers per weekend) */
const PIRELLI: Partial<Record<Compound, string>> = { HARD: 'C3', MEDIUM: 'C4', SOFT: 'C5' }
const GREEN_PIT_LOSS = 16.8
const NEUTRALISED_STATUSES: readonly TrackStatus[] = ['SAFETY_CAR', 'VSC', 'VSC_ENDING']

type Row = Pick<TimingRow, 'tla' | 'position' | 'gap' | 'laps_down' | 'compound' | 'tyre_age' | 'pit_stops' | 'retired'>

export interface MockPredictionRow {
  tla: string
  position: number
  expected: number
  p_win: number
  p_podium: number
  compound: Compound | null
  compound_c: string | null
  tyre_age: number | null
  stopped: boolean
  tyre_risk: TyreRisk
  tyre_note: string
}

export interface MockPrediction {
  lap: number
  laps_remaining: number
  status: TrackStatus
  sims: number
  table: MockPredictionRow[]
  notes: string[]
}

/** Deterministic PRNG so the mock prediction (and its tests) are stable. */
function rng(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function tyre(r: Row, lapsRemaining: number): { risk: TyreRisk; note: string; over: number } {
  if (!r.compound || r.tyre_age === null) return { risk: 'low', note: 'Tyre data unavailable.', over: 0 }
  const max = MAX_STINT[r.compound]
  const c = r.compound.toLowerCase()
  const end = r.tyre_age + lapsRemaining
  const over = end - max
  if (over > 6) {
    return { risk: 'high', over, note: `${r.tyre_age} laps old; ${over} past the longest 2026 ${c} stint here (${max}) by the flag` }
  }
  if (over > 0) {
    return { risk: 'medium', over, note: `${r.tyre_age} laps old; ${over} past the longest 2026 ${c} stint here (${max}) by the flag` }
  }
  return { risk: 'low', over, note: `${r.tyre_age} laps old; ${-over} laps of margin to the longest 2026 ${c} stint (${max})` }
}

/**
 * "Who wins from here" from a timing snapshot: each car's finishing time = compressed gap + a stop if it
 * still needs one + tyre wear past the longest stint + noise, over `sims` simulations.
 */
export function mockPrediction(rows: Row[], lap: number, totalLaps: number, status: TrackStatus, sims = 2000): MockPrediction {
  const neutral = NEUTRALISED_STATUSES.includes(status)
  const pitLoss = neutral ? (status === 'SAFETY_CAR' ? 8.4 : 10.1) : GREEN_PIT_LOSS
  const lapsRemaining = Math.max(0, totalLaps - lap)
  const cars = rows
    .filter((r) => !r.retired && r.position !== null)
    .sort((a, b) => (a.position ?? 99) - (b.position ?? 99))
    .map((r) => {
      const t = tyre(r, lapsRemaining)
      const stopped = r.pit_stops > 0
      const gap = (r.gap ?? 0) + r.laps_down * 105
      const base = gap * (neutral ? 0.3 : 1) + (stopped ? 0 : pitLoss) + Math.max(0, t.over) * 0.9
      return { r, t, stopped, base }
    })
  const n = cars.length
  const wins = new Array<number>(n).fill(0)
  const podiums = new Array<number>(n).fill(0)
  const sumPos = new Array<number>(n).fill(0)
  const rand = rng(lap * 7919 + n)
  const sigma = 2.2 + lapsRemaining * 0.12
  for (let s = 0; s < sims; s++) {
    const times = cars.map((c, i) => {
      // Box-Muller
      const z = Math.sqrt(-2 * Math.log(rand() || 1e-9)) * Math.cos(2 * Math.PI * rand())
      return { i, t: c.base + z * sigma * (c.t.risk === 'high' ? 1.6 : 1) }
    })
    times.sort((a, b) => a.t - b.t)
    times.forEach((x, pos) => {
      sumPos[x.i] += pos + 1
      if (pos === 0) wins[x.i]++
      if (pos < 3) podiums[x.i]++
    })
  }
  const round = (v: number, d = 3) => Number(v.toFixed(d))
  const table = cars.map((c, i) => ({
    tla: c.r.tla,
    position: c.r.position ?? i + 1,
    expected: round(sumPos[i] / sims, 1),
    p_win: round(wins[i] / sims),
    p_podium: round(podiums[i] / sims),
    compound: c.r.compound,
    compound_c: (c.r.compound && PIRELLI[c.r.compound]) ?? null,
    tyre_age: c.r.tyre_age,
    stopped: c.stopped,
    tyre_risk: c.t.risk,
    tyre_note: c.t.note,
  }))
  const notes = [
    `${sims.toLocaleString('en-US')} simulated finishes from the lap ${lap} order (mock model).`,
    neutral
      ? `Gaps compressed under the ${STATUS_LABEL[status].toLowerCase()}; a stop costs ~${pitLoss}s instead of ~${GREEN_PIT_LOSS}s.`
      : `A stop costs ~${GREEN_PIT_LOSS}s under green.`,
    'Cars that have not stopped yet must still make their mandatory stop.',
  ]
  return { lap, laps_remaining: lapsRemaining, status, sims, table, notes }
}

// ---------- canned answers ----------

const pct = (p: number) => (p >= 0.995 ? '>99%' : p > 0 && p < 0.005 ? '<1%' : `${Math.round(p * 100)}%`)

function winAnswer(p: MockPrediction): string {
  const top = [...p.table].sort((a, b) => b.p_win - a.p_win).slice(0, 3)
  const [fav] = top
  const leader = p.table[0]
  const lines = top.map(
    (r) =>
      `- **${r.tla}** (P${r.position}, ${r.compound ?? '?'} ${r.tyre_age ?? '?'} laps${r.stopped ? '' : ', still to stop'}): ${pct(r.p_win)} win, ${pct(r.p_podium)} podium`,
  )
  const lead =
    fav.tla === leader.tla
      ? `**${fav.tla}** is the favourite from the lead: ${pct(fav.p_win)} to win with ${p.laps_remaining} laps to go.`
      : `**${fav.tla}** is the favourite (${pct(fav.p_win)}) even though **${leader.tla}** leads: the leader's ${leader.stopped ? `${leader.compound?.toLowerCase()} tyres are the problem` : 'mandatory stop is still to come'}.`
  const risky = p.table.filter((r) => r.tyre_risk === 'high').map((r) => r.tla)
  return [
    lead,
    '',
    ...lines,
    '',
    'Caveats:',
    `- ${risky.length ? `High tyre risk for ${risky.slice(0, 4).join(', ')}; a late stop would reshuffle the podium.` : 'No car is past its tyre life; pace decides it.'}`,
    '- Another neutralisation would compress the field again.',
  ].join('\n')
}

function tyreAnswer(p: MockPrediction, tla: string | null): string {
  const r = p.table.find((x) => x.tla === tla) ?? p.table[0]
  const who = tla && r.tla === tla ? `**${r.tla}**` : `The leader, **${r.tla}**,`
  const c = r.compound ? `${r.compound} tyres` : 'current tyres'
  const verdict =
    r.tyre_risk === 'low'
      ? `${who} can make it: the ${c} have margin.`
      : r.tyre_risk === 'medium'
        ? `${who} can probably make it on the ${c}, but it is marginal.`
        : `${who} is unlikely to make it to the flag on these ${c}.`
  return [
    verdict,
    '',
    `- ${r.tyre_note}.`,
    `- ${p.laps_remaining} laps remaining; ${r.stopped ? 'already made the mandatory stop' : 'still has to make the mandatory stop, so fresh tyres are coming anyway'}.`,
    `- Win chance as things stand: ${pct(r.p_win)} (expected finish P${r.expected.toFixed(1)}).`,
    '',
    'Caveats:',
    '- Stint lengths come from this season at this circuit; track temperature and fuel load shift them.',
  ].join('\n')
}

function pitAnswer(p: MockPrediction): string {
  const neutral = NEUTRALISED_STATUSES.includes(p.status)
  const box = p.table.filter((r) => !r.stopped || r.tyre_risk === 'high')
  const stay = p.table.filter((r) => r.stopped && r.tyre_risk !== 'high')
  const head = neutral
    ? `Under the ${STATUS_LABEL[p.status].toLowerCase()} a stop is cheap: **${box.length} cars should box**, ${stay.length} stay out.`
    : `No safety car right now (${STATUS_LABEL[p.status].toLowerCase()}), so a stop costs the full ~${GREEN_PIT_LOSS}s. Only cars that must stop should come in.`
  return [
    head,
    '',
    ...box.slice(0, 8).map((r) => `- **${r.tla}** (P${r.position}): BOX — ${r.stopped ? r.tyre_note : `mandatory stop still to make; ${r.compound ?? 'tyre'} ${r.tyre_age ?? '?'} laps old`}`),
    ...(stay.length ? [`- Stay out: ${stay.map((r) => r.tla).join(', ')}.`] : []),
    '',
    'Caveats:',
    '- Assumes the cars behind stay out; a train of stops changes the places at risk.',
  ].join('\n')
}

const TLA = /\b([A-Z]{3})\b/g

export function mockAnswer(message: string, live: { snapshot: Snapshot; status: TrackStatus }): AskAnswer {
  const snap = live.snapshot
  const lap = snap.lap ?? 1
  const total = snap.total_laps ?? lap
  const p = mockPrediction(snap.drivers, lap, total, live.status)
  const known = new Set(snap.drivers.map((d) => d.tla))
  const tla = [...message.toUpperCase().matchAll(TLA)].map((m) => m[1]).find((t) => known.has(t)) ?? null
  const m = message.toLowerCase()
  let answer: string
  if (/\b(pit|box|stop)\b/.test(m)) answer = pitAnswer(p)
  else if (/make it|tyre|tire|end|flag|last|stint/.test(m)) answer = tyreAnswer(p, tla)
  else answer = winAnswer(p)
  const body = {
    answer,
    lap,
    status: live.status,
    prediction: p,
    steps: [
      `race state · L${lap}/${total} · ${STATUS_LABEL[live.status]} · ${p.table.length} cars running`,
      `simulate · ${p.sims} finishes`,
      'tyre check · longest 2026 stints per compound',
      'strategist · compose answer',
    ],
  }
  // round-trip through the real parser so the mock can't drift from the contract
  return parseAskResponse(JSON.parse(JSON.stringify(body))) as AskAnswer
}

function wait(ms: number, signal?: AbortSignal): Promise<boolean> {
  return new Promise((resolve) => {
    if (signal?.aborted) return resolve(false)
    const t = setTimeout(() => resolve(true), ms)
    signal?.addEventListener('abort', () => {
      clearTimeout(t)
      resolve(false)
    })
  })
}

/** Mock POST /api/live/ask with the backend's 404 / 409 semantics. Include `/offline` to simulate no network. */
export const mockAsk: AskTransport = async (req, signal): Promise<AskResult> => {
  const ok = await wait(1400, signal)
  if (!ok) return { ok: false, kind: 'aborted', message: 'Cancelled.' }
  if (req.message.includes('/offline')) return { ok: false, kind: 'network', message: 'No signal from strategy (mock).' }
  const live = sessions.get(req.live_id)
  if (!live) return { ok: false, kind: 'gone', message: `Live session ${req.live_id.slice(0, 8)} is not running any more.` }
  if (!live.snapshot || live.snapshot.drivers.length === 0 || live.snapshot.lap === null) {
    return { ok: false, kind: 'early', message: 'Not enough race data yet — ask again once timing is flowing.' }
  }
  return { ok: true, data: mockAnswer(req.message, { snapshot: live.snapshot, status: live.status ?? live.snapshot.status }) }
}
