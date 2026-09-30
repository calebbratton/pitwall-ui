# Pit Wall AI — UI

A pit-wall / timing-screen style chat UI for **Pit Wall AI**, a Formula 1 post-race strategy review
agent. The agent answers FIA Sporting Regulations questions with article citations and analyses real
races from OpenF1 telemetry. The backend (Python / LangGraph) lives in a separate repo (`../pitwall`).

Vite + React + TypeScript, plain CSS variables, `react-markdown`. No UI kit.

## Run

```bash
npm install
npm run dev          # http://localhost:5173, talks to VITE_API_URL (default http://localhost:8000)
npm run dev:mock     # same, but with the scripted mock client (VITE_MOCK=1), no backend needed
```

Configure with env vars (or copy `.env.example` to `.env.local`):

| Variable       | Default                 | Meaning                                       |
|----------------|-------------------------|-----------------------------------------------|
| `VITE_API_URL` | `http://localhost:8000` | Backend base URL                              |
| `VITE_MOCK`    | unset                   | `1` forces mock mode (toggle hidden)          |

If `GET /api/health` fails, the UI shows an **API offline** banner with a *Use mock mode* button;
the **Mock** switch in the top bar flips between live and mock at any time.

Mock scripts are picked by keyword: race-ish questions (year, lap, undercut, pace, McLaren…) replay a
Monaco 2024 analysis, "red flag" + "work" replays the 2026 Article B5.14.4 answer, anything else
replays the 2026 two-compound rule (Article B6.3.6). Include `/error` in a message to replay an error.
The mock encodes real SSE bytes and streams them through the same parser as the live client.

## LIVE view

The **Strategy chat | Live** switch in the top bar opens the LIVE view, which follows the **real live session**.
On opening (and every 30 s while the tab is on screen) it asks `GET /api/live/current`; if a live session exists it
subscribes to `GET /api/live/stream?live_id=…` and shows it as the main view (`LIVE · <meeting> · <session>`, a green
dot while connected, *RECONNECTING* while EventSource reconnects). A new `live_id` on the server (e.g. the next
session, or a backend restart) is picked up by the poll and followed automatically. A reconnect replays the server's
catch-up; the reducer de-duplicates race control / radio / pit calls / predictions so lists don't double up. Between
sessions the feed shows the last session's final state, flagged with a subtle *Feed idle* note (lap = total laps,
stream ended, or no event for 2 min). With no live session (`/current` 404) the bar says *No live session* and offers
**Start following live feed** (`POST /api/live/start`, a local dev tool).

Between race weekends the view can also be driven by a **test replay**: the backend replays an archived race as if
it were live. The test replay controls are a compact, secondary group in the session bar (**▶ Test replay** plays
the latest race at the chosen speed; **Options** opens season, race, speed 1x–120x and start lap), a **TEST
REPLAY** badge marks it, and **Back to live** returns to the live session. The UI shows a timing tower, the track
status banner (`LIVE · LAP 31/51`), race control and team radio (with machine transcripts), and, whenever a safety
car or VSC starts, the **pit wall calls** (PIT / STAY OUT per car with reasons). Every call set stays available as a
tab (`SC · L31`, `SC · L36`, …).

**Who wins from here?** Each SC/VSC deployment also pushes a prediction: simulated finishes from the current order,
with per-car win % (bar), podium %, expected finish, compound pill + age + Pirelli C-number (`C4`), stopped / to-stop
badge and tyre risk (low/medium/high; hover or tap for the note, e.g. "32 laps old; 12 past the longest 2026 medium
stint here"). Predictions from chat answers join the same history as tabs (`L31`, `L36`, `L38?` for asked ones).

**Strategy channel.** Ask about the race *as it stands right now* ("Who wins from here?", "Can LEC make it to the
end on these mediums?", "Should NOR pit under this SC?"). Each answer is stamped with the lap and status it was worked
out on (`L31 · SAFETY CAR`, "3 laps ago" once the race moves on) and links its top-3 win chances to the prediction
panel. One question at a time; 404 (session gone) / 409 (too early) / network errors show inline. The history
belongs to the live session (`live_id`): a reconnect to the same session keeps it (as does going to a test replay
and back), a new session starts empty. On
desktop the channel is a tab next to the race control / radio feeds; on phones it's a bottom sheet opened with the
**Ask strategy** button.

The **track map** draws the circuit outline (rotated like TV graphics when MultiViewer circuit data is
available, otherwise traced from timing) with corner numbers and a team-coloured dot per car that glides between
the ~4 Hz position updates (snapping on big jumps; no animation with reduced motion). The track tints yellow
under SC/VSC and red under a red flag, marshal sectors light up yellow between "YELLOW IN TRACK SECTOR N" and
"CLEAR IN TRACK SECTOR N", and clicking a dot follows that driver. Positions live in a small external store
(`lib/trackMap.ts`), so they only re-render the map, not the timing tower.

Replays use F1's public live-timing archive. Car positions from the *real* live feed are token-gated: that will
need your own F1 TV login and is for local, personal use only.

Try `2026 → Azerbaijan GP`, speed 60x, from lap 29: two safety cars (laps 31 and 36) in about two minutes.
The first replay of a race downloads the archive, so it takes a few seconds to start. In mock mode the view plays
a short scripted safety-car sequence as the "live session" (mock `/current` + stream) and as the test replay (with a `live` event and a prediction at the SC) instead, and the mock
`/api/live/ask` answers from that scripted race state: keyword-picked answers for "who wins", "make it to the end /
tyres" and "pit / box", 409 before the first timing snapshot, 404 after Stop, `/offline` in a message simulates no
network.

## Scripts

```bash
npm run build   # tsc -b && vite build
npm run lint    # eslint (typescript-eslint strict + react-hooks)
npm test        # vitest: SSE parser, answer formatting, pipeline state, mock transport,
                #         replay reducer (incl. live id + prediction history), race-control noise filter,
                #         radio queue, mock replay + mock ask, track map store, projection and interpolation,
                #         ask client (success/404/409/network), live chat state, /current + polling,
                #         live vs test replay switching, catch-up de-duplication
```

## Backend contract

- `GET /api/health` → `{"status": "ok"}`
- `POST /api/chat` with `{"thread_id": string | null, "message": string}` → `text/event-stream`
  with events `thread`, `step` (`{node, detail}`), `answer` (full payload) and `error`.
  The stream is read with `fetch` + `ReadableStream` (EventSource can't POST); see `src/lib/sse.ts`.
- The `thread_id` from the first `thread` event is sent with every follow-up; **New session** clears it.
- `GET /api/live/sessions?year=2026` → `[{path, meeting, date}]`
- `GET /api/live/replay?path=…&speed=…&from_lap=…` → `text/event-stream` read with `EventSource`, events
  `live` (first: `{live_id, source: "replay" | "live"}`), `session`, `track`, `positions`, `snapshot`,
  `track_status`, `race_control`, `radio`, `radio_transcript`, `pit_calls`, `prediction`
  (`{lap, laps_remaining, status, sims, table: [{tla, position, expected, p_win, p_podium, compound, compound_c,
  tyre_age, stopped, tyre_risk, tyre_note}], notes}`, rows in running order), `end`, `error`.
- `GET /api/live/current` → `{live_id, source, connected, recording, meeting, session, lap, total_laps, status}`
  or 404 `{detail}` when there is no live session; `POST /api/live/start` starts following the live feed (same answer).
- `GET /api/live/stream?live_id=…` → the same events as the replay stream: `live`, a catch-up of the current state,
  then live events; `end` when the session stops; 404 for an unknown `live_id`. EventSource may reconnect here.
- `POST /api/live/ask` with `{"live_id": string, "message": string}` → JSON
  `{answer (markdown), lap, status, prediction, steps}`; 404 `{detail}` when the live session is gone, 409 `{detail}`
  when there isn't enough race data yet. See `src/lib/liveAsk.ts`.
  The source is closed on `end`, `error`, Stop and unmount (EventSource would otherwise reconnect and restart
  the replay). See `src/liveTypes.ts`.
- The backend must allow CORS from the dev origin `http://localhost:5173` (and `http://127.0.0.1:5173`
  if you open it that way) for `GET`/`POST` with a `Content-Type: application/json` header.

## Layout

```
src/
  App.tsx                  shell: top bar, transcript + composer, session panel
  types.ts                 API payload and UI types
  hooks/useChat.ts         send/stream/reset, thread_id, per-run session state
  hooks/useConnection.ts   health check, mock toggle
  lib/sse.ts               SSE frame parser + ReadableStream reader
  lib/events.ts            SSE frame -> typed ChatEvent
  lib/api.ts               live transport (health, chat)
  lib/mock.ts              scripted mock transport
  lib/pipeline.ts          graph-node status (running/done/skipped/error) from step events
  lib/format.ts            tyre compound / article ref / lap-time tokeniser; answer section splitter
  liveTypes.ts             LIVE replay event and state types
  hooks/useReplay.ts       one replay run: open/close the stream, reduce events
  hooks/useSessions.ts     race list per season
  hooks/useRadioPlayer.ts  one <audio> element + clip queue
  hooks/useFollow.ts       followed driver, persisted per race
  lib/replay.ts            replay event parser, reducer, race-control noise filter, timing formatters
  lib/radioQueue.ts        radio queue reducer, auto-queue rule, follow persistence
  lib/liveApi.ts           /api/live/sessions, /current + polling, /start, replay + live stream transports
  hooks/useLiveCurrent.ts  /api/live/current poll while the LIVE tab is visible
  lib/trackMap.ts          map store (track + positions), rotation/projection, sector segments, lerp/snap
  lib/mockReplay.ts        scripted mock races and replay (incl. a mock circuit and moving cars)
  lib/liveAsk.ts           POST /api/live/ask client (404/409/network -> typed failures)
  lib/liveChat.ts          strategy channel reducer: history per live_id, one question at a time
  lib/mockAsk.ts           mock server-side live state, deterministic mock prediction, canned answers
  hooks/useLiveChat.ts     send/cancel questions, hand answer predictions to the replay state
  components/              TopBar, Transcript, Message, Composer, SessionPanel, RaceCard,
                           Pipeline, ToolCalls, Citations, CompoundPill, RefChips, Markdown, …
                           LIVE: LiveView, ReplayControls, TrackStatusBanner, TrackMap, TimingTower,
                           PitCallsPanel, PredictionPanel, LiveChat, RaceControlFeed, RadioFeed
```

Styling evokes a timing screen with colour, type (Titillium Web, JetBrains Mono) and layout only;
it uses no official F1 or team logos, wordmarks, fonts or liveries.
