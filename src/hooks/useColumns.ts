import { useSyncExternalStore } from 'react'

const WIDE = '(min-width: 1101px)'
const MEDIUM = '(min-width: 901px)'

function subscribe(onChange: () => void) {
  const queries = [WIDE, MEDIUM].map((q) => window.matchMedia(q))
  queries.forEach((q) => q.addEventListener('change', onChange))
  return () => queries.forEach((q) => q.removeEventListener('change', onChange))
}

const columns = () => (window.matchMedia(WIDE).matches ? 3 : window.matchMedia(MEDIUM).matches ? 2 : 1)

/** Dashboard columns for the screen: 3 on desktop, 2 on tablets, 1 (stacked) on phones. */
export function useColumns(): number {
  return useSyncExternalStore(subscribe, columns, () => 3)
}
