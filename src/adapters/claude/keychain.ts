import { execFileSync } from 'node:child_process';

export interface ClaudeKeychainCreds {
  accessToken: string;
  refreshToken: string;
  expiresAt: number; // ms epoch
}

const SERVICE = 'Claude Code-credentials';

export function readClaudeKeychain(): ClaudeKeychainCreds | null {
  if (process.platform !== 'darwin') return null;
  let raw: string;
  try {
    raw = execFileSync('security', ['find-generic-password', '-s', SERVICE, '-w'], {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return null;
  }
  try {
    const json = JSON.parse(raw) as {
      claudeAiOauth?: { accessToken: string; refreshToken: string; expiresAt: number };
    };
    const oauth = json.claudeAiOauth;
    if (!oauth) return null;
    return {
      accessToken: oauth.accessToken,
      refreshToken: oauth.refreshToken,
      expiresAt: oauth.expiresAt,
    };
  } catch {
    return null;
  }
}
