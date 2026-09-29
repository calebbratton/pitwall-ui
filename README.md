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

## Scripts

```bash
npm run build   # tsc -b && vite build
npm run lint    # eslint (typescript-eslint strict + react-hooks)
npm test        # vitest: SSE parser, answer formatting, pipeline state, mock transport
```

## Backend contract

- `GET /api/health` → `{"status": "ok"}`
- `POST /api/chat` with `{"thread_id": string | null, "message": string}` → `text/event-stream`
  with events `thread`, `step` (`{node, detail}`), `answer` (full payload) and `error`.
  The stream is read with `fetch` + `ReadableStream` (EventSource can't POST); see `src/lib/sse.ts`.
- The `thread_id` from the first `thread` event is sent with every follow-up; **New session** clears it.
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
  components/              TopBar, Transcript, Message, Composer, SessionPanel, RaceCard,
                           Pipeline, ToolCalls, Citations, CompoundPill, RefChips, Markdown, …
```

Styling evokes a timing screen with colour, type (Titillium Web, JetBrains Mono) and layout only;
it uses no official F1 or team logos, wordmarks, fonts or liveries.
