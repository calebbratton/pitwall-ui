import { useState } from 'react'
import type { PitCallSet, Snapshot } from '../liveTypes'
import { addToTally, type Call, EMPTY_TALLY, type Round, startRound, type Tally, teamDecision } from '../lib/yourCall'

const KEY = 'pitwall.yourcall.tally'

function loadTally(): Tally {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? { ...EMPTY_TALLY, ...JSON.parse(raw) } : EMPTY_TALLY
  } catch {
    return EMPTY_TALLY
  }
}

/** Runs "your call" rounds for the followed driver: a new round at each SC/VSC pit-call set,
 * the team's decision read from timing, and a running tally kept in this browser. */
export function useYourCall(pitCalls: PitCallSet[], snapshot: Snapshot | null, follow: string | null) {
  const [round, setRound] = useState<Round | null>(null)
  const [seen, setSeen] = useState<number | null>(null)
  const [tally, setTally] = useState<Tally>(loadTally)

  const latest = pitCalls.at(-1)
  if (latest && latest.id !== seen) {
    setSeen(latest.id)
    setRound(follow ? startRound(latest, follow, snapshot) : null)
  }
  if (round && !round.team) {
    const team = teamDecision(round, snapshot)
    if (team) {
      const done = { ...round, team }
      setRound(done)
      if (done.choice) {
        const next = addToTally(tally, done)
        setTally(next)
        try {
          localStorage.setItem(KEY, JSON.stringify(next))
        } catch {
          // private mode: the tally just isn't remembered
        }
      }
    }
  }

  const choose = (call: Call) => {
    if (round && !round.choice && !round.team) setRound({ ...round, choice: call })
  }
  return { round, tally, choose }
}
