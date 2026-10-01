import { type ReactNode, useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import type { LiveCurrent, ReplayEvent } from '../liveTypes'
import { useColumns } from '../hooks/useColumns'
import { useFollow } from '../hooks/useFollow'
import { useLiveChat } from '../hooks/useLiveChat'
import { useLiveCurrent } from '../hooks/useLiveCurrent'
import { useRadioPlayer } from '../hooks/useRadioPlayer'
import { useReplay } from '../hooks/useReplay'
import { useSessions } from '../hooks/useSessions'
import {
  DEFAULT_LAYOUT,
  fold,
  type Layout,
  loadLayout,
  move,
  saveLayout,
  setHidden,
  toggleMax,
  toggleMin,
  WIDGET_TITLE,
  WIDGETS,
  type WidgetId,
} from '../lib/layout'
import { liveTarget } from '../lib/liveApi'
import { shouldAutoQueue } from '../lib/radioQueue'
import { feedFinished, isTimedSession } from '../lib/replay'
import { AlertFeed } from './AlertFeed'
import { LiveChat } from './LiveChat'
import { PitCallsPanel } from './PitCallsPanel'
import { PredictionPanel } from './PredictionPanel'
import { RaceControlFeed } from './RaceControlFeed'
import { RadioFeed } from './RadioFeed'
import { ReplayControls } from './ReplayControls'
import { RunTimeline } from './RunTimeline'
import { TimingTower } from './TimingTower'
import { TrackLine } from './TrackLine'
import { TrackMap } from './TrackMap'
import { TrackStatusBanner } from './TrackStatusBanner'
import { WeatherBar } from './WeatherBar'
import { Widget } from './Widget'

interface Props {
  useMock: boolean
  hidden: boolean
}

/** What the LIVE tab shows: the real live session (default) or a test replay. */
type Mode = 'live' | 'replay'

const liveLabel = (c: LiveCurrent) => [c.meeting, c.session].filter(Boolean).join(' · ') || 'Live session'

const REPLAY_PHASE = {
  idle: 'READY',
  connecting: 'LOADING',
  running: 'PLAYING',
  ended: 'FINISHED',
  stopped: 'STOPPED',
  error: 'ERROR',
} as const

export function LiveView({ useMock, hidden }: Props) {
  const [year, setYear] = useState(2026)
  const [picked, setPicked] = useState<string | null>(null)
  const [speed, setSpeed] = useState(30)
  const [fromLap, setFromLap] = useState('')
  const [autoplay, setAutoplayState] = useState(false)
  // strategy channel: a tab next to the feeds on desktop, a bottom sheet on mobile
  const [chatOpen, setChatOpen] = useState(false)
  const [mode, setMode] = useState<Mode>('live')
  const live = useLiveCurrent(useMock, !hidden)
  const [layout, setLayout] = useState<Layout>(loadLayout)
  const update = useCallback((next: Layout) => {
    setLayout(next)
    saveLayout(next)
  }, [])
  const nCols = useColumns()

  const sessions = useSessions(year, useMock)
  // Default to the latest race of the season until the user picks one.
  const selected = sessions.sessions.find((s) => s.path === picked) ?? sessions.sessions.at(-1) ?? null

  const player = useRadioPlayer()
  const { enqueue, stop: stopAudio, bindAudio, onEnded, onError } = player

  // Follow is keyed by the session on screen (live session, running replay, else the selected race).
  const [runningPath, setRunningPath] = useState<string | null>(null)
  // read by the stream callback: the followed driver's radio is auto-queued
  const autoRef = useRef<{ follow: string | null; autoplay: boolean }>({ follow: null, autoplay: false })
  const onEvent = useCallback(
    (e: ReplayEvent) => {
      const { follow: f, autoplay: a } = autoRef.current
      if (e.type === 'radio' && shouldAutoQueue(e, f, a)) enqueue({ url: e.url, tla: e.tla })
    },
    [enqueue],
  )
  const replay = useReplay(useMock, onEvent)
  const { state, mapStore } = replay
  const followKey =
    state.params?.kind === 'live' ? `live:${state.params.liveId}` : mode === 'live' ? null : (runningPath ?? selected?.path ?? null)
  const [follow, setFollowState] = useFollow(followKey)
  useEffect(() => {
    autoRef.current = { follow, autoplay }
  }, [follow, autoplay])
  // Boolean selector: LiveView re-renders only when the track appears/disappears, not on positions.
  const hasTrack = useSyncExternalStore(mapStore.subscribe, () => mapStore.getSnapshot().track !== null)
  // Hide the map when the session has no traceable track (timing arrived but no outline).
  const showMap = hasTrack || !state.snapshot

  // Live mode: subscribe to the server's current live session (and switch when a new one appears).
  const params = state.params
  const followingLive = params?.kind === 'live' ? params.liveId : null
  const currentLive = live.current
  const target = liveTarget(mode, currentLive, followingLive)
  const { start: startStream } = replay
  useEffect(() => {
    if (target && currentLive) startStream({ kind: 'live', liveId: target, meeting: liveLabel(currentLive) })
  }, [target, currentLive, startStream])

  const onLive = params?.kind === 'live'
  // /current also knows the lap: a stale catch-up snapshot can lack it
  const currentFinished =
    !!currentLive && currentLive.live_id === followingLive && currentLive.lap !== null &&
    currentLive.total_laps !== null && currentLive.lap >= currentLive.total_laps
  const idle = mode === 'live' && onLive && (feedFinished(state) || currentFinished || replay.quiet)

  const chatEnabled = state.liveId !== null && (state.phase === 'running' || state.phase === 'ended')
  const chat = useLiveChat(state.liveId, chatEnabled, useMock, replay.addPrediction)
  const closedHint = chatEnabled
    ? null
    : state.phase === 'idle'
      ? mode === 'live' && live.status !== 'live'
        ? 'No live session. Start following the live feed, or play a test replay (top right).'
        : 'Connecting to the live session…'
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
    setMode('replay')
    setRunningPath(selected.path)
    replay.start({
      kind: 'replay',
      path: selected.path,
      speed,
      fromLap: Number.isFinite(lap) && lap > 1 ? lap : null,
      meeting: selected.meeting,
    })
  }

  const backToLive = () => {
    setMode('live')
    replay.reset() // the effect above subscribes to the current live session, if there is one
  }
  const retry = () => {
    if (params?.kind === 'live') replay.start(params)
    else play()
  }

  const snapshot = state.snapshot
  // /api/live/current as a fallback when the stream's catch-up lacks lap / status
  const cur = currentLive && currentLive.live_id === followingLive ? currentLive : null
  const lapNow = snapshot?.lap ?? cur?.lap ?? null
  const statusNow =
    state.trackStatus && state.trackStatus !== 'UNKNOWN' ? state.trackStatus : (cur?.status ?? state.trackStatus)
  const totalLaps = snapshot?.total_laps ?? state.session?.total_laps ?? cur?.total_laps ?? null
  const sessionLabel = state.session ? [state.session.meeting, state.session.session].filter(Boolean).join(' · ') : null
  const title =
    mode === 'live'
      ? onLive
        ? `LIVE · ${sessionLabel ?? params.meeting}`
        : live.status === 'loading'
          ? 'Looking for a live session…'
          : live.status === 'error'
            ? 'Backend unreachable'
            : 'No live session'
      : state.session
        ? `${state.session.meeting} — ${state.session.session}`
        : params
          ? params.meeting
          : selected
            ? `${selected.meeting} — Race`
            : null
  const replayActive = mode === 'replay' && (state.phase === 'connecting' || state.phase === 'running')
  const now =
    mode === 'live' ? (
      <>
        {onLive && state.phase === 'running' && state.connected !== false && (
          <span className="live-dot" title="Connected to the live feed" aria-label="Connected" />
        )}
        {onLive && state.phase === 'running' && state.connected === false && (
          <span className="tag tag--phase-connecting">RECONNECTING</span>
        )}
        {onLive && state.phase === 'connecting' && <span className="tag tag--phase-connecting">CONNECTING</span>}
        {onLive && state.phase === 'ended' && <span className="tag tag--phase-ended">SESSION ENDED</span>}
        {onLive && state.phase === 'error' && <span className="tag tag--phase-error">DISCONNECTED</span>}
        <span className="rc-bar__title" title={live.message ?? undefined}>
          {title}
        </span>
        {!onLive && live.status === 'error' && <span className="rc-bar__why">{live.message}</span>}
      </>
    ) : (
      <>
        <span className={`tag tag--phase-${state.phase}`}>{REPLAY_PHASE[state.phase]}</span>
        <span className="replay-badge" title="Archived race replayed as if live, for testing">
          TEST REPLAY
        </span>
        <span className="rc-bar__title">{title}</span>
      </>
    )
  const actions =
    mode === 'replay' ? (
      <button type="button" className="btn btn--xs rc-bar__live" onClick={backToLive}>
        <span className="live-dot" aria-hidden="true" /> Back to live
      </button>
    ) : live.status === 'none' ? (
      <button
        type="button"
        className="btn btn--xs"
        disabled={live.starting}
        title="POST /api/live/start — make the backend follow the F1 live timing feed (local dev tool)"
        onClick={live.startFeed}
      >
        {live.starting ? 'Starting…' : 'Start following live feed'}
      </button>
    ) : null
  const latestCalls = state.pitCalls.at(-1)
  const latestPrediction = state.predictions.at(-1)
  const latestTranscript = state.radio.find((r) => r.id === state.latestTranscriptId) ?? null

  const panels: Record<WidgetId, ReactNode> = {
    map: (
        <TrackMap
          store={mapStore}
          drivers={snapshot?.drivers ?? []}
          trackStatus={state.trackStatus}
          follow={follow}
          onFollow={setFollow}
          yellowSectors={state.yellowSectors}
        />
    ),
    tower: (
        <TimingTower
          snapshot={snapshot}
          trackStatus={state.trackStatus}
          follow={follow}
          onFollow={setFollow}
          latestTranscript={latestTranscript}
          loading={state.phase === 'connecting'}
          emptyText={onLive ? 'Connected — waiting for timing data from the live feed.' : undefined}
        />
    ),
    timeline: (
      <RunTimeline laps={state.laps} drivers={snapshot?.drivers ?? []} follow={follow} onFollow={setFollow} />
    ),
    alerts: <AlertFeed alerts={state.alerts} follow={follow} director={state.director} />,
    calls: <PitCallsPanel sets={state.pitCalls} trackStatus={state.trackStatus} follow={follow} />,
    predict: (
        <PredictionPanel
          sets={state.predictions}
          drivers={snapshot?.drivers ?? []}
          totalLaps={totalLaps}
          trackStatus={state.trackStatus}
          follow={follow}
          onFollow={setFollow}
        />
    ),
    side: (
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
            lap={lapNow}
            status={statusNow}
            drivers={snapshot?.drivers ?? []}
            follow={follow}
            onClose={() => setChatOpen(false)}
          />
        </div>
    ),
  }
  const shownColumns = fold(layout.columns, nCols)
    .map((col) => col.filter((id) => !layout.hidden.includes(id) && (id !== 'map' || showMap)))
    .filter((col) => col.length > 0)
  const panelsMenu = (
    <details className="dash-menu">
      <summary className="btn btn--xs">Panels</summary>
      <div className="dash-menu__list">
        <label>
          <input
            type="checkbox"
            checked={!layout.lineHidden}
            onChange={(e) => update({ ...layout, lineHidden: !e.target.checked })}
          />{' '}
          Track line
        </label>
        {WIDGETS.filter((id) => id !== 'map' || showMap).map((id) => (
          <label key={id}>
            <input
              type="checkbox"
              checked={!layout.hidden.includes(id)}
              onChange={(e) => update(setHidden(layout, id, !e.target.checked))}
            />{' '}
            {WIDGET_TITLE[id]}
          </label>
        ))}
        <button type="button" className="btn btn--xs" onClick={() => update(DEFAULT_LAYOUT)}>
          Reset layout
        </button>
      </div>
    </details>
  )

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
        replayActive={replayActive}
        onPlay={play}
        onStop={replay.stop}
        now={now}
        actions={
          <>
            {actions}
            {panelsMenu}
          </>
        }
      />
      <TrackStatusBanner
        status={statusNow}
        lap={lapNow}
        totalLaps={totalLaps}
        callsLap={latestCalls?.report.lap ?? null}
        predictionLap={latestPrediction?.prediction.lap ?? null}
      />
      <WeatherBar weather={state.weather} forecast={state.forecast} />
      {!layout.lineHidden && !isTimedSession(snapshot) && (
        <TrackLine snapshot={snapshot} trackStatus={state.trackStatus} follow={follow} onFollow={setFollow} />
      )}
      {idle && (
        <p className="idle-note" role="status">
          Feed idle — showing the last session's final state.
        </p>
      )}
      {state.phase === 'error' && (
        <div className="banner live__error" role="alert">
          <span className="flag" aria-hidden="true" />
          <p>
            <strong>{onLive ? 'Live stream error.' : 'Replay error.'}</strong> {state.error}
          </p>
          <div className="banner__actions">
            <button type="button" className="btn" onClick={retry}>
              Retry
            </button>
          </div>
        </div>
      )}
      <div className={`dash dash--${nCols}${layout.maximized ? ' has-max' : ''}`}>
        {shownColumns.map((col, ci) => (
          <div key={ci} className={`dash__col dash__col--${ci}`}>
            {col.map((id, i) => (
              <Widget
                key={id}
                title={WIDGET_TITLE[id]}
                minimized={layout.minimized.includes(id)}
                maximized={layout.maximized === id}
                moves={[
                  ...(i > 0 ? (['up'] as const) : []),
                  ...(i < col.length - 1 ? (['down'] as const) : []),
                  ...(ci > 0 ? (['left'] as const) : []),
                  ...(ci < shownColumns.length - 1 ? (['right'] as const) : []),
                ]}
                onMin={() => update(toggleMin(layout, id))}
                onMax={() => update(toggleMax(layout, id))}
                onHide={() => update(setHidden(layout, id, true))}
                onMove={(dir) => update(move(layout, id, dir, nCols))}
              >
                {panels[id]}
              </Widget>
            ))}
          </div>
        ))}
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
