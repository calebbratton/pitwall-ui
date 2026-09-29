/** Tokenise answer text so compounds, article refs and lap times can be styled. */

export type Compound = 'SOFT' | 'MEDIUM' | 'HARD' | 'INTERMEDIATE' | 'WET'

export type Token =
  | { kind: 'text'; text: string }
  | { kind: 'compound'; text: string; compound: Compound }
  | { kind: 'refs'; text: string; articles: string[] }
  | { kind: 'time'; text: string }

const PLURALS: Record<string, Compound> = {
  softs: 'SOFT',
  mediums: 'MEDIUM',
  hards: 'HARD',
  inters: 'INTERMEDIATE',
  intermediates: 'INTERMEDIATE',
  wets: 'WET',
}

// Order matters: refs, then times, then compounds.
//  1. [30.5, 57.4] / [B6.3.6]
//  2. 78.403 s / 1:18.403
//  3. UPPERCASE compound words (SOFT, HARD, ...), case-sensitive
//  4. lowercase compound word directly followed by "tyre(s)"/"compound"/"set"
//  5. plural shorthand (hards, mediums, inters)
const PATTERN =
  /\[((?:[A-Z]?\d+(?:\.\d+)+[a-z]?(?:\s*,\s*)?)+)\]|(\b\d{1,2}:\d{2}\.\d{3}\b|\b\d{2,3}\.\d{3}\s?s\b)|\b(SOFT|MEDIUM|HARD|INTERMEDIATE|WET)S?\b|\b([Ss]oft|[Mm]edium|[Hh]ard|[Ii]ntermediate|[Ww]et)(?=[ -](?:tyres?|compound|sets?)\b)|\b([Ss]ofts|[Mm]ediums|[Hh]ards|[Ii]nters|[Ii]ntermediates|[Ww]ets)\b/g

export function tokenize(input: string): Token[] {
  const out: Token[] = []
  let last = 0
  for (const m of input.matchAll(PATTERN)) {
    const idx = m.index
    const [full, refs, time, upper, lower, plural] = m
    let token: Token | null = null
    if (refs !== undefined) {
      token = { kind: 'refs', text: full, articles: refs.split(',').map((s) => s.trim()).filter(Boolean) }
    } else if (time !== undefined) {
      token = { kind: 'time', text: full }
    } else if (upper !== undefined) {
      token = { kind: 'compound', text: full, compound: upper as Compound }
    } else if (lower !== undefined) {
      token = { kind: 'compound', text: full, compound: lower.toUpperCase() as Compound }
    } else if (plural !== undefined) {
      token = { kind: 'compound', text: full, compound: PLURALS[plural.toLowerCase()] }
    }
    if (!token) continue
    if (idx > last) out.push({ kind: 'text', text: input.slice(last, idx) })
    out.push(token)
    last = idx + full.length
  }
  if (last < input.length) out.push({ kind: 'text', text: input.slice(last) })
  return out
}

export interface AnswerSections {
  verdict: string
  findings: string
  caveats: string
  regulations: string
}

const HEADING = /^\s*(?:\*\*)?(Caveats|Regulations)(?:\*\*)?:?(?:\*\*)?\s*$/i

/**
 * Split the backend's answer layout: verdict paragraph, "- " findings,
 * optional "Caveats:" and "Regulations:" sections. Returns null when the
 * text does not follow that layout (e.g. an error message or free prose).
 */
export function splitAnswer(md: string): AnswerSections | null {
  const lines = md.replace(/\r\n?/g, '\n').split('\n')
  const sections: Record<'body' | 'caveats' | 'regulations', string[]> = { body: [], caveats: [], regulations: [] }
  let current: keyof typeof sections = 'body'
  for (const line of lines) {
    const h = HEADING.exec(line)
    if (h) {
      current = h[1].toLowerCase() as 'caveats' | 'regulations'
      continue
    }
    sections[current].push(line)
  }
  const body = sections.body.join('\n').trim()
  const firstBullet = body.search(/^\s*[-*] /m)
  if (firstBullet <= 0 && !sections.caveats.length && !sections.regulations.length) return null
  const verdict = (firstBullet === -1 ? body : body.slice(0, firstBullet)).trim()
  const findings = firstBullet === -1 ? '' : body.slice(firstBullet).trim()
  return {
    verdict,
    findings,
    caveats: sections.caveats.join('\n').trim(),
    regulations: sections.regulations.join('\n').trim(),
  }
}
