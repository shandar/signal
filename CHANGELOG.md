# Changelog — `v2-multi-display`

All notable changes on this branch. Format follows [Keep a Changelog](https://keepachangelog.com/). Each section header is the commit short SHA on origin.

This branch starts where `main` ends (currently `82afc68`, the clawd-port commit). Everything below is **only on v2-multi-display**; the same `main` history lives in `CHANGELOG.md` on `main`.

---

## Unreleased — phone + tablet + browser web tank

### Multi-provider (Codex)

#### `<HEAD>` — feat(codex): multi-provider adapter, wire, pricing, UI, doctor
- New `src/adapters/codex/` (jsonl.ts + index.ts) parses Codex CLI session
  logs at `~/.codex/sessions/<Y>/<M>/<D>/rollout-*.jsonl` and emits one
  UsageEvent per `event_msg.token_count` record; model attribution via the
  latest `turn_context.model` the parser has seen.
- No OAuth dance — Codex bakes rate-limit data into the JSONL records
  themselves. Just walk the directory and you have everything (5h + 7d
  windows, `used_percent`, `resets_at`, `plan_type`).
- `UsageEvent.reasoningOutputTokens?` added for hidden o-series / gpt-5
  reasoning tokens; EventStore migration v2 adds the column.
- `Aggregator.aggregateProvider(events, { provider, displayName })` is now
  the canonical name (aggregateClaude kept as a thin alias). Reasoning
  tokens tracked separately on ProviderSummary; folded into output for
  cost calculation (Codex bills at output rate).
- `Pricing.ts` extended with GPT-5/Codex, o3, o4-mini, GPT-4o rate tables.
- Daemon snapshot envelope now `{ providers: { claude?, codex? }, claude
  (legacy), processes, hardware }` — backward-compat top-level `claude`
  field preserved.
- `Processes.detectCodexCliInstances()` finds `codex` CLI processes via
  pgrep + lsof, tagged with `provider` field.
- New web `ProviderSwitcher` floating pill (top-left) shown when 2+
  providers have data; single-provider scenarios render exactly like
  before.
- `signal doctor` reports both providers separately with detection +
  recent-event count for Codex; exits 0 if any provider works.
- 4 new jsonl parser tests (real anonymized fixture + synthetic
  malformed). All 25 tests green; lint + tsc clean.

### Scaffolding & daemon

#### `dfc160d` — feat(v2): web aquarium UI served by `signal serve` daemon
- New Vite + React + framer-motion frontend under `web/`
- `signal serve` command in `src/ui/serve.ts`: HTTP + WebSocket on `:8787` (Bun.serve)
- Snapshot pushed every 1s + on every `~/.claude/projects` file change (debounced 250ms)
- `/api/health`, `/api/snapshot`, `/ws` endpoints
- Serves `web/dist/` with SPA fallback; prints LAN URLs for phone access
- Pixel-art aquarium: gradient water, caustic flicker, bubbles, swaying kelp, pebble floor
- Animated SVG crab (initial version — own `<rect>`-based art, later replaced)
- Glass data panels overlaid on the tank
- WebSocket client with exponential reconnect backoff
- PWA manifest + apple-touch-icon for phone "Add to Home Screen"
- CRT scanline + vignette overlay

#### `3a388fe` — chore(web): noEmit on tsconfig
- `tsc --noEmit` instead of `tsc -b` to stop emitting stray `.js` next to `.tsx` sources

#### `ffbb0f1` — fix(v2): wire timestamps as numbers, add local clock tick, stale state
- Daemon serializes `recent[].ts` as ms-epoch numbers (was ISO strings — broke `Date.now() - r.ts` arithmetic in the browser)
- `useSignal` ticks a local 1s timer so ages and countdowns animate between pushes
- Connection indicator with three states: `● live` (<3s), `● stale Ns`, `● offline`
- Detect iOS Safari background-throttle (stale on "open" socket) and force-reopen
- `visibilitychange` listener re-opens on tab return
- `/api/snapshot` fetched on every (re)connect

### Interactivity

#### `99b777f` — feat(v2): interactive dashboard — draggable cards, tap-reactive crab, currency toggle
- Cards wrapped in `DraggableCard` with framer-motion drag; CSS anchors stay responsive; offset persists in `localStorage`
- Each card has a ▾/▴ collapse toggle, state also persisted
- Crab is now an interactive `<button>`; tap plays a random reaction (wave / jump / spin / dance / surprise)
- Tap the big cost number to flip between INR ↔ USD
- Tap the mood chip to manually cycle the crab's mood (override expires after 8s)
- Reset-layout button bottom-right wipes positions + reloads

#### `823978d` — feat(v2): notifications, mini-game, multi-tank pager, settings, responsive
- `useNotifications` hook + `Toasts` component: glass toasts on new Claude turns + mood transitions
- Mini-game: tap water → food drops → crab walks over → eats with sparkle + score
- `Pager` for 3 swipe pages (tank / stats / settings) — later consolidated to 2 pages
- `StatsView` page with big-number headlines, token-flow chart, cache-savings call-out (later folded into main page)
- `SettingsView` with FX rate, mood thresholds, toggles
- `useMediaQuery` hook + `DataPanelMobile` for narrow viewports (≤720px stacked layout)

### Pager fixes

#### `cb36e0e` — fix(pager): proper viewport-px page widths + drag range
- Pages laid out at exact `width: 100vw` instead of percentage math
- Drag constraints set to `{ left: -(totalWidth-width), right: 0 }` so the strip can actually move during swipe
- Velocity-based + offset-based swipe commit threshold (18% offset OR >350 px/s velocity)
- Arrow-key navigation for desktop
- Aquarium dropped `onTouchEnd` (only `onClick` now) so swipes don't double as taps

#### `4920f7e` — fix(pager): touchAction pan-y on draggable strip
- Vertical scroll inside pages works while horizontal drag still pages — fixes "scroll stuck" on phone

### Mobile + UI polish

#### `da75e0e` — feat(mobile): widget-grid layout
- iOS-Home-Screen-style 2-column grid of glass chips on phone (replaces stacked column)
- Accent borders coded by data semantics (cyan output, pink reset, lime session, yellow cache, etc.)
- Some chips span 2 columns (hero, last activity, recent feed)

### Live-process detection

#### `1423b4b` — feat(live): show which Claude Code projects are running right now
- `ProjectTotal.lastTurnMs` added through Aggregator → wire → web
- `projectStatus()` classifies: `live` (<90s), `recent` (<5min), `idle`
- `LiveSessions` component with pulsing-green dot for live projects

#### `9733345` — feat: detect running claude CLI processes by working dir
- New `src/core/Processes.ts`: `pgrep -f` + `lsof -d cwd` to enumerate `claude` CLI instances
- Subagent children fold into their parent's CWD entry
- Filters out macOS Claude.app helpers + signal's own daemon
- Snapshot now includes `processes: ClaudeCliInstance[]` with `{ cwd, project, pids, startedAt }`
- New `RunningSessions` widget — pulsing-dot live/recent/idle classification, uptime, lead PID, cost

### Visual upgrade

#### `20715e3` — feat(crab): clawd-tank animations
- 30 hand-tuned CSS-keyframe SVG animations from [clawd-tank](https://github.com/marciogranzotto/clawd-tank) (MIT) copied to `web/public/clawd/`
- Mood mapping: chill → `idle-living`, focused → `working-typing`, cooking → `working-builder`, burning → `working-overheated`
- Tap-reaction pool: happy, eureka, grooving, hat-mishap, dizzy, juggling
- Subtle CSS filter hue-shift per mood (cool chill → hot burning)
- `NOTICE.md` + main README credit added

### Refactor

#### `0260cba` — refactor(ui): consolidate chips, fold Stats page into main
- Mobile chip count: 14 → 7. Hero combines spend + session + reset. Token-flow includes cache-savings inline. Models becomes expandable.
- New `ExpandableChip` with header summary + animated collapse
- Stats page removed from the Pager — its data lives in the chips now
- Desktop DataPanel: 8 cards → 6 cards. Live + Projects subsumed by Running Terminals.

### Audio + interaction polish

#### `5363424` — feat(crab): tight food collision + audio
- `EAT_DISTANCE_PCT` 6 → 1.2: crab physically arrives on food before eating
- New `web/src/lib/sounds.ts` synthesizes footstep / splash / sparkle via Web Audio
- Footstep cadence follows mood walk speed (200ms burning → 720ms chill)
- `unlockAudio()` from any tap satisfies Safari autoplay policy

#### `37b9234` — feat(audio): higher-pitch tick footstep, distance-synced, mute toggle
- Footstep rebuilt: bandpass-filtered noise burst at ~2kHz, ~45ms decay — sounds like chitin tapping rock
- Step trigger switched to cumulative horizontal-distance accumulator (2.2% per step) — syncs to actual crab motion, not wall-clock
- Floating `SoundToggle` button bottom-left — speaker pill, unlocks audio + toggles persistence

### Documentation

#### `558e4b9` — docs(v2): rewrite README for the multi-display tank
- v2-focused description, architecture diagram, multi-surface use cases
- Follow-on plans reordered to prioritize Tauri menu-bar + desktop window

#### `d6b2100` — docs(v2): add web tank screenshot to README
- Full-screen capture of the tank in Chrome at localhost:8787

#### `81f9b93` — docs(v2): re-crop the web tank screenshot
- 3024×1600 region-capture — just the tank canvas, no menu bar / dock / Chrome chrome

---

## Versioning

This branch hasn't been tagged. When v2 ships it will be `v0.2.0` (web tank as the headline). Tag on `main` for the v1 terminal CLI is `v0.1.0`.
