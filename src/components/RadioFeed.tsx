import type { RadioItem, TimingRow } from '../liveTypes'
import type { RadioPlayer } from '../hooks/useRadioPlayer'
import { formatUtc } from '../lib/replay'

interface Props {
  items: RadioItem[]
  drivers: TimingRow[]
  follow: string | null
  onFollow: (tla: string | null) => void
  autoplay: boolean
  onAutoplay: (on: boolean) => void
  player: RadioPlayer
}

function Transcript({ text }: { text: string | null }) {
  if (text === null) return <p className="radio__pending">transcribing…</p>
  if (!text.trim()) return <p className="radio__nospeech">(no speech)</p>
  return (
    <p className="radio__text">
      <q>{text}</q>
    </p>
  )
}

function NowPlaying({ items, player }: { items: RadioItem[]; player: RadioPlayer }) {
  const { current, queue, blocked } = player.state
  if (!current) return null
  const clip = items.find((r) => r.url === current.url)
  return (
    <div className="nowplaying" aria-live="polite">
      <div className="nowplaying__head">
        <span className="nowplaying__eq" aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
        <span className="nowplaying__label">Now playing</span>
        <b>📻 {current.tla}</b>
        {queue.length > 0 && <span className="count">+{queue.length} queued</span>}
        <span className="nowplaying__btns">
          <button type="button" className="btn btn--xs" onClick={player.skip}>
            Skip
          </button>
          <button type="button" className="btn btn--xs" onClick={player.stop}>
            Stop
          </button>
        </span>
      </div>
      {clip && <Transcript text={clip.text} />}
      {blocked && (
        <button type="button" className="btn btn--primary btn--xs nowplaying__unblock" onClick={player.unblock}>
          🔊 Click to enable audio
        </button>
      )}
    </div>
  )
}

export function RadioFeed({ items, drivers, follow, onFollow, autoplay, onAutoplay, player }: Props) {
  const options = [...drivers].sort((a, b) => a.tla.localeCompare(b.tla))
  if (follow && !options.some((d) => d.tla === follow)) {
    options.unshift({ tla: follow, team: '' } as TimingRow)
  }
  const playing = player.state.current?.url ?? null
  return (
    <section className="feed feed--radio" aria-label="Team radio">
      <header className="feed__head">
        <h2 className="live-h">
          Team radio <span className="count">{items.length}</span>
        </h2>
        <span className="radio__auto">auto-transcribed</span>
      </header>
      <div className="follow">
        <label className="field field--follow">
          <span className="field__label">Follow</span>
          <select value={follow ?? ''} onChange={(e) => onFollow(e.target.value || null)}>
            <option value="">No driver</option>
            {options.map((d) => (
              <option key={d.tla} value={d.tla}>
                {d.tla}
                {d.team ? ` — ${d.team}` : ''}
              </option>
            ))}
          </select>
        </label>
        <label
          className="switch switch--play"
          title={follow ? `Play every new ${follow} radio clip in order` : 'Pick a driver to follow first'}
        >
          <input
            type="checkbox"
            checked={autoplay}
            disabled={!follow}
            onChange={(e) => onAutoplay(e.target.checked)}
          />
          <span className="switch__track" aria-hidden="true" />
          <span className="feed__switch-label">Auto-play</span>
        </label>
      </div>
      <NowPlaying items={items} player={player} />
      <ol className="feed__list">
        {items.length === 0 && <li className="feed__empty">No team radio yet.</li>}
        {items.map((r) => {
          const isPlaying = r.url === playing
          const cls = ['radio', r.tla === follow && 'is-followed', isPlaying && 'is-playing'].filter(Boolean).join(' ')
          return (
            <li key={r.id} className={cls}>
              <div className="radio__head">
                <span className="radio__who">
                  <span aria-hidden="true">📻</span> {r.tla}
                </span>
                <span className="radio__when">
                  {r.lap !== null && `L${r.lap} · `}
                  {formatUtc(r.utc)}
                </span>
                {r.tla === follow && <span className="radio__tag">Following</span>}
                <button
                  type="button"
                  className="radio__play"
                  aria-label={isPlaying ? `Stop ${r.tla} radio` : `Play ${r.tla} radio`}
                  onClick={() => (isPlaying ? player.skip() : player.playNow({ url: r.url, tla: r.tla }))}
                >
                  {isPlaying ? '■' : '▶'}
                </button>
              </div>
              <Transcript text={r.text} />
            </li>
          )
        })}
      </ol>
      <p className="feed__note">Only the clips F1 publishes are available — not every message.</p>
    </section>
  )
}
