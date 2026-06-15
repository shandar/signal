export type ProviderId = 'claude' | 'codex' | 'cursor' | 'gemini' | 'copilot';

export interface UsageEvent {
  provider: ProviderId;
  ts: Date;
  model: string | null;
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  /** Hidden reasoning tokens emitted by o-series / gpt-5 models. Optional —
   *  pre-reasoning models (Claude legacy, gpt-4o) report 0 or null. */
  reasoningOutputTokens?: number;
  sessionId: string | null;
  projectPath: string | null;
  raw: unknown;
}

export interface HwSample {
  ts: Date;
  cpuPct: number;
  cpuPerCore: number[];
  memUsedBytes: number;
  memTotalBytes: number;
  memPressurePct: number | null;
  load1m: number;
  load5m: number;
  load15m: number;
  gpuPct: number | null;
}

export type AuthStatus =
  | { kind: 'ok' }
  | { kind: 'needs_auth'; remediation: string }
  | { kind: 'unsupported'; reason: string }
  | { kind: 'error'; message: string };

export interface ProviderAdapter {
  readonly id: ProviderId;
  readonly displayName: string;
  readonly pollIntervalMs: number;
  detect(): Promise<boolean>;
  authStatus(): Promise<AuthStatus>;
  pollOnce(): Promise<UsageEvent[]>;
}
