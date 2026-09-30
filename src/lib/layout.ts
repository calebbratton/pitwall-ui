/**
 * Live dashboard layout: which panels sit in which column, in what order, and which are
 * minimised (header only), maximised (fills the dashboard) or hidden. Saved per browser.
 * On narrower screens the saved columns fold (3 -> 2 -> 1) so one layout works everywhere.
 */

export const WIDGETS = ['tower', 'map', 'calls', 'predict', 'side'] as const
export type WidgetId = (typeof WIDGETS)[number]

export const WIDGET_TITLE: Record<WidgetId, string> = {
  tower: 'Timing',
  map: 'Track map',
  calls: 'Pit calls',
  predict: 'Who wins',
  side: 'Race control · Radio · Strategy',
}

export interface Layout {
  columns: WidgetId[][]
  minimized: WidgetId[]
  hidden: WidgetId[]
  maximized: WidgetId | null
  /** the track line strip above the columns */
  lineHidden: boolean
}

export const DEFAULT_LAYOUT: Layout = {
  columns: [['tower'], ['map', 'calls', 'predict'], ['side']],
  minimized: [],
  hidden: [],
  maximized: null,
  lineHidden: false,
}

const KEY = 'pitwall.layout.v1'
const isWidget = (v: unknown): v is WidgetId => typeof v === 'string' && (WIDGETS as readonly string[]).includes(v)

/** Repair anything stored: unknown ids dropped, duplicates removed, missing panels appended. */
export function normalize(raw: unknown): Layout {
  const r = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>
  const seen = new Set<WidgetId>()
  let columns = (Array.isArray(r.columns) ? r.columns : DEFAULT_LAYOUT.columns).slice(0, 3).map((col) =>
    (Array.isArray(col) ? col : []).filter((id): id is WidgetId => {
      if (!isWidget(id) || seen.has(id)) return false
      seen.add(id)
      return true
    }),
  )
  while (columns.length < 3) columns.push([])
  const missing = WIDGETS.filter((id) => !seen.has(id))
  if (missing.length) columns = columns.map((c, i) => (i === columns.length - 1 ? [...c, ...missing] : c))
  const list = (v: unknown) => (Array.isArray(v) ? [...new Set(v.filter(isWidget))] : [])
  return {
    columns,
    minimized: list(r.minimized),
    hidden: list(r.hidden),
    maximized: isWidget(r.maximized) ? r.maximized : null,
    lineHidden: r.lineHidden === true,
  }
}

export function loadLayout(): Layout {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? normalize(JSON.parse(raw)) : DEFAULT_LAYOUT
  } catch {
    return DEFAULT_LAYOUT
  }
}

export function saveLayout(layout: Layout): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(layout))
  } catch {
    // private mode / storage blocked: the layout just isn't remembered
  }
}

/** The saved columns folded to `n` on screen (later columns append to the last one). */
export function fold(columns: WidgetId[][], n: number): WidgetId[][] {
  if (n >= columns.length) return columns
  const out = columns.slice(0, n).map((c) => [...c])
  for (const c of columns.slice(n)) out[n - 1].push(...c)
  return out
}

const toggle = (list: WidgetId[], id: WidgetId) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id])

export const toggleMin = (l: Layout, id: WidgetId): Layout => ({ ...l, minimized: toggle(l.minimized, id) })

export const toggleMax = (l: Layout, id: WidgetId): Layout => ({
  ...l,
  maximized: l.maximized === id ? null : id,
  minimized: l.minimized.filter((x) => x !== id),
})

export const setHidden = (l: Layout, id: WidgetId, hidden: boolean): Layout => ({
  ...l,
  hidden: hidden ? [...new Set([...l.hidden, id])] : l.hidden.filter((x) => x !== id),
  maximized: hidden && l.maximized === id ? null : l.maximized,
})

export type Direction = 'up' | 'down' | 'left' | 'right'

/**
 * Move a panel within its column (up/down) or to the neighbouring column (left/right), in the
 * columns as shown (`shown` = how many are on screen, so "right" means the column you see).
 */
export function move(l: Layout, id: WidgetId, dir: Direction, shown = 3): Layout {
  const cols = fold(l.columns, shown).map((c) => [...c])
  const ci = cols.findIndex((c) => c.includes(id))
  if (ci < 0) return l
  const i = cols[ci].indexOf(id)
  if (dir === 'up' || dir === 'down') {
    const j = dir === 'up' ? i - 1 : i + 1
    if (j < 0 || j >= cols[ci].length) return l
    ;[cols[ci][i], cols[ci][j]] = [cols[ci][j], cols[ci][i]]
  } else {
    const cj = dir === 'left' ? ci - 1 : ci + 1
    if (cj < 0 || cj >= cols.length) return l
    cols[ci].splice(i, 1)
    cols[cj].splice(Math.min(i, cols[cj].length), 0, id)
  }
  // Folded views write back into the full 3 columns (the extra ones were merged into the last).
  while (cols.length < l.columns.length) cols.push([])
  return { ...l, columns: cols }
}
