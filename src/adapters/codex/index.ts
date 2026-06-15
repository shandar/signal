import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { AuthStatus, ProviderAdapter, UsageEvent } from '../../core/types';
import { parseRecentCodexUsage } from './jsonl';

// Codex CLI writes everything to disk — no OAuth dance is needed because the
// rate-limit data is baked into the JSONL records themselves. So this adapter
// is JSONL-only; it just walks ~/.codex/sessions/ and emits events.

const CODEX_HOME = join(homedir(), '.codex');
const SESSIONS_DIR = join(CODEX_HOME, 'sessions');

export class CodexAdapter implements ProviderAdapter {
  readonly id = 'codex' as const;
  readonly displayName = 'Codex';
  // Codex JSONL is local; no rate limits to dodge. 5s matches the Claude
  // adapter's tempo when running in JSONL-only mode.
  readonly pollIntervalMs = 5_000;

  async detect(): Promise<boolean> {
    return existsSync(CODEX_HOME) && existsSync(SESSIONS_DIR);
  }

  async authStatus(): Promise<AuthStatus> {
    // No auth dance — if the directory exists we're good.
    if (await this.detect()) return { kind: 'ok' };
    return {
      kind: 'unsupported',
      reason: 'Codex CLI not installed (no ~/.codex/sessions/ directory)',
    };
  }

  async pollOnce(): Promise<UsageEvent[]> {
    const sinceMs = Date.now() - 5 * 60 * 60 * 1000;
    return parseRecentCodexUsage(sinceMs);
  }
}
