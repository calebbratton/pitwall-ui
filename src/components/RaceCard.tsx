import type { SessionInfo } from '../hooks/useChat'

export function RaceCard({ session }: { session: SessionInfo }) {
  const { race, regs, mode } = session
  return (
    <section className="panel-sec racecard" aria-labelledby="racecard-h">
      <h2 id="racecard-h" className="panel-sec__h">
        Session
        {mode && <span className={`tag tag--${mode}`}>{mode}</span>}
      </h2>
      {race ? (
        <div className="racecard__body">
          <p className="racecard__place">{race.place}</p>
          <dl className="kv">
            <div>
              <dt>Date</dt>
              <dd>{race.race_date}</dd>
            </div>
            <div>
              <dt>Season</dt>
              <dd>{race.year}</dd>
            </div>
            <div>
              <dt>Session key</dt>
              <dd>{race.session_key}</dd>
            </div>
          </dl>
        </div>
      ) : (
        <p className="muted">{mode === 'rules' ? 'Rules question — no race loaded.' : 'No race loaded yet.'}</p>
      )}
      {regs && (
        <p className="regs">
          <span className="regs__label">REGS</span>
          <span className="regs__val">
            {regs.season} Sporting Regulations · Issue {regs.issue}
          </span>
        </p>
      )}
    </section>
  )
}
