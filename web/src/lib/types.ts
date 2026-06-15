// Mirror of the daemon's ClaudeSummary / HwSample shapes. Keep in lockstep
// with src/core/Aggregator.ts and src/core/types.ts in the parent project.

export type CrabMood = 'chill' | 'focused' | 'cooking' | 'burning';

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
  lastTurnMs: number;
}

// Live-status classification driven by lastTurnMs freshness.
export type ProjectStatus = 'live' | 'recent' | 'idle';

export function projectStatus(lastTurnMs: number, now = Date.now()): ProjectStatus {
  const age = now - lastTurnMs;
  if (age < 90_000) return 'live'; // under 90s — Claude Code is actively turning
  if (age < 5 * 60_000) return 'recent'; // under 5 min — still warm
  return 'idle';
}

export interface RecentTurn {
  ts: number; // ms epoch (serialized over the wire)
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  project: string;
}

export type ProviderId = 'claude' | 'codex' | 'cursor' | 'gemini' | 'copilot';

export interface ProviderSummary {
  provider: ProviderId;
  displayName: string;
  tokensWindow: number;
  buckets: { input: number; output: number; cacheCreation: number; cacheRead: number };
  /** Hidden reasoning tokens (o-series / gpt-5). Optional for backward compat. */
  reasoningTokens?: number;
  costInr: number;
  windowStartMs: number | null;
  resetsAtMs: number | null;
  byModel: ModelTotal[];
  byProject: ProjectTotal[];
  recent: RecentTurn[];
  currentProject: string | null;
  currentModel: string | null;
  latestAgeMs: number | null;
}

/** Back-compat alias — legacy single-provider name. */
export type ClaudeSummary = ProviderSummary;

export interface HwSnapshot {
  cpuPct: number;
  cpuPerCore: number[];
  memUsedBytes: number;
  memTotalBytes: number;
  load1m: number;
  load5m: number;
  load15m: number;
  gpuPct: number | null;
}

export interface ClaudeCliInstance {
  /** Which agent — added in v2 multi-provider. Optional for back-compat. */
  provider?: ProviderId;
  cwd: string;
  project: string;
  pids: number[];
  startedAt: number | null;
}

export interface SignalSnapshot {
  generatedAt: number;
  /** Multi-provider envelope (v2). Each provider that's installed gets a key. */
  providers?: Partial<Record<ProviderId, ProviderSummary | null>>;
  /** Back-compat: top-level Claude summary. The web prefers `providers.claude`
   *  when present and falls back to this for older daemons. */
  claude: ClaudeSummary;
  processes: ClaudeCliInstance[];
  hardware: HwSnapshot;
}
