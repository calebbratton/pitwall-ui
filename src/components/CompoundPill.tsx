import type { Compound } from '../lib/format'

const SHORT: Record<Compound, string> = { SOFT: 'S', MEDIUM: 'M', HARD: 'H', INTERMEDIATE: 'I', WET: 'W' }

export function CompoundPill({ compound, text }: { compound: Compound; text?: string }) {
  return (
    <span className={`pill pill--${compound.toLowerCase()}`} title={`${compound} compound`}>
      <span className="pill__dot" aria-hidden="true">
        {SHORT[compound]}
      </span>
      {text ?? compound}
    </span>
  )
}
