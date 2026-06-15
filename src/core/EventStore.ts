import { Database } from 'bun:sqlite';
import type { HwSample, ProviderId, UsageEvent } from './types';

const MIGRATION_001 = `
CREATE TABLE schema_version (version INTEGER PRIMARY KEY);
INSERT INTO schema_version VALUES (1);

CREATE TABLE events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  provider TEXT NOT NULL,
  ts INTEGER NOT NULL,
  model TEXT,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  cache_creation_tokens INTEGER NOT NULL DEFAULT 0,
  cache_read_tokens INTEGER NOT NULL DEFAULT 0,
  session_id TEXT,
  project_path TEXT,
  raw_json TEXT
);
CREATE INDEX idx_events_provider_ts ON events(provider, ts DESC);

CREATE TABLE state (
  provider TEXT PRIMARY KEY,
  last_poll_at INTEGER,
  last_error TEXT,
  auth_status TEXT
);

CREATE TABLE git_commits (
  repo_path TEXT NOT NULL,
  sha TEXT NOT NULL,
  ts INTEGER NOT NULL,
  branch TEXT,
  message TEXT,
  PRIMARY KEY (repo_path, sha)
);

CREATE TABLE hw_samples (
  ts INTEGER NOT NULL,
  cpu_pct REAL NOT NULL,
  cpu_per_core_json TEXT NOT NULL,
  mem_used_bytes INTEGER NOT NULL,
  mem_total_bytes INTEGER NOT NULL,
  mem_pressure_pct REAL,
  load_1m REAL NOT NULL,
  load_5m REAL NOT NULL,
  load_15m REAL NOT NULL,
  gpu_pct REAL
);
CREATE INDEX idx_hw_samples_ts ON hw_samples(ts DESC);
`;

// v2: add reasoning_output_tokens for o-series / gpt-5 reasoning models.
// Codex emits this as a separate billable bucket; Claude historically does not.
const MIGRATION_002 = `
ALTER TABLE events ADD COLUMN reasoning_output_tokens INTEGER NOT NULL DEFAULT 0;
UPDATE schema_version SET version = 2;
`;

const MIGRATIONS: { version: number; sql: string }[] = [
  { version: 1, sql: MIGRATION_001 },
  { version: 2, sql: MIGRATION_002 },
];

export interface ProviderState {
  lastPollAt: Date | null;
  lastError: string | null;
  authStatus: string | null;
}

export class EventStore {
  private db: Database;

  constructor(path: string) {
    this.db = new Database(path, { create: true });
    this.db.exec('PRAGMA journal_mode = WAL');
    this.migrate();
  }

  private migrate(): void {
    const hasSchemaTable = this.db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='schema_version'")
      .get() as { name: string } | null;
    const currentVersion = hasSchemaTable
      ? (this.db.prepare('SELECT version FROM schema_version').get() as { version: number }).version
      : 0;
    for (const m of MIGRATIONS) {
      if (m.version <= currentVersion) continue;
      this.db.exec(m.sql);
    }
  }

  appendEvents(events: UsageEvent[]): void {
    const stmt = this.db.prepare(`
      INSERT INTO events (provider, ts, model, input_tokens, output_tokens,
        cache_creation_tokens, cache_read_tokens, reasoning_output_tokens,
        session_id, project_path, raw_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const insert = this.db.transaction((batch: UsageEvent[]) => {
      for (const e of batch) {
        stmt.run(
          e.provider,
          e.ts.getTime(),
          e.model,
          e.inputTokens,
          e.outputTokens,
          e.cacheCreationTokens,
          e.cacheReadTokens,
          e.reasoningOutputTokens ?? 0,
          e.sessionId,
          e.projectPath,
          JSON.stringify(e.raw),
        );
      }
    });
    insert(events);
  }

  latestEvents(provider: ProviderId, limit: number): UsageEvent[] {
    const rows = this.db
      .prepare('SELECT * FROM events WHERE provider = ? ORDER BY ts DESC LIMIT ?')
      .all(provider, limit) as Record<string, unknown>[];
    return rows.map(this.rowToEvent);
  }

  private rowToEvent = (r: Record<string, unknown>): UsageEvent => ({
    provider: r.provider as ProviderId,
    ts: new Date(r.ts as number),
    model: (r.model as string | null) ?? null,
    inputTokens: r.input_tokens as number,
    outputTokens: r.output_tokens as number,
    cacheCreationTokens: r.cache_creation_tokens as number,
    cacheReadTokens: r.cache_read_tokens as number,
    reasoningOutputTokens: (r.reasoning_output_tokens as number | undefined) ?? 0,
    sessionId: (r.session_id as string | null) ?? null,
    projectPath: (r.project_path as string | null) ?? null,
    raw: JSON.parse((r.raw_json as string) ?? 'null'),
  });

  appendHwSample(s: HwSample): void {
    this.db
      .prepare(`
        INSERT INTO hw_samples (ts, cpu_pct, cpu_per_core_json, mem_used_bytes,
          mem_total_bytes, mem_pressure_pct, load_1m, load_5m, load_15m, gpu_pct)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        s.ts.getTime(),
        s.cpuPct,
        JSON.stringify(s.cpuPerCore),
        s.memUsedBytes,
        s.memTotalBytes,
        s.memPressurePct,
        s.load1m,
        s.load5m,
        s.load15m,
        s.gpuPct,
      );
  }

  recentHwSamples(limit: number): HwSample[] {
    const rows = this.db
      .prepare('SELECT * FROM hw_samples ORDER BY ts DESC LIMIT ?')
      .all(limit) as Record<string, unknown>[];
    return rows.map((r) => ({
      ts: new Date(r.ts as number),
      cpuPct: r.cpu_pct as number,
      cpuPerCore: JSON.parse(r.cpu_per_core_json as string),
      memUsedBytes: r.mem_used_bytes as number,
      memTotalBytes: r.mem_total_bytes as number,
      memPressurePct: (r.mem_pressure_pct as number | null) ?? null,
      load1m: r.load_1m as number,
      load5m: r.load_5m as number,
      load15m: r.load_15m as number,
      gpuPct: (r.gpu_pct as number | null) ?? null,
    }));
  }

  setProviderState(
    provider: ProviderId,
    state: { lastPollAt: Date | null; lastError: string | null; authStatus: string | null },
  ): void {
    this.db
      .prepare(`
        INSERT INTO state (provider, last_poll_at, last_error, auth_status)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(provider) DO UPDATE SET
          last_poll_at = excluded.last_poll_at,
          last_error = excluded.last_error,
          auth_status = excluded.auth_status
      `)
      .run(provider, state.lastPollAt?.getTime() ?? null, state.lastError, state.authStatus);
  }

  getProviderState(provider: ProviderId): ProviderState | null {
    const row = this.db.prepare('SELECT * FROM state WHERE provider = ?').get(provider) as
      | Record<string, unknown>
      | undefined;
    if (!row) return null;
    return {
      lastPollAt: row.last_poll_at ? new Date(row.last_poll_at as number) : null,
      lastError: (row.last_error as string | null) ?? null,
      authStatus: (row.auth_status as string | null) ?? null,
    };
  }

  close(): void {
    this.db.close();
  }
}
