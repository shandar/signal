import { type TokenBuckets, costInr, priceFor } from './Pricing';
import type { ProviderId, UsageEvent } from './types';

export interface ModelTotal {
  model: string;
  tokens: number;
  costInr: number;
}

export interface ProjectTotal {
  project: string;
  tokens: number;
  costInr: number;
  models: string[];
  // ms epoch of the most recent event seen for this project. Drives the
  // 'live' classification in the UI — projects whose lastTurnMs is within
  // a small window are treated as actively running Claude Code sessions.
  lastTurnMs: number;
}

export interface RecentTurn {
  ts: Date;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  project: string;
}

export interface ProviderSummary {
  /** Which provider this summary describes (claude, codex, etc.) */
  provider: ProviderId;
  /** Display name for headlines (e.g., 'Claude Code', 'Codex') */
  displayName: string;
  // Aggregated 5h-window totals, deduplicated.
  tokensWindow: number;
  buckets: TokenBuckets;
  /** Hidden reasoning tokens (o-series / gpt-5) emitted across the window. */
  reasoningTokens: number;
  costInr: number;
  // Earliest event timestamp inside the 5h window.
  windowStartMs: number | null;
  // When the rolling 5h window's earliest event ages out.
  resetsAtMs: number | null;
  // Tokens grouped by model, descending by tokens.
  byModel: ModelTotal[];
  // Tokens grouped by project, descending by tokens.
  byProject: ProjectTotal[];
  // Most recent unique turns, newest first.
  recent: RecentTurn[];
  currentProject: string | null;
  currentModel: string | null;
  latestAgeMs: number | null;
}

/** Backward-compat alias for the original Claude-named type. */
export type ClaudeSummary = ProviderSummary;

const FIVE_HOURS_MS = 5 * 60 * 60 * 1000;

function basename(path: string | null): string {
  if (!path) return '';
  const parts = path.split('/').filter(Boolean);
  return parts[parts.length - 1] ?? '';
}

function dedupKey(e: UsageEvent): string {
  return `${e.sessionId ?? ''}|${e.ts.getTime()}|${e.inputTokens}|${e.outputTokens}|${e.cacheCreationTokens}|${e.cacheReadTokens}`;
}

function eventTotal(e: UsageEvent): number {
  return e.inputTokens + e.outputTokens + e.cacheCreationTokens + e.cacheReadTokens;
}

interface AggregateOpts {
  provider?: ProviderId;
  displayName?: string;
  now?: number;
}

/**
 * Aggregate a stream of UsageEvent rows into a ProviderSummary. Provider
 * label + display name default to 'claude' / 'Claude Code' so existing
 * callers keep their behavior; pass `{ provider: 'codex', displayName: 'Codex' }`
 * to summarize a Codex event stream.
 */
export function aggregateProvider(events: UsageEvent[], opts: AggregateOpts = {}): ProviderSummary {
  const provider = opts.provider ?? 'claude';
  const displayName = opts.displayName ?? 'Claude Code';
  const now = opts.now ?? Date.now();
  const cutoff = now - FIVE_HOURS_MS;
  const seen = new Set<string>();
  const unique: UsageEvent[] = [];
  for (const e of events) {
    if (e.ts.getTime() < cutoff) continue;
    const key = dedupKey(e);
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(e);
  }

  if (unique.length === 0) {
    return {
      provider,
      displayName,
      tokensWindow: 0,
      buckets: { input: 0, output: 0, cacheCreation: 0, cacheRead: 0 },
      reasoningTokens: 0,
      costInr: 0,
      windowStartMs: null,
      resetsAtMs: null,
      byModel: [],
      byProject: [],
      recent: [],
      currentProject: null,
      currentModel: null,
      latestAgeMs: null,
    };
  }

  const buckets: TokenBuckets = { input: 0, output: 0, cacheCreation: 0, cacheRead: 0 };
  let reasoningTokens = 0;
  let totalCostInr = 0;
  let windowStartMs = Number.POSITIVE_INFINITY;

  const modelMap = new Map<string, { tokens: number; costInr: number }>();
  const projectMap = new Map<
    string,
    { tokens: number; costInr: number; models: Set<string>; lastTurnMs: number }
  >();

  for (const e of unique) {
    const sum = eventTotal(e);
    const reasoning = e.reasoningOutputTokens ?? 0;
    buckets.input += e.inputTokens;
    buckets.output += e.outputTokens;
    buckets.cacheCreation += e.cacheCreationTokens;
    buckets.cacheRead += e.cacheReadTokens;
    reasoningTokens += reasoning;

    // OpenAI / Codex bill reasoning tokens at the output rate, so we fold
    // them into the output bucket for cost calculation only. The
    // ProviderSummary.reasoningTokens field stays separate for UI display.
    const cost = costInr(
      {
        input: e.inputTokens,
        output: e.outputTokens + reasoning,
        cacheCreation: e.cacheCreationTokens,
        cacheRead: e.cacheReadTokens,
      },
      e.model,
    );
    totalCostInr += cost;

    const ts = e.ts.getTime();
    if (ts < windowStartMs) windowStartMs = ts;

    const modelKey = e.model ?? 'unknown';
    const prev = modelMap.get(modelKey) ?? { tokens: 0, costInr: 0 };
    modelMap.set(modelKey, { tokens: prev.tokens + sum, costInr: prev.costInr + cost });

    const proj = basename(e.projectPath);
    if (proj) {
      const p = projectMap.get(proj) ?? {
        tokens: 0,
        costInr: 0,
        models: new Set<string>(),
        lastTurnMs: 0,
      };
      p.tokens += sum;
      p.costInr += cost;
      if (e.model) p.models.add(e.model);
      if (ts > p.lastTurnMs) p.lastTurnMs = ts;
      projectMap.set(proj, p);
    }
  }

  const byModel: ModelTotal[] = [...modelMap.entries()]
    .map(([model, v]) => ({ model, tokens: v.tokens, costInr: v.costInr }))
    .sort((a, b) => b.tokens - a.tokens);

  const byProject: ProjectTotal[] = [...projectMap.entries()]
    .map(([project, v]) => ({
      project,
      tokens: v.tokens,
      costInr: v.costInr,
      models: [...v.models],
      lastTurnMs: v.lastTurnMs,
    }))
    .sort((a, b) => b.tokens - a.tokens);

  const sorted = [...unique].sort((a, b) => b.ts.getTime() - a.ts.getTime());
  const recent: RecentTurn[] = sorted.slice(0, 6).map((e) => ({
    ts: e.ts,
    model: e.model ?? 'unknown',
    inputTokens: e.inputTokens,
    outputTokens: e.outputTokens,
    cacheReadTokens: e.cacheReadTokens,
    project: basename(e.projectPath),
  }));
  const latest = sorted[0];

  return {
    provider,
    displayName,
    tokensWindow: buckets.input + buckets.output + buckets.cacheCreation + buckets.cacheRead,
    buckets,
    reasoningTokens,
    costInr: totalCostInr,
    windowStartMs,
    resetsAtMs: windowStartMs + FIVE_HOURS_MS,
    byModel,
    byProject,
    recent,
    currentProject: latest?.projectPath ? basename(latest.projectPath) : null,
    currentModel: latest?.model ?? null,
    latestAgeMs: latest ? now - latest.ts.getTime() : null,
  };
}

/** Backward-compat alias for callers that still expect the Claude-named name. */
export function aggregateClaude(events: UsageEvent[], now = Date.now()): ClaudeSummary {
  return aggregateProvider(events, { provider: 'claude', displayName: 'Claude Code', now });
}

export function sessionProgressPct(windowStartMs: number | null, now = Date.now()): number {
  if (windowStartMs === null) return 0;
  const elapsed = now - windowStartMs;
  const pct = (elapsed / FIVE_HOURS_MS) * 100;
  return Math.max(0, Math.min(100, pct));
}

export function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

export function formatAge(ms: number | null): string {
  if (ms === null) return '—';
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

export function formatCountdown(targetMs: number | null, now = Date.now()): string {
  if (targetMs === null) return '—';
  const remaining = targetMs - now;
  if (remaining <= 0) return 'resets now';
  const s = Math.floor(remaining / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export function formatClockTime(ms: number | null): string {
  if (ms === null) return '—';
  const d = new Date(ms);
  let h = d.getHours();
  const m = d.getMinutes();
  const ampm = h >= 12 ? 'pm' : 'am';
  h = h % 12;
  if (h === 0) h = 12;
  return `${h}:${m.toString().padStart(2, '0')}${ampm}`;
}

export function shortModel(model: string): string {
  const m = model.replace(/^claude-/i, '');
  const stem = m.split('-')[0] ?? m;
  return stem.toLowerCase();
}

// Mood for the crab based on tokens-in-window. Pure visual signal.
export type CrabMood = 'chill' | 'focused' | 'cooking' | 'burning';

export function moodFor(tokens: number): CrabMood {
  if (tokens < 500_000) return 'chill';
  if (tokens < 5_000_000) return 'focused';
  if (tokens < 20_000_000) return 'cooking';
  return 'burning';
}

export { priceFor };
