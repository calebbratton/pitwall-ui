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

## LIVE view (race replay)

The **Strategy chat | Live** switch in the top bar opens the LIVE view: pick a season and race (the latest
is preselected), a speed (1x–120x) and optionally a start lap, and press **Play**. The backend replays the
archived race as if it were live; the UI shows a timing tower, the track status banner, race control and team
radio (with machine transcripts), and, whenever a safety car or VSC starts, the **pit wall calls** (PIT / STAY
OUT per car with reasons). Every call set stays available as a tab (`SC · L31`, `SC · L36`, …).

**Follow** a driver (selector, or click a TLA in the tower) to highlight them, and turn on **Auto-play** to hear
each new clip of theirs in order, one at a time (skip/stop in the *Now playing* strip). Only the followed driver
is auto-played; every clip in the feed has its own play button. The followed driver is remembered per race in
`localStorage`.

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
a short scripted safety-car sequence instead.

## Scripts

```bash
npm run build   # tsc -b && vite build
npm run lint    # eslint (typescript-eslint strict + react-hooks)
npm test        # vitest: SSE parser, answer formatting, pipeline state, mock transport,
                #         replay reducer, race-control noise filter, radio queue, mock replay,
                #         track map store, projection and interpolation
```

## Backend contract

- `GET /api/health` → `{"status": "ok"}`
- `POST /api/chat` with `{"thread_id": string | null, "message": string}` → `text/event-stream`
  with events `thread`, `step` (`{node, detail}`), `answer` (full payload) and `error`.
  The stream is read with `fetch` + `ReadableStream` (EventSource can't POST); see `src/lib/sse.ts`.
- The `thread_id` from the first `thread` event is sent with every follow-up; **New session** clears it.
- `GET /api/live/sessions?year=2026` → `[{path, meeting, date}]`
- `GET /api/live/replay?path=…&speed=…&from_lap=…` → `text/event-stream` read with `EventSource`, events
  `session`, `track`, `positions`, `snapshot`, `track_status`, `race_control`, `radio`, `radio_transcript`,
  `pit_calls`, `end`, `error`.
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
  lib/liveApi.ts           /api/live/sessions + EventSource replay transport
  lib/trackMap.ts          map store (track + positions), rotation/projection, sector segments, lerp/snap
  lib/mockReplay.ts        scripted mock races and replay (incl. a mock circuit and moving cars)
  components/              TopBar, Transcript, Message, Composer, SessionPanel, RaceCard,
                           Pipeline, ToolCalls, Citations, CompoundPill, RefChips, Markdown, …
                           LIVE: LiveView, ReplayControls, TrackStatusBanner, TrackMap, TimingTower,
                           PitCallsPanel, RaceControlFeed, RadioFeed
```

Styling evokes a timing screen with colour, type (Titillium Web, JetBrains Mono) and layout only;
it uses no official F1 or team logos, wordmarks, fonts or liveries.
