import { Children, isValidElement, cloneElement, type CSSProperties, type ReactElement, type ReactNode } from 'react'
import { tokenize } from '../lib/format'
import { CompoundPill } from './CompoundPill'
import { RefChips } from './RefChips'

/** Driver codes to highlight: TLA -> team colour hex without "#" ("" when unknown). */
export interface TlaHighlight {
  colours: Record<string, string>
  follow?: string | null
}

function renderTlas(s: string, keyBase: string, tlas: TlaHighlight): ReactNode[] {
  const out: ReactNode[] = []
  let last = 0
  for (const m of s.matchAll(/\b[A-Z]{3}\b/g)) {
    const tla = m[0]
    if (!(tla in tlas.colours)) continue
    if (m.index > last) out.push(s.slice(last, m.index))
    const colour = tlas.colours[tla]
    out.push(
      <span
        key={`${keyBase}-${m.index}`}
        className={`tla${tla === tlas.follow ? ' is-followed' : ''}`}
        style={colour ? ({ '--team': `#${colour}` } as CSSProperties) : undefined}
      >
        {tla}
      </span>,
    )
    last = m.index + tla.length
  }
  if (last < s.length) out.push(s.slice(last))
  return out
}

function renderString(s: string, keyBase: string, tlas?: TlaHighlight): ReactNode[] {
  return tokenize(s).flatMap((t, i): ReactNode | ReactNode[] => {
    const key = `${keyBase}-${i}`
    switch (t.kind) {
      case 'text':
        return tlas ? renderTlas(t.text, key, tlas) : t.text
      case 'compound':
        return <CompoundPill key={key} compound={t.compound} text={t.text.toUpperCase()} />
      case 'refs':
        return <RefChips key={key} articles={t.articles} />
      case 'time':
        return (
          <span key={key} className="laptime">
            {t.text}
          </span>
        )
    }
  })
}

/** Walk React children, replacing plain strings with styled tokens (and driver codes when `tlas` is given). */
export function enrich(children: ReactNode, keyBase = 'r', tlas?: TlaHighlight): ReactNode {
  return Children.map(children, (child, i) => {
    if (typeof child === 'string') return renderString(child, `${keyBase}${i}`, tlas)
    if (isValidElement<{ children?: ReactNode }>(child) && child.props.children !== undefined && typeof child.type === 'string' && child.type !== 'code') {
      return cloneElement(child as ReactElement<{ children?: ReactNode }>, undefined, enrich(child.props.children, `${keyBase}${i}`, tlas))
    }
    return child
  })
}
