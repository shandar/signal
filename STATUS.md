# Status

> A working snapshot so you can pick up the repo cold months from now. Read top-to-bottom in 90 seconds.

**Last updated**: 2026-06-16
**Branch**: `main` (single branch — v1 and v2 consolidated)
**Tags**: `v0.1.0` (terminal TUI), `v0.2.0` (web tank + multi-provider, this release)

---

## What ships in v0.2.0

Run `signal serve` and you get:

- **HTTP + WebSocket daemon** on port 8787 (`signal serve` or `signal serve -p N`).
- **Web tank UI** served by the daemon — accessible from any browser on the same Wi-Fi via the LAN URL the daemon prints on boot.
- **PWA-installable** — "Add to Home Screen" on iOS Safari gives a fullscreen app icon.
- **Live data updates** within ~250ms of any new turn (via `fs.watch` on `~/.claude/projects` and `~/.codex/sessions`).
- **Multi-provider** — Claude Code and OpenAI Codex CLI sessions both detected and rendered. Floating provider-switcher pill (top-left) appears when both have data; single-provider users see the data rendered exactly like before. `signal doctor` reports both.
- **Two pages** in the pager: tank + settings.
- **Running terminals widget** — every `claude` and `codex` CLI process by working directory, pulsing live/recent/idle dot, tagged with provider.
- **Animated pixel-art clawd crab** (chill / focused / cooking / burning) with mood-driven moves + tap reactions.
- **Mini-game** — tap water to drop food; crab walks to exact spot; eats with sparkle + score.
- **Footstep audio** synthesized via Web Audio (no MP3 assets), distance-synced to crab movement.
- **Floating sound toggle** bottom-left + Settings toggle.
- **Toast notifications** on new turns + mood transitions.
- **Currency toggle** INR ↔ USD; FX rate editable in Settings.
- **Cards drag-and-drop** on desktop (persisted in localStorage).
- **Mobile widget grid** — 7 chips, some expandable (Models, Recent Turns).
- **Cache-savings call-out** inside the Token Flow chip.
- **Connection state visible** — green live / amber stale / red offline.

And the v0.1.0 terminal TUI is still here: `signal`, `signal status`, `signal json`, `signal doctor`, `signal config`.

## Architecture in one diagram

```
~/.claude/projects/*.jsonl   ←  Claude Code writes turns here
~/.codex/sessions/.../*.jsonl ←  Codex CLI writes turns here
                │
                ▼
        signal daemon (src/ui/serve.ts)
        • fs.watch + per-provider poll
        • detectCliInstances() via pgrep + lsof per snapshot
                │
                ▼
        SQLite event store (~/.signal/events.db)
                │  aggregateProvider() → ProviderSummary
                ▼
        /ws WebSocket pub/sub  ─────────────  /api/snapshot, /api/health
                │
   ┌────────┬───┴────┬─────────┬─────────────┐
   ▼        ▼        ▼         ▼             ▼
terminal  phone   browser   tablet   external display
 (TUI)    (PWA)    (any)    (PWA)    (kiosk on TV)
```

All web code under `web/`. All daemon code under `src/`. Same `web/dist/` bundle on every browser surface.

## Key file locations

| Concern | File |
|---|---|
| Daemon entry + CLI commands | `src/index.ts` |
| Daemon HTTP + WS server | `src/ui/serve.ts` |
| Terminal TUI app | `src/ui/tui/App.tsx` |
| Terminal pixel-art crab | `src/ui/tui/Crab.tsx` + `crabSprite.ts` |
| Event aggregator | `src/core/Aggregator.ts` |
| Running-process detector | `src/core/Processes.ts` |
| Pricing (INR per token by model) | `src/core/Pricing.ts` |
| SQLite event store | `src/core/EventStore.ts` |
| Claude JSONL + OAuth adapter | `src/adapters/claude/` |
| Codex JSONL adapter | `src/adapters/codex/` |
| Web app entry | `web/src/main.tsx` → `web/src/App.tsx` |
| Pager (swipe between tank + settings) | `web/src/components/Pager.tsx` |
| Aquarium (crab + bubbles + mini-game) | `web/src/components/Aquarium.tsx` |
| Web clawd crab component | `web/src/components/Crab.tsx` |
| Clawd SVG assets | `web/public/clawd/` (+ `NOTICE.md`) |
| Desktop draggable cards panel | `web/src/components/DataPanel.tsx` |
| Mobile widget-grid panel | `web/src/components/DataPanelMobile.tsx` |
| Running-terminals widget | `web/src/components/RunningSessions.tsx` |
| Provider switcher pill | `web/src/components/ProviderSwitcher.tsx` |
| Settings drawer | `web/src/components/SettingsView.tsx` |
| Sound synthesis (Web Audio) | `web/src/lib/sounds.ts` |
| User settings (localStorage) | `web/src/lib/settings.ts` |
| Card-layout persistence | `web/src/lib/layout.ts` |
| WebSocket client + reconnect | `web/src/lib/useSignal.ts` |
| Provider helpers | `web/src/lib/providers.ts` |
| Toast notifications | `web/src/lib/useNotifications.ts` + `Toasts.tsx` |

## Resuming after a break

```bash
cd <repo>
bun install                # in case deps changed
cd web && bun install      # web deps separately
cd .. && bun run compile   # produces dist/signal with `serve` baked in
./dist/signal serve        # starts daemon + serves web/dist
# Open http://localhost:8787 or the LAN URL it prints
```

To work on the web UI with hot-reload (vs the bundled `dist`):

```bash
# Terminal A — daemon serves snapshot data
./dist/signal serve

# Terminal B — Vite dev server, proxies /ws + /api to the daemon
cd web && bun run dev
# Then open http://localhost:5173
```

---

## What's next

In rough priority order. Each item is roughly its own session.

### High-value, near-term

1. **Tauri menu-bar wrapper** — `signal-bar` macOS app that lives in the menu bar and shows the live cost in the strip; click opens a popover with the same web tank inside a webview. ~1–2 sessions.
2. **Tauri borderless desktop window** — `signal-tank` floats on a corner of the screen, always-on-top, transparent background. Same web bundle inside. ~1 session after the menu-bar one is done.
3. **Notarized macOS build + Homebrew tap** — proper distribution so anyone can `brew install affordance/tap/signal`. Includes Apple Developer ID signing + notarytool stapling. ~2 sessions.
4. **FX rate from a feed** — currently `usdToInr` is hardcoded with a user-editable override. Pull a daily rate (Open Exchange Rates free tier, or `~/.signal/fx.json` written by the daemon on boot via `fetch`). ~1 session.

### Multi-provider

5. ~~**Codex adapter**~~ — ✅ shipped in v0.2.0.
6. **Cursor adapter** — `~/Library/Application Support/Cursor/User/globalStorage/state.vscdb` (SQLite). ~2 sessions (SQLite schema varies between Cursor versions).
7. **Gemini CLI adapter** — `~/.gemini/` log format check, then adapter. ~1 session.
8. **GitHub Copilot adapter** — no local logs; needs `gh auth token` + Copilot billing endpoints. Experimental flag. ~2 sessions.

### Polish

9. **Per-session-not-per-project rollups** — events already carry `sessionId`; switching the aggregation key would let you see multiple concurrent conversations in the same project as separate rows. ~half session.
10. **Cropped/optimized screenshots** — current `docs/screenshots/web.png` is 1.2MB; could go through pngcrush. ~10 minutes.
11. **Web frontend test coverage** — `vitest` + `@testing-library/react` setup; smoke-test the panel and widget components. ~1 session.
12. **`signal serve --tunnel` flag** — optional Cloudflare Tunnel / ngrok integration so you can show the tank to someone off your LAN. ~1 session, opt-in only.

### Architectural / longer-term

13. **ROI layer** — the `git_commits` table in EventStore is empty by design. Populate it via the GitJoiner stub, then surface "cost per merged PR" / "cost per shipped line" widgets. ~3–4 sessions.
14. **Predictive intervention** — burn-rate forecaster says "you'll hit 100% in 47 min at this pace"; suggest model-downgrade for cheap prompts. ~2 sessions.
15. **Live session attribution to terminal app** — currently shows project CWD; could correlate to the actual Terminal.app / iTerm2 window name via Accessibility APIs. macOS-only, ~2 sessions.

---

## Platform support matrix

| Feature | macOS | Linux | Windows | Notes |
|---|:---:|:---:|:---:|---|
| Claude / Codex JSONL adapters | ✅ | ✅ | ✅ | Reads `~/.claude/projects/*.jsonl` + `~/.codex/sessions/<Y>/<M>/<D>/*.jsonl`. Pure filesystem; no platform calls. |
| Terminal TUI | ✅ | ✅ | ✅ | Ink renders truecolor + unicode half-blocks. Windows Terminal renders the crab correctly; cmd.exe does not. |
| `signal serve` daemon + web tank | ✅ | ✅ | ✅ | `Bun.serve` is cross-platform. |
| CPU / RAM sampling | ✅ | ✅ | ✅ | `node:os` `cpus()` + `freemem()` + `totalmem()` work everywhere. |
| Load average | ✅ | ✅ | ⚠️ | Windows has no `loadavg` concept; `node:os` returns `[0,0,0]`. Displayed as `load 0`. |
| GPU sampling | ✅ | ✅ | ✅ | Requires the optional `systeminformation` dep (`bun add systeminformation`). |
| **Running terminals** widget | ✅ per-CWD | ✅ per-CWD | ⚠️ aggregate | macOS/Linux use `pgrep -f` + `lsof -d cwd` for per-project grouping. Windows uses `powershell.exe` + `Get-CimInstance Win32_Process` and aggregates into one entry per provider (PID count + oldest start time). Per-CWD on Windows would require reading the target process's PEB via `NtQueryInformationProcess` — needs P/Invoke or elevation; not worth it. |
| Live file watching | ✅ recursive | ⚠️ kernel-dependent | ✅ recursive | Linux kernels < 6.x lack recursive `fs.watch`; we always run a 5s safety poll as the backstop, so live updates still work, just at 5s granularity instead of 250ms. |
| Claude OAuth (exact 5h %) | ✅ | ❌ | ❌ | Uses macOS `security find-generic-password` to read the Keychain entry Claude Code writes. No equivalent on Linux/Windows; falls back to JSONL token counts (which is the default for everyone anyway). |

## Other known limitations / "by design"

- Audio context starts suspended on mobile Safari; needs first user tap to unlock. Handled silently.
- No persistent server-side state beyond `~/.signal/events.db` — settings persist per-browser via `localStorage`. Switching devices means redoing your layout. Acceptable trade for "no auth."
- `bun build --compile --outfile=dist/signal` produces a host-platform binary. Cross-compilation needs `--target=bun-windows-x64` / `--target=bun-linux-x64` / etc. Not wired into `npm run compile` yet.
