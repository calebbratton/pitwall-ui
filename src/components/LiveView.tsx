import { useCallback, useState } from 'react'
import type { ReplayEvent } from '../liveTypes'
import { useFollow } from '../hooks/useFollow'
import { useRadioPlayer } from '../hooks/useRadioPlayer'
import { useReplay } from '../hooks/useReplay'
import { useSessions } from '../hooks/useSessions'
import { shouldAutoQueue } from '../lib/radioQueue'
import { PitCallsPanel } from './PitCallsPanel'
import { RaceControlFeed } from './RaceControlFeed'
import { RadioFeed } from './RadioFeed'
import { ReplayControls } from './ReplayControls'
import { TimingTower } from './TimingTower'
import { TrackStatusBanner } from './TrackStatusBanner'

interface Props {
  useMock: boolean
  hidden: boolean
}

export function LiveView({ useMock, hidden }: Props) {
  const [year, setYear] = useState(2026)
  const [picked, setPicked] = useState<string | null>(null)
  const [speed, setSpeed] = useState(30)
  const [fromLap, setFromLap] = useState('')
  const [autoplay, setAutoplayState] = useState(false)

  const sessions = useSessions(year, useMock)
  // Default to the latest race of the season until the user picks one.
  const selected = sessions.sessions.find((s) => s.path === picked) ?? sessions.sessions.at(-1) ?? null

  const player = useRadioPlayer()
  const { enqueue, stop: stopAudio, bindAudio, onEnded, onError } = player

  // Follow is keyed by the session on screen (the running replay, else the selected race).
  const [runningPath, setRunningPath] = useState<string | null>(null)
  const [follow, setFollowState] = useFollow(runningPath ?? selected?.path ?? null)

  const onEvent = useCallback(
    (e: ReplayEvent) => {
      if (e.type === 'radio' && shouldAutoQueue(e, follow, autoplay)) enqueue({ url: e.url, tla: e.tla })
    },
    [follow, autoplay, enqueue],
  )
  const replay = useReplay(useMock, onEvent)
  const { state } = replay

  const setFollow = useCallback(
    (tla: string | null) => {
      if (tla !== follow) stopAudio()
      setFollowState(tla)
      if (!tla) setAutoplayState(false)
    },
    [follow, setFollowState, stopAudio],
  )
  const setAutoplay = useCallback(
    (on: boolean) => {
      setAutoplayState(on)
      if (!on) stopAudio()
    },
    [stopAudio],
  )

  const play = () => {
    if (!selected) return
    const lap = Number.parseInt(fromLap, 10)
    setRunningPath(selected.path)
    replay.start({
      path: selected.path,
      speed,
      fromLap: Number.isFinite(lap) && lap > 1 ? lap : null,
      meeting: selected.meeting,
    })
  }

  const snapshot = state.snapshot
  const totalLaps = snapshot?.total_laps ?? state.session?.total_laps ?? null
  const title = state.session
    ? `${state.session.meeting} — ${state.session.session}`
    : state.params
      ? state.params.meeting
      : selected
        ? `${selected.meeting} — Race`
        : null
  const latestCalls = state.pitCalls.at(-1)
  const latestTranscript = state.radio.find((r) => r.id === state.latestTranscriptId) ?? null

  return (
    <div className="live" hidden={hidden}>
      <ReplayControls
        year={year}
        onYear={(y) => {
          setYear(y)
          setPicked(null)
        }}
        sessions={sessions}
        path={selected?.path ?? null}
        onPath={setPicked}
        speed={speed}
        onSpeed={setSpeed}
        fromLap={fromLap}
        onFromLap={setFromLap}
        maxLap={totalLaps}
        phase={state.phase}
        onPlay={play}
        onStop={replay.stop}
        title={title}
      />
      <TrackStatusBanner
        status={state.trackStatus}
        lap={snapshot?.lap ?? null}
        totalLaps={totalLaps}
        callsLap={latestCalls?.report.lap ?? null}
      />
      {state.phase === 'error' && (
        <div className="banner live__error" role="alert">
          <span className="flag" aria-hidden="true" />
          <p>
            <strong>Replay error.</strong> {state.error}
          </p>
          <div className="banner__actions">
            <button type="button" className="btn" onClick={play}>
              Retry
            </button>
          </div>
        </div>
      )}
      <div className="live__grid">
        <TimingTower
          snapshot={snapshot}
          trackStatus={state.trackStatus}
          follow={follow}
          onFollow={setFollow}
          latestTranscript={latestTranscript}
          loading={state.phase === 'connecting'}
        />
        <PitCallsPanel sets={state.pitCalls} trackStatus={state.trackStatus} follow={follow} />
        <div className="live__feeds">
          <RaceControlFeed items={state.raceControl} />
          <RadioFeed
            items={state.radio}
            drivers={snapshot?.drivers ?? []}
            follow={follow}
            onFollow={setFollow}
            autoplay={autoplay}
            onAutoplay={setAutoplay}
            player={player}
          />
        </div>
      </div>
      <audio ref={bindAudio} onEnded={onEnded} onError={onError} preload="none" hidden />
    </div>
  )
}
