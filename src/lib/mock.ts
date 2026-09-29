/**
 * Scripted mock of POST /api/chat. It encodes events as real SSE bytes and
 * streams them (with delays and awkward chunk splits) through the same parser
 * the live client uses, so the UI path is identical.
 *
 * Script selection is keyword based:
 *   - red flag + work/repair      -> rules: work permitted during a suspension (2026)
 *   - race words (lap, undercut…) -> race: McLaren hard tyres, Monaco 2024
 *   - anything else               -> rules: two-compound rule after a red flag (2026)
 *   - message containing "/error" -> scripted error event
 */
import type { AnswerPayload, NodeName } from '../types'
import type { ChatTransport } from './events'
import { frameToEvent } from './events'
import { readSSE } from './sse'

type ScriptEvent =
  | { event: 'step'; node: NodeName; detail: string; delay: number }
  | { event: 'answer'; payload: AnswerPayload; delay: number }
  | { event: 'error'; message: string; delay: number }

const RACE_REGS_TEXT = {
  '30.5':
    '30.5 Use of Tyres\na) All tyres must be operated in accordance with the prescriptions issued prior to each Competition by the FIA and the appointed tyre supplier, including any additional or modified procedures set out in the Appendix to these Sporting Regulations or as communicated directly by the FIA and the appointed tyre supplier.\nb) The only sets of tyres which may be used during a Competition are those which are defined in Article 30.2a). … Unless he has used intermediate or wet-weather tyres during the race, each driver must use at least two (2) different specifications of dry-weather tyres during the race.',
  '57.4':
    '57.4 Whilst the sprint session or the race is suspended:\na) The sprint session, the race nor the timekeeping system will stop, however, in accordance with Article 5.3 a)iii) the length of the sprint session suspension or in accordance with Article 5.4d) the length of the race suspension will be added to the maximum time period.\nb) Cars may be worked on once they have stopped in the fast lane but any such work is restricted to that listed in Articles 57.4b)i) to ix) and must not impede the resumption of the sprint session or the race.\n…\nvii) Changing wheels and tyres.',
  '55.11':
    '55.11 Under certain circumstances the clerk of the course may ask the cars and the safety car to use the pit lane. In these cases, a signal to use the pit lane will be displayed before the start of the pit entry road and all Competitors will be informed using the official messaging system, all cars must then enter the pit lane, drive through it and re-join the track. Any car entering the pit lane under these circumstances may however stop at its designated garage area.',
}

const race = { year: 2024, place: 'Monaco', session_key: 9523, race_date: '2024-05-26' }

const RACE_STEPS: [NodeName, string, number][] = [
  ['route', "route: mode=race year=2024 place=Monaco focus='McLaren hard tyre degradation and lap 30 undercut' queries=['tyre use two compounds', 'red flag suspension tyre change', 'pit lane']", 900],
  ['resolve', 'resolve: race=Monaco (Monaco, 2024-05-26) regs=2024 issue 6', 700],
  ['fetch', `fetch round 1: ["list_drivers({'team': 'McLaren'})", 'get_tyre_stints({})']`, 1400],
  ['tools', 'tools: list_drivers, get_tyre_stints -> 2 results', 600],
  ['fetch', `fetch round 2: ["get_pace_summary({'driver': 'NOR', 'lap_start': 4, 'lap_end': 30})", "get_pace_summary({'driver': 'NOR', 'lap_start': 31, 'lap_end': 78})", "get_pace_summary({'driver': 'PIA', 'lap_start': 31, 'lap_end': 78})"]`, 1500],
  ['tools', 'tools: get_pace_summary x3 -> 3 results', 700],
  ['fetch', 'fetch round 3: done', 900],
  ['retrieve', "retrieve (3 queries): ['30.5', '57.4', '55.11']", 800],
  ['analyze', 'analyze: 4 findings', 2200],
  ['synthesize', 'synthesize: rendered answer with 2 citations', 300],
]

const RACE_ANSWER = `No — an undercut on lap 30 was not a realistic option for McLaren. After the lap-1 red flag both cars changed to HARD tyres under the suspension and ran that single set from lap 1 to lap 78, so a lap-30 stop would have been a pure extra stop at a track where position is everything, and the hards were still getting faster.

- Both McLarens ran one set of HARD tyres for laps 1–78 after the lap-1 red flag; the free tyre change during the suspension satisfied the two-compound requirement, so no further stop was needed (NOR HARD laps 1–78; PIA HARD laps 1–78) [30.5, 57.4]
- Norris showed no meaningful hard-tyre degradation: his pace improved as fuel burned off (NOR mean laps 4–30: 79.824 s; NOR lap 30: 78.403 s; NOR mean laps 31–78: 77.666 s)
- Piastri's second-half pace on the same hards was similar, confirming the compound was not the limiting factor (PIA laps 31–78 pace summary)
- With the field managing pace and overtaking near impossible, a lap-30 stop onto fresh tyres could not recover the time lost in the pit lane, so the undercut offered no track-position gain

Caveats:
- Pace summaries exclude in/out laps and laps behind the red flag.
- Gaps to the cars ahead and behind were not fetched; the pit-loss comparison is qualitative.

Regulations:
- 2024 Sporting Regulations (Issue 6), Article 30.5
- 2024 Sporting Regulations (Issue 6), Article 57.4`

const RACE_ANSWER_PAYLOAD: AnswerPayload = {
  answer: RACE_ANSWER,
  mode: 'race',
  race,
  regs: { season: 2024, issue: 6 },
  citations: (['30.5', '57.4', '55.11'] as const).map((a) => ({
    article: a,
    citation: `2024 Sporting Regulations (Issue 6), Article ${a}`,
    text: RACE_REGS_TEXT[a],
  })),
  tool_calls: [
    { tool: 'list_drivers', args: { team: 'McLaren' } },
    { tool: 'get_tyre_stints', args: {} },
    { tool: 'get_pace_summary', args: { driver: 'NOR', lap_start: 4, lap_end: 30 } },
    { tool: 'get_pace_summary', args: { driver: 'NOR', lap_start: 31, lap_end: 78 } },
    { tool: 'get_pace_summary', args: { driver: 'PIA', lap_start: 31, lap_end: 78 } },
  ],
  steps: RACE_STEPS.map(([, d]) => d),
}

const B636 =
  'B6.3.6 Unless they have used intermediate or wet-weather tyres during the Race, each driver must use at least two (2) different specifications of dry-weather tyres during the Race, at least one (1) of which must be a mandatory dry-weather Race tyre specification (Article B6.1.2).\nUnless the Race is suspended and cannot be re-started, failure to comply with these requirements will result in the disqualification of the relevant driver from the Race results. If the Race is suspended and cannot be re-started, thirty (30) seconds will be added to the elapsed time of any driver who did not, when required to do so, use at least two (2) specifications of dry-weather tyre during the Race.'

const TWO_COMPOUND_STEPS: [NodeName, string, number][] = [
  ['route', "route: mode=rules year=None place=None focus='two-compound rule when a race is suspended and not restarted' queries=['two different specifications of dry-weather tyres', 'race suspended cannot be re-started']", 900],
  ['resolve', 'resolve: race=- regs=2026 issue 8', 500],
  ['retrieve', "retrieve (2 queries): ['B6.3.6']", 900],
  ['analyze', 'analyze: 2 findings', 1800],
  ['synthesize', 'synthesize: rendered answer with 1 citation', 300],
]

const TWO_COMPOUND_PAYLOAD: AnswerPayload = {
  answer: `If a race is red-flagged and cannot be restarted, a driver who has not used two different dry-weather specifications is not disqualified — instead thirty (30) seconds are added to their elapsed time.

- Normally each driver must use at least two different dry-weather tyre specifications (e.g. MEDIUM and HARD), at least one of which must be a mandatory race specification, unless they used INTERMEDIATE or WET tyres [B6.3.6]
- Failing that requirement normally means disqualification, but if the race is suspended and cannot be re-started the penalty becomes a 30-second time addition [B6.3.6]

Caveats:
- The requirement does not apply to a driver who used intermediate or wet-weather tyres at any point in the race.

Regulations:
- 2026 F1 Sporting Regulations (Issue 8), Article B6.3.6`,
  mode: 'rules',
  race: null,
  regs: { season: 2026, issue: 8 },
  citations: [
    { article: 'B6.3.6', citation: '2026 F1 Sporting Regulations (Issue 8), Article B6.3.6', text: B636 },
  ],
  tool_calls: [],
  steps: TWO_COMPOUND_STEPS.map(([, d]) => d),
}

const B5144 =
  'B5.14.4 Provisions Applicable During a Suspension\nFollowing a suspension of the starting procedure as described in Article B5.14.1, a suspension of a TTCS as described in Article B5.14.2 or the suspension of a resumption procedure as described in Article B5.14.3, and prior to the resumption time the following provisions shall apply:\na. F1 Cars may be worked on once they have stopped in the Fast Lane, but any such work is restricted to that listed in i) to x) below and must not impede the resumption of the TTCS.\ni. Starting the engine and any directly associated preparation.\nii. The addition of compressed gases (Article C4.5).\niii. The fitting or removal of permitted cooling and heating devices.\niv. Changes to the air ducts around the front and rear brakes.\nv. Changes to the radiator ducts.\nvi. Changes made for driver comfort.\nvii. Changing wheels and tyres.\nviii. Repair of genuine accident damage, as specified in Appendix B2 Section 7, including the replacement of assemblies containing such damaged parts.\nix. In accordance with Article C3.10.10, adjustment of the position, not controlled by the FIA Standard ECU, of the Front Wing Profiles. No parts may be added, removed or replaced.\nx. If a Heat Hazard has been declared in accordance with B1.5.10, the cooling medium used in the Driver Cooling System, as defined in Article C14.6 may be replenished or replaced.\nb. Only team members, officials and accredited television cameramen will be permitted in the Pit Lane.'

const WORK_STEPS: [NodeName, string, number][] = [
  ['route', "route: mode=rules year=None place=None focus='permitted work on cars during a red flag suspension' queries=['work on cars during suspension fast lane']", 800],
  ['resolve', 'resolve: race=- regs=2026 issue 8', 500],
  ['retrieve', "retrieve (1 queries): ['B5.14.4']", 900],
  ['analyze', 'analyze: 3 findings', 1700],
  ['synthesize', 'synthesize: rendered answer with 1 citation', 300],
]

const WORK_PAYLOAD: AnswerPayload = {
  answer: `During a red-flag suspension teams may work on cars once they have stopped in the Fast Lane, but only the work on a closed list, and it must not delay the resumption.

- Permitted work: starting the engine, adding compressed gases, fitting/removing cooling and heating devices, brake and radiator duct changes, driver-comfort changes, and changing wheels and tyres — so a free switch to e.g. HARD or INTERMEDIATE tyres is allowed [B5.14.4]
- Genuine accident damage may be repaired (including replacing damaged assemblies) and the front wing profile position may be adjusted, but no parts may be added, removed or replaced on the wing [B5.14.4]
- Only team members, officials and accredited TV crews are allowed in the Pit Lane during the suspension [B5.14.4]

Caveats:
- Driver-cooling medium may only be replaced if a Heat Hazard has been declared.

Regulations:
- 2026 F1 Sporting Regulations (Issue 8), Article B5.14.4`,
  mode: 'rules',
  race: null,
  regs: { season: 2026, issue: 8 },
  citations: [
    { article: 'B5.14.4', citation: '2026 F1 Sporting Regulations (Issue 8), Article B5.14.4', text: B5144 },
  ],
  tool_calls: [],
  steps: WORK_STEPS.map(([, d]) => d),
}

function toScript(steps: [NodeName, string, number][], payload: AnswerPayload): ScriptEvent[] {
  return [
    ...steps.map(([node, detail, delay]): ScriptEvent => ({ event: 'step', node, detail, delay })),
    { event: 'answer', payload, delay: 400 },
  ]
}

export function pickScript(message: string): ScriptEvent[] {
  const m = message.toLowerCase()
  if (m.includes('/error')) {
    return [
      { event: 'step', node: 'route', detail: 'route: mode=race year=2031 place=Atlantis', delay: 700 },
      { event: 'error', message: 'Mock error: no OpenF1 session found for Atlantis 2031 (requested via /error).', delay: 600 },
    ]
  }
  if (/red.?flag|suspen/.test(m) && /work|repair|fix|change|allowed|can teams/.test(m) && !/compound/.test(m)) {
    return toScript(WORK_STEPS, WORK_PAYLOAD)
  }
  if (/\b(19|20)\d{2}\b|lap|undercut|overcut|pace|degradation|stint|mclaren|norris|piastri|monaco|analy[sz]e/.test(m)) {
    return toScript(RACE_STEPS, RACE_ANSWER_PAYLOAD)
  }
  return toScript(TWO_COMPOUND_STEPS, TWO_COMPOUND_PAYLOAD)
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new DOMException('Aborted', 'AbortError'))
    const t = setTimeout(resolve, ms)
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(t)
        reject(new DOMException('Aborted', 'AbortError'))
      },
      { once: true },
    )
  })
}

function encodeFrame(event: string, data: unknown): string {
  // Pretty-print answers so multi-line `data:` fields are exercised too.
  const json = event === 'answer' ? JSON.stringify(data, null, 1) : JSON.stringify(data)
  return `event: ${event}\n${json.split('\n').map((l) => `data: ${l}`).join('\n')}\n\n`
}

function mockStream(threadId: string, script: ScriptEvent[], signal?: AbortSignal): ReadableStream<Uint8Array> {
  const enc = new TextEncoder()
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        await sleep(250, signal)
        controller.enqueue(enc.encode(encodeFrame('thread', { thread_id: threadId })))
        for (const s of script) {
          await sleep(s.delay, signal)
          const wire =
            s.event === 'step'
              ? encodeFrame('step', { node: s.node, detail: s.detail })
              : s.event === 'answer'
                ? encodeFrame('answer', s.payload)
                : encodeFrame('error', { message: s.message })
          // Split each frame into two chunks at an arbitrary point, like a real network would.
          const cut = Math.floor(wire.length * 0.37)
          controller.enqueue(enc.encode(wire.slice(0, cut)))
          await sleep(30, signal)
          controller.enqueue(enc.encode(wire.slice(cut)))
        }
        controller.close()
      } catch (err) {
        controller.error(err)
      }
    },
  })
}

function newId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `mock-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

export const mockStreamChat: ChatTransport = async (req, onEvent, signal) => {
  const stream = mockStream(req.thread_id ?? newId(), pickScript(req.message), signal)
  await readSSE(stream, (frame) => {
    const event = frameToEvent(frame)
    if (event) onEvent(event)
  })
}
