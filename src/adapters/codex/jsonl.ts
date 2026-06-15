import { readFileSync, readdirSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { UsageEvent } from '../../core/types';

// Codex CLI writes one .jsonl per session under
//   ~/.codex/sessions/<YYYY>/<MM>/<DD>/rollout-<ISO>-<sessionId>.jsonl
//
// We care about three record types:
//
//   session_meta — first line, gives us session id + working directory.
//   turn_context  — emitted on every new turn; carries `model` and `cwd`. We
//                   track the latest one we've seen so subsequent token_count
//                   events get attributed to the right model.
//   event_msg/token_count — the actual usage. `last_token_usage` is the
//                   delta for the most-recent turn; we emit one UsageEvent
//                   per token_count record so each one is independent.
//
// Anything else is skipped. Malformed lines are skipped silently — same
// defensive pattern as the Claude JSONL parser.

const SESSIONS_DIR = join(homedir(), '.codex', 'sessions');

interface SessionState {
  sessionId: string | null;
  cwd: string | null;
  model: string | null;
}

interface CodexTokenInfo {
  input_tokens?: number;
  cached_input_tokens?: number;
  output_tokens?: number;
  reasoning_output_tokens?: number;
  total_tokens?: number;
}

/**
 * Walk every .jsonl file under ~/.codex/sessions/, filter to those modified
 * within `sinceMs`. Cheap because Codex partitions by date — we can prune
 * year/month/day dirs whose mtime is older than the cutoff.
 */
export function findCodexSessionFiles(sinceMs: number, rootDir = SESSIONS_DIR): string[] {
  const out: string[] = [];
  walkRecursive(rootDir, sinceMs, out);
  // Sort by mtime descending so newest sessions come first — useful for the
  // "latest activity" computation downstream.
  out.sort((a, b) => mtime(b) - mtime(a));
  return out;
}

function mtime(path: string): number {
  try {
    return statSync(path).mtimeMs;
  } catch {
    return 0;
  }
}

function walkRecursive(dir: string, sinceMs: number, out: string[]): void {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = join(dir, entry);
    let st: ReturnType<typeof statSync>;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      // Whole-directory pruning: if no file inside this dir has been touched
      // since the cutoff, the directory's mtime would also be older. We don't
      // recurse those.
      if (st.mtimeMs < sinceMs) continue;
      walkRecursive(full, sinceMs, out);
    } else if (entry.endsWith('.jsonl') && st.mtimeMs >= sinceMs) {
      out.push(full);
    }
  }
}

/** Best-effort extraction of token counts from a token_count payload. */
function extractTokenInfo(payload: unknown): CodexTokenInfo | null {
  if (!payload || typeof payload !== 'object') return null;
  const p = payload as Record<string, unknown>;
  const info = p.info as Record<string, unknown> | undefined;
  if (!info) return null;
  const last = info.last_token_usage as CodexTokenInfo | undefined;
  return last ?? null;
}

/**
 * Parse a single Codex session file into UsageEvent rows.
 *
 * Emits one event per `event_msg.token_count` record. The `model` and
 * `projectPath` are taken from the most-recent turn_context (or session_meta
 * as a fallback) seen above the token_count.
 */
export function parseCodexSession(filePath: string): UsageEvent[] {
  let raw: string;
  try {
    raw = readFileSync(filePath, 'utf-8');
  } catch {
    return [];
  }

  const state: SessionState = { sessionId: null, cwd: null, model: null };
  const events: UsageEvent[] = [];

  for (const line of raw.split('\n')) {
    if (!line.trim()) continue;
    let json: Record<string, unknown>;
    try {
      json = JSON.parse(line);
    } catch {
      continue;
    }

    const t = json.type as string | undefined;
    const payload = json.payload as Record<string, unknown> | undefined;
    if (!t || !payload) continue;

    if (t === 'session_meta') {
      state.sessionId = (payload.id as string | undefined) ?? state.sessionId;
      state.cwd = (payload.cwd as string | undefined) ?? state.cwd;
      // session_meta may carry a model under collaboration_mode.settings.model
      // for some Codex modes — keep it as a fallback in case no turn_context
      // shows up before the first token_count.
      const cmRaw = payload.collaboration_mode as Record<string, unknown> | undefined;
      const cmSettings = cmRaw?.settings as Record<string, unknown> | undefined;
      const cmModel = cmSettings?.model as string | undefined;
      if (cmModel && !state.model) state.model = cmModel;
      continue;
    }

    if (t === 'turn_context') {
      const m = payload.model as string | undefined;
      const cwd = payload.cwd as string | undefined;
      if (m) state.model = m;
      if (cwd) state.cwd = cwd;
      continue;
    }

    if (t === 'event_msg') {
      const inner = payload.type as string | undefined;
      if (inner !== 'token_count') continue;
      const info = extractTokenInfo(payload);
      if (!info) continue;
      const tsStr = json.timestamp as string | undefined;
      events.push({
        provider: 'codex',
        ts: tsStr ? new Date(tsStr) : new Date(),
        model: state.model,
        inputTokens: Number(info.input_tokens ?? 0),
        outputTokens: Number(info.output_tokens ?? 0),
        // Codex doesn't expose a "cache create" cost separately — its cached
        // input pricing is bundled into a single rate. Map directly to
        // cacheReadTokens so the existing aggregator semantics apply.
        cacheCreationTokens: 0,
        cacheReadTokens: Number(info.cached_input_tokens ?? 0),
        reasoningOutputTokens: Number(info.reasoning_output_tokens ?? 0),
        sessionId: state.sessionId,
        projectPath: state.cwd,
        raw: payload,
      });
    }
  }

  return events;
}

/**
 * Aggregate parse: walk every recent session, return their events combined.
 * Matches the Claude adapter's shape so the caller can treat them uniformly.
 */
export function parseRecentCodexUsage(sinceMs: number): UsageEvent[] {
  const events: UsageEvent[] = [];
  for (const file of findCodexSessionFiles(sinceMs)) {
    events.push(...parseCodexSession(file));
  }
  return events;
}
