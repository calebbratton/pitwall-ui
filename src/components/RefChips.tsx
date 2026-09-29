import { useCite } from './cite-context'

export function RefChips({ articles }: { articles: string[] }) {
  const cite = useCite()
  return (
    <span className="refs">
      {articles.map((a) => (
        <button key={a} type="button" className="ref" onClick={() => cite(a)} title={`Show Article ${a}`}>
          {a}
        </button>
      ))}
    </span>
  )
}
