# Status — `v2-multi-display`

> **What this is**: a working snapshot so you can pick up the branch cold months from now. Read top-to-bottom in 90 seconds.

**Last updated**: 2026-05-18
**Last commit**: feat(codex): multi-provider adapter, wire, pricing, UI, doctor
**Tag**: untagged (v0.2.0 planned)
**Parent**: branched from `main` at `82afc68` (clawd port commit)

---

## What works right now

Run `signal serve` from this branch and you get all of this:

- **HTTP + WebSocket daemon** on port 8787 (`signal serve` or `signal serve -p N`)
- **Web tank UI** served by the daemon — accessible from any browser on the same Wi-Fi via the LAN URL the daemon prints on boot
- **PWA-installable** — "Add to Home Screen" on iOS Safari gives you a fullscreen app icon
- **Live data updates** within ~250ms of any Claude turn (via `fs.watch` on `~/.claude/projects`)
- **Two pages** in the pager: tank + settings (Stats merged into tank chips)
- **Running terminals widget** — every `claude` CLI process by working directory, pulsing live/recent/idle dot
- **Animated pixel-art clawd crab** (chill / focused / cooking / burning) with mood-driven moves + tap reactions
- **Mini-game** — tap water to drop food; crab walks to exact spot; eats with sparkle + score
- **Footstep audio** synthesized via Web Audio (no MP3 assets), distance-synced to crab movement
- **Floating sound toggle** bottom-left + Settings toggle
- **Toast notifications** on new Claude turns + mood transitions
- **Currency toggle** INR ↔ USD; FX rate editable in Settings
- **Cards drag-and-drop** on desktop (persisted in localStorage)
- **Mobile widget grid** — 7 chips, some expandable (Models, Recent Turns)
- **Cache-savings call-out** inside the Token Flow chip
- **Connection state visible** — green live / amber stale / red offline
- **Multi-provider** — both Claude Code and OpenAI Codex CLI sessions are
  detected and rendered. A floating provider-switcher pill (top-left)
  appears when both have data; single-provider users see the data
  rendered exactly like before. `signal doctor` reports both.

## Architecture in one diagram

```
~/.claude/projects/*.jsonl   ←  Claude Code writes turns here
            │
            ▼
       signal daemon (src/ui/serve.ts)
       • fs.watch + 5s safety poll
       • detectClaudeCliInstances() via pgrep + lsof per snapshot
            │
            ▼
       SQLite event store (~/.signal/events.db)
            │ aggregateClaude() → ClaudeSummary
            ▼
       /ws WebSocket pub/sub  ─────────────  /api/snapshot, /api/health
            │
   ┌────────┼────────┬─────────────┐
   ▼        ▼        ▼             ▼
 phone   browser   tablet   external display
 (PWA)   (any)     (PWA)    (kiosk on TV)
```

All web code under `web/`. All daemon code under `src/`. Same `web/dist/` bundle on every surface.

## Key file locations

| Concern | File |
|---|---|
| Daemon entry + CLI commands | `src/index.ts` |
| Daemon HTTP + WS server | `src/ui/serve.ts` |
| Event aggregator (per-project, models, recent, cost) | `src/core/Aggregator.ts` |
| Running-process detector | `src/core/Processes.ts` |
| Pricing (INR per token by model) | `src/core/Pricing.ts` |
| SQLite event store | `src/core/EventStore.ts` |
| Claude JSONL + OAuth adapter | `src/adapters/claude/` |
| Web app entry | `web/src/main.tsx` → `web/src/App.tsx` |
| Pager (swipe between tank + settings) | `web/src/components/Pager.tsx` |
| Aquarium (crab + bubbles + mini-game) | `web/src/components/Aquarium.tsx` |
| Clawd crab component (mood SVG selection) | `web/src/components/Crab.tsx` |
| Clawd SVG assets | `web/public/clawd/` (+ `NOTICE.md`) |
| Desktop draggable cards panel | `web/src/components/DataPanel.tsx` |
| Mobile widget-grid panel | `web/src/components/DataPanelMobile.tsx` |
| Running-terminals widget | `web/src/components/RunningSessions.tsx` |
| Settings drawer | `web/src/components/SettingsView.tsx` |
| Sound synthesis (Web Audio) | `web/src/lib/sounds.ts` |
| User settings (localStorage) | `web/src/lib/settings.ts` |
| Card-layout persistence | `web/src/lib/layout.ts` |
| WebSocket client + reconnect | `web/src/lib/useSignal.ts` |
| Toast notifications | `web/src/lib/useNotifications.ts` + `Toasts.tsx` |

## Resuming after a break

```bash
cd "<repo>"
git checkout v2-multi-display
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

In rough priority order. Pick any item; each is roughly its own session.

### High-value, near-term

1. **Tauri menu-bar wrapper** — `signal-bar` macOS app that lives in the menu bar and shows the live cost in the strip; click opens a popover with the same web tank inside a webview. ~1-2 sessions.
2. **Tauri borderless desktop window** — `signal-tank` floats on a corner of the screen, always-on-top, transparent background. Same web bundle inside. ~1 session after the menu-bar one is done.
3. **Notarized macOS build + Homebrew tap** — proper distribution so anyone can `brew install affordance/tap/signal`. Includes Apple Developer ID signing + notarytool stapling. ~2 sessions.
4. **FX rate from a feed** — currently `usdToInr` is hardcoded with a user-editable override. Pull a daily rate (Open Exchange Rates free tier, or `~/.signal/fx.json` written by the daemon on boot via `fetch`). ~1 session.

### Multi-provider

5. ~~**Codex adapter**~~ — ✅ shipped 2026-05-18 (see CHANGELOG).
6. **Cursor adapter** — `~/Library/Application Support/Cursor/User/globalStorage/state.vscdb` (SQLite). ~2 sessions (SQLite schema varies between Cursor versions).
7. **Gemini CLI adapter** — `~/.gemini/` log format check, then adapter. ~1 session.
8. **GitHub Copilot adapter** — no local logs; needs `gh auth token` + Copilot billing endpoints. Experimental flag, may slip to v1.2. ~2 sessions.

### Polish

9. **Per-session-not-per-project rollups** — events already carry `sessionId`; switching the aggregation key would let you see multiple concurrent Claude conversations in the same project as separate rows. ~half session.
10. **Cropped/optimized screenshots** — current docs/screenshots/web.png is 1.2MB; could go through pngcrush. ~10 minutes.
11. **Web frontend test coverage** — `vitest` + `@testing-library/react` setup; smoke-test the panel and widget components. ~1 session.
12. **`signal serve --tunnel` flag** — optional Cloudflare Tunnel / ngrok integration so you can show the tank to someone off your LAN. ~1 session, opt-in only.

### Architectural / longer-term

13. **ROI layer** — the `git_commits` table in EventStore is empty by design. Populate it via the GitJoiner stub, then surface "cost per merged PR" / "cost per shipped line" widgets. v2.5 work, ~3-4 sessions.
14. **Predictive intervention** — burn-rate forecaster says "you'll hit 100% in 47 min at this pace"; suggest model-downgrade for cheap prompts. ~2 sessions.
15. **Live session attribution to terminal app** — currently shows project CWD; could correlate to the actual Terminal.app / iTerm2 window name via Accessibility APIs. macOS-only, ~2 sessions.

---

## Open questions / decisions to revisit

- **Where does v2 ship from?** This branch never gets merged to `main` cleanly because the v2 work is structurally different. Two options: (a) make v2 the new main once Tauri wrappers exist, or (b) keep v2 as a "preview" branch + cut a separate release line. Probably (a).
- **Tag naming**: should v2's first tag be `v0.2.0` (continuing the existing scheme) or `v2.0.0` (semver-major to signal the architectural shift)? Leaning `v0.2.0` since this is still pre-1.0.
- **Sound system**: synthesized audio works well for footsteps but might want sampled MP3s for richer effects (water bubble, paper rustle, etc). Decision: skip sampled assets until we have a real product reason — synthesized stays.
- **Mobile drag**: cards on phone aren't draggable (stacked widget grid only). Worth adding? Probably not — phones are short-attention; "open and glance" beats "rearrange."

## Known limitations / "by design"

- Daemon detects `claude` CLI processes via `pgrep` + `lsof`, **macOS-only currently**. Linux equivalent (`/proc/<pid>/cwd`) is straightforward to add.
- `fs.watch` recursive support varies on Linux; the 5s safety poll covers it.
- Audio context starts suspended on mobile Safari; needs first user tap to unlock. Handled silently.
- No persistent server-side state beyond `~/.signal/events.db` — settings persist per-browser via localStorage. Switching devices means redoing your layout. Acceptable trade for "no auth."
