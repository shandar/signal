# signal

Multi-provider usage monitor for AI coding agents. **Signal, not noise.**

`signal` watches your Claude Code usage and host hardware in one terminal TUI. Live token counts, cost in ₹, per-model and per-project rollups, hardware strip, plus an animated pixel-art crab that reacts to your spend. Built by [Affordance Design Studio](https://affordance.design). MIT.

![signal in Terminal — pixel-art crab with full dashboard](docs/screenshots/terminal.png)

> Looking for the **web tank** that runs on your phone, tablet, and external display? See the [`v2-multi-display`](https://github.com/shandar/signal/tree/v2-multi-display) branch.

## Why

Other monitors lean on the macOS Keychain to fetch exact `%` utilization from Anthropic's API. That requires per-binary Keychain ACL grants and breaks on every rebuild. `signal` reads your local Claude Code JSONL session logs instead — zero prompts, zero keychain access, zero auth dance. You get **real token counts, models, projects, sessions, and a hardware strip**, updated within a second of Claude writing a turn.

If you want exact `%` of plan limit (5h / 7d / Opus / Sonnet), run `signal auth claude` for an optional walkthrough. Most users never need it.

## What you see

- **Animated pixel-art crab** — direct port of [Marcio Granzotto's clawd-tank](https://github.com/marciogranzotto/clawd-tank) sprite (MIT). The crab walks, blinks, bobs claws, and shifts palette based on your 5h token spend: clay (chill) → warm gold (focused) → red-orange + yellow eyes (cooking) → deep red + wild eyes (on fire). Rendered as unicode half-blocks with 24-bit truecolor — recognizable pixel art in any modern terminal.
- **Ambient particles** above the crab — drifting bubbles, thinking dots, sparks, or heatwaves depending on mood.
- **Auto-twitch reactions** — every 18–40s the crab does something delightful (wave, jump, dance, spin) so it never reads as frozen.
- **Live data row** — model in use, project name, token totals, cost in ₹, session reset countdown.
- **Hardware strip** — CPU + RAM bars + load average + GPU (macOS) at the top.

## Install

```bash
# macOS — recommended (Homebrew formula in progress)
brew install affordance/tap/signal

# Anywhere with Bun (or run `npm i -g bun` first)
npm install -g @affordance/signal
```

## Use

```bash
signal                 # live TUI — animated crab + hardware strip + Claude row
signal status          # one-shot table — exit 0 ok, 1 warn (>70%), 2 crit (>90%)
signal json            # machine-readable snapshot for scripts and statuslines
signal doctor          # diagnose adapter detection and hardware sampling
signal config          # edit ~/.signal/config.toml in $EDITOR

# Opt-in extras
signal auth claude           # walkthrough: enable exact-% via Anthropic OAuth (needs Keychain ACL grant)
signal auth claude-disable   # turn OAuth back off, return to JSONL-only
```

## How it works

`signal` reads `~/.claude/projects/*.jsonl` — the same logs Claude Code writes for every turn — and aggregates them locally in a SQLite event store at `~/.signal/events.db`. A `fs.watch` on the projects directory pushes new turns into the TUI within ~250ms. Nothing leaves your machine. No telemetry, no accounts, no API keys to manage.

The crab is a 15×16 pixel-art sprite from clawd-tank rendered via unicode half-blocks (`▀`) with truecolor fg/bg. Each terminal cell renders two pixels of the sprite stacked. Mood-driven palettes and 4-pose walk cycles per mood give it visible motion in any truecolor terminal — no images, no sprite sheets, no native graphics layer required.

Hardware sampling (CPU, RAM, load average, GPU on macOS) runs only while the TUI is alive. Baseline uses Node's `os` module; install the optional `systeminformation` dep for per-core CPU, memory pressure, and richer GPU metrics.

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

## Credits

The pixel-art crab sprite (`src/ui/tui/crabSprite.ts`) is a port of [clawd-tank](https://github.com/marciogranzotto/clawd-tank) by **Marcio Granzotto Rodrigues**, used under the MIT License. The v2 web tank uses his original SVGs directly; the terminal version reconstructs the same `<rect>` grid in TypeScript and renders via unicode half-blocks.

## Status

**v1.0 — Claude + hardware + animated crab, zero-config.** Source MIT. Issues and PRs welcome at github.com/shandar/signal.

Follow-on plans, in priority order:
1. **v1.1** — Codex, Cursor, and Gemini adapters
2. **v1.2** — GitHub Copilot adapter (experimental)
3. **v1.3** — Homebrew tap + notarized binaries + npm publish workflow
4. **v2.0** — Web tank UI (phone / tablet / external display) — in development on the [`v2-multi-display`](https://github.com/shandar/signal/tree/v2-multi-display) branch
5. **v3.0** — ROI layer (cost per shipped PR via `git_commits` join), Tauri menu-bar wrapper
