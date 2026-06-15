# signal — multi-display tank

> **v2** branch — adds a live web tank UI on top of the v1 terminal CLI.
> The same daemon serves the data over WebSocket; the UI runs on your
> phone, tablet, MacBook browser, external display, or anywhere with a
> browser pointed at the daemon. Pixel-art animated crab included.

Multi-provider usage monitor for AI coding agents. **Signal, not noise.**

`signal` watches your AI usage and host hardware. The v1 terminal TUI is here too — but the headline of v2 is `signal serve`, which spins up a WebSocket daemon and a web tank that any browser on your Wi-Fi can open. Built by [Affordance Design Studio](https://affordance.design). MIT.

![signal web tank — animated clawd crab walking under glass data panels](docs/screenshots/web.png)

## For Codex testers

If you use [OpenAI Codex CLI](https://github.com/openai/codex) and want to try signal on your data:

```bash
# Clone + build (only requires Bun — get it from https://bun.sh)
git clone https://github.com/shandar/signal.git
cd signal
git checkout v2-multi-display
bun install
cd web && bun install && bun run build && cd ..
bun run compile

# Run it
./dist/signal serve
# Open the URL it prints (http://localhost:8787 + the LAN URL for your phone)
```

On boot the daemon prints which providers it found:

```
providers: ● Claude   ● Codex
```

If only Codex is detected (typical Codex-only tester), you'll see your Codex sessions, models, projects, recent turns, and 5h-window cost in ₹. The web tank renders your data exactly the same way Claude users see theirs. **No keychain prompts, no auth setup** — Codex bakes its rate-limit data into the JSONL session logs already on your disk.

What `signal` reads:
- `~/.codex/sessions/<Y>/<M>/<D>/rollout-*.jsonl` — session events, token counts, rate limits
- `ps -ef` + `lsof` — running `codex` CLI processes by working directory (so you see *which terminals* are alive)

Nothing leaves your machine. No telemetry, no accounts, no API keys.

When you spot something off or missing, file an issue at [github.com/shandar/signal/issues](https://github.com/shandar/signal/issues) — paste the output of `./dist/signal doctor` and a brief description.

## What's in v2

- **Multi-provider** — both Claude Code and OpenAI Codex CLI sessions in one dashboard. Floating provider-switcher pill when both have data; single-provider users see their data exactly like before. No OAuth dance for Codex (rate limits ship inside the JSONL).
- **Web tank UI** — animated pixel-art aquarium with [Marcio Granzotto's clawd-tank](https://github.com/marciogranzotto/clawd-tank) crab (MIT). Mood states drive the crab's animation: chill → focused → cooking → on-fire as your 5h token spend climbs.
- **Multi-surface** — one web bundle, four surfaces: phone / tablet / browser / external display. Future: Tauri menu-bar and borderless desktop window (planned).
- **Live data over WebSocket** — every Claude or Codex turn pushes to all connected clients within ~250ms (via `fs.watch` + per-provider polling).
- **Running terminals detector** — finds every active `claude` and `codex` CLI process by working directory and groups subagent children. See which projects are *actually* alive right now, tagged by provider.
- **Token-flow + cache savings** — input → output flow with cache-write / cache-read split. Quantifies prompt-cache savings against full-input pricing.
- **Mini-game** — tap the water on the tank page; food drops, crab walks over, eats with a sparkle. Synthesized footstep / splash / sparkle audio (no asset files).
- **INR-first cost** — Indian lakh/crore-style grouping. Tap the headline to flip to USD.
- **Phone widget grid** — 7 chips (down from 14) with expandable detail sections; cards are draggable on desktop.
- **Toasts** — pop on every new Claude turn and mood transition.
- **Settings page** — FX rate, mood thresholds, sounds toggle, mini-game toggle.

## Install

```bash
# macOS — recommended (Homebrew formula in progress)
brew install affordance/tap/signal

# Anywhere with Bun (or run `npm i -g bun` first)
npm install -g @affordance/signal
```

## Use

```bash
# v1 terminal CLI
signal                 # live TUI — hardware strip + Claude row
signal status          # one-shot table (exit 0/1/2 by severity)
signal json            # machine-readable snapshot
signal doctor          # diagnose adapter detection and hardware
signal config          # edit ~/.signal/config.toml in $EDITOR

# v2 web tank
signal serve           # start the daemon — prints local + LAN URLs to open
signal serve -p 9000   # custom port

# Opt-in
signal auth claude     # enable exact-% utilization via Anthropic OAuth
```

On your phone, point the browser at the LAN URL the daemon prints (e.g. `http://192.168.1.42:8787`) and Share → **Add to Home Screen**. PWA manifest ships with the page so it installs like a native app.

## Architecture

```
~/.claude/projects/*.jsonl   ← Claude Code writes turns here
            │
            ▼
       signal daemon (Bun + Bun.serve)         ←  `pgrep` + `lsof` for live process detect
            │  fs.watch + 5s safety poll
            ▼
       SQLite event store at ~/.signal/events.db
            │  aggregateClaude() → ClaudeSummary
            ▼
        WebSocket  /ws  pub/sub
            │
   ┌────────┼────────┬─────────────┐
   ▼        ▼        ▼             ▼
 phone   browser   tablet   external display
 (PWA)   (any)     (PWA)    (kiosk on TV)
```

Same `web/dist/` bundle on every surface. Pull-to-refresh on phone, the WebSocket reconnects automatically. iOS Safari background-throttle detected via a local heartbeat and the connection is forced back open when the tab returns.

## Configuration

`signal config` opens `~/.signal/config.toml`. Defaults:

```toml
enabledProviders = ["claude"]
dbPath = "~/.signal/events.db"

[hardware]
sampleIntervalMs = 2000
useSystemInformation = true

[claude]
useOauth = false   # set true (or run `signal auth claude`) for exact % utilization
```

User-side preferences (currency, FX rate, mood thresholds, sounds, layout) are stored in browser `localStorage` per device.

## How it works

`signal` reads `~/.claude/projects/*.jsonl` — the same logs Claude Code writes for every turn — and aggregates them in a SQLite event store at `~/.signal/events.db`. A `fs.watch` on the projects directory pushes new turns into the daemon within ~250ms, which broadcasts them to all WebSocket clients.

For "what Claude Code processes are alive *right now*," the daemon runs `pgrep -f` + `lsof -d cwd` on every snapshot, groups by working directory, and surfaces the list to the UI with a pulsing-dot live/recent/idle classification.

Hardware sampling (CPU, RAM, load average, GPU on macOS) runs continuously while the daemon is up. Baseline uses Node's `os` module; install the optional `systeminformation` dep for per-core CPU, memory pressure, and richer GPU metrics.

Nothing leaves your machine. No telemetry, no accounts, no API keys to manage.

## Credits

The animated pixel-art crab in the web tank (`web/public/clawd/*.svg`) is from [clawd-tank](https://github.com/marciogranzotto/clawd-tank) by **Marcio Granzotto Rodrigues**, used under the MIT License. See `web/public/clawd/NOTICE.md`.

## Status

**v2 in development** on the `v2-multi-display` branch. The v1 terminal CLI lives on `main` and is tagged `v0.1.0`.

Follow-on plans, in priority order:
1. **Tauri menu-bar wrapper** — `signal-bar` sits in your Mac menu bar; click opens the same web tank in a popover
2. **Tauri borderless desktop window** — `signal-tank` floats in a corner of your screen, always-on-top
3. **Codex / Cursor / Gemini / Copilot adapters** — multi-provider beyond Claude
4. **ROI layer** — join the `git_commits` table to `events` for cost-per-PR
5. **Homebrew tap + notarized binaries + npm publish workflow** — proper distribution
