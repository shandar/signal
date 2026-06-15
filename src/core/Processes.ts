import { execFileSync } from 'node:child_process';
import { basename } from 'node:path';
import type { ProviderId } from './types';

// Detect running coding-agent CLI instances on this machine. Uses `pgrep -f`
// to find processes whose argv contains a standalone agent token (so the
// macOS Claude.app and its helper soup are skipped — they live under
// `/Applications/Claude.app/Contents/...`). For each match we read the
// working directory via `lsof -d cwd` and group by CWD so subagent
// children fold into their parent session.

export interface ClaudeCliInstance {
  /** Which agent this is (claude / codex / ...) — added for v2 multi-provider. */
  provider?: ProviderId;
  cwd: string;
  project: string; // basename of cwd
  pids: number[];
  startedAt: number | null; // ms epoch of the earliest pid in this CWD
}

// ── shared helpers ────────────────────────────────────────────────────────

function pgrepRegex(regex: string): number[] {
  let out: string;
  try {
    out = execFileSync('pgrep', ['-f', regex], {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch {
    return [];
  }
  return out
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => Number.parseInt(s, 10))
    .filter((n) => Number.isFinite(n));
}

function lsofCwd(pid: number): string | null {
  try {
    const out = execFileSync('lsof', ['-p', String(pid), '-a', '-d', 'cwd', '-Fn'], {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    const line = out.split('\n').find((l) => l.startsWith('n'));
    return line ? line.slice(1) : null;
  } catch {
    return null;
  }
}

function processStartMs(pid: number): number | null {
  try {
    const out = execFileSync('ps', ['-o', 'lstart=', '-p', String(pid)], {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    if (!out) return null;
    const ms = new Date(out).getTime();
    return Number.isFinite(ms) ? ms : null;
  } catch {
    return null;
  }
}

function processCommand(pid: number): string {
  try {
    return execFileSync('ps', ['-o', 'command=', '-p', String(pid)], {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return '';
  }
}

function groupByCwd(
  pids: number[],
  filter: (command: string) => boolean,
  provider: ProviderId,
): ClaudeCliInstance[] {
  if (pids.length === 0) return [];
  const byCwd = new Map<string, { pids: number[]; starts: number[] }>();
  for (const pid of pids) {
    const cmd = processCommand(pid);
    if (!filter(cmd)) continue;
    const cwd = lsofCwd(pid);
    if (!cwd) continue;
    const start = processStartMs(pid);
    const entry = byCwd.get(cwd) ?? { pids: [], starts: [] };
    entry.pids.push(pid);
    if (start !== null) entry.starts.push(start);
    byCwd.set(cwd, entry);
  }
  return [...byCwd.entries()]
    .map(([cwd, v]) => ({
      provider,
      cwd,
      project: basename(cwd),
      pids: v.pids.sort((a, b) => a - b),
      startedAt: v.starts.length > 0 ? Math.min(...v.starts) : null,
    }))
    .sort((a, b) => (b.startedAt ?? 0) - (a.startedAt ?? 0));
}

// ── Claude CLI detection ──────────────────────────────────────────────────

const CLAUDE_REGEX = '(^|/)claude($| )';

function isLikelyClaudeCli(command: string): boolean {
  if (command.includes('/Applications/Claude.app/')) return false;
  if (command.includes('Claude Helper')) return false;
  if (command.includes('/dist/signal')) return false;
  if (command.includes('src/index.ts serve')) return false;
  return /(^claude\b)|(\/claude(\s|$))/.test(command);
}

export function detectClaudeCliInstances(): ClaudeCliInstance[] {
  return groupByCwd(pgrepRegex(CLAUDE_REGEX), isLikelyClaudeCli, 'claude');
}

// ── Codex CLI detection ───────────────────────────────────────────────────

const CODEX_REGEX = '(^|/)codex($| )';

function isLikelyCodexCli(command: string): boolean {
  // Exclude any unrelated 'codex' binaries on the system (rare). The Codex
  // CLI is installed via npm and runs through node or as a direct bin link.
  // Most invocations match `/usr/local/bin/codex` or `~/.nvm/.../bin/codex`
  // or `node .../codex/dist/cli.js`. Require the literal `codex` token.
  if (command.includes('/dist/signal')) return false;
  return /(^codex\b)|(\/codex(\s|$))|(codex\/dist\/cli)/.test(command);
}

export function detectCodexCliInstances(): ClaudeCliInstance[] {
  return groupByCwd(pgrepRegex(CODEX_REGEX), isLikelyCodexCli, 'codex');
}

// ── Aggregate detector ────────────────────────────────────────────────────

/** Detect all known coding-agent CLI processes, tagged by provider. */
export function detectAllCliInstances(): ClaudeCliInstance[] {
  return [...detectClaudeCliInstances(), ...detectCodexCliInstances()];
}
