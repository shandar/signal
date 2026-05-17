import { readFileSync, readdirSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { UsageEvent } from '../../core/types';

const PROJECTS_DIR = join(homedir(), '.claude', 'projects');

// NOTE: Claude's project-dir encoding replaces every `/` with `-`, which makes hyphens
// in path segments indistinguishable from separators (e.g., `/Users/john-doe/proj`
// encodes to `-Users-john-doe-proj` and decodes to `/Users/john/doe/proj`). This is
// a limitation of the encoding, not this decoder.
export function decodeProjectDirName(name: string): string {
  if (!name.startsWith('-')) return name;
  return `/${name.slice(1).replaceAll('-', '/')}`;
}

export function parseClaudeSession(filePath: string, projectPath: string): UsageEvent[] {
  let raw: string;
  try {
    raw = readFileSync(filePath, 'utf-8');
  } catch {
    return [];
  }
  const events: UsageEvent[] = [];
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue;
    let json: Record<string, unknown>;
    try {
      json = JSON.parse(line);
    } catch {
      continue;
    }
    if (json.type !== 'assistant') continue;
    const message = json.message as Record<string, unknown> | undefined;
    const usage = message?.usage as Record<string, unknown> | undefined;
    if (!usage) continue;
    const tsStr = json.timestamp as string | undefined;
    // Defensive: if a line is missing `timestamp`, fall back to now. Real Claude sessions
    // always include timestamps; this fallback only matters for corrupt logs.
    events.push({
      provider: 'claude',
      ts: tsStr ? new Date(tsStr) : new Date(),
      model: (message?.model as string | undefined) ?? null,
      inputTokens: Number(usage.input_tokens ?? 0),
      outputTokens: Number(usage.output_tokens ?? 0),
      cacheCreationTokens: Number(usage.cache_creation_input_tokens ?? 0),
      cacheReadTokens: Number(usage.cache_read_input_tokens ?? 0),
      sessionId: (json.sessionId as string | undefined) ?? null,
      projectPath,
      raw: json,
    });
  }
  return events;
}

export function findClaudeProjectDirs(projectsDir = PROJECTS_DIR): string[] {
  try {
    return readdirSync(projectsDir)
      .map((name) => join(projectsDir, name))
      .filter((path) => {
        try {
          return statSync(path).isDirectory();
        } catch {
          return false;
        }
      });
  } catch {
    return [];
  }
}

export function findRecentSessionFiles(projectDir: string, sinceMs: number): string[] {
  try {
    return readdirSync(projectDir)
      .filter((f) => f.endsWith('.jsonl'))
      .map((f) => join(projectDir, f))
      .filter((path) => {
        try {
          return statSync(path).mtimeMs >= sinceMs;
        } catch {
          return false;
        }
      });
  } catch {
    return [];
  }
}
