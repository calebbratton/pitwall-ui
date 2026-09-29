import { Children, isValidElement, cloneElement, type ReactElement, type ReactNode } from 'react'
import { tokenize } from '../lib/format'
import { CompoundPill } from './CompoundPill'
import { RefChips } from './RefChips'

function renderString(s: string, keyBase: string): ReactNode[] {
  return tokenize(s).map((t, i) => {
    const key = `${keyBase}-${i}`
    switch (t.kind) {
      case 'text':
        return t.text
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

/** Walk React children, replacing plain strings with styled tokens. */
export function enrich(children: ReactNode, keyBase = 'r'): ReactNode {
  return Children.map(children, (child, i) => {
    if (typeof child === 'string') return renderString(child, `${keyBase}${i}`)
    if (isValidElement<{ children?: ReactNode }>(child) && child.props.children !== undefined && typeof child.type === 'string' && child.type !== 'code') {
      return cloneElement(child as ReactElement<{ children?: ReactNode }>, undefined, enrich(child.props.children, `${keyBase}${i}`))
    }
    return child
  })
}
