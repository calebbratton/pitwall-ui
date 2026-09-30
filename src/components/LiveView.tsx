import { useCallback, useState, useSyncExternalStore } from 'react'
import type { ReplayEvent } from '../liveTypes'
import { useFollow } from '../hooks/useFollow'
import { useLiveChat } from '../hooks/useLiveChat'
import { useRadioPlayer } from '../hooks/useRadioPlayer'
import { useReplay } from '../hooks/useReplay'
import { useSessions } from '../hooks/useSessions'
import { shouldAutoQueue } from '../lib/radioQueue'
import { LiveChat } from './LiveChat'
import { PitCallsPanel } from './PitCallsPanel'
import { PredictionPanel } from './PredictionPanel'
import { RaceControlFeed } from './RaceControlFeed'
import { RadioFeed } from './RadioFeed'
import { ReplayControls } from './ReplayControls'
import { TimingTower } from './TimingTower'
import { TrackMap } from './TrackMap'
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
  // strategy channel: a tab next to the feeds on desktop, a bottom sheet on mobile
  const [chatOpen, setChatOpen] = useState(false)

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
  const { state, mapStore } = replay
  // Boolean selector: LiveView re-renders only when the track appears/disappears, not on positions.
  const hasTrack = useSyncExternalStore(mapStore.subscribe, () => mapStore.getSnapshot().track !== null)
  // Hide the map when the session has no traceable track (timing arrived but no outline).
  const showMap = hasTrack || !state.snapshot

  const chatEnabled = state.liveId !== null && (state.phase === 'running' || state.phase === 'ended')
  const chat = useLiveChat(state.liveId, chatEnabled, useMock, replay.addPrediction)
  const closedHint = chatEnabled
    ? null
    : state.phase === 'idle'
      ? 'No live session. Start one (test replay, top right) to open the strategy channel.'
      : state.phase === 'connecting'
        ? 'Connecting to the live session…'
        : state.phase === 'stopped'
          ? 'Session stopped. Strategy answers questions about a running live session only.'
          : state.phase === 'error'
            ? 'Live session lost. Retry to reopen the channel.'
            : 'Waiting for the live session id from the server…'

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
  const latestPrediction = state.predictions.at(-1)
  const testReplay = state.liveSource === 'replay' || (state.liveSource === null && state.params !== null)
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
        testReplay={testReplay}
      />
      <TrackStatusBanner
        status={state.trackStatus}
        lap={snapshot?.lap ?? null}
        totalLaps={totalLaps}
        callsLap={latestCalls?.report.lap ?? null}
        predictionLap={latestPrediction?.prediction.lap ?? null}
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
      <div className={`live__grid${showMap ? ' has-map' : ''}`}>
        {showMap && (
          <TrackMap
            store={mapStore}
            drivers={snapshot?.drivers ?? []}
            trackStatus={state.trackStatus}
            follow={follow}
            onFollow={setFollow}
            yellowSectors={state.yellowSectors}
          />
        )}
        <TimingTower
          snapshot={snapshot}
          trackStatus={state.trackStatus}
          follow={follow}
          onFollow={setFollow}
          latestTranscript={latestTranscript}
          loading={state.phase === 'connecting'}
        />
        <PitCallsPanel sets={state.pitCalls} trackStatus={state.trackStatus} follow={follow} />
        <PredictionPanel
          sets={state.predictions}
          drivers={snapshot?.drivers ?? []}
          totalLaps={totalLaps}
          trackStatus={state.trackStatus}
          follow={follow}
          onFollow={setFollow}
        />
        <div className={`live__side${chatOpen ? ' is-chat' : ''}`}>
          <div className="side__tabs" role="tablist" aria-label="Feeds or strategy channel">
            <button type="button" role="tab" aria-selected={!chatOpen} className="calls__tab" onClick={() => setChatOpen(false)}>
              Race control · Radio
            </button>
            <button type="button" role="tab" aria-selected={chatOpen} className="calls__tab" onClick={() => setChatOpen(true)}>
              Strategy channel
              {chat.state.pending ? (
                <span className="side__dot" aria-label="answer pending" />
              ) : (
                chat.state.messages.length > 0 && <span className="count">{chat.state.messages.length}</span>
              )}
            </button>
          </div>
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
          <LiveChat
            chat={chat}
            closedHint={closedHint}
            lap={snapshot?.lap ?? null}
            status={state.trackStatus}
            drivers={snapshot?.drivers ?? []}
            follow={follow}
            onClose={() => setChatOpen(false)}
          />
        </div>
      </div>
      {!chatOpen && (
        <button type="button" className="lchat-fab" onClick={() => setChatOpen(true)} aria-label="Open strategy channel">
          <span aria-hidden="true">📻</span> Ask strategy
          {chat.state.pending && <span className="side__dot" aria-hidden="true" />}
        </button>
      )}
      <audio ref={bindAudio} onEnded={onEnded} onError={onError} preload="none" hidden />
    </div>
  )
}
