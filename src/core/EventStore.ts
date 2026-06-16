import { Database } from 'bun:sqlite';
import { platform } from 'node:os';
import type { HwSample, ProviderId, UsageEvent } from './types';

const IS_WINDOWS = platform() === 'win32';

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
  private readonly path: string;

  constructor(path: string) {
    this.path = path;
    this.db = this.openConnection();
    this.migrate();
  }

  private openConnection(): Database {
    const db = new Database(this.path, { create: true });
    // Journal mode: on macOS/Linux use WAL (concurrent readers + one writer,
    // best perf). On Windows we use the default rollback journal — Bun's
    // compiled-binary on Windows has been observed to throw "Cannot use a
    // closed database" mid-session when WAL is enabled (the .wal/.shm
    // sidecar files interact badly with Windows file-handle GC). DELETE
    // journal mode has no sidecars and is rock solid; the perf delta is
    // invisible at the write rates signal generates (a few rows per second
    // at peak).
    if (!IS_WINDOWS) {
      db.exec('PRAGMA journal_mode = WAL');
    }
    // When two pollers (Claude + Codex) try to write at the exact same tick,
    // SQLite still serializes writes — without busy_timeout the loser of the
    // race fails immediately with SQLITE_BUSY. 5s is overkill on a healthy
    // box but it costs nothing if there is no contention.
    db.exec('PRAGMA busy_timeout = 5000');
    return db;
  }

  /** Self-heal helper: callers wrap their db work in this. If the underlying
   *  connection has been closed for any reason, reopen it and retry once.
   *  Anything else propagates. The retry is one-shot so a genuinely broken
   *  store doesn't loop forever. */
  private withDb<T>(fn: (db: Database) => T): T {
    try {
      return fn(this.db);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!/closed database/i.test(msg)) throw err;
      console.error('[signal] db handle was closed; reopening and retrying:', msg);
      this.db = this.openConnection();
      return fn(this.db);
    }
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
    this.withDb((db) => {
      const stmt = db.prepare(`
        INSERT INTO events (provider, ts, model, input_tokens, output_tokens,
          cache_creation_tokens, cache_read_tokens, reasoning_output_tokens,
          session_id, project_path, raw_json)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      const insert = db.transaction((batch: UsageEvent[]) => {
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
    });
  }

  latestEvents(provider: ProviderId, limit: number): UsageEvent[] {
    return this.withDb((db) => {
      const rows = db
        .prepare('SELECT * FROM events WHERE provider = ? ORDER BY ts DESC LIMIT ?')
        .all(provider, limit) as Record<string, unknown>[];
      return rows.map(this.rowToEvent);
    });
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
    this.withDb((db) => {
      db.prepare(`
          INSERT INTO hw_samples (ts, cpu_pct, cpu_per_core_json, mem_used_bytes,
            mem_total_bytes, mem_pressure_pct, load_1m, load_5m, load_15m, gpu_pct)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
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
    });
  }

  recentHwSamples(limit: number): HwSample[] {
    return this.withDb((db) => {
      const rows = db
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
    });
  }

  setProviderState(
    provider: ProviderId,
    state: { lastPollAt: Date | null; lastError: string | null; authStatus: string | null },
  ): void {
    this.withDb((db) => {
      db.prepare(`
          INSERT INTO state (provider, last_poll_at, last_error, auth_status)
          VALUES (?, ?, ?, ?)
          ON CONFLICT(provider) DO UPDATE SET
            last_poll_at = excluded.last_poll_at,
            last_error = excluded.last_error,
            auth_status = excluded.auth_status
        `).run(provider, state.lastPollAt?.getTime() ?? null, state.lastError, state.authStatus);
    });
  }

  getProviderState(provider: ProviderId): ProviderState | null {
    return this.withDb((db) => {
      const row = db.prepare('SELECT * FROM state WHERE provider = ?').get(provider) as
        | Record<string, unknown>
        | undefined;
      if (!row) return null;
      return {
        lastPollAt: row.last_poll_at ? new Date(row.last_poll_at as number) : null,
        lastError: (row.last_error as string | null) ?? null,
        authStatus: (row.auth_status as string | null) ?? null,
      };
    });
  }

  close(): void {
    this.db.close();
  }
}
